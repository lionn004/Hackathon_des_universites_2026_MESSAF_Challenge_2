/**
 * Routes des statistiques : publiques (sans jeton), comme des données ouvertes. Elles ne
 * renvoient que des nombres agrégés, aucune donnée personnelle (ni IUE, ni nom).
 * Contrat : docs/openapi-espace-usager.yaml
 */
const { Router } = require('express');
const controller = require('../controllers/statistiques.controller');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// Pilotage de la numérisation : où une donnée numérique manquante bloque des démarches.
router.get('/numerisation', asyncHandler(controller.numerisation));

module.exports = router;
