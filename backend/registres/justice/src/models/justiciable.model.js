/**
 * Model Justiciable — couche d'accès aux données du registre justice.
 *
 * Ne contient que des requêtes Prisma : aucune règle métier (calcul de
 * casier_vierge, format du contrat…), qui relève de services/justice.service.js.
 */
const prisma = require('./prisma');

/**
 * Récupère une personne et ses données de nationalité, sans son casier.
 * @param {string} iue IUE à 12 chiffres.
 * @returns {Promise<object|null>} L'enregistrement brut, ou null s'il n'existe pas.
 */
function findByIue(iue) {
  return prisma.justiciable.findUnique({ where: { iue } });
}

/**
 * Récupère une personne avec toutes ses condamnations, de la plus ancienne
 * à la plus récente.
 * @param {string} iue IUE à 12 chiffres.
 * @returns {Promise<object|null>} Enregistrement brut avec `condamnations`, ou null.
 */
function findWithCondamnations(iue) {
  return prisma.justiciable.findUnique({
    where: { iue },
    include: { condamnations: { orderBy: { date: 'asc' } } },
  });
}

module.exports = { findByIue, findWithCondamnations };
