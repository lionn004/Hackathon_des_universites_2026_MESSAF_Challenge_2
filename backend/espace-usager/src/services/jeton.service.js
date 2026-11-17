/**
 * Service Jeton — émission des jetons JWT.
 *
 * Trois sortes de jetons, tous signés en HS256 avec JWT_SECRET :
 *  - jeton de CONNEXION remis au navigateur du citoyen (durée JWT_DUREE) ;
 *  - jeton de SERVICE, très court, que le BFF fabrique pour appeler le
 *    consentement et le journal au nom du citoyen, avec la liste `enfants`
 *    relue en base à l'instant même (un transfert prend effet immédiatement) ;
 *  - jeton d'ADMINISTRATION, très court, pour l'interface de test.
 */
const jwt = require('jsonwebtoken');
const config = require('../config');
const citoyenModel = require('../models/citoyen.model');

/** Durée des jetons fabriqués pour un seul appel entre services. */
const SERVICE_TOKEN_DURATION = '2m';

/**
 * IUE des enfants dont ce compte est actuellement tuteur.
 * @param {string} citizenId
 * @returns {Promise<string[]>}
 */
async function childrenIues(citizenId) {
  return (await citoyenModel.findChildren(citizenId)).map((c) => c.iue);
}

/**
 * Jeton de connexion d'un citoyen.
 * @param {object} account Compte (id, iue).
 * @returns {Promise<string>}
 */
async function signLogin(account) {
  const enfants = await childrenIues(account.id);
  return jwt.sign({ iue: account.iue, enfants }, config.jwtSecret, { algorithm: 'HS256', expiresIn: config.jwtDuration });
}

/**
 * Jeton court pour appeler un autre service au nom d'un citoyen.
 * @param {object} account Compte (id, iue).
 * @returns {Promise<string>}
 */
async function signForService(account) {
  const enfants = await childrenIues(account.id);
  return jwt.sign({ iue: account.iue, enfants }, config.jwtSecret, { algorithm: 'HS256', expiresIn: SERVICE_TOKEN_DURATION });
}

/**
 * Jeton court d'administration (interface de test uniquement).
 * @param {string} administrationId UUID.
 * @returns {string}
 */
function signAdministration(administrationId) {
  return jwt.sign({ administration_id: administrationId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: SERVICE_TOKEN_DURATION });
}

module.exports = { signLogin, signForService, signAdministration };
