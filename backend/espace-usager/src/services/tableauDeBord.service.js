/**
 * Service Tableau de bord — toutes les données de la page d'accueil en un appel.
 *
 * Les alertes sont des liens vers les pages du frontend :
 *  - consentement : des demandes attendent une réponse → /consentements ;
 *  - transfert_recommande : un enfant a 15 ans ou plus → /enfants ;
 *  - acces : des administrations ont consulté les données ce mois-ci → /journal.
 */
const identiteService = require('./identite.service');
const consentementsService = require('./consentements.service');
const journalService = require('./journal.service');
const demandesService = require('./demandes.service');

/**
 * GET /tableau-de-bord
 * @param {string} iue IUE du citoyen connecté.
 * @returns {Promise<object>} Données agrégées (voir contrat).
 */
async function getDashboard(iue) {
  const account = await identiteService.getAccount(iue);
  const [identity, pending, stats, unfinished, children] = await Promise.all([
    identiteService.getKnownIdentity(iue),
    consentementsService.countPending(account),
    journalService.stats(account),
    demandesService.countUnfinished(account),
    identiteService.getChildren(account),
  ]);

  const alertes = [];
  if (pending > 0) {
    alertes.push({
      type: 'consentement',
      message: `${pending} demande(s) de consentement en attente de votre réponse`,
      lien: '/consentements',
    });
  }
  for (const child of children) {
    if (child.age !== null && child.age >= identiteService.TRANSFER_AGE) {
      alertes.push({
        type: 'transfert_recommande',
        message: `${child.identity.prenom} a ${child.age} ans : vous pouvez lui transférer le contrôle de son compte`,
        lien: '/enfants',
      });
    }
  }
  if (stats.acces_30_derniers_jours > 0) {
    alertes.push({
      type: 'acces',
      message: `${stats.acces_30_derniers_jours} accès à vos données au cours des 30 derniers jours`,
      lien: '/journal',
    });
  }

  return {
    citoyen: { nom: identity.nom, prenom: identity.prenom },
    consentements_en_attente: pending,
    demandes_en_cours: unfinished,
    acces_recents: stats.acces_30_derniers_jours,
    enfants: children.length,
    alertes,
  };
}

module.exports = { getDashboard };
