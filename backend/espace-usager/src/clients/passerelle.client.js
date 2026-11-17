/**
 * Client de la passerelle d'échange.
 *
 * Deux familles d'appels :
 *  - routes INTERNES (identité, cascade) : protégées par la clé de service ;
 *  - routes ADMINISTRATION (catalogue, requêtes) : utilisées par l'interface de
 *    test, avec un jeton d'administration fourni par l'appelant.
 */
const config = require('../config');
const { request, expectOk } = require('./http');

const SERVICE = 'passerelle';
const base = () => config.urls.passerelle;
const internalHeaders = () => ({ 'X-Cle-Service': config.serviceKey });
const adminHeaders = (adminToken) => ({ Authorization: `Bearer ${adminToken}` });

/**
 * Identité d'un citoyen et de ses enfants (registre état-civil, via la passerelle).
 * @param {string} iue
 * @returns {Promise<object|null>} { iue, nom, prenom, date_naissance, est_majeur, enfants } ou null si inconnu.
 */
async function getIdentity(iue) {
  const res = await request(SERVICE, `${base()}/interne/citoyens/${iue}`, { headers: internalHeaders() });
  if (res.status === 404) return null;
  return expectOk(SERVICE, res);
}

/**
 * Résolution en cascade d'une pièce pour un citoyen.
 * @param {string} typePieceId
 * @param {string} iue Titulaire de la pièce.
 * @returns {Promise<{type_piece: {id: string, nom: string}, statut: string, cascade: object[]}>}
 */
async function resolveCascade(typePieceId, iue) {
  const res = await request(SERVICE, `${base()}/interne/cascade`, {
    method: 'POST', headers: internalHeaders(), body: { type_piece_id: typePieceId, iue },
  });
  return expectOk(SERVICE, res);
}

/** GET /administrations — administrations de la plateforme. */
async function listAdministrations() {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/administrations`));
}

/** GET /demarches — catalogue des démarches. */
async function listDemarches() {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/demarches`));
}

/**
 * POST /requetes au nom d'une administration (interface de test).
 * Renvoie la réponse BRUTE : 200 et 202 ont chacun un sens pour l'appelant.
 * @param {string} adminToken Jeton d'administration.
 * @param {object} body { iue_citoyen, demarche_id }.
 * @returns {Promise<{status: number, body: any}>}
 */
function submitRequete(adminToken, body) {
  return request(SERVICE, `${base()}/requetes`, { method: 'POST', headers: adminHeaders(adminToken), body });
}

/**
 * GET /requetes/{id} au nom d'une administration (interface de test).
 * @param {string} adminToken
 * @param {string} id
 * @returns {Promise<object>} RequeteStatut.
 */
async function getRequete(adminToken, id) {
  return expectOk(SERVICE, await request(SERVICE, `${base()}/requetes/${encodeURIComponent(id)}`, { headers: adminHeaders(adminToken) }));
}

module.exports = {
  getIdentity, resolveCascade, listAdministrations, listDemarches, submitRequete, getRequete,
};
