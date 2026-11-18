/**
 * Test d'interopérabilité : registre « d'une autre équipe ».
 *
 * Simule les trois registres d'une équipe concurrente, pour vérifier que notre
 * passerelle fonctionne avec n'importe quel registre qui respecte les contrats
 * docs/openapi-registre-*.yaml (c'est ce que fera le jury).
 *
 * Il respecte les contrats, mais fait volontairement d'autres choix que nos registres :
 *  - il IGNORE le paramètre ?champs= (le contrat le rend facultatif) et renvoie
 *    toute la fiche ;
 *  - il ajoute des champs hors contrat, dont la valeur contient le marqueur
 *    MARQUEUR_FUITE : s'il apparaît dans une réponse de la plateforme, la
 *    minimisation a laissé passer un champ qui n'aurait jamais dû sortir ;
 *  - ses erreurs 404 utilisent un autre code (NOT_FOUND, en anglais) ;
 *  - une route inconnue répond une page HTML, comme Express par défaut ;
 *  - ses données diffèrent des nôtres (lieu de naissance, IFU, casier...) pour
 *    prouver que la donnée vient bien de lui ;
 *  - la mère d'Amadou y est inconnue et Fatimata SAWADOGO en est absente ;
 *  - Rasmata KABORE et son fils Issa n'existent que chez lui.
 *
 * Aucune dépendance : node registre-externe.js (Node 18 ou plus).
 * Écoute sur trois ports, un par registre, tous sous le préfixe /api :
 * état civil 4001, justice 4002, fiscal 4003 (surchargeables par variables d'environnement).
 *
 * Deux registres d'un AUTRE format, pour prouver qu'un registre se branche par le seul
 * catalogue (tests/interoperabilite/config-format-different/) :
 *  - 4004 : état civil v2 (autres routes et noms, réponse emballée, dates JJ/MM/AAAA,
 *    sexe en toutes lettres, pas de « est_majeur » : la passerelle doit le calculer) ;
 *  - 4005 : registre de nationalité sans IUE (recherche par nom, prénom, date ; Awa y a
 *    un homonyme, la plateforme ne doit jamais choisir au hasard).
 * Port 4009 : pilotage des pannes simulées (GET /panne/<registre>?etat=on|off).
 */
const http = require('node:http');

/** Valeur portée par chaque champ hors contrat : sa présence en sortie signale une fuite. */
const MARQUEUR_FUITE = 'FUITE-HORS-CONTRAT';

/** Fiches d'état civil (schéma DonneesEtatCivil, sans est_majeur qui est calculé). */
const ETAT_CIVIL = {
  '784302956148': {
    nom: 'OUEDRAOGO', prenom: 'Amadou', date_naissance: '1998-03-15', lieu_naissance: 'Bobo-Dioulasso',
    sexe: 'M', nationalite: 'Burkinabè', pere_iue: '291047583620', mere_iue: null, date_deces: null,
  },
  '291047583620': {
    nom: 'OUEDRAOGO', prenom: 'Ibrahim', date_naissance: '1968-07-02', lieu_naissance: 'Koudougou',
    sexe: 'M', nationalite: 'Burkinabè', pere_iue: null, mere_iue: null, date_deces: null,
  },
  '456123789012': {
    nom: 'OUEDRAOGO', prenom: 'Awa', date_naissance: '2014-05-08', lieu_naissance: 'Ouagadougou',
    sexe: 'F', nationalite: 'Burkinabè', pere_iue: '291047583620', mere_iue: null, date_deces: null,
  },
  '527814903361': {
    nom: 'OUEDRAOGO', prenom: 'Moussa', date_naissance: '2010-02-14', lieu_naissance: 'Ouagadougou',
    sexe: 'M', nationalite: 'Burkinabè', pere_iue: '291047583620', mere_iue: null, date_deces: null,
  },
  '316580942751': {
    nom: 'OUEDRAOGO', prenom: 'Salif', date_naissance: '1996-08-23', lieu_naissance: 'Ouagadougou',
    sexe: 'M', nationalite: 'Burkinabè', pere_iue: '291047583620', mere_iue: null, date_deces: null,
  },
  '873045129604': {
    nom: 'OUEDRAOGO', prenom: 'Aïcha', date_naissance: '2021-01-30', lieu_naissance: 'Bobo-Dioulasso',
    sexe: 'F', nationalite: 'Burkinabè', pere_iue: '316580942751', mere_iue: null, date_deces: null,
  },
  // Citoyens connus de ce registre seulement (inscription en direct après remplacement).
  '102938475610': {
    nom: 'KABORE', prenom: 'Rasmata', date_naissance: '1990-12-01', lieu_naissance: 'Kaya',
    sexe: 'F', nationalite: 'Burkinabè', pere_iue: null, mere_iue: null, date_deces: null,
  },
  '564738291056': {
    nom: 'KABORE', prenom: 'Issa', date_naissance: '2017-09-09', lieu_naissance: 'Kaya',
    sexe: 'M', nationalite: 'Burkinabè', pere_iue: null, mere_iue: '102938475610', date_deces: null,
  },
};

