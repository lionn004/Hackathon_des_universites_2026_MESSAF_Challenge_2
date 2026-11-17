/**
 * Client du journal de traçabilité (contrat docs/openapi-journal.yaml).
 */
const config = require('../config');
const { request, unexpected } = require('./http');

/**
 * Enregistre un accès aux données d'un citoyen.
 * @param {object} access Corps NouvelAcces (avec la photo figée des noms).
 * @returns {Promise<object>} EntreeJournal créée (contient son id).
 * @throws {AppError} 502 si le journal est injoignable ou refuse l'entrée.
 */
async function record(access) {
  const res = await request('journal', `${config.urls.journal}/journal/enregistrer`, { method: 'POST', body: access });
  if (res.status !== 201) unexpected('journal', res);
  return res.body;
}

module.exports = { record };
