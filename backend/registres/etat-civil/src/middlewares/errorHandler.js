/**
 * Middlewares de gestion des erreurs.
 *
 * Garantissent que TOUTES les erreurs du service sont renvoyées au format
 * commun du projet : { code: "CODE_CONSTANTE", message: "Message lisible" }.
 * Ils sont montés en dernier dans app.js.
 */
const AppError = require('../utils/AppError');

/**
 * Répond 404 quand aucune route ne correspond à la requête.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function notFound(req, res) {
  res.status(404).json({ code: 'ROUTE_NON_TROUVEE', message: `Route ${req.method} ${req.originalUrl} inexistante` });
}

/**
 * Convertit une erreur en réponse JSON.
 * - AppError (erreur métier attendue) : on renvoie son statut et son code.
 * - Toute autre erreur (bug, base indisponible…) : 500 générique, et le détail
 *   est seulement journalisé côté serveur pour ne rien exposer au client.
 *
 * Express reconnaît un middleware d'erreur à ses 4 paramètres : `next` doit
 * donc rester dans la signature même s'il n'est pas utilisé.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ code: err.code, message: err.message });
  }
  console.error(err);
  return res.status(500).json({ code: 'ERREUR_INTERNE', message: 'Erreur interne du serveur' });
}

module.exports = { notFound, errorHandler };
