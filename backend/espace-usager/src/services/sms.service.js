/**
 * Service SMS — SIMULÉ pour le hackathon.
 *
 * Les SMS sont écrits dans les logs du conteneur (`docker compose logs espace-usager`).
 * Pour brancher une vraie passerelle SMS, seul ce fichier est à modifier.
 */

/**
 * « Envoie » un SMS.
 * @param {string} telephone Numéro du destinataire.
 * @param {string} text Contenu.
 */
function send(telephone, text) {
  console.log(`[SMS simulé] → ${telephone} : ${text}`);
}

module.exports = { send };
