/**
 * Routes /api/requetes — protégées par le jeton d'ADMINISTRATION.
 * Contrat : docs/openapi-passerelle.yaml
 */
const { Router } = require('express');
const controller = require('../controllers/requetes.controller');
const { requireAdministration } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.use(requireAdministration);
router.post('/', asyncHandler(controller.submit));
router.get('/:id', asyncHandler(controller.getStatus));
router.get('/:id/telephone', asyncHandler(controller.getPhone));

module.exports = router;
