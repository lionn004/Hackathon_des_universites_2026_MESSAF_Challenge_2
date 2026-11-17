/**
 * Model Requete — historique des requêtes des administrations.
 * Ne contient que des requêtes Prisma : aucune règle métier.
 */
const prisma = require('./prisma');

/**
 * Enregistre une requête.
 * @param {object} data Champs de la table Requete (id fourni par le service).
 * @returns {Promise<object>}
 */
function create(data) {
  return prisma.requete.create({ data });
}

/**
 * Récupère une requête.
 * @param {string} id UUID.
 * @returns {Promise<object|null>}
 */
function findById(id) {
  return prisma.requete.findUnique({ where: { id } });
}

/**
 * Met à jour une requête.
 * @param {string} id UUID.
 * @param {object} data Champs à modifier.
 * @returns {Promise<object>} Requête mise à jour.
 */
function update(id, data) {
  return prisma.requete.update({ where: { id }, data });
}

/**
 * Change le statut UNIQUEMENT si la requête est encore dans le statut attendu.
 * La condition est vérifiée par la base : quand deux consultations simultanées
 * voient le consentement accepté, une seule « gagne » et transmet les données
 * (donc une seule entrée de journal).
 *
 * @param {string} id UUID.
 * @param {string} expectedStatus Statut actuel attendu.
 * @param {object} data Champs à modifier (dont le nouveau statut).
 * @returns {Promise<boolean>} true si la modification a eu lieu.
 */
async function updateIfStatus(id, expectedStatus, data) {
  const { count } = await prisma.requete.updateMany({ where: { id, statut: expectedStatus }, data });
  return count === 1;
}

module.exports = { create, findById, update, updateIfStatus };
