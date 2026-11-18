/**
 * Service Requêtes — cœur de la passerelle : une administration demande des
 * données sur un citoyen pour une démarche.
 *
 * POST /requetes déroule, dans l'ordre :
 *  1. droits : administration connue, démarche connue, champs dans sa mission ;
 *  2. le citoyen doit exister à l'état civil ;
 *  3a. administration PUBLIQUE : cascade → collecte + minimisation → journal
 *      → données renvoyées tout de suite (200) ;
 *  3b. administration PRIVÉE : demande de consentement créée, rien n'est
 *      transmis (202). L'administration consulte ensuite GET /requetes/{id}.
 *
 * Règle de sûreté : AUCUNE donnée ne sort sans entrée au journal. Si le journal
 * est injoignable, la requête échoue (502) et rien n'est transmis.
 *
 * Remise unique, aucune copie : la passerelle ne conserve jamais les données
 * qu'elle transmet. Elles sont lues dans les registres au moment de la remise,
 * remises une seule fois (réponse 200 du POST pour une administration publique,
 * premier GET /requetes/{id} après l'acceptation pour une privée), puis seule la
 * trace reste, au journal. L'administration garde ce qu'elle a reçu ; pour l'obtenir
 * de nouveau, elle soumet une nouvelle requête (nouveau consentement si elle est privée).
 */
const { randomUUID } = require('node:crypto');
const requeteModel = require('../models/requete.model');
const consentementClient = require('../clients/consentement.client');
const journalClient = require('../clients/journal.client');
const registresClient = require('../clients/registres.client');
const bffClient = require('../clients/bff.client');
const droitsService = require('./droits.service');
const catalogueService = require('./catalogue.service');
const cascadeService = require('./cascade.service');
const collecteService = require('./collecte.service');
const AppError = require('../utils/AppError');
const { IUE_REGEX, UUID_REGEX, invalid, isNonEmptyString } = require('../utils/validation');

/**
 * Notification « après coup » du citoyen pour un accès direct (admin publique).
 * SIMULÉE : écrite dans les logs. Le citoyen la retrouve aussi dans son journal.
 */
function notifyDirectAccess(iue, admin, demarche) {
  console.log(`[Notification simulée] → citoyen ${iue} : ${admin.nom} a consulté vos données pour « ${demarche.nom} ».`);
}

/**
 * Trace un accès au journal (photo figée des noms incluse).
 * @returns {Promise<object>} Entrée de journal créée.
 */
function recordAccess({
  requeteId, iue, decideurIue, admin, demarche, registres, champs, typeAcces,
}) {
  return journalClient.record({
    titulaire_iue: iue,
    decideur_iue: decideurIue,
    administration_id: admin.id,
    administration_nom: admin.nom,
    administration_type: admin.type,
    demarche_id: demarche.id,
    demarche_nom: demarche.nom,
    requete_id: requeteId,
    registres_consultes: registres,
    champs_transmis: champs,
    type_acces: typeAcces,
  });
}

/**
 * Résout la cascade puis collecte les données filtrées.
 * @returns {Promise<{cascade: object[], collected: object}>}
 */
async function gatherData(demarche, iue, allowedFields) {
  const [cascade, collected] = await Promise.all([
    cascadeService.resolve(demarche.pieces.map((p) => p.type_piece_id), iue),
    collecteService.collect(demarche.id, iue, allowedFields),
  ]);
  return { cascade, collected };
}

/**
 * POST /requetes — soumission d'une requête par une administration.
 *
 * @param {string} administrationId UUID issu du jeton.
 * @param {object} body RequeteEntree { iue_citoyen, demarche_id }.
 * @returns {Promise<{httpStatus: number, body: object}>} 200 RequeteResultat ou 202 RequeteEnAttente.
 * @throws {AppError} 400 corps invalide, 403 hors mission, 404 démarche ou citoyen inconnu,
 *                    502 service indisponible.
 */
