/**
 * Connecteur générique des registres (couche clients ; docs/conception-interoperabilite.md).
 *
 * Aucun registre n'est écrit en dur : tout vient du catalogue (config/catalogue-registres.yaml)
 * et du dictionnaire (config/dictionnaire.yaml). Pour lire une opération (ex : justice.casier),
 * le connecteur :
 *  1. prend dans « sources » le premier registre disponible qui sait fournir les données
 *     voulues (les suivants sont des sources de secours) ;
 *  2. identifie la personne (IUE, table de correspondance, ou recherche par nom, prénom et
 *     date de naissance) ;
 *  3. appelle la route déclarée, avec le délai propre au registre ;
 *  4. traduit la réponse vers le dictionnaire (correspondances, conversions) : un champ sans
 *     correspondance n'entre jamais dans la plateforme ;
 *  5. calcule les données dérivées (« majeur : oui ») puis ne garde que les données demandées.
 *
 * Un registre qui ne répond pas passe hors service (disponibilite.js) : les lectures qui en
 * dépendent lèvent aussitôt REGISTRE_INDISPONIBLE (503), avec la liste des registres en cause.
 * Convention de retour : null quand la personne est inconnue du registre.
 */
const catalogue = require('../config/catalogue');
const disponibilite = require('./disponibilite');
const { request } = require('./http');
const AppError = require('../utils/AppError');

const ETAT_CIVIL_FICHE = 'etat-civil.fiche';
/** Données lues à l'état civil pour retrouver une personne dans un registre sans IUE. */
const IDENTITE_RECHERCHE = ['nom', 'prenom', 'date_naissance'];
/** Identité minimale : titulaire d'une pièce, parents sur un extrait de naissance. */
const MINIMAL_IDENTITY_FIELDS = ['iue', 'nom', 'prenom'];
/** IUE bien formé qu'aucun registre n'attribue : sert à sonder la conformité des routes. */
const PROBE_IUE = '000000000000';

const VRAI = ['true', 'vrai', 'oui', 'o', 'yes', 'y', '1'];
const FAUX = ['false', 'faux', 'non', 'n', 'no', '0'];

/**
 * Vrai si la valeur est un objet JSON (pas null, pas un tableau).
 * @param {*} value
 * @returns {boolean}
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Ne garde que les champs listés (un champ absent est ignoré).
 * @param {object} data
 * @param {string[]} fields
 * @returns {object}
 */
function pick(data, fields) {
  return Object.fromEntries(fields.filter((f) => Object.hasOwn(data, f)).map((f) => [f, data[f]]));
}

/**
 * Lit un chemin « a.b.c » dans un objet (chemin vide : l'objet lui-même).
 * @param {*} objet
 * @param {string} [chemin]
 * @returns {*} undefined si le chemin n'existe pas.
 */
function lireChemin(objet, chemin) {
  if (!chemin) return objet;
  return String(chemin).split('.').reduce((o, k) => (o !== null && typeof o === 'object' ? o[k] : undefined), objet);
}

/**
 * Erreur : une donnée nécessaire ne peut pas être lue car des registres sont hors service.
 * requetes.service.js met alors la requête en attente au lieu d'échouer.
 * @param {string[]} ids Registres en cause.
 * @returns {AppError} 503 REGISTRE_INDISPONIBLE, avec la propriété `registres`.
 */
function registreIndisponible(ids) {
  const uniques = [...new Set(ids)];
  const noms = uniques.map((id) => (catalogue.registres[id] || {}).nom || id);
  const err = new AppError(503, 'REGISTRE_INDISPONIBLE', `Registre momentanément indisponible : ${noms.join(', ')}`);
  err.registres = uniques;
  return err;
}

/**
 * Erreur : le registre répond, mais pas comme le catalogue le décrit (configuration à revoir).
 * @returns {AppError} 502 SERVICE_EN_ERREUR
 */
function reponseInattendue(id, res, detail = '') {
  const nom = (catalogue.registres[id] || {}).nom || id;
  return new AppError(502, 'SERVICE_EN_ERREUR', `Réponse inattendue du registre ${nom} (HTTP ${res.status})${detail ? ` : ${detail}` : ''}`);
}

// Conversions vers les types du dictionnaire

