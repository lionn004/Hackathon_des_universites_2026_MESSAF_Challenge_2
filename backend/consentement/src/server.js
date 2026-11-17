/**
 * Point d'entrée du service consentement : démarre le serveur HTTP et la
 * tâche périodique des rappels / expirations.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');
const rappelsService = require('./services/rappels.service');

/** Exécute un passage de la tâche ; une erreur est journalisée sans arrêter le service. */
async function runReminders() {
  try {
    const { expirees, rappels } = await rappelsService.runOnce();
    if (expirees || rappels) console.log(`[consentement] tâche rappels : ${expirees} expirée(s), ${rappels} rappel(s)`);
  } catch (err) {
    console.error('[consentement] échec de la tâche rappels', err);
  }
}

app.listen(config.port, () => {
  console.log(`[consentement] à l'écoute sur http://localhost:${config.port}/api`);
  runReminders();
  // unref() : ce minuteur n'empêche pas le processus de s'arrêter proprement.
  setInterval(runReminders, config.remindersIntervalMinutes * 60 * 1000).unref();
});