/** Casiers judiciaires (schéma CasierJudiciaire). Moussa n'a pas de dossier. */
const CASIERS = {
  '784302956148': {
    casier_vierge: false,
    condamnations: [{
      date: '2019-06-12', nature: 'Conduite sans permis', tribunal: 'TGI de Bobo-Dioulasso', duree: 'Amende',
      // Champ hors contrat dans un objet imbriqué : la passerelle filtre-t-elle en profondeur ?
      greffier: `Greffier X (${MARQUEUR_FUITE})`,
    }],
    date_delivrance: '2026-11-18',
  },
  '291047583620': { casier_vierge: true, condamnations: [], date_delivrance: '2026-11-18' },
  '456123789012': { casier_vierge: true, condamnations: [], date_delivrance: '2026-11-18' },
  '316580942751': { casier_vierge: true, condamnations: [], date_delivrance: '2026-11-18' },
  '102938475610': { casier_vierge: true, condamnations: [], date_delivrance: '2026-11-18' },
};

/** Certificats de nationalité (schéma CertificatNationalite). */
const NATIONALITES = {
  '784302956148': {
    est_national: true, nationalite: 'Burkinabè', mode_acquisition: 'naissance',
    date_acquisition: '1998-03-15', numero_certificat: 'CN-EXT-1998-0777',
  },
  '291047583620': {
    est_national: true, nationalite: 'Burkinabè', mode_acquisition: 'naissance',
    date_acquisition: '1968-07-02', numero_certificat: 'CN-EXT-1968-0001',
  },
  '316580942751': {
    est_national: true, nationalite: 'Burkinabè', mode_acquisition: 'naissance',
    date_acquisition: '1996-08-23', numero_certificat: 'CN-EXT-1996-0042',
  },
  '102938475610': {
    est_national: true, nationalite: 'Burkinabè', mode_acquisition: 'naissance',
    date_acquisition: '1990-12-01', numero_certificat: 'CN-EXT-1990-0310',
  },
};

/** Situations fiscales (schéma SituationFiscale). */
const FISCAL = {
  '784302956148': {
    ifu: 'IFU-EXT-000777', en_regle: false, type_contribuable: 'particulier', regime_fiscal: 'cme',
    derniere_declaration: '2025-04-30', montant_impot_du: 125000,
  },
  '291047583620': {
    ifu: 'IFU-EXT-000001', en_regle: true, type_contribuable: 'entreprise_individuelle', regime_fiscal: 'rsi',
    derniere_declaration: '2026-04-30', montant_impot_du: 0,
  },
  '316580942751': {
    ifu: 'IFU-EXT-000042', en_regle: true, type_contribuable: 'particulier', regime_fiscal: 'non_assujetti',
    derniere_declaration: null, montant_impot_du: null,
  },
  '102938475610': {
    ifu: 'IFU-EXT-000310', en_regle: true, type_contribuable: 'particulier', regime_fiscal: 'non_assujetti',
    derniere_declaration: null, montant_impot_du: 0,
  },
};

/**
 * Âge révolu (en UTC) à partir d'une date AAAA-MM-JJ.
 * @param {string} dateNaissance
 * @returns {number}
 */
function age(dateNaissance) {
  const naissance = new Date(dateNaissance);
  const aujourdhui = new Date();
  const ans = aujourdhui.getUTCFullYear() - naissance.getUTCFullYear();
  const avantAnniversaire = aujourdhui.getUTCMonth() < naissance.getUTCMonth()
    || (aujourdhui.getUTCMonth() === naissance.getUTCMonth() && aujourdhui.getUTCDate() < naissance.getUTCDate());
  return avantAnniversaire ? ans - 1 : ans;
}