/** @returns {string|null} Date AAAA-MM-JJ (formats acceptés : AAAA-MM-JJ[...], JJ/MM/AAAA, JJ-MM-AAAA, JJ.MM.AAAA). */
function enDate(v) {
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})[/.-](\d{2})[/.-](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s; // format inconnu : gardé tel quel, les calculs l'ignoreront
}

/** @returns {boolean|null} */
function enBooleen(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const s = String(v).trim().toLowerCase();
  if (VRAI.includes(s)) return true;
  if (FAUX.includes(s)) return false;
  return null;
}

/** @returns {number|null} */
function enNombre(v) {
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Convertit une valeur brute du registre vers le type de la donnée du dictionnaire.
 * @param {*} valeur
 * @param {object} def Définition de la donnée (dictionnaire).
 * @param {object} [corr] Correspondance du catalogue ({ champ, conversion, valeurs, elements }).
 * @returns {*}
 */
function convertir(valeur, def, corr = {}) {
  if (valeur === undefined || valeur === null || valeur === '') return null;
  let v = valeur;
  if (isRecord(corr.valeurs) && Object.hasOwn(corr.valeurs, String(v))) v = corr.valeurs[String(v)];
  switch (corr.conversion || def.type) {
    case 'date': return enDate(v);
    case 'booleen': return enBooleen(v);
    case 'nombre': return enNombre(v);
    case 'liste':
      return Array.isArray(v) ? v.filter(isRecord).map((el) => traduireObjet(el, def.elements || {}, corr.elements)) : null;
    default:
      // texte, identifiant : jamais d'objet imbriqué (il pourrait porter des champs hors dictionnaire)
      return typeof v === 'object' ? null : String(v);
  }
}

/**
 * Traduit un objet du registre vers le dictionnaire.
 * Sans correspondances, les noms du registre sont ceux du dictionnaire (format recommandé).
 * @param {object} brut Objet reçu du registre.
 * @param {object} schema Données attendues : { nom: définition }.
 * @param {object} [correspondances] Correspondances du catalogue.
 * @returns {object} Uniquement des données du dictionnaire.
 */
function traduireObjet(brut, schema, correspondances) {
  const out = {};
  for (const [nom, def] of Object.entries(schema)) {
    const corr = correspondances ? correspondances[nom] : { champ: nom };
    if (!corr) continue;
    const valeur = lireChemin(brut, corr.champ);
    if (valeur === undefined) continue;
    out[nom] = convertir(valeur, def, corr);
  }
  return out;
}

/**
 * Registre identifié par correspondance : les personnes qu'il cite (pere_iue, mere_iue, parents
 * et enfants de la filiation) y sont désignées par SON identifiant local. On les remplace par
 * leur IUE grâce à la table. Une personne absente de la table devient null (inconnue de la
 * plateforme) : un identifiant local ne sort jamais sous le nom d'un IUE.
 * @param {object} donnees Données traduites (modifiées sur place).
 * @param {object} schema Données de l'opération (dictionnaire).
 * @param {Map<string, string>} versIue Identifiant local -> IUE.
 */
function localVersIue(donnees, schema, versIue) {
  for (const [nom, def] of Object.entries(schema)) {
    const valeur = donnees[nom];
    if (valeur === undefined || valeur === null) continue;
    if (def.type === 'identifiant') {
      donnees[nom] = versIue.get(String(valeur)) ?? null;
    } else if (def.type === 'liste' && Array.isArray(valeur)) {
      for (const element of valeur) localVersIue(element, def.elements || {}, versIue);
    }
  }
}

/**
 * Traduit la fiche d'un registre vers le dictionnaire, identifiants de personnes compris.
 * @param {object} reg Registre du catalogue.
 * @param {object} fiche Objet reçu du registre.
 * @param {object} schema Données de l'opération.
 * @param {object} [correspondances]
 * @returns {object}
 */
function traduireFiche(reg, fiche, schema, correspondances) {
  const donnees = traduireObjet(fiche, schema, correspondances);
  if (reg.identification.mode === 'correspondance') localVersIue(donnees, schema, reg.identification.versIue);
  return donnees;
}

// Données calculées (« majeur : oui »)

/**
 * Âge révolu en UTC à partir d'une date AAAA-MM-JJ.
 * @param {string} date
 * @param {Date} [maintenant]
 * @returns {number|null} null si la date est illisible.
 */
function age(date, maintenant = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return null;
  const n = new Date(`${date}T00:00:00Z`);
  let a = maintenant.getUTCFullYear() - n.getUTCFullYear();
  if (maintenant.getUTCMonth() < n.getUTCMonth()
    || (maintenant.getUTCMonth() === n.getUTCMonth() && maintenant.getUTCDate() < n.getUTCDate())) a -= 1;
  return a;
}

/**
 * Calcule les données dérivées manquantes (le registre n'en fournit pas la valeur).
 * @param {object} schema Données de l'opération.
 * @param {object} donnees Données traduites (modifiées sur place).
 */
function calculer(schema, donnees) {
  for (const [nom, def] of Object.entries(schema)) {
    if (!def.calcul || (donnees[nom] !== undefined && donnees[nom] !== null)) continue;
    const source = donnees[def.calcul.a_partir_de];
    if (def.calcul.regle === 'age_au_moins') {
      const a = age(source);
      if (a !== null) donnees[nom] = a >= Number(def.calcul.seuil);
    } else if (def.calcul.regle === 'liste_vide' && Array.isArray(source)) {
      donnees[nom] = source.length === 0;
    }
  }
}

/**
 * Données à lire dans le registre : celles demandées, plus les sources des données calculées.
 * @param {object} schema
 * @param {string[]} champs
 * @returns {string[]}
 */
function champsNecessaires(schema, champs) {
  const set = new Set(champs);
  for (const c of champs) if (schema[c] && schema[c].calcul) set.add(schema[c].calcul.a_partir_de);
  return [...set];
}

/**
 * Vrai si le registre sait fournir (directement ou par calcul) toutes les données demandées.
 * @param {object} op Opération déclarée dans le catalogue.
 * @param {string[]} champs
 * @param {object} schema
 * @returns {boolean}
 */
function couvre(op, champs, schema) {
  if (!op.correspondances) return true;
  return champs.every((c) => c === 'iue' || op.correspondances[c]
    || (schema[c] && schema[c].calcul && op.correspondances[schema[c].calcul.a_partir_de]));
}

// Appels HTTP

/**
 * Met une date AAAA-MM-JJ au format demandé dans une route ({date_naissance|jj/mm/aaaa}).
 * @param {string} valeur
 * @param {string} [format]
 * @returns {string}
 */
function formater(valeur, format) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valeur));
  if (!format || !m) return String(valeur ?? '');
  return format.toLowerCase().replace('aaaa', m[1]).replace('mm', m[2]).replace('jj', m[3]);
}

