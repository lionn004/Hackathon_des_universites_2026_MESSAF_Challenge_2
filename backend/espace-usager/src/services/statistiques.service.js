/**
 * Service Statistiques : pilotage de la numérisation (couche 5, espace usager).
 *
 * Chaque demande en attente d'une donnée numérique manquante (statut « fallback_physique »)
 * dit précisément quelle pièce manque et pour qui (le citoyen, son père, sa mère). Agrégées,
 * ces attentes montrent à l'État où accentuer la numérisation : quels actes, dans quel
 * registre, avec quel effet sur les démarches des citoyens (rapport technique, § 10).
 *
 * Statistiques ANONYMES : uniquement des nombres, aucun IUE, aucun nom, aucune date propre
 * à une personne. Rien n'est stocké : tout est recalculé à chaque appel à partir des demandes.
 */
const demandeModel = require('../models/demande.model');
const passerelleClient = require('../clients/passerelle.client');

/** Statuts des demandes, au format du contrat, et leur nom dans le résumé. */
const RESUME_STATUTS = {
  complete: 'complete',
  fallback_physique: 'en_attente_numerisation',
  en_cours: 'en_attente_registre',
  echouee: 'echouee',
};

/**
 * Pièces réellement à numériser dans une cascade : les nœuds « manquant » dont aucun
 * sous-prérequis ne manque (la cause, pas ses conséquences : si l'extrait du père manque,
 * le certificat de nationalité qui en dépend n'est pas lui-même à numériser).
 * @param {object[]} noeuds Cascade au format du contrat BFF.
 * @param {Array<{type_piece: string, proprietaire: string}>} [acc]
 * @returns {Array<{type_piece: string, proprietaire: string}>}
 */
function piecesANumeriser(noeuds, acc = []) {
  for (const n of noeuds || []) {
    const enfantsManquants = (n.sous_prerequis || []).some((s) => s.statut === 'manquant');
    if (n.statut === 'manquant' && !enfantsManquants) acc.push({ type_piece: n.type_piece, proprietaire: n.proprietaire });
    piecesANumeriser(n.sous_prerequis, acc);
  }
  return acc;
}

/**
 * Catalogue des types de pièces (nom, registre source). En cas de panne de la passerelle,
 * les statistiques restent calculées, avec l'identifiant à la place du nom.
 * @returns {Promise<Map<string, object>>}
 */
async function catalogue() {
  try {
    const { types_pieces: types } = await passerelleClient.listTypesPieces();
    return new Map(types.map((t) => [t.id, t]));
  } catch {
    return new Map();
  }
}

/**
 * GET /statistiques/numerisation : où la numérisation débloquerait le plus de démarches.
 * @returns {Promise<object>} StatistiquesNumerisation (docs/openapi-espace-usager.yaml).
 */
async function numerisation() {
  const [parStatut, bloquees, types] = await Promise.all([
    demandeModel.countByStatut(),
    demandeModel.findAwaitingDigitization(),
    catalogue(),
  ]);

  const demandes = { total: 0, complete: 0, en_attente_numerisation: 0, en_attente_registre: 0, echouee: 0 };
  for (const g of parStatut) {
    demandes.total += g._count._all;
    if (RESUME_STATUTS[g.statut]) demandes[RESUME_STATUTS[g.statut]] += g._count._all;
  }

  // Chaque demande compte une fois par pièce manquante (et une fois par registre).
  const parPiece = new Map();
  const parRegistre = new Map();
  for (const d of bloquees) {
    let manquantes = piecesANumeriser(d.cascade);
    // Aucun prérequis manquant : c'est la pièce demandée elle-même qui manque.
    if (manquantes.length === 0) manquantes = [{ type_piece: d.type_piece_id, proprietaire: 'citoyen' }];
    const cles = new Set(manquantes.map((m) => `${m.type_piece}|${m.proprietaire}`));
    const registres = new Set();
    for (const cle of cles) {
      parPiece.set(cle, (parPiece.get(cle) || 0) + 1);
      registres.add((types.get(cle.split('|')[0]) || {}).registre_source || 'inconnu');
    }
    for (const r of registres) parRegistre.set(r, (parRegistre.get(r) || 0) + 1);
  }

  const parNombre = (a, b) => b.demandes_bloquees - a.demandes_bloquees;
  return {
    demandes,
    titulaires_concernes: new Set(bloquees.map((d) => d.titulaire_iue)).size,
    pieces_a_numeriser: [...parPiece].map(([cle, n]) => {
      const [id, proprietaire] = cle.split('|');
      const t = types.get(id) || {};
      return {
        type_piece: { id, nom: t.nom || id, registre_source: t.registre_source || null },
        proprietaire,
        demandes_bloquees: n,
      };
    }).sort((a, b) => parNombre(a, b) || a.type_piece.id.localeCompare(b.type_piece.id) || a.proprietaire.localeCompare(b.proprietaire)),
    par_registre: [...parRegistre].map(([registre, n]) => ({ registre_source: registre, demandes_bloquees: n }))
      .sort((a, b) => parNombre(a, b) || a.registre_source.localeCompare(b.registre_source)),
    date_calcul: new Date().toISOString(),
  };
}

module.exports = { numerisation, piecesANumeriser };
