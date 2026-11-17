/**
 * Remet à zéro la démonstration de l'inscription en direct.
 *
 * Salif OUEDRAOGO (IUE 316580942751) est connu de l'état civil mais n'a pas de
 * compte : c'est lui qu'on inscrit devant le jury. Une fois inscrit, son compte
 * existe et une nouvelle inscription renverrait 409. Ce script supprime son
 * compte et celui de sa fille Aïcha (rattachée automatiquement à l'inscription),
 * pour pouvoir rejouer la démonstration.
 *
 * Il ne touche QU'À ces deux comptes, jamais aux autres comptes de démo.
 * Leurs demandes de pièces et codes SMS sont supprimés avec eux (suppression en
 * cascade). Les entrées du journal et les consentements éventuels, gérés par
 * d'autres services, sont conservés : le journal est en ajout seul.
 *
 * Usage : docker compose exec espace-usager node scripts/reinitialiser-inscription-demo.js
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SALIF = '316580942751';
const AICHA = '873045129604';

/** Supprime l'enfant d'abord, puis le parent, dans une seule transaction. */
async function main() {
  const deleted = await prisma.$transaction(async (tx) => {
    const child = await tx.citoyen.deleteMany({ where: { iue: AICHA } });
    const parent = await tx.citoyen.deleteMany({ where: { iue: SALIF } });
    return child.count + parent.count;
  });

  console.log(deleted > 0
    ? `[démo] ${deleted} compte(s) supprimé(s) : Salif (${SALIF}) peut de nouveau s'inscrire.`
    : `[démo] Rien à faire : Salif (${SALIF}) n'a pas de compte, l'inscription en direct est prête.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