/**
 * Construit l'URL d'une route du catalogue.
 * @param {object} reg Registre.
 * @param {string} route « GET /chemin/{variable} ».
 * @param {object} valeurs Valeurs des variables ({iue}, {identifiant_local}, {nom}...).
 * @param {string[]|null} champsRegistre Noms de champs à passer en paramètre de filtrage, s'il est déclaré.
 * @returns {{methode: string, url: string}}
 */
function construireUrl(reg, route, valeurs, champsRegistre = null) {
  const { methode, chemin } = catalogue.decouperRoute(route);
  let url = String(reg.adresse).replace(/\/+$/, '')
    + chemin.replace(/\{([a-z_]+)(?:\|([^}]+))?\}/g, (_, nom, format) => encodeURIComponent(formater(valeurs[nom], format)));
  if (reg.parametre_champs && champsRegistre && champsRegistre.length) {
    url += `${url.includes('?') ? '&' : '?'}${reg.parametre_champs}=${encodeURIComponent(champsRegistre.join(','))}`;
  }
  return { methode, url };
}

/**
 * Appelle un registre et tient son état de disponibilité à jour.
 * @returns {Promise<{status: number, body: any}>}
 * @throws {AppError} 503 REGISTRE_INDISPONIBLE si pas de réponse, délai dépassé ou erreur 5xx.
 */
