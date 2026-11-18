/**
 * Point d'entrée du BFF espace usager : démarre le serveur HTTP.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');
const demandesService = require('./services/demandes.service');

/**
 * Reprise automatique des demandes en attente d'un registre ou d'une donnée à numériser
 * (docs/conception-interoperabilite.md, § 9 et § 10). Une passe à la fois.
 */
let repriseEnCours = false;
async function reprendreDemandes() {
  if (repriseEnCours) return;
  repriseEnCours = true;
  try {
    const { relancees, terminees } = await demandesService.resumePending();
    if (terminees) console.log(`[espace-usager] reprise automatique : ${terminees} demande(s) complétée(s) sur ${relancees} relancée(s)`);
  } catch (err) {
    console.warn(`[espace-usager] reprise automatique impossible : ${err.message}`);
  } finally {
    repriseEnCours = false;
  }
}

app.listen(config.port, () => {
  console.log(`[espace-usager] à l'écoute sur http://localhost:${config.port}/api`);
  if (config.testInterfaceEnabled) {
    console.log('[espace-usager] interface de test ACTIVE (à désactiver en production : INTERFACE_TEST_ACTIVE=false)');
  }
  setInterval(reprendreDemandes, config.resumeIntervalMs).unref();
});
