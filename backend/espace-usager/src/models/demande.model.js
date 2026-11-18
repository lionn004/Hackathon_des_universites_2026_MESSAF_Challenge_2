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

/**
 * Demandes à relancer par la reprise automatique : en attente d'un registre (« en_cours »)
 * ou en attente d'une donnée à numériser (« fallback_physique »), les plus anciennes d'abord.
 * @param {number} take Nombre maximal par passage.
 * @returns {Promise<object[]>}
 */
function findToResume(take) {
  return prisma.demande.findMany({
    where: { statut: { in: ['en_cours', 'fallback_physique'] } },
    orderBy: { date_creation: 'asc' },
    take,
  });
}

/**
 * Met à jour une demande.
 * @param {string} id
 * @param {object} data Champs à modifier.
 * @returns {Promise<object>}
 */
function update(id, data) {
  return prisma.demande.update({ where: { id }, data });
}

/**
 * Nombre de demandes par statut (statistiques de numérisation).
 * @returns {Promise<Array<{statut: string, _count: {_all: number}}>>}
 */
function countByStatut() {
  return prisma.demande.groupBy({ by: ['statut'], _count: { _all: true } });
}

/**
 * Demandes bloquées par une donnée numérique manquante : seulement ce qu'il faut pour les
 * statistiques (type de pièce, titulaire pour compter les personnes distinctes, cascade).
 * @returns {Promise<Array<{type_piece_id: string, titulaire_iue: string, cascade: object[]}>>}
 */
function findAwaitingDigitization() {
  return prisma.demande.findMany({
    where: { statut: 'fallback_physique' },
    select: { type_piece_id: true, titulaire_iue: true, cascade: true },
  });
}

module.exports = {
  create, findById, findPage, count, findToResume, update, countByStatut, findAwaitingDigitization,
};
