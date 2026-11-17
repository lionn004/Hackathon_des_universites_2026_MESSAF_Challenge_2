/**
 * Controller Journal — couche HTTP du service journal.
 *
 * Rôle : extraire les paramètres de la requête, appeler le service,
 * renvoyer la réponse avec le bon code HTTP. Aucune logique métier ici.
 * Les erreurs levées par le service remontent jusqu'à errorHandler
 * grâce à asyncHandler (voir routes/journal.routes.js).
 */
const journalService = require('../services/journal.service');

/**
 * GET /api/journal?date_debut=&date_fin=&administration=&page=&limite=
 * Journal d'accès du citoyen connecté (req.citoyen fourni par le middleware auth).
 */
async function list(req, res) {
  const data = await journalService.listForCitizen(req.citoyen.iue, req.query);
  res.status(200).json(data);
}

/**
 * GET /api/journal/statistiques
 * Statistiques d'accès du citoyen connecté, pour le tableau de bord.
 */
async function stats(req, res) {
  const data = await journalService.statsForCitizen(req.citoyen.iue);
  res.status(200).json(data);
}

/**
 * POST /api/journal/enregistrer
 * Enregistre un accès ; répond 201 avec l'entrée créée.
 */
async function record(req, res) {
  const entry = await journalService.recordAccess(req.body);
  res.status(201).json(entry);
}

module.exports = { list, stats, record };
