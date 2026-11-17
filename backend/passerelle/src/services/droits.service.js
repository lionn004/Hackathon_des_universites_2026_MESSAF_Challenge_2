/**
 * Service Droits — qui a le droit de demander quoi.
 *
 * Deux contrôles :
 *  1. l'administration du jeton doit exister dans le catalogue ;
 *  2. cloisonnement par domaine de mission (table AccesMission) : TOUS les
 *     champs requis par la démarche doivent appartenir au périmètre de la
 *     mission de l'administration. Sinon la requête entière est refusée (403),
 *     on ne transmet jamais un sous-ensemble en silence.
 */
const catalogueModel = require('../models/catalogue.model');
const AppError = require('../utils/AppError');

/**
 * Charge l'administration authentifiée.
 * @param {string} administrationId UUID issu du jeton.
 * @returns {Promise<object>} Administration.
 * @throws {AppError} 403 ADMINISTRATION_INCONNUE si le jeton désigne une administration absente du catalogue.
 */
async function getAdministration(administrationId) {
  const admin = await catalogueModel.findAdministration(administrationId);
  if (!admin) {
    throw new AppError(403, 'ADMINISTRATION_INCONNUE', 'Cette administration n\'est pas enregistrée sur la plateforme');
  }
  return admin;
}

/**
 * Vérifie que les champs requis restent dans le périmètre de la mission.
 * @param {object} admin Administration (avec domaine_mission).
 * @param {Array<{registre: string, champs: string[]}>} requiredFields Champs requis par registre.
 * @throws {AppError} 403 HORS_MISSION en listant les champs interdits.
 */
async function checkMission(admin, requiredFields) {
  const rules = await catalogueModel.findMissionAccess(admin.domaine_mission);
  const allowedByRegistre = Object.fromEntries(rules.map((r) => [r.registre, r.champs_autorises]));

  const forbidden = [];
  for (const { registre, champs } of requiredFields) {
    const allowed = allowedByRegistre[registre] || [];
    for (const field of champs) {
      if (!allowed.includes(field)) forbidden.push(`${registre}.${field}`);
    }
  }

  if (forbidden.length > 0) {
    throw new AppError(
      403,
      'HORS_MISSION',
      `Accès refusé : hors du domaine de mission « ${admin.domaine_mission} » (${forbidden.join(', ')})`,
    );
  }
}

module.exports = { getAdministration, checkMission };
