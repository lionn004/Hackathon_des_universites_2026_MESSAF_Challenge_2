/**
 * Service Interne — fonctions du BFF réservées aux autres services.
 */
const citoyenModel = require('../models/citoyen.model');
const AppError = require('../utils/AppError');
const { IUE_REGEX } = require('../utils/validation');

/**
 * GET /interne/citoyens/{iue}/telephone — appelé par la passerelle quand une
 * administration veut relancer un citoyen qui tarde à répondre à un consentement.
 * Pour un mineur, c'est le numéro du compte (celui du tuteur) qui est donné.
 *
 * @param {string} iue
 * @returns {Promise<{telephone: string}>}
 * @throws {AppError} 404 TELEPHONE_INCONNU si le citoyen n'a pas de compte.
 */
async function getPhone(iue) {
  const account = IUE_REGEX.test(iue || '') ? await citoyenModel.findByIue(iue) : null;
  if (!account) throw new AppError(404, 'TELEPHONE_INCONNU', 'Ce citoyen n\'a pas de compte sur la plateforme');
  return { telephone: account.telephone };
}

module.exports = { getPhone };
