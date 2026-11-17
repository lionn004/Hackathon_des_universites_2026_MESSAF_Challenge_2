/**
 * Service Cascade — résolution automatique des chaînes de dépendances.
 *
 * Exemple (CLAUDE.md) — Amadou demande un casier judiciaire :
 *   Casier judiciaire (Amadou)
 *     └── Certificat de nationalité (Amadou)
 *          ├── Extrait de naissance (Amadou)
 *          ├── Extrait de naissance (père d'Amadou)
 *          └── Extrait de naissance (mère d'Amadou)
 *
 * Pour chaque pièce de l'arbre, on détermine son titulaire (le citoyen, ou
 * son père / sa mère via le registre état-civil), puis on vérifie que la pièce
 * existe dans le registre qui la détient :
 *  - trouvée → « resolu » ;
 *  - titulaire inconnu (parent non enregistré) ou pièce absente →
 *    « manquant_fallback_physique » : le citoyen devra présenter le document au guichet.
 *
 * Deux formes de résultat :
 *  - resolveTrees : l'arbre complet (demandes de pièces des citoyens, via le BFF) ;
 *  - resolve : une liste à plat sans doublon (requêtes des administrations, contrat RequeteResultat).
 * Une pièce manquante n'empêche pas la transmission des données : la cascade
 * informe de ce qui reste à fournir physiquement.
 */
const catalogueModel = require('../models/catalogue.model');
const registresClient = require('../clients/registres.client');

/** Garde-fou contre un arbre mal configuré (cycle dans les prérequis). */
const MAX_DEPTH = 6;

/**
 * Construit l'arbre de résolution de plusieurs pièces racines pour un citoyen.
 *
 * Chaque vérification (pièce, titulaire) n'est faite qu'une fois par appel,
 * même si la même pièce apparaît à plusieurs endroits de l'arbre.
 *
 * @param {string[]} rootPieceIds Pièces racines.
 * @param {string} iue Citoyen concerné (titulaire des pièces racines).
 * @returns {Promise<object[]>} Un nœud par racine :
 *   { type_piece, proprietaire, registre_source, statut, sous_prerequis: [...], cle }
 *   `cle` identifie le couple (pièce, titulaire) ; il sert au dédoublonnage de resolve().
 */
async function resolveTrees(rootPieceIds, iue) {
  const pieceCache = new Map();
  const parentsCache = new Map();
  const existsCache = new Map();

  /** Charge un type de pièce une seule fois par résolution. */
  async function loadPiece(id) {
    if (!pieceCache.has(id)) pieceCache.set(id, await catalogueModel.findTypePieceWithPrerequis(id));
    return pieceCache.get(id);
  }

  /** IUE du père et de la mère d'un citoyen (null si non enregistrés). */
  async function parentsOf(ownerIue) {
    if (!parentsCache.has(ownerIue)) {
      const filiation = await registresClient.getFiliation(ownerIue);
      const find = (lien) => (filiation?.parents || []).find((p) => p.lien === lien)?.iue || null;
      parentsCache.set(ownerIue, { pere: find('pere'), mere: find('mere') });
    }
    return parentsCache.get(ownerIue);
  }

  /** Vérifie l'existence d'une pièce une seule fois par (pièce, titulaire). */
  async function exists(piece, ownerIue) {
    const key = `${piece.id}|${ownerIue}`;
    if (!existsCache.has(key)) {
      existsCache.set(key, await registresClient.pieceExists(piece.id, piece.registre_source, ownerIue));
    }
    return existsCache.get(key);
  }

  /**
   * Construit le nœud d'une pièce et de ses prérequis.
   * @param {string} pieceId
   * @param {string} proprietaire Relation au titulaire de la pièce parente (citoyen | pere | mere).
   * @param {string|null} ownerIue Titulaire de cette pièce, null s'il est inconnu.
   * @param {string} path Chemin dans l'arbre (rend uniques les titulaires inconnus).
   * @param {number} depth Profondeur.
   */
  async function visit(pieceId, proprietaire, ownerIue, path, depth) {
    const piece = await loadPiece(pieceId);
    if (!piece || depth > MAX_DEPTH) return null;

    const found = ownerIue ? await exists(piece, ownerIue) : false;
    const children = [];
    for (const prereq of piece.prerequis) {
      let childIue = null;
      if (prereq.proprietaire === 'citoyen') childIue = ownerIue;
      else if (ownerIue) childIue = (await parentsOf(ownerIue))[prereq.proprietaire];
      const child = await visit(prereq.prerequis_id, prereq.proprietaire, childIue, `${path}/${prereq.proprietaire}`, depth + 1);
      if (child) children.push(child);
    }

    return {
      type_piece: piece.id,
      proprietaire,
      registre_source: piece.registre_source,
      statut: found ? 'resolu' : 'manquant_fallback_physique',
      sous_prerequis: children,
      // Un titulaire inconnu n'a pas d'IUE : on le distingue par sa position dans l'arbre.
      cle: `${piece.id}|${ownerIue || `inconnu:${path}`}`,
    };
  }

  const trees = [];
  for (const rootId of rootPieceIds) {
    const node = await visit(rootId, 'citoyen', iue, 'citoyen', 0);
    if (node) trees.push(node);
  }
  return trees;
}

/**
 * Supprime la clé technique `cle` d'un arbre, pour l'exposer à l'extérieur.
 * @param {object} node
 * @returns {object}
 */
function stripKeys({ cle, sous_prerequis: children, ...rest }) {
  return { ...rest, sous_prerequis: children.map(stripKeys) };
}

/**
 * Liste à plat, sans doublon, de toutes les pièces de la cascade
 * (format du contrat RequeteResultat.cascade).
 *
 * @param {string[]} rootPieceIds Pièces requises par la démarche.
 * @param {string} iue Citoyen concerné.
 * @returns {Promise<Array<{type_piece: string, proprietaire: string, registre_source: string, statut: string}>>}
 */
async function resolve(rootPieceIds, iue) {
  const trees = await resolveTrees(rootPieceIds, iue);
  const seen = new Set();
  const flat = [];

  /** Parcours en profondeur : une pièce d'un même titulaire n'apparaît qu'une fois. */
  function walk(node) {
    if (!seen.has(node.cle)) {
      seen.add(node.cle);
      flat.push({
        type_piece: node.type_piece, proprietaire: node.proprietaire, registre_source: node.registre_source, statut: node.statut,
      });
    }
    node.sous_prerequis.forEach(walk);
  }
  trees.forEach(walk);
  return flat;
}

module.exports = { resolve, resolveTrees, stripKeys };
