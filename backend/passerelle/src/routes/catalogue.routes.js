/**
 * Routes du catalogue — publiques, sans jeton (le contrat n'en déclare pas) :
 * elles ne décrivent que l'offre de la plateforme, aucune donnée citoyenne.
 * Contrat : docs/openapi-passerelle.yaml
 */
const { Router } = require('express');
const controller = require('../controllers/catalogue.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/demarches', asyncHandler(controller.listDemarches));
router.get('/demarches/:id', asyncHandler(controller.getDemarche));
router.get('/types-pieces', asyncHandler(controller.listTypesPieces));
router.get('/types-pieces/:id/prerequis', asyncHandler(controller.getPrerequisTree));
router.get('/administrations', asyncHandler(controller.listAdministrations));
// État des registres du catalogue et dictionnaire des données (conception § 10 et § 4).
router.get('/registres', asyncHandler(controller.getRegistres));
router.get('/dictionnaire', asyncHandler(controller.getDictionnaire));

module.exports = router;
