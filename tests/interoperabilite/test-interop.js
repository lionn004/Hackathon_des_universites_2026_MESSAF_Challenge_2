/**
 * Test d'interopérabilité : répétition du test du jury.
 *
 * Le jury remplacera un de nos registres par celui d'une autre équipe. Ce script
 * le simule avec tests/interoperabilite/registre-externe.js (conforme aux contrats,
 * mais différent du nôtre) et rejoue toute la plateforme pour chaque branchement :
 *   reference (nos 3 registres), etat-civil, justice, fiscal, tous (les 3 remplacés),
 * puis des cas de panne (registre arrêté, URL mal saisie).
 *
 * Le branchement se fait comme le fera le jury : variables REGISTRE_*_URL de la
 * passerelle, puis redémarrage de la seule passerelle.
 *
 * La stack de test tourne dans un projet Docker séparé (dlnuf-interop), avec sa
 * propre base : le journal de démo n'est pas pollué. Elle utilise les mêmes ports
 * que la stack principale, qu'il faut donc arrêter avant (docker compose down).
 *
 * Usage (depuis la racine du dépôt, Node 18 ou plus) :
 *   node tests/interoperabilite/test-interop.js            construit, teste, puis supprime la stack de test
 *   node tests/interoperabilite/test-interop.js --garder   laisse la stack de test tourner à la fin
 *   node tests/interoperabilite/test-interop.js --sans-build  réutilise les images déjà construites
 *
 * Niveaux de résultat :
 *   ECHEC      contrat ou minimisation non respectés (le test du jury échouerait) ;
 *   ATTENTION  la plateforme reste correcte mais se dégrade (démo gênée, message trompeur) ;
 *   OK         conforme.
 * Code de sortie : 1 s'il y a au moins un ECHEC.
 */
const { execFileSync } = require('node:child_process');
const path = require('node:path');

// Docker échoue sous Windows si la lettre de lecteur du dossier courant est en minuscule.
const RACINE = path.resolve(__dirname, '..', '..').replace(/^[a-z]:/, (d) => d.toUpperCase());
const PROJET = 'dlnuf-interop';
const FICHIERS_COMPOSE = ['-f', 'docker-compose.yml', '-f', 'tests/interoperabilite/docker-compose.interop.yml'];
const GARDER = process.argv.includes('--garder');
const SANS_BUILD = process.argv.includes('--sans-build');

const BFF = 'http://localhost:3000/api';
const PASSERELLE = 'http://localhost:3004/api';
const CLE_SERVICE = process.env.CLE_SERVICE_INTERNE || 'dlnuf-cle-interne-a-changer';

/** Variable d'environnement de la passerelle pour chaque registre. */
const VARIABLES = { 'etat-civil': 'REGISTRE_ETAT_CIVIL_URL', justice: 'REGISTRE_JUSTICE_URL', fiscal: 'REGISTRE_FISCAL_URL' };
/** Nos registres (valeurs par défaut du docker-compose.yml). */
const NOS_REGISTRES = {
  'etat-civil': 'http://registre-etat-civil:3001/api',
  justice: 'http://registre-justice:3002/api',
  fiscal: 'http://registre-fiscal:3003/api',
};
/** Le registre « d'une autre équipe ». */
const REGISTRES_EXTERNES = {
  'etat-civil': 'http://registre-externe:4001/api',
  justice: 'http://registre-externe:4002/api',
  fiscal: 'http://registre-externe:4003/api',
};

const ADMIN = {
  universite: '00000000-0000-4000-8000-000000000001',
  police: '00000000-0000-4000-8000-000000000002',
  banque: '00000000-0000-4000-8000-000000000004',
};
const AMADOU = { iue: '784302956148', mot_de_passe: 'Amadou2026!' };
const IBRAHIM = { iue: '291047583620', mot_de_passe: 'Ibrahim2026!' };
const FATIMATA = { iue: '638501274093', mot_de_passe: 'Fatimata2026!' };
// Connue du seul registre externe, avec son fils mineur Issa.
const RASMATA = { iue: '102938475610', mot_de_passe: 'Rasmata2026!', telephone: '+22670000310' };
const ISSA_IUE = '564738291056';

