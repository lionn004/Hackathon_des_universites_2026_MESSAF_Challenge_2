/**
 * Client du journal de traçabilité (routes citoyen).
 * Chaque appel transmet un jeton citoyen (voir services/jeton.service.js).
 */
const config = require('../config');
const { request, expectOk, qs } = require('./http');

const SERVICE = 'journal';
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** GET /journal — entrées filtrées et paginées (date_debut, date_fin, page, limite). */
async function list(token, params) {
  return expectOk(SERVICE, await request(SERVICE, `${config.urls.journal}/journal${qs(params)}`, { headers: auth(token) }));
}

/** GET /journal/statistiques — résumé pour le tableau de bord. */
async function stats(token) {
  return expectOk(SERVICE, await request(SERVICE, `${config.urls.journal}/journal/statistiques`, { headers: auth(token) }));
}

/** GET /journal/verification : intégrité de la chaîne des empreintes. */
async function verify(token) {
  return expectOk(SERVICE, await request(SERVICE, `${config.urls.journal}/journal/verification`, { headers: auth(token) }));
}

module.exports = { list, stats, verify };
