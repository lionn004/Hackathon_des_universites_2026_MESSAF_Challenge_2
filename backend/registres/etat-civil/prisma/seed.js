/**
 * Données de démo du registre état-civil (famille OUEDRAOGO, voir CLAUDE.md).
 *
 * Idempotent : chaque citoyen est inséré ou mis à jour (upsert) selon son IUE,
 * le script peut donc être relancé à chaque démarrage du conteneur sans doublon.
 * Lancement manuel : `npm run db:seed`.
 *
 * Scénarios couverts :
 *  - Amadou (majeur) : parents connus → cascade complète possible ;
 *  - Ibrahim et Fatimata : leurs propres parents ne sont pas enregistrés → fallback physique ;
 *  - Awa (12 ans) : mineure → est_majeur = false, gérée par un tuteur.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const citizens = [
  {
    iue: '784302956148',
    nom: 'OUEDRAOGO',
    prenom: 'Amadou',
    date_naissance: '1998-03-15',
    lieu_naissance: 'Ouagadougou',
    sexe: 'M',
    nationalite: 'Burkinabè',
    pere_iue: '291047583620',
    mere_iue: '638501274093',
  },
  {
    // Parents non enregistrés : déclenche le fallback physique dans une cascade.
    iue: '291047583620',
    nom: 'OUEDRAOGO',
    prenom: 'Ibrahim',
    date_naissance: '1968-07-02',
    lieu_naissance: 'Koudougou',
    sexe: 'M',
    nationalite: 'Burkinabè',
    pere_iue: null,
    mere_iue: null,
  },
  {
    iue: '638501274093',
    nom: 'SAWADOGO',
    prenom: 'Fatimata',
    date_naissance: '1972-11-20',
    lieu_naissance: 'Ouahigouya',
    sexe: 'F',
    nationalite: 'Burkinabè',
    pere_iue: null,
    mere_iue: null,
  },
  {
    // Mineure (12 ans en 2026).
    iue: '456123789012',
    nom: 'OUEDRAOGO',
    prenom: 'Awa',
    date_naissance: '2014-05-08',
    lieu_naissance: 'Ouagadougou',
    sexe: 'F',
    nationalite: 'Burkinabè',
    pere_iue: '291047583620',
    mere_iue: '638501274093',
  },
];

/** Insère ou met à jour chaque citoyen de démo. */
async function main() {
  for (const c of citizens) {
    // Prisma attend un objet Date pour une colonne DATE, pas une chaîne.
    const data = { ...c, date_naissance: new Date(c.date_naissance) };
    await prisma.citoyen.upsert({ where: { iue: c.iue }, update: data, create: data });
  }
  console.log(`[seed etat-civil] ${citizens.length} citoyens`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
