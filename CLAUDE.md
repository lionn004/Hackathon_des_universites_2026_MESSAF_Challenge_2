# DLNUF — Dites-le-nous une fois

## Contexte

Projet développé dans le cadre du **Hackathon des Universités 2026**, organisé par le MTDPCE (Ministère de la Transition Digitale, des Postes et des Communications Électroniques) du Burkina Faso pendant la Semaine du Numérique.

**Challenge 02 : « Dites-le-nous une fois »** — Construire un cadre d'interopérabilité ouvert (« bien commun ») permettant aux administrations de partager les données des citoyens entre elles, au lieu d'exiger que les citoyens transportent des documents d'un guichet à l'autre.

### Principe fondamental

Le citoyen fournit ses informations **une seule fois**. Les administrations s'échangent les données nécessaires via la plateforme, avec gestion du consentement, minimisation des données et traçabilité complète.

### Livrables attendus

- Code source open-source, licence libre
- Déploiement en **une seule commande** (Docker Compose)
- Spécifications **OpenAPI** pour chaque couche
- **3 procédures de bout en bout** (ex : inscription universitaire, demande de passeport, ouverture de compte bancaire)
- Rapport technique
- Vidéo de démonstration de 3 minutes
- Matrice de contribution par membre et par couche

### Test d'interopérabilité

Le jury remplacera un registre d'une équipe par celui d'une autre équipe pour vérifier que les contrats API standardisés sont respectés. Les contrats des registres doivent donc être strictement suivis.

---

## Architecture imposée — 5 couches

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND REACT                        │
│                  (Espace Usager)                         │
└──────────────────────┬──────────────────────────────────┘
                       │  port 3000 (BFF)
                       ▼
              ┌─────────────────┐
              │   BFF :3000     │
              │ (Espace Usager  │
              │   Backend)      │
              └────────┬────────┘
                       │
          ┌────────────┼────────────┬──────────────┐
          ▼            ▼            ▼              ▼
   ┌────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Passerelle │ │Consente- │ │ Journal  │ │ Registres│
   │   :3004    │ │ment :3005│ │  :3006   │ │          │
   └─────┬──────┘ └──────────┘ └──────────┘ │ EC :3001 │
         │                                   │ JU :3002 │
         └───────────────────────────────────│ FI :3003 │
              interroge les registres        └──────────┘
```

### Couche 1 — Registres (3 API simulées)

Bases de données simulées d'administrations existantes. Chaque registre est un service indépendant avec sa propre API OpenAPI.

| Registre | Port | Données |
|----------|------|---------|
| État-civil | 3001 | Naissance, filiation, nationalité, décès |
| Justice | 3002 | Casier judiciaire, certificat de nationalité |
| Fiscal | 3003 | IFU, situation fiscale, régime |

**Important** : Les registres exposent des **données structurées** (JSON), jamais des documents PDF. Un « extrait de naissance » sur la plateforme, c'est les champs structurés du registre état-civil, pas un PDF.

### Couche 2 — Passerelle d'échange (port 3004)

Point central qui route les requêtes entre administrations et registres. Responsabilités :

- Recevoir une requête d'une administration (publique ou privée) pour une démarche
- Résoudre les **chaînes de dépendances en cascade** (voir section dédiée)
- Appeler le service de minimisation pour filtrer les champs
- Déclencher une demande de consentement si administration privée
- Appeler le journal pour tracer l'accès
- Retourner les données filtrées

### Couche 3 — Consentement & Minimisation (port 3005)

**Minimisation** : Un seul mécanisme — chaque démarche déclare la liste des champs dont elle a besoin par registre. Le filtre laisse passer uniquement ces champs, rien de plus. Pas de « mode minimisé » vs « mode complet », juste un filtre plus ou moins large selon la démarche.

Exemples :
```
Démarche "inscription université"
  → registre état-civil : [est_majeur, nationalite]        ← 2 champs

Démarche "émission passeport"
  → registre état-civil : [nom, prenom, date_naissance,
     lieu_naissance, sexe, pere, mere, nationalite]         ← tous les champs