/** Marqueur porté par les champs hors contrat du registre externe. */
const MARQUEUR_FUITE = 'FUITE-HORS-CONTRAT';

/** Champs attendus, d'après les règles de minimisation (backend/consentement/prisma/seed.js). */
const CHAMPS_PASSEPORT_ETAT_CIVIL = ['nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe', 'nationalite', 'pere_iue', 'mere_iue'];
const CHAMPS_PASSEPORT_JUSTICE = ['casier_vierge', 'est_national', 'mode_acquisition', 'numero_certificat'];
/** Champs du contrat de la passerelle pour GET /interne/citoyens/{iue}. */
const CHAMPS_IDENTITE = ['iue', 'nom', 'prenom', 'date_naissance', 'est_majeur'];

const resultats = [];
let scenarioCourant = '';

// Outils

/**
 * Enregistre et affiche le résultat d'une vérification.
 * @param {boolean} condition Vrai si conforme.
 * @param {string} test Ce qui est vérifié.
 * @param {string} [detail] Explication affichée en cas de problème.
 * @param {'ECHEC'|'ATTENTION'} [niveau='ECHEC'] Gravité si la condition est fausse.
 * @returns {boolean} condition
 */
function verifier(condition, test, detail = '', niveau = 'ECHEC') {
  const statut = condition ? 'OK' : niveau;
  resultats.push({ scenario: scenarioCourant, statut, test, detail: condition ? '' : detail });
  console.log(`  ${statut.padEnd(9)} ${test}${condition || !detail ? '' : `\n            ${detail}`}`);
  return condition;
}

/**
 * Vérifie qu'un objet a exactement les clés attendues.
 * @param {object} objet
 * @param {string[]} attendues
 * @param {string} test
 */
function verifierCles(objet, attendues, test) {
  const cles = Object.keys(objet || {}).sort();
  const ok = JSON.stringify(cles) === JSON.stringify([...attendues].sort());
  verifier(ok, test, `reçu [${cles.join(', ')}], attendu [${[...attendues].sort().join(', ')}]`);
}

/**
 * Vérifie qu'aucun champ hors contrat du registre externe n'a traversé la plateforme.
 * @param {*} reponse Corps de réponse à inspecter.
 * @param {string} test
 * @param {'ECHEC'|'ATTENTION'} [niveau='ECHEC']
 */
