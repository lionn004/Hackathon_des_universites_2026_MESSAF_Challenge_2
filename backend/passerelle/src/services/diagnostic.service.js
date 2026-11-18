/**
 * Service Diagnostic : surveillance des registres du catalogue (conception § 10 et § 11).
 *
 * Deux tâches :
 *  - au démarrage, vérifier que chaque registre répond comme le catalogue le décrit, et
 *    écrire le résultat dans les logs (docker compose logs passerelle) : une adresse mal
 *    saisie est signalée au lieu de faire paraître chaque citoyen absent ;
 *  - en continu, sonder chaque registre toutes les SONDE_INTERVALLE_MS (5 s par défaut) :
 *    un registre hors service redevient « disponible » dès qu'il répond, et les requêtes en
 *    attente peuvent alors être complétées.
 * Rien ici ne bloque le démarrage : un registre peut être lancé après la passerelle.
 */
const catalogue = require('../config/catalogue');
const registresClient = require('../clients/registres.client');

/** Un registre injoignable au démarrage est retenté : il démarre parfois après la passerelle. */
const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;
const SONDE_INTERVALLE_MS = Number(process.env.SONDE_INTERVALLE_MS) || 5000;

/** @returns {string[]} Registres actifs du catalogue. */
function registresActifs() {
  return Object.entries(catalogue.registres).filter(([, r]) => r.etat === 'actif').map(([id]) => id);
}

/**
 * Vérifie un registre, en retentant tant qu'il est injoignable.
 * @param {string} id
 * @returns {Promise<object>} Résultat de registresClient.checkRegistry.
 */
async function checkWithRetry(id) {
  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    result = await registresClient.checkRegistry(id);
    if (result.status !== 'injoignable') return result;
    await new Promise((resolve) => { setTimeout(resolve, RETRY_DELAY_MS); });
  }
  return result;
}

/**
 * Vérifie les registres actifs et écrit le résultat dans les logs.
 * @returns {Promise<object[]>} Un résultat par registre.
 */
async function logRegistriesStatus() {
  const results = await Promise.all(registresActifs().map(checkWithRetry));
  for (const r of results) {
    if (r.status === 'conforme') {
      console.log(`[passerelle] registre ${r.registre} : ${r.url} (conforme)`);
    } else if (r.status === 'injoignable') {
      console.warn(`[passerelle] ATTENTION registre ${r.registre} injoignable : ${r.url}. Vérifier ${r.modele} et que le registre est démarré.`);
    } else {
      console.warn(`[passerelle] ATTENTION registre ${r.registre} non conforme : ${r.url} (${r.detail}). `
        + `Vérifier ${r.modele} : l'adresse doit mener aux routes déclarées au catalogue, en général en se terminant par /api.`);
    }
  }
  return results;
}

/**
 * Lance la sonde permanente des registres actifs.
 * @returns {NodeJS.Timeout} Minuterie (unref : n'empêche pas l'arrêt du processus).
 */
function demarrerSondes() {
  const tour = () => Promise.all(registresActifs().map((id) => registresClient.sonder(id))).catch(() => {});
  tour();
  return setInterval(tour, SONDE_INTERVALLE_MS).unref();
}

module.exports = { logRegistriesStatus, demarrerSondes };
