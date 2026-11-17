/**
 * Outils de validation communs aux services du BFF.
 * Chaque fonction lève une AppError 400 DONNEES_INVALIDES avec un message
 * qui indique précisément le champ fautif.
 */
const AppError = require('./AppError');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;
/** UUID (toutes versions), format 8-4-4-4-12 en hexadécimal. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Registres existants dans la plateforme. */
const REGISTRES = ['etat-civil', 'justice', 'fiscal'];

/**
 * Lève une erreur 400 de validation.
 * @param {string} message Explication lisible du problème.
 * @throws {AppError}
 */
function invalid(message) {
  throw new AppError(400, 'DONNEES_INVALIDES', message);
}

/**
 * Vérifie qu'une valeur est un tableau de chaînes non vides.
 * @param {*} value
 * @returns {boolean}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '');
}

/**
 * Vérifie qu'une valeur est une chaîne non vide.
 * @param {*} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Lit un entier positif dans la query string.
 * @param {string|undefined} raw Valeur brute.
 * @param {number} fallback Valeur par défaut si absente.
 * @param {string} name Nom du paramètre (pour le message d'erreur).
 * @returns {number}
 * @throws {AppError} 400 si la valeur n'est pas un entier >= 1.
 */
function parsePositiveInt(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) invalid(`${name} doit être un entier supérieur ou égal à 1`);
  return n;
}

module.exports = {
  IUE_REGEX, UUID_REGEX, REGISTRES, invalid, isStringArray, isNonEmptyString, parsePositiveInt,
};
