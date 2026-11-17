/**
 * Service Fiscal — logique métier du registre fiscal.
 *
 * Responsabilités :
 *  - valider l'IUE et lever les erreurs métier (AppError) ;
 *  - convertir les enregistrements de la base au format du contrat
 *    SituationFiscale (docs/openapi-registre-fiscal.yaml) ;
 *  - calculer le champ dérivé en_regle ;
 *  - filtrer les champs demandés par la passerelle (?champs=...).
 *
 * Ce fichier ne connaît ni req ni res : il est appelé par le controller
 * et utilise le model pour accéder aux données.
 */
const contribuableModel = require('../models/contribuable.model');
const AppError = require('../utils/AppError');
const pickFields = require('../utils/pickFields');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;

/** Champs du schéma SituationFiscale du contrat (liste blanche pour ?champs=). */
const FISCAL_FIELDS = [
  'iue', 'ifu', 'en_regle', 'type_contribuable', 'regime_fiscal', 'derniere_declaration', 'montant_impot_du',
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
 * GET /citoyens/{iue}/fiscal — situation fiscale d'un citoyen.
 *
 * Règle : un contribuable est « en règle » s'il ne doit aucun impôt
 * (montant_impot_du nul ou égal à 0). C'est le champ utilisé par la démarche
 * « ouverture de compte bancaire ».
 *
 * Un IUE mal formé ou inconnu renvoie 404 (le contrat ne prévoit que 200 et 404).
 * Une personne sans dossier fiscal (ex : un mineur) renvoie aussi 404.
 *
 * @param {string} iue IUE à 12 chiffres.
 * @param {string} [fieldsParam] Liste de champs séparés par des virgules ; tous si absent.
 * @returns {Promise<object>} SituationFiscale (éventuellement filtrée).
 * @throws {AppError} 404 CITOYEN_NON_TROUVE
 */
async function getSituationFiscale(iue, fieldsParam) {
  const taxpayer = IUE_REGEX.test(iue) ? await contribuableModel.findByIue(iue) : null;
  if (!taxpayer) throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');

  // Prisma renvoie un Decimal (objet) : on le convertit en nombre pour le JSON du contrat.
  const amountDue = taxpayer.montant_impot_du === null ? null : Number(taxpayer.montant_impot_du);

  const situation = {
    iue: taxpayer.iue,
    ifu: taxpayer.ifu,
    en_regle: !amountDue,
    type_contribuable: taxpayer.type_contribuable,
    regime_fiscal: taxpayer.regime_fiscal,
    derniere_declaration: toIsoDate(taxpayer.derniere_declaration),
    montant_impot_du: amountDue,
  };
  return pickFields(situation, fieldsParam, FISCAL_FIELDS);
}

module.exports = { getSituationFiscale };
