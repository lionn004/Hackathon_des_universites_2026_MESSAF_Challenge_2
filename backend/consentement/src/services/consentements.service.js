/**
 * Service Consentements — logique métier des demandes de consentement.
 *
 * Règles appliquées (voir CLAUDE.md, « Flux de consentement pour admin privée ») :
 *  - une demande est créée par la passerelle pour une administration PRIVÉE ;
 *  - elle expire 30 jours après sa création si le citoyen ne répond pas ;
 *  - seul le citoyen concerné, ou son tuteur s'il est mineur, peut la voir et y répondre ;
 *  - une réponse est définitive : une demande traitée ou expirée ne peut plus changer.
 *
 * Ce fichier ne connaît ni req ni res : il est appelé par le controller
 * et utilise le model pour accéder aux données.
 */
const consentementModel = require('../models/consentement.model');
const notificationService = require('./notification.service');
const AppError = require('../utils/AppError');
const {
  IUE_REGEX, UUID_REGEX, REGISTRES, invalid, isStringArray, isNonEmptyString, parsePositiveInt,
} = require('../utils/validation');

/** Délai de réponse avant expiration automatique. */
const EXPIRATION_DAYS = 30;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const STATUTS = ['en_attente', 'accepte', 'refuse', 'expire'];
const DECISIONS = ['accepte', 'refuse'];
const DEFAULT_PAGE_SIZE = 20;
/** Plafond de la taille de page : évite qu'un client demande toutes les demandes d'un coup. */
const MAX_PAGE_SIZE = 100;

/**
 * Convertit une demande de la base au format Consentement du contrat.
 * Le type d'administration vaut toujours « privee » : seules les administrations
 * privées passent par le consentement explicite.
 *
 * @param {object} c Enregistrement brut.
 * @returns {object} Consentement.
 */
function toContract(c) {
  return {
    id: c.id,
    iue_citoyen: c.iue_citoyen,
    administration: { id: c.administration_id, nom: c.administration_nom, type: 'privee' },
    demarche: { id: c.demarche_id, nom: c.demarche_nom || c.demarche_id },
    champs_demandes: c.champs_demandes,
    statut: c.statut,
    date_creation: c.date_creation.toISOString(),
    date_expiration: c.date_expiration.toISOString(),
    date_reponse: c.date_reponse ? c.date_reponse.toISOString() : null,
    decideur_iue: c.decideur_iue,
    requete_id: c.requete_id,
  };
}

/**
 * IUE dont le citoyen connecté peut gérer les demandes : lui-même et ses
 * enfants mineurs (liste `enfants` du jeton, fournie par le BFF).
 * @param {{iue: string, enfants: string[]}} citizen
 * @returns {string[]}
 */
function manageableIues(citizen) {
  return [citizen.iue, ...citizen.enfants];
}

/**
 * Charge une demande que le citoyen a le droit de voir.
 * Une demande qui existe mais concerne quelqu'un d'autre renvoie aussi 404 :
 * on ne révèle pas son existence.
 *
 * @param {string} id UUID de la demande.
 * @param {{iue: string, enfants: string[]}} citizen Citoyen connecté.
 * @returns {Promise<object>} Enregistrement brut.
 * @throws {AppError} 404 CONSENTEMENT_NON_TROUVE
 */
async function getVisibleConsent(id, citizen) {
  const consent = UUID_REGEX.test(id) ? await consentementModel.findById(id) : null;
  if (!consent || !manageableIues(citizen).includes(consent.iue_citoyen)) {
    throw new AppError(404, 'CONSENTEMENT_NON_TROUVE', 'Aucune demande de consentement trouvée avec cet identifiant');
  }
  return consent;
}

/**
 * Valide le corps envoyé par la passerelle à POST /consentements/creer.
 * @param {object} body
 * @throws {AppError} 400 DONNEES_INVALIDES
 */
function validateCreation(body) {
  if (!body || typeof body !== 'object') invalid('Corps de requête manquant');
  if (!IUE_REGEX.test(body.iue_citoyen || '')) invalid('iue_citoyen doit contenir 12 chiffres');
  if (!UUID_REGEX.test(body.administration_id || '')) invalid('administration_id doit être un UUID');
  if (!isNonEmptyString(body.demarche_id)) invalid('demarche_id est requis');
  if (body.requete_id != null && !UUID_REGEX.test(body.requete_id)) invalid('requete_id doit être un UUID');

  const requested = body.champs_demandes;
  const validItem = (item) => item && REGISTRES.includes(item.registre)
    && isStringArray(item.champs) && item.champs.length > 0;
  if (!Array.isArray(requested) || requested.length === 0 || !requested.every(validItem)) {
    invalid(`champs_demandes doit être une liste non vide de { registre (${REGISTRES.join(', ')}), champs: [...] }`);
  }

  // Le consentement explicite ne concerne que les administrations privées.
  if (body.administration_type != null && body.administration_type !== 'privee') {
    invalid('Seules les administrations privées passent par le consentement (administration_type = privee)');
  }
  for (const field of ['administration_nom', 'demarche_nom']) {
    if (body[field] != null && typeof body[field] !== 'string') invalid(`${field} doit être une chaîne`);
  }
}

/**
 * POST /consentements/creer — crée une demande et prévient le citoyen.
 * @param {object} body Corps envoyé par la passerelle.
 * @returns {Promise<object>} Consentement créé (statut en_attente).
 * @throws {AppError} 400 si le corps est invalide.
 */
