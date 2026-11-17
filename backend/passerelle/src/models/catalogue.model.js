/**
 * Model Catalogue — accès aux données du catalogue de la passerelle :
 * administrations, cloisonnement par mission, démarches, types de pièces et prérequis.
 *
 * Ne contient que des requêtes Prisma : aucune règle métier.
 */
const prisma = require('./prisma');

/**
 * Récupère une administration.
 * @param {string} id UUID.
 * @returns {Promise<object|null>}
 */
function findAdministration(id) {
  return prisma.administration.findUnique({ where: { id } });
}

/**
 * Liste toutes les administrations, triées par nom.
 * @returns {Promise<object[]>}
 */
function findAllAdministrations() {
  return prisma.administration.findMany({ orderBy: { nom: 'asc' } });
}

/**
 * Règles de cloisonnement d'un domaine de mission (une ligne par registre accessible).
 * @param {string} domaine Ex : "education".
 * @returns {Promise<object[]>}
 */
function findMissionAccess(domaine) {
  return prisma.accesMission.findMany({ where: { domaine_mission: domaine } });
}

/** Inclusion commune : administration cible et pièces prérequises d'une démarche. */
const DEMARCHE_INCLUDE = {
  administration: true,
  pieces: { orderBy: { type_piece_id: 'asc' } },
};

/**
 * Récupère une démarche avec son administration cible et ses pièces.
 * @param {string} id Ex : "inscription-universite".
 * @returns {Promise<object|null>}
 */
function findDemarche(id) {
  return prisma.demarche.findUnique({ where: { id }, include: DEMARCHE_INCLUDE });
}

/**
 * Liste toutes les démarches, triées par nom.
 * @returns {Promise<object[]>}
 */
function findAllDemarches() {
  return prisma.demarche.findMany({ include: DEMARCHE_INCLUDE, orderBy: { nom: 'asc' } });
}

/**
 * Liste tous les types de pièces, triés par nom.
 * @returns {Promise<object[]>}
 */
function findAllTypesPieces() {
  return prisma.typePiece.findMany({ orderBy: { nom: 'asc' } });
}

/**
 * Récupère un type de pièce, sans ses prérequis.
 * @param {string} id Ex : "casier-judiciaire".
 * @returns {Promise<object|null>}
 */
function findTypePiece(id) {
  return prisma.typePiece.findUnique({ where: { id } });
}

/**
 * Récupère un type de pièce avec ses prérequis DIRECTS.
 * @param {string} id Ex : "casier-judiciaire".
 * @returns {Promise<object|null>} TypePiece + prerequis[] ({ prerequis_id, proprietaire }).
 */
function findTypePieceWithPrerequis(id) {
  return prisma.typePiece.findUnique({
    where: { id },
    include: { prerequis: { orderBy: [{ prerequis_id: 'asc' }, { proprietaire: 'asc' }] } },
  });
}

module.exports = {
  findAdministration,
  findAllAdministrations,
  findMissionAccess,
  findDemarche,
  findAllDemarches,
  findAllTypesPieces,
  findTypePiece,
  findTypePieceWithPrerequis,
};
