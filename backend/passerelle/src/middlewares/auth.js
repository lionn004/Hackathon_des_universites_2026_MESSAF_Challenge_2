/**
 * Middleware d'authentification des ADMINISTRATIONS (JWT Bearer).
 *
 * Chaque administration (ministère, banque…) appelle la passerelle avec un
 * jeton signé en HS256 avec le secret partagé JWT_SECRET. Convention du projet :
 *   { administration_id: "00000000-0000-4000-8000-000000000001" }
 * Pour la démo, ces jetons sont générés par `npm run jeton:admin`
 * (ou par le BFF pour l'interface de test).
 *
 * Ce middleware vérifie seulement la signature et le format. L'existence de
 * l'administration est vérifiée par la couche service.
 * En cas de succès : req.administrationId.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');
const { UUID_REGEX } = require('../utils/validation');

/**
 * Vérifie l'en-tête `Authorization: Bearer <jeton>`.
 * @throws {AppError} 401 AUTH_REQUISE si l'en-tête est absent ou mal formé.
 * @throws {AppError} 401 TOKEN_INVALIDE si le jeton est expiré, mal signé ou sans administration_id.
 */
function requireAdministration(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'AUTH_REQUISE', 'Jeton d\'authentification manquant'));
  }

  try {
    // algorithms est fixé explicitement pour refuser tout jeton signé autrement (ex : "none").
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (!UUID_REGEX.test(payload.administration_id || '')) throw new Error('administration_id absent');
    req.administrationId = payload.administration_id;
    return next();
  } catch {
    return next(new AppError(401, 'TOKEN_INVALIDE', 'Jeton d\'administration invalide ou expiré'));
  }
}

module.exports = { requireAdministration };
