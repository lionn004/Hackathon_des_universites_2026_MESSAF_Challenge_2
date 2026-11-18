/**
 * Service Demandes — demandes de pièces par le citoyen (pour lui ou pour un enfant).
 *
 * La passerelle résout la cascade de prérequis (voir CLAUDE.md, « Chaînes de
 * dépendances en cascade ») ; le BFF enregistre le résultat :
 *  - toutes les pièces trouvées → « complete » ;
 *  - au moins une pièce manquante → « fallback_physique » : le citoyen doit
 *    attendre que la pièce soit numérisée dans son registre (donnée numérique manquante) ;
 *  - un registre nécessaire est hors service → « en_cours » : la demande attend
 *    son retour (docs/conception-interoperabilite.md, § 10).
 *
 * Reprise automatique (§ 9 et § 10) : une tâche relance régulièrement les demandes
 * « en_cours » et « fallback_physique ». Quand le registre revient, ou quand l'administration
 * qui détient la pièce manquante l'a numérisée dans son registre, la demande se complète seule
 * et le citoyen est notifié (SMS simulé).
 *
 * Le contenu d'une pièce n'est jamais stocké : la passerelle le relit dans le
 * registre à chaque consultation (GET /demandes/{id}/contenu).
 */
const passerelleClient = require('../clients/passerelle.client');
const identiteService = require('./identite.service');
const citoyenModel = require('../models/citoyen.model');
const demandeModel = require('../models/demande.model');
const smsService = require('./sms.service');
const AppError = require('../utils/AppError');
const {
  IUE_REGEX, UUID_REGEX, invalid, isNonEmptyString, parsePositiveInt,
} = require('../utils/validation');

