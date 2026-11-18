/**
 * Service Requêtes : cœur de la passerelle. Une administration demande des données
 * sur un citoyen pour une démarche.
 *
 * POST /requetes déroule, dans l'ordre :
 *  1. droits : administration connue, démarche connue, champs dans sa mission ;
 *  2. le citoyen doit exister à l'état civil ;
 *  3a. administration PUBLIQUE : cascade, collecte et minimisation, journal, puis
 *      données renvoyées tout de suite (200) ;
 *  3b. administration PRIVÉE : demande de consentement créée, rien n'est transmis (202).
 *      L'administration consulte ensuite GET /requetes/{id}.
 *
 * Règle de sûreté : AUCUNE donnée ne sort sans entrée au journal. Si le journal est
 * injoignable, la requête échoue (502) et rien n'est transmis.
 *
 * Remise unique, aucune copie : la passerelle ne conserve jamais les données qu'elle
 * transmet. Elles sont lues dans les registres au moment de la remise, remises une seule
 * fois, puis seule la trace reste, au journal.
 *
 * Tenir quand un registre tombe (docs/conception-interoperabilite.md, § 10) : tout ou rien.
 * Si une donnée nécessaire ne peut pas être lue (registre hors service), rien n'est remis ni
 * journalisé : la requête passe « en_attente_registre » et n'est pas perdue. À la consultation
 * suivante de GET /requetes/{id}, elle reprend là où elle s'était arrêtée (vérification du
 * citoyen, demande de consentement, ou lecture et remise), sans nouvelle demande.
 */
const { randomUUID } = require('node:crypto');
const requeteModel = require('../models/requete.model');
const consentementClient = require('../clients/consentement.client');
const journalClient = require('../clients/journal.client');
const registresClient = require('../clients/registres.client');
const bffClient = require('../clients/bff.client');
const catalogue = require('../config/catalogue');
const droitsService = require('./droits.service');
const catalogueService = require('./catalogue.service');
const cascadeService = require('./cascade.service');
const collecteService = require('./collecte.service');
const AppError = require('../utils/AppError');
const { IUE_REGEX, UUID_REGEX, invalid, isNonEmptyString } = require('../utils/validation');

/** Statut d'une requête qui attend le retour d'un registre hors service. */
const ATTENTE_REGISTRE = 'en_attente_registre';

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
 * @param {*} err
 * @returns {boolean} Vrai si l'erreur signale un registre hors service.
 */
function estIndisponible(err) {
  return Boolean(err) && err.code === 'REGISTRE_INDISPONIBLE';
}

/**
 * Résout la cascade puis collecte les données filtrées.
 * Tout ou rien : si une pièce de la cascade ou une donnée dépend d'un registre hors
 * service, l'erreur REGISTRE_INDISPONIBLE remonte et rien n'est remis.
 * @returns {Promise<{cascade: object[], collected: object}>}
 * @throws {AppError} 503 REGISTRE_INDISPONIBLE (avec la liste des registres en cause).
 */
async function gatherData(demarche, iue, allowedFields) {
  const resultats = await Promise.allSettled([
    cascadeService.resolve(demarche.pieces.map((p) => p.type_piece_id), iue),
    collecteService.collect(demarche.id, iue, allowedFields),
  ]);
  const indisponibles = resultats.filter((r) => r.status === 'rejected' && estIndisponible(r.reason))
    .flatMap((r) => r.reason.registres);
  const autre = resultats.find((r) => r.status === 'rejected' && !estIndisponible(r.reason));
  if (autre) throw autre.reason;
  if (indisponibles.length) throw registresClient.registreIndisponible(indisponibles);
  return { cascade: resultats[0].value, collected: resultats[1].value };
}

/**
 * Le citoyen existe-t-il à l'état civil ?
 * @param {string} iue
 * @returns {Promise<boolean>}
 * @throws {AppError} 503 REGISTRE_INDISPONIBLE si l'état civil est hors service.
 */
function citoyenExiste(iue) {
  return registresClient.pieceExists('extrait-naissance', 'etat-civil', iue);
}