```

**Consentement** — Deux régimes selon le type d'administration :

| Type | Accès | Consentement | Justification |
|------|-------|-------------|---------------|
| Administration publique | Direct | Notification au citoyen (après coup) | Les données sont sur des serveurs publics, les lois en vigueur autorisent l'échange |
| Administration privée | Sur autorisation | Consentement **explicite** requis avant transmission | Entité privée = pas de droit d'accès automatique |

**Cloisonnement par domaine de mission** : Une administration publique ne voit que les données liées à sa mission. L'éducation ne voit pas le fiscal, la justice ne voit pas le médical, etc. Implémenté via la table `AccesMission`.

**Flux de consentement pour admin privée** :
1. L'admin privée envoie une requête à la passerelle
2. La couche consentement détecte admin privée → crée une demande en attente
3. Notification plateforme + SMS envoyés au citoyen
4. Le citoyen se connecte à son espace, voit la demande, accepte ou refuse
5. Si accepté → données transmises + journal enregistré. Si refusé → refus transmis + journal enregistré
6. Rappels SMS automatiques à 24h et 72h si pas de réponse
7. Expiration après 30 jours
8. Si la demande tarde trop, l'administration peut consulter le **numéro de téléphone** du citoyen via la passerelle et l'appeler directement

### Couche 4 — Journal de traçabilité (port 3006)

Enregistre **chaque accès** aux données d'un citoyen :
- Qui a accédé (quelle administration)
- À quelles données (quels champs de quel registre)
- Pour quelle démarche
- Quand
- Type d'accès (direct pour admin publique, consentement pour admin privée)
- **Double traçabilité** : `titulaire_id` (propriétaire des données) + `decideur_id` (qui a autorisé). Pour les adultes c'est la même personne. Pour les mineurs, le titulaire est l'enfant et le décideur est le tuteur.

Le citoyen peut consulter tout son journal depuis son espace usager.

### Couche 5 — Espace usager (Frontend HTML/CSS/JS + BFF port 3000)

Portail web du citoyen. Fonctionnalités :

- **Authentification** : IUE (12 chiffres) + mot de passe. Récupération par SMS.
- **Tableau de bord** : compteur de consentements en attente, demandes en cours, accès récents, alertes
- **Consentements** : voir et répondre (accepter/refuser) aux demandes d'autorisation des admins privées
- **Demandes de pièces** : le citoyen peut demander une pièce, la cascade de dépendances se résout automatiquement
- **Journal** : consulter l'historique complet de qui a accédé à ses données
- **Enfants** : gestion des comptes enfants rattachés (tuteur)
- **Transfert de compte** : recommandation à 15 ans de transférer le contrôle à l'enfant

### Interface de test (pour démo et jury)

Interface minimale pour simuler des requêtes comme si elles venaient d'une administration (publique ou privée). Pas une vraie interface agent — chaque ministère/entreprise construit la sienne et se connecte via l'API. Cette interface sert uniquement pour la démo et les tests.

---

## Modèle de données

### Tables principales

```sql
-- Compte citoyen sur la plateforme
Citoyen {
  id              UUID PRIMARY KEY
  iue             VARCHAR(12) UNIQUE NOT NULL  -- 12 chiffres aléatoires
  mot_de_passe    VARCHAR NOT NULL             -- hashé avec bcrypt
  telephone       VARCHAR NOT NULL
  tuteur_id       UUID REFERENCES Citoyen(id)  -- NULL si adulte
  date_inscription TIMESTAMP
}

-- Liens de filiation biologique
LienParente {
  id              UUID PRIMARY KEY
  enfant_id       UUID REFERENCES Citoyen(id)
  parent_id       UUID REFERENCES Citoyen(id)
  type_lien       ENUM('pere', 'mere')
}

-- Administrations (publiques et privées)
Administration {
  id              UUID PRIMARY KEY
  nom             VARCHAR NOT NULL
  type            ENUM('publique', 'privee')
  domaine_mission VARCHAR NOT NULL  -- ex: 'education', 'justice', 'finance', 'sante'
}