const STATUTS = ['en_cours', 'complete', 'echouee', 'fallback_physique'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** Statut d'un nœud de cascade de la passerelle, au format du contrat BFF. */
const STATUT_NOEUD = { resolu: 'resolu', en_attente_registre: 'en_cours' };

/**
 * Convertit un nœud de cascade de la passerelle au format du contrat BFF :
 * « en_attente_registre » devient « en_cours », « manquant_fallback_physique » devient « manquant ».
 * @param {object} node
 * @returns {object}
 */
function toContractNode(node) {
  return {
    type_piece: node.type_piece,
    proprietaire: node.proprietaire,
    statut: STATUT_NOEUD[node.statut] || 'manquant',
    sous_prerequis: (node.sous_prerequis || []).map(toContractNode),
  };
}

/**
 * Statut d'une demande d'après le résultat de la cascade (passerelle).
 * @param {string} statutPasserelle complete | fallback_physique | en_attente_registre
 * @returns {string} Statut du contrat BFF.
 */
function statutDemande(statutPasserelle) {
  return statutPasserelle === 'en_attente_registre' ? 'en_cours' : statutPasserelle;
}

/**
 * Convertit une demande au format Demande du contrat.
 * @param {object} demande Enregistrement brut.
 * @param {object|null} child Identité de l'enfant concerné, ou null.
 * @returns {object}
 */
function toContract(demande, child) {
  return {
    id: demande.id,
    type_piece: { id: demande.type_piece_id, nom: demande.type_piece_nom },
    statut: demande.statut,
    pour_enfant: child ? { iue: child.iue, nom: child.nom, prenom: child.prenom } : null,
    cascade: demande.cascade,
    date_creation: demande.date_creation.toISOString(),
    date_completion: demande.date_completion ? demande.date_completion.toISOString() : null,
  };
}

/**
 * Identités des enfants concernés par une liste de demandes (une lecture par enfant).
 * @param {object} account Compte du demandeur.
 * @param {object[]} demandes
 * @returns {Promise<Map<string, object>>} IUE → identité.
 */
async function childIdentities(account, demandes) {
  const iues = [...new Set(demandes.map((d) => d.titulaire_iue).filter((iue) => iue !== account.iue))];
  const identities = await Promise.all(iues.map((iue) => identiteService.getIdentityOrNull(iue)));
  return new Map(iues.map((iue, i) => [iue, identities[i] || { iue, nom: null, prenom: null }]));
}

/**
 * POST /demandes — demande une pièce et résout sa cascade.
 * @param {string} iue IUE du citoyen connecté.
 * @param {object} body { type_piece_id, pour_enfant_iue? }.
 * @returns {Promise<object>} Demande créée.
 * @throws {AppError} 400 données invalides, 403 ENFANT_NON_RATTACHE, 404 TYPE_PIECE_INCONNU.
 */
async function create(iue, body) {
  if (!body || !isNonEmptyString(body.type_piece_id)) invalid('type_piece_id est requis');
  const account = await identiteService.getAccount(iue);

  let holderIue = account.iue;
  if (body.pour_enfant_iue != null) {
    // On ne peut demander une pièce que pour un enfant dont on est tuteur.
    const child = IUE_REGEX.test(body.pour_enfant_iue) ? await citoyenModel.findByIue(body.pour_enfant_iue) : null;
    if (!child || child.tuteur_id !== account.id) {
      throw new AppError(403, 'ENFANT_NON_RATTACHE', 'Cet enfant n\'est pas rattaché à votre compte');
    }
    holderIue = child.iue;
  }

  const result = await passerelleClient.resolveCascade(body.type_piece_id, holderIue);
  const now = new Date();
  const statut = statutDemande(result.statut);
  const demande = await demandeModel.create({
    citoyen_id: account.id,
    titulaire_iue: holderIue,
    type_piece_id: result.type_piece.id,
    type_piece_nom: result.type_piece.nom,
    statut,
    cascade: result.cascade.map(toContractNode),
    date_creation: now,
    date_completion: statut === 'complete' ? now : null,
  });

  const child = holderIue !== account.iue ? await identiteService.getIdentityOrNull(holderIue) : null;
  return toContract(demande, child);
}

/**
 * GET /demandes — demandes faites par le citoyen connecté (y compris pour ses enfants).
 * @param {string} iue
 * @param {object} query { statut, page, limite }.
 * @returns {Promise<{demandes: object[], pagination: object}>}
 */
async function list(iue, query) {
  if (query.statut !== undefined && !STATUTS.includes(query.statut)) invalid(`statut doit valoir : ${STATUTS.join(', ')}`);
  const page = parsePositiveInt(query.page, 1, 'page');
  const limit = Math.min(parsePositiveInt(query.limite, DEFAULT_PAGE_SIZE, 'limite'), MAX_PAGE_SIZE);
  const account = await identiteService.getAccount(iue);

  const where = { citoyen_id: account.id, ...(query.statut && { statut: query.statut }) };
  const { items, total } = await demandeModel.findPage(where, (page - 1) * limit, limit);
  const children = await childIdentities(account, items);
  return {
    demandes: items.map((d) => toContract(d, children.get(d.titulaire_iue) || null)),
    pagination: { page, limite: limit, total, pages: Math.ceil(total / limit) },
  };
}

/**
 * GET /demandes/{id} — détail d'une demande du citoyen connecté.
 * @param {string} iue
 * @param {string} id
 * @returns {Promise<object>} Demande.
 * @throws {AppError} 404 DEMANDE_NON_TROUVEE (y compris pour la demande d'un autre citoyen).
 */
async function get(iue, id) {
  const account = await identiteService.getAccount(iue);
  const demande = UUID_REGEX.test(id) ? await demandeModel.findById(id) : null;
  if (!demande || demande.citoyen_id !== account.id) {
    throw new AppError(404, 'DEMANDE_NON_TROUVEE', 'Aucune demande trouvée avec cet identifiant');
  }
  const children = await childIdentities(account, [demande]);
  return toContract(demande, children.get(demande.titulaire_iue) || null);
}

/**
 * Le citoyen connecté peut-il lire les pièces de ce titulaire ?
 * Oui s'il s'agit de lui-même, ou d'un enfant dont il est ACTUELLEMENT le
 * tuteur (tutelle relue en base à chaque appel).
 *
 * @param {object} account Compte du citoyen connecté.
 * @param {string} holderIue Titulaire de la pièce.
 * @returns {Promise<boolean>}
 */
async function canReadPiecesOf(account, holderIue) {
  if (holderIue === account.iue) return true;
  const holder = await citoyenModel.findByIue(holderIue);
  return holder !== null && holder.tuteur_id === account.id;
}

/**
 * Erreur commune : la pièce ne peut pas être consultée en ligne.
 * @returns {AppError}
 */
function pieceUnavailable() {
  return new AppError(409, 'PIECE_INDISPONIBLE', 'Cette pièce n\'est pas encore disponible : sa demande n\'est pas terminée, ou elle n\'est pas encore numérisée dans son registre');
}

/**
 * GET /demandes/{id}/contenu — contenu de la pièce d'une demande, lu à
 * l'instant dans son registre (CLAUDE.md, « Consultation et téléchargement de ses pièces »).
 *
 * L'accès dépend du TITULAIRE de la pièce, pas de l'auteur de la demande :
 * après un transfert de compte, l'ancien tuteur perd l'accès, même aux demandes
 * qu'il a faites lui-même. Le registre étant relu à chaque fois, il verrait
 * sinon les pièces ACTUELLES de l'enfant (casier, situation fiscale).
 *
 * @param {string} iue IUE du citoyen connecté.
 * @param {string} id Identifiant de la demande.
 * @returns {Promise<object>} ContenuPiece du contrat.
 * @throws {AppError} 404 DEMANDE_NON_TROUVEE (inconnue, ou pièce d'une personne dont il
 *                    n'est ni le titulaire ni le tuteur actuel : rien ne révèle qu'elle existe) ;
 *                    409 PIECE_INDISPONIBLE (demande non « complete », ou pièce absente du
 *                    registre) ; 502 si la passerelle ou un registre ne répond pas.
 */
async function getContent(iue, id) {
  const account = await identiteService.getAccount(iue);
  const demande = UUID_REGEX.test(id) ? await demandeModel.findById(id) : null;
  if (!demande || !(await canReadPiecesOf(account, demande.titulaire_iue))) {
    throw new AppError(404, 'DEMANDE_NON_TROUVEE', 'Aucune demande trouvée avec cet identifiant');
  }
  // Une pièce en fallback physique n'a pas été délivrée en ligne.
  if (demande.statut !== 'complete') throw pieceUnavailable();

  const piece = await passerelleClient.getPiece(demande.titulaire_iue, demande.type_piece_id);
  // Demande complète mais pièce introuvable aujourd'hui (ex : registre remplacé
  // par celui d'une autre équipe) : même réponse, un seul cas pour la page.
  if (!piece) throw pieceUnavailable();

  return {
    demande_id: demande.id,
    type_piece: {
      id: piece.type_piece.id,
      nom: piece.type_piece.nom,
      registre_source: piece.type_piece.registre_source,
      est_evolutive: piece.type_piece.est_evolutive,
    },
    titulaire: { iue: piece.titulaire.iue, nom: piece.titulaire.nom, prenom: piece.titulaire.prenom },
    donnees: piece.donnees,
    date_consultation: new Date().toISOString(),
  };
}

/**
 * Nombre de demandes non finalisées (comptées « en cours » au tableau de bord) :
 * en cours de résolution, ou en attente de la numérisation d'une pièce manquante.
 * @param {object} account
 * @returns {Promise<number>}
 */
function countUnfinished(account) {
  return demandeModel.count({ citoyen_id: account.id, statut: { in: ['en_cours', 'fallback_physique'] } });
}

/** Nombre maximal de demandes relancées par passage de la reprise automatique. */
const REPRISE_PAR_PASSAGE = 50;

/**
 * Reprise automatique : relance la cascade des demandes en attente d'un registre
 * (« en_cours ») ou en attente d'une donnée à numériser (« fallback_physique »).
 * Une demande qui change est mise à jour ; si elle devient complète, le demandeur est
 * notifié par SMS (simulé). Un registre encore hors service laisse la demande en l'état.
 *
 * @returns {Promise<{relancees: number, terminees: number}>} Bilan du passage, pour les logs.
 */
async function resumePending() {
  const demandes = await demandeModel.findToResume(REPRISE_PAR_PASSAGE);
  let terminees = 0;
  for (const d of demandes) {
    let result;
    try {
      result = await passerelleClient.resolveCascade(d.type_piece_id, d.titulaire_iue);
    } catch (err) {
      // Passerelle injoignable, titulaire disparu du registre... : on réessaiera au prochain passage.
      continue;
    }
    const statut = statutDemande(result.statut);
    const cascade = result.cascade.map(toContractNode);
    if (statut === d.statut && JSON.stringify(cascade) === JSON.stringify(d.cascade)) continue;
    // En attente d'un registre, on garde le dernier arbre connu s'il est plus parlant.
    await demandeModel.update(d.id, {
      statut,
      cascade: statut === 'en_cours' && cascade.length === 0 ? d.cascade : cascade,
      date_completion: statut === 'complete' ? new Date() : null,
    });
    if (statut === 'complete') {
      terminees += 1;
      const demandeur = await citoyenModel.findById(d.citoyen_id);
      if (demandeur) smsService.send(demandeur.telephone, `Votre demande « ${d.type_piece_nom} » est complète : toutes les pièces ont été obtenues auprès des registres.`);
    }
  }
  return { relancees: demandes.length, terminees };
}

module.exports = {
  create, list, get, getContent, countUnfinished, resumePending,
  // Même règle d'accès pour la vue d'ensemble des registres (profil.service.js).
  canReadPiecesOf,
};
