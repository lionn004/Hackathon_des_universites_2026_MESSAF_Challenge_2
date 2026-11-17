/**
 * Middleware d'authentification des citoyens (JWT Bearer).
 *
 * Le jeton est émis par le BFF (POST /api/auth/connexion) et signé en HS256
 * avec le secret partagé JWT_SECRET. Convention du projet pour son contenu :
 *   {
 *     iue: "291047583620",          ← IUE du citoyen connecté (obligatoire)
 *     enfants: ["456123789012"]     ← IUE des mineurs dont il est tuteur (facultatif)
 *   }
 * La liste `enfants` permet au tuteur de voir et de traiter les demandes de
 * consentement qui concernent ses enfants : seul le BFF connaît les tutelles.
 *
 * En cas de succès, req.citoyen = { iue, enfants } pour les controllers.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;

/**
 * Vérifie l'en-tête `Authorization: Bearer <jeton>`.
 * @throws {AppError} 401 AUTH_REQUISE si l'en-tête est absent ou mal formé.
 * @throws {AppError} 401 TOKEN_INVALIDE si le jeton est expiré, mal signé ou mal rempli.
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

    const children = payload.enfants ?? [];
    if (!Array.isArray(children) || !children.every((i) => IUE_REGEX.test(i))) {
      throw new Error('Liste enfants invalide');
    }

    req.citoyen = { iue: payload.iue, enfants: children };
    return next();
  } catch {
    return next(new AppError(401, 'TOKEN_INVALIDE', 'Jeton d\'authentification invalide ou expiré'));
  }
}

module.exports = { requireCitizen };