async function appeler(id, reg, methode, url) {
  let res;
  try {
    res = await request(`registre ${id}`, url, { method: methode, headers: reg.entetes || {}, timeoutMs: reg.delai_ms });
  } catch {
    disponibilite.signalerEchec(id, `aucune réponse en ${reg.delai_ms} ms`);
    throw registreIndisponible([id]);
  }
  if (res.status >= 500) {
    disponibilite.signalerEchec(id, `erreur HTTP ${res.status}`);
    throw registreIndisponible([id]);
  }
  disponibilite.signalerSucces(id);
  return res;
}

// Lecture d'une opération

/**
 * Identifie la personne dans un registre (conception § 6).
 * Mode « correspondance » : l'identifiant local est lu dans la table du registre, sans appel ;
 * un IUE absent de la table est une personne inconnue de ce registre.
 * Mode « recherche » : nom, prénom et date de naissance sont lus à l'état civil par l'IUE,
 * puis il faut EXACTEMENT un résultat ; sinon la pièce n'est pas lue (aucun résultat : donnée numérique manquante ; plusieurs : homonymes).
 * @returns {Promise<object|null>} Valeurs des variables de route, ou null si introuvable.
 */
async function identifier(id, reg, iue) {
  const ident = reg.identification;
  if (ident.mode === 'iue') return { iue };
  if (ident.mode === 'correspondance') {
    const local = ident.parIue.get(iue);
    return local === undefined ? null : { iue, identifiant_local: local };
  }

  // eslint-disable-next-line no-use-before-define
  const identite = await lireOperation(ETAT_CIVIL_FICHE, iue, IDENTITE_RECHERCHE);
  if (!identite) return null;
  const { methode, url } = construireUrl(reg, ident.route, { iue, ...identite });
  const res = await appeler(id, reg, methode, url);
  if ((ident.inconnu || [404]).includes(res.status)) return null;
  if (res.status !== 200) throw reponseInattendue(id, res);
  const liste = lireChemin(res.body, ident.liste);
  const resultats = Array.isArray(liste) ? liste : [];
  if (resultats.length !== 1) {
    if (resultats.length > 1) {
      console.warn(`[passerelle] registre ${id} : ${resultats.length} personnes correspondent à ${iue}, aucune n'est retenue (homonymes : identification par correspondance nécessaire)`);
    }
    return null;
  }
  const local = lireChemin(resultats[0], ident.identifiant_local);
  return local === undefined || local === null ? null : { iue, identifiant_local: String(local) };
}

/**
 * Lit une opération dans un registre précis et traduit la réponse.
 * @returns {Promise<object|null>} Données du dictionnaire, ou null si la personne est inconnue.
 */
async function lireDans(id, reg, operation, iue, necessaires) {
  const personne = await identifier(id, reg, iue);
  if (!personne) return null;
  const op = reg.operations[operation];
  const schema = catalogue.operations.get(operation);
  const champsRegistre = necessaires && necessaires.length
    ? necessaires.map((c) => (op.correspondances ? (op.correspondances[c] || {}).champ : c)).filter(Boolean).map((c) => c.split('.')[0])
    : null;
  const { methode, url } = construireUrl(reg, op.route, personne, champsRegistre);
  const res = await appeler(id, reg, methode, url);
  if (op.inconnu.includes(res.status)) return null;
  if (res.status !== 200) throw reponseInattendue(id, res);
  const fiche = lireChemin(res.body, op.donnees);
  if (!isRecord(fiche)) throw reponseInattendue(id, res, 'fiche introuvable dans la réponse (voir « donnees » au catalogue)');
  return traduireFiche(reg, fiche, schema, op.correspondances);
}

/**
 * Lit une opération pour une personne, en passant par les sources du catalogue.
 * Le premier registre disponible qui sait fournir les données fait foi ; s'il répond que la
 * personne est inconnue, on ne consulte pas les secours.
 *
 * @param {string} operation Ex : "justice.casier".
 * @param {string} iue
 * @param {string[]|null} [champs] Données voulues ; null pour toutes celles de l'opération.
 * @returns {Promise<object|null>} Données (dictionnaire), ou null si la personne est inconnue.
 * @throws {AppError} 503 REGISTRE_INDISPONIBLE, 502 SERVICE_EN_ERREUR, 500 CATALOGUE_INCOMPLET.
 */
