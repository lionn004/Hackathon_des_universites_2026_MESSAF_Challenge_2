/**
 * Test d'interopérabilité : répétition du test du jury.
 *
 * Le jury remplacera un de nos registres par celui d'une autre équipe. Ce script
 * le simule avec tests/interoperabilite/registre-externe.js (conforme aux contrats,
 * mais différent du nôtre) et rejoue toute la plateforme pour chaque branchement :
 *   reference (nos 3 registres), etat-civil, justice, fiscal, tous (les 3 remplacés),
 * puis :
 *   format différent : registres d'un autre format branchés par le seul catalogue
 *     (« majeur » calculé, recherche sans IUE, homonyme, source de secours, tester-registre) ;
 *   panne en direct : on coupe le casier puis l'état civil, la plateforme tient, rien ne se
 *     perd, et tout se complète seul au retour du registre ;
 *   donnée numérique manquante : les actes sont numérisés, la demande bloquée se complète seule ;
 *   pannes et configuration : registre externe arrêté, URL mal saisie.
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
 *   node tests/interoperabilite/test-interop.js --seul=panne  ne joue que les scénarios dont le nom
 *                                                             contient « panne » (répétition d'une démo)
 *
 * Niveaux de résultat :
 *   ECHEC      contrat ou minimisation non respectés (le test du jury échouerait) ;
 *   ATTENTION  la plateforme reste correcte mais se dégrade (démo gênée, message trompeur) ;
 *   OK         conforme.
 * Code de sortie : 1 s'il y a au moins un ECHEC.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Docker échoue sous Windows si la lettre de lecteur du dossier courant est en minuscule.
const RACINE = path.resolve(__dirname, '..', '..').replace(/^[a-z]:/, (d) => d.toUpperCase());
const PROJET = 'dlnuf-interop';
const FICHIERS_COMPOSE = ['-f', 'docker-compose.yml', '-f', 'tests/interoperabilite/docker-compose.interop.yml'];
const GARDER = process.argv.includes('--garder');
/** Services démarrés : le frontend et la documentation ne servent pas au test. */
const SERVICES = ['postgres', 'registre-etat-civil', 'registre-justice', 'registre-fiscal', 'journal',
  'consentement', 'passerelle', 'espace-usager', 'registre-externe'];
const SANS_BUILD = process.argv.includes('--sans-build');
/** Filtre facultatif sur le nom des scénarios (option --seul=<texte>). */
const SEUL = (process.argv.find((a) => a.startsWith('--seul=')) || '').slice('--seul='.length);
/** Vrai si le scénario doit être joué (tous, sans l'option --seul). */
const retenu = (nom) => !SEUL || nom.includes(SEUL);

