/**
 * Model Requete — historique des requêtes des administrations.
 * Ne contient que des requêtes Prisma : aucune règle métier.
 */
const { Prisma } = require('@prisma/client');
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

/**
 * Vide la colonne donnees de toutes les requêtes qui en contiennent encore.
 * @returns {Promise<number>} Nombre de requêtes modifiées.
 */
async function clearStoredData() {
  const { count } = await prisma.requete.updateMany({
    where: { donnees: { not: Prisma.AnyNull } },
    data: { donnees: Prisma.DbNull },
  });
  return count;
}

module.exports = {
  create, findById, updateIfStatus, clearStoredData,
};
