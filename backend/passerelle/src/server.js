/**
 * Point d'entrée du service passerelle : démarre le serveur HTTP.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');
const diagnosticService = require('./services/diagnostic.service');
const requetesService = require('./services/requetes.service');

app.listen(config.port, () => {
  console.log(`[passerelle] à l'écoute sur http://localhost:${config.port}/api`);
  // Remise unique : efface les copies de données laissées par une version précédente.
  requetesService.forgetStoredData()
    .then((count) => {
      if (count > 0) console.log(`[passerelle] ${count} copie(s) de données transmises effacée(s) (remise unique)`);
    })
    .catch((e) => {
      console.warn(`[passerelle] effacement des anciennes copies impossible : ${e.message}`);
    });
  // En tâche de fond : signale dans les logs une URL de registre mal configurée.
  diagnosticService.logRegistriesStatus().catch((e) => {
    console.warn(`[passerelle] diagnostic des registres impossible : ${e.message}`);
  });
});
