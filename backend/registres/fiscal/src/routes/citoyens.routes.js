/**
 * Routes /api/citoyens — relie chaque URL du contrat à son controller.
 *
 * Contrat : docs/openapi-registre-fiscal.yaml
 * Pas d'authentification : le contrat des registres n'en déclare pas
 * (ils ne sont appelés que par la passerelle, sur le réseau interne).
 */
const { Router } = require('express');
const controller = require('../controllers/citoyens.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/:iue/fiscal', asyncHandler(controller.getSituationFiscale));

module.exports = router;
