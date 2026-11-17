/**
 * Model Demande — demandes de pièces des citoyens.
 * Ne contient que des requêtes Prisma : aucune règle métier.
 */
const prisma = require('./prisma');

/** Enregistre une demande. */
function create(data) {
  return prisma.demande.create({ data });
}

/** Récupère une demande par identifiant. */
function findById(id) {
  return prisma.demande.findUnique({ where: { id } });
}

/**
 * Une page de demandes, des plus récentes aux plus anciennes, avec le total.
 * @param {object} where Filtre Prisma.
 * @param {number} skip
 * @param {number} take
 * @returns {Promise<{items: object[], total: number}>}
 */
async function findPage(where, skip, take) {
  const [items, total] = await prisma.$transaction([
    prisma.demande.findMany({ where, orderBy: { date_creation: 'desc' }, skip, take }),
    prisma.demande.count({ where }),
  ]);
  return { items, total };
}

/** Compte les demandes correspondant à un filtre. */
function count(where) {
  return prisma.demande.count({ where });
}

module.exports = { create, findById, findPage, count };
