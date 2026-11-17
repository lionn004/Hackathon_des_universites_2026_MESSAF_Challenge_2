/**
 * Model Citoyen — comptes des citoyens (mot de passe, téléphone, tutelle).
 * Ne contient que des requêtes Prisma : aucune règle métier.
 */
const prisma = require('./prisma');

/** Récupère un compte par IUE (null s'il n'existe pas). */
function findByIue(iue) {
  return prisma.citoyen.findUnique({ where: { iue } });
}

/** Récupère un compte par identifiant interne. */
function findById(id) {
  return prisma.citoyen.findUnique({ where: { id } });
}

/**
 * Liste des IUE ayant déjà un compte, parmi une liste donnée.
 * @param {string[]} iues
 * @returns {Promise<string[]>}
 */
async function findExistingIues(iues) {
  const rows = await prisma.citoyen.findMany({ where: { iue: { in: iues } }, select: { iue: true } });
  return rows.map((r) => r.iue);
}

/** Comptes dont ce citoyen est le tuteur, du plus ancien au plus récent. */
function findChildren(tutorId) {
  return prisma.citoyen.findMany({ where: { tuteur_id: tutorId }, orderBy: { date_inscription: 'asc' } });
}

/**
 * Crée un compte adulte et, dans la même transaction, les comptes de ses
 * enfants mineurs détectés (rattachés à lui comme tuteur).
 *
 * @param {object} adult { iue, mot_de_passe (hash), telephone }.
 * @param {string[]} childIues IUE des enfants à rattacher (sans compte existant).
 * @returns {Promise<object>} Compte adulte créé.
 */
function createWithChildren(adult, childIues) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.citoyen.create({ data: adult });
    for (const iue of childIues) {
      await tx.citoyen.create({ data: { iue, telephone: adult.telephone, tuteur_id: created.id, mot_de_passe: null } });
    }
    return created;
  });
}

/**
 * Détache un compte enfant de son tuteur (transfert de contrôle),
 * UNIQUEMENT s'il est encore rattaché à ce tuteur.
 * @param {string} childId
 * @param {string} tutorId
 * @returns {Promise<boolean>} true si le transfert a eu lieu.
 */
async function detachFromTutor(childId, tutorId) {
  const { count } = await prisma.citoyen.updateMany({
    where: { id: childId, tuteur_id: tutorId },
    data: { tuteur_id: null, mot_de_passe: null },
  });
  return count === 1;
}

module.exports = {
  findByIue, findById, findExistingIues, findChildren, createWithChildren, detachFromTutor,
};
