// Logique métier du registre état-civil. Ne connaît ni req ni res.
const citoyenModel = require('../models/citoyen.model');
const AppError = require('../utils/AppError');

const IUE_REGEX = /^[0-9]{12}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MAJORITY_AGE = 18;

const ALL_FIELDS = [
  'iue', 'nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe',
  'nationalite', 'pere_iue', 'mere_iue', 'date_deces', 'est_majeur',
];

function toIsoDate(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function computeAge(birthDate, today = new Date()) {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// Convertit un enregistrement en DonneesEtatCivil (format du contrat).
function toContract(citizen) {
  return {
    iue: citizen.iue,
    nom: citizen.nom,
    prenom: citizen.prenom,
    date_naissance: toIsoDate(citizen.date_naissance),
    lieu_naissance: citizen.lieu_naissance,
    sexe: citizen.sexe,
    nationalite: citizen.nationalite,
    pere_iue: citizen.pere_iue,
    mere_iue: citizen.mere_iue,
    date_deces: toIsoDate(citizen.date_deces),
    est_majeur: computeAge(citizen.date_naissance) >= MAJORITY_AGE,
  };
}

// Champs inconnus ignorés : le registre ne renvoie que ce qu'il connaît.
function pickFields(data, fieldsParam) {
  if (!fieldsParam) return data;
  const requested = fieldsParam.split(',').map((f) => f.trim()).filter((f) => ALL_FIELDS.includes(f));
  return Object.fromEntries(requested.map((f) => [f, data[f]]));
}

async function getExistingCitizen(iue) {
  const citizen = IUE_REGEX.test(iue) ? await citoyenModel.findByIue(iue) : null;
  if (!citizen) throw new AppError(404, 'CITOYEN_NON_TROUVE', 'Aucun citoyen trouvé avec cet IUE');
  return citizen;
}

async function getCitizen(iue, fieldsParam) {
  const citizen = await getExistingCitizen(iue);
  return pickFields(toContract(citizen), fieldsParam);
}

async function getFiliation(iue) {
  const citizen = await getExistingCitizen(iue);
  const parents = [];
  if (citizen.pere_iue) parents.push({ iue: citizen.pere_iue, lien: 'pere' });
  if (citizen.mere_iue) parents.push({ iue: citizen.mere_iue, lien: 'mere' });

  const children = await citoyenModel.findChildren(iue);
  const enfants = children.map((c) => ({ iue: c.iue, lien: c.sexe === 'F' ? 'fille' : 'fils' }));

  return { iue: citizen.iue, parents, enfants };
}

async function searchCitizens({ nom, prenom, date_naissance }) {
  // Sans critère valide, on ne renvoie rien (pas d'export complet du registre).
  const birthDate = date_naissance && DATE_REGEX.test(date_naissance) ? new Date(date_naissance) : null;
  if (!nom && !prenom && !birthDate) return { resultats: [] };

  const citizens = await citoyenModel.search({ nom, prenom, date_naissance: birthDate });
  return {
    resultats: citizens.map((c) => ({
      iue: c.iue,
      nom: c.nom,
      prenom: c.prenom,
      date_naissance: toIsoDate(c.date_naissance),
    })),
  };
}

module.exports = { getCitizen, getFiliation, searchCitizens, computeAge };