const BFF = 'http://localhost:3000/api';
const PASSERELLE = 'http://localhost:3004/api';
const CLE_SERVICE = process.env.CLE_SERVICE_INTERNE || 'dlnuf-cle-interne-a-changer';
const JWT_SECRET = process.env.JWT_SECRET || 'dlnuf-dev-secret-a-changer';

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
const AWA_IUE = '456123789012';
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
function environnement(remplaces, surcharges = {}, catalogueDossier = '/app/config') {
  // Reprise automatique des demandes toutes les 3 s pendant le test (10 s par défaut).
  const env = { CATALOGUE_DOSSIER: catalogueDossier, REPRISE_INTERVALLE_MS: '3000', SONDE_INTERVALLE_MS: '2000' };
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
async function brancher(remplaces, surcharges = {}, catalogueDossier = '/app/config') {
  compose(['up', '-d', '--no-deps', 'passerelle'], environnement(remplaces, surcharges, catalogueDossier));
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
 * Jeton d'administration HS256 (même format que `npm run jeton:admin` de la passerelle),
 * pour appeler directement les routes de la passerelle que l'interface de test ne relaie pas.
 * @param {string} administrationId
 * @returns {string}
 */
function jetonAdmin(administrationId) {
  const b64 = (objet) => Buffer.from(JSON.stringify(objet)).toString('base64url');
  const corps = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ administration_id: administrationId, iat: Math.floor(Date.now() / 1000) })}`;
  return `${corps}.${crypto.createHmac('sha256', JWT_SECRET).update(corps).digest('base64url')}`;
}

/**
 * Suivi d'une requête par l'administration, via l'interface de test du BFF.
 * @returns {Promise<{status: number, body: any}>}
 */
function suiviRequete(requeteId, administrationId) {
  return appel('GET', `${BFF}/test/requetes/${requeteId}?administration_id=${administrationId}`);
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

  // Remise unique : les données sont parties dans la réponse du POST, la passerelle n'en garde pas de copie.
  const relecture = await suiviRequete(r.body.requete_id, ADMIN.universite);
  verifier(
    relecture.body?.statut === 'complete' && relecture.body?.donnees === null,
    'Procédure 1 : aucune copie gardée (relecture : complete, donnees null)',
    `${resume(relecture)} statut=${relecture.body?.statut} donnees=${JSON.stringify(relecture.body?.donnees)}`,
  );
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
  // La mère d'Amadou est inconnue du registre externe : son extrait est une donnée numérique manquante.
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

  // La relance par téléphone met le statut à jour sans consommer la remise unique.
  const relance = await appel('GET', `${PASSERELLE}/requetes/${r.body.requete_id}/telephone`, {
    jeton: jetonAdmin(ADMIN.banque),
  });
  verifier(
    relance.status === 400 && relance.body?.code === 'RELANCE_IMPOSSIBLE',
    'Procédure 3 : relance par téléphone refusée une fois le consentement donné',
    resume(relance),
  );

  const suivi = await suiviRequete(r.body.requete_id, ADMIN.banque);
  if (!verifier(suivi.body?.statut === 'complete', 'Procédure 3 : requête complète après acceptation', resume(suivi) + ` statut=${suivi.body?.statut}`)) return;
  verifier(!!suivi.body.donnees, 'Procédure 3 : données remises à la première consultation (après la relance)', JSON.stringify(suivi.body));

  const relecture = await suiviRequete(r.body.requete_id, ADMIN.banque);
  verifier(
    relecture.body?.statut === 'complete' && relecture.body?.donnees === null,
    'Procédure 3 : remise unique, aucune copie gardée (2e consultation : donnees null)',
    `${resume(relecture)} donnees=${JSON.stringify(relecture.body?.donnees)}`,
  );
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

  // 1. Registre externe arrêté : requête mise en attente, sans donnée ni entrée de journal,
  //    puis complétée à son retour.
  await brancher(etatCivil);
  const avant = await totalJournal();
  compose(['stop', 'registre-externe']);
  const r = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  verifier(
    r.status === 202 && r.body?.statut === 'en_attente_registre' && (r.body.registres_indisponibles || []).includes('etat-civil'),
    'Registre arrêté : requête mise en attente (202 en_attente_registre, registre nommé)',
    `${resume(r)} ${JSON.stringify(r.body)}`,
  );
  verifier((await totalJournal()) === avant, 'Registre arrêté : aucune entrée de journal créée', `avant ${avant}`);
  compose(['start', 'registre-externe']);
  await attendreCondition(async () => etatRegistre('etat-civil') === 'disponible', 30000);
  const repris = await suiviRequete(r.body?.requete_id, ADMIN.universite);
  verifier(
    repris.body?.statut === 'complete' && repris.body?.donnees?.['etat-civil']?.est_majeur === true,
    'Registre revenu : la requête se complète à la consultation suivante',
    `${resume(repris)} ${JSON.stringify(repris.body)}`,
  );

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

/**
 * Attend qu'une condition asynchrone soit vraie.
 * @param {Function} condition async () => boolean
 * @param {number} delaiMs
 * @returns {Promise<boolean>} Vrai si la condition est remplie avant le délai.
 */
async function attendreCondition(condition, delaiMs) {
  const fin = Date.now() + delaiMs;
  while (Date.now() < fin) {
    try {
      if (await condition()) return true;
    } catch { /* on réessaie */ }
    await pause(1000);
  }
  return false;
}

/** @returns {Promise<string|undefined>} Disponibilité d'un registre selon GET /registres du BFF. */
async function etatRegistre(id) {
  const r = await appel('GET', `${BFF}/registres`);
  return ((r.body || {}).registres || []).find((x) => x.id === id)?.disponibilite;
}

/**
 * Lance une commande dans un conteneur de la stack de test.
 * @returns {{code: number, sortie: string}}
 */
function executer(service, commande) {
  const r = spawnSync('docker', ['compose', '-p', PROJET, ...FICHIERS_COMPOSE, 'exec', '-T', service, ...commande], {
    cwd: RACINE, encoding: 'utf8',
  });
  return { code: r.status, sortie: `${r.stdout || ''}${r.stderr || ''}` };
}

/** Panne simulée d'un registre du registre externe (port 4009). */
function panneSimulee(registre, active) {
  return appel('GET', `http://localhost:4009/panne/${registre}?etat=${active ? 'on' : 'off'}`);
}

