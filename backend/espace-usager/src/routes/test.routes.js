/**
 * Routes /api/test — interface de simulation d'administrations (démo et jury).
 * Sans jeton, conformément au contrat ; désactivables par INTERFACE_TEST_ACTIVE=false.
 */
const { Router } = require('express');
const controller = require('../controllers/test.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/administrations', asyncHandler(controller.listAdministrations));
router.get('/demarches', asyncHandler(controller.listDemarches));
router.post('/requete', asyncHandler(controller.simulateRequest));
router.get('/requetes/:id', asyncHandler(controller.getRequest));

module.exports = router;