async function lireOperation(operation, iue, champs = null) {
  const schema = catalogue.operations.get(operation);
  const ids = catalogue.sources[operation] || [];
  if (!schema || ids.length === 0) {
    throw new AppError(500, 'CATALOGUE_INCOMPLET', `Aucun registre ne sert l'opération « ${operation} »`);
  }
  const necessaires = champs ? champsNecessaires(schema, champs) : null;
  const indisponibles = [];
  let couverte = false;
  for (const id of ids) {
    const reg = catalogue.registres[id];
    if (champs && !couvre(reg.operations[operation], champs, schema)) continue;
    couverte = true;
    if (reg.etat !== 'actif' || !disponibilite.estDisponible(id)) { indisponibles.push(id); continue; }
    try {
      const donnees = await lireDans(id, reg, operation, iue, necessaires);
      if (donnees === null) return null;
      if (Object.hasOwn(schema, 'iue')) donnees.iue = iue; // l'IUE demandé fait foi
      calculer(schema, donnees);
      return champs ? pick(donnees, champs) : donnees;
    } catch (err) {
      if (err.code !== 'REGISTRE_INDISPONIBLE') throw err;
      indisponibles.push(...err.registres);
    }
  }
  if (!couverte) {
    throw new AppError(500, 'CATALOGUE_INCOMPLET', `Aucun registre de « ${operation} » ne fournit : ${champs.join(', ')}`);
  }
  throw registreIndisponible(indisponibles);
}

// Fonctions utilisées par les services de la passerelle

/** État civil d'une personne (éventuellement restreint à certaines données). */
function getEtatCivil(iue, fields) {
  return lireOperation(ETAT_CIVIL_FICHE, iue, fields || null);
}

/**
 * Liens de filiation : { iue, parents: [{ iue, lien }], enfants: [{ iue, lien }] }.
 * Si aucun registre ne sert « etat-civil.filiation », les parents viennent de pere_iue et
 * mere_iue de la fiche, et la liste des enfants est vide.
 * @returns {Promise<object|null>}
 */
async function getFiliation(iue) {
  if (catalogue.sources[catalogue.FILIATION]) {
    const f = await lireOperation(catalogue.FILIATION, iue, null);
    if (!f) return null;
    return {
      iue,
      parents: (f.parents || []).filter((p) => p.iue && ['pere', 'mere'].includes(p.lien)),
      enfants: (f.enfants || []).filter((e) => e.iue),
    };
  }
  const fiche = await lireOperation(ETAT_CIVIL_FICHE, iue, ['pere_iue', 'mere_iue']);
  if (!fiche) return null;
  const parents = [];
  if (fiche.pere_iue) parents.push({ iue: fiche.pere_iue, lien: 'pere' });
  if (fiche.mere_iue) parents.push({ iue: fiche.mere_iue, lien: 'mere' });
  return { iue, parents, enfants: [] };
}

/**
 * Données d'un domaine pour une liste de champs (lectures groupées par opération).
 * @param {string} domaine 'etat-civil' | 'justice' | 'fiscal'
 * @param {string} iue
 * @param {string[]} fields Données voulues.
 * @returns {Promise<object|null>} null si la personne est absente de toutes les opérations lues.
 * @throws {AppError} 503 REGISTRE_INDISPONIBLE (tous les registres en cause), ou autre erreur.
 */
async function fetchFields(domaine, iue, fields) {
  const parOperation = new Map();
  for (const champ of fields) {
    const def = ((catalogue.dictionnaire.domaines || {})[domaine] || {})[champ];
    if (!def) {
      console.warn(`[passerelle] donnée « ${domaine}.${champ} » absente du dictionnaire : ignorée`);
      continue;
    }
    const op = `${domaine}.${def.operation}`;
    if (!parOperation.has(op)) parOperation.set(op, []);
    parOperation.get(op).push(champ);
  }
  if (parOperation.size === 0) return {};

  const resultats = await Promise.allSettled([...parOperation].map(([op, champs]) => lireOperation(op, iue, champs)));
  const indisponibles = [];
  for (const r of resultats) {
    if (r.status === 'rejected') {
      if (r.reason.code !== 'REGISTRE_INDISPONIBLE') throw r.reason;
      indisponibles.push(...r.reason.registres);
    }
  }
  if (indisponibles.length) throw registreIndisponible(indisponibles);
  const valeurs = resultats.map((r) => r.value);
  if (valeurs.every((v) => v === null)) return null;
  return Object.assign({}, ...valeurs.filter(Boolean));
}

