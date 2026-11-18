/**
 * Chargement du dictionnaire des données et du catalogue des registres
 * (couche config ; docs/conception-interoperabilite.md, § 4 et § 5).
 *
 * Les deux fichiers YAML de backend/passerelle/config/ sont lus une seule fois, au
 * démarrage. Les valeurs ${VARIABLE:-défaut} sont remplacées par les variables
 * d'environnement. Toute la cohérence est vérifiée ici : si un fichier est invalide,
 * la passerelle refuse de démarrer et liste TOUTES les erreurs trouvées, pour qu'un
 * branchement mal décrit soit corrigé avant de servir la moindre requête.
 *
 * Dossier des fichiers : variable CATALOGUE_DOSSIER (défaut : backend/passerelle/config).
 */
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const DOSSIER = process.env.CATALOGUE_DOSSIER || path.join(__dirname, '..', '..', 'config');

const TYPES = ['texte', 'date', 'booleen', 'nombre', 'identifiant', 'liste'];
const CONVERSIONS = ['texte', 'date', 'booleen', 'nombre'];
const REGLES_CALCUL = ['age_au_moins', 'liste_vide'];
const MODES_IDENTIFICATION = ['iue', 'recherche', 'correspondance'];
const ETATS = ['actif', 'suspendu'];
const FORMAT_IUE = /^[0-9]{12}$/;

/**
 * Opération structurelle (pas de donnée du dictionnaire) : liens de filiation.
 * Son schéma est fixé ici ; un registre d'un autre format le décrit par des correspondances
 * comme pour une opération ordinaire.
 */
const FILIATION = 'etat-civil.filiation';
const SCHEMA_FILIATION = {
  parents: {
    type: 'liste',
    elements: { iue: { type: 'identifiant' }, lien: { type: 'texte', valeurs: ['pere', 'mere'] } },
  },
  enfants: {
    type: 'liste',
    elements: { iue: { type: 'identifiant' }, lien: { type: 'texte', valeurs: ['fils', 'fille'] } },
  },
};

/**
 * Remplace ${VARIABLE} et ${VARIABLE:-défaut} dans toutes les chaînes d'une structure.
 * Une variable absente sans valeur par défaut donne une chaîne vide.
 * @param {*} valeur
 * @returns {*}
 */
function interpoler(valeur) {
  if (typeof valeur === 'string') {
    return valeur.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, nom, defaut) => process.env[nom] || defaut || '');
  }
  if (Array.isArray(valeur)) return valeur.map(interpoler);
  if (valeur && typeof valeur === 'object') {
    return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, interpoler(v)]));
  }
  return valeur;
}

/**
 * Lit et analyse un fichier YAML du dossier de configuration.
 * @param {string} nom Nom du fichier.
 * @returns {{brut: object, valeur: object}} Contenu avant et après remplacement des variables.
 */
function lireYaml(nom) {
  const fichier = path.join(DOSSIER, nom);
  const brut = YAML.parse(fs.readFileSync(fichier, 'utf8')) || {};
  return { brut, valeur: interpoler(brut) };
}

/**
 * Découpe une route « GET /chemin » (les registres sont seulement lus).
 * @param {string} route
 * @returns {{methode: string, chemin: string}|null}
 */
function decouperRoute(route) {
  const m = /^(GET)\s+(\/\S*)$/.exec(String(route || '').trim());
  return m ? { methode: m[1], chemin: m[2] } : null;
}

/**
 * Lit la table de correspondance d'un registre identifié par « correspondance » : pour chaque
 * personne, son IUE et l'identifiant que lui donne CE registre (numéro d'acte, de dossier...).
 *
 * Format : une ligne « iue;identifiant_local » par personne (séparateur « ; » ou « , »),
 * lignes vides et lignes commençant par # ignorées, ligne d'en-tête « iue;... » facultative.
 * Chemin relatif au dossier de configuration (ex : correspondances/etat-civil-jury.csv).
 *
 * La table doit être une bijection : un IUE n'a qu'un identifiant local, et un identifiant
 * local qu'un IUE. Sinon la plateforme pourrait lire, ou désigner, une autre personne : toute
 * ligne en double est donc une erreur de configuration, jamais un choix au hasard.
 *
 * @param {string} fichierRelatif
 * @param {string} ou Contexte pour les messages.
 * @param {string[]} erreurs Liste complétée en cas de problème.
 * @returns {{parIue: Map<string, string>, versIue: Map<string, string>}|null} null si illisible.
 */
