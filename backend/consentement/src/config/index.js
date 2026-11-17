/**
 * Configuration du service consentement.
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

// Sans secret, impossible de vérifier les jetons des citoyens : on refuse
// de démarrer plutôt que de tourner avec une authentification cassée.
if (!process.env.JWT_SECRET) {
  throw new Error('[consentement] Variable JWT_SECRET manquante (voir .env.example)');
}

module.exports = {
  /** Port HTTP du service (3005 par défaut, imposé par le contrat). */
  port: Number(process.env.PORT) || 3005,
  /** Secret HS256 partagé avec le BFF, qui signe les jetons des citoyens. */
  jwtSecret: process.env.JWT_SECRET,
  /** Fréquence de la tâche de rappels / expiration, en minutes. */
  remindersIntervalMinutes: Number(process.env.RAPPELS_INTERVALLE_MINUTES) || 15,
};
