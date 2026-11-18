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
 *
 * Registre hors service (docs/conception-interoperabilite.md, § 10) : la pièce (et ses
 * prérequis qui en dépendent) passe « en_attente_registre » au lieu de faire échouer toute
 * la résolution. resolveTrees renvoie la liste des registres en cause ; resolve (requêtes
 * des administrations, tout ou rien) lève alors REGISTRE_INDISPONIBLE.
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
 * @returns {Promise<{trees: object[], indisponibles: string[]}>} Un nœud par racine :
 *   { type_piece, proprietaire, registre_source, statut, sous_prerequis: [...], cle }
 *   `cle` identifie le couple (pièce, titulaire) ; il sert au dédoublonnage de resolve().
 *   `indisponibles` : registres hors service rencontrés (vide si tout a pu être vérifié).
 */
async function resolveTrees(rootPieceIds, iue) {
  const pieceCache = new Map();
  const parentsCache = new Map();
  const existsCache = new Map();
  const indisponibles = new Set();

  /** Vrai si l'erreur signale un registre hors service (et le mémorise). */
  function horsService(err) {
    if (!err || err.code !== 'REGISTRE_INDISPONIBLE') return false;
    err.registres.forEach((r) => indisponibles.add(r));
    return true;
  }

  /** Charge un type de pièce une seule fois par résolution. */
  async function loadPiece(id) {
    if (!pieceCache.has(id)) pieceCache.set(id, await catalogueModel.findTypePieceWithPrerequis(id));
    return pieceCache.get(id);
  }

  /**
   * IUE du père et de la mère d'un citoyen (null si non enregistrés).
   * `indisponible` est vrai si l'état civil est hors service (filiation inconnue pour l'instant).
   */
  async function parentsOf(ownerIue) {
    if (!parentsCache.has(ownerIue)) {
      try {
        const filiation = await registresClient.getFiliation(ownerIue);
        const find = (lien) => (filiation?.parents || []).find((p) => p.lien === lien)?.iue || null;
        parentsCache.set(ownerIue, { pere: find('pere'), mere: find('mere'), indisponible: false });
      } catch (err) {
        if (!horsService(err)) throw err;
        parentsCache.set(ownerIue, { pere: null, mere: null, indisponible: true });
      }
    }
    return parentsCache.get(ownerIue);
  }

  /**
   * Statut d'une pièce, vérifié une seule fois par (pièce, titulaire) :
   * « resolu », « manquant_fallback_physique », ou « en_attente_registre » si son registre est hors service.
   */
  async function statusOf(piece, ownerIue) {
    const key = `${piece.id}|${ownerIue}`;
    if (!existsCache.has(key)) {
      let statut;
      try {
        statut = (await registresClient.pieceExists(piece.id, piece.registre_source, ownerIue)) ? 'resolu' : 'manquant_fallback_physique';
      } catch (err) {
        if (!horsService(err)) throw err;
        statut = 'en_attente_registre';
      }
      existsCache.set(key, statut);
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
   * @param {boolean} [enAttente] Vrai si le titulaire ne peut pas encore être connu (état civil hors service).
   */
  async function visit(pieceId, proprietaire, ownerIue, path, depth, enAttente = false) {
    const piece = await loadPiece(pieceId);
    if (!piece || depth > MAX_DEPTH) return null;

    let statut = 'manquant_fallback_physique';
    if (enAttente) statut = 'en_attente_registre';
    else if (ownerIue) statut = await statusOf(piece, ownerIue);
    const children = [];
    for (const prereq of piece.prerequis) {
      let childIue = null;
      let childEnAttente = enAttente;
      if (prereq.proprietaire === 'citoyen') {
        childIue = ownerIue;
      } else if (ownerIue && !enAttente) {
        const parents = await parentsOf(ownerIue);
        childIue = parents[prereq.proprietaire];
        childEnAttente = parents.indisponible;
      }
      const child = await visit(prereq.prerequis_id, prereq.proprietaire, childIue, `${path}/${prereq.proprietaire}`, depth + 1, childEnAttente);
      if (child) children.push(child);
    }

    return {
      type_piece: piece.id,
      proprietaire,
      registre_source: piece.registre_source,
      statut,
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
  return { trees, indisponibles: [...indisponibles] };
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
 * @throws {AppError} 503 REGISTRE_INDISPONIBLE si une pièce n'a pas pu être vérifiée (tout ou rien).
 */
async function resolve(rootPieceIds, iue) {
  const { trees, indisponibles } = await resolveTrees(rootPieceIds, iue);
  if (indisponibles.length) throw registresClient.registreIndisponible(indisponibles);
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
