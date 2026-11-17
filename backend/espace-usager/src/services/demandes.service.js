/**
 * Service Demandes — demandes de pièces par le citoyen (pour lui ou pour un enfant).
 *
 * La passerelle résout la cascade de prérequis (voir CLAUDE.md, « Chaînes de
 * dépendances en cascade ») ; le BFF enregistre le résultat :
 *  - toutes les pièces trouvées → « complete » ;
 *  - au moins une pièce manquante → « fallback_physique » : le citoyen doit
 *    présenter le document au guichet.
 * La résolution est immédiate : le statut « en_cours » n'est pas utilisé
 * aujourd'hui, il est prévu pour une résolution asynchrone future.
 */
const passerelleClient = require('../clients/passerelle.client');
const identiteService = require('./identite.service');
const citoyenModel = require('../models/citoyen.model');
const demandeModel = require('../models/demande.model');
const AppError = require('../utils/AppError');
const {
  IUE_REGEX, UUID_REGEX, invalid, isNonEmptyString, parsePositiveInt,
} = require('../utils/validation');

const STATUTS = ['en_cours', 'complete', 'echouee', 'fallback_physique'];
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/**
 * Convertit un nœud de cascade de la passerelle au format du contrat BFF.
 * Le statut « manquant_fallback_physique » devient « manquant ».
 * @param {object} node
 * @returns {object}
 */
function toContractNode(node) {
  return {
    type_piece: node.type_piece,
    proprietaire: node.proprietaire,
    statut: node.statut === 'resolu' ? 'resolu' : 'manquant',
    sous_prerequis: (node.sous_prerequis || []).map(toContractNode),
  };
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
  const identities = await Promise.all(iues.map((iue) => identiteService.getIdentity(iue)));
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
  const demande = await demandeModel.create({
    citoyen_id: account.id,
    titulaire_iue: holderIue,
    type_piece_id: result.type_piece.id,
    type_piece_nom: result.type_piece.nom,
    statut: result.statut,
    cascade: result.cascade.map(toContractNode),
    date_creation: now,
    date_completion: result.statut === 'complete' ? now : null,
  });

  const child = holderIue !== account.iue ? await identiteService.getIdentity(holderIue) : null;
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
 * Nombre de demandes non finalisées (comptées « en cours » au tableau de bord) :
 * en cours de résolution, ou en attente du passage au guichet.
 * @param {object} account
 * @returns {Promise<number>}
 */
function countUnfinished(account) {
  return demandeModel.count({ citoyen_id: account.id, statut: { in: ['en_cours', 'fallback_physique'] } });
}

module.exports = {
  create, list, get, countUnfinished,
};