/** Registres d'un autre format, branchés par le seul catalogue (config-format-different). */
async function formatDifferent() {
  const dossier = path.join(RACINE, 'tests', 'interoperabilite', 'config-format-different');
  fs.copyFileSync(path.join(RACINE, 'backend', 'passerelle', 'config', 'dictionnaire.yaml'), path.join(dossier, 'dictionnaire.yaml'));
  await brancher(new Set(), {}, '/app/config-format-different');

  const etat = await appel('GET', `${BFF}/registres`, {});
  const ids = ((etat.body || {}).registres || []).map((x) => x.id).sort();
  verifier(JSON.stringify(ids) === JSON.stringify(['etat-civil-v2', 'fiscal', 'justice', 'nationalite-externe']),
    'Catalogue : les registres déclarés sont branchés (GET /registres)', JSON.stringify(etat.body));
  sansFuite(etat.body, 'Catalogue : GET /registres sans donnée');
  verifier(!JSON.stringify(etat.body).includes('registre-externe:'), 'Catalogue : les adresses des registres ne sont pas exposées');
  const dico = await appel('GET', `${BFF}/dictionnaire`);
  verifier(dico.body?.domaines?.['etat-civil']?.est_majeur?.libelle === 'Majeur' && dico.body.domaines['etat-civil'].est_majeur.calculee === true,
    'Dictionnaire : « est_majeur » a le libellé « Majeur » et est calculé', JSON.stringify(dico.body?.domaines?.['etat-civil']?.est_majeur));

  // « Ne transmettre que l'utile » : le registre v2 n'a pas est_majeur, la passerelle le calcule.
  const u = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  verifier(u.status === 200 && JSON.stringify(u.body.donnees) === JSON.stringify({ 'etat-civil': { est_majeur: true, nationalite: 'Burkinabè' } }),
    'Format différent : « majeur : oui » calculé, rien d\'autre transmis (ni la date de naissance)', `${resume(u)} ${JSON.stringify(u.body?.donnees)}`);
  const awa = await requeteAdmin(ADMIN.universite, AWA_IUE, 'inscription-universite');
  verifier(awa.body?.donnees?.['etat-civil']?.est_majeur === false, 'Format différent : Awa (12 ans) calculée mineure', JSON.stringify(awa.body?.donnees));

  // Passeport : correspondances, conversions, recherche sans IUE, cascade par la fiche.
  const p = await requeteAdmin(ADMIN.police, AMADOU.iue, 'emission-passeport');
  const ec = p.body?.donnees?.['etat-civil'] || {};
  const ju = p.body?.donnees?.justice || {};
  verifier(p.status === 200, 'Format différent : passeport servi (HTTP 200)', resume(p));
  verifier(ec.date_naissance === '1998-03-15' && ec.sexe === 'M' && ec.lieu_naissance === 'Bobo-Dioulasso' && ec.mere_iue === FATIMATA.iue,
    'Format différent : dates JJ/MM/AAAA, sexe en lettres et parents imbriqués traduits', JSON.stringify(ec));
  verifier(ju.est_national === true && ju.mode_acquisition === 'naissance' && ju.numero_certificat === 'NAT-N-0001',
    'Format différent : nationalité lue par recherche (sans IUE), « oui » et « Naissance » convertis', JSON.stringify(ju));
  verifier((p.body?.cascade || []).every((c) => c.statut === 'resolu') && (p.body?.cascade || []).length === 5,
    'Format différent : cascade résolue (parents lus dans la fiche, sans route de filiation)', JSON.stringify(p.body?.cascade));
  sansFuite(p.body, 'Format différent : aucun champ hors dictionnaire transmis');

  // Source de secours : le registre de nationalité tombe, notre registre justice prend le relais.
  await panneSimulee('nationalite-externe', true);
  const s = await requeteAdmin(ADMIN.police, AMADOU.iue, 'emission-passeport');
  verifier(s.status === 200 && s.body?.donnees?.justice?.numero_certificat === 'CN-2020-00456',
    'Source de secours : registre de nationalité en panne, la justice sert la nationalité (200)', `${resume(s)} ${JSON.stringify(s.body?.donnees?.justice)}`);
  verifier((await etatRegistre('nationalite-externe')) === 'hors_service', 'Source de secours : la panne est visible (GET /registres)');
  await panneSimulee('nationalite-externe', false);
  await attendreCondition(async () => (await etatRegistre('nationalite-externe')) === 'disponible', 20000);
  const f = await requeteAdmin(ADMIN.police, AMADOU.iue, 'emission-passeport');
  verifier(f.body?.donnees?.justice?.numero_certificat === 'NAT-N-0001', 'Source de secours : au retour, la source principale fait de nouveau foi',
    JSON.stringify(f.body?.donnees?.justice));

  // Commande de test du branchement.
  const t1 = executer('passerelle', ['npm', 'run', '-s', 'tester-registre', '--', 'etat-civil-v2', AMADOU.iue]);
  verifier(t1.code === 0 && t1.sortie.includes('est_majeur = true') && t1.sortie.includes('profession'),
    'tester-registre etat-civil-v2 : données obtenues, « majeur » calculé, champ hors dictionnaire ignoré', t1.sortie.slice(-500));
  const t2 = executer('passerelle', ['npm', 'run', '-s', 'tester-registre', '--', 'nationalite-externe', AWA_IUE]);
  verifier(t2.code !== 0 && /plusieurs|introuvable/.test(t2.sortie),
    'tester-registre : un homonyme n\'est jamais choisi au hasard (Awa, deux dossiers)', t2.sortie.slice(-400));

  const jeton = await connexion(AMADOU);
  const profil = await appel('GET', `${BFF}/profil`, { jeton });
  verifier(profil.body?.prenom === 'Amadou', 'Format différent : l\'espace usager lit l\'identité dans le registre v2', JSON.stringify(profil.body));
  await brancher(new Set());
}

