const { Router } = require('express');
const citoyensRoutes = require('./citoyens.routes');

const router = Router();

router.get('/sante', (req, res) => res.json({ statut: 'ok', service: 'registre-etat-civil' }));
router.use('/citoyens', citoyensRoutes);

module.exports = router;
