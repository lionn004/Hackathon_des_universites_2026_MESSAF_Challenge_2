/**
 * Point d'entrée du service registre justice : démarre le serveur HTTP.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`[registre-justice] à l'écoute sur http://localhost:${config.port}/api`);
});
