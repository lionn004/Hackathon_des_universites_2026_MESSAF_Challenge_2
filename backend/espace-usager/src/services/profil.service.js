/**
 * Service Profil — profil du citoyen connecté.
 */
const identiteService = require('./identite.service');
const citoyenModel = require('../models/citoyen.model');

/**
 * GET /profil : données de compte et identité d'état civil.
 *
 * Si l'état civil ne connaît pas le citoyen (registre remplacé par celui d'une autre
 * équipe au test d'interopérabilité), le profil reste disponible avec nom et prénom
 * à null, comme à la connexion : le compte, lui, existe toujours.
 *
 * @param {string} iue IUE du citoyen connecté.
 * @returns {Promise<object>} ProfilCitoyen.
 */
async function getProfile(iue) {
  const account = await identiteService.getAccount(iue);
  const [identity, children] = await Promise.all([
    identiteService.getIdentityOrNull(iue),
    citoyenModel.findChildren(account.id),
  ]);
  return {
    iue: account.iue,
    nom: identity?.nom ?? null,
    prenom: identity?.prenom ?? null,
    telephone: account.telephone,
    date_inscription: account.date_inscription.toISOString(),
    est_tuteur: children.length > 0,
    nombre_enfants: children.length,
  };
}

module.exports = { getProfile };
