/**
 * e-FASO — Module API
 * Client HTTP pour le BFF (Backend For Frontend) sur port 3000.
 * Contrat : docs/openapi-espace-usager.yaml (source de vérité des noms de champs).
 */

const API_BASE = 'http://localhost:3000/api';

const TOKEN_KEY = 'efaso_token';
const CITOYEN_KEY = 'efaso_citoyen';

/**
 * Construit une query string en ignorant les valeurs vides.
 * @param {object} params
 * @returns {string} '' ou '?a=1&b=2'
 */
function toQuery(params = {}) {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return entries.length ? '?' + new URLSearchParams(entries).toString() : '';
}

/**
 * Fetch wrapper avec gestion automatique du token JWT.
 * Les erreurs sont levées au format du contrat : { status, code, message }.
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

  // Un 401 sur une route authentifiée = session expirée → retour au login.
  // Sur /auth/* (mauvais mot de passe, code SMS invalide…), on laisse l'erreur remonter.
  if (response.status === 401 && token && !endpoint.startsWith('/auth/')) {
    clearSession();
    window.location.href = '/pages/login.html';
    return new Promise(() => {}); // la page se recharge : ne jamais résoudre
  }

  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null; // réponse vide ou non JSON
  }

  if (!response.ok) {
    throw {
      status: response.status,
      code: data?.code || 'ERREUR_HTTP',
      message: data?.message || `Erreur ${response.status}`,
    };
  }

  // Le code HTTP est utile à l'interface de test (200 publique / 202 privée).
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

// ═══════════════════════════════════════
// AUTHENTIFICATION
// ═══════════════════════════════════════

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

  /** Étape 1 : envoie un code SMS. Renvoie { message, token_temporaire }. */
  async motDePasseOublie(iue, telephone) {
    return apiFetch('/auth/mot-de-passe-oublie', {
      method: 'POST',
      body: JSON.stringify({ iue, telephone }),
    });
  },

  /** Étape 2 : nouveau mot de passe avec le code reçu par SMS. */
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

// ═══════════════════════════════════════
// PROFIL
// ═══════════════════════════════════════

const profilApi = {
  /** ProfilCitoyen : { iue, nom, prenom, telephone, date_inscription, est_tuteur, nombre_enfants } */
  async get() {
    return apiFetch('/profil');
  },
};

// ═══════════════════════════════════════
// ENFANTS
// ═══════════════════════════════════════

const enfantsApi = {
  /** { enfants: [{ iue, nom, prenom, date_naissance, age, transfert_recommande }] } */
  async list() {
    return apiFetch('/enfants');
  },

  async transfert(iue) {
    return apiFetch(`/enfants/${encodeURIComponent(iue)}/transfert`, { method: 'POST' });
  },
};

// ═══════════════════════════════════════
// DEMANDES
// ═══════════════════════════════════════

