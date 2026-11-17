/**
 * Service Citoyens — logique métier du registre état-civil.
 *
 * Responsabilités :
 *  - valider l'IUE et lever les erreurs métier (AppError) ;
 *  - convertir les enregistrements de la base au format du contrat
 *    DonneesEtatCivil (docs/openapi-registre-etat-civil.yaml) ;
 *  - calculer les champs dérivés (est_majeur) ;
 *  - filtrer les champs demandés par la passerelle (?champs=...).
 *
 * Ce fichier ne connaît ni req ni res : il est appelé par le controller
 * et utilise le model pour accéder aux données.
 */
const citoyenModel = require('../models/citoyen.model');
const AppError = require('../utils/AppError');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;
/** Format attendu pour une date en paramètre : AAAA-MM-JJ (ISO 8601). */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** Âge de la majorité civile au Burkina Faso. */
const MAJORITY_AGE = 18;

/**
 * Liste exhaustive des champs exposés par le contrat DonneesEtatCivil.
 * Sert de liste blanche pour le paramètre ?champs= : un champ absent
 * de cette liste ne peut jamais être renvoyé.
 */
const ALL_FIELDS = [
  'iue', 'nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe',
  'nationalite', 'pere_iue', 'mere_iue', 'date_deces', 'est_majeur',
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
 * Calcule l'âge révolu à une date donnée.
 * On travaille en UTC car Prisma renvoie les colonnes DATE à minuit UTC :
 * utiliser l'heure locale pourrait décaler l'anniversaire d'un jour.
 *
 * @param {Date} birthDate Date de naissance.
 * @param {Date} [today=new Date()] Date de référence (paramétrable pour les tests).
 * @returns {number} Âge en années pleines.
 */
function computeAge(birthDate, today = new Date()) {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  // Si l'anniversaire de cette année n'est pas encore passé, on retire un an.
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Convertit un enregistrement de la base au format DonneesEtatCivil du contrat.
 * est_majeur n'est pas stocké : il est recalculé à chaque appel pour rester
 * juste dans le temps (un mineur devient majeur sans mise à jour de la base).
 *
 * @param {object} citizen Enregistrement brut renvoyé par le model.
 * @returns {object} Objet conforme au schéma DonneesEtatCivil.
 */
function toContract(citizen) {
  return {
    iue: citizen.iue,
    nom: citizen.nom,
    prenom: citizen.prenom,
    date_naissance: toIsoDate(citizen.date_naissance),
    lieu_naissance: citizen.lieu_naissance,
    sexe: citizen.sexe,
    nationalite: citizen.nationalite,
    pere_iue: citizen.pere_iue,
    mere_iue: citizen.mere_iue,
    date_deces: toIsoDate(citizen.date_deces),
    est_majeur: computeAge(citizen.date_naissance) >= MAJORITY_AGE,
  };
}

/**
 * Ne garde que les champs demandés.
 * Les champs inconnus sont ignorés silencieusement : le registre renvoie
 * uniquement ce qu'il connaît, sans erreur, pour rester tolérant envers
 * les passerelles d'autres équipes (test d'interopérabilité).
 *
 * @param {object} data Données complètes au format du contrat.
 * @param {string} [fieldsParam] Valeur brute de ?champs= (ex : "nom,est_majeur").
 * @returns {object} Toutes les données si fieldsParam est absent, sinon le sous-ensemble demandé.
 */
function pickFields(data, fieldsParam) {
  if (!fieldsParam) return data;
  const requested = fieldsParam.split(',').map((f) => f.trim()).filter((f) => ALL_FIELDS.includes(f));
  return Object.fromEntries(requested.map((f) => [f, data[f]]));
}

/**
 * Récupère un citoyen ou lève une erreur 404.
 * Un IUE mal formé est traité comme introuvable (404) et non comme une
 * requête invalide (400), car le contrat ne prévoit que les réponses 200 et 404.
 *
 * @param {string} iue
 * @returns {Promise<object>} Enregistrement brut.
 * @throws {AppError} 404 CITOYEN_NON_TROUVE
 */
async function getExistingCitizen(iue) {
  const citizen = IUE_REGEX.test(iue) ? await citoyenModel.findByIue(iue) : null;
  if (!citizen) throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
  return citizen;
}

/**
 * GET /citoyens/{iue} — données d'état civil d'un citoyen.
 * @param {string} iue IUE à 12 chiffres.
 * @param {string} [fieldsParam] Liste de champs séparés par des virgules ; tous si absent.
 * @returns {Promise<object>} DonneesEtatCivil (éventuellement filtrées).
 * @throws {AppError} 404 si le citoyen n'existe pas.
 */
async function getCitizen(iue, fieldsParam) {
  const citizen = await getExistingCitizen(iue);
  return pickFields(toContract(citizen), fieldsParam);
}

/**
 * GET /citoyens/{iue}/filiation — parents et enfants d'un citoyen.
 * Utilisé par la passerelle pour résoudre les cascades (ex : le certificat
 * de nationalité exige les extraits de naissance du père et de la mère).
 * Un parent absent (pere_iue/mere_iue à null) n'apparaît simplement pas :
 * c'est à la passerelle de déclencher le fallback physique.
 *
 * @param {string} iue
 * @returns {Promise<{iue: string, parents: object[], enfants: object[]}>} Schéma Filiation du contrat.
 * @throws {AppError} 404 si le citoyen n'existe pas.
 */
async function getFiliation(iue) {
  const citizen = await getExistingCitizen(iue);
  const parents = [];
  if (citizen.pere_iue) parents.push({ iue: citizen.pere_iue, lien: 'pere' });
  if (citizen.mere_iue) parents.push({ iue: citizen.mere_iue, lien: 'mere' });

  // Le contrat distingue fils/fille : on le déduit du sexe de l'enfant.
  const children = await citoyenModel.findChildren(iue);
  const enfants = children.map((c) => ({ iue: c.iue, lien: c.sexe === 'F' ? 'fille' : 'fils' }));

  return { iue: citizen.iue, parents, enfants };
}

/**
 * GET /citoyens/recherche — recherche par nom, prénom et/ou date de naissance.
 * Ne renvoie qu'un résumé (iue, nom, prenom, date_naissance), jamais les
 * données complètes.
 *
 * Écart volontaire : sans aucun critère valide, on renvoie une liste vide
 * plutôt que tout le registre (le contrat ne précise pas ce cas).
 *
 * @param {object} query
 * @param {string} [query.nom]
 * @param {string} [query.prenom]
 * @param {string} [query.date_naissance] Format AAAA-MM-JJ ; ignorée si mal formée.
 * @returns {Promise<{resultats: object[]}>}
 */
async function searchCitizens({ nom, prenom, date_naissance }) {
  const birthDate = date_naissance && DATE_REGEX.test(date_naissance) ? new Date(date_naissance) : null;
  if (!nom && !prenom && !birthDate) return { resultats: [] };

  const citizens = await citoyenModel.search({ nom, prenom, date_naissance: birthDate });
  return {
    resultats: citizens.map((c) => ({
      iue: c.iue,
      nom: c.nom,
      prenom: c.prenom,
      date_naissance: toIsoDate(c.date_naissance),
    })),
  };
}

module.exports = { getCitizen, getFiliation, searchCitizens, computeAge };
