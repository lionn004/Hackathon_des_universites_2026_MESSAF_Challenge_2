/**
 * Couche 5, espace usager : menu latéral et barre du haut des pages connectées.
 * Chaque page fournit <div class="main-content"><div class="page-content">...</div></div> :
 * le menu est inséré avant .main-content, la barre du haut au début de .main-content.
 */

if (!localStorage.getItem('efaso_token')) {
  window.location.href = '/pages/login.html';
}

const citoyen = authApi.getCitoyen() || {};

function getNav() {
  const page = window.location.pathname.split('/').pop();
  const items = [
    { href: '/pages/dashboard.html', label: 'Tableau de bord', id: 'dashboard' },
    { href: '/pages/consentements.html', label: 'Consentements', id: 'consentements' },
    { href: '/pages/demandes.html', label: 'Mes demandes', id: 'demandes' },
    { href: '/pages/journal.html', label: "Journal d'accès", id: 'journal' },
    { href: '/pages/enfants.html', label: 'Mes enfants', id: 'enfants' },
    { href: '/pages/profil.html', label: 'Mon profil', id: 'profil' },
    { href: '/pages/test.html', label: 'Interface de test', id: 'test' },
  ];

  return items.map(item => {
    const active = page === item.id + '.html';
    return `<a href="${item.href}" class="sidebar-link${active ? ' active' : ''}"${active ? ' aria-current="page"' : ''}>${item.label}</a>`;
  }).join('');
}

function injectLayout() {
  const mainContent = document.querySelector('.main-content');
  if (!mainContent) return;

  const initials = citoyen.prenom && citoyen.nom
    ? escapeHtml((citoyen.prenom[0] + citoyen.nom[0]).toUpperCase())
    : '?';

  const appLayout = document.createElement('div');
  appLayout.className = 'app-layout';

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <span class="logo-star">★</span>
      <span class="logo-text">e-FASO</span>
      <span class="logo-sub">Espace citoyen</span>
    </div>
    <div class="sidebar-section">
      <nav class="sidebar-nav" aria-label="Navigation principale">
        ${getNav()}
      </nav>
    </div>
    <div class="sidebar-section" style="margin-top:auto;border-top:1px solid rgba(255,255,255,0.15);padding-top:var(--space-4)">
      <div style="font-size:var(--font-size-xs);opacity:0.6;text-align:center">
        « Dites-le-nous une fois »<br>Hackathon 2026
      </div>
    </div>
  `;

  const topbar = document.createElement('div');
  topbar.className = 'topbar';
  topbar.innerHTML = `
    <div style="display:flex;align-items:center;gap:var(--space-3)">
      <button class="sidebar-toggle" aria-label="Afficher le menu" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
      <span style="font-size:var(--font-size-sm);color:var(--gris-500)">IUE : <strong>${escapeHtml(citoyen.iue) || VIDE}</strong></span>
    </div>
    <div class="topbar-actions">
      <div class="user-info">
        <span>${escapeHtml(citoyen.prenom)} ${escapeHtml(citoyen.nom)}</span>
        <div class="user-avatar">${initials}</div>
      </div>
      <button class="btn btn-sm btn-outline" onclick="deconnexion()">Déconnexion</button>
    </div>
  `;
  mainContent.insertBefore(topbar, mainContent.firstChild);

  mainContent.parentNode.insertBefore(appLayout, mainContent);
  appLayout.appendChild(sidebar);
  appLayout.appendChild(mainContent);
}

function deconnexion() {
  authApi.deconnexion();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectLayout);
} else {
  injectLayout();
}
