/**
 * Controller Statistiques : couche HTTP des statistiques publiques et anonymes.
 * Aucune logique métier ici (voir services/statistiques.service.js).
 */
const statistiquesService = require('../services/statistiques.service');

/** GET /api/statistiques/numerisation : pièces à numériser en priorité. */
async function numerisation(req, res) {
  res.status(200).json(await statistiquesService.numerisation());
}

module.exports = { numerisation };
