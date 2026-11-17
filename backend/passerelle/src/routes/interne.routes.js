/**
 * Routes /api/interne — réservées au BFF espace usager.
 * Protégées par la clé de service partagée (en-tête X-Cle-Service) : la
 * passerelle est exposée aux administrations, ces routes ne doivent pas l'être.
 */
const { Router } = require('express');
const controller = require('../controllers/interne.controller');
const { requireServiceKey } = require('../middlewares/cleService');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.use(requireServiceKey);
router.get('/citoyens/:iue', asyncHandler(controller.identity));
router.post('/cascade', asyncHandler(controller.cascade));

module.exports = router;
