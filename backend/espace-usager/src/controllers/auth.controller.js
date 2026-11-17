/**
 * Controller Auth — couche HTTP de l'authentification.
 * Aucune logique métier ici : tout est dans services/auth.service.js.
 */
const authService = require('../services/auth.service');

/** POST /api/auth/inscription — 201 + AuthReponse. */
async function register(req, res) {
  res.status(201).json(await authService.register(req.body));
}

/** POST /api/auth/connexion — 200 + AuthReponse. */
async function login(req, res) {
  res.status(200).json(await authService.login(req.body));
}

/** POST /api/auth/mot-de-passe-oublie — 200, toujours la même réponse. */
async function forgotPassword(req, res) {
  res.status(200).json(await authService.forgotPassword(req.body));
}

/** POST /api/auth/reinitialiser-mot-de-passe */
async function resetPassword(req, res) {
  res.status(200).json(await authService.resetPassword(req.body));
}

module.exports = {
  register, login, forgotPassword, resetPassword,
};
