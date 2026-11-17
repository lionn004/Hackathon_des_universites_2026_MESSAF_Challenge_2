/**
 * Service Auth — inscription, connexion et réinitialisation du mot de passe par SMS.
 *
 * Règles :
 *  - un compte ne peut être créé que pour un IUE connu de l'état civil, et
 *    seulement par un MAJEUR (le compte d'un mineur est géré par son tuteur) ;
 *  - à l'inscription d'un adulte, ses enfants mineurs sans compte sont
 *    détectés via l'état civil et rattachés à lui comme tuteur ;
 *  - les messages d'erreur de connexion et de « mot de passe oublié » ne
 *    révèlent jamais si un IUE a un compte (pas d'énumération des comptes).
 */
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const citoyenModel = require('../models/citoyen.model');
const reinitialisationModel = require('../models/reinitialisation.model');
const identiteService = require('./identite.service');
const jetonService = require('./jeton.service');
const smsService = require('./sms.service');
const AppError = require('../utils/AppError');
const { IUE_REGEX, invalid } = require('../utils/validation');

/** Coût bcrypt : bon compromis sécurité / temps de réponse. */
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
/** Format accepté : "+226 70 12 34 56", "70123456"… (8 à 15 chiffres, espaces tolérés). */
const PHONE_REGEX = /^\+?[0-9][0-9 ]{7,17}$/;
/** Durée de validité d'un code SMS de réinitialisation. */
const RESET_DURATION_MS = 15 * 60 * 1000;
/** Nombre maximal de codes faux avant que la demande soit grillée. */
const MAX_RESET_ATTEMPTS = 5;
/**
 * Hash factice : quand l'IUE n'a pas de compte, on compare quand même le mot de
 * passe à ce hash, pour que la réponse prenne le même temps (pas d'énumération).
 */
const DUMMY_HASH = bcrypt.hashSync('mot-de-passe-factice', BCRYPT_ROUNDS);

/**
 * Normalise un numéro de téléphone pour comparaison (sans espaces).
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '');
}

/** SHA-256 hexadécimal (empreinte du jeton temporaire). */
function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Réponse d'authentification (AuthReponse du contrat).
 * Les noms viennent de l'état civil ; si la passerelle est momentanément
 * indisponible, la connexion réussit quand même, sans les noms.
 */
async function authResponse(account) {
  let identity = null;
  try {
    identity = await identiteService.getIdentity(account.iue);
  } catch {
    identity = null;
  }
  return {
    token: await jetonService.signLogin(account),
    citoyen: {
      iue: account.iue,
      nom: identity?.nom ?? null,
      prenom: identity?.prenom ?? null,
      telephone: account.telephone,
    },
  };
}

/**
 * POST /auth/inscription — crée le compte d'un citoyen majeur.
 * @param {object} body { iue, mot_de_passe, telephone }.
 * @returns {Promise<object>} AuthReponse.
 * @throws {AppError} 400 données invalides, 404 IUE_INCONNU, 403 COMPTE_MINEUR, 409 IUE_DEJA_ENREGISTRE.
 */
