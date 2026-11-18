/**
 * Couche 5, espace usager : client HTTP du BFF (port 3000) et fonctions d'affichage
 * communes à toutes les pages. Les noms de champs suivent docs/openapi-espace-usager.yaml.
 */

const API_BASE = 'http://localhost:3000/api';

const TOKEN_KEY = 'efaso_token';
const CITOYEN_KEY = 'efaso_citoyen';

/** Valeur affichée quand une donnée est absente. */
const VIDE = '-';

/**
 * @param {object} params Paramètres de requête ; les valeurs vides sont ignorées.
 * @returns {string} Chaîne vide ou « ?a=1&b=2 ».
 */
function toQuery(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

/**
 * Appel au BFF avec le jeton JWT de la session.
 * @param {string} endpoint Chemin après /api, par exemple « /demandes ».
 * @param {object} [options] Options de fetch (method, body…).
 * @returns {Promise<object|null>} Corps JSON de la réponse.
 * @throws {{status: number, code: string, message: string}} Erreur au format du contrat.
 */
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  } catch (networkError) {
    console.error('Erreur réseau:', networkError);
    throw { code: 'NETWORK_ERROR', message: 'Impossible de contacter le serveur. Vérifiez votre connexion.' };
  }

  // Un 401 sur une route authentifiée signifie que la session a expiré. Sur /auth/*
  // (mauvais mot de passe, code SMS invalide), l'erreur doit au contraire être affichée.
  if (response.status === 401 && token && !endpoint.startsWith('/auth/')) {
    clearSession();
    window.location.href = '/pages/login.html';
    return new Promise(() => {}); // la page se recharge, la promesse ne doit pas se résoudre
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }

  if (!response.ok) {
    throw {
      status: response.status,
      code: data?.code || 'ERREUR_HTTP',
      message: data?.message || `Erreur ${response.status}`,
    };
  }

  // L'interface de test a besoin du code HTTP (200 pour une administration publique, 202 pour une privée).
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    Object.defineProperty(data, '_status', { value: response.status, enumerable: false });
  }
  return data;
}

function saveSession(data) {
  if (data?.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(CITOYEN_KEY, JSON.stringify(data.citoyen || {}));
  }
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(CITOYEN_KEY);
}

// Authentification

const authApi = {
  async inscription(iue, mot_de_passe, telephone) {
    const data = await apiFetch('/auth/inscription', {
      method: 'POST',
      body: JSON.stringify({ iue, mot_de_passe, telephone }),
    });
    saveSession(data);
    return data;
  },

  async connexion(iue, mot_de_passe) {
    const data = await apiFetch('/auth/connexion', {
      method: 'POST',
      body: JSON.stringify({ iue, mot_de_passe }),
    });
    saveSession(data);
    return data;
  },

  /** Envoie un code par SMS. Réponse : { message, token_temporaire }. */
  async motDePasseOublie(iue, telephone) {
    return apiFetch('/auth/mot-de-passe-oublie', {
      method: 'POST',
      body: JSON.stringify({ iue, telephone }),
    });
  },

  async reinitialiserMotDePasse(token_temporaire, code_sms, nouveau_mot_de_passe) {
    return apiFetch('/auth/reinitialiser-mot-de-passe', {
      method: 'POST',
      body: JSON.stringify({ token_temporaire, code_sms, nouveau_mot_de_passe }),
    });
  },

  deconnexion() {
    clearSession();
    window.location.href = '/pages/login.html';
  },

  isAuthenticated() {
    return !!localStorage.getItem(TOKEN_KEY);
  },

  getCitoyen() {
    try {
      return JSON.parse(localStorage.getItem(CITOYEN_KEY) || 'null');
    } catch (_) {
      return null;
    }
  },
};

// Profil et enfants

const profilApi = {
  /**
   * Ce que les registres savent du titulaire, lu à l'instant (GET /profil/registres).
   * @param {string} [iue] IUE d'un enfant sous la tutelle du citoyen ; absent pour soi-même.
   * @returns {Promise<object>} VueRegistres : { titulaire, pieces, date_consultation }.
   */
  async registres(iue) {
    return apiFetch(`/profil/registres${toQuery({ iue })}`);
  },

  async get() {
    return apiFetch('/profil');
  },
};

const enfantsApi = {
  async list() {
    return apiFetch('/enfants');
  },

  async transfert(iue) {
    return apiFetch(`/enfants/${encodeURIComponent(iue)}/transfert`, { method: 'POST' });
  },
};

