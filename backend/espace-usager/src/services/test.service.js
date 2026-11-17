/**
 * Service Test — interface de simulation d'administrations (démo et jury).
 *
 * Le BFF fabrique un jeton d'administration pour l'administration choisie, puis
 * appelle la passerelle exactement comme le ferait un vrai ministère ou une
 * vraie entreprise : toute la chaîne est réelle (droits, cascade, minimisation,
 * consentement, journal).
 *
 * ATTENTION : cette interface permet de se faire passer pour n'importe quelle
 * administration. Elle doit être désactivée en production (INTERFACE_TEST_ACTIVE=false).
 */
const config = require('../config');
const passerelleClient = require('../clients/passerelle.client');
const { expectOk } = require('../clients/http');
const jetonService = require('./jeton.service');
const AppError = require('../utils/AppError');
const { IUE_REGEX, UUID_REGEX, invalid, isNonEmptyString } = require('../utils/validation');

/**
 * Refuse tout appel quand l'interface de test est désactivée.
 * @throws {AppError} 404 INTERFACE_TEST_DESACTIVEE
 */
function ensureEnabled() {
  if (!config.testInterfaceEnabled) {
    throw new AppError(404, 'INTERFACE_TEST_DESACTIVEE', 'L\'interface de test est désactivée sur cette plateforme');
  }
}

/** GET /test/administrations */
async function listAdministrations() {
  ensureEnabled();
  return passerelleClient.listAdministrations();
}

/** GET /test/demarches — version courte du catalogue de la passerelle. */
async function listDemarches() {
  ensureEnabled();
  const { demarches } = await passerelleClient.listDemarches();
  return { demarches: demarches.map((d) => ({ id: d.id, nom: d.nom, administration_cible: d.administration_cible })) };
}

/**
 * POST /test/requete — simule une requête d'administration.
 * @param {object} body { administration_id, iue_citoyen, demarche_id }.
 * @returns {Promise<{httpStatus: number, body: object}>} 200 (publique) ou 202 (privée).
 * @throws {AppError} 400 données invalides ; erreurs de la passerelle relayées (403, 404…).
 */
async function simulateRequest(body) {
  ensureEnabled();
  if (!body || !UUID_REGEX.test(body.administration_id || '')) invalid('administration_id doit être un UUID');
  if (!IUE_REGEX.test(body.iue_citoyen || '')) invalid('iue_citoyen doit contenir 12 chiffres');
  if (!isNonEmptyString(body.demarche_id)) invalid('demarche_id est requis');

  const res = await passerelleClient.submitRequete(
    jetonService.signAdministration(body.administration_id),
    { iue_citoyen: body.iue_citoyen, demarche_id: body.demarche_id },
  );
  const result = expectOk('passerelle', res, [200, 202]);

  if (res.status === 200) {
    return {
      httpStatus: 200,
      body: {
        type_admin: 'publique', requete_id: result.requete_id, donnees: result.donnees, cascade: result.cascade, journal_id: result.journal_id,
      },
    };
  }
  return {
    httpStatus: 202,
    body: {
      type_admin: 'privee', requete_id: result.requete_id, consentement_id: result.consentement_id, message: 'Demande de consentement envoyée au citoyen',
    },
  };
}

/**
 * GET /test/requetes/{id}?administration_id= — suivi d'une requête simulée
 * (ex : voir les données arriver après l'acceptation du citoyen).
 * @param {string} id UUID de la requête.
 * @param {string} administrationId Administration qui a fait la requête.
 * @returns {Promise<object>} RequeteStatut de la passerelle.
 */
async function getRequest(id, administrationId) {
  ensureEnabled();
  if (!UUID_REGEX.test(administrationId || '')) invalid('administration_id doit être un UUID');
  return passerelleClient.getRequete(jetonService.signAdministration(administrationId), id);
}

module.exports = {
  listAdministrations, listDemarches, simulateRequest, getRequest,
};
