/**
 * Controller Citoyen — couche HTTP de l'espace personnel du citoyen connecté :
 * profil, enfants, demandes de pièces, consentements, journal, tableau de bord.
 *
 * Rôle : extraire les paramètres, appeler le service, renvoyer le bon code HTTP.
 * req.citoyen.iue est fourni par le middleware auth. Aucune logique métier ici.
 */
const profilService = require('../services/profil.service');
const enfantsService = require('../services/enfants.service');
const demandesService = require('../services/demandes.service');
const consentementsService = require('../services/consentements.service');
const journalService = require('../services/journal.service');
const tableauDeBordService = require('../services/tableauDeBord.service');

/** GET /api/profil */
async function getProfile(req, res) {
  res.status(200).json(await profilService.getProfile(req.citoyen.iue));
}

/** GET /api/enfants */
async function listChildren(req, res) {
  res.status(200).json(await enfantsService.listChildren(req.citoyen.iue));
}

/** POST /api/enfants/:iue/transfert */
async function transferChild(req, res) {
  res.status(200).json(await enfantsService.transfer(req.citoyen.iue, req.params.iue));
}

/** GET /api/demandes?statut=&page=&limite= */
async function listDemandes(req, res) {
  res.status(200).json(await demandesService.list(req.citoyen.iue, req.query));
}

/** POST /api/demandes — 201 + Demande avec son arbre de résolution. */
async function createDemande(req, res) {
  res.status(201).json(await demandesService.create(req.citoyen.iue, req.body));
}

/** GET /api/demandes/:id */
async function getDemande(req, res) {
  res.status(200).json(await demandesService.get(req.citoyen.iue, req.params.id));
}

/** GET /api/demandes/:id/contenu — contenu de la pièce, lu à l'instant dans son registre. */
async function getDemandeContent(req, res) {
  res.status(200).json(await demandesService.getContent(req.citoyen.iue, req.params.id));
}

/** GET /api/consentements?statut=&page=&limite= */
async function listConsents(req, res) {
  res.status(200).json(await consentementsService.list(req.citoyen.iue, req.query));
}

/** GET /api/consentements/:id */
async function getConsent(req, res) {
  res.status(200).json(await consentementsService.get(req.citoyen.iue, req.params.id));
}

/** PUT /api/consentements/:id — body { decision }. */
async function answerConsent(req, res) {
  res.status(200).json(await consentementsService.answer(req.citoyen.iue, req.params.id, req.body));
}

/** GET /api/journal?date_debut=&date_fin=&page=&limite= */
async function listJournal(req, res) {
  res.status(200).json(await journalService.list(req.citoyen.iue, req.query));
}

/** GET /api/journal/verification — le journal est-il intact (chaîne des empreintes) ? */
async function verifyJournal(req, res) {
  res.status(200).json(await journalService.verify(req.citoyen.iue));
}

/** GET /api/tableau-de-bord */
async function getDashboard(req, res) {
  res.status(200).json(await tableauDeBordService.getDashboard(req.citoyen.iue));
}

module.exports = {
  getProfile,
  listChildren,
  transferChild,
  listDemandes,
  createDemande,
  getDemande,
  getDemandeContent,
  listConsents,
  getConsent,
  answerConsent,
  listJournal,
  verifyJournal,
  getDashboard,
};
