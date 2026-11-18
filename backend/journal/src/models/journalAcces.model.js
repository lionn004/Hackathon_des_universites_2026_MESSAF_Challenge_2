/**
 * Model JournalAcces — couche d'accès aux données du journal.
 *
 * Ne contient que des requêtes Prisma : aucune règle métier (validation,
 * format du contrat, calcul des périodes, calcul des empreintes…), qui relève des
 * services (journal.service.js, integrite.service.js).
 * Volontairement, aucune fonction de modification du contenu ni de suppression :
 * le journal est une piste d'audit en ajout seul. La seule écriture sur une entrée
 * existante est son scellement (rang et empreintes), une fois, si elle n'est pas encore
 * chaînée (entrées antérieures au chaînage).
 */
const prisma = require('./prisma');

/**
 * Clé du verrou PostgreSQL qui sérialise les écritures de la chaîne : deux accès
 * enregistrés en même temps ne doivent jamais partir de la même entrée précédente
 * (la chaîne aurait deux branches). Verrou de transaction : relâché à sa fin.
 */
const CHAIN_LOCK_KEY = 4363061; // constante arbitraire, propre au journal

/**
 * Prend le verrou de la chaîne dans une transaction.
 * @param {object} tx Client Prisma de la transaction.
 */
async function lockChain(tx) {
  await tx.$queryRawUnsafe(`SELECT 1 AS verrou FROM pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`);
}

/**
 * Dernière entrée chaînée (rang le plus élevé), dans une transaction.
 * @param {object} tx
 * @returns {Promise<object|null>}
 */
function lastChained(tx) {
  // Filtre explicite : en PostgreSQL, un tri décroissant place les NULL en premier.
  return tx.journalAcces.findFirst({ where: { rang: { not: null } }, orderBy: { rang: 'desc' } });
}

/**
 * Ajoute une entrée en bout de chaîne, sous verrou.
 * @param {(derniere: object|null) => object} buildEntry Construit l'entrée complète
 *        (rang et empreintes compris) à partir de la dernière entrée chaînée.
 * @returns {Promise<object>} L'entrée créée.
 */
function appendToChain(buildEntry) {
  return prisma.$transaction(async (tx) => {
    await lockChain(tx);
    const last = await lastChained(tx);
    return tx.journalAcces.create({ data: buildEntry(last) });
  });
}

/**
 * Scelle, dans l'ordre chronologique, les entrées qui ne sont pas encore chaînées.
 * @param {(entree: object, derniere: object|null) => object} buildSeal Champs de
 *        scellement (rang, empreinte_precedente, empreinte) d'une entrée.
 * @returns {Promise<number>} Nombre d'entrées scellées.
 */
function sealPending(buildSeal) {
  return prisma.$transaction(async (tx) => {
    await lockChain(tx);
    let last = await lastChained(tx);
    const pending = await tx.journalAcces.findMany({ where: { rang: null }, orderBy: [{ date_acces: 'asc' }, { id: 'asc' }] });
    for (const entry of pending) {
      last = await tx.journalAcces.update({ where: { id: entry.id }, data: buildSeal(entry, last) });
    }
    return pending.length;
  }, { timeout: 60000 });
}

/**
 * Toute la chaîne, dans l'ordre des rangs.
 * @returns {Promise<object[]>}
 */
function findChain() {
  return prisma.journalAcces.findMany({ where: { rang: { not: null } }, orderBy: { rang: 'asc' } });
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

module.exports = { appendToChain, sealPending, findChain, findPage, count, countByAdministration };