async function register(body) {
  if (!body || !IUE_REGEX.test(body.iue || '')) invalid('iue doit contenir 12 chiffres');
  if (typeof body.mot_de_passe !== 'string' || body.mot_de_passe.length < MIN_PASSWORD_LENGTH) {
    invalid(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
  }
  if (!PHONE_REGEX.test(body.telephone || '')) invalid('telephone invalide (ex : +22670123456)');

  if (await citoyenModel.findByIue(body.iue)) {
    throw new AppError(409, 'IUE_DEJA_ENREGISTRE', 'Un compte existe déjà pour cet IUE');
  }

  const identity = await identiteService.getIdentity(body.iue);
  if (!identity) throw new AppError(404, 'IUE_INCONNU', 'Cet IUE est inconnu de l\'état civil');
  if (!identity.est_majeur) {
    throw new AppError(403, 'COMPTE_MINEUR', 'Le compte d\'un mineur est créé et géré par son tuteur');
  }

  // Détection des enfants mineurs (via l'état civil) qui n'ont pas encore de compte.
  // Si l'autre parent s'est inscrit en premier, il est déjà leur tuteur : on ne change rien.
  const minors = identity.enfants.filter((e) => !e.est_majeur).map((e) => e.iue);
  const alreadyRegistered = minors.length ? await citoyenModel.findExistingIues(minors) : [];
  const toAttach = minors.filter((iue) => !alreadyRegistered.includes(iue));

  const account = await citoyenModel.createWithChildren({
    iue: body.iue,
    mot_de_passe: await bcrypt.hash(body.mot_de_passe, BCRYPT_ROUNDS),
    telephone: normalizePhone(body.telephone),
  }, toAttach);

  return authResponse(account);
}

/**
 * POST /auth/connexion — vérifie l'IUE et le mot de passe.
 * @param {object} body { iue, mot_de_passe }.
 * @returns {Promise<object>} AuthReponse.
 * @throws {AppError} 401 AUTH_INVALIDE (même message quelle que soit la cause).
 */
async function login(body) {
  const iue = body && body.iue;
  const password = body && typeof body.mot_de_passe === 'string' ? body.mot_de_passe : '';
  const account = IUE_REGEX.test(iue || '') ? await citoyenModel.findByIue(iue) : null;

  // Compte sans mot de passe = compte d'enfant géré par un tuteur, ou transfert non activé.
  const ok = await bcrypt.compare(password, account?.mot_de_passe || DUMMY_HASH);
  if (!account || !account.mot_de_passe || !ok) {
    throw new AppError(401, 'AUTH_INVALIDE', 'IUE ou mot de passe incorrect');
  }
  return authResponse(account);
}

/**
 * Crée une demande de code SMS pour un compte et envoie le code.
 * @param {object} account Compte concerné.
 * @param {string} reason Texte d'introduction du SMS.
 * @returns {Promise<string>} Jeton temporaire (en clair, à remettre au client).
 */
async function startReset(account, reason) {
  const token = crypto.randomBytes(32).toString('hex');
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await reinitialisationModel.create({
    citoyen_id: account.id,
    token_hash: sha256(token),
    code_hash: await bcrypt.hash(code, BCRYPT_ROUNDS),
    expire_le: new Date(Date.now() + RESET_DURATION_MS),
  });
  smsService.send(account.telephone, `${reason} Votre code DLNUF : ${code} (valable 15 minutes).`);
  return token;
}

/**
 * POST /auth/mot-de-passe-oublie — envoie un code par SMS si l'IUE et le
 * téléphone correspondent à un compte autonome.
 *
 * La réponse est TOUJOURS la même (avec un jeton temporaire, factice si rien ne
 * correspond) : on ne révèle pas si l'IUE a un compte. Un compte d'enfant géré
 * par un tuteur est exclu : sinon l'enfant pourrait prendre le contrôle de son
 * compte sans passer par le transfert.
 *
 * @param {object} body { iue, telephone }.
 * @returns {Promise<{message: string, token_temporaire: string}>}
 * @throws {AppError} 400 si l'IUE ou le téléphone sont absents.
 */
async function forgotPassword(body) {
  if (!body || !IUE_REGEX.test(body.iue || '')) invalid('iue doit contenir 12 chiffres');
  if (!PHONE_REGEX.test(body.telephone || '')) invalid('telephone invalide (ex : +22670123456)');

  const account = await citoyenModel.findByIue(body.iue);
  const matches = account && !account.tuteur_id && normalizePhone(account.telephone) === normalizePhone(body.telephone);
  const token = matches
    ? await startReset(account, 'Réinitialisation de votre mot de passe.')
    : crypto.randomBytes(32).toString('hex');

  return { message: 'Si les informations correspondent, un code de vérification a été envoyé par SMS', token_temporaire: token };
}

/**
 * POST /auth/reinitialiser-mot-de-passe — vérifie le code SMS et change le mot de passe.
 * @param {object} body { token_temporaire, code_sms, nouveau_mot_de_passe }.
 * @returns {Promise<{message: string}>}
 * @throws {AppError} 400 DONNEES_INVALIDES ou CODE_INVALIDE (même message pour jeton
 *                    inconnu, expiré, déjà utilisé ou code faux).
 */
async function resetPassword(body) {
  if (!body || typeof body.token_temporaire !== 'string' || typeof body.code_sms !== 'string') {
    invalid('token_temporaire et code_sms sont requis');
  }
  if (typeof body.nouveau_mot_de_passe !== 'string' || body.nouveau_mot_de_passe.length < MIN_PASSWORD_LENGTH) {
    invalid(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères`);
  }

  const rejected = () => new AppError(400, 'CODE_INVALIDE', 'Code invalide ou expiré, veuillez refaire une demande');
  const reset = await reinitialisationModel.findByTokenHash(sha256(body.token_temporaire));
  if (!reset || reset.utilise_le || reset.expire_le < new Date() || reset.tentatives >= MAX_RESET_ATTEMPTS) throw rejected();

  if (!(await bcrypt.compare(body.code_sms, reset.code_hash))) {
    await reinitialisationModel.incrementAttempts(reset.id);
    throw rejected();
  }

  const changed = await reinitialisationModel.consumeAndSetPassword(
    reset.id,
    reset.citoyen_id,
    await bcrypt.hash(body.nouveau_mot_de_passe, BCRYPT_ROUNDS),
  );
  if (!changed) throw rejected();
  return { message: 'Mot de passe réinitialisé avec succès' };
}

module.exports = {
  register, login, forgotPassword, resetPassword, normalizePhone,
};
