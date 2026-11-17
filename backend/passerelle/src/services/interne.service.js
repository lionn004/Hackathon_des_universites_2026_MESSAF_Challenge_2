/**
 * Service Interne — fonctions de la passerelle réservées au BFF espace usager.
 *
 * Le BFF n'interroge jamais les registres directement (README : registres
 * consommés par la passerelle uniquement). Il passe par ces deux fonctions :
 *  - identity : nom, prénom, âge et enfants d'un citoyen, pour son espace
 *    personnel (profil, enfants, règle des 15 ans) ;
 *  - cascadeForPiece : résolution en cascade d'une pièce demandée par le citoyen.
 *
 * Ces consultations concernent le citoyen lui-même, dans son propre espace :
 * aucune administration n'accède aux données, elles ne sont donc pas
 * inscrites au journal de traçabilité.
 */
const registresClient = require('../clients/registres.client');
const catalogueModel = require('../models/catalogue.model');
const cascadeService = require('./cascade.service');
const AppError = require('../utils/AppError');
const { IUE_REGEX, invalid, isNonEmptyString } = require('../utils/validation');

/** Champs d'identité demandés au registre état-civil (rien de plus). */
const IDENTITY_FIELDS = ['iue', 'nom', 'prenom', 'date_naissance', 'est_majeur'];

/**
 * Lit l'identité d'un citoyen à l'état civil.
 * @param {string} iue
 * @returns {Promise<object|null>} { iue, nom, prenom, date_naissance, est_majeur } ou null.
 */
function readIdentity(iue) {
  return registresClient.getEtatCivil(iue, IDENTITY_FIELDS);
}

/**
 * GET /interne/citoyens/{iue} — identité d'un citoyen et de ses enfants.
 * @param {string} iue
 * @returns {Promise<object>} Identité + enfants [{ iue, nom, prenom, date_naissance, est_majeur }].
 * @throws {AppError} 404 CITOYEN_NON_TROUVE
 */
async function identity(iue) {
  const person = IUE_REGEX.test(iue) ? await readIdentity(iue) : null;
  if (!person) throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');

  const filiation = await registresClient.getFiliation(iue);
  const children = await Promise.all((filiation?.enfants || []).map((e) => readIdentity(e.iue)));
  return { ...person, enfants: children.filter(Boolean) };
}

/**
 * POST /interne/cascade — résout la cascade d'une pièce demandée par un citoyen.
 *
 * Statut global : « complete » si toutes les pièces de l'arbre sont trouvées,
 * « fallback_physique » si au moins une manque (le citoyen doit passer au guichet).
 *
 * @param {object} body { type_piece_id, iue }.
 * @returns {Promise<{type_piece: {id: string, nom: string}, statut: string, cascade: object[]}>}
 * @throws {AppError} 400 corps invalide, 404 TYPE_PIECE_INCONNU / CITOYEN_NON_TROUVE.
 */
async function cascadeForPiece(body) {
  if (!body || !IUE_REGEX.test(body.iue || '')) invalid('iue doit contenir 12 chiffres');
  if (!isNonEmptyString(body.type_piece_id)) invalid('type_piece_id est requis');

  const piece = await catalogueModel.findTypePieceWithPrerequis(body.type_piece_id);
  if (!piece) throw new AppError(404, 'TYPE_PIECE_INCONNU', `Type de pièce « ${body.type_piece_id} » inconnu`);
  if (!(await registresClient.pieceExists('extrait-naissance', 'etat-civil', body.iue))) {
    throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
  }

  const trees = await cascadeService.resolveTrees([piece.id], body.iue);
  let complete = true;
  /** Vrai seulement si le nœud et tous ses descendants sont résolus. */
  const check = (node) => {
    if (node.statut !== 'resolu') complete = false;
    node.sous_prerequis.forEach(check);
  };
  trees.forEach(check);

  return {
    type_piece: { id: piece.id, nom: piece.nom },
    statut: complete ? 'complete' : 'fallback_physique',
    cascade: trees.map(cascadeService.stripKeys),
  };
}

module.exports = { identity, cascadeForPiece };