/**
 * Fiche d'état civil complète, avec est_majeur calculé et des champs hors contrat.
 * @param {string} iue
 * @returns {object|null}
 */
function ficheEtatCivil(iue) {
  const fiche = ETAT_CIVIL[iue];
  if (!fiche) return null;
  return {
    // Ordre des clés différent du nôtre, volontairement.
    est_majeur: age(fiche.date_naissance) >= 18,
    ...fiche,
    iue,
    profession: `Agent de saisie (${MARQUEUR_FUITE})`,
    numero_cnib: `B12345678 (${MARQUEUR_FUITE})`,
  };
}

/**
 * Liens de filiation (schéma Filiation), déduits des fiches d'état civil.
 * @param {string} iue
 * @returns {object|null}
 */
function filiation(iue) {
  const fiche = ETAT_CIVIL[iue];
  if (!fiche) return null;
  const parents = [];
  if (fiche.pere_iue) parents.push({ iue: fiche.pere_iue, lien: 'pere' });
  if (fiche.mere_iue) parents.push({ iue: fiche.mere_iue, lien: 'mere' });
  const enfants = Object.entries(ETAT_CIVIL)
    .filter(([, f]) => f.pere_iue === iue || f.mere_iue === iue)
    .map(([iueEnfant, f]) => ({ iue: iueEnfant, lien: f.sexe === 'F' ? 'fille' : 'fils' }));
  return { iue, parents, enfants };
}

/**
 * Ajoute l'iue et un champ hors contrat à une fiche du registre justice ou fiscal.
 * @param {string} iue
 * @param {object|undefined} fiche
 * @param {string} champHorsContrat Nom du champ hors contrat ajouté.
 * @returns {object|null}
 */
function avecExtras(iue, fiche, champHorsContrat) {
  if (!fiche) return null;
  return { iue, ...fiche, [champHorsContrat]: MARQUEUR_FUITE };
}

/**
 * Écrit une réponse JSON.
 * @param {http.ServerResponse} res
 * @param {number} statut
 * @param {object} corps
 */
function json(res, statut, corps) {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(corps));
}

/**
 * Répond 200 avec la fiche, ou 404 au format Erreur du contrat (code différent du nôtre).
 * @param {http.ServerResponse} res
 * @param {object|null} fiche
 */
function ficheOu404(res, fiche) {
  if (fiche) json(res, 200, fiche);
  else json(res, 404, { code: 'NOT_FOUND', message: 'Unknown citizen in this registry' });
}

/**
 * Route inconnue : page HTML, comme la réponse par défaut d'Express.
 * Sert à voir comment la plateforme réagit à une URL de registre mal configurée.
 * @param {http.ServerResponse} res
 * @param {string} chemin
 */