function lireTableCorrespondance(fichierRelatif, ou, erreurs) {
  let texte;
  try {
    texte = fs.readFileSync(path.resolve(DOSSIER, fichierRelatif), 'utf8');
  } catch {
    erreurs.push(`${ou} : table de correspondance « ${fichierRelatif} » introuvable dans ${DOSSIER}`);
    return null;
  }
  const parIue = new Map();
  const versIue = new Map();
  texte.split(/\r?\n/).forEach((brute, i) => {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith('#')) return;
    const [iue = '', local = ''] = ligne.split(/[;,]/).map((s) => s.trim());
    if (/^iue$/i.test(iue)) return; // ligne d'en-tête
    const lieu = `${ou}, ${fichierRelatif} ligne ${i + 1}`;
    if (!FORMAT_IUE.test(iue)) { erreurs.push(`${lieu} : IUE « ${iue} » invalide (12 chiffres attendus)`); return; }
    if (!local) { erreurs.push(`${lieu} : identifiant local manquant pour l'IUE ${iue}`); return; }
    if (parIue.has(iue)) { erreurs.push(`${lieu} : l'IUE ${iue} figure déjà dans la table`); return; }
    if (versIue.has(local)) { erreurs.push(`${lieu} : l'identifiant local « ${local} » est déjà attribué à l'IUE ${versIue.get(local)}`); return; }
    parIue.set(iue, local);
    versIue.set(local, iue);
  });
  return { parIue, versIue };
}

/**
 * Vérifie le dictionnaire et en tire l'index des opérations.
 * @param {object} dico Contenu de dictionnaire.yaml.
 * @param {string[]} erreurs Liste complétée en cas de problème.
 * @returns {Map<string, object>} « domaine.operation » -> { champ: définition }.
 */
function verifierDictionnaire(dico, erreurs) {
  const operations = new Map();
  for (const [domaine, donnees] of Object.entries(dico.domaines || {})) {
    for (const [nom, def] of Object.entries(donnees || {})) {
      const ou = `dictionnaire ${domaine}.${nom}`;
      if (!def || typeof def !== 'object') { erreurs.push(`${ou} : définition absente`); continue; }
      if (!def.operation) erreurs.push(`${ou} : « operation » manquante`);
      if (!TYPES.includes(def.type)) erreurs.push(`${ou} : type « ${def.type} » inconnu (${TYPES.join(', ')})`);
      if (!def.libelle) erreurs.push(`${ou} : « libelle » manquant`);
      if (def.type === 'liste' && (!def.elements || typeof def.elements !== 'object')) {
        erreurs.push(`${ou} : une liste doit décrire ses « elements »`);
      }
      const cle = `${domaine}.${def.operation}`;
      if (!operations.has(cle)) operations.set(cle, {});
      operations.get(cle)[nom] = def;
    }
  }
  // Une donnée calculée doit partir d'une donnée de la même opération.
  for (const [cle, champs] of operations) {
    for (const [nom, def] of Object.entries(champs)) {
      if (!def.calcul) continue;
      if (!REGLES_CALCUL.includes(def.calcul.regle)) {
        erreurs.push(`dictionnaire ${cle}.${nom} : règle de calcul « ${def.calcul.regle} » inconnue (${REGLES_CALCUL.join(', ')})`);
      }
      if (!champs[def.calcul.a_partir_de]) {
        erreurs.push(`dictionnaire ${cle}.${nom} : « a_partir_de » doit être une donnée de la même opération`);
      }
    }
  }
  operations.set(FILIATION, SCHEMA_FILIATION);
  return operations;
}

/**
 * Vérifie les correspondances d'une opération (et, pour une liste, celles de ses éléments).
 * @param {object} correspondances
 * @param {object} schema Champs connus : { nom: définition }.
 * @param {string} ou Contexte pour les messages.
 * @param {string[]} erreurs
 */
function verifierCorrespondances(correspondances, schema, ou, erreurs) {
  for (const [nom, corr] of Object.entries(correspondances || {})) {
    if (!schema[nom]) { erreurs.push(`${ou} : « ${nom} » n'est pas une donnée de cette opération dans le dictionnaire`); continue; }
    if (!corr || typeof corr.champ !== 'string') { erreurs.push(`${ou}.${nom} : « champ » manquant`); continue; }
    if (corr.conversion && !CONVERSIONS.includes(corr.conversion)) {
      erreurs.push(`${ou}.${nom} : conversion « ${corr.conversion} » inconnue (${CONVERSIONS.join(', ')})`);
    }
    if (corr.elements) verifierCorrespondances(corr.elements, schema[nom].elements || {}, `${ou}.${nom}`, erreurs);
  }
}