/**
 * Crée la demande de consentement d'une administration privée.
 * @returns {Promise<object>} Consentement créé (id, date_expiration).
 */
function demanderConsentement(requeteId, admin, demarche, rules, iue) {
  return consentementClient.createRequest({
    iue_citoyen: iue,
    administration_id: admin.id,
    administration_nom: admin.nom,
    administration_type: 'privee',
    demarche_id: demarche.id,
    demarche_nom: demarche.nom,
    champs_demandes: rules,
    requete_id: requeteId,
  });
}

/**
 * Corps de la réponse 202 d'une requête mise en attente d'un registre.
 * @param {string} requeteId
 * @param {string[]} registres Registres hors service.
 * @returns {{httpStatus: number, body: object}}
 */
function reponseAttente(requeteId, registres) {
  const noms = registres.map((id) => (catalogue.registres[id] || {}).nom || id);
  return {
    httpStatus: 202,
    body: {
      requete_id: requeteId,
      statut: ATTENTE_REGISTRE,
      registres_indisponibles: registres,
      message: `Registre momentanément indisponible (${noms.join(', ')}). La requête est conservée : `
        + 'elle sera complétée à une prochaine consultation de GET /requetes/{id}, sans nouvelle demande.',
    },
  };
}

/**
 * POST /requetes : soumission d'une requête par une administration.
 *
 * @param {string} administrationId UUID issu du jeton.
 * @param {object} body RequeteEntree { iue_citoyen, demarche_id }.
 * @returns {Promise<{httpStatus: number, body: object}>} 200 RequeteResultat, 202 RequeteEnAttente
 *          (consentement ou registre).
 * @throws {AppError} 400 corps invalide, 403 hors mission, 404 démarche ou citoyen inconnu,
 *                    502 service indisponible (consentement, journal).
 */
