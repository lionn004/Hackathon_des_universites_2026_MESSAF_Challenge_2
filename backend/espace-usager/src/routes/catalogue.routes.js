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
// État des registres et dictionnaire des données : publics, sans donnée citoyenne.
router.get('/registres', asyncHandler(controller.getRegistres));
router.get('/dictionnaire', asyncHandler(controller.getDictionnaire));

module.exports = router;
