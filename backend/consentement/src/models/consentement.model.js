/**
 * Model Consentement — couche d'accès aux données des demandes de consentement.
 *
 * Ne contient que des requêtes Prisma : aucune règle métier (droits d'accès,
 * délais, validation…), qui relève de services/consentements.service.js.
 */
const prisma = require('./prisma');

/**
 * Crée une demande de consentement.
 * @param {object} data Champs de la table Consentement.
 * @returns {Promise<object>} La demande créée.
 */
function create(data) {
  return prisma.consentement.create({ data });
}

/**
 * Récupère une demande par son identifiant.
 * @param {string} id UUID de la demande.
 * @returns {Promise<object|null>}
 */
function findById(id) {
  return prisma.consentement.findUnique({ where: { id } });
}

/**
 * Liste une page de demandes, des plus récentes aux plus anciennes, avec le total.
 * Les deux requêtes passent dans une transaction pour que le total
 * corresponde exactement à la page lue.
 *
 * @param {object} where Filtre Prisma construit par le service.
 * @param {number} skip Nombre de demandes à sauter.
 * @param {number} take Nombre de demandes à renvoyer.
 * @returns {Promise<{items: object[], total: number}>}
 */
async function findPage(where, skip, take) {
  const [items, total] = await prisma.$transaction([
    prisma.consentement.findMany({ where, orderBy: { date_creation: 'desc' }, skip, take }),
    prisma.consentement.count({ where }),
  ]);
  return { items, total };
}

/**
 * Compte les demandes correspondant à un filtre.
 * @param {object} where Filtre Prisma.
 * @returns {Promise<number>}
 */
function count(where) {
  return prisma.consentement.count({ where });
}

/**
 * Enregistre la réponse du citoyen, UNIQUEMENT si la demande est encore
 * en attente et non expirée. La condition est vérifiée par la base dans la
 * même requête : deux réponses simultanées ne peuvent pas toutes deux réussir.
 *
 * @param {string} id UUID de la demande.
 * @param {object} data { statut, date_reponse, decideur_iue }.
 * @param {Date} now Instant de référence pour l'expiration.
 * @returns {Promise<number>} 1 si la réponse a été enregistrée, 0 sinon.
 */
async function answerIfPending(id, data, now) {
  const { count: updated } = await prisma.consentement.updateMany({
    where: { id, statut: 'en_attente', date_expiration: { gt: now } },
    data,
  });
  return updated;
}

/**
 * Passe en « expire » toutes les demandes en attente dont la date limite est dépassée.
 * @param {Date} now Instant de référence.
 * @returns {Promise<number>} Nombre de demandes expirées.
 */
async function expireOverdue(now) {
  const { count: expired } = await prisma.consentement.updateMany({
    where: { statut: 'en_attente', date_expiration: { lte: now } },
    data: { statut: 'expire' },
  });
  return expired;
}

/**
 * Demandes en attente créées avant une date et dont un rappel n'est pas encore parti.
 * @param {'rappel_24h_le'|'rappel_72h_le'} reminderField Colonne du rappel concerné.
 * @param {Date} createdBefore Seules les demandes créées avant cette date sont renvoyées.
 * @returns {Promise<object[]>}
 */
function findPendingWithoutReminder(reminderField, createdBefore) {
  return prisma.consentement.findMany({
    where: { statut: 'en_attente', date_creation: { lte: createdBefore }, [reminderField]: null },
  });
}

/**
 * Marque un rappel comme envoyé.
 * @param {string} id UUID de la demande.
 * @param {'rappel_24h_le'|'rappel_72h_le'} reminderField Colonne du rappel.
 * @param {Date} sentAt Date d'envoi.
 */
function markReminderSent(id, reminderField, sentAt) {
  return prisma.consentement.update({ where: { id }, data: { [reminderField]: sentAt } });
}

module.exports = {
  create, findById, findPage, count, answerIfPending, expireOverdue, findPendingWithoutReminder, markReminderSent,
};
