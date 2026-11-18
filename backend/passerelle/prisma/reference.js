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

/**
 * Types de pièces et registre qui les détient.
 * `demarche_si_absente` : démarche à suivre quand la pièce n'est pas encore dans le registre
 * numérique (donnée numérique manquante). La plateforme se contente d'en informer le citoyen :
 * elle ne recueille aucune information pour l'orienter. Le texte est neutre (« la personne
 * concernée ») car la pièce manquante peut être celle d'un parent.
 */
const TYPES_PIECES = [
  {
    id: 'extrait-naissance', nom: 'Extrait de naissance', registre_source: 'etat-civil', est_evolutive: false,
    demarche_si_absente: 'Demander au centre d\'état civil du lieu de naissance de la personne concernée de numériser '
      + 'son acte de naissance. Si la naissance n\'a jamais été déclarée, un jugement supplétif doit d\'abord être '
      + 'obtenu auprès du tribunal.',
  },
  {
    id: 'certificat-nationalite', nom: 'Certificat de nationalité', registre_source: 'justice', est_evolutive: false,
    demarche_si_absente: 'S\'adresser au greffe du tribunal qui a délivré le certificat de nationalité, pour qu\'il '
      + 'l\'enregistre dans le registre numérique.',
  },
  {
    id: 'casier-judiciaire', nom: 'Casier judiciaire', registre_source: 'justice', est_evolutive: true,
    demarche_si_absente: 'S\'adresser au greffe du tribunal de grande instance du lieu de naissance de la personne '
      + 'concernée.',
  },
  {
    id: 'attestation-fiscale', nom: 'Attestation de situation fiscale', registre_source: 'fiscal', est_evolutive: true,
    demarche_si_absente: 'S\'adresser au centre des impôts dont relève la personne concernée.',
  },
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
 * Fondements possibles de la base légale d'une démarche (liste fermée, vérifiée au démarrage).
 * Une démarche est une FINALITÉ déclarée, à l'initiative du citoyen ou de l'administration :
 * elle dit pourquoi une administration a besoin de données, et sur quel fondement.
 */
const FONDEMENTS = {
  mission_service_public: 'Mission de service public',
  obligation_legale: 'Obligation légale',
  execution_contrat: 'Exécution d\'un contrat demandé par la personne',
  consentement: 'Consentement',
};

/** Texte et formalité CIL : à fournir par l'administration ; aucun numéro n'est inventé. */
const A_PRECISER = 'À préciser par l\'administration';
const A_RENSEIGNER = 'À renseigner (formalité auprès de la CIL)';

/**
 * Les 3 démarches de bout en bout. Les champs requis ne sont PAS ici : ils
 * appartiennent au service consentement (règles de minimisation).
 *
 * Base légale : déclarée par l'administration qui porte la démarche et validée par le
 * gestionnaire du catalogue (en production, avec l'avis de la CIL). La qualification
 * ci-dessous est celle de la démonstration, à valider par un juriste.
 * Pour une entité privée, l'accord du citoyen reste exigé avant toute transmission, quel
 * que soit son fondement : il autorise le PARTAGE des données de l'État, à côté de la
 * base légale du traitement par l'entité (ex : obligation de vérification d'identité).
 */
const DEMARCHES = [
  {
    id: 'inscription-universite',
    nom: 'Inscription universitaire',
    description: 'Inscription dans un établissement d\'enseignement supérieur',
    administration_id: '00000000-0000-4000-8000-000000000001',
    base_fondement: 'mission_service_public',
    base_finalite: 'Vérifier les conditions d\'inscription dans l\'enseignement supérieur (majorité, nationalité)',
    base_texte: A_PRECISER,
    base_reference_cil: A_RENSEIGNER,
    pieces: ['extrait-naissance'],
  },
  {
    id: 'emission-passeport',
    nom: 'Émission de passeport',
    description: 'Délivrance d\'un passeport ordinaire',
    administration_id: '00000000-0000-4000-8000-000000000002',
    base_fondement: 'obligation_legale',
    base_finalite: 'Établir l\'identité et la nationalité du demandeur avant la délivrance d\'un passeport',
    base_texte: A_PRECISER,
    base_reference_cil: A_RENSEIGNER,
    pieces: ['extrait-naissance', 'casier-judiciaire'],
  },
  {
    id: 'ouverture-compte-bancaire',
    nom: 'Ouverture de compte bancaire',
    description: 'Ouverture d\'un compte courant ou épargne',
    administration_id: '00000000-0000-4000-8000-000000000004',
    base_fondement: 'obligation_legale',
    base_finalite: 'Vérifier l\'identité du client avant l\'ouverture du compte (obligations de vigilance contre le blanchiment)',
    base_texte: A_PRECISER,
    base_reference_cil: A_RENSEIGNER,
    pieces: ['extrait-naissance', 'attestation-fiscale'],
  },
];

module.exports = {
  ADMINISTRATIONS, ACCES_MISSION, TYPES_PIECES, PREREQUIS, DEMARCHES, FONDEMENTS,
};
