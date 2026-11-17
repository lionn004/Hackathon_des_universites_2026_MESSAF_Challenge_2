/**
 * Comptes de démo de l'espace usager (famille OUEDRAOGO, voir CLAUDE.md).
 *
 * Mots de passe de DÉMONSTRATION (à ne jamais réutiliser ailleurs) :
 *   Amadou   784302956148 / Amadou2026!
 *   Ibrahim  291047583620 / Ibrahim2026!   ← tuteur d'Awa et de Moussa
 *   Fatimata 638501274093 / Fatimata2026!
 * Awa (12 ans) et Moussa (16 ans) n'ont pas de mot de passe : leurs comptes
 * sont gérés par Ibrahim. Pour Moussa, le transfert de compte est recommandé.
 *
 * Salif (316580942751) et sa fille Aïcha n'ont volontairement PAS de compte :
 * Salif sert à la démonstration de l'inscription en direct.
 * Pour rejouer cette démonstration : scripts/reinitialiser-inscription-demo.js
 *
 * Création seule (upsert avec update vide) : un mot de passe changé pendant la
 * démo n'est pas écrasé au redémarrage du conteneur.
 * Lancement manuel : `npm run db:seed`.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

/** Coût bcrypt : même valeur que le service d'authentification. */
const BCRYPT_ROUNDS = 10;

const ADULTS = [
  { iue: '784302956148', password: 'Amadou2026!', telephone: '+22670123456' },
  { iue: '291047583620', password: 'Ibrahim2026!', telephone: '+22676543210' },
  { iue: '638501274093', password: 'Fatimata2026!', telephone: '+22678112233' },
];
const TUTOR_IUE = '291047583620';
const CHILDREN = ['456123789012', '527814903361'];

/** Crée les comptes adultes, puis les comptes enfants rattachés à Ibrahim. */
async function main() {
  for (const a of ADULTS) {
    await prisma.citoyen.upsert({
      where: { iue: a.iue },
      update: {},
      create: { iue: a.iue, telephone: a.telephone, mot_de_passe: await bcrypt.hash(a.password, BCRYPT_ROUNDS) },
    });
  }

  const tutor = await prisma.citoyen.findUnique({ where: { iue: TUTOR_IUE } });
  for (const iue of CHILDREN) {
    await prisma.citoyen.upsert({
      where: { iue },
      update: {},
      // Le téléphone d'un compte enfant est celui du tuteur (c'est lui qui reçoit les SMS).
      create: { iue, telephone: tutor.telephone, tuteur_id: tutor.id, mot_de_passe: null },
    });
  }
  console.log(`[seed espace-usager] ${ADULTS.length} comptes adultes, ${CHILDREN.length} comptes enfants (tuteur ${TUTOR_IUE})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
