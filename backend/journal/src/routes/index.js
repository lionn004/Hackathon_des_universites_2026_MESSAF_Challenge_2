/**
 * Point d'entrée des routes du service, monté sous /api dans app.js.
 * Chaque ressource du contrat a son propre fichier *.routes.js.
 */
const { Router } = require('express');
const journalRoutes = require('./journal.routes');

const router = Router();

// Route technique (hors contrat) : permet de vérifier que le service répond,
// par exemple depuis docker compose ou la passerelle.
router.get('/sante', (req, res) => res.json({ statut: 'ok', service: 'journal' }));

router.use('/journal', journalRoutes);

module.exports = router;
