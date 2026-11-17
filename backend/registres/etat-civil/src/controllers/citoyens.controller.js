// Traduit HTTP <-> service. Aucune logique métier ici.
const citoyensService = require('../services/citoyens.service');

async function getCitizen(req, res) {
  const data = await citoyensService.getCitizen(req.params.iue, req.query.champs);
  res.status(200).json(data);
}

async function getFiliation(req, res) {
  const data = await citoyensService.getFiliation(req.params.iue);
  res.status(200).json(data);
}

async function search(req, res) {
  const { nom, prenom, date_naissance } = req.query;
  const data = await citoyensService.searchCitizens({ nom, prenom, date_naissance });
  res.status(200).json(data);
}

module.exports = { getCitizen, getFiliation, search };
