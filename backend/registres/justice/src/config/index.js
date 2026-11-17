/**
 * Configuration du service registre justice.
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

module.exports = {
  /** Port HTTP du service (3002 par défaut, imposé par le contrat). */
  port: Number(process.env.PORT) || 3002,
};
