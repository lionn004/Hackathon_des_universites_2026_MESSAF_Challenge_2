/**
 * Model ReinitialisationMotDePasse — demandes de code SMS en cours.
 * Ne contient que des requêtes Prisma : aucune règle métier.
 */
const prisma = require('./prisma');

/** Enregistre une demande (jeton et code déjà hachés par le service). */
function create(data) {
  return prisma.reinitialisationMotDePasse.create({ data });
}

/** Retrouve une demande par l'empreinte de son jeton temporaire. */
function findByTokenHash(tokenHash) {
  return prisma.reinitialisationMotDePasse.findUnique({ where: { token_hash: tokenHash } });
}

/** Compte un essai de code faux. */
function incrementAttempts(id) {
  return prisma.reinitialisationMotDePasse.update({ where: { id }, data: { tentatives: { increment: 1 } } });
}

/**
 * Change le mot de passe et marque la demande comme utilisée, ensemble.
 * La condition `utilise_le: null` empêche de réutiliser deux fois le même code
 * (deux envois simultanés : un seul réussit).
 *
 * @param {string} resetId
 * @param {string} citizenId
 * @param {string} passwordHash
 * @returns {Promise<boolean>} true si le changement a eu lieu.
 */
function consumeAndSetPassword(resetId, citizenId, passwordHash) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.reinitialisationMotDePasse.updateMany({
      where: { id: resetId, utilise_le: null },
      data: { utilise_le: new Date() },
    });
    if (count === 0) return false;
    await tx.citoyen.update({ where: { id: citizenId }, data: { mot_de_passe: passwordHash } });
    return true;
  });
}

module.exports = { create, findByTokenHash, incrementAttempts, consumeAndSetPassword };
