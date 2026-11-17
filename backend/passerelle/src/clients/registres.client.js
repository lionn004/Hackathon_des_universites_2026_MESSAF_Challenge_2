/**
 * Client des registres (état-civil, justice, fiscal).
 *
 * N'utilise QUE les routes des contrats standardisés docs/openapi-registre-*.yaml :
 * n'importe quel registre conforme (y compris celui d'une autre équipe) fonctionne.
 * Convention de retour : null quand le registre répond 404 (citoyen absent).
 */
const config = require('../config');
const { request, unexpected } = require('./http');

/** Champs exposés par chaque route du registre justice (schémas du contrat). */
const JUSTICE_CASIER_FIELDS = ['casier_vierge', 'condamnations', 'date_delivrance'];
const JUSTICE_NATIONALITE_FIELDS = ['est_national', 'nationalite', 'mode_acquisition', 'date_acquisition', 'numero_certificat'];

/**
 * Appelle une route GET d'un registre.
 * @param {string} registre 'etat-civil' | 'justice' | 'fiscal'
 * @param {string} path Chemin après /api (ex : "/citoyens/123/fiscal").
 * @param {string[]} [fields] Champs demandés (paramètre ?champs=), tous si absent.
 * @returns {Promise<object|null>} Données, ou null si 404.
 * @throws {AppError} 502 si le registre est injoignable ou répond une erreur.
 */
async function get(registre, path, fields) {
  const query = fields && fields.length ? `?champs=${encodeURIComponent(fields.join(','))}` : '';
  const res = await request(`registre ${registre}`, `${config.urls[registre]}${path}${query}`);
  if (res.status === 404) return null;
  if (res.status !== 200) unexpected(`registre ${registre}`, res);
  return res.body;
}

/** GET /citoyens/{iue} — état civil (éventuellement restreint à certains champs). */
function getEtatCivil(iue, fields) {
  return get('etat-civil', `/citoyens/${iue}`, fields);
}

/** GET /citoyens/{iue}/filiation — IUE des parents et des enfants. */
function getFiliation(iue) {
  return get('etat-civil', `/citoyens/${iue}/filiation`);
}

/** GET /citoyens/{iue}/casier — casier judiciaire. */
function getCasier(iue, fields) {
  return get('justice', `/citoyens/${iue}/casier`, fields);
}

/** GET /citoyens/{iue}/nationalite — certificat de nationalité. */
function getNationalite(iue, fields) {
  return get('justice', `/citoyens/${iue}/nationalite`, fields);
}

/** GET /citoyens/{iue}/fiscal — situation fiscale. */
function getFiscal(iue, fields) {
  return get('fiscal', `/citoyens/${iue}/fiscal`, fields);
}

/**
 * Récupère les données brutes d'un registre pour une liste de champs.
 *
 * Le registre justice expose deux routes (casier et nationalité) : on n'appelle
 * que celles qui portent au moins un champ demandé, puis on fusionne.
 *
 * @param {string} registre 'etat-civil' | 'justice' | 'fiscal'
 * @param {string} iue
 * @param {string[]} fields Champs voulus.
 * @returns {Promise<object|null>} Données brutes, ou null si le citoyen est absent du registre.
 */
async function fetchFields(registre, iue, fields) {
  if (registre === 'etat-civil') return getEtatCivil(iue, fields);
  if (registre === 'fiscal') return getFiscal(iue, fields);

  const casierFields = fields.filter((f) => JUSTICE_CASIER_FIELDS.includes(f));
  const nationaliteFields = fields.filter((f) => JUSTICE_NATIONALITE_FIELDS.includes(f));
  const calls = [];
  if (casierFields.length) calls.push(getCasier(iue, casierFields));
  if (nationaliteFields.length) calls.push(getNationalite(iue, nationaliteFields));
  if (calls.length === 0) return {}; // aucun champ de ce registre n'est demandé

  const results = await Promise.all(calls);
  // Le citoyen est absent du registre si TOUTES les routes interrogées répondent 404.
  if (results.every((r) => r === null)) return null;
  return Object.assign({}, ...results.filter(Boolean));
}

/**
 * Vérifie qu'une pièce existe dans le registre qui la détient.
 * Seul l'IUE est demandé : on vérifie l'existence sans rapatrier de données.
 *
 * @param {string} typePieceId Ex : "casier-judiciaire".
 * @param {string} registre Registre source de la pièce.
 * @param {string} iue Titulaire de la pièce.
 * @returns {Promise<boolean>}
 */
async function pieceExists(typePieceId, registre, iue) {
  let data;
  if (typePieceId === 'casier-judiciaire') data = await getCasier(iue, ['iue']);
  else if (typePieceId === 'certificat-nationalite') data = await getNationalite(iue, ['iue']);
  else if (registre === 'fiscal') data = await getFiscal(iue, ['iue']);
  else if (registre === 'justice') data = await getCasier(iue, ['iue']);
  else data = await getEtatCivil(iue, ['iue']);
  return data !== null;
}

module.exports = { getFiliation, fetchFields, pieceExists };
