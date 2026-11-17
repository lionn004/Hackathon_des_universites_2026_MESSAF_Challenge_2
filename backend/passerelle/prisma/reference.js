/**
 * Données de référence de la passerelle (voir CLAUDE.md, « Données de seed »).
 *
 * Partagées par prisma/seed.js (chargement en base) et scripts/jeton-admin.js
 * (génération des jetons de démo), pour n'avoir qu'une seule liste.
 * Les UUID des administrations sont les identifiants fixes communs à tous les services.
 */

/** Administrations publiques et privées. */
const ADMINISTRATIONS = [
  { id: '00000000-0000-4000-8000-000000000001', nom: 'Université Joseph KI-ZERBO', type: 'publique', domaine_mission: 'education' },
  { id: '00000000-0000-4000-8000-000000000002', nom: 'Direction de la police nationale', type: 'publique', domaine_mission: 'securite' },
  { id: '00000000-0000-4000-8000-000000000003', nom: 'Tribunal de Grande Instance de Ouagadougou', type: 'publique', domaine_mission: 'justice' },
  { id: '00000000-0000-4000-8000-000000000004', nom: 'Banque Atlantique', type: 'privee', domaine_mission: 'finance' },
  { id: '00000000-0000-4000-8000-000000000005', nom: 'Orange Money Burkina', type: 'privee', domaine_mission: 'telecoms' },
];

const ETAT_CIVIL_COMPLET = [
  'iue', 'nom', 'prenom', 'date_naissance', 'lieu_naissance', 'sexe', 'nationalite', 'pere_iue', 'mere_iue', 'date_deces', 'est_majeur',
];
const JUSTICE_COMPLET = [
  'casier_vierge', 'condamnations', 'date_delivrance', 'est_national', 'nationalite', 'mode_acquisition', 'date_acquisition', 'numero_certificat',
];

/**
 * Cloisonnement par domaine de mission : ce que chaque domaine PEUT obtenir.
 * Une démarche dont les champs dépassent ce périmètre est refusée (403).
 * Exemple : l'éducation ne voit ni le fiscal ni la justice.
 */
const ACCES_MISSION = [
  { domaine_mission: 'education', registre: 'etat-civil', champs_autorises: ['nom', 'prenom', 'date_naissance', 'est_majeur', 'nationalite'] },
  { domaine_mission: 'securite', registre: 'etat-civil', champs_autorises: ETAT_CIVIL_COMPLET },
  { domaine_mission: 'securite', registre: 'justice', champs_autorises: JUSTICE_COMPLET },
  { domaine_mission: 'justice', registre: 'etat-civil', champs_autorises: ETAT_CIVIL_COMPLET },
  { domaine_mission: 'justice', registre: 'justice', champs_autorises: JUSTICE_COMPLET },
  { domaine_mission: 'finance', registre: 'etat-civil', champs_autorises: ['nom', 'prenom', 'date_naissance', 'nationalite'] },
  { domaine_mission: 'finance', registre: 'fiscal', champs_autorises: ['ifu', 'en_regle'] },
  { domaine_mission: 'telecoms', registre: 'etat-civil', champs_autorises: ['nom', 'prenom', 'date_naissance'] },
];

/** Types de pièces et registre qui les détient. */
const TYPES_PIECES = [
  { id: 'extrait-naissance', nom: 'Extrait de naissance', registre_source: 'etat-civil', est_evolutive: false },
  { id: 'certificat-nationalite', nom: 'Certificat de nationalité', registre_source: 'justice', est_evolutive: false },
  { id: 'casier-judiciaire', nom: 'Casier judiciaire', registre_source: 'justice', est_evolutive: true },
  { id: 'attestation-fiscale', nom: 'Attestation de situation fiscale', registre_source: 'fiscal', est_evolutive: true },
];

/**
 * Arbre de dépendances (CLAUDE.md, « Chaînes de dépendances en cascade ») :
 *   Casier judiciaire → Certificat de nationalité (citoyen)
 *   Certificat de nationalité → Extrait de naissance (citoyen, père, mère)
 */
const PREREQUIS = [
  { type_piece_id: 'casier-judiciaire', prerequis_id: 'certificat-nationalite', proprietaire: 'citoyen' },
  { type_piece_id: 'certificat-nationalite', prerequis_id: 'extrait-naissance', proprietaire: 'citoyen' },
  { type_piece_id: 'certificat-nationalite', prerequis_id: 'extrait-naissance', proprietaire: 'pere' },
  { type_piece_id: 'certificat-nationalite', prerequis_id: 'extrait-naissance', proprietaire: 'mere' },
];

/**
 * Les 3 démarches de bout en bout. Les champs requis ne sont PAS ici : ils
 * appartiennent au service consentement (règles de minimisation).
 */
const DEMARCHES = [
  {
    id: 'inscription-universite',
    nom: 'Inscription universitaire',
    description: 'Inscription dans un établissement d\'enseignement supérieur',
    administration_id: '00000000-0000-4000-8000-000000000001',
    pieces: ['extrait-naissance'],
  },
  {
    id: 'emission-passeport',
    nom: 'Émission de passeport',
    description: 'Délivrance d\'un passeport ordinaire',
    administration_id: '00000000-0000-4000-8000-000000000002',
    pieces: ['extrait-naissance', 'casier-judiciaire'],
  },
  {
    id: 'ouverture-compte-bancaire',
    nom: 'Ouverture de compte bancaire',
    description: 'Ouverture d\'un compte courant ou épargne',
    administration_id: '00000000-0000-4000-8000-000000000004',
    pieces: ['extrait-naissance', 'attestation-fiscale'],
  },
];

module.exports = { ADMINISTRATIONS, ACCES_MISSION, TYPES_PIECES, PREREQUIS, DEMARCHES };