-- Catalogue des types de pièces
TypePiece {
  id              VARCHAR PRIMARY KEY  -- ex: 'casier-judiciaire'
  nom             VARCHAR NOT NULL
  registre_source VARCHAR NOT NULL     -- ex: 'etat-civil', 'justice', 'fiscal'
  est_evolutive   BOOLEAN DEFAULT false -- true si la pièce peut changer (casier, fiscal)
}

-- Arbre de dépendances entre pièces
PrerequisPiece {
  id              UUID PRIMARY KEY
  type_piece_id   VARCHAR REFERENCES TypePiece(id)   -- la pièce qui a besoin du prérequis
  prerequis_id    VARCHAR REFERENCES TypePiece(id)    -- la pièce prérequise
  proprietaire    ENUM('citoyen', 'pere', 'mere')     -- à qui appartient le prérequis
}

-- Catalogue des démarches
Demarche {
  id              VARCHAR PRIMARY KEY  -- ex: 'inscription-universite'
  nom             VARCHAR NOT NULL
  description     TEXT
  administration_id UUID REFERENCES Administration(id)
}

-- Champs requis par démarche et par registre (pour la minimisation)
DemarcheChamps {
  id              UUID PRIMARY KEY
  demarche_id     VARCHAR REFERENCES Demarche(id)
  registre        VARCHAR NOT NULL     -- ex: 'etat-civil'
  champs          TEXT[] NOT NULL       -- ex: ['est_majeur', 'nationalite']
}

-- Demandes de pièces par le citoyen
Demande {
  id              UUID PRIMARY KEY
  citoyen_id      UUID REFERENCES Citoyen(id)
  type_piece_id   VARCHAR REFERENCES TypePiece(id)
  statut          ENUM('en_cours', 'complete', 'echouee', 'fallback_physique')
  demande_parente_id UUID REFERENCES Demande(id)  -- chaînage cascade
  date_creation   TIMESTAMP
  date_completion TIMESTAMP
}

-- Prérequis résolus pour chaque demande
DemandePrerequis {
  id              UUID PRIMARY KEY
  demande_id      UUID REFERENCES Demande(id)
  prerequis_piece_id VARCHAR REFERENCES TypePiece(id)
  proprietaire    ENUM('citoyen', 'pere', 'mere')
  statut          ENUM('resolu', 'en_cours', 'manquant')
}

-- Consentements (admin privée uniquement)
Consentement {
  id              UUID PRIMARY KEY
  iue_citoyen     VARCHAR(12) NOT NULL
  administration_id UUID REFERENCES Administration(id)
  demarche_id     VARCHAR REFERENCES Demarche(id)
  requete_id      UUID          -- référence vers la requête passerelle
  champs_demandes JSONB         -- ex: [{"registre": "etat-civil", "champs": ["nom", "nationalite"]}]
  statut          ENUM('en_attente', 'accepte', 'refuse', 'expire')
  date_creation   TIMESTAMP
  date_expiration TIMESTAMP     -- date_creation + 30 jours
  date_reponse    TIMESTAMP
}

-- Journal de traçabilité
JournalAcces {
  id              UUID PRIMARY KEY
  titulaire_iue   VARCHAR(12) NOT NULL   -- propriétaire des données
  decideur_iue    VARCHAR(12) NOT NULL   -- qui a autorisé (= titulaire sauf mineurs)
  administration_id UUID REFERENCES Administration(id)
  demarche_id     VARCHAR
  requete_id      UUID
  registres_consultes TEXT[]    -- ex: ['etat-civil', 'justice']
  champs_transmis TEXT[]        -- ex: ['est_majeur', 'nationalite']
  type_acces      ENUM('direct', 'consentement')
  date_acces      TIMESTAMP
}

