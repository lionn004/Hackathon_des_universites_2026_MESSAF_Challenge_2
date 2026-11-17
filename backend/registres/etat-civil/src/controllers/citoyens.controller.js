/**
 * Controller Citoyens — couche HTTP du registre état-civil.
 *
 * Rôle : extraire les paramètres de la requête, appeler le service,
 * renvoyer la réponse avec le bon code HTTP. Aucune logique métier ici.
 * Les erreurs levées par le service remontent jusqu'à errorHandler
 * grâce à asyncHandler (voir routes/citoyens.routes.js).
 */
const citoyensService = require('../services/citoyens.service');

/**
 * GET /api/citoyens/:iue?champs=a,b,c
 * Renvoie les données d'état civil (filtrées si ?champs= est fourni).
 */
async function getCitizen(req, res) {
  const data = await citoyensService.getCitizen(req.params.iue, req.query.champs);
  res.status(200).json(data);
}

/**
 * GET /api/citoyens/:iue/filiation
 * Renvoie les IUE des parents et des enfants du citoyen.
 */
async function getFiliation(req, res) {
  const data = await citoyensService.getFiliation(req.params.iue);
  res.status(200).json(data);
}

/**
 * GET /api/citoyens/recherche?nom=&prenom=&date_naissance=
 * Recherche des citoyens par critères (fallback physique).
 */
async function search(req, res) {
  const { nom, prenom, date_naissance } = req.query;
  const data = await citoyensService.searchCitizens({ nom, prenom, date_naissance });
  res.status(200).json(data);
}

module.exports = { getCitizen, getFiliation, search };
