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

    if (req.method !== 'GET' || !url.pathname.startsWith('/api/')) return routeInconnue(res, url.pathname);
    const chemin = url.pathname.slice('/api'.length);

    for (const [motif, lire] of ROUTES[registre]) {
      const trouve = chemin.match(motif);
      if (trouve) return ficheOu404(res, lire(trouve[1], url));
    }
    return routeInconnue(res, url.pathname);
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
