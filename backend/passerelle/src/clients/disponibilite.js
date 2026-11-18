/**
 * État de disponibilité des registres (couche clients ; conception § 10).
 *
 * Joue le rôle de disjoncteur : un registre qui vient d'échouer (pas de réponse,
 * délai dépassé, erreur 5xx) passe « hors_service » et n'est plus appelé ; les
 * requêtes qui en dépendent sont contournées immédiatement au lieu d'attendre un
 * délai à chaque fois. La sonde périodique (diagnostic.service.js) le repasse
 * « disponible » dès qu'il répond de nouveau.
 *
 * État gardé en mémoire : il est reconstruit par la sonde au démarrage.
 */

/** id du registre -> { disponibilite, depuis, derniere_verification, derniere_erreur } */
const etats = new Map();

/**
 * État courant d'un registre (disponible par défaut, avant toute vérification).
 * @param {string} id
 * @returns {{disponibilite: string, depuis: Date, derniere_verification: Date|null, derniere_erreur: string|null}}
 */
function etat(id) {
  if (!etats.has(id)) {
    etats.set(id, {
      disponibilite: 'disponible', depuis: new Date(), derniere_verification: null, derniere_erreur: null,
    });
  }
  return etats.get(id);
}

/**
 * @param {string} id
 * @returns {boolean} Vrai si le registre peut être appelé.
 */
function estDisponible(id) {
  return etat(id).disponibilite === 'disponible';
}

/**
 * Enregistre un appel réussi (ou une sonde réussie) : le registre est disponible.
 * @param {string} id
 */
function signalerSucces(id) {
  const e = etat(id);
  if (e.disponibilite !== 'disponible') {
    console.log(`[passerelle] registre ${id} de nouveau disponible`);
    e.disponibilite = 'disponible';
    e.depuis = new Date();
    e.derniere_erreur = null;
  }
  e.derniere_verification = new Date();
}

/**
 * Enregistre un échec : le registre passe hors service jusqu'à la prochaine sonde réussie.
 * @param {string} id
 * @param {string} raison Message lisible (ex : « aucune réponse en 2000 ms »).
 */
function signalerEchec(id, raison) {
  const e = etat(id);
  if (e.disponibilite !== 'hors_service') {
    console.warn(`[passerelle] registre ${id} hors service : ${raison}`);
    e.disponibilite = 'hors_service';
    e.depuis = new Date();
  }
  e.derniere_erreur = raison;
  e.derniere_verification = new Date();
}

module.exports = {
  etat, estDisponible, signalerSucces, signalerEchec,
};
