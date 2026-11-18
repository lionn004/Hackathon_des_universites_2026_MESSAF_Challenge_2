/**
 * Démonstration du guichet (docs/conception-interoperabilite.md, § 9).
 *
 * Simule l'agent du centre d'état civil qui, après avoir vérifié les actes papier
 * présentés par Ibrahim OUEDRAOGO, numérise dans CE registre les actes de naissance
 * de ses parents (jamais enregistrés jusque-là). La donnée entre là où elle doit vivre :
 * dans le registre de l'état civil, pas dans la plateforme.
 *
 * Effet attendu : la reprise automatique de l'espace usager relance la demande de casier
 * d'Ibrahim, bloquée au guichet (« fallback_physique ») ; la cascade se résout et la
 * demande devient complète en quelques secondes, avec une notification SMS (simulée).
 *
 * Usage :
 *   docker compose exec registre-etat-civil npm run guichet               saisie des actes
 *   docker compose exec registre-etat-civil npm run guichet -- --annuler  retour à l'état initial
 * Un redémarrage du registre remet aussi la démonstration à zéro (le seed est relancé).
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const IBRAHIM = '291047583620';

/** Actes de naissance des parents d'Ibrahim, tels que saisis par l'agent. */
const PARENTS = [
  {
    iue: '190412736581',
    nom: 'OUEDRAOGO',
    prenom: 'Boukary',
    date_naissance: new Date('1940-04-12'),
    lieu_naissance: 'Koudougou',
    sexe: 'M',
    nationalite: 'Burkinabè',
    pere_iue: null,
    mere_iue: null,
  },
  {
    iue: '205218469370',
    nom: 'ZONGO',
    prenom: 'Mariam',
    date_naissance: new Date('1945-09-03'),
    lieu_naissance: 'Koudougou',
    sexe: 'F',
    nationalite: 'Burkinabè',
    pere_iue: null,
    mere_iue: null,
  },
];

/** Numérise les actes et rattache les parents à Ibrahim (idempotent). */
async function saisir() {
  for (const p of PARENTS) {
    await prisma.citoyen.upsert({ where: { iue: p.iue }, update: p, create: p });
  }
  await prisma.citoyen.update({ where: { iue: IBRAHIM }, data: { pere_iue: PARENTS[0].iue, mere_iue: PARENTS[1].iue } });
  console.log('[guichet] actes numérisés : Boukary OUEDRAOGO (père) et Mariam ZONGO (mère) rattachés à Ibrahim OUEDRAOGO.');
  console.log('[guichet] la reprise automatique complétera ses demandes bloquées dans quelques secondes.');
}

/** Revient à l'état initial de la démonstration : parents d'Ibrahim inconnus. */
async function annuler() {
  await prisma.citoyen.update({ where: { iue: IBRAHIM }, data: { pere_iue: null, mere_iue: null } });
  await prisma.citoyen.deleteMany({ where: { iue: { in: PARENTS.map((p) => p.iue) } } });
  console.log('[guichet] démonstration remise à zéro : les parents d\'Ibrahim ne sont plus enregistrés.');
}

(process.argv.includes('--annuler') ? annuler() : saisir())
  .catch((err) => {
    console.error(`[guichet] échec : ${err.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
