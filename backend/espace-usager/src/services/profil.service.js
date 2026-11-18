/**
 * Service Profil : profil du citoyen connecté, et vue d'ensemble de ce que les registres
 * savent de lui (ou d'un enfant dont il est tuteur).
 */
const identiteService = require('./identite.service');
const demandesService = require('./demandes.service');
const passerelleClient = require('../clients/passerelle.client');
const citoyenModel = require('../models/citoyen.model');
const AppError = require('../utils/AppError');

const IUE_REGEX = /^[0-9]{12}$/;
/** Codes de la passerelle repris tels quels pour une pièce non lue. */
const CODES_PIECE = ['PIECE_INDISPONIBLE', 'REGISTRE_INDISPONIBLE', 'SERVICE_EN_ERREUR'];

/**
 * GET /profil : données de compte et identité d'état civil.
 *
 * Si l'état civil ne connaît pas le citoyen (registre remplacé par celui d'une autre
 * équipe au test d'interopérabilité), le profil reste disponible avec nom et prénom
 * à null, comme à la connexion : le compte, lui, existe toujours.
 *
 * @param {string} iue IUE du citoyen connecté.
 * @returns {Promise<object>} ProfilCitoyen.
 */
async function getProfile(iue) {
  const account = await identiteService.getAccount(iue);
  const [identity, children] = await Promise.all([
    identiteService.getIdentityOrNull(iue),
    citoyenModel.findChildren(account.id),
  ]);
  return {
    iue: account.iue,
    nom: identity?.nom ?? null,
    prenom: identity?.prenom ?? null,
    telephone: account.telephone,
    date_inscription: account.date_inscription.toISOString(),
    est_tuteur: children.length > 0,
    nombre_enfants: children.length,
  };
}

/** @returns {AppError} 404 sans révéler si l'IUE existe. */
function titulaireNonTrouve() {
  return new AppError(404, 'TITULAIRE_NON_TROUVE', 'Aucun titulaire trouvé pour cet IUE');
}

/**
 * Lit une pièce pour la vue d'ensemble : un échec ne fait jamais échouer toute la réponse.
 * @param {string} holderIue Titulaire.
 * @param {object} tp Type de pièce du catalogue.
 * @returns {Promise<object>} { type_piece, disponible, donnees } ou { type_piece, disponible: false, code }.
 */
async function lirePiece(holderIue, tp) {
  const typePiece = { id: tp.id, nom: tp.nom, registre_source: tp.registre_source, est_evolutive: tp.est_evolutive };
  try {
    const piece = await passerelleClient.getPiece(holderIue, tp.id);
    if (!piece) return { type_piece: typePiece, disponible: false, code: 'PIECE_INDISPONIBLE' };
    return { type_piece: typePiece, disponible: true, donnees: piece.donnees };
  } catch (err) {
    // Registre hors service (503) ou réponse inattendue : signalé pour cette pièce seulement.
    return { type_piece: typePiece, disponible: false, code: CODES_PIECE.includes(err.code) ? err.code : 'SERVICE_EN_ERREUR' };
  }
}

/**
 * GET /profil/registres : tout ce que les registres savent du titulaire, en un seul endroit
 * (CLAUDE.md, « Vue d'ensemble de ses données dans les registres »).
 *
 * Règles, les mêmes que pour la consultation d'une pièce : le citoyen consulte ses propres
 * données (pas de minimisation), aucune administration n'y accède (pas d'entrée au journal),
 * rien n'est stocké (registres relus à chaque appel).
 *
 * @param {string} iue IUE du citoyen connecté.
 * @param {{iue?: string}} query `iue` d'un enfant dont il est ACTUELLEMENT tuteur.
 * @returns {Promise<object>} VueRegistres du contrat.
 * @throws {AppError} 404 TITULAIRE_NON_TROUVE (ni lui ni un enfant sous sa tutelle, ou inconnu
 *         de l'état civil) ; 503 REGISTRE_INDISPONIBLE si l'état civil est hors service (sans
 *         identité, rien n'est lu) ; 502 si la passerelle ne répond pas.
 */
async function getRegistryOverview(iue, query = {}) {
  const account = await identiteService.getAccount(iue);
  const holderIue = query.iue || account.iue;
  if (!IUE_REGEX.test(holderIue) || !(await demandesService.canReadPiecesOf(account, holderIue))) {
    throw titulaireNonTrouve();
  }

  const identity = await identiteService.getIdentity(holderIue);
  if (!identity) throw titulaireNonTrouve();

  // Catalogue lu à chaque fois : une pièce ajoutée au catalogue apparaît d'elle-même.
  const { types_pieces: types } = await passerelleClient.listTypesPieces();
  const pieces = await Promise.all(types.map((tp) => lirePiece(holderIue, tp)));

  return {
    titulaire: { iue: identity.iue, nom: identity.nom, prenom: identity.prenom },
    pieces,
    date_consultation: new Date().toISOString(),
  };
}

module.exports = { getProfile, getRegistryOverview };