async function createRequest(body) {
  validateCreation(body);
  const now = new Date();
  const consent = await consentementModel.create({
    iue_citoyen: body.iue_citoyen,
    administration_id: body.administration_id,
    administration_nom: body.administration_nom ?? null,
    demarche_id: body.demarche_id,
    demarche_nom: body.demarche_nom ?? null,
    requete_id: body.requete_id ?? null,
    // On ne garde que registre et champs : tout autre attribut envoyé est ignoré.
    champs_demandes: body.champs_demandes.map(({ registre, champs }) => ({ registre, champs })),
    date_creation: now,
    date_expiration: new Date(now.getTime() + EXPIRATION_DAYS * ONE_DAY_MS),
  });
  notificationService.notifyNewRequest(consent);
  return toContract(consent);
}

/**
 * GET /consentements — demandes du citoyen connecté (et de ses enfants), paginées.
 *
 * Les demandes arrivées à échéance sont d'abord passées en « expire » : ainsi
 * l'affichage est juste même si la tâche périodique n'est pas encore passée.
 *
 * @param {{iue: string, enfants: string[]}} citizen Citoyen connecté.
 * @param {object} query Paramètres bruts : statut, page, limite.
 * @returns {Promise<{consentements: object[], pagination: object}>}
 * @throws {AppError} 400 si un paramètre est invalide.
 */
async function listForCitizen(citizen, query) {
  if (query.statut !== undefined && !STATUTS.includes(query.statut)) {
    invalid(`statut doit valoir : ${STATUTS.join(', ')}`);
  }
  const page = parsePositiveInt(query.page, 1, 'page');
  const limit = Math.min(parsePositiveInt(query.limite, DEFAULT_PAGE_SIZE, 'limite'), MAX_PAGE_SIZE);

  await consentementModel.expireOverdue(new Date());

  const where = { iue_citoyen: { in: manageableIues(citizen) } };
  if (query.statut) where.statut = query.statut;

  const { items, total } = await consentementModel.findPage(where, (page - 1) * limit, limit);
  return {
    consentements: items.map(toContract),
    pagination: { page, limite: limit, total, pages: Math.ceil(total / limit) },
  };
}

/**
 * GET /consentements/en-attente/count — compteur du tableau de bord.
 * Une demande dont la date limite est dépassée n'est plus comptée, même si
 * elle n'a pas encore été marquée « expire ».
 *
 * @param {{iue: string, enfants: string[]}} citizen
 * @returns {Promise<{count: number}>}
 */
async function countPending(citizen) {
  const count = await consentementModel.count({
    iue_citoyen: { in: manageableIues(citizen) },
    statut: 'en_attente',
    date_expiration: { gt: new Date() },
  });
  return { count };
}

/**
 * GET /consentements/{id} — détail d'une demande.
 * @param {string} id UUID de la demande.
 * @param {{iue: string, enfants: string[]}} citizen
 * @returns {Promise<object>} Consentement.
 * @throws {AppError} 404 si la demande n'existe pas ou n'est pas visible.
 */
async function getForCitizen(id, citizen) {
  await consentementModel.expireOverdue(new Date());
  return toContract(await getVisibleConsent(id, citizen));
}

/**
 * PUT /consentements/{id} — le citoyen (ou son tuteur) accepte ou refuse.
 *
 * La personne connectée est enregistrée comme « décideur » : c'est le tuteur
 * quand la demande concerne un enfant. La passerelle reprendra cette valeur
 * pour le journal (double traçabilité titulaire / décideur).
 *
 * @param {string} id UUID de la demande.
 * @param {{iue: string, enfants: string[]}} citizen Citoyen connecté.
 * @param {object} body { decision: "accepte" | "refuse" }.
 * @returns {Promise<object>} Consentement mis à jour.
 * @throws {AppError} 400 DONNEES_INVALIDES si la décision est invalide.
 * @throws {AppError} 404 si la demande n'existe pas ou n'est pas visible.
 * @throws {AppError} 400 CONSENTEMENT_DEJA_TRAITE / CONSENTEMENT_EXPIRE.
 */
async function answer(id, citizen, body) {
  const decision = body && body.decision;
  if (!DECISIONS.includes(decision)) invalid(`decision doit valoir : ${DECISIONS.join(' ou ')}`);

  await getVisibleConsent(id, citizen);
  const now = new Date();
  const updated = await consentementModel.answerIfPending(
    id,
    { statut: decision, date_reponse: now, decideur_iue: citizen.iue },
    now,
  );

  if (updated === 0) {
    // La mise à jour conditionnelle a échoué : on relit pour expliquer pourquoi.
    const current = await consentementModel.findById(id);
    if (current.statut === 'en_attente') {
      // En attente mais date limite dépassée : on la marque expirée au passage.
      await consentementModel.expireOverdue(now);
      throw new AppError(400, 'CONSENTEMENT_EXPIRE', 'Cette demande a expiré et ne peut plus recevoir de réponse');
    }
    if (current.statut === 'expire') {
      throw new AppError(400, 'CONSENTEMENT_EXPIRE', 'Cette demande a expiré et ne peut plus recevoir de réponse');
    }
    throw new AppError(400, 'CONSENTEMENT_DEJA_TRAITE', `Cette demande a déjà reçu une réponse (${current.statut})`);
  }

  return toContract(await consentementModel.findById(id));
}

module.exports = {
  createRequest, listForCitizen, countPending, getForCitizen, answer,
};
