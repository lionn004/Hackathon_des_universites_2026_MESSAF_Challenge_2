/**
 * Model ChampsDemarche — règles de minimisation (champs autorisés par démarche et registre).
 *
 * Ne contient que des requêtes Prisma ; l'application du filtre relève de
 * services/minimisation.service.js.
 */
const prisma = require('./prisma');

/**
 * Récupère la règle d'une démarche pour un registre donné.
 * @param {string} demarcheId Ex : "inscription-universite".
 * @param {string} registre Ex : "etat-civil".
 * @returns {Promise<object|null>} { demarche_id, registre, champs } ou null si aucune règle.
 */
function findRule(demarcheId, registre) {
  return prisma.champsDemarche.findUnique({
    where: { demarche_id_registre: { demarche_id: demarcheId, registre } },
  });
}

/**
 * Indique si la démarche possède au moins une règle (tous registres confondus).
 * @param {string} demarcheId
 * @returns {Promise<boolean>}
 */
async function demarcheExists(demarcheId) {
  const rule = await prisma.champsDemarche.findFirst({ where: { demarche_id: demarcheId }, select: { id: true } });
  return rule !== null;
}

module.exports = { findRule, demarcheExists };
