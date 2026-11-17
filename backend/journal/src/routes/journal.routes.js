/**
 * Routes /api/journal — relie chaque URL du contrat à son controller.
 *
 * Contrat : docs/openapi-journal.yaml
 *  - consultation (citoyen) : protégée par JWT, le citoyen ne voit que ses accès ;
 *  - enregistrement (interne) : sans JWT, conformément au contrat. Il n'est appelé
 *    que par la passerelle, sur le réseau interne Docker.
 */
const { Router } = require('express');
const controller = require('../controllers/journal.controller');
const { requireCitizen } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/', requireCitizen, asyncHandler(controller.list));
router.get('/statistiques', requireCitizen, asyncHandler(controller.stats));
router.post('/enregistrer', asyncHandler(controller.record));

module.exports = router;
