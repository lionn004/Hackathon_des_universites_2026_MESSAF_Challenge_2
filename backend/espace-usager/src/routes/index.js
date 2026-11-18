/**
 * Point d'entrée des routes du BFF, monté sous /api dans app.js.
 */
const { Router } = require('express');
const authRoutes = require('./auth.routes');
const catalogueRoutes = require('./catalogue.routes');
const citoyenRoutes = require('./citoyen.routes');
const testRoutes = require('./test.routes');
const interneRoutes = require('./interne.routes');
const statistiquesRoutes = require('./statistiques.routes');

const router = Router();

// Route technique (hors contrat) : permet de vérifier que le service répond.
router.get('/sante', (req, res) => res.json({ statut: 'ok', service: 'espace-usager' }));

router.use('/auth', authRoutes);
router.use('/', catalogueRoutes);
router.use('/test', testRoutes);
router.use('/interne', interneRoutes);
router.use('/statistiques', statistiquesRoutes);
router.use('/', citoyenRoutes);

module.exports = router;
