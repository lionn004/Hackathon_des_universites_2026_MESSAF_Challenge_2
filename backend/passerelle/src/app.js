/**
 * Construction de l'application Express du service passerelle.
 *
 * Séparé de server.js pour pouvoir importer l'app dans des tests
 * sans démarrer d'écoute réseau.
 *
 * Ordre des middlewares (important) :
 *  1. lecture du JSON ;
 *  2. routes du contrat, toutes sous /api ;
 *  3. notFound pour les URL inconnues ;
 *  4. errorHandler en tout dernier, pour attraper toutes les erreurs.
 */
const express = require('express');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

app.use(express.json());
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
