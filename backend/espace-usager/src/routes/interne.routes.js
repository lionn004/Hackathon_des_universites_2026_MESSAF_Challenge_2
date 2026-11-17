/**
 * Routes /api/interne — réservées aux autres services (aujourd'hui : la passerelle).
 * Protégées par la clé de service partagée (en-tête X-Cle-Service) : le BFF est
 * exposé à internet, ces routes donnent le téléphone des citoyens.
 */
const { Router } = require('express');
const controller = require('../controllers/interne.controller');
const { requireServiceKey } = require('../middlewares/cleService');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.use(requireServiceKey);
router.get('/citoyens/:iue/telephone', asyncHandler(controller.getPhone));

module.exports = router;
