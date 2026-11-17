/**
 * Model Citoyen — couche d'accès aux données du registre état-civil.
 *
 * Ne contient que des requêtes Prisma sur la table Citoyen : aucune règle
 * métier (calcul de majorité, format du contrat…), qui relève de
 * services/citoyens.service.js.
 */
const prisma = require('./prisma');

/**
 * Récupère un citoyen par son IUE.
 * @param {string} iue IUE à 12 chiffres.
 * @returns {Promise<object|null>} L'enregistrement brut, ou null s'il n'existe pas.
 */
function findByIue(iue) {
  return prisma.citoyen.findUnique({ where: { iue } });
}

/**
 * Liste les enfants d'un citoyen, c'est-à-dire les citoyens dont il est
 * le père OU la mère, du plus âgé au plus jeune.
 * @param {string} parentIue IUE du parent.
 * @returns {Promise<object[]>} Enregistrements bruts des enfants (liste vide si aucun).
 */
function findChildren(parentIue) {
  return prisma.citoyen.findMany({
    where: { OR: [{ pere_iue: parentIue }, { mere_iue: parentIue }] },
    orderBy: { date_naissance: 'asc' },
  });
}

/**
 * Recherche des citoyens par critères (utilisée pour le fallback physique,
 * quand un agent doit retrouver une personne sans connaître son IUE).
 * Seuls les critères fournis sont appliqués ; nom et prénom sont comparés
 * sans tenir compte de la casse ("ouedraogo" trouve "OUEDRAOGO").
 *
 * @param {object} criteria
 * @param {string} [criteria.nom]
 * @param {string} [criteria.prenom]
 * @param {Date}   [criteria.date_naissance]
 * @returns {Promise<object[]>} Au plus 50 enregistrements, triés par nom puis prénom.
 */
function search({ nom, prenom, date_naissance }) {
  const where = {};
  if (nom) where.nom = { equals: nom, mode: 'insensitive' };
  if (prenom) where.prenom = { equals: prenom, mode: 'insensitive' };
  if (date_naissance) where.date_naissance = date_naissance;
  // Limite de 50 : une recherche trop large (ex : nom courant) ne doit pas
  // renvoyer une grande partie du registre.
  return prisma.citoyen.findMany({ where, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }], take: 50 });
}

module.exports = { findByIue, findChildren, search };
