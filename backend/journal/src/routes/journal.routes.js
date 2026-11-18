/**
 * Routes du journal de traçabilité (montées sous /api/journal).
 * Contrat : docs/openapi-journal.yaml
 *  - GET  /              journal du citoyen connecté (JWT citoyen) ;
 *  - GET  /statistiques  résumé pour le tableau de bord (JWT citoyen) ;
 *  - GET  /verification  intégrité de la chaîne des empreintes (JWT citoyen) ;
 *  - POST /enregistrer   route interne appelée par la passerelle (sans JWT, conformément au contrat).
 */
const { Router } = require('express');
const controller = require('../controllers/journal.controller');
const { requireCitizen } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/', requireCitizen, asyncHandler(controller.list));
router.get('/statistiques', requireCitizen, asyncHandler(controller.stats));
router.get('/verification', requireCitizen, asyncHandler(controller.verify));
router.post('/enregistrer', asyncHandler(controller.record));

module.exports = router;
