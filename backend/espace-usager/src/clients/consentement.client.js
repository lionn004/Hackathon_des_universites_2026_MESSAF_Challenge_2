/**
 * Client du service consentement (routes citoyen).
 * Chaque appel transmet un jeton citoyen (voir services/jeton.service.js).
 */
const config = require('../config');
const { request, expectOk, qs } = require('./http');

const SERVICE = 'consentement';
const base = () => config.urls.consentement;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

/** GET /consentements — liste paginée (statut, page, limite). */
async function list(token, { statut, page, limite }) {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/consentements${qs({ statut, page, limite })}`, { headers: auth(token) }));
}

/** GET /consentements/en-attente/count — nombre de demandes en attente. */
async function countPending(token) {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/consentements/en-attente/count`, { headers: auth(token) }));
}

/** GET /consentements/{id} — détail. */
async function get(token, id) {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/consentements/${encodeURIComponent(id)}`, { headers: auth(token) }));
}

/** PUT /consentements/{id} — réponse du citoyen. */
async function answer(token, id, decision) {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/consentements/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: auth(token), body: { decision },
  }));
}

module.exports = {
  list, countPending, get, answer,
};
