/**
 * Routes /api/auth — publiques (pas de jeton : c'est ici qu'on l'obtient).
 * Contrat : docs/openapi-espace-usager.yaml
 */
const { Router } = require('express');
const controller = require('../controllers/auth.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.post('/inscription', asyncHandler(controller.register));
router.post('/connexion', asyncHandler(controller.login));
router.post('/mot-de-passe-oublie', asyncHandler(controller.forgotPassword));
router.post('/reinitialiser-mot-de-passe', asyncHandler(controller.resetPassword));

module.exports = router;
