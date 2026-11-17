/**
 * Données de démo de la passerelle : le catalogue complet (prisma/reference.js).
 *
 * Idempotent : tout est inséré ou mis à jour (upsert), le script peut donc être
 * relancé à chaque démarrage du conteneur sans doublon. Les requêtes des
 * administrations ne sont pas touchées.
 * Lancement manuel : `npm run db:seed`.
 */
const { PrismaClient } = require('@prisma/client');
const {
  ADMINISTRATIONS, ACCES_MISSION, TYPES_PIECES, PREREQUIS, DEMARCHES,
} = require('./reference');

const prisma = new PrismaClient();

/** Charge le catalogue dans l'ordre imposé par les clés étrangères. */
async function main() {
  for (const a of ADMINISTRATIONS) {
    await prisma.administration.upsert({ where: { id: a.id }, update: a, create: a });
  }

  for (const m of ACCES_MISSION) {
    await prisma.accesMission.upsert({
      where: { domaine_mission_registre: { domaine_mission: m.domaine_mission, registre: m.registre } },
      update: { champs_autorises: m.champs_autorises },
      create: m,
    });
  }

  for (const t of TYPES_PIECES) {
    await prisma.typePiece.upsert({ where: { id: t.id }, update: t, create: t });
  }

  for (const p of PREREQUIS) {
    await prisma.prerequisPiece.upsert({
      where: { type_piece_id_prerequis_id_proprietaire: p },
      update: {},
      create: p,
    });
  }

  for (const { pieces, ...d } of DEMARCHES) {
    await prisma.demarche.upsert({ where: { id: d.id }, update: d, create: d });
    for (const typePieceId of pieces) {
      await prisma.demarchePiece.upsert({
        where: { demarche_id_type_piece_id: { demarche_id: d.id, type_piece_id: typePieceId } },
        update: {},
        create: { demarche_id: d.id, type_piece_id: typePieceId },
      });
    }
  }

  console.log(`[seed passerelle] ${ADMINISTRATIONS.length} administrations, ${DEMARCHES.length} démarches, `
    + `${TYPES_PIECES.length} types de pièces, ${ACCES_MISSION.length} règles de mission`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
