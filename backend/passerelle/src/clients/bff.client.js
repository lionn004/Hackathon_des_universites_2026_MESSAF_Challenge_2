/**
 * Client du BFF espace usager, pour les données de COMPTE du citoyen
 * (le numéro de téléphone n'est pas une donnée administrative : il vit côté BFF).
 *
 * Route interne attendue côté BFF : GET /api/interne/citoyens/{iue}/telephone
 *   → 200 { telephone } | 404 si le citoyen n'a pas de compte.
 */
const config = require('../config');
const AppError = require('../utils/AppError');
const { request, unexpected } = require('./http');

/**
 * Récupère le téléphone d'un citoyen.
 * @param {string} iue
 * @returns {Promise<string>}
 * @throws {AppError} 503 si le BFF est indisponible, 404 si le citoyen n'a pas de compte.
 */
async function getPhone(iue) {
  let res;
  try {
    // La route est protégée côté BFF par la clé de service partagée.
    res = await request('espace usager (BFF)', `${config.urls.bff}/interne/citoyens/${iue}/telephone`, {
      headers: { 'X-Cle-Service': config.serviceKey },
    });
  } catch {
    throw new AppError(503, 'SERVICE_INDISPONIBLE', 'Le numéro de téléphone est momentanément indisponible (espace usager injoignable)');
  }
  if (res.status === 404) {
    throw new AppError(404, 'TELEPHONE_INCONNU', 'Ce citoyen n\'a pas de numéro de téléphone enregistré');
  }
  if (res.status !== 200 || !res.body || !res.body.telephone) unexpected('espace usager (BFF)', res);
  return res.body.telephone;
}

module.exports = { getPhone };
