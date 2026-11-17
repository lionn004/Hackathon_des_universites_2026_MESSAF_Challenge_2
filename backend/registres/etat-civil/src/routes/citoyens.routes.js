const { Router } = require('express');
const controller = require('../controllers/citoyens.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// /recherche doit être déclarée AVANT /:iue, sinon "recherche" serait pris pour un IUE.
router.get('/recherche', asyncHandler(controller.search));
router.get('/:iue', asyncHandler(controller.getCitizen));
router.get('/:iue/filiation', asyncHandler(controller.getFiliation));

module.exports = router;
