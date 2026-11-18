/**
 * Point d'entrée du service passerelle : démarre le serveur HTTP.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');
const diagnosticService = require('./services/diagnostic.service');

app.listen(config.port, () => {
  console.log(`[passerelle] à l'écoute sur http://localhost:${config.port}/api`);
  // En tâche de fond : signale dans les logs une URL de registre mal configurée.
  diagnosticService.logRegistriesStatus().catch((e) => {
    console.warn(`[passerelle] diagnostic des registres impossible : ${e.message}`);
  });
});
