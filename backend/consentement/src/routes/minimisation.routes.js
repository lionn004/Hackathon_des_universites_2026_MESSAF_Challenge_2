/**
 * Routes /api/minimisation — filtre de minimisation.
 *
 * Contrat : docs/openapi-consentement.yaml
 * Routes internes, sans JWT conformément au contrat : appelées uniquement par la
 * passerelle, sur le réseau interne Docker.
 */
const { Router } = require('express');
const controller = require('../controllers/minimisation.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.post('/filtrer', asyncHandler(controller.filter));
router.get('/regles/:demarcheId', asyncHandler(controller.getRules));

module.exports = router;
