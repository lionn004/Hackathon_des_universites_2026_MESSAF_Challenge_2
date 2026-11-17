/**
 * Routes /api/interne — routes réservées aux autres services du backend.
 *
 * Sans JWT : elles ne sont appelées que par la passerelle, sur le réseau
 * interne Docker. Elles ne doivent jamais être exposées au frontend.
 */
const { Router } = require('express');
const controller = require('../controllers/consentements.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/consentements/:id', asyncHandler(controller.getInternal));

module.exports = router;
