/**
 * Routes /api/citoyens — relie chaque URL du contrat à son controller.
 *
 * Contrat : docs/openapi-registre-etat-civil.yaml
 * Pas d'authentification : le contrat des registres n'en déclare pas
 * (ils ne sont appelés que par la passerelle, sur le réseau interne).
 */
const { Router } = require('express');
const controller = require('../controllers/citoyens.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// ATTENTION à l'ordre : /recherche doit être déclarée AVANT /:iue,
// sinon Express prendrait le mot "recherche" pour un IUE.
router.get('/recherche', asyncHandler(controller.search));
router.get('/:iue', asyncHandler(controller.getCitizen));
router.get('/:iue/filiation', asyncHandler(controller.getFiliation));

module.exports = router;
