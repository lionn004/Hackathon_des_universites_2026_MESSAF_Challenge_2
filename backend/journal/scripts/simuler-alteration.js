/**
 * Simulation d'une altération du journal (démonstration et test seulement ; couche 4).
 *
 * Joue le rôle de quelqu'un qui a accès à la base et contourne l'API pour effacer une
 * trace : la vérification de la chaîne (GET /journal/verification) doit le révéler.
 *
 *   npm run simuler-alteration                  modifie la plus ancienne entrée d'Amadou
 *                                               (retire une donnée de « champs_transmis »)
 *   npm run simuler-alteration -- --supprimer   supprime la deuxième entrée d'Amadou
 *   npm run simuler-alteration -- --annuler     remet tout en état (démo rejouable)
 *
 * Les entrées d'origine sont gardées dans /tmp du conteneur pour --annuler. Usage :
 *   docker compose exec journal npm run simuler-alteration
 */
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const IUE = process.env.IUE_ALTERATION || '784302956148'; // Amadou
const SAUVEGARDE = '/tmp/alteration-journal.json';

/**
 * Entrées chaînées du citoyen, de la plus ancienne à la plus récente.
 * @returns {Promise<object[]>}
 */
function entreesDuCitoyen() {
  return prisma.journalAcces.findMany({ where: { titulaire_iue: IUE, rang: { not: null } }, orderBy: { rang: 'asc' } });
}

/** @returns {object} Sauvegarde courante ({ modifiee, supprimee }). */
function lireSauvegarde() {
  try {
    return JSON.parse(fs.readFileSync(SAUVEGARDE, 'utf8'));
  } catch {
    return {};
  }
}

/** Remet en état les entrées modifiées ou supprimées par ce script. */
async function annuler() {
  const s = lireSauvegarde();
  if (s.modifiee) {
    await prisma.journalAcces.update({ where: { id: s.modifiee.id }, data: { champs_transmis: s.modifiee.champs_transmis } });
    console.log(`Entrée de rang ${s.modifiee.rang} remise dans son état d'origine.`);
  }
  if (s.supprimee) {
    await prisma.journalAcces.create({ data: { ...s.supprimee, date_acces: new Date(s.supprimee.date_acces) } });
    console.log(`Entrée de rang ${s.supprimee.rang} recréée à l'identique.`);
  }
  if (!s.modifiee && !s.supprimee) console.log('Rien à annuler.');
  fs.rmSync(SAUVEGARDE, { force: true });
}

/** Modifie (ou supprime) une entrée du citoyen en contournant l'API. */
async function alterer(supprimer) {
  const entrees = await entreesDuCitoyen();
  const s = lireSauvegarde();
  if (supprimer) {
    const cible = entrees[1];
    if (!cible || s.supprimee) throw new Error('Aucune entrée à supprimer (déjà fait, ou moins de deux entrées)');
    await prisma.journalAcces.delete({ where: { id: cible.id } });
    s.supprimee = cible;
    console.log(`Entrée de rang ${cible.rang} SUPPRIMÉE directement en base (${cible.administration_nom}, ${cible.demarche_nom}).`);
  } else {
    const cible = entrees[0];
    if (!cible || s.modifiee) throw new Error('Aucune entrée à modifier (déjà fait, ou journal vide)');
    const champs = cible.champs_transmis.slice(0, Math.max(1, cible.champs_transmis.length - 1));
    await prisma.journalAcces.update({ where: { id: cible.id }, data: { champs_transmis: champs } });
    s.modifiee = { id: cible.id, rang: cible.rang, champs_transmis: cible.champs_transmis };
    console.log(`Entrée de rang ${cible.rang} MODIFIÉE directement en base : champs transmis `
      + `[${cible.champs_transmis.join(', ')}] -> [${champs.join(', ')}].`);
  }
  fs.writeFileSync(SAUVEGARDE, JSON.stringify(s));
  console.log('Vérifier : GET /api/journal/verification (espace usager). Remise en état : -- --annuler');
}

const args = process.argv.slice(2);
(args.includes('--annuler') ? annuler() : alterer(args.includes('--supprimer')))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
