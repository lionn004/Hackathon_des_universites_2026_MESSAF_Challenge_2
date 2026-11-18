/**
 * Client HTTP commun à tous les clients de la passerelle.
 *
 * Centralise :
 *  - le délai maximal d'attente (un service lent ne bloque pas la passerelle) ;
 *  - la conversion des pannes réseau en erreur 502 explicite, qui nomme le
 *    service fautif (utile pendant la démo et le test d'interopérabilité).
 */
const config = require('../config');
const AppError = require('../utils/AppError');

/**
 * Appelle un autre service et renvoie son statut et son corps JSON.
 * Les réponses 4xx/5xx ne lèvent PAS d'erreur : c'est à l'appelant de décider
 * (un 404 de registre signifie « citoyen absent », ce n'est pas une panne).
 *
 * @param {string} serviceName Nom lisible du service (pour les messages d'erreur).
 * @param {string} url URL complète.
 * @param {object} [options]
 * @param {string} [options.method='GET']
 * @param {object} [options.body] Corps envoyé en JSON.
 * @param {object} [options.headers] En-têtes supplémentaires (ex : clé de service).
 * @returns {Promise<{status: number, body: any}>}
 * @throws {AppError} 502 SERVICE_INDISPONIBLE si le service ne répond pas.
 */
async function request(serviceName, url, { method = 'GET', body, headers = {} } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { ...headers, ...(body && { 'Content-Type': 'application/json' }) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.callTimeoutMs),
    });
  } catch {
    throw new AppError(502, 'SERVICE_INDISPONIBLE', `Le service ${serviceName} ne répond pas`);
  }

  // Un corps non JSON (ex : page d'erreur HTML d'un proxy) est traité comme vide.
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

/**
 * Lève une erreur 502 quand un service renvoie une réponse inattendue.
 * @param {string} serviceName
 * @param {{status: number, body: any}} res Réponse reçue.
 * @throws {AppError}
 */
function unexpected(serviceName, res) {
  const detail = res.body && res.body.message ? ` : ${res.body.message}` : '';
  throw new AppError(502, 'SERVICE_EN_ERREUR', `Réponse inattendue du service ${serviceName} (HTTP ${res.status})${detail}`);
}

/**
 * Renvoie le corps d'une réponse attendue, sinon lève l'erreur adaptée :
 *  - code attendu (ex : 200) → corps renvoyé ;
 *  - erreur métier 4xx du service appelé → relayée telle quelle au frontend
 *    (même statut, même { code, message }), car elle a un sens pour le citoyen ;
 *  - 503 REGISTRE_INDISPONIBLE (un registre est hors service) → relayée aussi :
 *    le citoyen voit quel registre manque, et que sa demande reprendra ;
 *  - toute autre réponse → 502.
 *
 * @param {string} serviceName
 * @param {{status: number, body: any}} res
 * @param {number[]} [okStatuses=[200]]
 * @returns {any} Corps de la réponse.
 * @throws {AppError}
 */
function expectOk(serviceName, res, okStatuses = [200]) {
  if (okStatuses.includes(res.status)) return res.body;
  const relayee = (res.status >= 400 && res.status < 500) || (res.status === 503 && res.body && res.body.code === 'REGISTRE_INDISPONIBLE');
  if (relayee && res.body && res.body.code) {
    throw new AppError(res.status, res.body.code, res.body.message);
  }
  return unexpected(serviceName, res);
}

/**
 * Construit une query string en ignorant les paramètres vides.
 * @param {object} params
 * @returns {string} "?a=1&b=2" ou "".
 */
function qs(params) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
}

module.exports = {
  request, unexpected, expectOk, qs,
};
