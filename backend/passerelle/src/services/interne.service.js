/**
 * Service Interne — fonctions de la passerelle réservées au BFF espace usager.
 *
 * Le BFF n'interroge jamais les registres directement (README : registres
 * consommés par la passerelle uniquement). Il passe par ces trois fonctions :
 *  - identity : nom, prénom, âge et enfants d'un citoyen, pour son espace
 *    personnel (profil, enfants, règle des 15 ans) ;
 *  - cascadeForPiece : résolution en cascade d'une pièce demandée par le citoyen ;
 *  - readPiece : contenu d'une pièce, pour que le citoyen la consulte et l'imprime.
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
/** Seule pièce qui mentionne d'autres personnes : les parents du titulaire. */
const EXTRAIT_NAISSANCE = 'extrait-naissance';

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

/**
 * Erreur commune : la pièce, ou son titulaire, est absente du registre.
 * @returns {AppError}
 */
function pieceUnavailable() {
  return new AppError(404, 'PIECE_INDISPONIBLE', 'Pièce absente du registre : elle doit être retirée au guichet');
}

/**
 * Identité minimale d'un parent mentionné sur un extrait de naissance.
 * L'IUE vient du registre (peut-être celui d'une autre équipe) : il est
 * vérifié avant d'être placé dans une URL.
 *
 * @param {string|null|undefined} iue IUE du parent lu dans l'extrait.
 * @returns {Promise<object|null>|null} { iue, nom, prenom }, ou null si le parent
 *          n'est pas renseigné ou est inconnu de l'état civil.
 */
function readParent(iue) {
  return IUE_REGEX.test(iue || '') ? registresClient.fetchIdentity(iue) : null;
}

/**
 * GET /interne/citoyens/{iue}/pieces/{type_piece_id} — contenu d'une pièce du citoyen.
 *
 * Règles (CLAUDE.md, « Consultation et téléchargement de ses pièces ») :
 *  - le registre est relu à chaque appel, aucune copie n'est stockée : une
 *    pièce évolutive (casier, situation fiscale) est toujours à jour ;
 *  - ni minimisation ni journal : le citoyen (ou son tuteur) consulte ses
 *    propres données, aucune administration n'y accède.
 *
 * Réponse :
 *  - type_piece : la fiche du catalogue, pour que le BFF n'ait qu'un appel à faire ;
 *  - titulaire : { iue, nom, prenom }, toujours lu à l'état civil, car le casier,
 *    le certificat de nationalité et la situation fiscale ne portent pas le nom ;
 *  - donnees : les champs du schéma du registre, sans l'iue (déjà dans titulaire).
 *    Pour l'extrait de naissance, pere et mere ({ iue, nom, prenom } ou null)
 *    remplacent pere_iue et mere_iue.
 *
 * @param {string} iue Titulaire de la pièce.
 * @param {string} typePieceId Ex : "casier-judiciaire".
 * @returns {Promise<{type_piece: object, titulaire: object, donnees: object}>}
 * @throws {AppError} 404 TYPE_PIECE_INCONNU ; 404 PIECE_INDISPONIBLE si la pièce ou son
 *                    titulaire est absent du registre (IUE mal formé compris, comme pour
 *                    /interne/citoyens/{iue}) ; 502 si un registre ne répond pas.
 */
async function readPiece(iue, typePieceId) {
  const piece = await catalogueModel.findTypePiece(typePieceId);
  if (!piece) throw new AppError(404, 'TYPE_PIECE_INCONNU', `Type de pièce « ${typePieceId} » inconnu`);
  if (!IUE_REGEX.test(iue)) throw pieceUnavailable();

  const [content, titulaire] = await Promise.all([
    registresClient.fetchPiece(piece.id, iue),
    registresClient.fetchIdentity(iue),
  ]);
  // Sans titulaire connu de l'état civil, la pièce ne peut pas être présentée.
  if (!content || !titulaire) throw pieceUnavailable();

  let donnees = content;
  if (piece.id === EXTRAIT_NAISSANCE) {
    const { pere_iue: fatherIue, mere_iue: motherIue, ...rest } = content;
    const [pere, mere] = await Promise.all([readParent(fatherIue), readParent(motherIue)]);
    donnees = { ...rest, pere, mere };
  }

  return {
    type_piece: {
      id: piece.id,
      nom: piece.nom,
      registre_source: piece.registre_source,
      est_evolutive: piece.est_evolutive,
    },
    titulaire,
    donnees,
  };
}

module.exports = { identity, cascadeForPiece, readPiece };
