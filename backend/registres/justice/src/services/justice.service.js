/**
 * Service Justice — logique métier du registre justice.
 *
 * Responsabilités :
 *  - valider l'IUE et lever les erreurs métier (AppError) ;
 *  - convertir les enregistrements de la base aux formats du contrat
 *    CasierJudiciaire et CertificatNationalite (docs/openapi-registre-justice.yaml) ;
 *  - calculer les champs dérivés (casier_vierge, date_delivrance) ;
 *  - filtrer les champs demandés par la passerelle (?champs=...).
 *
 * Ce fichier ne connaît ni req ni res : il est appelé par le controller
 * et utilise le model pour accéder aux données.
 */
const justiciableModel = require('../models/justiciable.model');
const AppError = require('../utils/AppError');
const pickFields = require('../utils/pickFields');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;

/** Champs du schéma CasierJudiciaire du contrat (liste blanche pour ?champs=). */
const CASIER_FIELDS = ['iue', 'casier_vierge', 'condamnations', 'date_delivrance'];

/** Champs du schéma CertificatNationalite du contrat (liste blanche pour ?champs=). */
const NATIONALITE_FIELDS = [
  'iue', 'est_national', 'nationalite', 'mode_acquisition', 'date_acquisition', 'numero_certificat',
];

/**
 * Formate une date au format AAAA-MM-JJ demandé par le contrat.
 * @param {Date|null} date
 * @returns {string|null}
 */
function toIsoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

/**
 * Charge une personne via la fonction du model fournie, ou lève une erreur 404.
 * Un IUE mal formé est traité comme introuvable (404) et non comme une
 * requête invalide (400), car le contrat ne prévoit que les réponses 200 et 404.
 *
 * @param {string} iue
 * @param {(iue: string) => Promise<object|null>} finder Fonction du model à utiliser.
 * @returns {Promise<object>} Enregistrement brut.
 * @throws {AppError} 404 CITOYEN_NON_TROUVE
 */
async function getExistingPerson(iue, finder) {
  const person = IUE_REGEX.test(iue) ? await finder(iue) : null;
  if (!person) throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
  return person;
}

/**
 * GET /citoyens/{iue}/casier — extrait du casier judiciaire.
 *
 * Règles :
 *  - casier_vierge est vrai si et seulement si aucune condamnation n'est inscrite ;
 *  - date_delivrance est la date du jour : l'extrait est « délivré » au moment
 *    où la passerelle le demande. Le casier est une pièce évolutive, il n'est
 *    donc jamais mis en cache.
 *
 * @param {string} iue IUE à 12 chiffres.
 * @param {string} [fieldsParam] Liste de champs séparés par des virgules ; tous si absent.
 * @returns {Promise<object>} CasierJudiciaire (éventuellement filtré).
 * @throws {AppError} 404 si la personne n'existe pas.
 */
async function getCasier(iue, fieldsParam) {
  const person = await getExistingPerson(iue, justiciableModel.findWithCondamnations);
  const casier = {
    iue: person.iue,
    casier_vierge: person.condamnations.length === 0,
    condamnations: person.condamnations.map((c) => ({
      date: toIsoDate(c.date),
      nature: c.nature,
      tribunal: c.tribunal,
      duree: c.duree,
    })),
    date_delivrance: toIsoDate(new Date()),
  };
  return pickFields(casier, fieldsParam, CASIER_FIELDS);
}

/**
 * GET /citoyens/{iue}/nationalite — certificat de nationalité.
 * @param {string} iue IUE à 12 chiffres.
 * @param {string} [fieldsParam] Liste de champs séparés par des virgules ; tous si absent.
 * @returns {Promise<object>} CertificatNationalite (éventuellement filtré).
 * @throws {AppError} 404 si la personne n'existe pas.
 */
async function getNationalite(iue, fieldsParam) {
  const person = await getExistingPerson(iue, justiciableModel.findByIue);
  const certificat = {
    iue: person.iue,
    est_national: person.est_national,
    nationalite: person.nationalite,
    mode_acquisition: person.mode_acquisition,
    date_acquisition: toIsoDate(person.date_acquisition),
    numero_certificat: person.numero_certificat,
  };
  return pickFields(certificat, fieldsParam, NATIONALITE_FIELDS);
}

module.exports = { getCasier, getNationalite };
