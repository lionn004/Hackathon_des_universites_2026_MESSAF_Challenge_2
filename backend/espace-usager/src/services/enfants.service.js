/**
 * Service Enfants — comptes des mineurs gérés par un tuteur, et transfert de compte.
 *
 * Règle (CLAUDE.md, « Gestion des mineurs ») : à 15 ans, le système recommande
 * au tuteur de transférer le contrôle du compte à l'enfant. Après le transfert,
 * l'enfant crée son propre mot de passe via « mot de passe oublié » (code SMS).
 */
const identiteService = require('./identite.service');
const smsService = require('./sms.service');
const citoyenModel = require('../models/citoyen.model');
const AppError = require('../utils/AppError');
const { IUE_REGEX } = require('../utils/validation');

/**
 * Convertit un enfant au format Enfant du contrat.
 * @param {{account: object, identity: object|null, age: number|null}} child
 * @returns {object}
 */
function toContract({ account, identity, age }) {
  return {
    iue: account.iue,
    nom: identity?.nom ?? null,
    prenom: identity?.prenom ?? null,
    date_naissance: identity?.date_naissance ?? null,
    age,
    transfert_recommande: age !== null && age >= identiteService.TRANSFER_AGE,
  };
}

/**
 * GET /enfants — enfants dont le citoyen connecté est tuteur.
 * @param {string} iue IUE du tuteur.
 * @returns {Promise<{enfants: object[]}>}
 */
async function listChildren(iue) {
  const account = await identiteService.getAccount(iue);
  const children = await identiteService.getChildren(account);
  return { enfants: children.map(toContract) };
}

/**
 * POST /enfants/{iue}/transfert — le tuteur rend son compte à l'enfant.
 *
 * L'enfant est détaché du tuteur ; son compte reste sans mot de passe jusqu'à
 * ce qu'il le crée avec le code SMS (« mot de passe oublié »). Le SMS part au
 * numéro du compte, celui que le tuteur avait enregistré.
 *
 * @param {string} tutorIue IUE du tuteur connecté.
 * @param {string} childIue IUE de l'enfant.
 * @returns {Promise<{message: string}>}
 * @throws {AppError} 400 TRANSFERT_IMPOSSIBLE (enfant non rattaché ou déjà transféré)
 *                    ou TRANSFERT_PREMATURE (moins de 15 ans).
 */
async function transfer(tutorIue, childIue) {
  const tutor = await identiteService.getAccount(tutorIue);
  const child = IUE_REGEX.test(childIue || '') ? await citoyenModel.findByIue(childIue) : null;
  if (!child || child.tuteur_id !== tutor.id) {
    throw new AppError(400, 'TRANSFERT_IMPOSSIBLE', 'Cet enfant n\'est pas (ou plus) rattaché à votre compte');
  }

  const identity = await identiteService.getKnownIdentity(child.iue);
  const age = identiteService.computeAge(identity.date_naissance);
  if (age < identiteService.TRANSFER_AGE) {
    throw new AppError(400, 'TRANSFERT_PREMATURE', `Le transfert est possible à partir de ${identiteService.TRANSFER_AGE} ans (${identity.prenom} a ${age} ans)`);
  }

  // Conditionnel en base : deux transferts simultanés ne peuvent pas tous deux réussir.
  if (!(await citoyenModel.detachFromTutor(child.id, tutor.id))) {
    throw new AppError(400, 'TRANSFERT_IMPOSSIBLE', 'Cet enfant n\'est pas (ou plus) rattaché à votre compte');
  }

  smsService.send(
    child.telephone,
    `${identity.prenom}, votre compte DLNUF vous a été transféré. Pour créer votre mot de passe, `
    + `utilisez « Mot de passe oublié » avec votre IUE ${child.iue} et ce numéro de téléphone.`,
  );
  return { message: 'Transfert initié. L\'enfant recevra un SMS pour créer son mot de passe.' };
}

module.exports = { listChildren, transfer };
