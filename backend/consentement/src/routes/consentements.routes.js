/**
 * Routes /api/consentements — relie chaque URL du contrat à son controller.
 *
 * Contrat : docs/openapi-consentement.yaml
 *  - routes citoyen : protégées par JWT ;
 *  - POST /creer : interne, sans JWT conformément au contrat. Elle n'est appelée
 *    que par la passerelle, sur le réseau interne Docker.
 */
const { Router } = require('express');
const controller = require('../controllers/consentements.controller');
const { requireCitizen } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.post('/creer', asyncHandler(controller.create));

router.get('/', requireCitizen, asyncHandler(controller.list));
// ATTENTION à l'ordre : /en-attente/count doit être déclarée AVANT /:id.
router.get('/en-attente/count', requireCitizen, asyncHandler(controller.countPending));
router.get('/:id', requireCitizen, asyncHandler(controller.getOne));
router.put('/:id', requireCitizen, asyncHandler(controller.answer));

module.exports = router;