function sansFuite(reponse, test, niveau = 'ECHEC') {
  const texte = JSON.stringify(reponse ?? null);
  const fuites = [...texte.matchAll(/"([^"]+)":"[^"]*FUITE-HORS-CONTRAT/g)].map((m) => m[1]);
  verifier(!texte.includes(MARQUEUR_FUITE), test, `champs hors contrat transmis : ${[...new Set(fuites)].join(', ')}`, niveau);
}

/**
 * Appel HTTP JSON.
 * @param {string} methode
 * @param {string} url
 * @param {{corps?: object, jeton?: string, entetes?: object}} [options]
 * @returns {Promise<{status: number, body: any}>} status 0 si le service est injoignable.
 */
async function appel(methode, url, { corps, jeton, entetes = {} } = {}) {
  try {
    const res = await fetch(url, {
      method: methode,
      headers: {
        ...(corps && { 'Content-Type': 'application/json' }),
        ...(jeton && { Authorization: `Bearer ${jeton}` }),
        ...entetes,
      },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const texte = await res.text();
    let body = null;
    try { body = texte ? JSON.parse(texte) : null; } catch { body = texte; }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: { code: 'INJOIGNABLE', message: e.message } };
  }
}

/** @returns {string} « HTTP 502 SERVICE_INDISPONIBLE : message » pour les messages d'échec. */
function resume(r) {
  return `HTTP ${r.status}${r.body?.code ? ` ${r.body.code}` : ''}${r.body?.message ? ` : ${r.body.message}` : ''}`;
}

/** Pause. @param {number} ms */
function pause(ms) {
  return new Promise((ok) => { setTimeout(ok, ms); });
}

/**
 * Attend qu'une URL réponde 200.
 * @param {string} url
 * @param {number} delaiMs
 * @throws {Error} si le délai est dépassé.
 */
async function attendre(url, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    if ((await appel('GET', url)).status === 200) return;
    await pause(1000);
  }
  throw new Error(`${url} ne répond toujours pas après ${delaiMs / 1000} s`);
}

/**
 * Lance docker compose sur le projet de test.
 * @param {string[]} args
 * @param {object} [env] Variables ajoutées (URL des registres).
 * @param {boolean} [sortie=false] Vrai pour récupérer la sortie standard (logs).
 * @returns {string} Sortie standard si demandée, sinon chaîne vide.
 */
function compose(args, env = {}, sortie = false) {
  const resultat = execFileSync('docker', ['compose', '-p', PROJET, ...FICHIERS_COMPOSE, ...args], {
    cwd: RACINE,
    env: { ...process.env, ...env },
    stdio: ['ignore', sortie ? 'pipe' : 'ignore', 'inherit'],
    encoding: 'utf8',
  });
  return sortie ? resultat : '';
}

/**
 * Attend qu'une ligne des logs de la passerelle corresponde au motif.
 * Le diagnostic des registres tourne en tâche de fond après le démarrage.
 * @param {RegExp} motif
 * @param {number} [delaiMs=20000]
 * @returns {Promise<string|null>} La ligne trouvée, ou null après le délai.
 */
async function attendreLog(motif, delaiMs = 20000) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    const ligne = compose(['logs', '--no-log-prefix', 'passerelle'], {}, true).split('\n').find((l) => motif.test(l));
    if (ligne) return ligne.trim();
    await pause(1000);
  }
  return null;
}

/**
 * Vérifie le diagnostic écrit par la passerelle à son démarrage, pour chaque registre.
 * @param {Set<string>} remplaces
 */
async function diagnosticDemarrage(remplaces) {
  for (const registre of Object.keys(VARIABLES)) {
    const url = remplaces.has(registre) ? REGISTRES_EXTERNES[registre] : NOS_REGISTRES[registre];
    const ligne = await attendreLog(new RegExp(`registre ${registre}`));
    verifier(
      ligne !== null && ligne.includes('(conforme)') && ligne.includes(url),
      `Diagnostic au démarrage : registre ${registre} conforme (${url})`,
      ligne || 'aucune ligne de diagnostic dans les logs',
    );
  }
}

/**
 * URL des registres à donner à la passerelle.
 * @param {Set<string>} remplaces Registres remplacés par le registre externe.
 * @param {object} [surcharges] URL imposées (cas de configuration erronée).
 * @returns {object} { REGISTRE_ETAT_CIVIL_URL, ... }
 */
function environnement(remplaces, surcharges = {}) {
  const env = {};
  for (const [registre, variable] of Object.entries(VARIABLES)) {
    env[variable] = surcharges[registre] || (remplaces.has(registre) ? REGISTRES_EXTERNES[registre] : NOS_REGISTRES[registre]);
  }
  return env;
}

/**
 * Rebranche la passerelle (comme le jury : variables d'environnement + redémarrage).
 * @param {Set<string>} remplaces
 * @param {object} [surcharges]
 */
async function brancher(remplaces, surcharges = {}) {
  compose(['up', '-d', '--no-deps', 'passerelle'], environnement(remplaces, surcharges));
  await attendre(`${PASSERELLE}/types-pieces`, 90000);
  // Le BFF garde parfois une connexion vers l'ancien conteneur : on attend qu'il voie le nouveau.
  await attendre(`${BFF}/types-pieces`, 30000);
}

/**
 * Requête d'une administration via l'interface de test du BFF.
 * @returns {Promise<{status: number, body: any}>}
 */
function requeteAdmin(administrationId, iue, demarcheId) {
  return appel('POST', `${BFF}/test/requete`, {
    corps: { administration_id: administrationId, iue_citoyen: iue, demarche_id: demarcheId },
  });
}

