/**
 * Service Notification — prévient le citoyen d'une demande de consentement.
 *
 * Deux canaux prévus par la spécification :
 *  - notification plateforme : la demande en attente apparaît d'elle-même dans
 *    l'espace usager (compteur du tableau de bord), rien à envoyer ici ;
 *  - SMS : SIMULÉ pour le hackathon. Le numéro de téléphone est une donnée de
 *    compte détenue par le BFF ; ce service ne le connaît pas. Les SMS sont donc
 *    écrits dans les logs du conteneur (`docker compose logs consentement`).
 *    Pour brancher une vraie passerelle SMS, seul ce fichier est à modifier.
 */

/**
 * Formate le nom de l'administration pour un message, même s'il est inconnu.
 * @param {object} consent Enregistrement Consentement.
 * @returns {string}
 */
function adminLabel(consent) {
  return consent.administration_nom || `L'administration ${consent.administration_id}`;
}

/**
 * Écrit un SMS simulé dans les logs.
 * @param {string} iue Destinataire (le citoyen concerné ; pour un mineur, le BFF
 *                     enverrait au tuteur).
 * @param {string} text Contenu du SMS.
 */
function sendSms(iue, text) {
  console.log(`[SMS simulé] → citoyen ${iue} : ${text}`);
}

/**
 * Notifie le citoyen qu'une nouvelle demande de consentement l'attend.
 * @param {object} consent Enregistrement Consentement créé.
 */
function notifyNewRequest(consent) {
  sendSms(
    consent.iue_citoyen,
    `${adminLabel(consent)} demande l'accès à vos données pour « ${consent.demarche_nom || consent.demarche_id} ». `
    + 'Connectez-vous à votre espace usager pour accepter ou refuser.',
  );
}

/**
 * Envoie un rappel pour une demande toujours sans réponse.
 * @param {object} consent Enregistrement Consentement.
 * @param {'24h'|'72h'} delay Délai écoulé depuis la demande.
 */
function sendReminder(consent, delay) {
  sendSms(
    consent.iue_citoyen,
    `Rappel (${delay}) : ${adminLabel(consent)} attend toujours votre réponse pour « ${consent.demarche_nom || consent.demarche_id} ».`,
  );
}

module.exports = { notifyNewRequest, sendReminder };
