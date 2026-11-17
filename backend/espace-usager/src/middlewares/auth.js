/**
 * Middleware d'authentification des citoyens (JWT Bearer émis par ce BFF).
 *
 * Le jeton est obtenu via POST /api/auth/connexion. En cas de succès,
 * req.citoyen = { iue } pour les controllers.
 *
 * Seul l'IUE du jeton est utilisé : les tutelles (liste `enfants`) sont
 * toujours relues en base par les services, pour qu'un transfert de compte
 * prenne effet immédiatement, même si le jeton du tuteur est encore valide.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const AppError = require('../utils/AppError');
const { IUE_REGEX } = require('../utils/validation');

/**
 * Vérifie l'en-tête `Authorization: Bearer <jeton>`.
 * @throws {AppError} 401 AUTH_REQUISE si l'en-tête est absent ou mal formé.
 * @throws {AppError} 401 TOKEN_INVALIDE si le jeton est expiré, mal signé ou sans IUE.
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
    return next(new AppError(401, 'TOKEN_INVALIDE', 'Session expirée ou invalide, veuillez vous reconnecter'));
  }
}

module.exports = { requireCitizen };