-- Cloisonnement par domaine de mission
AccesMission {
  id              UUID PRIMARY KEY
  domaine_mission VARCHAR NOT NULL   -- ex: 'education'
  registre        VARCHAR NOT NULL   -- ex: 'etat-civil'
  champs_autorises TEXT[]            -- champs accessibles pour ce domaine
}
```

---

## Règles métier clés

### IUE (Identifiant Unique Électronique)

- Format : **12 chiffres aléatoires** (ex : `784302956148`)
- Lié au IUCEC (état civil), NIP (CNIB) et IFU (fiscal) dans la vraie vie
- Sert d'identifiant de connexion à la plateforme
- Loi adoptée en octobre 2024 au Burkina Faso

### Chaînes de dépendances en cascade

Quand un citoyen demande une pièce, la passerelle résout automatiquement l'arbre de prérequis.

**Exemple concret — Amadou demande un casier judiciaire** :

```
Casier judiciaire (Amadou)
  └── Certificat de nationalité (Amadou)
       ├── Extrait de naissance (Amadou)
       ├── Extrait de naissance (Père d'Amadou)
       └── Extrait de naissance (Mère d'Amadou)
```

La passerelle :
1. Détecte que le casier nécessite un certificat de nationalité
2. Détecte que le certificat nécessite 3 extraits de naissance
3. Cherche les IUE des parents via les liens de filiation
4. Interroge le registre état-civil pour chaque personne
5. Si un parent n'est pas dans le système → statut `fallback_physique` pour ce prérequis

### Fallback physique

Si les parents d'un citoyen ne sont pas enregistrés dans le système (pas d'IUE) :
- Le prérequis est marqué `manquant`
- Le citoyen est invité à se rendre physiquement au guichet avec les documents de ses parents
- L'agent scanne/saisit les informations manquantes
- La chaîne reprend automatiquement

### Gestion des mineurs

- Un enfant est rattaché à un tuteur (via `tuteur_id` dans Citoyen)
- Le tuteur administre l'espace de l'enfant
- La plateforme détecte automatiquement les mineurs via VENEEM (registre des naissances)
- À **15 ans**, le système recommande au tuteur de transférer le contrôle du compte à l'enfant
- Le journal enregistre `titulaire = enfant` et `decideur = tuteur` pour toute action du tuteur

### Numéro de téléphone

- Stocké dans la table Citoyen (donnée de compte, pas donnée administrative)
- Utilisé pour : récupération de mot de passe, notifications SMS de consentement, rappels
- **Accessible aux administrations** via la passerelle pour relancer les citoyens qui tardent à répondre aux demandes de consentement

---

## Stack technique

- **Backend** : Node.js + Express.js
- **Frontend** : HTML / CSS / JavaScript (vanilla, sans framework)
- **Base de données** : PostgreSQL
- **ORM** : Prisma
- **Authentification** : JWT + bcrypt
- **Déploiement** : Docker Compose
- **Documentation API** : OpenAPI 3.0 / Swagger

---

## Structure du projet

```
/
├── CLAUDE.md                    ← ce fichier
├── docker-compose.yml           ← PostgreSQL + tous les services, une seule commande
├── docs/                        ← Spécifications OpenAPI (source de vérité)
│   ├── openapi-espace-usager.yaml      (BFF :3000)
│   ├── openapi-passerelle.yaml         (:3004)
│   ├── openapi-consentement.yaml       (:3005)
│   ├── openapi-journal.yaml            (:3006)
│   ├── openapi-registre-etat-civil.yaml (:3001)
│   ├── openapi-registre-justice.yaml    (:3002)
│   └── openapi-registre-fiscal.yaml     (:3003)
├── backend/                     ← tous les services Node/Express
│   ├── registres/
│   │   ├── etat-civil/          ← Service registre état-civil (gabarit de référence)
│   │   ├── justice/             ← Service registre justice
│   │   └── fiscal/              ← Service registre fiscal
│   ├── passerelle/              ← Service passerelle d'échange
│   ├── consentement/            ← Service consentement & minimisation
│   ├── journal/                 ← Service journal de traçabilité
│   └── espace-usager/           ← BFF (Backend for Frontend) :3000
└── frontend/                    ← Espace usager HTML/CSS/JS + interface de test
```

Séparation des équipes : `frontend/` ne parle qu'au BFF (`http://localhost:3000/api`, contrat `docs/openapi-espace-usager.yaml`) et ne dépend d'aucun fichier de `backend/`. Le backend ne modifie pas `frontend/`.

### Structure interne d'un service (architecture en couches)

Chaque service est une application Express autonome (son propre `package.json`, `Dockerfile`, `prisma/schema.prisma`) :

```
<service>/
├── Dockerfile
├── package.json
├── .env.example
├── prisma/
│   ├── schema.prisma            ← uniquement les tables de CE service
│   └── seed.js                  ← données de démo de CE service (idempotent, upsert)
└── src/
    ├── server.js                ← app.listen
    ├── app.js                   ← création de l'app Express, montage des routes sous /api, errorHandler
    ├── config/                  ← lecture des variables d'environnement
    ├── routes/                  ← URL + verbe → controller (+ middlewares auth/validation)
    ├── controllers/             ← lit req, appelle un service, choisit le code HTTP, renvoie res. Aucune logique métier.
    ├── services/                ← logique métier. Ne connaît ni req ni res.
    ├── models/                  ← accès aux données via Prisma (prisma.js = instance unique). Aucune règle métier.
    ├── clients/                 ← appels HTTP vers d'autres services (passerelle et BFF uniquement)
    ├── middlewares/             ← auth JWT, errorHandler, validation
    └── utils/                   ← AppError, helpers
```

Règle : chaque couche n'appelle que la couche immédiatement inférieure (routes → controllers → services → models/clients). Les erreurs métier sont levées avec `AppError(statut, code, message)` et converties en `{ code, message }` par `errorHandler`.

Les petits utilitaires (`AppError`, `errorHandler`) sont dupliqués dans chaque service plutôt que partagés, pour que chaque service se construise seul (contexte Docker indépendant) et qu'un registre reste remplaçable.

---

## 3 procédures de bout en bout

### 1. Inscription universitaire (admin publique)

**Administration** : Université Joseph KI-ZERBO (publique, domaine : education)
**Champs nécessaires** : `est_majeur`, `nationalite` (registre état-civil)
**Flux** :
1. L'université fait une requête via la passerelle pour le citoyen X
2. Passerelle vérifie : admin publique + domaine education → accès direct
3. Minimisation : seuls `est_majeur` et `nationalite` sont transmis
4. Journal enregistre l'accès
5. Notification envoyée au citoyen : "L'Université a consulté vos données pour votre inscription"
6. Résultat retourné : `{ "est_majeur": true, "nationalite": "Burkinabè" }`

### 2. Demande de passeport (admin publique, avec cascade)

**Administration** : Direction de la police nationale (publique, domaine : securite)
**Champs nécessaires** : tous les champs état-civil + casier judiciaire + certificat de nationalité
**Flux** :
1. Requête pour le citoyen X → démarche "émission passeport"
2. Passerelle détecte les prérequis : casier + nationalité + état civil complet
3. Cascade : nationalité nécessite extraits de naissance (citoyen + parents)
4. Résolution via liens de filiation → interrogation registres
5. Minimisation : tous les champs transmis (démarche passeport = accès complet)
6. Journal enregistre
7. Résultat retourné avec données complètes de tous les registres

### 3. Ouverture de compte bancaire (admin privée, consentement)

**Administration** : Banque Atlantique (privée, domaine : finance)
**Champs nécessaires** : `nom`, `prenom`, `nationalite` (état-civil) + `en_regle` (fiscal)
**Flux** :
1. La banque fait une requête via la passerelle
2. Passerelle détecte : admin privée → consentement requis
3. Demande de consentement créée + notification plateforme + SMS
4. Statut retourné : `en_attente_consentement`
5. Le citoyen se connecte, voit la demande : "Banque Atlantique demande nom, prénom, nationalité, situation fiscale pour ouverture de compte"
6. Le citoyen accepte
7. Données filtrées transmises à la banque
8. Journal enregistre avec `type_acces = 'consentement'`

---

## Données de seed (test)

Préparer les données suivantes pour le développement et la démo :

### Citoyens
- **Amadou OUEDRAOGO** (IUE: 784302956148) — citoyen principal pour la démo, majeur
- **Ibrahim OUEDRAOGO** (IUE: 291047583620) — père d'Amadou
- **Fatimata SAWADOGO** (IUE: 638501274093) — mère d'Amadou
- **Awa OUEDRAOGO** (IUE: 456123789012) — sœur d'Amadou, mineure (12 ans), tuteur = Ibrahim

### Administrations

UUID fixes de référence : tous les services (passerelle, consentement, journal) doivent utiliser exactement ces identifiants dans leurs seeds.

| UUID | Nom | Type | Domaine |
|------|-----|------|---------|
| `00000000-0000-4000-8000-000000000001` | Université Joseph KI-ZERBO | publique | education |
| `00000000-0000-4000-8000-000000000002` | Direction de la police nationale | publique | securite |
| `00000000-0000-4000-8000-000000000003` | Tribunal de Grande Instance de Ouagadougou | publique | justice |
| `00000000-0000-4000-8000-000000000004` | Banque Atlantique | privee | finance |
| `00000000-0000-4000-8000-000000000005` | Orange Money Burkina | privee | telecoms |

### Types de pièces et prérequis
- Extrait de naissance → aucun prérequis
- Certificat de nationalité → extrait naissance (citoyen) + extrait naissance (père) + extrait naissance (mère)
- Casier judiciaire → certificat de nationalité
- Attestation fiscale → aucun prérequis

### Démarches
- Inscription universitaire (Université) → état-civil: [est_majeur, nationalite]
- Émission de passeport (Police) → état-civil: [tous], justice: [casier, nationalité]
- Ouverture de compte bancaire (Banque) → état-civil: [nom, prenom, nationalite], fiscal: [en_regle]

---

## Workflow Git

- Jamais de commit direct sur `main` : une branche courte par fonctionnalité (`backend/<fonctionnalite>`, `frontend/<fonctionnalite>`), fusionnée via une **Pull Request** GitHub.
- `main` doit toujours démarrer avec `docker compose up`.
- Message de commit : `Prénom: description en français` (ex : `Axel: registre état-civil — routes et seed`).
- Avant de pousser : `git pull --rebase origin main`, vérifier que tout démarre.
- Les contrats `docs/*.yaml` sont l'interface frontend/backend : prévenir l'autre équipe avant de les modifier.

## Conventions de code

- **Commentaires obligatoires, en français** — le code doit toujours être bien commenté :
  - un en-tête par fichier (rôle du fichier, couche concernée) ;
  - un bloc JSDoc par fonction exportée (ce qu'elle fait, `@param`, `@returns`, erreurs levées) ;
  - un commentaire sur toute logique non évidente (règle métier, écart au contrat, contrainte d'ordre).
- **Langue du code** : anglais (noms de variables, fonctions)
- **Routes et champs JSON** : en français, exactement comme dans les contrats `docs/*.yaml` (obligatoire pour l'interopérabilité). Les fichiers sont nommés d'après la ressource du contrat (`citoyens.routes.js`, `requetes.controller.js`).
- **Langue des données** : français (noms des administrations, messages d'erreur, etc.)
- **API** : REST, préfixe `/api/`
- **Auth** : JWT Bearer token dans header `Authorization`. Jetons citoyens émis par le BFF, signés en **HS256** avec le secret partagé `JWT_SECRET` (même valeur dans tous les services, fournie par docker-compose). Contenu minimal du jeton citoyen : `{ "iue": "<12 chiffres>" }`. Les routes internes (ex : `POST /journal/enregistrer`, appelée par la passerelle) n'ont pas de JWT, conformément aux contrats.
- **Journal** : en ajout seul, aucune entrée n'est modifiée ni supprimée. La passerelle envoie, en plus des identifiants, une photo figée des noms (`administration_nom`, `administration_type`, `demarche_nom`).
- **Erreurs** : Format uniforme `{ code: "STRING_CONSTANTE", message: "Message lisible" }`
- **Pagination** : `{ page, limite, total, pages }`
- **IDs** : UUID v4 pour les IDs internes, 12 chiffres pour les IUE
- **Dates** : ISO 8601
- **ORM** : Prisma 6 (version figée `6.19.3`) — **un `schema.prisma` par service**. Tous les services partagent la même instance PostgreSQL mais chacun a son propre schéma PostgreSQL via `DATABASE_URL=...?schema=<service>` (ex : `etat_civil`, `journal`). Aucun service ne lit les tables d'un autre : il passe par son API.
- **IUE** : 12 chiffres (`^[0-9]{12}$`). Aucun autre format.
