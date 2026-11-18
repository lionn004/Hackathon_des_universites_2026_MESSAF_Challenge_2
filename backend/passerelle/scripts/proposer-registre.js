/**
 * Assistant de branchement (passerelle, outil d'exploitation) :
 * lit le contrat OpenAPI d'un registre et PROPOSE un brouillon de déclaration pour le
 * catalogue des registres (docs/conception-interoperabilite.md, § 11).
 *
 * Il propose, il n'active rien : le sens d'un champ ne se devine pas avec certitude, et une
 * correspondance fausse ferait sortir une mauvaise donnée sous un nom officiel. Le brouillon
 * est donc marqué « suspendu », chaque correspondance est à relire, puis le registre est
 * vérifié sur de vraies réponses avec `npm run tester-registre` avant d'être activé.
 *
 * Ce que le contrat OpenAPI permet de proposer : adresse, routes de lecture, identification
 * de la personne (IUE dans la route, ou route de recherche), emplacement de la fiche dans la
 * réponse, correspondances par rapprochement des noms et des types, tables de valeurs.
 *
 * Usage :
 *   docker compose exec passerelle npm run proposer-registre -- <fichier ou URL OpenAPI> <identifiant>
 *   ... -- <source> <identifiant> --sortie /app/config/brouillon.yaml
 * Le brouillon s'affiche (ou s'écrit dans --sortie) ; le bilan s'affiche sur la sortie d'erreur.
 */
const fs = require('node:fs');
const YAML = require('yaml');
const { dictionnaire, operations } = require('../src/config/catalogue');

/** Synonymes connus : nom normalisé (sans accents, ni séparateurs, ni majuscules) d'un champ de registre. */
const SYNONYMES = {
  nom: ['nomfamille', 'lastname', 'surname', 'familyname', 'nomdefamille'],
  prenom: ['prenoms', 'firstname', 'givenname', 'givennames'],
  date_naissance: ['naissance', 'datenaiss', 'birthdate', 'dateofbirth', 'dob', 'datedenaissance'],
  lieu_naissance: ['lieunaiss', 'birthplace', 'placeofbirth', 'lieudenaissance'],
  sexe: ['genre', 'gender', 'sex'],
  nationalite: ['nationality'],
  pere_iue: ['iuepere', 'idpere', 'pereidentifiant', 'parentspereidentifiant', 'parentspereiue'],
  mere_iue: ['iuemere', 'idmere', 'mereidentifiant', 'parentsmereidentifiant', 'parentsmereiue'],
  date_deces: ['deces', 'datedudeces', 'deathdate'],
  est_national: ['estburkinabe', 'burkinabe', 'national', 'estnational'],
  mode_acquisition: ['modeobtention', 'modeacquisition', 'acquisition'],
  date_acquisition: ['dateobtention', 'dateacquisition'],
  numero_certificat: ['numcertificat', 'numerocertificat', 'certificat', 'numerodecertificat'],
  casier_vierge: ['vierge', 'casiervierge', 'estvierge'],
  condamnations: ['convictions', 'peines', 'mentions'],
  date_delivrance: ['delivrance', 'datedelivrance', 'datedemission', 'dateemission'],
  ifu: ['numeroifu', 'identifiantfiscal'],
  en_regle: ['ajour', 'estenregle', 'regularite', 'enregle'],
  type_contribuable: ['typecontribuable', 'categorie', 'categoriecontribuable'],
  regime_fiscal: ['regime', 'regimefiscal'],
  derniere_declaration: ['datedernieredeclaration', 'dernieredeclaration'],
  montant_impot_du: ['montantdu', 'impotdu', 'resteapayer', 'montantimpot'],
};

/** Types OpenAPI compatibles avec chaque type du dictionnaire. */
const TYPES_COMPATIBLES = {
  texte: ['string', 'number', 'integer'],
  identifiant: ['string', 'number', 'integer'],
  date: ['string'],
  booleen: ['boolean', 'string', 'integer'],
  nombre: ['number', 'integer', 'string'],
  liste: ['array'],
};

