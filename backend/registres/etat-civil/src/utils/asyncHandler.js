/**
 * Enveloppe pour les controllers asynchrones.
 *
 * Express 4 ne capture pas les promesses rejetées : sans cette enveloppe,
 * une erreur levée dans un controller async ferait planter la requête
 * au lieu d'atteindre le middleware errorHandler.
 *
 * @param {Function} fn Controller async (req, res, next) => Promise.
 * @returns {Function} Middleware Express qui transmet toute erreur à next().
 */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