/**
 * Connexion d'un citoyen à l'espace usager.
 * @returns {Promise<string|null>} Jeton, ou null si la connexion échoue.
 */
async function connexion({ iue, mot_de_passe: motDePasse }) {
  const r = await appel('POST', `${BFF}/auth/connexion`, { corps: { iue, mot_de_passe: motDePasse } });
  return r.status === 200 ? r.body.token : null;
}

// Vérifications

/** Procédure 1 : inscription universitaire (publique, 2 champs). */
async function procedureUniversite() {
  const r = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  if (!verifier(r.status === 200, 'Procédure 1 (université) : accès direct, HTTP 200', resume(r))) return;
  verifierCles(r.body.donnees?.['etat-civil'], ['est_majeur', 'nationalite'], 'Procédure 1 : seuls est_majeur et nationalite sont transmis');
  sansFuite(r.body, 'Procédure 1 : aucun champ hors contrat transmis');
}

/** Procédure 2 : passeport (publique, cascade). */
async function procedurePasseport(remplaces) {
  const r = await requeteAdmin(ADMIN.police, AMADOU.iue, 'emission-passeport');
  if (!verifier(r.status === 200, 'Procédure 2 (passeport) : accès direct, HTTP 200', resume(r))) return;
  const { donnees = {}, cascade = [] } = r.body;
  verifierCles(donnees['etat-civil'], CHAMPS_PASSEPORT_ETAT_CIVIL, 'Procédure 2 : champs état civil conformes à la démarche');
  verifierCles(donnees.justice, CHAMPS_PASSEPORT_JUSTICE, 'Procédure 2 : champs justice conformes à la démarche');
  sansFuite(r.body, 'Procédure 2 : aucun champ hors contrat transmis');

  const externeEC = remplaces.has('etat-civil');
  verifier(
    donnees['etat-civil']?.lieu_naissance === (externeEC ? 'Bobo-Dioulasso' : 'Ouagadougou'),
    `Procédure 2 : état civil lu dans ${externeEC ? 'le registre externe' : 'notre registre'}`,
    `lieu_naissance = ${donnees['etat-civil']?.lieu_naissance}`,
  );
  const externeJU = remplaces.has('justice');
  verifier(
    donnees.justice?.casier_vierge === !externeJU,
    `Procédure 2 : justice lue dans ${externeJU ? 'le registre externe' : 'notre registre'}`,
    `casier_vierge = ${donnees.justice?.casier_vierge}`,
  );
  // La mère d'Amadou est inconnue du registre externe : son extrait doit passer au guichet.
  const mere = cascade.find((p) => p.type_piece === 'extrait-naissance' && p.proprietaire === 'mere');
  const attendu = externeEC ? 'manquant_fallback_physique' : 'resolu';
  verifier(mere?.statut === attendu, `Procédure 2 : cascade, extrait de la mère « ${attendu} »`, `statut = ${mere?.statut}`);
}

/** Procédure 3 : compte bancaire (privée, consentement accepté par Amadou). */
async function procedureBanque(remplaces) {
  const r = await requeteAdmin(ADMIN.banque, AMADOU.iue, 'ouverture-compte-bancaire');
  if (!verifier(r.status === 202, 'Procédure 3 (banque) : consentement requis, HTTP 202', resume(r))) return;
  sansFuite(r.body, 'Procédure 3 : rien n\'est transmis avant le consentement');

  const jeton = await connexion(AMADOU);
  if (!verifier(!!jeton, 'Procédure 3 : connexion d\'Amadou à son espace')) return;
  const decision = await appel('PUT', `${BFF}/consentements/${r.body.consentement_id}`, { jeton, corps: { decision: 'accepte' } });
  if (!verifier(decision.status === 200, 'Procédure 3 : Amadou accepte le consentement', resume(decision))) return;

  const suivi = await appel('GET', `${BFF}/test/requetes/${r.body.requete_id}?administration_id=${ADMIN.banque}`);
  if (!verifier(suivi.body?.statut === 'complete', 'Procédure 3 : requête complète après acceptation', resume(suivi) + ` statut=${suivi.body?.statut}`)) return;
  verifierCles(suivi.body.donnees?.['etat-civil'], ['nom', 'prenom', 'nationalite'], 'Procédure 3 : champs état civil acceptés seulement');
  verifierCles(suivi.body.donnees?.fiscal, ['en_regle'], 'Procédure 3 : champ fiscal accepté seulement');
  sansFuite(suivi.body, 'Procédure 3 : aucun champ hors contrat transmis');
  const externeFI = remplaces.has('fiscal');
  verifier(
    suivi.body.donnees?.fiscal?.en_regle === !externeFI,
    `Procédure 3 : situation fiscale lue dans ${externeFI ? 'le registre externe' : 'notre registre'}`,
    `en_regle = ${suivi.body.donnees?.fiscal?.en_regle}`,
  );
}

