/**
 * Service Journal — relais vers le journal de traçabilité, mis au format
 * EntreeJournal simplifié attendu par le frontend.
 */
const journalClient = require('../clients/journal.client');
const identiteService = require('./identite.service');
const jetonService = require('./jeton.service');

/**
 * Convertit une entrée du journal au format du contrat BFF.
 * `pour_enfant` est rempli quand l'accès concernait un enfant du citoyen.
 *
 * @param {object} e Entrée renvoyée par le service journal.
 * @param {string} ownIue IUE du citoyen connecté.
 * @param {Map<string, object>} children IUE → identité des enfants.
 * @returns {object}
 */
function toContract(e, ownIue, children) {
  let child = null;
  if (e.titulaire_iue !== ownIue) {
    const identity = children.get(e.titulaire_iue);
    child = { iue: e.titulaire_iue, nom: identity ? [identity.prenom, identity.nom].filter(Boolean).join(' ') : null };
  }
  return {
    id: e.id,
    administration_nom: e.administration.nom,
    administration_type: e.administration.type,
    demarche: e.demarche,
    champs_consultes: e.champs_transmis,
    type_acces: e.type_acces,
    // En vertu de quoi l'accès a eu lieu (photo figée au moment de l'accès ; null avant son introduction).
    base_legale: e.base_legale ?? null,
    pour_enfant: child,
    date_acces: e.date_acces,
  };
}

/**
 * GET /journal — journal d'accès du citoyen (et de ses enfants).
 * @param {string} iue
 * @param {object} query { date_debut, date_fin, page, limite }.
 * @returns {Promise<{entrees: object[], pagination: object}>}
 */
async function list(iue, query) {
  const account = await identiteService.getAccount(iue);
  const [token, kids] = await Promise.all([jetonService.signForService(account), identiteService.getChildren(account)]);
  const children = new Map(kids.map((k) => [k.account.iue, k.identity]));

  const res = await journalClient.list(token, {
    date_debut: query.date_debut, date_fin: query.date_fin, page: query.page, limite: query.limite,
  });
  return { entrees: res.entrees.map((e) => toContract(e, iue, children)), pagination: res.pagination };
}

/**
 * Statistiques d'accès (tableau de bord).
 * @param {object} account
 * @returns {Promise<object>} { total_acces, acces_30_derniers_jours, par_administration }.
 */
async function stats(account) {
  return journalClient.stats(await jetonService.signForService(account));
}

/**
 * GET /journal/verification : intégrité du journal (chaîne des empreintes), relayée telle
 * quelle : le service journal ne renvoie aucune donnée d'un autre citoyen.
 * @param {string} iue Citoyen connecté.
 * @returns {Promise<object>} VerificationJournal.
 */
async function verify(iue) {
  const account = await identiteService.getAccount(iue);
  return journalClient.verify(await jetonService.signForService(account));
}

module.exports = { list, stats, verify };
