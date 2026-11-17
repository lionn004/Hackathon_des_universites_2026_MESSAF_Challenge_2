/**
 * Controller Citoyens — couche HTTP du registre justice.
 *
 * Rôle : extraire les paramètres de la requête, appeler le service,
 * renvoyer la réponse avec le bon code HTTP. Aucune logique métier ici.
 * Les erreurs levées par le service remontent jusqu'à errorHandler
 * grâce à asyncHandler (voir routes/citoyens.routes.js).
 */
const justiceService = require('../services/justice.service');

/**
 * GET /api/citoyens/:iue/casier?champs=a,b
 * Renvoie l'extrait du casier judiciaire (filtré si ?champs= est fourni).
 */
async function getCasier(req, res) {
  const data = await justiceService.getCasier(req.params.iue, req.query.champs);
  res.status(200).json(data);
}

/**
 * GET /api/citoyens/:iue/nationalite?champs=a,b
 * Renvoie le certificat de nationalité (filtré si ?champs= est fourni).
 */
async function getNationalite(req, res) {
  const data = await justiceService.getNationalite(req.params.iue, req.query.champs);
  res.status(200).json(data);
}

module.exports = { getCasier, getNationalite };