/**
 * Vérifie qu'une pièce existe dans le registre qui la détient (opération du catalogue « pieces »).
 * @param {string} typePieceId Ex : "casier-judiciaire".
 * @param {string} _registre Domaine source (non utilisé : le catalogue fait foi).
 * @param {string} iue Titulaire.
 * @returns {Promise<boolean>}
 */
async function pieceExists(typePieceId, _registre, iue) {
  const op = catalogue.pieces[typePieceId];
  if (!op) throw new AppError(500, 'CATALOGUE_INCOMPLET', `Aucune opération ne lit la pièce « ${typePieceId} »`);
  return (await lireOperation(op, iue, [])) !== null;
}

/**
 * Contenu complet d'une pièce : toutes les données de son opération, sans l'iue
 * (porté par le titulaire).
 * @param {string} typePieceId
 * @param {string} iue
 * @returns {Promise<object|null>} null si le registre ne l'a pas.
 */
async function fetchPiece(typePieceId, iue) {
  const op = catalogue.pieces[typePieceId];
  if (!op) throw new Error(`Aucune opération du catalogue ne lit la pièce « ${typePieceId} »`);
  const donnees = await lireOperation(op, iue, null);
  if (!donnees) return null;
  const { iue: _iue, ...contenu } = donnees;
  return contenu;
}

/**
 * Identité minimale d'une personne à l'état civil.
 * @returns {Promise<{iue: string, nom: string, prenom: string}|null>}
 */
function fetchIdentity(iue) {
  return lireOperation(ETAT_CIVIL_FICHE, iue, MINIMAL_IDENTITY_FIELDS);
}

// Sondes (diagnostic.service.js)

/**
 * Sonde de disponibilité : le registre répond-il sans erreur 5xx dans son délai ?
 * Critère volontairement indépendant du format : il marche pour n'importe quel registre.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function sonder(id) {
  const reg = catalogue.registres[id];
  const { methode, url } = construireUrl(reg, reg.sonde || 'GET /', {});
  try {
    await appeler(id, reg, methode, url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie que les routes d'un registre identifié par l'IUE répondent comme un registre :
 * JSON en 200 ou en « personne inconnue ». Une page non JSON trahit une adresse qui ne mène
 * pas aux routes déclarées (préfixe /api oublié, port d'un autre service...).
 * @param {string} id
 * @returns {Promise<{registre: string, url: string, modele: string, status: 'conforme'|'injoignable'|'non_conforme', detail: string}>}
 */
async function checkRegistry(id) {
  const reg = catalogue.registres[id];
  const base = { registre: id, url: reg.adresse, modele: reg.adresse_modele || reg.adresse };
  const [operation, op] = Object.entries(reg.operations || {})[0] || [];
  if (!op || reg.identification.mode !== 'iue') {
    return { ...base, status: (await sonder(id)) ? 'conforme' : 'injoignable', detail: 'disponibilité seule' };
  }
  let res;
  try {
    const { url } = construireUrl(reg, op.route, { iue: PROBE_IUE });
    res = await request(`registre ${id}`, url, { headers: reg.entetes || {}, timeoutMs: reg.delai_ms });
  } catch {
    return { ...base, status: 'injoignable', detail: 'aucune réponse' };
  }
  if ((res.status === 200 || op.inconnu.includes(res.status)) && isRecord(res.body)) {
    return { ...base, status: 'conforme', detail: `${operation} : HTTP ${res.status} en JSON` };
  }
  return { ...base, status: 'non_conforme', detail: `${operation} : HTTP ${res.status}${isRecord(res.body) ? '' : ', réponse non JSON'}` };
}

/**
 * Teste le branchement d'un registre, opération par opération (commande tester-registre ;
 * conception § 11). Le registre est appelé directement, qu'il soit désigné ou non dans
 * « sources » : on peut ainsi le valider AVANT de l'activer.
 *
 * @param {string} id Registre du catalogue.
 * @param {string} iue Personne d'exemple.
 * @returns {Promise<object>} Rapport : connexion, identification, puis pour chaque opération
 *          les données obtenues (traduites et calculées), manquantes et les champs ignorés.
 * @throws {Error} si le registre n'est pas déclaré au catalogue.
 */
