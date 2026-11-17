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
 * Une pièce manquante n'empêche pas la transmission des données : la cascade
 * informe l'administration de ce qui reste à fournir physiquement.
 */
const catalogueModel = require('../models/catalogue.model');
const registresClient = require('../clients/registres.client');

/** Garde-fou contre un arbre mal configuré (cycle dans les prérequis). */
const MAX_DEPTH = 6;

/**
 * Résout l'arbre de prérequis de plusieurs pièces racines pour un citoyen.
 *
 * @param {string[]} rootPieceIds Pièces requises par la démarche.
 * @param {string} iue Citoyen concerné (titulaire des pièces racines).
 * @returns {Promise<Array<{type_piece: string, proprietaire: string, registre_source: string, statut: string}>>}
 *          Liste à plat, dans l'ordre de parcours, sans doublon.
 */
async function resolve(rootPieceIds, iue) {
  const results = [];
  const visited = new Set();
  const pieceCache = new Map();
  const parentsCache = new Map();

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

  /**
   * Visite une pièce puis ses prérequis.
   * @param {string} pieceId
   * @param {string} proprietaire Relation au titulaire de la pièce parente (citoyen | pere | mere).
   * @param {string|null} ownerIue Titulaire de cette pièce, null s'il est inconnu.
   * @param {number} depth Profondeur dans l'arbre.
   */
  async function visit(pieceId, proprietaire, ownerIue, depth) {
    const piece = await loadPiece(pieceId);
    if (!piece || depth > MAX_DEPTH) return;

    // Une même pièce du même titulaire n'est vérifiée qu'une fois
    // (ex : l'extrait de naissance du citoyen, requis à deux endroits).
    const key = `${pieceId}|${ownerIue || `inconnu:${proprietaire}:${depth}`}`;
    if (visited.has(key)) return;
    visited.add(key);

    const found = ownerIue ? await registresClient.pieceExists(piece.id, piece.registre_source, ownerIue) : false;
    results.push({
      type_piece: piece.id,
      proprietaire,
      registre_source: piece.registre_source,
      statut: found ? 'resolu' : 'manquant_fallback_physique',
    });

    for (const prereq of piece.prerequis) {
      let childIue = null;
      if (prereq.proprietaire === 'citoyen') childIue = ownerIue;
      else if (ownerIue) childIue = (await parentsOf(ownerIue))[prereq.proprietaire];
      await visit(prereq.prerequis_id, prereq.proprietaire, childIue, depth + 1);
    }
  }

  for (const rootId of rootPieceIds) {
    await visit(rootId, 'citoyen', iue, 0);
  }
  return results;
}

module.exports = { resolve };
