/**
 * Middleware de protection des routes INTERNES (appels entre services).
 *
 * La passerelle est exposée aux administrations : ses routes /interne ne
 * doivent pas être appelables depuis l'extérieur (elles donnent l'identité
 * des citoyens). L'appelant (le BFF) doit présenter la clé partagée
 * CLE_SERVICE_INTERNE dans l'en-tête `X-Cle-Service`.
 */
const crypto = require('node:crypto');
const config = require('../config');
const AppError = require('../utils/AppError');

/**
 * Compare deux chaînes en temps constant (évite de deviner la clé caractère
 * par caractère en mesurant le temps de réponse).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Refuse toute requête sans la bonne clé de service.
 * @throws {AppError} 401 CLE_SERVICE_INVALIDE
 */
function requireServiceKey(req, res, next) {
  const provided = req.headers['x-cle-service'] || '';
  if (!safeEqual(provided, config.serviceKey)) {
    return next(new AppError(401, 'CLE_SERVICE_INVALIDE', 'Route réservée aux services de la plateforme'));
  }
  return next();
}

module.exports = { requireServiceKey };
