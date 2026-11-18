/**
 * Service Catalogue — pièces que le citoyen peut demander.
 *
 * Le catalogue appartient à la passerelle : le BFF le lit et l'enrichit pour
 * le frontend. Pour chaque pièce, il ajoute l'arbre des prérequis (avec les
 * noms lisibles), pour que le citoyen voie à l'avance ce que la plateforme ira
 * chercher automatiquement à sa place (principe « Dites-le-nous une fois »).
 */
const passerelleClient = require('../clients/passerelle.client');

/**
 * Ajoute les noms lisibles à un arbre de prérequis, récursivement.
 * @param {object[]} nodes Nœuds { type_piece, proprietaire, prerequis }.
 * @param {Map<string, string>} names id du type de pièce → nom.
 * @returns {object[]}
 */
function withNames(nodes, names) {
  return nodes.map((n) => ({
    type_piece: n.type_piece,
    nom: names.get(n.type_piece) || n.type_piece,
    proprietaire: n.proprietaire,
    prerequis: withNames(n.prerequis || [], names),
  }));
}

/**
 * GET /types-pieces — catalogue des pièces, chacune avec ses prérequis.
 * Un appel à la passerelle par pièce : le catalogue ne compte que quelques
 * types de pièces, les appels sont faits en parallèle.
 *
 * @returns {Promise<{types_pieces: object[]}>}
 */
async function listTypesPieces() {
  const { types_pieces: pieces } = await passerelleClient.listTypesPieces();
  const names = new Map(pieces.map((p) => [p.id, p.nom]));
  const trees = await Promise.all(pieces.map((p) => passerelleClient.getPrerequisTree(p.id)));

  return {
    types_pieces: pieces.map((p, i) => ({
      id: p.id,
      nom: p.nom,
      registre_source: p.registre_source,
      est_evolutive: p.est_evolutive,
      // Démarche affichée au citoyen quand cette pièce manque dans son registre numérique.
      demarche_si_absente: p.demarche_si_absente ?? null,
      prerequis: withNames(trees[i].prerequis, names),
    })),
  };
}

/**
 * GET /registres : état des registres branchés à la plateforme (relais de la passerelle).
 * Information publique, sans donnée citoyenne : l'espace usager l'affiche pendant une panne.
 * @returns {Promise<object>}
 */
function getRegistres() {
  return passerelleClient.getRegistres();
}

/**
 * GET /dictionnaire : données de la plateforme et leurs libellés (relais de la passerelle).
 * Le journal du citoyen affiche « Majeur » plutôt que « est_majeur ».
 * @returns {Promise<object>}
 */
function getDictionnaire() {
  return passerelleClient.getDictionnaire();
}

module.exports = { listTypesPieces, getRegistres, getDictionnaire };
