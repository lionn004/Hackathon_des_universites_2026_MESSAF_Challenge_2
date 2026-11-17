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
  await requeteModel.create({
    id: requeteId,
    administration_id: admin.id,
    iue_citoyen: iue,
    demarche_id: demarche.id,
    statut: 'complete',
    donnees: collected.donnees,
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
 * Met la requête à jour d'après la réponse du citoyen au consentement.
 *
 *  - en attente → rien ne change ;
 *  - expiré → statut « expire », rien n'est transmis ;
 *  - refusé → statut « consentement_refuse » + entrée de journal (refus tracé, aucun champ) ;
 *  - accepté → collecte limitée aux champs ACCEPTÉS, journal (décideur = qui a
 *    répondu, ex : le tuteur), puis statut « complete » avec les données.
 *
 * @param {object} requete Requête en attente ou acceptée.
 * @returns {Promise<object>} Requête à jour.
 */
async function syncWithConsent(requete) {
  const consent = await consentementClient.getConsent(requete.consentement_id);
  const answeredAt = consent.date_reponse ? new Date(consent.date_reponse) : new Date();

  if (consent.statut === 'en_attente') return requete;

  if (consent.statut === 'expire') {
    await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', { statut: 'expire' });
    return requeteModel.findById(requete.id);
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
    return requeteModel.findById(requete.id);
  }

  // Accepté. Une seule consultation « gagne » le passage en consentement_accepte.
  // Si une tentative précédente a échoué après ce passage (ex : registre en panne),
  // la requête est restée en consentement_accepte et on retente la collecte.
  const won = await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', {
    statut: 'consentement_accepte', date_reponse: answeredAt,
  });
  if (!won && requete.statut !== 'consentement_accepte') return requeteModel.findById(requete.id);

  const { cascade, collected } = await gatherData(demarche, requete.iue_citoyen, consent.champs_demandes);
  await recordAccess({
    requeteId: requete.id,
    iue: requete.iue_citoyen,
    decideurIue: consent.decideur_iue || requete.iue_citoyen,
    admin,
    demarche,
    registres: collected.registres_consultes,
    champs: collected.champs_transmis,
    typeAcces: 'consentement',
  });
  return requeteModel.update(requete.id, { statut: 'complete', donnees: collected.donnees, cascade });
}

/**
 * GET /requetes/{id} — statut d'une requête (et données si complète).
 * @param {string} administrationId UUID issu du jeton.
 * @param {string} id UUID de la requête.
 * @returns {Promise<object>} RequeteStatut.
 * @throws {AppError} 404 REQUETE_NON_TROUVEE, 502 service indisponible.
 */
async function getStatus(administrationId, id) {
  let requete = await getOwnRequete(administrationId, id);
  if (['en_attente_consentement', 'consentement_accepte'].includes(requete.statut)) {
    requete = await syncWithConsent(requete);
  }
  return {
    requete_id: requete.id,
    statut: requete.statut,
    donnees: requete.statut === 'complete' ? requete.donnees : null,
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
  if (requete.statut === 'en_attente_consentement') requete = await syncWithConsent(requete);
  if (requete.statut !== 'en_attente_consentement') {
    throw new AppError(400, 'RELANCE_IMPOSSIBLE', `La requête n'est plus en attente de consentement (${requete.statut})`);
  }
  return { telephone: await bffClient.getPhone(requete.iue_citoyen) };
}

module.exports = { submit, getStatus, getPhone };
