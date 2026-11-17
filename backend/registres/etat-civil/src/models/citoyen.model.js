// Accès aux données uniquement : aucune règle métier ici.
const prisma = require('./prisma');

function findByIue(iue) {
  return prisma.citoyen.findUnique({ where: { iue } });
}

function findChildren(parentIue) {
  return prisma.citoyen.findMany({
    where: { OR: [{ pere_iue: parentIue }, { mere_iue: parentIue }] },
    orderBy: { date_naissance: 'asc' },
  });
}

// criteria : { nom?, prenom?, date_naissance? (Date) } — comparaison insensible à la casse.
function search({ nom, prenom, date_naissance }) {
  const where = {};
  if (nom) where.nom = { equals: nom, mode: 'insensitive' };
  if (prenom) where.prenom = { equals: prenom, mode: 'insensitive' };
  if (date_naissance) where.date_naissance = date_naissance;
  return prisma.citoyen.findMany({ where, orderBy: [{ nom: 'asc' }, { prenom: 'asc' }], take: 50 });
}

module.exports = { findByIue, findChildren, search };
