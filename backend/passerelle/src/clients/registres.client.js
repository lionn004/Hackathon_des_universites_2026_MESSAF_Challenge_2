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
/** Champs du schéma DonneesEtatCivil (contrat état-civil), hors iue. */
const ETAT_CIVIL_FIELDS = [
  'nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe', 'nationalite',
  'pere_iue', 'mere_iue', 'date_deces', 'est_majeur',
];
/** Champs du schéma SituationFiscale (contrat fiscal), hors iue. */
const FISCAL_FIELDS = ['ifu', 'en_regle', 'type_contribuable', 'regime_fiscal', 'derniere_declaration', 'montant_impot_du'];
/** Identité minimale : titulaire d'une pièce, parents sur un extrait de naissance. */
const MINIMAL_IDENTITY_FIELDS = ['iue', 'nom', 'prenom'];

/**
 * Vrai si la valeur est un objet JSON (pas null, pas un tableau).
 * @param {*} value
 * @returns {boolean}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Ne garde que les champs listés (un champ absent de la réponse est ignoré).
 *
 * Les contrats des registres rendent ?champs= FACULTATIF : le registre d'une
 * autre équipe peut l'ignorer et renvoyer toute la fiche. On filtre donc
 * toujours ici, sans compter sur le registre.
 *
 * @param {object} data Réponse du registre.
 * @param {string[]} fields Champs à garder.
 * @returns {object}
 */
function pick(data, fields) {
  return Object.fromEntries(fields.filter((f) => Object.hasOwn(data, f)).map((f) => [f, data[f]]));
}

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

/**
 * Pour chaque pièce consultable : la route du contrat du registre qui la
 * détient, et les champs de contenu de son schéma.
 */
const PIECE_SOURCES = {
  'extrait-naissance': { read: getEtatCivil, fields: ETAT_CIVIL_FIELDS },
  'certificat-nationalite': { read: getNationalite, fields: JUSTICE_NATIONALITE_FIELDS },
  'casier-judiciaire': { read: getCasier, fields: JUSTICE_CASIER_FIELDS },
  'attestation-fiscale': { read: getFiscal, fields: FISCAL_FIELDS },
};

/**
 * Lit le contenu complet d'une pièce dans le registre qui la détient.
 * Le registre est appelé sans ?champs= (tout le schéma est voulu), puis la
 * réponse est filtrée sur les champs du contrat, sans l'iue (porté par le titulaire).
 *
 * @param {string} typePieceId Ex : "casier-judiciaire".
 * @param {string} iue Titulaire de la pièce (12 chiffres, vérifié par l'appelant).
 * @returns {Promise<object|null>} Champs de la pièce, ou null si le registre ne l'a pas.
 * @throws {Error} si aucune route n'est connue pour cette pièce (catalogue et client désaccordés).
 * @throws {AppError} 502 si le registre est injoignable ou répond une erreur.
 */
async function fetchPiece(typePieceId, iue) {
  const source = PIECE_SOURCES[typePieceId];
  if (!source) throw new Error(`Aucune route de registre connue pour la pièce « ${typePieceId} »`);
  const data = await source.read(iue);
  return isRecord(data) ? pick(data, source.fields) : null;
}

/**
 * Lit l'identité minimale d'un citoyen à l'état civil.
 * @param {string} iue 12 chiffres, vérifié par l'appelant.
 * @returns {Promise<{iue: string, nom: string, prenom: string}|null>} null si inconnu de l'état civil.
 * @throws {AppError} 502 si le registre est injoignable ou répond une erreur.
 */
async function fetchIdentity(iue) {
  const data = await getEtatCivil(iue, MINIMAL_IDENTITY_FIELDS);
  return isRecord(data) ? pick(data, MINIMAL_IDENTITY_FIELDS) : null;
}

module.exports = {
  getEtatCivil, getFiliation, fetchFields, pieceExists, fetchPiece, fetchIdentity,
};