/** Contrat de la passerelle GET /interne/citoyens/{iue}, et ce que le citoyen voit dans son espace. */
async function identite() {
  const r = await appel('GET', `${PASSERELLE}/interne/citoyens/${IBRAHIM.iue}`, { entetes: { 'X-Cle-Service': CLE_SERVICE } });
  if (!verifier(r.status === 200, 'Identité (passerelle) : HTTP 200', resume(r))) return;
  const { enfants = [], ...personne } = r.body;
  verifierCles(personne, CHAMPS_IDENTITE, 'Identité (passerelle) : champs du contrat seulement');
  verifier(
    enfants.every((e) => Object.keys(e).every((c) => CHAMPS_IDENTITE.includes(c))),
    'Identité (passerelle) : enfants avec les champs du contrat seulement',
    `champs reçus : ${[...new Set(enfants.flatMap(Object.keys))].join(', ')}`,
  );

  const jeton = await connexion(IBRAHIM);
  if (!verifier(!!jeton, 'Espace usager : connexion d\'Ibrahim')) return;
  for (const route of ['/profil', '/enfants', '/tableau-de-bord']) {
    const page = await appel('GET', `${BFF}${route}`, { jeton });
    if (verifier(page.status === 200, `Espace usager : GET ${route} (Ibrahim), HTTP 200`, resume(page))) {
      sansFuite(page.body, `Espace usager : GET ${route} sans champ hors contrat`);
    }
  }
}

/** Demandes de pièces et consultation de leur contenu (Amadou). */
async function pieces(remplaces) {
  const jeton = await connexion(AMADOU);
  if (!verifier(!!jeton, 'Pièces : connexion d\'Amadou')) return;
  const externeEC = remplaces.has('etat-civil');

  // Statut attendu : la mère d'Amadou est inconnue du registre externe (certificat et casier en dépendent).
  const attendus = {
    'extrait-naissance': 'complete',
    'certificat-nationalite': externeEC ? 'fallback_physique' : 'complete',
    'casier-judiciaire': externeEC ? 'fallback_physique' : 'complete',
    'attestation-fiscale': 'complete',
  };

  for (const [typePiece, statutAttendu] of Object.entries(attendus)) {
    const d = await appel('POST', `${BFF}/demandes`, { jeton, corps: { type_piece_id: typePiece } });
    if (!verifier(d.status === 201, `Pièce ${typePiece} : demande créée, HTTP 201`, resume(d))) continue;
    verifier(d.body.statut === statutAttendu, `Pièce ${typePiece} : statut « ${statutAttendu} »`, `statut = ${d.body.statut}`);

    const c = await appel('GET', `${BFF}/demandes/${d.body.id}/contenu`, { jeton });
    if (d.body.statut !== 'complete') {
      verifier(c.status === 409 && c.body?.code === 'PIECE_INDISPONIBLE', `Pièce ${typePiece} : contenu indisponible (409)`, resume(c));
      continue;
    }
    if (!verifier(c.status === 200, `Pièce ${typePiece} : contenu, HTTP 200`, resume(c))) continue;
    const donnees = c.body.donnees || {};
    verifier(!('iue' in donnees), `Pièce ${typePiece} : pas d'iue dans donnees`);
    // Le citoyen consulte ses propres données : une fuite ici n'expose rien à une administration.
    sansFuite(c.body, `Pièce ${typePiece} : aucun champ hors contrat dans le contenu`, 'ATTENTION');

    if (typePiece === 'extrait-naissance') {
      verifier(!('pere_iue' in donnees) && !('mere_iue' in donnees), 'Extrait : pere et mere remplacent pere_iue et mere_iue');
      verifier(donnees.pere?.prenom === 'Ibrahim', 'Extrait : père lu à l\'état civil', JSON.stringify(donnees.pere));
      verifier(
        externeEC ? donnees.mere === null : donnees.mere?.prenom === 'Fatimata',
        `Extrait : mère ${externeEC ? 'inconnue (null)' : 'lue à l\'état civil'}`,
        JSON.stringify(donnees.mere),
      );
    }
    if (typePiece === 'attestation-fiscale') {
      const externeFI = remplaces.has('fiscal');
      verifier(
        String(donnees.ifu).startsWith('IFU-EXT') === externeFI,
        `Attestation fiscale lue dans ${externeFI ? 'le registre externe' : 'notre registre'}`,
        `ifu = ${donnees.ifu}`,
      );
    }
  }
}

