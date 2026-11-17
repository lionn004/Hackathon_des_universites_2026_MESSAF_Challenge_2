/**
 * Service Profil — profil du citoyen connecté.
 */
const identiteService = require('./identite.service');
const citoyenModel = require('../models/citoyen.model');

/**
 * GET /profil — données de compte + identité d'état civil.
 * @param {string} iue IUE du citoyen connecté.
 * @returns {Promise<object>} ProfilCitoyen.
 */
async function getProfile(iue) {
  const account = await identiteService.getAccount(iue);
  const [identity, children] = await Promise.all([
    identiteService.getKnownIdentity(iue),
    citoyenModel.findChildren(account.id),
  ]);
  return {
    iue: account.iue,
    nom: identity.nom,
    prenom: identity.prenom,
    telephone: account.telephone,
    date_inscription: account.date_inscription.toISOString(),
    est_tuteur: children.length > 0,
    nombre_enfants: children.length,
  };
}

module.exports = { getProfile };
