/**
 * Configuration du BFF espace usager.
 *
 * Centralise la lecture des variables d'environnement : aucun autre fichier
 * ne doit lire process.env directement.
 * En local, les valeurs viennent du fichier .env (voir .env.example) ;
 * dans Docker, elles sont fournies par docker-compose.yml.
 *
 * Note : DATABASE_URL n'apparaît pas ici car elle est lue directement
 * par Prisma (voir prisma/schema.prisma).
 */
require('dotenv').config();

// Sans ces secrets, l'authentification serait cassée : on refuse de démarrer.
for (const name of ['JWT_SECRET', 'CLE_SERVICE_INTERNE']) {
  if (!process.env[name]) throw new Error(`[espace-usager] Variable ${name} manquante (voir .env.example)`);
}

module.exports = {
  /** Port HTTP du service (3000 par défaut, imposé par le contrat). */
  port: Number(process.env.PORT) || 3000,
  /** Secret HS256 partagé avec tous les services. */
  jwtSecret: process.env.JWT_SECRET,
  /** Durée de validité du jeton de connexion d'un citoyen (format jsonwebtoken, ex : "8h"). */
  jwtDuration: process.env.JWT_DUREE || '8h',
  /** Clé partagée des routes internes (en-tête X-Cle-Service). */
  serviceKey: process.env.CLE_SERVICE_INTERNE,
  /** Origines CORS autorisées ("*" = toutes, pratique en développement). */
  corsOrigins: (process.env.CORS_ORIGINES || '*').split(',').map((o) => o.trim()),
  /** Interface de test : la désactiver en production (elle peut se faire passer pour une administration). */
  testInterfaceEnabled: (process.env.INTERFACE_TEST_ACTIVE || 'true') === 'true',
  /** Délai maximal d'attente d'un autre service (ms). */
  callTimeoutMs: Number(process.env.DELAI_APPEL_MS) || 8000,
  /** Intervalle de la reprise automatique des demandes en attente (ms). */
  resumeIntervalMs: Number(process.env.REPRISE_INTERVALLE_MS) || 30000,
  /** Adresses des autres services (préfixe /api inclus). */
  urls: {
    passerelle: process.env.PASSERELLE_URL || 'http://localhost:3004/api',
    consentement: process.env.CONSENTEMENT_URL || 'http://localhost:3005/api',
    journal: process.env.JOURNAL_URL || 'http://localhost:3006/api',
  },
};
