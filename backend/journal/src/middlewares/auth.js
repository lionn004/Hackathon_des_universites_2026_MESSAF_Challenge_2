/**
 * Middleware d'authentification des citoyens (JWT Bearer).
 *
 * Le jeton est émis par le BFF (POST /api/auth/connexion) et signé en HS256
 * avec le secret partagé JWT_SECRET. Convention du projet pour son contenu :
 *   { iue: "784302956148", ... }  → l'IUE du citoyen connecté.
 *
 * En cas de succès, l'IUE est placé dans req.citoyen.iue pour les controllers.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;

/**
 * Vérifie l'en-tête `Authorization: Bearer <jeton>`.
 * @throws {AppError} 401 AUTH_REQUISE si l'en-tête est absent ou mal formé.
 * @throws {AppError} 401 TOKEN_INVALIDE si le jeton est expiré, mal signé ou sans IUE valide.
 */
function requireCitizen(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'AUTH_REQUISE', 'Jeton d\'authentification manquant'));
  }

  try {
    // algorithms est fixé explicitement pour refuser tout jeton signé autrement (ex : "none").
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (!IUE_REGEX.test(payload.iue || '')) throw new Error('IUE absent du jeton');
    req.citoyen = { iue: payload.iue };
    return next();
  } catch {
    return next(new AppError(401, 'TOKEN_INVALIDE', 'Jeton d\'authentification invalide ou expiré'));
  }
}

module.exports = { requireCitizen };
