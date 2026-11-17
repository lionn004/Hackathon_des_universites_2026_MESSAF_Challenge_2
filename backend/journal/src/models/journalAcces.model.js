/**
 * Model JournalAcces — couche d'accès aux données du journal.
 *
 * Ne contient que des requêtes Prisma : aucune règle métier (validation,
 * format du contrat, calcul des périodes…), qui relève de services/journal.service.js.
 * Volontairement, aucune fonction de modification ni de suppression :
 * le journal est une piste d'audit en ajout seul.
 */
const prisma = require('./prisma');

/**
 * Enregistre un nouvel accès.
 * @param {object} data Champs de la table JournalAcces (sans id ni date_acces, générés).
 * @returns {Promise<object>} L'entrée créée.
 */
function create(data) {
  return prisma.journalAcces.create({ data });
}

/**
 * Liste une page d'entrées, des plus récentes aux plus anciennes, avec le total.
 * Les deux requêtes passent dans une transaction pour que le total
 * corresponde exactement à la page lue.
 *
 * @param {object} where Filtre Prisma construit par le service.
 * @param {number} skip Nombre d'entrées à sauter.
 * @param {number} take Nombre d'entrées à renvoyer.
 * @returns {Promise<{entries: object[], total: number}>}
 */
async function findPage(where, skip, take) {
  const [entries, total] = await prisma.$transaction([
    prisma.journalAcces.findMany({ where, orderBy: { date_acces: 'desc' }, skip, take }),
    prisma.journalAcces.count({ where }),
  ]);
  return { entries, total };
}

/**
 * Compte les entrées correspondant à un filtre.
 * @param {object} where Filtre Prisma.
 * @returns {Promise<number>}
 */
function count(where) {
  return prisma.journalAcces.count({ where });
}

/**
 * Nombre d'accès par nom d'administration, du plus grand au plus petit.
 * @param {object} where Filtre Prisma.
 * @returns {Promise<Array<{administration_nom: string|null, _count: {_all: number}}>>}
 */
function countByAdministration(where) {
  return prisma.journalAcces.groupBy({
    by: ['administration_nom'],
    where,
    _count: { _all: true },
    orderBy: { _count: { administration_nom: 'desc' } },
  });
}

module.exports = { create, findPage, count, countByAdministration };
