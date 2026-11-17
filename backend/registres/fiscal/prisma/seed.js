/**
 * Données de démo du registre fiscal (famille OUEDRAOGO, voir CLAUDE.md).
 *
 * Idempotent : chaque contribuable est inséré ou mis à jour (upsert) selon son IUE,
 * le script peut donc être relancé à chaque démarrage du conteneur sans doublon.
 * Lancement manuel : `npm run db:seed`.
 *
 * Scénarios couverts :
 *  - Amadou : particulier en règle → démarche « ouverture de compte bancaire » acceptée ;
 *  - Ibrahim : commerçant (CME) avec un impôt restant dû → en_regle = false ;
 *  - Fatimata : non assujettie à l'impôt ;
 *  - Awa (mineure) : volontairement ABSENTE du registre fiscal → 404, cas que la
 *    passerelle doit savoir gérer.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const taxpayers = [
  {
    iue: '784302956148',
    ifu: 'IFU-00012345',
    type_contribuable: 'particulier',
    regime_fiscal: 'non_assujetti',
    derniere_declaration: '2026-03-31',
    montant_impot_du: 0,
  },
  {
    iue: '291047583620',
    ifu: 'IFU-00004521',
    type_contribuable: 'entreprise_individuelle',
    regime_fiscal: 'cme',
    derniere_declaration: '2025-03-31',
    montant_impot_du: 185000,
  },
  {
    iue: '638501274093',
    ifu: 'IFU-00009876',
    type_contribuable: 'particulier',
    regime_fiscal: 'non_assujetti',
    derniere_declaration: null,
    montant_impot_du: null,
  },
];

/** Insère ou met à jour chaque contribuable de démo. */
async function main() {
  for (const t of taxpayers) {
    // Prisma attend un objet Date pour une colonne DATE, pas une chaîne.
    const data = { ...t, derniere_declaration: t.derniere_declaration ? new Date(t.derniere_declaration) : null };
    await prisma.contribuable.upsert({ where: { iue: t.iue }, update: data, create: data });
  }
  console.log(`[seed fiscal] ${taxpayers.length} contribuables`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
