/**
 * Client du service consentement & minimisation (contrat docs/openapi-consentement.yaml).
 */
const config = require('../config');
const AppError = require('../utils/AppError');
const { request, unexpected } = require('./http');

const SERVICE = 'consentement';
const base = () => config.urls.consentement;

/**
 * Règles de minimisation d'une démarche : quels champs, dans quels registres.
 * @param {string} demarcheId
 * @returns {Promise<Array<{registre: string, champs: string[]}>>}
 * @throws {AppError} 404 DEMARCHE_INCONNUE si le service ne connaît pas la démarche.
 */
async function getRules(demarcheId) {
  const res = await request(SERVICE, `${base()}/minimisation/regles/${encodeURIComponent(demarcheId)}`);
  if (res.status === 404) {
    throw new AppError(404, 'DEMARCHE_INCONNUE', `Aucune règle de minimisation pour la démarche « ${demarcheId} »`);
  }
  if (res.status !== 200) unexpected(SERVICE, res);
  return res.body.champs_requis;
}

/**
 * Applique le filtre de minimisation à des données brutes.
 * @param {string} demarcheId
 * @param {string} registre
 * @param {object} rawData Données renvoyées par le registre.
 * @returns {Promise<{donnees_filtrees: object, champs_filtres: string[]}>}
 */
async function filter(demarcheId, registre, rawData) {
  const res = await request(SERVICE, `${base()}/minimisation/filtrer`, {
    method: 'POST',
    body: { demarche_id: demarcheId, registre, donnees_brutes: rawData },
  });
  if (res.status !== 200) unexpected(SERVICE, res);
  return res.body;
}

/**
 * Crée une demande de consentement (administration privée).
 * @param {object} payload Corps de POST /consentements/creer.
 * @returns {Promise<object>} Consentement créé.
 */
async function createRequest(payload) {
  const res = await request(SERVICE, `${base()}/consentements/creer`, { method: 'POST', body: payload });
  if (res.status !== 201) unexpected(SERVICE, res);
  return res.body;
}

/**
 * Lit le statut à jour d'une demande de consentement (route interne).
 * @param {string} consentId
 * @returns {Promise<object>} Consentement.
 */
async function getConsent(consentId) {
  const res = await request(SERVICE, `${base()}/interne/consentements/${consentId}`);
  if (res.status !== 200) unexpected(SERVICE, res);
  return res.body;
}

module.exports = { getRules, filter, createRequest, getConsent };
