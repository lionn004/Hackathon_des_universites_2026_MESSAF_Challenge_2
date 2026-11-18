/**
 * Controller Catalogue — couche HTTP du catalogue des pièces.
 * Aucune logique métier ici : tout est dans services/catalogue.service.js.
 */
const catalogueService = require('../services/catalogue.service');

/** GET /api/types-pieces */
async function listTypesPieces(req, res) {
  res.status(200).json(await catalogueService.listTypesPieces());
}

/** GET /api/registres */
async function getRegistres(req, res) {
  res.status(200).json(await catalogueService.getRegistres());
}

/** GET /api/dictionnaire */
async function getDictionnaire(req, res) {
  res.status(200).json(await catalogueService.getDictionnaire());
}

module.exports = { listTypesPieces, getRegistres, getDictionnaire };
