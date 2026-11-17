/**
 * Controller Interne — couche HTTP des routes réservées au BFF.
 * Aucune logique métier ici : tout est dans services/interne.service.js.
 */
const interneService = require('../services/interne.service');

/** GET /api/interne/citoyens/:iue — identité d'un citoyen et de ses enfants. */
async function identity(req, res) {
  res.status(200).json(await interneService.identity(req.params.iue));
}

/** POST /api/interne/cascade — body { type_piece_id, iue }. */
async function cascade(req, res) {
  res.status(200).json(await interneService.cascadeForPiece(req.body));
}

module.exports = { identity, cascade };
