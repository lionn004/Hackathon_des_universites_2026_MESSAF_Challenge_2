/**
 * Client Prisma du service (couche models).
 *
 * Une seule instance est créée et partagée par tous les models : créer un
 * PrismaClient par fichier ouvrirait autant de pools de connexions PostgreSQL.
 * Seuls les fichiers de src/models/ doivent importer ce module.
 */
const { PrismaClient } = require('@prisma/client');

module.exports = new PrismaClient();
