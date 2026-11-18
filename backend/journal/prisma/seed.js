/**
 * Données de démo du journal (famille OUEDRAOGO, voir CLAUDE.md).
 *
 * Permet à l'équipe frontend d'afficher un journal et des statistiques
 * avant que la passerelle n'existe.
 * Idempotent : chaque entrée a un id fixe et est insérée ou mise à jour (upsert),
 * le script peut donc être relancé à chaque démarrage du conteneur sans doublon.
 * Lancement manuel : `npm run db:seed`.
 *
 * Les identifiants d'administration sont les UUID fixes de référence définis
 * dans CLAUDE.md (section « Données de seed ») : la passerelle doit utiliser les mêmes.
 *
 * Scénarios couverts :
 *  - accès direct d'une administration publique aux données d'Amadou (adulte) ;
 *  - accès par consentement d'une administration privée (banque) ;
 *  - accès aux données d'Awa (mineure) : titulaire = Awa, décideur = Ibrahim (tuteur).
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AMADOU = '784302956148';
const AWA = '456123789012';

const ADMIN = {
  universite: { id: '00000000-0000-4000-8000-000000000001', nom: 'Université Joseph KI-ZERBO', type: 'publique' },
  police: { id: '00000000-0000-4000-8000-000000000002', nom: 'Direction de la police nationale', type: 'publique' },
  banque: { id: '00000000-0000-4000-8000-000000000004', nom: 'Banque Atlantique', type: 'privee' },
};

/**
 * Construit une entrée de démo.
 * @param {string} id UUID fixe de l'entrée (garantit l'idempotence).
 * @param {object} admin Administration (voir ADMIN).
 * @param {object} rest Autres champs de JournalAcces.
 */
function entry(id, admin, rest) {
  return {
    id,
    administration_id: admin.id,
    administration_nom: admin.nom,
    administration_type: admin.type,
    ...rest,
  };
}

const entries = [
  entry('10000000-0000-4000-8000-000000000001', ADMIN.universite, {
    titulaire_iue: AMADOU,
    decideur_iue: AMADOU,
    demarche_id: 'inscription-universite',
    demarche_nom: 'Inscription universitaire',
    registres_consultes: ['etat-civil'],
    champs_transmis: ['est_majeur', 'nationalite'],
    type_acces: 'direct',
    date_acces: new Date('2026-09-02T09:15:00Z'),
  }),
  entry('10000000-0000-4000-8000-000000000002', ADMIN.police, {
    titulaire_iue: AMADOU,
    decideur_iue: AMADOU,
    demarche_id: 'emission-passeport',
    demarche_nom: 'Émission de passeport',
    registres_consultes: ['etat-civil', 'justice'],
    champs_transmis: ['nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe', 'nationalite', 'casier_vierge', 'est_national'],
    type_acces: 'direct',
    date_acces: new Date('2026-10-20T14:40:00Z'),
  }),
  entry('10000000-0000-4000-8000-000000000003', ADMIN.banque, {
    titulaire_iue: AMADOU,
    decideur_iue: AMADOU,
    demarche_id: 'ouverture-compte-bancaire',
    demarche_nom: 'Ouverture de compte bancaire',
    registres_consultes: ['etat-civil', 'fiscal'],
    champs_transmis: ['nom', 'prenom', 'nationalite', 'en_regle'],
    type_acces: 'consentement',
    date_acces: new Date('2026-11-10T11:05:00Z'),
  }),
  // Accès direct d'une administration publique aux données d'une mineure : personne ne
  // « décide » (accès autorisé par la loi), le titulaire est donc inscrit comme décideur,
  // comme le fait la passerelle. Ibrahim voit tout de même l'accès, en tant que tuteur.
  entry('10000000-0000-4000-8000-000000000004', ADMIN.universite, {
    titulaire_iue: AWA,
    decideur_iue: AWA,
    demarche_id: 'inscription-universite',
    demarche_nom: 'Inscription universitaire',
    registres_consultes: ['etat-civil'],
    champs_transmis: ['est_majeur', 'nationalite'],
    type_acces: 'direct',
    date_acces: new Date('2026-11-12T08:30:00Z'),
  }),
];

/** Insère ou met à jour chaque entrée de démo. */
async function main() {
  for (const e of entries) {
    await prisma.journalAcces.upsert({ where: { id: e.id }, update: e, create: e });
  }
  console.log(`[seed journal] ${entries.length} entrées`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
