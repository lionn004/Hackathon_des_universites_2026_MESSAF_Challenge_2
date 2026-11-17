/**
 * Point d'entrée du BFF espace usager : démarre le serveur HTTP.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');

app.listen(config.port, () => {
  console.log(`[espace-usager] à l'écoute sur http://localhost:${config.port}/api`);
  if (config.testInterfaceEnabled) {
    console.log('[espace-usager] interface de test ACTIVE (à désactiver en production : INTERFACE_TEST_ACTIVE=false)');
  }
});
