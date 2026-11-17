/**
 * Controller Interne — couche HTTP des routes réservées aux autres services.
 */
const interneService = require('../services/interne.service');

/** GET /api/interne/citoyens/:iue/telephone */
async function getPhone(req, res) {
  res.status(200).json(await interneService.getPhone(req.params.iue));
}

module.exports = { getPhone };
