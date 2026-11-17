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
 *  - Awa (12 ans) : mineure → est_majeur = false, gérée par un tuteur ;
 *  - Moussa (16 ans) : mineur de 15 ans ou plus → transfert de compte recommandé ;
 *  - Salif (30 ans) et sa fille Aïcha (5 ans) : connus de l'état civil mais SANS
 *    compte sur la plateforme → démonstration de l'inscription en direct, avec
 *    rattachement automatique d'Aïcha à son père.
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
  {
    // Mineur de 16 ans : le système recommande au tuteur de lui transférer son compte.
    iue: '527814903361',
    nom: 'OUEDRAOGO',
    prenom: 'Moussa',
    date_naissance: '2010-02-14',
    lieu_naissance: 'Ouagadougou',
    sexe: 'M',
    nationalite: 'Burkinabè',
    pere_iue: '291047583620',
    mere_iue: '638501274093',
  },
  {
    // Frère aîné d'Amadou, pas encore inscrit sur la plateforme (inscription en direct).
    // Ses parents sont connus : la cascade de son casier judiciaire est entièrement résolue.
    iue: '316580942751',
    nom: 'OUEDRAOGO',
    prenom: 'Salif',
    date_naissance: '1996-08-23',
    lieu_naissance: 'Ouagadougou',
    sexe: 'M',
    nationalite: 'Burkinabè',
    pere_iue: '291047583620',
    mere_iue: '638501274093',
  },
  {
    // Fille de Salif, 5 ans : rattachée automatiquement à son père quand il s'inscrit.
    // Mère non enregistrée à l'état civil.
    iue: '873045129604',
    nom: 'OUEDRAOGO',
    prenom: 'Aïcha',
    date_naissance: '2021-01-30',
    lieu_naissance: 'Bobo-Dioulasso',
    sexe: 'F',
    nationalite: 'Burkinabè',
    pere_iue: '316580942751',
    mere_iue: null,
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
