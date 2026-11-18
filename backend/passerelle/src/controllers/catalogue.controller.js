/**
 * Controller Catalogue — couche HTTP du catalogue (démarches, pièces, administrations).
 * Aucune logique métier ici : tout est dans services/catalogue.service.js.
 */
const catalogueService = require('../services/catalogue.service');
const registresService = require('../services/registres.service');

/** GET /api/demarches */
async function listDemarches(req, res) {
  res.status(200).json(await catalogueService.listDemarches());
}

/** GET /api/demarches/:id */
async function getDemarche(req, res) {
  res.status(200).json(await catalogueService.getDemarche(req.params.id));
}

/** GET /api/types-pieces */
async function listTypesPieces(req, res) {
  res.status(200).json(await catalogueService.listTypesPieces());
}

/** GET /api/types-pieces/:id/prerequis */
async function getPrerequisTree(req, res) {
  res.status(200).json(await catalogueService.getPrerequisTree(req.params.id));
}

/** GET /api/administrations */
async function listAdministrations(req, res) {
  res.status(200).json(await catalogueService.listAdministrations());
}

/** GET /api/registres : état de chaque registre du catalogue. */
function getRegistres(req, res) {
  res.status(200).json(registresService.getEtat());
}

/** GET /api/dictionnaire : données de la plateforme et leurs libellés. */
function getDictionnaire(req, res) {
  res.status(200).json(registresService.getDictionnaire());
}

module.exports = {
  listDemarches, getDemarche, listTypesPieces, getPrerequisTree, listAdministrations, getRegistres, getDictionnaire,
};
