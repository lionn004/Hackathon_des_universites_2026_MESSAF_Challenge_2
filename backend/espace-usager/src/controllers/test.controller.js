/**
 * Controller Test — couche HTTP de l'interface de simulation d'administrations.
 * Aucune logique métier ici : tout est dans services/test.service.js.
 */
const testService = require('../services/test.service');

/** GET /api/test/administrations */
async function listAdministrations(req, res) {
  res.status(200).json(await testService.listAdministrations());
}

/** GET /api/test/demarches */
async function listDemarches(req, res) {
  res.status(200).json(await testService.listDemarches());
}

/** POST /api/test/requete — 200 (admin publique) ou 202 (admin privée). */
async function simulateRequest(req, res) {
  const { httpStatus, body } = await testService.simulateRequest(req.body);
  res.status(httpStatus).json(body);
}

/** GET /api/test/requetes/:id?administration_id= */
async function getRequest(req, res) {
  res.status(200).json(await testService.getRequest(req.params.id, req.query.administration_id));
}

module.exports = {
  listAdministrations, listDemarches, simulateRequest, getRequest,
};
