/**
 * Service Consentements — relais vers le service consentement, mis au format
 * simplifié ConsentementResume attendu par le frontend.
 *
 * Le BFF appelle le consentement avec un jeton de service fabriqué à l'instant
 * (liste `enfants` relue en base) : le tuteur voit et traite les demandes de
 * ses enfants, et perd ce droit dès qu'il a transféré le compte.
 *
 * Chaque demande est complétée par la base légale de sa démarche, lue au catalogue de
 * la passerelle (le service consentement ne la connaît pas) : le citoyen voit en vertu de
 * quoi l'entité demande ses données, et que son accord autorise le partage.
 */
const consentementClient = require('../clients/consentement.client');
const passerelleClient = require('../clients/passerelle.client');
const identiteService = require('./identite.service');
const jetonService = require('./jeton.service');

/**
 * Convertit un Consentement au format ConsentementResume du contrat BFF.
 * Les champs demandés sont aplatis (tous registres confondus) pour l'affichage ;
 * `pour_enfant` indique au tuteur que la demande concerne un de ses enfants.
 *
 * @param {object} c Consentement renvoyé par le service consentement.
 * @param {string} ownIue IUE du citoyen connecté.
 * @param {Map<string, object>} children IUE → identité des enfants.
 * @param {Map<string, object>} bases Identifiant de démarche → base légale.
 * @returns {object}
 */
function toSummary(c, ownIue, children, bases) {
  const child = c.iue_citoyen !== ownIue ? children.get(c.iue_citoyen) : null;
  return {
    id: c.id,
    administration_nom: c.administration.nom,
    administration_type: c.administration.type,
    demarche_nom: c.demarche.nom,
    base_legale: bases.get(c.demarche.id) ?? null,
    champs_demandes: c.champs_demandes.flatMap((item) => item.champs),
    statut: c.statut,
    date_creation: c.date_creation,
    date_expiration: c.date_expiration,
    pour_enfant: child ? { iue: child.iue, nom: child.nom, prenom: child.prenom } : null,
  };
}

/**
 * Base légale de chaque démarche, lue au catalogue de la passerelle. Si la passerelle ne
 * répond pas, les demandes restent affichées, sans base légale (null).
 * @returns {Promise<Map<string, object>>}
 */
async function basesLegales() {
  try {
    const { demarches } = await passerelleClient.listDemarches();
    return new Map(demarches.map((d) => [d.id, d.base_legale ?? null]));
  } catch {
    return new Map();
  }
}

/**
 * Prépare un appel : compte, jeton de service, identités des enfants et bases légales.
 * @param {string} iue
 * @returns {Promise<{account: object, token: string, children: Map<string, object>, bases: Map<string, object>}>}
 */
async function context(iue) {
  const account = await identiteService.getAccount(iue);
  const [token, kids, bases] = await Promise.all([
    jetonService.signForService(account),
    identiteService.getChildren(account),
    basesLegales(),
  ]);
  const children = new Map(kids.map((k) => [k.account.iue, { iue: k.account.iue, nom: k.identity?.nom ?? null, prenom: k.identity?.prenom ?? null }]));
  return {
    account, token, children, bases,
  };
}

/**
 * GET /consentements — demandes du citoyen et de ses enfants.
 * @param {string} iue
 * @param {object} query { statut, page, limite }.
 * @returns {Promise<{consentements: object[], pagination: object}>}
 */
async function list(iue, query) {
  const { token, children, bases } = await context(iue);
  const res = await consentementClient.list(token, query);
  return { consentements: res.consentements.map((c) => toSummary(c, iue, children, bases)), pagination: res.pagination };
}

/**
 * GET /consentements/{id} — détail d'une demande.
 * @returns {Promise<object>} ConsentementResume.
 */
async function get(iue, id) {
  const { token, children, bases } = await context(iue);
  return toSummary(await consentementClient.get(token, id), iue, children, bases);
}

/**
 * PUT /consentements/{id} — le citoyen (ou son tuteur) accepte ou refuse.
 * Les erreurs métier du service consentement (déjà traité, expiré…) sont relayées.
 * @returns {Promise<object>} ConsentementResume mis à jour.
 */
async function answer(iue, id, body) {
  const { token, children, bases } = await context(iue);
  return toSummary(await consentementClient.answer(token, id, body && body.decision), iue, children, bases);
}

/**
 * Nombre de demandes en attente (tableau de bord).
 * @param {object} account
 * @returns {Promise<number>}
 */
async function countPending(account) {
  const { count } = await consentementClient.countPending(await jetonService.signForService(account));
  return count;
}

module.exports = {
  list, get, answer, countPending,
};
