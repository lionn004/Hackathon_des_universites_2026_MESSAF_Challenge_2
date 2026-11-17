/**
 * Service Journal — logique métier du journal de traçabilité.
 *
 * Responsabilités :
 *  - valider et enregistrer les accès envoyés par la passerelle (NouvelAcces) ;
 *  - déterminer quelles entrées un citoyen a le droit de voir ;
 *  - appliquer les filtres et la pagination du contrat ;
 *  - calculer les statistiques du tableau de bord ;
 *  - convertir les entrées au format EntreeJournal (docs/openapi-journal.yaml).
 *
 * Ce fichier ne connaît ni req ni res : il est appelé par le controller
 * et utilise le model pour accéder aux données.
 */
const journalModel = require('../models/journalAcces.model');
const AppError = require('../utils/AppError');

/** Format officiel de l'IUE : exactement 12 chiffres. */
const IUE_REGEX = /^[0-9]{12}$/;
/** UUID (toutes versions), format 8-4-4-4-12 en hexadécimal. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Date AAAA-MM-JJ (ISO 8601) pour les filtres date_debut / date_fin. */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const REGISTRES = ['etat-civil', 'justice', 'fiscal'];
const TYPES_ACCES = ['direct', 'consentement'];
const TYPES_ADMINISTRATION = ['publique', 'privee'];

const DEFAULT_PAGE_SIZE = 20;
/** Plafond de la taille de page : évite qu'un client demande tout le journal d'un coup. */
const MAX_PAGE_SIZE = 100;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Lève une erreur 400 de validation.
 * @param {string} message Explication lisible du problème.
 * @throws {AppError}
 */
function invalid(message) {
  throw new AppError(400, 'DONNEES_INVALIDES', message);
}

/**
 * Vérifie qu'une valeur est un tableau de chaînes non vides.
 * @param {*} value
 * @returns {boolean}
 */
function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.trim() !== '');
}

/**
 * Valide le corps NouvelAcces envoyé par la passerelle.
 * Les champs requis sont ceux du contrat ; administration_nom,
 * administration_type et demarche_nom sont facultatifs (photo figée des noms).
 *
 * @param {object} body Corps de la requête.
 * @throws {AppError} 400 DONNEES_INVALIDES en précisant le premier champ fautif.
 */
function validateNewAccess(body) {
  if (!body || typeof body !== 'object') invalid('Corps de requête manquant');
  const b = body;

  if (!IUE_REGEX.test(b.titulaire_iue || '')) invalid('titulaire_iue doit contenir 12 chiffres');
  if (!IUE_REGEX.test(b.decideur_iue || '')) invalid('decideur_iue doit contenir 12 chiffres');
  if (!UUID_REGEX.test(b.administration_id || '')) invalid('administration_id doit être un UUID');
  if (typeof b.demarche_id !== 'string' || b.demarche_id.trim() === '') invalid('demarche_id est requis');
  if (b.requete_id != null && !UUID_REGEX.test(b.requete_id)) invalid('requete_id doit être un UUID');

  if (!isStringArray(b.registres_consultes) || b.registres_consultes.length === 0
    || !b.registres_consultes.every((r) => REGISTRES.includes(r))) {
    invalid(`registres_consultes doit être une liste non vide parmi : ${REGISTRES.join(', ')}`);
  }
  // Une liste vide est acceptée : un accès refusé (consentement refusé) se trace sans champ transmis.
  if (!isStringArray(b.champs_transmis)) invalid('champs_transmis doit être une liste de noms de champs');
  if (!TYPES_ACCES.includes(b.type_acces)) invalid(`type_acces doit valoir : ${TYPES_ACCES.join(' ou ')}`);

  if (b.administration_type != null && !TYPES_ADMINISTRATION.includes(b.administration_type)) {
    invalid(`administration_type doit valoir : ${TYPES_ADMINISTRATION.join(' ou ')}`);
  }
  for (const field of ['administration_nom', 'demarche_nom']) {
    if (b[field] != null && typeof b[field] !== 'string') invalid(`${field} doit être une chaîne`);
  }
}

/**
 * Convertit une entrée de la base au format EntreeJournal du contrat.
 * Si la passerelle n'a pas fourni le nom de la démarche, on affiche son
 * identifiant plutôt que rien.
 *
 * @param {object} entry Enregistrement brut.
 * @returns {object} EntreeJournal.
 */
function toContract(entry) {
  return {
    id: entry.id,
    titulaire_iue: entry.titulaire_iue,
    decideur_iue: entry.decideur_iue,
    administration: {
      id: entry.administration_id,
      nom: entry.administration_nom,
      type: entry.administration_type,
    },
    demarche: entry.demarche_nom || entry.demarche_id,
    registres_consultes: entry.registres_consultes,
    champs_transmis: entry.champs_transmis,
    type_acces: entry.type_acces,
    date_acces: entry.date_acces.toISOString(),
  };
}

/**
 * Filtre « entrées visibles par ce citoyen ».
 *
 * Règle : un citoyen voit les accès à SES données (il en est le titulaire)
 * ET les accès qu'il a autorisés en tant que décideur. Comme le décideur
 * d'un mineur est son tuteur, cela couvre les données de ses enfants
 * sans que le journal ait besoin de connaître les liens familiaux.
 *
 * @param {string} iue IUE du citoyen connecté.
 * @returns {object} Clause where Prisma.
 */
