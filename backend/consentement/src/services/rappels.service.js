/**
 * Service Rappels — tâche périodique du cycle de vie des demandes.
 *
 * À chaque passage (toutes les RAPPELS_INTERVALLE_MINUTES, voir server.js) :
 *  1. les demandes en attente depuis plus de 30 jours passent en « expire » ;
 *  2. un rappel SMS part pour les demandes sans réponse depuis 24 h ;
 *  3. un second rappel part pour celles sans réponse depuis 72 h.
 * Chaque rappel n'est envoyé qu'une fois (date d'envoi enregistrée).
 */
const consentementModel = require('../models/consentement.model');
const notificationService = require('./notification.service');

const ONE_HOUR_MS = 60 * 60 * 1000;

/** Rappels à envoyer : délai depuis la création → colonne qui mémorise l'envoi. */
const REMINDERS = [
  { delay: '24h', hours: 24, field: 'rappel_24h_le' },
  { delay: '72h', hours: 72, field: 'rappel_72h_le' },
];

/**
 * Exécute un passage complet de la tâche.
 * @param {Date} [now=new Date()] Instant de référence (paramétrable pour les tests).
 * @returns {Promise<{expirees: number, rappels: number}>} Ce qui a été fait, pour les logs.
 */
async function runOnce(now = new Date()) {
  // L'expiration passe en premier : une demande expirée ne reçoit plus de rappel.
  const expired = await consentementModel.expireOverdue(now);

  let reminders = 0;
  for (const { delay, hours, field } of REMINDERS) {
    const due = await consentementModel.findPendingWithoutReminder(field, new Date(now.getTime() - hours * ONE_HOUR_MS));
    for (const consent of due) {
      notificationService.sendReminder(consent, delay);
      await consentementModel.markReminderSent(consent.id, field, now);
      reminders += 1;
    }
  }
  return { expirees: expired, rappels: reminders };
}

module.exports = { runOnce };