/** Citoyen qui a un compte mais que le nouvel état civil ne connaît pas (Fatimata). */
async function citoyenAbsent() {
  const r = await requeteAdmin(ADMIN.universite, FATIMATA.iue, 'inscription-universite');
  verifier(
    r.status === 404 && r.body?.code === 'CITOYEN_NON_TROUVE',
    'Citoyen absent du registre : requête refusée proprement (404 CITOYEN_NON_TROUVE)',
    resume(r),
  );
  const jeton = await connexion(FATIMATA);
  if (!verifier(!!jeton, 'Citoyen absent du registre : connexion à son espace', '', 'ATTENTION')) return;
  for (const route of ['/profil', '/tableau-de-bord', '/journal', '/consentements']) {
    const page = await appel('GET', `${BFF}${route}`, { jeton });
    verifier(page.status === 200, `Citoyen absent du registre : GET ${route} utilisable`, resume(page), 'ATTENTION');
  }
}

/** Inscription en direct d'un citoyen connu du seul registre externe, avec rattachement de son fils mineur. */
async function inscriptionDirecte() {
  const r = await appel('POST', `${BFF}/auth/inscription`, {
    corps: { iue: RASMATA.iue, mot_de_passe: RASMATA.mot_de_passe, telephone: RASMATA.telephone },
  });
  // Le scénario « tous » rejoue l'inscription : le compte existe déjà.
  const dejaInscrite = r.status === 409 && r.body?.code === 'IUE_DEJA_ENREGISTRE';
  if (!verifier(r.status === 201 || dejaInscrite, 'Inscription en direct (citoyenne du registre externe)', resume(r))) return;
  if (!dejaInscrite) {
    verifier(r.body.citoyen?.nom === 'KABORE', 'Inscription : nom lu dans le registre externe', JSON.stringify(r.body.citoyen));
  }
  const jeton = await connexion(RASMATA);
  const enfants = await appel('GET', `${BFF}/enfants`, { jeton });
  verifier(
    (enfants.body?.enfants || []).some((e) => e.iue === ISSA_IUE),
    'Inscription : fils mineur rattaché automatiquement',
    resume(enfants) + ` ${JSON.stringify(enfants.body?.enfants)}`,
  );
}

/** Nombre d'accès au journal d'Amadou. @returns {Promise<number|null>} */
async function totalJournal() {
  const jeton = await connexion(AMADOU);
  const r = await appel('GET', `${BFF}/journal?limite=1`, { jeton });
  return r.status === 200 ? r.body.pagination?.total ?? null : null;
}