/** Panne en direct d'un registre (casier, puis état civil) avec nos registres, puis reprise. */
async function panneEnDirect() {
  await brancher(new Set());
  const jeton = await connexion(AMADOU);
  const casierAvant = await appel('POST', `${BFF}/demandes`, { jeton, corps: { type_piece_id: 'casier-judiciaire' } });

  // Le registre de la justice tombe.
  compose(['stop', 'registre-justice']);
  const debut = Date.now();
  const u = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  verifier(u.status === 200, 'Panne du casier : l\'université reste servie (elle n\'en dépend pas)', resume(u));
  const p = await requeteAdmin(ADMIN.police, AMADOU.iue, 'emission-passeport');
  const duree = Date.now() - debut;
  verifier(p.status === 202 && p.body?.statut === 'en_attente_registre' && (p.body.registres_indisponibles || []).includes('justice'),
    'Panne du casier : la police est mise en attente (202 en_attente_registre)', `${resume(p)} ${JSON.stringify(p.body)}`);
  verifier(duree < 6000, `Panne du casier : réponses rapides, sans attente de délai (${duree} ms pour les deux requêtes)`);
  verifier((await etatRegistre('justice')) === 'hors_service', 'Panne du casier : GET /registres montre la justice hors service');
  const journalAvant = await totalJournal();
  for (const route of ['/tableau-de-bord', '/journal', '/consentements', '/profil']) {
    const page = await appel('GET', `${BFF}${route}`, { jeton });
    verifier(page.status === 200, `Panne du casier : espace usager GET ${route} utilisable`, resume(page));
  }
  const d = await appel('POST', `${BFF}/demandes`, { jeton, corps: { type_piece_id: 'casier-judiciaire' } });
  verifier(d.status === 201 && d.body?.statut === 'en_cours', 'Panne du casier : une nouvelle demande de casier attend le registre (en_cours)', JSON.stringify(d.body));
  if (casierAvant.body?.statut === 'complete') {
    const c = await appel('GET', `${BFF}/demandes/${casierAvant.body.id}/contenu`, { jeton });
    verifier(c.status === 503 && c.body?.code === 'REGISTRE_INDISPONIBLE', 'Panne du casier : contenu d\'une pièce, message clair (503 REGISTRE_INDISPONIBLE)', resume(c));
  }
  const attente = await suiviRequete(p.body?.requete_id, ADMIN.police);
  verifier(attente.body?.statut === 'en_attente_registre' && attente.body?.donnees === null, 'Panne du casier : la requête reste en attente, aucune donnée', JSON.stringify(attente.body));

  // Le registre revient.
  compose(['start', 'registre-justice']);
  const revenu = await attendreCondition(async () => (await etatRegistre('justice')) === 'disponible', 90000);
  verifier(revenu, 'Retour : la sonde voit la justice de nouveau disponible');
  const complete = await suiviRequete(p.body?.requete_id, ADMIN.police);
  verifier(complete.body?.statut === 'complete' && complete.body?.donnees?.justice?.casier_vierge === true,
    'Retour : la police reçoit le dossier complet, sans refaire sa demande', JSON.stringify(complete.body));
  const relecture = await suiviRequete(p.body?.requete_id, ADMIN.police);
  verifier(relecture.body?.donnees === null, 'Retour : remise unique (aucune copie gardée pendant l\'attente)');
  verifier((await totalJournal()) === journalAvant + 1, 'Retour : un seul accès inscrit au journal, au moment de la remise');
  const finie = await attendreCondition(async () => (await appel('GET', `${BFF}/demandes/${d.body?.id}`, { jeton })).body?.statut === 'complete', 30000);
  verifier(finie, 'Reprise automatique : la demande de casier se termine seule au retour du registre');

  // L'état civil tombe à son tour.
  compose(['stop', 'registre-etat-civil']);
  const u2 = await requeteAdmin(ADMIN.universite, AMADOU.iue, 'inscription-universite');
  verifier(u2.status === 202 && u2.body?.statut === 'en_attente_registre', 'Panne de l\'état civil : l\'université est mise en attente', JSON.stringify(u2.body));
  const b = await requeteAdmin(ADMIN.banque, AMADOU.iue, 'ouverture-compte-bancaire');
  verifier(b.status === 202 && b.body?.statut === 'en_attente_registre', 'Panne de l\'état civil : la banque aussi (vérification du citoyen reportée)', JSON.stringify(b.body));
  for (const route of ['/tableau-de-bord', '/profil', '/journal']) {
    const page = await appel('GET', `${BFF}${route}`, { jeton });
    verifier(page.status === 200, `Panne de l'état civil : espace usager GET ${route} utilisable`, resume(page));
  }
  const ins = await appel('POST', `${BFF}/auth/inscription`, { corps: { iue: '000000000000', mot_de_passe: 'Essai2026!', telephone: '+22670000000' } });
  verifier(ins.status === 503 && ins.body?.code === 'REGISTRE_INDISPONIBLE', 'Panne de l\'état civil : inscription refusée avec un message clair (503)', resume(ins));
  compose(['start', 'registre-etat-civil']);
  await attendreCondition(async () => (await etatRegistre('etat-civil')) === 'disponible', 90000);
  const u3 = await suiviRequete(u2.body?.requete_id, ADMIN.universite);
  verifier(u3.body?.statut === 'complete' && u3.body?.donnees?.['etat-civil']?.est_majeur === true,
    'Retour de l\'état civil : l\'université reçoit « majeur : oui »', JSON.stringify(u3.body));
  const b2 = await suiviRequete(b.body?.requete_id, ADMIN.banque);
  verifier(b2.body?.statut === 'en_attente_consentement', 'Retour de l\'état civil : la banque passe en attente du consentement', JSON.stringify(b2.body));
}

