/**
 * Service Diagnostic : vérifie au démarrage que les registres branchés répondent
 * comme le prévoient leurs contrats.
 *
 * Utile surtout au test d'interopérabilité : quand le jury branche le registre
 * d'une autre équipe (variables REGISTRE_*_URL), une URL mal saisie est signalée
 * dans les logs de la passerelle (docker compose logs passerelle), au lieu de
 * faire paraître chaque citoyen absent.
 *
 * Ne bloque jamais le démarrage : un registre peut être lancé après la passerelle.
 */
const config = require('../config');
const registresClient = require('../clients/registres.client');

const REGISTRIES = ['etat-civil', 'justice', 'fiscal'];
/** Un registre injoignable est retenté : il démarre parfois après la passerelle. */
const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 3000;

/**
 * Sonde un registre, en retentant tant qu'il est injoignable.
 * @param {string} registre
 * @returns {Promise<object>} Résultat de registresClient.checkRegistry.
 */
async function checkWithRetry(registre) {
  let result;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    result = await registresClient.checkRegistry(registre);
    if (result.status !== 'injoignable') return result;
    await new Promise((resolve) => { setTimeout(resolve, RETRY_DELAY_MS); });
  }
  return result;
}

/**
 * Sonde les trois registres et écrit le résultat dans les logs.
 * @returns {Promise<object[]>} Un résultat par registre.
 */
async function logRegistriesStatus() {
  const results = await Promise.all(REGISTRIES.map(checkWithRetry));
  for (const r of results) {
    const variable = config.registryEnvVars[r.registre];
    if (r.status === 'conforme') {
      console.log(`[passerelle] registre ${r.registre} : ${r.url} (conforme)`);
    } else if (r.status === 'injoignable') {
      console.warn(`[passerelle] ATTENTION registre ${r.registre} injoignable : ${r.url}. Vérifier ${variable} et que le registre est démarré.`);
    } else {
      console.warn(`[passerelle] ATTENTION registre ${r.registre} non conforme : ${r.url} (${r.detail}). `
        + `${variable} doit mener aux routes du contrat, en général en se terminant par /api.`);
    }
  }
  return results;
}

module.exports = { logRegistriesStatus };
