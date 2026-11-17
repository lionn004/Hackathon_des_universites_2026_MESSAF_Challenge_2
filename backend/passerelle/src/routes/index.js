/**
 * Point d'entrée des routes du service, monté sous /api dans app.js.
 */
const { Router } = require('express');
const catalogueRoutes = require('./catalogue.routes');
const requetesRoutes = require('./requetes.routes');

const router = Router();

// Route technique (hors contrat) : permet de vérifier que le service répond.
router.get('/sante', (req, res) => res.json({ statut: 'ok', service: 'passerelle' }));

router.use('/', catalogueRoutes);
router.use('/requetes', requetesRoutes);

module.exports = router;