/** Donnée numérique manquante : les actes des parents d'Ibrahim sont numérisés, la demande se complète seule. */
async function donneeManquante() {
  await brancher(new Set());
  const jeton = await connexion(IBRAHIM);
  const d = await appel('POST', `${BFF}/demandes`, { jeton, corps: { type_piece_id: 'casier-judiciaire' } });
  verifier(d.body?.statut === 'fallback_physique', 'Donnée manquante : la demande de casier d\'Ibrahim attend les actes de ses parents (non numérisés)', JSON.stringify(d.body));
  const saisie = executer('registre-etat-civil', ['npm', 'run', '-s', 'numeriser-actes']);
  verifier(saisie.code === 0, 'Donnée manquante : le centre d\'état civil numérise les actes des parents dans son registre', saisie.sortie.slice(-300));
  const finie = await attendreCondition(async () => (await appel('GET', `${BFF}/demandes/${d.body?.id}`, { jeton })).body?.statut === 'complete', 30000);
  verifier(finie, 'Donnée manquante : la demande se complète seule (reprise automatique)');
  await pause(1000);
  verifier(/Votre demande « Casier judiciaire » est complète/.test(compose(['logs', '--no-log-prefix', 'espace-usager'], {}, true)),
    'Donnée manquante : le demandeur est notifié par SMS (simulé)');
  executer('registre-etat-civil', ['npm', 'run', '-s', 'numeriser-actes', '--', '--annuler']);
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
  compose(['up', '-d', ...(SANS_BUILD ? [] : ['--build']), ...SERVICES], environnement(new Set()));
  await attendre(`${BFF}/types-pieces`, 300000);
  await attendre('http://localhost:4001/api/citoyens/784302956148', 30000);

  try {
    for (const [nom, remplaces] of SCENARIOS.filter(([n]) => retenu(n))) {
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
    const speciaux = [['format différent', formatDifferent], ['panne en direct', panneEnDirect], ['donnée manquante', donneeManquante],
      ['pannes et configuration', pannes]];
    for (const [nom, scenario] of speciaux.filter(([n]) => retenu(n))) {
      scenarioCourant = nom;
      console.log(`\n== Scénario : ${nom}`);
      await scenario();
    }
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