function visibleTo(iue) {
  return { OR: [{ titulaire_iue: iue }, { decideur_iue: iue }] };
}

/**
 * Lit un entier positif dans la query string.
 * @param {string|undefined} raw Valeur brute.
 * @param {number} fallback Valeur par défaut si absente.
 * @param {string} name Nom du paramètre (pour le message d'erreur).
 * @returns {number}
 * @throws {AppError} 400 si la valeur n'est pas un entier >= 1.
 */
function parsePositiveInt(raw, fallback, name) {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) invalid(`${name} doit être un entier supérieur ou égal à 1`);
  return n;
}

/**
 * Lit une date AAAA-MM-JJ dans la query string.
 * @param {string|undefined} raw
 * @param {string} name Nom du paramètre (pour le message d'erreur).
 * @returns {Date|null} Minuit UTC de ce jour, ou null si absent.
 * @throws {AppError} 400 si le format est invalide.
 */
function parseDate(raw, name) {
  if (raw === undefined || raw === '') return null;
  const date = new Date(raw);
  if (!DATE_REGEX.test(raw) || Number.isNaN(date.getTime())) invalid(`${name} doit être une date AAAA-MM-JJ`);
  return date;
}

/**
 * POST /journal/enregistrer — enregistre un accès (appelé par la passerelle).
 * @param {object} body Corps NouvelAcces.
 * @returns {Promise<object>} L'EntreeJournal créée.
 * @throws {AppError} 400 si le corps est invalide.
 */
async function recordAccess(body) {
  validateNewAccess(body);
  const entry = await journalModel.create({
    titulaire_iue: body.titulaire_iue,
    decideur_iue: body.decideur_iue,
    administration_id: body.administration_id,
    administration_nom: body.administration_nom ?? null,
    administration_type: body.administration_type ?? null,
    demarche_id: body.demarche_id,
    demarche_nom: body.demarche_nom ?? null,
    requete_id: body.requete_id ?? null,
    registres_consultes: body.registres_consultes,
    champs_transmis: body.champs_transmis,
    type_acces: body.type_acces,
  });
  return toContract(entry);
}

/**
 * GET /journal — journal d'accès du citoyen connecté, filtré et paginé.
 *
 * date_fin est inclusive : « jusqu'au 15 » inclut toute la journée du 15,
 * d'où la borne stricte au lendemain minuit.
 *
 * @param {string} iue IUE du citoyen connecté (issu du jeton).
 * @param {object} query Paramètres bruts : date_debut, date_fin, administration, page, limite.
 * @returns {Promise<{entrees: object[], pagination: {page: number, limite: number, total: number, pages: number}}>}
 * @throws {AppError} 400 si un paramètre est invalide.
 */
async function listForCitizen(iue, query) {
  const page = parsePositiveInt(query.page, 1, 'page');
  const limit = Math.min(parsePositiveInt(query.limite, DEFAULT_PAGE_SIZE, 'limite'), MAX_PAGE_SIZE);
  const from = parseDate(query.date_debut, 'date_debut');
  const to = parseDate(query.date_fin, 'date_fin');
  if (from && to && from > to) invalid('date_debut doit être antérieure ou égale à date_fin');

  const where = { AND: [visibleTo(iue)] };
  if (from || to) {
    where.AND.push({
      date_acces: {
        ...(from && { gte: from }),
        ...(to && { lt: new Date(to.getTime() + ONE_DAY_MS) }),
      },
    });
  }
  if (query.administration) {
    // Recherche partielle et insensible à la casse : "banque" trouve "Banque Atlantique".
    // Attention, les accents comptent : "universite" ne trouve pas "Université".
    where.AND.push({ administration_nom: { contains: query.administration, mode: 'insensitive' } });
  }

  const { entries, total } = await journalModel.findPage(where, (page - 1) * limit, limit);
  return {
    entrees: entries.map(toContract),
    pagination: { page, limite: limit, total, pages: Math.ceil(total / limit) },
  };
}

/**
 * GET /journal/statistiques — résumé des accès pour le tableau de bord.
 * Les accès sans nom d'administration (passerelle n'ayant pas envoyé la photo
 * figée) sont regroupés sous « Administration inconnue ».
 *
 * @param {string} iue IUE du citoyen connecté.
 * @returns {Promise<{total_acces: number, acces_30_derniers_jours: number, par_administration: object[]}>}
 */
async function statsForCitizen(iue) {
  const visible = visibleTo(iue);
  const since = new Date(Date.now() - 30 * ONE_DAY_MS);

  const [total, last30Days, groups] = await Promise.all([
    journalModel.count(visible),
    journalModel.count({ AND: [visible, { date_acces: { gte: since } }] }),
    journalModel.countByAdministration(visible),
  ]);

  return {
    total_acces: total,
    acces_30_derniers_jours: last30Days,
    par_administration: groups.map((g) => ({
      administration: g.administration_nom ?? 'Administration inconnue',
      nombre_acces: g._count._all,
    })),
  };
}

module.exports = { recordAccess, listForCitizen, statsForCitizen };