// Demandes de pièces

const demandesApi = {
  async list(params = {}) {
    return apiFetch(`/demandes${toQuery(params)}`);
  },

  async get(id) {
    return apiFetch(`/demandes/${encodeURIComponent(id)}`);
  },

  /** Contenu de la pièce. Route décrite dans CLAUDE.md (consultation des pièces du citoyen). */
  async contenu(id) {
    return apiFetch(`/demandes/${encodeURIComponent(id)}/contenu`);
  },

  async create(type_piece_id, pour_enfant_iue = null) {
    const body = { type_piece_id };
    if (pour_enfant_iue) body.pour_enfant_iue = pour_enfant_iue;
    return apiFetch('/demandes', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};

// Consentements, journal, tableau de bord

const consentsApi = {
  async list(params = {}) {
    return apiFetch(`/consentements${toQuery(params)}`);
  },

  async get(id) {
    return apiFetch(`/consentements/${encodeURIComponent(id)}`);
  },

  /** decision : 'accepte' ou 'refuse' */
  async decide(id, decision) {
    return apiFetch(`/consentements/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ decision }),
    });
  },
};

const journalApi = {
  /**
   * Recalcule la chaîne des empreintes du journal (GET /journal/verification).
   * @returns {Promise<object>} VerificationJournal : { integre, entrees_verifiees, rupture, ... }.
   */
  async verification() {
    return apiFetch('/journal/verification');
  },

  async list(params = {}) {
    return apiFetch(`/journal${toQuery(params)}`);
  },
};

const dashboardApi = {
  async get() {
    return apiFetch('/tableau-de-bord');
  },
};

// Interface de test (simulation d'une administration)

const testApi = {
  async getAdministrations() {
    return apiFetch('/test/administrations');
  },

  async getDemarches() {
    return apiFetch('/test/demarches');
  },

  async simulerRequete(administration_id, demarche_id, iue_citoyen) {
    return apiFetch('/test/requete', {
      method: 'POST',
      body: JSON.stringify({ administration_id, demarche_id, iue_citoyen }),
    });
  },

  async getRequete(id, administration_id) {
    return apiFetch(`/test/requetes/${encodeURIComponent(id)}${toQuery({ administration_id })}`);
  },
};

// État des registres branchés (GET /registres, route publique relayée de la passerelle)

const registresApi = {
  /**
   * Disponibilité de chaque registre, sondée toutes les 5 s par la passerelle.
   * @returns {Promise<{registres: object[], sources: Object<string, string[]>}>}
   */
  async etat() {
    return apiFetch('/registres');
  },
};

// Catalogue des types de pièces (GET /types-pieces), chargé une seule fois par page

let cataloguePieces = [];
let cataloguePromise = null;

const catalogueApi = {
  async list() {
    if (!cataloguePromise) {
      cataloguePromise = apiFetch('/types-pieces')
        .then(data => {
          cataloguePieces = data.types_pieces || [];
          return cataloguePieces;
        })
        .catch(e => {
          cataloguePromise = null; // permet un nouvel essai au prochain appel
          throw e;
        });
    }
    return cataloguePromise;
  },
};

/** @returns {string} Nom de la pièce d'après le catalogue chargé, ou son identifiant. */
function nomPiece(id) {
  return cataloguePieces.find(p => p.id === id)?.nom || id;
}

/** @returns {string|null} Démarche à suivre quand la pièce manque au registre numérique, ou null. */
function demarchePiece(id) {
  return cataloguePieces.find(p => p.id === id)?.demarche_si_absente || null;
}

// Dictionnaire des données (GET /dictionnaire), chargé une seule fois par page

let dictionnaireDomaines = {};
let dictionnairePromise = null;
// Les champs du journal et des consentements arrivent sans leur domaine : on cherche
// le nom dans cet ordre. « nationalite » existe à l'état civil et à la justice.
const ORDRE_DOMAINES = ['etat-civil', 'justice', 'fiscal'];

const dictionnaireApi = {
  /**
   * Charge le dictionnaire. Un échec n'empêche pas la page de s'afficher :
   * les noms techniques restent affichés.
   * @returns {Promise<object>} Les domaines du dictionnaire (vide en cas d'échec).
   */
  async charger() {
    if (!dictionnairePromise) {
      dictionnairePromise = apiFetch('/dictionnaire')
        .then(data => { dictionnaireDomaines = data?.domaines || {}; return dictionnaireDomaines; })
        .catch(() => { dictionnairePromise = null; return dictionnaireDomaines; });
    }
    return dictionnairePromise;
  },
};

/**
 * Libellé lisible d'une donnée (« est_majeur » devient « Majeur »).
 * @param {string} nom Nom technique de la donnée.
 * @returns {string} Le libellé du dictionnaire, ou le nom technique s'il est inconnu.
 */
function libelleDonnee(nom) {
  const domaines = [...ORDRE_DOMAINES, ...Object.keys(dictionnaireDomaines).filter(d => !ORDRE_DOMAINES.includes(d))];
  for (const d of domaines) {
    const libelle = dictionnaireDomaines[d]?.[nom]?.libelle;
    if (libelle) return libelle;
  }
  return nom;
}

/** @returns {string[]} Les libellés d'une liste de noms techniques. */
function libellesDonnees(noms) {
  return Array.isArray(noms) ? noms.map(libelleDonnee) : [];
}

/**
 * Ligne « Base légale : ... Finalité : ... » d'une démarche (schéma BaseLegale du contrat).
 * Texte et référence CIL restent dans un détail repliable : ils valent « à préciser » dans la démo.
 * @param {object|null} b Base légale, null pour une entrée antérieure à son introduction.
 * @returns {string} HTML, vide si la base légale est absente.
 */
function renderBaseLegale(b) {
  if (!b || (!b.libelle && !b.finalite)) return '';
  const details = [
    b.texte ? `Texte : ${escapeHtml(b.texte)}` : '',
    b.reference_cil ? `Référence CIL : ${escapeHtml(b.reference_cil)}` : '',
  ].filter(Boolean);
  return `
    <div class="base-legale">
      ${b.libelle ? `Base légale : <strong>${escapeHtml(b.libelle)}</strong>.` : ''}
      ${b.finalite ? `Finalité : ${escapeHtml(b.finalite)}` : ''}
      ${details.length ? `<details><summary>Détails</summary>${details.join('<br>')}</details>` : ''}
    </div>`;
}

/** @returns {string[]} Textes de la base légale, pour la recherche. */
function texteBaseLegale(b) {
  return b ? [b.libelle, b.finalite] : [];
}

// Données d'une pièce (page d'une pièce et « Mes données dans les registres » de Mon profil)

/** Libellés des champs dont la valeur affichée est déjà formulée (« Néant (casier vierge) »). */
const LIBELLES_CHAMPS_FIXES = {
  pere: 'Père',
  mere: 'Mère',
  casier_vierge: 'Bulletin',
  en_regle: 'Situation fiscale',
  iue: 'IUE',
};

/** Libellés de repli si le dictionnaire est indisponible (contrats docs/openapi-registre-*.yaml). */
const LIBELLES_CHAMPS = {
  nom: 'Nom', prenom: 'Prénom(s)', date_naissance: 'Date de naissance', lieu_naissance: 'Lieu de naissance',
  sexe: 'Sexe', nationalite: 'Nationalité', pere_iue: 'IUE du père', mere_iue: 'IUE de la mère',
  date_deces: 'Date de décès', est_majeur: 'Majeur', condamnations: 'Condamnations',
  date_delivrance: 'Date de délivrance', est_national: 'Burkinabè', mode_acquisition: 'Mode d\'acquisition',
  date_acquisition: 'Date d\'acquisition', numero_certificat: 'N° de certificat', ifu: 'IFU',
  type_contribuable: 'Type de contribuable', regime_fiscal: 'Régime fiscal',
  derniere_declaration: 'Dernière déclaration', montant_impot_du: 'Montant d\'impôt dû',
};

/**
 * Libellé d'un champ de pièce : libellé fixe, puis dictionnaire (domaine du registre
 * si connu), puis libellé de repli, puis le nom mis en forme (« type_contribuable » : « Type contribuable »).
 * @param {string} cle Nom du champ.
 * @param {string} [registre] Registre source de la pièce, qui est aussi le domaine du dictionnaire.
 */
function libelleChamp(cle, registre) {
  if (LIBELLES_CHAMPS_FIXES[cle]) return LIBELLES_CHAMPS_FIXES[cle];
  const duDomaine = registre && dictionnaireDomaines[registre]?.[cle]?.libelle;
  if (duDomaine) return duDomaine;
  const duDictionnaire = libelleDonnee(cle);
  if (duDictionnaire !== cle) return duDictionnaire;
  if (LIBELLES_CHAMPS[cle]) return LIBELLES_CHAMPS[cle];
  const s = cle.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const estDateIso = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * Valeur lisible (déjà échappée) d'un champ de pièce.
 * @param {string} cle Nom du champ.
 * @param {*} v Valeur lue dans le registre.
 * @param {string} [registre] Registre source, pour les libellés des sous-champs.
 */
function valeurChamp(cle, v, registre) {
  if ((cle === 'pere' || cle === 'mere') && !v) {
    return '<span style="color:var(--gris-500)">Inconnu de l\'état civil</span>';
  }
  if (cle === 'sexe') return v === 'M' ? 'Masculin' : v === 'F' ? 'Féminin' : escapeHtml(v);
  if (cle === 'casier_vierge') return v ? 'Néant (casier vierge)' : 'Mentions inscrites (voir condamnations)';
  if (cle === 'en_regle') return v ? 'En règle' : 'Non en règle';
  if (cle === 'montant_impot_du' && typeof v === 'number') return `${v.toLocaleString('fr-FR')} FCFA`;
  if (cle === 'condamnations' && Array.isArray(v) && v.length === 0) return 'Aucune condamnation';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (estDateIso(v)) return formatDate(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return 'Aucune';
    return `<ul style="margin:0;padding-left:var(--space-5)">${v.map(item => `<li>${valeurChamp('', item, registre)}</li>`).join('')}</ul>`;
  }
  if (v && typeof v === 'object') {
    // Personne liée (père, mère) : « Prénom NOM (IUE ...) »
    if ('nom' in v || 'prenom' in v) {
      const nom = [v.prenom, v.nom].filter(Boolean).join(' ') || VIDE;
      return `${escapeHtml(nom)}${v.iue ? ` <span style="color:var(--gris-500)">(IUE ${escapeHtml(v.iue)})</span>` : ''}`;
    }
    return Object.entries(v).map(([k, x]) => `${escapeHtml(libelleChamp(k, registre))} : ${valeurChamp(k, x, registre)}`).join(', ');
  }
  return escapeHtml(v);
}

/**
 * Lignes de tableau des données d'une pièce. pere et mere remplacent pere_iue et mere_iue,
 * et valent null si le parent est inconnu : ils sont alors affichés « Inconnu de l'état civil ».
 * @param {object} donnees Données de la pièce (ContenuPiece.donnees du contrat).
 * @param {string} [registre] Registre source de la pièce.
 * @returns {string} HTML de lignes <tr>.
 */
function lignesDonneesPiece(donnees, registre) {
  const d = { ...(donnees || {}) };
  if ('pere' in d) delete d.pere_iue;
  if ('mere' in d) delete d.mere_iue;
  return Object.entries(d)
    .filter(([k, v]) => k === 'pere' || k === 'mere' || (v !== null && v !== undefined && v !== ''))
    .map(([k, v]) => `<tr><th>${escapeHtml(libelleChamp(k, registre))}</th><td>${valeurChamp(k, v, registre)}</td></tr>`)
    .join('');
}

const PROPRIETAIRES = { citoyen: 'vous', pere: 'père', mere: 'mère' };

// Affichage

/** À appliquer à toute donnée insérée en HTML : elle peut venir du registre d'une autre équipe. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Message temporaire en haut à droite de l'écran.
 * @param {string} message
 * @param {'success'|'error'|'warning'} [type]
 */
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/** @returns {string} Date ISO au format « 17 novembre 2026 », ou VIDE. */
function formatDate(isoString) {
  if (!isoString) return VIDE;
  const d = new Date(isoString);
  if (isNaN(d)) return VIDE;
  return d.toLocaleDateString('fr-BF', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** @returns {string} Heure au format « 18:05 », ou chaîne vide. */
function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return isNaN(d) ? '' : d.toLocaleTimeString('fr-BF', { hour: '2-digit', minute: '2-digit' });
}

/** @returns {string} Durée écoulée : « À l'instant », « Il y a 5 min », « Il y a 2h », « Il y a 3j ». */
function formatRelative(isoString) {
  if (!isoString) return '';
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "À l'instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

/** Renvoie vers la page de connexion si aucune session n'est ouverte. */
function requireAuth() {
  if (!authApi.isAuthenticated()) {
    window.location.href = '/pages/login.html';
    return false;
  }
  return true;
}

/** Renvoie vers le tableau de bord si une session est déjà ouverte. */
function redirectIfAuth() {
  if (authApi.isAuthenticated()) {
    window.location.href = '/pages/dashboard.html';
  }
}

/** Convertit un lien renvoyé par le BFF (par exemple « /consentements ») en page du frontend. */
function frontRoute(lien) {
  const pages = ['dashboard', 'consentements', 'demandes', 'journal', 'enfants', 'test'];
  const nom = String(lien || '').replace(/^\/+/, '').split(/[/?#]/)[0];
  return pages.includes(nom) ? `/pages/${nom}.html` : '/pages/dashboard.html';
}

/**
 * @param {string} statut Statut du contrat (en_attente, complete, fallback_physique…).
 * @returns {string} Badge HTML avec le libellé français du statut.
 */
function statusBadge(statut) {
  const labels = {
    en_attente: 'En attente',
    accepte: 'Accepté',
    refuse: 'Refusé',
    expire: 'Expiré',
    // Demande ou pièce de la cascade : un registre est hors service, la reprise est automatique.
    en_cours: 'En attente du registre',
    complete: 'Complète',
    echouee: 'Échouée',
    actif: 'Actif',
    fallback_physique: 'Donnée à numériser',
    resolu: 'Résolu',
    manquant: 'À numériser',
    manquant_fallback_physique: 'À numériser',
    en_attente_consentement: 'En attente',
    consentement_accepte: 'Accepté',
    consentement_refuse: 'Refusé',
    direct: 'Direct',
    consentement: 'Consentement',
  };
  // Les classes CSS utilisent des tirets : en_attente devient badge-en-attente.
  const cls = String(statut || '').replace(/_/g, '-');
  return `<span class="badge badge-${escapeHtml(cls)}">${escapeHtml(labels[statut] || statut || VIDE)}</span>`;
}

/**
 * Arbre de pièces. Accepte les deux formes du contrat : la cascade d'une demande
 * (nœuds avec statut et sous_prerequis) et les prérequis du catalogue (nœuds avec nom et prerequis).
 */
function renderCascade(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return '';
  return `<ul class="cascade">${nodes.map(n => `
    <li>
      <span class="cascade-node">
        <span>${escapeHtml(n.nom || nomPiece(n.type_piece))}</span>
        <span class="cascade-owner">(${escapeHtml(PROPRIETAIRES[n.proprietaire] || n.proprietaire || VIDE)})</span>
        ${n.statut ? statusBadge(n.statut) : ''}
      </span>
      ${n.statut === 'manquant' && demarchePiece(n.type_piece) ? `
        <div class="cascade-demarche"><strong>Démarche à suivre :</strong> ${escapeHtml(demarchePiece(n.type_piece))}</div>` : ''}
      ${renderCascade(n.sous_prerequis || n.prerequis)}
    </li>`).join('')}</ul>`;
}

/** @returns {string} Ligne de tableau occupant toute la largeur, pour un état vide ou une erreur. */
function emptyRow(colspan, message, isError = false) {
  const color = isError ? 'var(--rouge)' : 'var(--gris-400)';
  return `<tr><td colspan="${colspan}" class="text-center" style="padding:var(--space-6);color:${color}">${escapeHtml(message)}</td></tr>`;
}

// Squelettes de chargement. Chaque bloc porte un texte masqué « Chargement… »
// pour les lecteurs d'écran ; il disparaît quand la page remplace le contenu.

const SR_CHARGEMENT = '<span class="sr-only">Chargement…</span>';
// Largeurs variées pour que les lignes ne paraissent pas identiques.
const LARGEURS_SQUELETTE = ['70%', '50%', '85%', '40%', '60%'];

/**
 * Lignes de tableau en attente de données.
 * @param {number} colonnes Nombre de colonnes du tableau.
 * @param {number} [lignes=3]
 * @returns {string} HTML de lignes <tr>.
 */
function squeletteLignes(colonnes, lignes = 3) {
  return Array.from({ length: lignes }, (_, l) => `<tr>${Array.from({ length: colonnes }, (_, c) =>
    `<td>${l === 0 && c === 0 ? SR_CHARGEMENT : ''}<span class="skeleton skeleton-text" aria-hidden="true" style="width:${LARGEURS_SQUELETTE[(l + c) % LARGEURS_SQUELETTE.length]}"></span></td>`).join('')}</tr>`).join('');
}

/**
 * Cartes en attente de données (listes de consentements, demandes, enfants...).
 * @param {number} [nombre=3]
 * @returns {string} HTML de cartes.
 */
function squeletteCartes(nombre = 3) {
  return SR_CHARGEMENT + Array.from({ length: nombre }, (_, i) => `
    <div class="card mb-4 skeleton-card" aria-hidden="true">
      <span class="skeleton skeleton-title" style="width:${LARGEURS_SQUELETTE[i % 5]}"></span>
      <span class="skeleton skeleton-text" style="width:85%"></span>
      <span class="skeleton skeleton-text" style="width:55%"></span>
    </div>`).join('');
}

// Remplit les conteneurs marqués dans le HTML : data-squelette="lignes" (avec
// data-colonnes) ou "cartes" (avec data-nombre facultatif). Ce script est chargé
// en fin de page, le HTML est donc déjà en place.
document.querySelectorAll('[data-squelette]').forEach(conteneur => {
  const nombre = Number(conteneur.dataset.nombre) || undefined;
  conteneur.innerHTML = conteneur.dataset.squelette === 'lignes'
    ? squeletteLignes(Number(conteneur.dataset.colonnes) || 1, nombre)
    : squeletteCartes(nombre);
});

// Bouton afficher ou masquer le mot de passe. Il remplace le bouton natif d'Edge,
// qui disparaît dès que le champ perd le focus.

const ICON_EYE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_EYE_OFF = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';

function initPasswordToggles() {
  document.querySelectorAll('input[type="password"]').forEach(input => {
    if (input.closest('.password-field')) return;

    const wrapper = document.createElement('span');
    wrapper.className = 'password-field';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'password-toggle';
    const update = () => {
      const visible = input.type === 'text';
      btn.innerHTML = visible ? ICON_EYE_OFF : ICON_EYE;
      btn.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      btn.setAttribute('aria-pressed', String(visible));
      btn.title = btn.getAttribute('aria-label');
    };
    // Sans cela, le clic retire le focus du champ et le curseur est perdu.
    btn.addEventListener('mousedown', e => e.preventDefault());
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      update();
    });
    update();
    wrapper.appendChild(btn);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPasswordToggles);
} else {
  initPasswordToggles();
}

// Recherche et filtres dans le navigateur

/** Minuscules, sans accents : « Étienne » devient « etienne ». */
function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Vrai si chaque mot recherché apparaît dans l'une des valeurs. Ainsi « banque nom »
 * trouve un consentement de Banque Atlantique qui demande le nom. Une recherche vide
 * correspond à tout.
 */
function correspond(recherche, ...valeurs) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const texte = normaliser(valeurs.flat(Infinity).filter(v => v !== null && v !== undefined).join(' '));
  return mots.every(mot => texte.includes(mot));
}

/** @returns {Function} fn, appelée seulement quand la saisie s'arrête pendant `delai` ms. */
function debounce(fn, delai = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delai);
  };
}

const ICON_LOUPE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';

/**
 * Bouton loupe qui ouvre et ferme le panneau des options de recherche. La pastille du
 * bouton indique le nombre de filtres actifs, pour qu'ils restent visibles panneau fermé.
 * @param {string} boutonId Bouton <button class="search-toggle">.
 * @param {string} panneauId Panneau des options de recherche.
 * @returns {{ouvrir: Function, fermer: Function, majBadge: (n: number) => void}}
 */
function initPanneauRecherche(boutonId, panneauId) {
  const bouton = document.getElementById(boutonId);
  const panneau = document.getElementById(panneauId);
  bouton.innerHTML = ICON_LOUPE + '<span class="search-toggle-badge hidden" aria-hidden="true"></span>';
  bouton.setAttribute('aria-controls', panneauId);
  bouton.setAttribute('aria-expanded', 'false');
  bouton.setAttribute('aria-label', 'Rechercher et filtrer');
  bouton.title = 'Rechercher et filtrer';
  const badge = bouton.querySelector('.search-toggle-badge');

  function ouvrir() {
    panneau.classList.remove('hidden');
    bouton.setAttribute('aria-expanded', 'true');
    panneau.querySelector('input, select')?.focus();
  }
  function fermer() {
    panneau.classList.add('hidden');
    bouton.setAttribute('aria-expanded', 'false');
  }

  bouton.addEventListener('click', () => (panneau.classList.contains('hidden') ? ouvrir() : fermer()));
  panneau.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      fermer();
      bouton.focus();
    }
  });

  return {
    ouvrir,
    fermer,
    majBadge(n) {
      badge.textContent = n;
      badge.classList.toggle('hidden', !n);
      bouton.setAttribute('aria-label', n ? `Rechercher et filtrer (${n} filtre${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''})` : 'Rechercher et filtrer');
    },
  };
}