const demandesApi = {
  /** params : { statut, page, limite } → { demandes, pagination } */
  async list(params = {}) {
    return apiFetch(`/demandes${toQuery(params)}`);
  },

  async get(id) {
    return apiFetch(`/demandes/${encodeURIComponent(id)}`);
  },

  /**
   * Contenu de la pièce d'une demande (route spécifiée dans CLAUDE.md,
   * « Consultation et téléchargement de ses pièces ») :
   * { demande_id, type_piece, titulaire, donnees, date_consultation }
   */
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

// ═══════════════════════════════════════
// CONSENTEMENTS
// ═══════════════════════════════════════

const consentsApi = {
  /** params : { statut, page, limite } → { consentements, pagination } */
  async list(params = {}) {
    return apiFetch(`/consentements${toQuery(params)}`);
  },

  async get(id) {
    return apiFetch(`/consentements/${encodeURIComponent(id)}`);
  },

  /** decision : 'accepte' | 'refuse' */
  async decide(id, decision) {
    return apiFetch(`/consentements/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ decision }),
    });
  },
};

// ═══════════════════════════════════════
// JOURNAL
// ═══════════════════════════════════════

const journalApi = {
  /** params : { date_debut, date_fin, page, limite } → { entrees, pagination } */
  async list(params = {}) {
    return apiFetch(`/journal${toQuery(params)}`);
  },
};

// ═══════════════════════════════════════
// TABLEAU DE BORD
// ═══════════════════════════════════════

const dashboardApi = {
  /** { citoyen: {nom, prenom}, consentements_en_attente, demandes_en_cours, acces_recents, enfants, alertes } */
  async get() {
    return apiFetch('/tableau-de-bord');
  },
};

// ═══════════════════════════════════════
// TEST (simulation admin)
// ═══════════════════════════════════════

const testApi = {
  async getAdministrations() {
    return apiFetch('/test/administrations');
  },

  async getDemarches() {
    return apiFetch('/test/demarches');
  },

  /** 200 (publique) : { type_admin, donnees, cascade, journal_id, requete_id }
   *  202 (privée)   : { type_admin, consentement_id, requete_id, message } */
  async simulerRequete(administration_id, demarche_id, iue_citoyen) {
    return apiFetch('/test/requete', {
      method: 'POST',
      body: JSON.stringify({ administration_id, demarche_id, iue_citoyen }),
    });
  },

  /** { requete_id, statut, donnees } — suivi d'une requête (ex : après consentement). */
  async getRequete(id, administration_id) {
    return apiFetch(`/test/requetes/${encodeURIComponent(id)}${toQuery({ administration_id })}`);
  },
};

// ═══════════════════════════════════════
// RÉFÉRENTIEL DES PIÈCES
// ═══════════════════════════════════════

/** Catalogue des types de pièces (GET /types-pieces), chargé une fois par page. */
let cataloguePieces = [];
let cataloguePromise = null;

const catalogueApi = {
  /**
   * { types_pieces: [{ id, nom, registre_source, est_evolutive,
   *                    prerequis: [{ type_piece, nom, proprietaire, prerequis: [...] }] }] }
   * Route publique : pas de jeton nécessaire.
   */
  async list() {
    if (!cataloguePromise) {
      cataloguePromise = apiFetch('/types-pieces')
        .then(data => {
          cataloguePieces = data.types_pieces || [];
          return cataloguePieces;
        })
        .catch(e => {
          cataloguePromise = null; // nouvel essai au prochain appel
          throw e;
        });
    }
    return cataloguePromise;
  },
};

/** Nom lisible d'un type de pièce à partir de son identifiant (catalogue chargé). */
function nomPiece(id) {
  return cataloguePieces.find(p => p.id === id)?.nom || id;
}

const PROPRIETAIRES = { citoyen: 'vous', pere: 'père', mere: 'mère' };

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

/** Échappe une valeur avant insertion dans du HTML (données venant des registres). */
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
 * Afficher un toast de notification
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
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✗' : '⚠'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Formater une date ISO en format lisible
 */
function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('fr-BF', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Heure (HH:MM) d'une date ISO. */
function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return isNaN(d) ? '' : d.toLocaleTimeString('fr-BF', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formater une date relative ("il y a 2 heures")
 */
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

/**
 * Protection de page — redirige vers login si non authentifié
 */
function requireAuth() {
  if (!authApi.isAuthenticated()) {
    window.location.href = '/pages/login.html';
    return false;
  }
  return true;
}

/**
 * Rediriger vers dashboard si déjà connecté
 */
function redirectIfAuth() {
  if (authApi.isAuthenticated()) {
    window.location.href = '/pages/dashboard.html';
  }
}

/**
 * Convertit un lien du BFF (ex : « /consentements ») en page du frontend.
 */
function frontRoute(lien) {
  const pages = ['dashboard', 'consentements', 'demandes', 'journal', 'enfants', 'test'];
  const nom = String(lien || '').replace(/^\/+/, '').split(/[/?#]/)[0];
  return pages.includes(nom) ? `/pages/${nom}.html` : '/pages/dashboard.html';
}

/**
 * Traduire un statut en badge HTML
 */
function statusBadge(statut) {
  const labels = {
    en_attente: 'En attente',
    accepte: 'Accepté',
    refuse: 'Refusé',
    expire: 'Expiré',
    en_cours: 'En cours',
    complete: 'Complète',
    echouee: 'Échouée',
    actif: 'Actif',
    fallback_physique: 'Guichet',
    resolu: 'Résolu',
    manquant: 'Manquant',
    manquant_fallback_physique: 'Manquant',
    en_attente_consentement: 'En attente',
    consentement_accepte: 'Accepté',
    consentement_refuse: 'Refusé',
    direct: 'Direct',
    consentement: 'Consentement',
  };
  const cls = String(statut || '').replace(/_/g, '-');
  return `<span class="badge badge-${escapeHtml(cls)}">${escapeHtml(labels[statut] || statut || '—')}</span>`;
}

/**
 * Rendu récursif d'un arbre de pièces.
 * Accepte les deux formes du contrat :
 *  - cascade d'une demande : { type_piece, proprietaire, statut, sous_prerequis }
 *  - prérequis du catalogue : { type_piece, nom, proprietaire, prerequis }
 */
function renderCascade(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) return '';
  return `<ul class="cascade">${nodes.map(n => `
    <li>
      <span class="cascade-node">
        <span>${escapeHtml(n.nom || nomPiece(n.type_piece))}</span>
        <span class="cascade-owner">(${escapeHtml(PROPRIETAIRES[n.proprietaire] || n.proprietaire || '—')})</span>
        ${n.statut ? statusBadge(n.statut) : ''}
      </span>
      ${renderCascade(n.sous_prerequis || n.prerequis)}
    </li>`).join('')}</ul>`;
}

/**
 * Ajoute un bouton « afficher / masquer » à chaque champ mot de passe de la page.
 * Remplace le bouton natif d'Edge, qui disparaît dès que le champ perd le focus.
 */
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
    btn.type = 'button'; // ne soumet pas le formulaire
    btn.className = 'password-toggle';
    const update = () => {
      const visible = input.type === 'text';
      btn.innerHTML = visible ? ICON_EYE_OFF : ICON_EYE;
      btn.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      btn.setAttribute('aria-pressed', String(visible));
      btn.title = btn.getAttribute('aria-label');
    };
    // Garder le focus (et le curseur) dans le champ quand on clique sur le bouton
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

// ═══════════════════════════════════════
// RECHERCHE ET FILTRES (côté navigateur)
// ═══════════════════════════════════════

/** Texte comparable : minuscules, sans accents ni espaces superflus (« Étienne » → « etienne »). */
function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Vrai si chaque mot de la recherche apparaît dans l'une des valeurs.
 * « banque nom » trouve un consentement de Banque Atlantique qui demande le nom.
 * @param {string} recherche Texte saisi (vide → tout correspond).
 * @param {...any} valeurs Chaînes ou tableaux de chaînes dans lesquels chercher.
 */
function correspond(recherche, ...valeurs) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const texte = normaliser(valeurs.flat(Infinity).filter(v => v !== null && v !== undefined).join(' '));
  return mots.every(mot => texte.includes(mot));
}

/** Retarde l'appel de fn jusqu'à ce que l'utilisateur arrête de taper. */
function debounce(fn, delai = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delai);
  };
}

const ICON_LOUPE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';

/**
 * Bouton loupe qui ouvre / ferme un panneau d'options de recherche.
 * Le bouton porte une pastille avec le nombre de filtres actifs (visible panneau fermé).
 * @param {string} boutonId Bouton <button class="search-toggle">.
 * @param {string} panneauId Panneau à afficher / masquer.
 * @returns {{ majBadge: (n: number) => void, ouvrir: () => void, fermer: () => void }}
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

/** Ligne de tableau « vide » ou « erreur ». */
function emptyRow(colspan, message, isError = false) {
  const color = isError ? 'var(--rouge)' : 'var(--gris-400)';
  return `<tr><td colspan="${colspan}" class="text-center" style="padding:var(--space-6);color:${color}">${escapeHtml(message)}</td></tr>`;
}
