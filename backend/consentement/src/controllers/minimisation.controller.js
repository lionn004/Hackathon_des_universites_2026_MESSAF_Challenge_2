/**
 * Controller Minimisation — couche HTTP du filtre de minimisation.
 * Aucune logique métier ici : tout est dans services/minimisation.service.js.
 */
const minimisationService = require('../services/minimisation.service');

/** POST /api/minimisation/filtrer — body { demarche_id, registre, donnees_brutes }. */
async function filter(req, res) {
  res.status(200).json(await minimisationService.filter(req.body));
}

/** GET /api/minimisation/regles/:demarcheId — règles d'une démarche (interne). */
async function getRules(req, res) {
  res.status(200).json(await minimisationService.getRules(req.params.demarcheId));
}

module.exports = { filter, getRules };
