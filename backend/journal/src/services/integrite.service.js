/**
 * Service Intégrité — chaînage du journal par empreintes (couche 4, journal de traçabilité).
 *
 * Chaque entrée porte son rang dans la chaîne (1, 2, 3...), l'empreinte de l'entrée
 * précédente et sa propre empreinte : SHA-256 de son contenu, de son rang et de l'empreinte
 * précédente. Conséquences :
 *  - modifier une entrée (même directement en base) change son empreinte recalculée ;
 *  - supprimer une entrée laisse un rang manquant et casse le lien de la suivante ;
 *  - insérer une entrée hors de l'API la laisse hors chaîne.
 * La vérification recalcule toute la chaîne et donne la première rupture.
 *
 * Limite assumée : quelqu'un qui réécrirait TOUTE la fin de la chaîne (recalcul de toutes
 * les empreintes) ne serait détecté qu'en comparant la dernière empreinte à une copie
 * conservée ailleurs (ancre). La vérification la renvoie pour cela.
 */
const crypto = require('node:crypto');
const journalModel = require('../models/journalAcces.model');

/** Empreinte « précédente » de la première entrée de la chaîne. */
const GENESE = '0'.repeat(64);

/**
 * Empreinte SHA-256 d'une entrée : contenu, rang et empreinte précédente, dans un ordre fixe
 * (tableau JSON, donc sans ambiguïté sur l'ordre des clés). Les UUID sont mis en minuscules
 * et la date en ISO 8601, tels que PostgreSQL les rend.
 * @param {object} e Entrée (champs de la table JournalAcces).
 * @returns {string} 64 caractères hexadécimaux.
 */
function empreinteDe(e) {
  const uuid = (v) => (v ? String(v).toLowerCase() : null);
  const contenu = [
    e.rang,
    e.empreinte_precedente,
    uuid(e.id),
    e.titulaire_iue,
    e.decideur_iue,
    uuid(e.administration_id),
    e.administration_nom ?? null,
    e.administration_type ?? null,
    e.demarche_id,
    e.demarche_nom ?? null,
    uuid(e.requete_id),
    e.registres_consultes,
    e.champs_transmis,
    e.type_acces,
    new Date(e.date_acces).toISOString(),
  ];
  return crypto.createHash('sha256').update(JSON.stringify(contenu)).digest('hex');
}

/**
 * Champs de chaînage d'une entrée placée après `derniere`.
 * @param {object} entree Contenu de l'entrée (id et date_acces compris).
 * @param {object|null} derniere Dernière entrée chaînée, ou null pour la première.
 * @returns {{rang: number, empreinte_precedente: string, empreinte: string}}
 */
function sceau(entree, derniere) {
  const chainage = {
    rang: derniere ? derniere.rang + 1 : 1,
    empreinte_precedente: derniere ? derniere.empreinte : GENESE,
  };
  return { ...chainage, empreinte: empreinteDe({ ...entree, ...chainage }) };
}

/**
 * Ajoute un accès en bout de chaîne (appelé par journal.service.js). L'id et la date sont
 * fixés ici, avant l'écriture, car ils entrent dans l'empreinte.
 * @param {object} contenu Champs validés de la table JournalAcces (sans id ni date).
 * @returns {Promise<object>} L'entrée créée.
 */
function ajouter(contenu) {
  const entree = { ...contenu, id: crypto.randomUUID(), date_acces: new Date() };
  return journalModel.appendToChain((derniere) => ({ ...entree, ...sceau(entree, derniere) }));
}

/**
 * Scelle les entrées antérieures au chaînage (données de démonstration, base d'avant la
 * mise à jour), dans l'ordre chronologique. Appelé une fois, au démarrage du service.
 * @returns {Promise<number>} Nombre d'entrées scellées.
 */
function scellerEntreesAnterieures() {
  return journalModel.sealPending((entree, derniere) => sceau(entree, derniere));
}

/**
 * GET /journal/verification — recalcule toute la chaîne.
 * Le résultat ne contient aucune donnée d'un autre citoyen : seulement le rang et la cause
 * de la première rupture, et si elle touche les entrées visibles par le citoyen connecté.
 *
 * @param {{iue: string, enfants: string[]}} citoyen Citoyen connecté.
 * @returns {Promise<object>} VerificationJournal (docs/openapi-journal.yaml).
 */
async function verifier(citoyen) {
  const [chaine, horsChaine] = await Promise.all([journalModel.findChain(), journalModel.count({ rang: null })]);
  const visibles = new Set([citoyen.iue, ...citoyen.enfants]);
  const estVisible = (e) => visibles.has(e.titulaire_iue) || e.decideur_iue === citoyen.iue;

  let rupture = null;
  let precedente = GENESE;
  for (let i = 0; i < chaine.length && !rupture; i += 1) {
    const e = chaine[i];
    const rangAttendu = i + 1;
    if (e.rang !== rangAttendu) {
      rupture = { rang: rangAttendu, cause: 'entree_supprimee', concerne_vos_donnees: null };
    } else if (e.empreinte_precedente !== precedente) {
      rupture = { rang: e.rang, cause: 'chainage_rompu', concerne_vos_donnees: estVisible(e) };
    } else if (empreinteDe(e) !== e.empreinte) {
      rupture = { rang: e.rang, cause: 'contenu_modifie', concerne_vos_donnees: estVisible(e) };
    }
    precedente = e.empreinte;
  }

  return {
    integre: !rupture && horsChaine === 0,
    entrees_verifiees: chaine.length,
    entrees_hors_chaine: horsChaine,
    vos_entrees: chaine.filter(estVisible).length,
    derniere_empreinte: chaine.length ? chaine[chaine.length - 1].empreinte : GENESE,
    rupture,
    date_verification: new Date().toISOString(),
  };
}

module.exports = { ajouter, scellerEntreesAnterieures, verifier, empreinteDe };
