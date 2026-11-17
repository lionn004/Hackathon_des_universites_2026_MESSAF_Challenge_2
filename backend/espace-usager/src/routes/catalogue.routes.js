/**
 * Routes du catalogue — publiques (sans jeton) : elles ne décrivent que
 * l'offre de la plateforme, aucune donnée personnelle.
 * Contrat : docs/openapi-espace-usager.yaml
 */
const { Router } = require('express');
const controller = require('../controllers/catalogue.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/types-pieces', asyncHandler(controller.listTypesPieces));

module.exports = router;