/**
 * Vérifie le catalogue des registres par rapport au dictionnaire.
 * @param {object} cat Contenu de catalogue-registres.yaml.
 * @param {Map<string, object>} operations Index des opérations du dictionnaire.
 * @param {string[]} erreurs
 */
function verifierCatalogue(cat, operations, erreurs) {
  const registres = cat.registres || {};
  for (const [id, reg] of Object.entries(registres)) {
    const ou = `registre ${id}`;
    reg.etat = reg.etat || 'actif';
    reg.delai_ms = Number(reg.delai_ms) || 2000;
    if (!ETATS.includes(reg.etat)) erreurs.push(`${ou} : état « ${reg.etat} » inconnu (${ETATS.join(', ')})`);
    if (reg.sonde && !decouperRoute(reg.sonde)) erreurs.push(`${ou} : sonde « ${reg.sonde} » invalide (attendu "GET /chemin")`);
    const ident = reg.identification || { mode: 'iue' };
    reg.identification = ident;
    if (!MODES_IDENTIFICATION.includes(ident.mode)) {
      erreurs.push(`${ou} : mode d'identification « ${ident.mode} » inconnu (${MODES_IDENTIFICATION.join(', ')})`);
    }
    if (ident.mode === 'recherche') {
      if (!decouperRoute(ident.route)) erreurs.push(`${ou} : identification par recherche sans route valide`);
      if (!ident.identifiant_local) erreurs.push(`${ou} : identification par recherche sans « identifiant_local »`);
    }
    if (ident.mode === 'correspondance') {
      if (!ident.table) {
        erreurs.push(`${ou} : identification par correspondance sans « table » (ex : correspondances/${id}.csv)`);
      } else {
        // Tables gardées en mémoire, non énumérables : elles ne sortent jamais dans une réponse.
        const table = lireTableCorrespondance(ident.table, ou, erreurs);
        if (table) {
          Object.defineProperty(ident, 'parIue', { value: table.parIue, enumerable: false });
          Object.defineProperty(ident, 'versIue', { value: table.versIue, enumerable: false });
        }
      }
    }
    for (const [cle, op] of Object.entries(reg.operations || {})) {
      if (!operations.has(cle)) { erreurs.push(`${ou} : opération « ${cle} » absente du dictionnaire`); continue; }
      if (!decouperRoute(op && op.route)) erreurs.push(`${ou}, ${cle} : route invalide (attendu "GET /chemin")`);
      if (ident.mode === 'iue' && !String(op.route).includes('{iue}')) erreurs.push(`${ou}, ${cle} : la route doit contenir {iue}`);
      if (['recherche', 'correspondance'].includes(ident.mode) && !String(op.route).includes('{identifiant_local}')) {
        erreurs.push(`${ou}, ${cle} : la route doit contenir {identifiant_local}`);
      }
      op.inconnu = Array.isArray(op.inconnu) ? op.inconnu.map(Number) : [404];
      verifierCorrespondances(op.correspondances, operations.get(cle), `${ou}, ${cle}`, erreurs);
    }
  }

  for (const [cle, ids] of Object.entries(cat.sources || {})) {
    if (!operations.has(cle)) { erreurs.push(`sources : opération « ${cle} » absente du dictionnaire`); continue; }
    if (!Array.isArray(ids) || ids.length === 0) { erreurs.push(`sources ${cle} : liste de registres vide`); continue; }
    for (const id of ids) {
      const reg = registres[id];
      if (!reg) { erreurs.push(`sources ${cle} : registre « ${id} » non déclaré`); continue; }
      if (!reg.operations || !reg.operations[cle]) erreurs.push(`sources ${cle} : le registre « ${id} » ne déclare pas cette opération`);
      if (reg.etat === 'actif' && !reg.adresse) erreurs.push(`registre ${id} : adresse vide (variable d'environnement non définie ?)`);
      // L'état civil sert de pivot à l'identification par recherche (nom, prénom et date de
      // naissance y sont lus par l'IUE) : il doit donc trouver une personne SANS recherche,
      // soit par l'IUE, soit par une table de correspondance.
      if (cle.startsWith('etat-civil.') && !['iue', 'correspondance'].includes(reg.identification.mode)) {
        erreurs.push(`sources ${cle} : le registre « ${id} » doit être identifié par l'IUE ou par correspondance (pivot des recherches)`);
      }
    }
    // Une source de secours est une réplique du registre de référence (serveur ou site de
    // secours), tenue par la même autorité : jamais le registre d'une autre administration,
    // dont la donnée pourrait être périmée et dont l'origine serait masquée au journal (qui
    // enregistre le domaine consulté, pas le serveur qui a répondu).
    const reference = registres[ids[0]];
    for (const id of ids.slice(1)) {
      const secours = registres[id];
      if (reference && secours && secours.proprietaire !== reference.proprietaire) {
        erreurs.push(`sources ${cle} : le registre de secours « ${id} » (${secours.proprietaire || 'propriétaire non renseigné'}) `
          + `doit appartenir à la même autorité que « ${ids[0]} » (${reference.proprietaire || 'propriétaire non renseigné'})`);
      }
    }
  }
  if (!cat.sources || !cat.sources['etat-civil.fiche']) erreurs.push('sources : « etat-civil.fiche » est obligatoire (pivot de l\'IUE)');

  for (const [piece, cle] of Object.entries(cat.pieces || {})) {
    if (!cat.sources || !cat.sources[cle]) erreurs.push(`pieces ${piece} : aucune source ne sert l'opération « ${cle} »`);
  }
}

