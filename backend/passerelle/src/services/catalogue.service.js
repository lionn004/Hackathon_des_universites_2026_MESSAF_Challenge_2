/**
 * Service Catalogue — démarches, types de pièces, arbres de prérequis, administrations.
 *
 * Les champs requis d'une démarche (champs_requis) sont lus auprès du service
 * consentement, propriétaire des règles de minimisation : le catalogue ne les
 * duplique pas.
 */
const catalogueModel = require('../models/catalogue.model');
const consentementClient = require('../clients/consentement.client');
const AppError = require('../utils/AppError');

/** Garde-fou contre un arbre mal configuré (cycle dans les prérequis). */
const MAX_DEPTH = 6;

/**
 * Convertit une démarche au format Demarche du contrat.
 * @param {object} demarche Démarche avec administration et pièces.
 * @returns {Promise<object>}
 */
async function toContract(demarche) {
  return {
    id: demarche.id,
    nom: demarche.nom,
    description: demarche.description,
    administration_cible: demarche.administration.nom,
    champs_requis: await consentementClient.getRules(demarche.id),
    prerequis_pieces: demarche.pieces.map((p) => p.type_piece_id),
  };
}

/**
 * GET /demarches — catalogue complet.
 * @returns {Promise<{demarches: object[]}>}
 */
async function listDemarches() {
  const demarches = await catalogueModel.findAllDemarches();
  return { demarches: await Promise.all(demarches.map(toContract)) };
}

/**
 * Charge une démarche brute (usage interne au backend de la passerelle).
 * @param {string} id
 * @returns {Promise<object>} Démarche avec administration et pièces.
 * @throws {AppError} 404 DEMARCHE_INCONNUE
 */
async function findDemarcheOrFail(id) {
  const demarche = await catalogueModel.findDemarche(id);
  if (!demarche) throw new AppError(404, 'DEMARCHE_INCONNUE', `Démarche « ${id} » inconnue`);
  return demarche;
}

/**
 * GET /demarches/{id} — détail d'une démarche.
 * @param {string} id
 * @returns {Promise<object>} Demarche.
 * @throws {AppError} 404 DEMARCHE_INCONNUE
 */
async function getDemarche(id) {
  return toContract(await findDemarcheOrFail(id));
}

/**
 * GET /types-pieces : catalogue des types de pièces, avec la démarche à suivre quand une
 * pièce n'est pas encore numérisée (`demarche_si_absente`, null si aucune n'est connue).
 * @returns {Promise<{types_pieces: object[]}>}
 */
async function listTypesPieces() {
  const pieces = await catalogueModel.findAllTypesPieces();
  return {
    types_pieces: pieces.map((p) => ({
      id: p.id,
      nom: p.nom,
      registre_source: p.registre_source,
      est_evolutive: p.est_evolutive,
      demarche_si_absente: p.demarche_si_absente ?? null,
    })),
  };
}

/**
 * GET /types-pieces/{id}/prerequis — arbre complet des dépendances (ArbrePrerequis).
 * @param {string} id Type de pièce racine.
 * @returns {Promise<{type_piece: string, prerequis: object[]}>}
 * @throws {AppError} 404 TYPE_PIECE_INCONNU
 */
async function getPrerequisTree(id) {
  const root = await catalogueModel.findTypePieceWithPrerequis(id);
  if (!root) throw new AppError(404, 'TYPE_PIECE_INCONNU', `Type de pièce « ${id} » inconnu`);

  /** Construit récursivement les sous-prérequis d'une pièce. */
  async function children(piece, depth) {
    if (depth > MAX_DEPTH) return [];
    return Promise.all(piece.prerequis.map(async (p) => {
      const child = await catalogueModel.findTypePieceWithPrerequis(p.prerequis_id);
      return {
        type_piece: p.prerequis_id,
        proprietaire: p.proprietaire,
        prerequis: child ? await children(child, depth + 1) : [],
      };
    }));
  }

  return { type_piece: root.id, prerequis: await children(root, 0) };
}

/**
 * GET /administrations — administrations connues de la plateforme
 * (utilisé par l'interface de test du BFF).
 * @returns {Promise<{administrations: object[]}>}
 */
async function listAdministrations() {
  const admins = await catalogueModel.findAllAdministrations();
  return {
    administrations: admins.map((a) => ({
      id: a.id, nom: a.nom, type: a.type, domaine_mission: a.domaine_mission,
    })),
  };
}

module.exports = {
  listDemarches, getDemarche, findDemarcheOrFail, listTypesPieces, getPrerequisTree, listAdministrations,
};
