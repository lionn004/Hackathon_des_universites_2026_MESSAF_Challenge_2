/**
 * Service Minimisation — filtre les données d'un registre selon la démarche.
 *
 * Principe unique (voir CLAUDE.md, couche 3) : chaque démarche déclare,
 * par registre, la liste exhaustive des champs dont elle a besoin. Le filtre
 * laisse passer ces champs et RIEN d'autre. Il n'y a pas de « mode complet » :
 * une démarche qui a besoin de tout liste simplement tous les champs.
 *
 * Ce fichier ne connaît ni req ni res : il est appelé par le controller
 * et utilise le model pour lire les règles.
 */
const champsDemarcheModel = require('../models/champsDemarche.model');
const AppError = require('../utils/AppError');
const { REGISTRES, invalid, isNonEmptyString } = require('../utils/validation');

/**
 * Valide le corps de POST /minimisation/filtrer.
 * @param {object} body
 * @throws {AppError} 400 DONNEES_INVALIDES
 */
function validateFilterRequest(body) {
  if (!body || typeof body !== 'object') invalid('Corps de requête manquant');
  if (!isNonEmptyString(body.demarche_id)) invalid('demarche_id est requis');
  if (!REGISTRES.includes(body.registre)) invalid(`registre doit valoir : ${REGISTRES.join(', ')}`);
  const raw = body.donnees_brutes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid('donnees_brutes doit être un objet');
}

/**
 * POST /minimisation/filtrer — applique la règle de la démarche aux données brutes.
 *
 * Cas particuliers :
 *  - démarche inconnue (aucune règle) → 404 : mieux vaut refuser que tout bloquer
 *    ou tout laisser passer sans le dire ;
 *  - démarche connue mais aucune règle pour CE registre → rien n'est transmis
 *    (objet vide) : la démarche n'a pas besoin de ce registre ;
 *  - champ autorisé mais absent des données brutes → il n'apparaît pas dans
 *    champs_filtres, qui liste uniquement ce qui a réellement été transmis.
 *
 * @param {object} body { demarche_id, registre, donnees_brutes }.
 * @returns {Promise<{donnees_filtrees: object, champs_filtres: string[]}>}
 * @throws {AppError} 400 si le corps est invalide, 404 DEMARCHE_INCONNUE.
 */
async function filter(body) {
  validateFilterRequest(body);
  const { demarche_id: demarcheId, registre, donnees_brutes: raw } = body;

  const rule = await champsDemarcheModel.findRule(demarcheId, registre);
  if (!rule && !(await champsDemarcheModel.demarcheExists(demarcheId))) {
    throw new AppError(404, 'DEMARCHE_INCONNUE', `Aucune règle de minimisation pour la démarche « ${demarcheId} »`);
  }

  const allowed = rule ? rule.champs : [];
  // hasOwnProperty : on ne transmet que les champs réellement présents dans les données.
  const transmitted = allowed.filter((field) => Object.prototype.hasOwnProperty.call(raw, field));

  return {
    donnees_filtrees: Object.fromEntries(transmitted.map((field) => [field, raw[field]])),
    champs_filtres: transmitted,
  };
}

/**
 * GET /minimisation/regles/{demarche_id} — règles d'une démarche (interne).
 *
 * Utilisé par la passerelle pour savoir quels registres interroger, quels champs
 * demander au citoyen, et pour afficher champs_requis dans son catalogue.
 * Ce service reste ainsi l'unique source de vérité des règles de minimisation.
 *
 * @param {string} demarcheId
 * @returns {Promise<{demarche_id: string, champs_requis: Array<{registre: string, champs: string[]}>}>}
 * @throws {AppError} 404 DEMARCHE_INCONNUE si aucune règle n'existe.
 */
async function getRules(demarcheId) {
  const rules = await champsDemarcheModel.findRulesForDemarche(demarcheId);
  if (rules.length === 0) {
    throw new AppError(404, 'DEMARCHE_INCONNUE', `Aucune règle de minimisation pour la démarche « ${demarcheId} »`);
  }
  return {
    demarche_id: demarcheId,
    champs_requis: rules.map((r) => ({ registre: r.registre, champs: r.champs })),
  };
}

module.exports = { filter, getRules };
