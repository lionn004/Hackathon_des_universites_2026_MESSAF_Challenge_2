const { PrismaClient } = require('@prisma/client');

// Instance unique partagée par tous les models du service.
module.exports = new PrismaClient();