/** Nom normalisé : sans accents, minuscules, sans séparateurs (dateNaissance -> datenaissance). */
function cle(texte) {
  return String(texte).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Écrit une valeur YAML sur une ligne, entre guillemets si nécessaire. */
function q(valeur) {
  const s = String(valeur);
  return /^[A-Za-z0-9_./-]+$/.test(s) ? s : JSON.stringify(s);
}

/**
 * Lit le contrat OpenAPI (fichier local ou URL), en YAML ou en JSON.
 * @param {string} source
 * @returns {Promise<object>}
 */
async function lireContrat(source) {
  const texte = /^https?:\/\//.test(source)
    ? await (await fetch(source, { signal: AbortSignal.timeout(10000) })).text()
    : fs.readFileSync(source, 'utf8');
  const contrat = YAML.parse(texte);
  if (!contrat || !contrat.paths) throw new Error('ce document n\'est pas un contrat OpenAPI (aucune « paths »)');
  return contrat;
}

/**
 * Résout les références locales ($ref) et fusionne allOf, sans boucler sur un schéma récursif.
 * @returns {object} Schéma résolu (objet vide si introuvable).
 */
function resoudre(contrat, schema, vus = new Set()) {
  if (!schema || typeof schema !== 'object') return {};
  if (schema.$ref) {
    if (vus.has(schema.$ref)) return {};
    const cible = schema.$ref.replace(/^#\//, '').split('/').reduce((o, k) => (o ? o[k] : undefined), contrat);
    return resoudre(contrat, cible, new Set([...vus, schema.$ref]));
  }
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf.map((s) => resoudre(contrat, s, vus));
    return { type: 'object', properties: Object.assign({}, ...parts.map((p) => p.properties || {})) };
  }
  return schema;
}

/** Type OpenAPI d'un schéma (le premier non nul si c'est une liste de types). */
function typeDe(schema) {
  const t = Array.isArray(schema.type) ? schema.type.find((x) => x !== 'null') : schema.type;
  return t || (schema.properties ? 'object' : schema.items ? 'array' : undefined);
}

/**
 * Aplati les champs d'un objet de réponse : { chemin: schéma }, objets imbriqués compris
 * (« parents.pere.identifiant »), jusqu'à 3 niveaux. Les listes sont des feuilles.
 */
function aplatir(contrat, schema, prefixe = '', profondeur = 0, out = {}) {
  const s = resoudre(contrat, schema);
  for (const [nom, sous] of Object.entries(s.properties || {})) {
    const r = resoudre(contrat, sous);
    const chemin = prefixe ? `${prefixe}.${nom}` : nom;
    if (typeDe(r) === 'object' && profondeur < 2) aplatir(contrat, r, chemin, profondeur + 1, out);
    else out[chemin] = r;
  }
  return out;
}

/**
 * Score de rapprochement entre une donnée du dictionnaire et un champ du registre.
 * 3 : même nom ; 2 : synonyme connu ; 1 : nom proche (l'un contient l'autre). 0 : aucun.
 */
function score(nomDico, def, chemin, schemaChamp) {
  const dernier = cle(chemin.split('.').pop());
  const complet = cle(chemin);
  const d = cle(nomDico);
  const types = TYPES_COMPATIBLES[def.type] || ['string'];
  const t = typeDe(schemaChamp);
  if (t && !types.includes(t)) return 0;
  if (dernier === d || complet === d) return 3;
  const syn = SYNONYMES[nomDico] || [];
  if (syn.includes(dernier) || syn.includes(complet)) return 2;
  if (def.libelle && cle(def.libelle) === dernier) return 2;
  if (d.length >= 4 && dernier.length >= 4 && (dernier.includes(d) || d.includes(dernier))) return 1;
  return 0;
}

/**
 * Propose une table de valeurs quand le registre et le dictionnaire n'utilisent pas les mêmes
 * codes : même nom normalisé, sinon même initiale si elle est unique (Masculin -> M).
 * @returns {object|null} { valeurDuRegistre: valeurDuDictionnaire }, null si rien à traduire.
 */
function tableValeurs(valeursDico, enumRegistre) {
  if (!Array.isArray(valeursDico) || !Array.isArray(enumRegistre)) return null;
  const table = {};
  for (const v of enumRegistre) {
    if (valeursDico.includes(v)) continue;
    const egal = valeursDico.find((x) => cle(x) === cle(v));
    const initiales = valeursDico.filter((x) => cle(x)[0] === cle(v)[0]);
    const cible = egal || (initiales.length === 1 ? initiales[0] : null);
    if (cible) table[v] = cible;
  }
  return Object.keys(table).length ? table : null;
}

/**
 * Rapproche les champs d'un objet du registre des données d'une opération du dictionnaire.
 * Chaque champ du registre ne sert qu'une fois (les meilleurs scores d'abord).
 * @returns {{trouvees: object[], manquantes: string[], ignores: string[], total: number}}
 */
function rapprocher(contrat, champs, schemaOperation) {
  const candidats = [];
  for (const [nom, def] of Object.entries(schemaOperation)) {
    if (nom === 'iue') continue; // l'IUE demandé fait foi : la passerelle le pose elle-même
    for (const [chemin, sch] of Object.entries(champs)) {
      const s = score(nom, def, chemin, sch);
      if (s > 0) candidats.push({ nom, def, chemin, schema: sch, score: s });
    }
  }
  candidats.sort((a, b) => b.score - a.score);
  const pris = new Set();
  const trouvees = [];
  for (const c of candidats) {
    if (pris.has(c.chemin) || trouvees.some((t) => t.nom === c.nom)) continue;
    pris.add(c.chemin);
    trouvees.push(c);
  }
  const manquantes = Object.keys(schemaOperation).filter((n) => n !== 'iue' && !trouvees.some((t) => t.nom === n));
  // L'IUE renvoyé par le registre n'est pas « ignoré » : c'est l'identifiant de la personne.
  const ignores = Object.keys(champs).filter((c) => !pris.has(c) && cle(c) !== 'iue');
  return { trouvees, manquantes, ignores, total: trouvees.reduce((n, t) => n + t.score, 0) };
}

/** Paramètres d'une route (ceux du chemin et ceux de l'opération), références résolues. */
function parametres(contrat, item, op) {
  return [...(item.parameters || []), ...(op.parameters || [])].map((p) => resoudre(contrat, p));
}

/**
 * Vrai si un paramètre de chemin désigne l'IUE : son nom, sa description, ou son format
 * (exactement 12 chiffres, comme `^[0-9]{12}$`).
 */
function estIue(param) {
  if (!param) return false;
  const schema = param.schema || {};
  return /iue/i.test(param.name) || /\bIUE\b/.test(param.description || '')
    || /^\^?\[0-9\]\{12\}\$?$|^\^?\\d\{12\}\$?$/.test(schema.pattern || '');
}

/** Schéma JSON de la réponse 200 d'une opération GET. */
function reponse200(contrat, op) {
  const r = resoudre(contrat, (op.responses || {})['200'] || (op.responses || {})['201']);
  return resoudre(contrat, (((r.content || {})['application/json']) || {}).schema);
}

/**
 * Cherche la meilleure opération du dictionnaire pour une route : la fiche peut être la
 * réponse entière ou une de ses propriétés (enveloppe « data », « resultat »...).
 */
function meilleureOperation(contrat, schemaReponse) {
  const fiches = [{ donnees: null, schema: schemaReponse }];
  for (const [nom, sous] of Object.entries(schemaReponse.properties || {})) {
    const r = resoudre(contrat, sous);
    if (typeDe(r) === 'object') fiches.push({ donnees: nom, schema: r });
  }
  let meilleure = null;
  for (const fiche of fiches) {
    const champs = aplatir(contrat, fiche.schema);
    for (const [operation, schemaOp] of operations) {
      const r = rapprocher(contrat, champs, schemaOp);
      if (r.trouvees.length < 2) continue;
      // À score égal, l'enveloppe (« donnees: data ») donne des chemins plus simples.
      const mieux = !meilleure || r.total > meilleure.r.total
        || (r.total === meilleure.r.total && fiche.donnees && !meilleure.donnees);
      if (mieux) meilleure = { operation, donnees: fiche.donnees, r, champs };
    }
  }
  return meilleure;
}

/**
 * Analyse le contrat et prépare la proposition (sans l'écrire).
 * @returns {object} Proposition : adresse, sonde, identification, operations, remarques.
 */
function analyser(contrat) {
  const remarques = [];
  const routes = [];
  for (const [chemin, item] of Object.entries(contrat.paths || {})) {
    if (!item || !item.get) continue;
    const params = parametres(contrat, item, item.get);
    routes.push({
      chemin,
      parametresChemin: params.filter((p) => p.in === 'path'),
      dansChemin: params.filter((p) => p.in === 'path').map((p) => p.name),
      dansRequete: params.filter((p) => p.in === 'query'),
      schema: reponse200(contrat, item.get),
    });
  }

  // Sonde : une route sans paramètre dont le nom évoque l'état du service.
  const sonde = routes.find((r) => !r.dansChemin.length && !r.dansRequete.length && /sante|health|etat|status|ping/i.test(r.chemin));

  // Paramètre de filtrage des champs, s'il existe (ex : ?champs=).
  const filtre = routes.flatMap((r) => r.dansRequete).find((p) => /^(champs|fields)$/i.test(p.name));

  // Routes de lecture d'une personne : un seul paramètre de chemin.
  const proposees = [];
  for (const r of routes.filter((x) => x.dansChemin.length === 1)) {
    const m = meilleureOperation(contrat, r.schema);
    if (!m) { remarques.push(`GET ${r.chemin} : aucune opération du dictionnaire reconnue, route ignorée`); continue; }
    const param = r.dansChemin[0];
    proposees.push({ ...m, chemin: r.chemin, param, parIue: estIue(r.parametresChemin[0]) });
  }
  // Une seule route par opération : celle qui rapproche le plus de données.
  const parOperation = new Map();
  for (const p of proposees) {
    const deja = parOperation.get(p.operation);
    if (!deja || p.r.total > deja.r.total) parOperation.set(p.operation, p);
  }

  // Identification : IUE dans la route, sinon recherche par nom, prénom et date de naissance.
  let identification = { mode: 'iue' };
  const sansIue = [...parOperation.values()].filter((p) => !p.parIue);
  if (sansIue.length) {
    const local = sansIue[0].param;
    const recherche = routes.find((r) => !r.dansChemin.length && r.dansRequete.length >= 2
      && Object.values(r.schema.properties || {}).some((s) => typeDe(resoudre(contrat, s)) === 'array'));
    if (!recherche) {
      remarques.push(`aucune route de recherche trouvée : la personne est désignée par « ${local} », qui n'est pas l'IUE`);
      identification = { mode: 'recherche', route: 'À RENSEIGNER', liste: 'À RENSEIGNER', identifiant_local: local };
    } else {
      const variables = { nom: 'nom', prenom: 'prenom', date_naissance: 'date_naissance' };
      const morceaux = recherche.dansRequete.map((p) => {
        const quoi = Object.keys(variables).find((v) => score(v, dictionnaire.domaines['etat-civil'][v], p.name, resoudre(contrat, p.schema)) > 0);
        if (!quoi) return null;
        const exemple = String(p.example ?? (p.schema || {}).example ?? '');
        const format = quoi === 'date_naissance' && /^\d{2}\/\d{2}\/\d{4}$/.test(exemple) ? '|jj/mm/aaaa' : '';
        return `${p.name}={${quoi}${format}}`;
      }).filter(Boolean);
      const [liste, schemaListe] = Object.entries(recherche.schema.properties || {})
        .find(([, s]) => typeDe(resoudre(contrat, s)) === 'array');
      const champsElement = Object.keys(aplatir(contrat, resoudre(contrat, schemaListe).items));
      identification = {
        mode: 'recherche',
        route: `GET ${recherche.chemin}?${morceaux.join('&')}`,
        liste,
        identifiant_local: champsElement.find((c) => cle(c) === cle(local)) || local,
      };
      if (morceaux.length < 3) remarques.push('route de recherche : nom, prénom et date de naissance ne sont pas tous reconnus');
      if (!morceaux.some((m) => m.includes('|'))) remarques.push('route de recherche : vérifier le format de date attendu (ex : {date_naissance|jj/mm/aaaa})');
    }
  }
  return { sonde, filtre, operations: parOperation, identification, remarques };
}

/** Correspondances d'une proposition, au format du catalogue (null si format recommandé). */
function correspondances(p, schemaOp) {
  const lignes = [];
  let identique = !p.donnees;
  for (const t of p.r.trouvees) {
    const corr = { champ: t.chemin };
    const vals = tableValeurs(schemaOp[t.nom].valeurs, t.schema.enum);
    if (vals) corr.valeurs = vals;
    if (t.chemin !== t.nom || vals) identique = false;
    const confiance = { 3: 'même nom', 2: 'synonyme', 1: 'nom proche : à vérifier' }[t.score];
    lignes.push({ nom: t.nom, corr, confiance });
  }
  return identique ? null : lignes;
}

/** Écrit le brouillon YAML (avec ses commentaires de relecture). */
function ecrire(id, contrat, source, a) {
  const o = [];
  const titre = (contrat.info && contrat.info.title) || id;
  const serveur = ((contrat.servers || [])[0] || {}).url;
  o.push(`# Brouillon proposé par proposer-registre le ${new Date().toISOString().slice(0, 10)}, à partir de ${source}.`);
  o.push('# À RELIRE AVANT TOUT USAGE : chaque correspondance est une proposition. Puis :');
  o.push('#   1. renseigner « proprietaire » et vérifier l\'adresse ;');
  o.push(`#   2. coller ce registre dans catalogue-registres.yaml et le désigner dans « sources » ;`);
  o.push(`#   3. npm run tester-registre -- ${id} <iue> ; 4. passer « etat » à actif et redémarrer la passerelle.`);
  for (const r of a.remarques) o.push(`# ATTENTION : ${r}`);
  o.push('registres:');
  o.push(`  ${id}:`);
  o.push(`    nom: ${q(titre)}`);
  o.push('    proprietaire: À RENSEIGNER');
  o.push('    etat: suspendu                  # passer à actif après relecture et tester-registre');
  o.push(`    adresse: ${serveur && /^https?:/.test(serveur) ? q(serveur) : 'À RENSEIGNER'}`);
  o.push('    delai_ms: 2000');
  o.push(`    sonde: ${a.sonde ? q(`GET ${a.sonde.chemin}`) : '"GET /"                  # aucune route d\'état trouvée : à vérifier'}`);
  if (a.filtre) o.push(`    parametre_champs: ${q(a.filtre.name)}`);
  if (a.identification.mode === 'iue') {
    o.push('    identification: { mode: iue }');
  } else {
    o.push('    identification:');
    o.push('      mode: recherche');
    o.push(`      route: ${q(a.identification.route)}`);
    o.push(`      liste: ${q(a.identification.liste)}`);
    o.push(`      identifiant_local: ${q(a.identification.identifiant_local)}`);
  }
  o.push('    operations:');
  for (const [operation, p] of a.operations) {
    const schemaOp = operations.get(operation);
    const route = `GET ${p.chemin.replace(`{${p.param}}`, p.parIue ? '{iue}' : '{identifiant_local}')}`;
    const lignes = correspondances(p, schemaOp);
    o.push(`      ${operation}:`);
    o.push(`        route: ${q(route)}`);
    if (p.donnees) o.push(`        donnees: ${q(p.donnees)}`);
    if (!lignes) {
      o.push('        # format recommandé : les noms du registre sont ceux du dictionnaire, aucune correspondance');
    } else {
      o.push('        correspondances:');
      for (const l of lignes) {
        const vals = l.corr.valeurs
          ? `, valeurs: { ${Object.entries(l.corr.valeurs).map(([k, v]) => `${q(k)}: ${q(v)}`).join(', ')} }`
          : '';
        o.push(`          ${l.nom}: { champ: ${q(l.corr.champ)}${vals} }   # ${l.confiance}${vals ? ', table de valeurs à vérifier' : ''}`);
      }
    }
    const calculees = p.r.manquantes.filter((n) => schemaOp[n].calcul);
    const absentes = p.r.manquantes.filter((n) => !schemaOp[n].calcul);
    if (calculees.length) o.push(`        # calculées par la passerelle si le registre ne les fournit pas : ${calculees.join(', ')}`);
    if (absentes.length) o.push(`        # données du dictionnaire non trouvées (à chercher, ou absentes de ce registre) : ${absentes.join(', ')}`);
    if (p.r.ignores.length) o.push(`        # champs du registre ignorés (hors dictionnaire, n'entreront jamais dans la plateforme) : ${p.r.ignores.join(', ')}`);
  }
  o.push('');
  o.push('# À ajouter dans « sources » (en premier si ce registre fait foi) :');
  for (const operation of a.operations.keys()) o.push(`#   ${operation}: [${id}]`);
  return `${o.join('\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const iSortie = args.indexOf('--sortie');
  const sortie = iSortie >= 0 ? args.splice(iSortie, 2)[1] : null;
  const [source, id] = args;
  if (!source || !id || !/^[a-z0-9-]+$/.test(id)) {
    console.error('Usage : npm run proposer-registre -- <fichier ou URL OpenAPI> <identifiant-du-registre> [--sortie <fichier>]');
    console.error('L\'identifiant est en minuscules, chiffres et tirets (ex : nationalite-jury).');
    process.exitCode = 2;
    return;
  }
  const contrat = await lireContrat(source);
  const analyse = analyser(contrat);
  const brouillon = ecrire(id, contrat, source, analyse);
  if (sortie) fs.writeFileSync(sortie, brouillon); else process.stdout.write(brouillon);

  // Bilan sur la sortie d'erreur, pour ne pas polluer le brouillon.
  console.error(`\nBilan pour « ${id} » : ${analyse.operations.size} opération(s) reconnue(s), identification ${analyse.identification.mode}.`);
  for (const [operation, p] of analyse.operations) {
    const n = (s) => p.r.trouvees.filter((t) => t.score === s).length;
    console.error(`  ${operation.padEnd(22)} GET ${p.chemin} : ${p.r.trouvees.length} donnée(s) rapprochée(s) `
      + `(${n(3)} même nom, ${n(2)} synonyme, ${n(1)} à vérifier), ${p.r.ignores.length} champ(s) ignoré(s)`);
  }
  for (const r of analyse.remarques) console.error(`  ATTENTION : ${r}`);
  console.error('Rien n\'est activé : relire le brouillon, puis npm run tester-registre avant de passer le registre à « actif ».');
}

main().catch((err) => {
  console.error(`[proposer-registre] échec : ${err.message}`);
  process.exitCode = 1;
});
