/**
 * Controller Citoyens — couche HTTP du registre fiscal.
 *
 * Rôle : extraire les paramètres de la requête, appeler le service,
 * renvoyer la réponse avec le bon code HTTP. Aucune logique métier ici.
 * Les erreurs levées par le service remontent jusqu'à errorHandler
 * grâce à asyncHandler (voir routes/citoyens.routes.js).
 */
const fiscalService = require('../services/fiscal.service');

/**
 * GET /api/citoyens/:iue/fiscal?champs=a,b
 * Renvoie la situation fiscale (filtrée si ?champs= est fourni).
 */
async function getSituationFiscale(req, res) {
  const data = await fiscalService.getSituationFiscale(req.params.iue, req.query.champs);
  res.status(200).json(data);
}

module.exports = { getSituationFiscale };
