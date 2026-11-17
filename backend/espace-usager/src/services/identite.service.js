/**
 * Service Identité — informations d'état civil utiles à l'espace usager
 * (nom, prénom, date de naissance, âge), lues via la passerelle.
 */
const passerelleClient = require('../clients/passerelle.client');
const citoyenModel = require('../models/citoyen.model');
const AppError = require('../utils/AppError');

/** Âge à partir duquel le transfert de compte au mineur est recommandé. */
const TRANSFER_AGE = 15;

/**
 * Âge révolu à partir d'une date AAAA-MM-JJ (calcul en UTC, comme les registres).
 * @param {string} birthDate
 * @param {Date} [today=new Date()]
 * @returns {number}
 */
function computeAge(birthDate, today = new Date()) {
  const birth = new Date(birthDate);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = today.getUTCMonth() < birth.getUTCMonth()
    || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Identité d'un citoyen (avec ses enfants biologiques), ou null si inconnu.
 * @param {string} iue
 * @returns {Promise<object|null>}
 */
function getIdentity(iue) {
  return passerelleClient.getIdentity(iue);
}

/**
 * Identité d'un citoyen dont on sait qu'il existe (il a un compte).
 * @param {string} iue
 * @returns {Promise<object>}
 * @throws {AppError} 502 si l'état civil ne le connaît plus (incohérence).
 */
async function getKnownIdentity(iue) {
  const identity = await getIdentity(iue);
  if (!identity) throw new AppError(502, 'ETAT_CIVIL_INCOHERENT', 'Citoyen introuvable à l\'état civil');
  return identity;
}

/**
 * Comptes enfants rattachés à un tuteur, enrichis de leur identité.
 * @param {object} account Compte du tuteur.
 * @returns {Promise<Array<{account: object, identity: object|null, age: number|null}>>}
 */
async function getChildren(account) {
  const children = await citoyenModel.findChildren(account.id);
  return Promise.all(children.map(async (child) => {
    const identity = await getIdentity(child.iue);
    return { account: child, identity, age: identity ? computeAge(identity.date_naissance) : null };
  }));
}

/**
 * Charge le compte du citoyen connecté.
 * @param {string} iue IUE issu du jeton.
 * @returns {Promise<object>}
 * @throws {AppError} 401 COMPTE_INTROUVABLE si le compte n'existe plus.
 */
async function getAccount(iue) {
  const account = await citoyenModel.findByIue(iue);
  if (!account) throw new AppError(401, 'COMPTE_INTROUVABLE', 'Compte introuvable, veuillez vous reconnecter');
  return account;
}

module.exports = {
  TRANSFER_AGE, computeAge, getIdentity, getKnownIdentity, getChildren, getAccount,
};
