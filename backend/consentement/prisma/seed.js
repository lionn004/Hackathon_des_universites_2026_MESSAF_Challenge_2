/**
 * Données de démo du service consentement (voir CLAUDE.md, « Données de seed »).
 *
 * 1. Règles de minimisation des 3 démarches de bout en bout.
 *    Toujours remises à jour (upsert) : le seed fait foi.
 * 2. Demandes de consentement de démo pour l'espace usager.
 *    Créées une seule fois (upsert avec update vide) : si un citoyen y répond
 *    pendant la démo, un redémarrage du conteneur ne remet pas la demande en attente.
 *
 * Les identifiants d'administration sont les UUID fixes de référence de CLAUDE.md.
 * Lancement manuel : `npm run db:seed`.
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const AMADOU = '784302956148';
const IBRAHIM = '291047583620';
const AWA = '456123789012';
const BANQUE_ATLANTIQUE = { id: '00000000-0000-4000-8000-000000000004', nom: 'Banque Atlantique' };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Règles de minimisation : par démarche et par registre, les champs autorisés.
 * Les noms de champs sont ceux des contrats des registres (docs/openapi-registre-*.yaml).
 */
const RULES = [
  // Inscription universitaire : l'université n'a besoin que de 2 champs.
  { demarche_id: 'inscription-universite', registre: 'etat-civil', champs: ['est_majeur', 'nationalite'] },

  // Émission de passeport : état civil complet + casier et nationalité.
  {
    demarche_id: 'emission-passeport',
    registre: 'etat-civil',
    champs: ['nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe', 'nationalite', 'pere_iue', 'mere_iue'],
  },
  {
    demarche_id: 'emission-passeport',
    registre: 'justice',
    champs: ['casier_vierge', 'est_national', 'mode_acquisition', 'numero_certificat'],
  },

  // Ouverture de compte bancaire (admin privée) : identité minimale + situation fiscale.
  { demarche_id: 'ouverture-compte-bancaire', registre: 'etat-civil', champs: ['nom', 'prenom', 'nationalite'] },
  { demarche_id: 'ouverture-compte-bancaire', registre: 'fiscal', champs: ['en_regle'] },
];

/** Champs demandés par la banque (identiques à la règle de minimisation de la démarche). */
const BANK_FIELDS = [
  { registre: 'etat-civil', champs: ['nom', 'prenom', 'nationalite'] },
  { registre: 'fiscal', champs: ['en_regle'] },
];

/**
 * Construit une demande de démo de la Banque Atlantique.
 * @param {string} id UUID fixe (garantit l'idempotence).
 * @param {object} rest Champs propres à la demande (citoyen, statut, dates…).
 */
function bankRequest(id, rest) {
  return {
    id,
    administration_id: BANQUE_ATLANTIQUE.id,
    administration_nom: BANQUE_ATLANTIQUE.nom,
    demarche_id: 'ouverture-compte-bancaire',
    demarche_nom: 'Ouverture de compte bancaire',
    champs_demandes: BANK_FIELDS,
    ...rest,
  };
}

/**
 * Demandes de démo. Les demandes en attente sont datées du moment du seed
 * pour ne pas être déjà expirées le jour de la démonstration.
 */
function buildConsents(now) {
  return [
    // Déjà acceptée : correspond à l'entrée « consentement » du journal de démo.
    bankRequest('20000000-0000-4000-8000-000000000001', {
      iue_citoyen: AMADOU,
      statut: 'accepte',
      date_creation: new Date('2026-11-09T16:20:00Z'),
      date_expiration: new Date('2026-12-09T16:20:00Z'),
      date_reponse: new Date('2026-11-10T11:04:00Z'),
      decideur_iue: AMADOU,
    }),
    // En attente pour Amadou : apparaît dans son tableau de bord.
    bankRequest('20000000-0000-4000-8000-000000000002', {
      iue_citoyen: AMADOU,
      date_creation: now,
      date_expiration: new Date(now.getTime() + 30 * ONE_DAY_MS),
    }),
    // En attente pour Awa (mineure) : c'est Ibrahim, son tuteur, qui doit répondre.
    bankRequest('20000000-0000-4000-8000-000000000003', {
      iue_citoyen: AWA,
      demarche_nom: 'Ouverture de compte bancaire (compte épargne mineur)',
      date_creation: now,
      date_expiration: new Date(now.getTime() + 30 * ONE_DAY_MS),
    }),
  ];
}

/** Charge les règles puis les demandes de démo. */
async function main() {
  for (const rule of RULES) {
    await prisma.champsDemarche.upsert({
      where: { demarche_id_registre: { demarche_id: rule.demarche_id, registre: rule.registre } },
      update: { champs: rule.champs },
      create: rule,
    });
  }

  const consents = buildConsents(new Date());
  for (const c of consents) {
    await prisma.consentement.upsert({ where: { id: c.id }, update: {}, create: c });
  }
  console.log(`[seed consentement] ${RULES.length} règles de minimisation, ${consents.length} demandes (tuteur de démo : ${IBRAHIM})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