/**
 * Vérifie que les missions (cloisonnement) ne citent que des données du dictionnaire.
 * @param {object} dico
 * @param {string[]} erreurs
 */
function verifierMissions(dico, erreurs) {
  const { ACCES_MISSION } = require('../../prisma/reference');
  for (const m of ACCES_MISSION) {
    const domaine = (dico.domaines || {})[m.registre] || {};
    for (const champ of m.champs_autorises) {
      if (!domaine[champ]) erreurs.push(`mission ${m.domaine_mission} : « ${m.registre}.${champ} » absente du dictionnaire`);
    }
  }
}

/**
 * Vérifie la base légale de chaque démarche (prisma/reference.js) : pas de démarche sans
 * fondement connu ni finalité, et un fondement cohérent avec le type d'administration.
 *  - une entité privée ne peut pas invoquer la mission de service public ;
 *  - une démarche publique fondée sur le consentement n'est pas encore prise en charge (le
 *    service consentement ne recueille l'accord que pour les entités privées) : refusée.
 * @param {string[]} erreurs
 */
function verifierDemarches(erreurs) {
  const { ADMINISTRATIONS, DEMARCHES, FONDEMENTS } = require('../../prisma/reference');
  const types = new Map(ADMINISTRATIONS.map((a) => [a.id, a.type]));
  for (const d of DEMARCHES) {
    const ou = `démarche ${d.id}`;
    if (!Object.hasOwn(FONDEMENTS, d.base_fondement)) {
      erreurs.push(`${ou} : base légale sans fondement connu (${Object.keys(FONDEMENTS).join(', ')})`);
      continue;
    }
    if (!d.base_finalite || !String(d.base_finalite).trim()) erreurs.push(`${ou} : base légale sans finalité`);
    const type = types.get(d.administration_id);
    if (type === 'privee' && d.base_fondement === 'mission_service_public') {
      erreurs.push(`${ou} : une entité privée ne peut pas invoquer la mission de service public`);
    }
    if (type === 'publique' && d.base_fondement === 'consentement') {
      erreurs.push(`${ou} : démarche publique fondée sur le consentement, pas encore prise en charge`);
    }
  }
}

/**
 * Charge et vérifie toute la configuration.
 * @returns {{dictionnaire: object, operations: Map, registres: object, sources: object, pieces: object}}
 * @throws {Error} Si un fichier est illisible ou incohérent (message listant toutes les erreurs).
 */
function charger() {
  const dictionnaire = lireYaml('dictionnaire.yaml').valeur;
  const { brut, valeur: catalogue } = lireYaml('catalogue-registres.yaml');
  // Modèle d'adresse d'origine (ex : ${REGISTRE_JUSTICE_URL:-...}), cité par le diagnostic
  // pour indiquer quelle variable corriger.
  for (const [id, reg] of Object.entries(catalogue.registres || {})) {
    reg.adresse_modele = ((brut.registres || {})[id] || {}).adresse || reg.adresse;
  }
  const erreurs = [];
  const operations = verifierDictionnaire(dictionnaire, erreurs);
  verifierCatalogue(catalogue, operations, erreurs);
  verifierMissions(dictionnaire, erreurs);
  verifierDemarches(erreurs);
  if (erreurs.length > 0) {
    throw new Error(`[passerelle] configuration invalide (${DOSSIER}) :\n  - ${erreurs.join('\n  - ')}`);
  }
  return {
    dictionnaire,
    operations,
    registres: catalogue.registres || {},
    sources: catalogue.sources || {},
    pieces: catalogue.pieces || {},
  };
}

module.exports = { ...charger(), FILIATION, decouperRoute };
