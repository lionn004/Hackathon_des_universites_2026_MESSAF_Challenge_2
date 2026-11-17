/**
 * Routes /api/minimisation — filtre de minimisation.
 *
 * Contrat : docs/openapi-consentement.yaml
 * Route interne, sans JWT conformément au contrat : appelée uniquement par la
 * passerelle, sur le réseau interne Docker.
 */
const { Router } = require('express');
const controller = require('../controllers/minimisation.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.post('/filtrer', asyncHandler(controller.filter));

module.exports = router;
