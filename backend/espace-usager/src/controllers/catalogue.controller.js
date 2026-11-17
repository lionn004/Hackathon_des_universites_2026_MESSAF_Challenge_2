/**
 * Controller Catalogue — couche HTTP du catalogue des pièces.
 * Aucune logique métier ici : tout est dans services/catalogue.service.js.
 */
const catalogueService = require('../services/catalogue.service');

/** GET /api/types-pieces */
async function listTypesPieces(req, res) {
  res.status(200).json(await catalogueService.listTypesPieces());
}

module.exports = { listTypesPieces };
