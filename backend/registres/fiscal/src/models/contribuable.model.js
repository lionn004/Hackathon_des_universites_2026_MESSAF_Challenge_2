/**
 * Model Contribuable — couche d'accès aux données du registre fiscal.
 *
 * Ne contient que des requêtes Prisma : aucune règle métier (calcul de
 * en_regle, format du contrat…), qui relève de services/fiscal.service.js.
 */
const prisma = require('./prisma');

/**
 * Récupère un contribuable par son IUE.
 * @param {string} iue IUE à 12 chiffres.
 * @returns {Promise<object|null>} L'enregistrement brut, ou null s'il n'existe pas.
 */
function findByIue(iue) {
  return prisma.contribuable.findUnique({ where: { iue } });
}

module.exports = { findByIue };