async function submit(administrationId, body) {
  if (!body || !IUE_REGEX.test(body.iue_citoyen || '')) invalid('iue_citoyen doit contenir 12 chiffres');
  if (!isNonEmptyString(body.demarche_id)) invalid('demarche_id est requis');
  const iue = body.iue_citoyen;

  // 1. Droits
  const admin = await droitsService.getAdministration(administrationId);
  const demarche = await catalogueService.findDemarcheOrFail(body.demarche_id);
  const rules = await consentementClient.getRules(demarche.id);
  await droitsService.checkMission(admin, rules);

  // 2. Le citoyen doit exister : on ne crée pas de consentement pour un IUE fantôme.
  if (!(await registresClient.pieceExists('extrait-naissance', 'etat-civil', iue))) {
    throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
  }

  // L'id est généré ici pour être transmis au journal / au consentement avant l'enregistrement.
  const requeteId = randomUUID();

  // 3b. Administration privée : consentement explicite obligatoire.
  if (admin.type === 'privee') {
    const consent = await consentementClient.createRequest({
      iue_citoyen: iue,
      administration_id: admin.id,
      administration_nom: admin.nom,
      administration_type: 'privee',
      demarche_id: demarche.id,
      demarche_nom: demarche.nom,
      champs_demandes: rules,
      requete_id: requeteId,
    });
    await requeteModel.create({
      id: requeteId,
      administration_id: admin.id,
      iue_citoyen: iue,
      demarche_id: demarche.id,
      statut: 'en_attente_consentement',
      consentement_id: consent.id,
      date_expiration: new Date(consent.date_expiration),
    });
    return {
      httpStatus: 202,
      body: {
        requete_id: requeteId,
        statut: 'en_attente_consentement',
        consentement_id: consent.id,
        message: 'En attente du consentement du citoyen. Notification envoyée.',
      },
    };
  }

  // 3a. Administration publique : accès direct.
  const { cascade, collected } = await gatherData(demarche, iue, rules);
  const journalEntry = await recordAccess({
    requeteId,
    iue,
    // Accès direct : personne ne « décide » ; le titulaire est inscrit comme décideur.
    // Le tuteur d'un mineur voit tout de même l'accès (liste `enfants` de son jeton).
    decideurIue: iue,
    admin,
    demarche,
    registres: collected.registres_consultes,
    champs: collected.champs_transmis,
    typeAcces: 'direct',
  });
  const now = new Date();
  // Remise unique : les données partent dans cette réponse et ne sont pas enregistrées.
  await requeteModel.create({
    id: requeteId,
    administration_id: admin.id,
    iue_citoyen: iue,
    demarche_id: demarche.id,
    statut: 'complete',
    cascade,
    date_creation: now,
    date_reponse: now,
  });
  notifyDirectAccess(iue, admin, demarche);

  return {
    httpStatus: 200,
    body: {
      requete_id: requeteId,
      statut: 'complete',
      donnees: collected.donnees,
      cascade,
      journal_id: journalEntry.id,
    },
  };
}

/**
 * Charge une requête appartenant à l'administration connectée.
 * Une requête d'une autre administration renvoie 404 : on ne révèle pas son existence.
 * @throws {AppError} 404 REQUETE_NON_TROUVEE
 */
async function getOwnRequete(administrationId, id) {
  const requete = UUID_REGEX.test(id) ? await requeteModel.findById(id) : null;
  if (!requete || requete.administration_id !== administrationId) {
    throw new AppError(404, 'REQUETE_NON_TROUVEE', 'Aucune requête trouvée avec cet identifiant');
  }
  return requete;
}

/**
 * Remise unique des données d'une requête dont le consentement est accepté.
 *
 * Ordre imposé :
 *  1. lecture des registres, limitée aux champs ACCEPTÉS : rien ne sort encore ;
 *  2. passage atomique de « consentement_accepte » à « complete » : si deux
 *     consultations arrivent en même temps, une seule gagne et remet les données ;
 *  3. entrée au journal (décideur = qui a répondu, ex : le tuteur). Si le journal
 *     échoue, la requête revient à « consentement_accepte » pour un nouvel essai et
 *     rien n'est remis : aucune donnée ne sort sans trace.
 * Les données ne sont jamais enregistrées dans la passerelle.
 *
 * @param {string} requeteId
 * @param {object} admin Administration demandeuse.
 * @param {object} demarche Démarche de la requête.
 * @param {object} consent Consentement accepté (champs acceptés, décideur).
 * @returns {Promise<{requete: object, donnees: object|null}>} donnees non nul seulement
 *          pour la consultation qui effectue la remise.
 * @throws {AppError} 502 si un registre ou le journal est injoignable.
 */
async function deliverOnce(requeteId, admin, demarche, consent) {
  const current = await requeteModel.findById(requeteId);
  if (current.statut !== 'consentement_accepte') return { requete: current, donnees: null };

  const { cascade, collected } = await gatherData(demarche, current.iue_citoyen, consent.champs_demandes);
  const won = await requeteModel.updateIfStatus(requeteId, 'consentement_accepte', { statut: 'complete', cascade });
  if (!won) return { requete: await requeteModel.findById(requeteId), donnees: null };

  try {
    await recordAccess({
      requeteId,
      iue: current.iue_citoyen,
      decideurIue: consent.decideur_iue || current.iue_citoyen,
      admin,
      demarche,
      registres: collected.registres_consultes,
      champs: collected.champs_transmis,
      typeAcces: 'consentement',
    });
  } catch (err) {
    await requeteModel.updateIfStatus(requeteId, 'complete', { statut: 'consentement_accepte' });
    throw err;
  }
  return { requete: await requeteModel.findById(requeteId), donnees: collected.donnees };
}

