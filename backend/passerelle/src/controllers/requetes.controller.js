/**
 * Controller Requêtes — couche HTTP des requêtes d'administrations.
 *
 * Rôle : extraire les paramètres, appeler le service, renvoyer le bon code HTTP.
 * req.administrationId est fourni par le middleware auth.
 */
const requetesService = require('../services/requetes.service');

/**
 * POST /api/requetes — body { iue_citoyen, demarche_id }.
 * 200 (admin publique, données) ou 202 (admin privée, en attente de consentement) :
 * c'est le service qui choisit, selon le type d'administration.
 */
async function submit(req, res) {
  const { httpStatus, body } = await requetesService.submit(req.administrationId, req.body);
  res.status(httpStatus).json(body);
}

/** GET /api/requetes/:id — statut de la requête (et données si complète). */
async function getStatus(req, res) {
  res.status(200).json(await requetesService.getStatus(req.administrationId, req.params.id));
}

/** GET /api/requetes/:id/telephone — téléphone du citoyen pour relance. */
async function getPhone(req, res) {
  res.status(200).json(await requetesService.getPhone(req.administrationId, req.params.id));
}

module.exports = { submit, getStatus, getPhone };