/** Cas de panne et de configuration erronée (état civil externe). */
async function pannes() {
  const etatCivil = new Set(['etat-civil']);

  // 1. Registre arrêté : erreur claire, et aucune donnée ni entrée de journal.
  await brancher(etatCivil);
  const avant = await totalJournal();
  compose(['stop', 'registre-externe']);
  const r = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  // L'interface de test du BFF relaie l'erreur de la passerelle sous son propre code
  // (SERVICE_EN_ERREUR) : on vérifie le statut et que le message nomme le registre.
  verifier(
    r.status === 502 && /registre etat-civil ne répond pas/.test(r.body?.message || ''),
    'Registre arrêté : 502 dont le message nomme le registre',
    resume(r),
  );
  verifier((await totalJournal()) === avant, 'Registre arrêté : aucune entrée de journal créée', `avant ${avant}`);
  compose(['start', 'registre-externe']);
  await pause(2000);

  // 2. URL saisie sans le préfixe /api : chaque appel tombe sur une route inconnue (page HTML 404).
  //    Les requêtes répondent « citoyen absent » ; la passerelle doit le signaler dans ses logs.
  await brancher(etatCivil, { 'etat-civil': 'http://registre-externe:4001' });
  const avertissement = await attendreLog(/ATTENTION registre etat-civil non conforme/);
  verifier(
    avertissement !== null && avertissement.includes('REGISTRE_ETAT_CIVIL_URL'),
    'URL sans /api : avertissement dans les logs de la passerelle, qui cite la variable à corriger',
    avertissement || 'aucun avertissement dans les logs',
  );

  // 3. URL saisie avec une barre oblique finale.
  await brancher(etatCivil, { 'etat-civil': 'http://registre-externe:4001/api/' });
  const barreFinale = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  verifier(barreFinale.status === 200, 'URL avec « / » final : acceptée', resume(barreFinale));
}

// Déroulé

const SCENARIOS = [
  ['reference (nos 3 registres)', []],
  ['etat-civil externe', ['etat-civil']],
  ['justice externe', ['justice']],
  ['fiscal externe', ['fiscal']],
  ['tous externes', ['etat-civil', 'justice', 'fiscal']],
];

/** Lance la stack de test, joue les scénarios, affiche le bilan. */
async function main() {
  console.log(`Stack de test « ${PROJET} » : démarrage${SANS_BUILD ? '' : ' (avec construction des images)'}...`);
  compose(['up', '-d', ...(SANS_BUILD ? [] : ['--build'])], environnement(new Set()));
  await attendre(`${BFF}/types-pieces`, 300000);
  await attendre('http://localhost:4001/api/citoyens/784302956148', 30000);

  try {
    for (const [nom, remplaces] of SCENARIOS) {
      scenarioCourant = nom;
      const ensemble = new Set(remplaces);
      console.log(`\n== Scénario : ${nom}`);
      await brancher(ensemble);
      await diagnosticDemarrage(ensemble);
      await procedureUniversite();
      await procedurePasseport(ensemble);
      await procedureBanque(ensemble);
      await identite();
      await pieces(ensemble);
      if (ensemble.has('etat-civil')) {
        await citoyenAbsent();
        await inscriptionDirecte();
      }
    }
    scenarioCourant = 'pannes et configuration';
    console.log(`\n== Scénario : ${scenarioCourant}`);
    await pannes();
  } finally {
    if (GARDER) {
      await brancher(new Set());
      console.log(`\nStack de test laissée en marche (nos registres rebranchés). Arrêt : docker compose -p ${PROJET} down -v`);
    } else {
      console.log('\nSuppression de la stack de test...');
      compose(['down', '-v']);
    }
  }

  const compte = (statut) => resultats.filter((r) => r.statut === statut).length;
  console.log(`\nBilan : ${compte('OK')} OK, ${compte('ECHEC')} ECHEC, ${compte('ATTENTION')} ATTENTION`);
  for (const r of resultats.filter((x) => x.statut !== 'OK')) {
    console.log(`  ${r.statut.padEnd(9)} [${r.scenario}] ${r.test}${r.detail ? ` : ${r.detail}` : ''}`);
  }
  process.exitCode = compte('ECHEC') > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(`\nArrêt du test : ${e.message}`);
  process.exitCode = 2;
});