/**
 * Met la requête à jour d'après la réponse du citoyen au consentement.
 *
 *  - en attente : rien ne change ;
 *  - expiré : statut « expire », rien n'est transmis ;
 *  - refusé : statut « consentement_refuse » et entrée de journal (refus tracé, aucun champ) ;
 *  - accepté : statut « consentement_accepte », puis, si `deliver` est vrai,
 *    remise unique des données (voir deliverOnce).
 *
 * @param {object} requete Requête en attente ou acceptée.
 * @param {{deliver: boolean}} options deliver : vrai pour remettre les données dans cet
 *        appel (GET /requetes/{id}) ; faux pour mettre seulement le statut à jour (relance
 *        par téléphone), sinon la remise unique serait consommée sans que personne la reçoive.
 * @returns {Promise<{requete: object, donnees: object|null}>} Requête à jour, et les données
 *          seulement si cet appel les remet.
 */
async function syncWithConsent(requete, { deliver }) {
  const consent = await consentementClient.getConsent(requete.consentement_id);
  const answeredAt = consent.date_reponse ? new Date(consent.date_reponse) : new Date();
  /** Relit la requête, sans remise de données. */
  const reload = async () => ({ requete: await requeteModel.findById(requete.id), donnees: null });

  if (consent.statut === 'en_attente') return { requete, donnees: null };

  if (consent.statut === 'expire') {
    await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', { statut: 'expire' });
    return reload();
  }

  const admin = await droitsService.getAdministration(requete.administration_id);
  const demarche = await catalogueService.findDemarcheOrFail(requete.demarche_id);

  if (consent.statut === 'refuse') {
    const won = await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', {
      statut: 'consentement_refuse', date_reponse: answeredAt,
    });
    if (won) {
      await recordAccess({
        requeteId: requete.id,
        iue: requete.iue_citoyen,
        decideurIue: consent.decideur_iue || requete.iue_citoyen,
        admin,
        demarche,
        registres: consent.champs_demandes.map((c) => c.registre),
        champs: [],
        typeAcces: 'consentement',
      });
    }
    return reload();
  }

  // Accepté. Si une tentative précédente a échoué après ce passage (ex : registre en
  // panne), la requête est restée en consentement_accepte et deliverOnce retente.
  await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', {
    statut: 'consentement_accepte', date_reponse: answeredAt,
  });
  if (!deliver) return reload();
  return deliverOnce(requete.id, admin, demarche, consent);
}

/**
 * GET /requetes/{id} : statut d'une requête.
 *
 * `donnees` n'est rempli que par la consultation qui remet les données (la première
 * après l'acceptation du consentement). Ensuite, et pour une requête publique dont les
 * données sont parties dans la réponse du POST, il vaut null : la passerelle n'en garde
 * pas de copie.
 *
 * @param {string} administrationId UUID issu du jeton.
 * @param {string} id UUID de la requête.
 * @returns {Promise<object>} RequeteStatut.
 * @throws {AppError} 404 REQUETE_NON_TROUVEE, 502 service indisponible.
 */
async function getStatus(administrationId, id) {
  let requete = await getOwnRequete(administrationId, id);
  let donnees = null;
  if (['en_attente_consentement', 'consentement_accepte'].includes(requete.statut)) {
    ({ requete, donnees } = await syncWithConsent(requete, { deliver: true }));
  }
  return {
    requete_id: requete.id,
    statut: requete.statut,
    donnees,
    date_creation: requete.date_creation.toISOString(),
    date_expiration: requete.date_expiration ? requete.date_expiration.toISOString() : null,
    date_reponse: requete.date_reponse ? requete.date_reponse.toISOString() : null,
  };
}

/**
 * GET /requetes/{id}/telephone — numéro du citoyen pour le relancer.
 * Réservé aux requêtes encore en attente de consentement : une fois la réponse
 * donnée, l'administration n'a plus de raison de contacter le citoyen.
 *
 * @param {string} administrationId UUID issu du jeton.
 * @param {string} id UUID de la requête.
 * @returns {Promise<{telephone: string}>}
 * @throws {AppError} 404 requête inconnue, 400 RELANCE_IMPOSSIBLE, 503 espace usager indisponible.
 */
async function getPhone(administrationId, id) {
  let requete = await getOwnRequete(administrationId, id);
  if (requete.statut === 'en_attente_consentement') {
    ({ requete } = await syncWithConsent(requete, { deliver: false }));
  }
  if (requete.statut !== 'en_attente_consentement') {
    throw new AppError(400, 'RELANCE_IMPOSSIBLE', `La requête n'est plus en attente de consentement (${requete.statut})`);
  }
  return { telephone: await bffClient.getPhone(requete.iue_citoyen) };
}

/**
 * Efface les données que la passerelle conservait avant la remise unique.
 * Appelée au démarrage : une base créée par une version précédente ne garde ainsi
 * aucune copie des données transmises.
 * @returns {Promise<number>} Nombre de requêtes nettoyées.
 */
function forgetStoredData() {
  return requeteModel.clearStoredData();
}

module.exports = {
  submit, getStatus, getPhone, forgetStoredData,
};