async function submit(administrationId, body) {
  if (!body || !IUE_REGEX.test(body.iue_citoyen || '')) invalid('iue_citoyen doit contenir 12 chiffres');
  if (!isNonEmptyString(body.demarche_id)) invalid('demarche_id est requis');
  const iue = body.iue_citoyen;

  // 1. Droits (aucun registre n'est consulté pour cela).
  const admin = await droitsService.getAdministration(administrationId);
  const demarche = await catalogueService.findDemarcheOrFail(body.demarche_id);
  const rules = await consentementClient.getRules(demarche.id);
  await droitsService.checkMission(admin, rules);

  // L'id est généré ici pour être transmis au journal / au consentement avant l'enregistrement.
  const requeteId = randomUUID();
  const base = { id: requeteId, administration_id: admin.id, iue_citoyen: iue, demarche_id: demarche.id };

  try {
    // 2. Le citoyen doit exister : on ne crée pas de consentement pour un IUE fantôme.
    if (!(await citoyenExiste(iue))) {
      throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
    }

    // 3b. Administration privée : consentement explicite obligatoire.
    if (admin.type === 'privee') {
      const consent = await demanderConsentement(requeteId, admin, demarche, rules, iue);
      await requeteModel.create({
        ...base,
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
      ...base, statut: 'complete', cascade, date_creation: now, date_reponse: now,
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
  } catch (err) {
    if (!estIndisponible(err)) throw err;
    // Tenir : rien n'est transmis ni journalisé, mais la requête est conservée.
    await requeteModel.create({ ...base, statut: ATTENTE_REGISTRE });
    return reponseAttente(requeteId, err.registres);
  }
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
 * Remise unique des données d'une requête prête à être servie : consentement accepté
 * (privée), ou requête en attente d'un registre dont la vérification est faite.
 *
 * Ordre imposé :
 *  1. lecture des registres : rien ne sort encore. Si un registre est hors service, la
 *     requête passe (ou reste) « en_attente_registre » et rien n'est remis ;
 *  2. passage atomique au statut « complete » : si deux consultations arrivent en même
 *     temps, une seule gagne et remet les données ;
 *  3. entrée au journal. Si le journal échoue, la requête revient à son statut précédent
 *     pour un nouvel essai et rien n'est remis : aucune donnée ne sort sans trace.
 * Les données ne sont jamais enregistrées dans la passerelle.
 *
 * @param {string} requeteId
 * @param {object} ctx { admin, demarche, champs, typeAcces ('direct'|'consentement'), decideurIue }.
 * @returns {Promise<{requete: object, donnees: object|null, registres_indisponibles?: string[]}>}
 *          donnees non nul seulement pour la consultation qui effectue la remise.
 * @throws {AppError} 502 si le journal est injoignable.
 */
async function livrer(requeteId, ctx) {
  const current = await requeteModel.findById(requeteId);
  const depuis = current.statut;
  if (!['consentement_accepte', ATTENTE_REGISTRE].includes(depuis)) return { requete: current, donnees: null };

  let cascade;
  let collected;
  try {
    ({ cascade, collected } = await gatherData(ctx.demarche, current.iue_citoyen, ctx.champs));
  } catch (err) {
    if (!estIndisponible(err)) throw err;
    if (depuis !== ATTENTE_REGISTRE) await requeteModel.updateIfStatus(requeteId, depuis, { statut: ATTENTE_REGISTRE });
    return { requete: await requeteModel.findById(requeteId), donnees: null, registres_indisponibles: err.registres };
  }

  const direct = ctx.typeAcces === 'direct';
  const won = await requeteModel.updateIfStatus(requeteId, depuis, {
    statut: 'complete', cascade, ...(direct && { date_reponse: new Date() }),
  });
  if (!won) return { requete: await requeteModel.findById(requeteId), donnees: null };

  try {
    await recordAccess({
      requeteId,
      iue: current.iue_citoyen,
      decideurIue: ctx.decideurIue,
      admin: ctx.admin,
      demarche: ctx.demarche,
      registres: collected.registres_consultes,
      champs: collected.champs_transmis,
      typeAcces: ctx.typeAcces,
    });
  } catch (err) {
    await requeteModel.updateIfStatus(requeteId, 'complete', { statut: depuis });
    throw err;
  }
  if (direct) notifyDirectAccess(current.iue_citoyen, ctx.admin, ctx.demarche);
  return { requete: await requeteModel.findById(requeteId), donnees: collected.donnees };
}

/**
 * Reprend une requête « en_attente_registre » là où elle s'était arrêtée.
 *  - privée, consentement déjà accepté : seule la lecture manquait, on la refait ;
 *  - sinon, on vérifie le citoyen (inconnu : « echouee »), puis : privée, on demande le
 *    consentement ; publique, on lit et on remet.
 * Si un registre est encore hors service, la requête reste en attente.
 *
 * @param {object} requete Requête en attente d'un registre.
 * @returns {Promise<{requete: object, donnees: object|null, registres_indisponibles?: string[]}>}
 */
async function reprendre(requete) {
  const admin = await droitsService.getAdministration(requete.administration_id);
  const demarche = await catalogueService.findDemarcheOrFail(requete.demarche_id);
  const reload = async () => ({ requete: await requeteModel.findById(requete.id), donnees: null });

  if (requete.consentement_id) {
    const consent = await consentementClient.getConsent(requete.consentement_id);
    return livrer(requete.id, {
      admin, demarche, champs: consent.champs_demandes, typeAcces: 'consentement', decideurIue: consent.decideur_iue || requete.iue_citoyen,
    });
  }

  try {
    if (!(await citoyenExiste(requete.iue_citoyen))) {
      await requeteModel.updateIfStatus(requete.id, ATTENTE_REGISTRE, { statut: 'echouee', date_reponse: new Date() });
      return reload();
    }
    const rules = await consentementClient.getRules(demarche.id);

    if (admin.type === 'privee') {
      // Réservation atomique : une seule consultation crée la demande de consentement.
      const won = await requeteModel.updateIfStatus(requete.id, ATTENTE_REGISTRE, { statut: 'en_attente_consentement' });
      if (!won) return reload();
      try {
        const consent = await demanderConsentement(requete.id, admin, demarche, rules, requete.iue_citoyen);
        await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', {
          consentement_id: consent.id, date_expiration: new Date(consent.date_expiration),
        });
      } catch (err) {
        await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', { statut: ATTENTE_REGISTRE });
        throw err;
      }
      return reload();
    }

    return livrer(requete.id, {
      admin, demarche, champs: rules, typeAcces: 'direct', decideurIue: requete.iue_citoyen,
    });
  } catch (err) {
    if (!estIndisponible(err)) throw err;
    return { ...(await reload()), registres_indisponibles: err.registres };
  }
}

/**
 * Met la requête à jour d'après la réponse du citoyen au consentement.
 *
 *  - en attente : rien ne change ;
 *  - expiré : statut « expire », rien n'est transmis ;
 *  - refusé : statut « consentement_refuse » et entrée de journal (refus tracé, aucun champ) ;
 *  - accepté : statut « consentement_accepte », puis, si `deliver` est vrai,
 *    remise unique des données (voir livrer).
 *
 * @param {object} requete Requête en attente ou acceptée.
 * @param {{deliver: boolean}} options deliver : vrai pour remettre les données dans cet
 *        appel (GET /requetes/{id}) ; faux pour mettre seulement le statut à jour (relance
 *        par téléphone), sinon la remise unique serait consommée sans que personne la reçoive.
 * @returns {Promise<{requete: object, donnees: object|null, registres_indisponibles?: string[]}>}
 */
async function syncWithConsent(requete, { deliver }) {
  // Requête en cours de reprise (consentement en cours de création) : rien à synchroniser.
  if (!requete.consentement_id) return { requete, donnees: null };
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

  // Accepté. Si une tentative précédente a échoué après ce passage (ex : journal en
  // panne), la requête est restée en consentement_accepte et livrer retente.
  await requeteModel.updateIfStatus(requete.id, 'en_attente_consentement', {
    statut: 'consentement_accepte', date_reponse: answeredAt,
  });
  if (!deliver) return reload();
  return livrer(requete.id, {
    admin, demarche, champs: consent.champs_demandes, typeAcces: 'consentement', decideurIue: consent.decideur_iue || requete.iue_citoyen,
  });
}

/**
 * GET /requetes/{id} : statut d'une requête.
 *
 * `donnees` n'est rempli que par la consultation qui remet les données (la première
 * après l'acceptation du consentement, ou après le retour d'un registre). Ensuite, et pour
 * une requête publique servie dans la réponse du POST, il vaut null : la passerelle n'en
 * garde pas de copie. Une requête « en_attente_registre » est reprise à chaque consultation.
 *
 * @param {string} administrationId UUID issu du jeton.
 * @param {string} id UUID de la requête.
 * @returns {Promise<object>} RequeteStatut.
 * @throws {AppError} 404 REQUETE_NON_TROUVEE, 502 service indisponible (consentement, journal).
 */
async function getStatus(administrationId, id) {
  let requete = await getOwnRequete(administrationId, id);
  let donnees = null;
  let indisponibles = null;
  if (['en_attente_consentement', 'consentement_accepte'].includes(requete.statut)) {
    ({ requete, donnees, registres_indisponibles: indisponibles = null } = await syncWithConsent(requete, { deliver: true }));
  } else if (requete.statut === ATTENTE_REGISTRE) {
    ({ requete, donnees, registres_indisponibles: indisponibles = null } = await reprendre(requete));
  }
  return {
    requete_id: requete.id,
    statut: requete.statut,
    donnees,
    ...(requete.statut === ATTENTE_REGISTRE && { registres_indisponibles: indisponibles || [] }),
    date_creation: requete.date_creation.toISOString(),
    date_expiration: requete.date_expiration ? requete.date_expiration.toISOString() : null,
    date_reponse: requete.date_reponse ? requete.date_reponse.toISOString() : null,
  };
}

/**
 * GET /requetes/{id}/telephone : numéro du citoyen pour le relancer.
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