function routeInconnue(res, chemin) {
  res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!DOCTYPE html><html><body><pre>Cannot GET ${chemin}</pre></body></html>`);
}

/**
 * Routes de chaque registre : [expression du chemin (après /api), fonction (iue, url) => fiche].
 * Le paramètre ?champs= n'est jamais lu.
 */
const ROUTES = {
  'etat-civil': [
    [/^\/citoyens\/recherche$/, (iue, url) => {
      const critere = (cle) => (url.searchParams.get(cle) || '').toLowerCase();
      const resultats = Object.entries(ETAT_CIVIL)
        .filter(([, f]) => (!critere('nom') || f.nom.toLowerCase() === critere('nom'))
          && (!critere('prenom') || f.prenom.toLowerCase() === critere('prenom'))
          && (!critere('date_naissance') || f.date_naissance === critere('date_naissance')))
        .map(([i, f]) => ({ iue: i, nom: f.nom, prenom: f.prenom, date_naissance: f.date_naissance }));
      return { resultats };
    }],
    [/^\/citoyens\/([^/]+)\/filiation$/, (iue) => filiation(iue)],
    [/^\/citoyens\/([^/]+)$/, (iue) => ficheEtatCivil(iue)],
  ],
  justice: [
    [/^\/citoyens\/([^/]+)\/casier$/, (iue) => avecExtras(iue, CASIERS[iue], 'juge_application_peines')],
    [/^\/citoyens\/([^/]+)\/nationalite$/, (iue) => avecExtras(iue, NATIONALITES[iue], 'officier_delivrance')],
  ],
  fiscal: [
    [/^\/citoyens\/([^/]+)\/fiscal$/, (iue) => avecExtras(iue, FISCAL[iue], 'revenu_declare')],
  ],
};

/**
 * Crée le serveur HTTP d'un registre.
 * @param {string} registre 'etat-civil' | 'justice' | 'fiscal'
 * @returns {http.Server}
 */
function creerRegistre(registre) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://registre-externe');
    console.log(`[registre-externe ${registre}] ${req.method} ${url.pathname}${url.search}`);
    if (enPanne(registre, res)) return undefined;

    if (req.method !== 'GET' || !url.pathname.startsWith('/api/')) return routeInconnue(res, url.pathname);
    const chemin = url.pathname.slice('/api'.length);

    for (const [motif, lire] of ROUTES[registre]) {
      const trouve = chemin.match(motif);
      if (trouve) return ficheOu404(res, lire(trouve[1], url));
    }
    return routeInconnue(res, url.pathname);
  });
}

// Pannes simulées : GET http://registre-externe:4009/panne/<registre>?etat=on|off

/** Registres actuellement « en panne » : ils répondent 503 à tout. */
const pannes = new Set();

/**
 * Répond 503 si le registre est en panne simulée.
 * @param {string} registre
 * @param {http.ServerResponse} res
 * @returns {boolean} Vrai si la réponse a été envoyée.
 */
function enPanne(registre, res) {
  if (!pannes.has(registre)) return false;
  json(res, 503, { code: 'PANNE_SIMULEE', message: `Registre ${registre} en panne (simulation)` });
  return true;
}

// Registres dans un AUTRE format, branchés à la plateforme seulement par le catalogue
// (tests/interoperabilite/config-format-different/catalogue-registres.yaml).

/** @returns {string} Date AAAA-MM-JJ écrite JJ/MM/AAAA. */
function enJJMMAAAA(date) {
  const [a, m, j] = date.split('-');
  return `${j}/${m}/${a}`;
}

/** État civil v2 : nos citoyens de démonstration, Amadou avec ses deux parents. */
const ETAT_CIVIL_V2 = {
  ...ETAT_CIVIL,
  '784302956148': { ...ETAT_CIVIL['784302956148'], mere_iue: '638501274093' },
  '638501274093': {
    nom: 'SAWADOGO', prenom: 'Fatimata', date_naissance: '1972-11-20', lieu_naissance: 'Ouahigouya',
    sexe: 'F', nationalite: 'Burkinabè', pere_iue: null, mere_iue: null, date_deces: null,
  },
};

/**
 * Fiche de l'état civil v2 : noms de champs différents, réponse emballée, dates JJ/MM/AAAA,
 * sexe en toutes lettres, parents imbriqués, et AUCUN « est_majeur ».
 * @param {string} iue
 * @returns {object|null}
 */
function ficheV2(iue) {
  const f = ETAT_CIVIL_V2[iue];
  if (!f) return null;
  return {
    statut: 'ok',
    resultat: {
      identifiant: iue,
      nomFamille: f.nom,
      prenoms: f.prenom,
      dateNaissance: enJJMMAAAA(f.date_naissance),
      lieuNaissance: f.lieu_naissance,
      genre: f.sexe === 'F' ? 'Féminin' : 'Masculin',
      nationalite: f.nationalite,
      parents: {
        pere: f.pere_iue ? { identifiant: f.pere_iue } : null,
        mere: f.mere_iue ? { identifiant: f.mere_iue } : null,
      },
      profession: `Agent de saisie (${MARQUEUR_FUITE})`,
    },
  };
}

/**
 * Registre de nationalité externe : il ne connaît pas l'IUE. Chaque personne a un numéro
 * de dossier ; on la retrouve par nom, prénom et date de naissance. Awa y figure DEUX fois
 * (homonymes) : la plateforme ne doit jamais choisir au hasard.
 */
const DOSSIERS_NATIONALITE = [
  { numeroDossier: 'N-0001', iue: '784302956148', modeObtention: 'Naissance' },
  { numeroDossier: 'N-0002', iue: '291047583620', modeObtention: 'Naissance' },
  { numeroDossier: 'N-0003', iue: '638501274093', modeObtention: 'Naissance' },
  { numeroDossier: 'N-0004', iue: '316580942751', modeObtention: 'Naissance' },
  { numeroDossier: 'N-0010', iue: '456123789012', modeObtention: 'Naissance' },
  { numeroDossier: 'N-0011', iue: '456123789012', modeObtention: 'Naissance' },
].map((d) => ({ ...d, personne: ETAT_CIVIL_V2[d.iue] }));

/**
 * Serveur de l'état civil v2 (port 4004).
 * @returns {http.Server}
 */
function creerEtatCivilV2() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://registre-externe');
    console.log(`[registre-externe etat-civil-v2] ${req.method} ${url.pathname}${url.search}`);
    if (enPanne('etat-civil-v2', res)) return undefined;
    if (url.pathname === '/v2/etat') return json(res, 200, { ok: true });
    const m = url.pathname.match(/^\/v2\/personnes\/([^/]+)$/);
    if (!m) return routeInconnue(res, url.pathname);
    const fiche = ficheV2(m[1]);
    return fiche ? json(res, 200, fiche) : json(res, 404, { erreur: 'introuvable' });
  });
}

/**
 * Serveur du registre de nationalité externe (port 4005).
 * @returns {http.Server}
 */
function creerNationaliteExterne() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://registre-externe');
    console.log(`[registre-externe nationalite-externe] ${req.method} ${url.pathname}${url.search}`);
    if (enPanne('nationalite-externe', res)) return undefined;
    if (url.pathname === '/etat') return json(res, 200, { ok: true });
    if (url.pathname === '/personnes') {
      const q = (cle) => (url.searchParams.get(cle) || '').trim().toLowerCase();
      const items = DOSSIERS_NATIONALITE
        .filter((d) => d.personne && d.personne.nom.toLowerCase() === q('nom') && d.personne.prenom.toLowerCase() === q('prenom')
          && enJJMMAAAA(d.personne.date_naissance) === q('naissance'))
        .map((d) => ({ numeroDossier: d.numeroDossier, nom: d.personne.nom, prenom: d.personne.prenom }));
      return json(res, 200, { total: items.length, items });
    }
    const m = url.pathname.match(/^\/personnes\/([^/]+)\/nationalite$/);
    if (!m) return routeInconnue(res, url.pathname);
    const d = DOSSIERS_NATIONALITE.find((x) => x.numeroDossier === m[1]);
    if (!d || !d.personne) return json(res, 404, { erreur: 'dossier inconnu' });
    return json(res, 200, {
      data: {
        estBurkinabe: 'oui',
        nationalite: d.personne.nationalite,
        modeObtention: d.modeObtention,
        dateObtention: enJJMMAAAA(d.personne.date_naissance),
        numCertificat: `NAT-${d.numeroDossier}`,
        adresse: `Secteur 15, Ouagadougou (${MARQUEUR_FUITE})`,
      },
    });
  });
}

/**
 * Serveur de pilotage des pannes (port 4009) : /panne/<registre>?etat=on|off.
 * @returns {http.Server}
 */
function creerPilotage() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://registre-externe');
    const m = url.pathname.match(/^\/panne\/([a-z0-9-]+)$/);
    if (!m) return routeInconnue(res, url.pathname);
    if (url.searchParams.get('etat') === 'on') pannes.add(m[1]);
    else pannes.delete(m[1]);
    console.log(`[registre-externe] panne simulée ${m[1]} : ${pannes.has(m[1]) ? 'ON' : 'OFF'}`);
    return json(res, 200, { registre: m[1], en_panne: pannes.has(m[1]) });
  });
}

const PORTS = {
  'etat-civil': Number(process.env.PORT_ETAT_CIVIL) || 4001,
  justice: Number(process.env.PORT_JUSTICE) || 4002,
  fiscal: Number(process.env.PORT_FISCAL) || 4003,
};

for (const [registre, port] of Object.entries(PORTS)) {
  creerRegistre(registre).listen(port, () => {
    console.log(`[registre-externe] ${registre} prêt sur le port ${port} (préfixe /api)`);
  });
}
creerEtatCivilV2().listen(4004, () => console.log('[registre-externe] etat-civil-v2 prêt sur le port 4004'));
creerNationaliteExterne().listen(4005, () => console.log('[registre-externe] nationalite-externe prêt sur le port 4005'));
creerPilotage().listen(4009, () => console.log('[registre-externe] pilotage des pannes sur le port 4009'));
