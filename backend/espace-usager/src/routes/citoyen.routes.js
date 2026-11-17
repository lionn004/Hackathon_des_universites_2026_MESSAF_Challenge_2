/**
 * Routes de l'espace personnel — toutes protégées par le jeton citoyen.
 * Contrat : docs/openapi-espace-usager.yaml
 */
const { Router } = require('express');
const controller = require('../controllers/citoyen.controller');
const { requireCitizen } = require('../middlewares/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/profil', requireCitizen, asyncHandler(controller.getProfile));

router.get('/enfants', requireCitizen, asyncHandler(controller.listChildren));
router.post('/enfants/:iue/transfert', requireCitizen, asyncHandler(controller.transferChild));

router.get('/demandes', requireCitizen, asyncHandler(controller.listDemandes));
router.post('/demandes', requireCitizen, asyncHandler(controller.createDemande));
router.get('/demandes/:id', requireCitizen, asyncHandler(controller.getDemande));
router.get('/demandes/:id/contenu', requireCitizen, asyncHandler(controller.getDemandeContent));

router.get('/consentements', requireCitizen, asyncHandler(controller.listConsents));
router.get('/consentements/:id', requireCitizen, asyncHandler(controller.getConsent));
router.put('/consentements/:id', requireCitizen, asyncHandler(controller.answerConsent));

router.get('/journal', requireCitizen, asyncHandler(controller.listJournal));

router.get('/tableau-de-bord', requireCitizen, asyncHandler(controller.getDashboard));

module.exports = router;