async function diagnostiquer(id, iue) {
  const reg = catalogue.registres[id];
  if (!reg) throw new Error(`Registre « ${id} » absent du catalogue (registres déclarés : ${Object.keys(catalogue.registres).join(', ')})`);
  const rapport = {
    registre: id, nom: reg.nom, adresse: reg.adresse, iue, operations: [],
  };

  const debut = Date.now();
  rapport.connexion = { ok: await sonder(id), ms: Date.now() - debut };
  if (!rapport.connexion.ok) return rapport;

  let personne;
  try {
    personne = await identifier(id, reg, iue);
  } catch (err) {
    rapport.identification = { ok: false, detail: err.message };
    return rapport;
  }
  const mode = reg.identification.mode;
  const commentTrouvee = {
    iue: 'IUE utilisé directement',
    correspondance: `table de correspondance : identifiant local ${personne && personne.identifiant_local}`,
    recherche: `recherche nom + prénom + date : identifiant local ${personne && personne.identifiant_local}`,
  };
  const pourquoiIntrouvable = {
    iue: 'personne inconnue de ce registre',
    correspondance: `IUE absent de la table de correspondance (${reg.identification.table})`,
    recherche: 'personne introuvable (aucun résultat, ou plusieurs : jamais de choix au hasard)',
  };
  rapport.identification = personne
    ? { ok: true, detail: commentTrouvee[mode] }
    : { ok: false, detail: pourquoiIntrouvable[mode] };
  if (!personne) return rapport;

  for (const [operation, op] of Object.entries(reg.operations || {})) {
    const schema = catalogue.operations.get(operation);
    const { methode, url } = construireUrl(reg, op.route, personne);
    let res;
    try {
      res = await appeler(id, reg, methode, url);
    } catch (err) {
      rapport.operations.push({ operation, ok: false, detail: err.message });
      continue;
    }
    if (op.inconnu.includes(res.status)) {
      rapport.operations.push({ operation, ok: false, detail: `HTTP ${res.status} : personne inconnue de ce registre` });
      continue;
    }
    const fiche = res.status === 200 ? lireChemin(res.body, op.donnees) : null;
    if (!isRecord(fiche)) {
      rapport.operations.push({ operation, ok: false, detail: `HTTP ${res.status} : fiche introuvable dans la réponse (voir « donnees »)` });
      continue;
    }
    const donnees = traduireFiche(reg, fiche, schema, op.correspondances);
    if (Object.hasOwn(schema, 'iue')) donnees.iue = iue;
    calculer(schema, donnees);
    const utilises = new Set(op.correspondances
      ? Object.values(op.correspondances).map((c) => String(c.champ).split('.')[0])
      : Object.keys(schema));
    rapport.operations.push({
      operation,
      ok: true,
      http: res.status,
      obtenues: donnees,
      manquantes: Object.keys(schema).filter((k) => donnees[k] === undefined),
      ignores: Object.keys(fiche).filter((k) => !utilises.has(k)),
    });
  }
  return rapport;
}

/**
 * État de chaque registre du catalogue (sans adresse : information publique).
 * @returns {object[]}
 */
function etatRegistres() {
  return Object.entries(catalogue.registres).map(([id, reg]) => {
    const e = disponibilite.etat(id);
    return {
      id,
      nom: reg.nom || id,
      proprietaire: reg.proprietaire || null,
      etat: reg.etat,
      disponibilite: reg.etat === 'actif' ? e.disponibilite : 'hors_service',
      depuis: e.depuis.toISOString(),
      derniere_verification: e.derniere_verification ? e.derniere_verification.toISOString() : null,
      identification: reg.identification.mode,
      operations: Object.keys(reg.operations || {}),
    };
  });
}

module.exports = {
  getEtatCivil,
  getFiliation,
  fetchFields,
  pieceExists,
  fetchPiece,
  fetchIdentity,
  lireOperation,
  sonder,
  checkRegistry,
  diagnostiquer,
  etatRegistres,
  // Exposées pour les tests et la commande tester-registre.
  traduireObjet,
  calculer,
  registreIndisponible,
};
