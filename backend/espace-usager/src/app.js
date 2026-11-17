/**
 * Construction de l'application Express du BFF espace usager.
 *
 * Séparé de server.js pour pouvoir importer l'app dans des tests
 * sans démarrer d'écoute réseau.
 *
 * Ordre des middlewares (important) :
 *  1. CORS : le frontend est servi depuis une autre origine que le BFF ;
 *  2. lecture du JSON (taille limitée) ;
 *  3. routes du contrat, toutes sous /api ;
 *  4. notFound pour les URL inconnues ;
 *  5. errorHandler en tout dernier, pour attraper toutes les erreurs.
 */
const express = require('express');
const cors = require('cors');
const config = require('./config');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

const app = express();

// "*" autorise toutes les origines (développement). En production, lister
// l'adresse du frontend dans CORS_ORIGINES. Aucun cookie n'est utilisé :
// l'authentification passe par l'en-tête Authorization.
app.use(cors({ origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins }));
app.use(express.json({ limit: '100kb' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
