/**
 * Controller Consentements — couche HTTP des demandes de consentement.
 *
 * Rôle : extraire les paramètres de la requête, appeler le service,
 * renvoyer la réponse avec le bon code HTTP. Aucune logique métier ici.
 * Les erreurs levées par le service remontent jusqu'à errorHandler
 * grâce à asyncHandler (voir routes/consentements.routes.js).
 * req.citoyen ({ iue, enfants }) est fourni par le middleware auth.
 */
const consentementsService = require('../services/consentements.service');

/** GET /api/consentements?statut=&page=&limite= — demandes du citoyen connecté. */
async function list(req, res) {
  res.status(200).json(await consentementsService.listForCitizen(req.citoyen, req.query));
}

/** GET /api/consentements/en-attente/count — nombre de demandes en attente. */
async function countPending(req, res) {
  res.status(200).json(await consentementsService.countPending(req.citoyen));
}

/** GET /api/consentements/:id — détail d'une demande. */
async function getOne(req, res) {
  res.status(200).json(await consentementsService.getForCitizen(req.params.id, req.citoyen));
}

/** PUT /api/consentements/:id — body { decision: "accepte" | "refuse" }. */
async function answer(req, res) {
  res.status(200).json(await consentementsService.answer(req.params.id, req.citoyen, req.body));
}

/** POST /api/consentements/creer — appelé par la passerelle ; répond 201. */
async function create(req, res) {
  res.status(201).json(await consentementsService.createRequest(req.body));
}

module.exports = {
  list, countPending, getOne, answer, create,
};
