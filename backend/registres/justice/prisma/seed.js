/**
 * Données de démo du registre justice (famille OUEDRAOGO, voir CLAUDE.md).
 *
 * Idempotent : chaque personne est insérée ou mise à jour (upsert) selon son IUE,
 * et ses condamnations sont remplacées. Le script peut donc être relancé à chaque
 * démarrage du conteneur sans créer de doublon.
 * Lancement manuel : `npm run db:seed`.
 *
 * Scénarios couverts :
 *  - Amadou : casier vierge, nationalité par naissance → démarche passeport possible ;
 *  - Ibrahim : une ancienne condamnation → casier_vierge = false ;
 *  - Fatimata : nationalité acquise par mariage ;
 *  - Awa (mineure) : casier vierge, nationalité par naissance.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const people = [
  {
    iue: '784302956148',
    est_national: true,
    nationalite: 'Burkinabè',
    mode_acquisition: 'naissance',
    date_acquisition: '1998-03-15',
    numero_certificat: 'CN-2020-00456',
    condamnations: [],
  },
  {
    iue: '291047583620',
    est_national: true,
    nationalite: 'Burkinabè',
    mode_acquisition: 'naissance',
    date_acquisition: '1968-07-02',
    numero_certificat: 'CN-1995-00123',
    condamnations: [
      {
        date: '2003-09-12',
        nature: 'Conduite sans permis',
        tribunal: 'Tribunal de Grande Instance de Koudougou',
        duree: '3 mois avec sursis',
      },
    ],
  },
  {
    iue: '638501274093',
    est_national: true,
    nationalite: 'Burkinabè',
    mode_acquisition: 'mariage',
    date_acquisition: '1996-04-27',
    numero_certificat: 'CN-1997-00789',
    condamnations: [],
  },
  {
    iue: '456123789012',
    est_national: true,
    nationalite: 'Burkinabè',
    mode_acquisition: 'naissance',
    date_acquisition: '2014-05-08',
    numero_certificat: null,
    condamnations: [],
  },
];

/** Insère ou met à jour chaque personne de démo et ses condamnations. */
async function main() {
  for (const { condamnations, ...person } of people) {
    // Prisma attend des objets Date pour les colonnes DATE, pas des chaînes.
    const data = { ...person, date_acquisition: person.date_acquisition ? new Date(person.date_acquisition) : null };
    await prisma.justiciable.upsert({ where: { iue: person.iue }, update: data, create: data });

    // Remplace les condamnations : plus simple et sûr qu'un upsert ligne par ligne.
    await prisma.condamnation.deleteMany({ where: { iue: person.iue } });
    if (condamnations.length > 0) {
      await prisma.condamnation.createMany({
        data: condamnations.map((c) => ({ ...c, iue: person.iue, date: new Date(c.date) })),
      });
    }
  }
  console.log(`[seed justice] ${people.length} personnes`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
