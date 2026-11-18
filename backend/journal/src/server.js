/**
 * Point d'entrée du service journal : scelle les entrées antérieures au chaînage, puis
 * démarre le serveur HTTP.
 * Lancement : `npm start` (ou `npm run dev` pour le rechargement automatique).
 */
const app = require('./app');
const config = require('./config');
const integriteService = require('./services/integrite.service');

/**
 * Scelle d'abord les entrées pas encore chaînées (données de démo, base d'avant le
 * chaînage) : aucune écriture ne peut arriver avant, le serveur n'écoute pas encore.
 */
async function main() {
  const scellees = await integriteService.scellerEntreesAnterieures();
  if (scellees > 0) console.log(`[journal] ${scellees} entrée(s) antérieure(s) scellée(s) dans la chaîne des empreintes`);
  app.listen(config.port, () => {
    console.log(`[journal] à l'écoute sur http://localhost:${config.port}/api`);
  });
}

main().catch((err) => {
  console.error('[journal] démarrage impossible :', err);
  process.exit(1);
});
