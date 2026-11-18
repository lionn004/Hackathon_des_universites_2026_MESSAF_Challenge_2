# DLNUF (Dites-le-nous une fois)

## Contexte

Projet développé dans le cadre du **Hackathon des Universités 2026**, organisé par le MTDPCE (Ministère de la Transition Digitale, des Postes et des Communications Électroniques) du Burkina Faso pendant la Semaine du Numérique.

**Challenge 02 : « Dites-le-nous une fois ».** Construire un cadre d'interopérabilité ouvert (« bien commun ») permettant aux administrations de partager les données des citoyens entre elles, au lieu d'exiger que les citoyens transportent des documents d'un guichet à l'autre.

### Principe fondamental

Le citoyen fournit ses informations **une seule fois**. Les administrations s'échangent les données nécessaires via la plateforme, avec gestion du consentement, minimisation des données et traçabilité complète.

**Noms** : **DLNUF** est le socle d'interopérabilité, c'est-à-dire l'API centrale que les administrations appellent (passerelle, consentement, journal, branchement des registres) ; on parle de « l'API DLNUF » ou de « la passerelle DLNUF ». **e-FASO** est le portail du citoyen (le frontend), une application construite sur DLNUF. Pas d'autre nom.

### Livrables attendus

- Code source open-source, licence libre
- Déploiement en **une seule commande** (Docker Compose)
- Spécifications **OpenAPI** pour chaque couche
- **3 procédures de bout en bout** (ex : inscription universitaire, demande de passeport, ouverture de compte bancaire)
- Rapport technique
- Vidéo de démonstration de 3 minutes
- Matrice de contribution par membre et par couche

### Énoncé officiel et épreuve en direct

Texte officiel du challenge :
- **Objectif** : « Faire circuler les pièces entre administrations plutôt que les usagers entre les guichets, dans le respect de leurs droits sur leurs données. »
- **Données** : « Registres simulés fournis par le jury (état civil, nationalité, casier), peuplés de citoyens fictifs. »
- **Épreuve en direct** : « Ne transmettre que l'utile (« majeur : oui »), montrer à l'usager qui a consulté ses données, et tenir quand un registre tombe en panne. »
- **Bien commun** : « Un socle d'interopérabilité libre, avec ses règles de consentement et de traçabilité, réutilisable par l'administration. »

Le format des registres du jury n'est pas connu à l'avance. La plateforme se branche donc sur **n'importe quel registre par configuration** (dictionnaire des données et catalogue des registres), calcule elle-même les données dérivées (« majeur : oui ») et **tient quand un registre tombe** (mise en attente puis complétion automatique). Conception de référence : `docs/conception-interoperabilite.md`. Test qui rejoue tout : `node tests/interoperabilite/test-interop.js`.

## Acteurs du système

### Acteurs actuels (MVP hackathon)

**Citoyens** (comptes de démo, détail dans « Données de seed »)

| Citoyen | IUE | Rôle dans la démo | Mot de passe |
|---------|-----|-------------------|--------------|
| OUEDRAOGO Amadou | 784302956148 | majeur, fils d'Ibrahim et de Fatimata | `Amadou2026!` |
| OUEDRAOGO Ibrahim | 291047583620 | père d'Amadou, Awa et Moussa, tuteur d'Awa et de Moussa | `Ibrahim2026!` |
| SAWADOGO Fatimata | 638501274093 | mère d'Amadou, Awa et Moussa | `Fatimata2026!` |
| OUEDRAOGO Awa | 456123789012 | mineure (née en 2014), sous tutelle d'Ibrahim | aucun, compte géré par le tuteur |
| OUEDRAOGO Moussa | 527814903361 | mineur (né en 2010), sous tutelle d'Ibrahim, transfert de compte recommandé | aucun, compte géré par le tuteur |
| OUEDRAOGO Salif | 316580942751 | majeur, présent dans les registres, sans compte (démo de l'inscription) | aucun |
| OUEDRAOGO Aïcha | 873045129604 | fille de Salif (née en 2021), rattachée à Salif à son inscription | aucun |

Mots de passe de démonstration uniquement.

**Administrations**

| Administration | Type | Domaine |
|----------------|------|---------|
| Université Joseph KI-ZERBO | publique | éducation |
| Direction de la police nationale | publique | sécurité |
| Tribunal de Grande Instance de Ouagadougou | publique | justice |
| Banque Atlantique | privée | finance |
| Orange Money Burkina | privée | télécoms |

Règle : une administration publique accède aux données avec simple notification au citoyen ; une administration privée a besoin de son consentement explicite (voir « Couche 3 »).

**Interface de test** (`frontend/pages/test.html`)

Simule le rôle d'une administration pour la démo et le jury. Il n'y a pas d'authentification d'administration : les routes `/api/test/*` du BFF fabriquent elles-mêmes le jeton de l'administration choisie. C'est une simulation, à désactiver en production (`INTERFACE_TEST_ACTIVE=false`).

---

## Architecture imposée en 5 couches

```
┌─────────────────────────────────────────────────────────┐
│              FRONTEND HTML / CSS / JS                    │
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

### Couche 1 : registres (3 API simulées)

Bases de données simulées d'administrations existantes. Chaque registre est un service indépendant avec sa propre API OpenAPI.

| Registre | Port | Données |
|----------|------|---------|
| État-civil | 3001 | Naissance, filiation, nationalité, décès |
| Justice | 3002 | Casier judiciaire, certificat de nationalité |
| Fiscal | 3003 | IFU, situation fiscale, régime |

**Important** : Les registres exposent des **données structurées** (JSON), jamais des documents PDF. Un « extrait de naissance » sur la plateforme, c'est les champs structurés du registre état-civil, pas un PDF.

Nos trois registres suivent le **format recommandé** (`docs/openapi-registre-*.yaml`) et se branchent sans correspondance. Un registre d'un autre format (ceux du jury) se branche en le décrivant dans le catalogue de la passerelle (`backend/passerelle/config/catalogue-registres.yaml`), jamais en modifiant le code.

### Couche 2 : passerelle d'échange (port 3004)

Point central qui route les requêtes entre administrations et registres. Il sait où aller chercher chaque donnée grâce au **catalogue des registres** et traduit chaque registre vers le **dictionnaire des données** (`backend/passerelle/config/`). Responsabilités :

- Recevoir une requête d'une administration (publique ou privée) pour une démarche
- Résoudre les **chaînes de dépendances en cascade** (voir section dédiée)
- Appeler le service de minimisation pour filtrer les champs
- Déclencher une demande de consentement si administration privée
- Appeler le journal pour tracer l'accès
- Retourner les données filtrées, **une seule fois et sans en garder de copie** (remise unique) : réponse 200 du `POST /requetes` pour une administration publique, première consultation de `GET /requetes/{id}` après l'acceptation pour une privée. Ensuite `donnees` vaut `null` et seule la trace reste au journal.
- Calculer les données dérivées (`est_majeur` à partir de `date_naissance`) : seule la donnée calculée sort.
- **Tenir** : un registre hors service est contourné (sonde toutes les 5 s, sources de secours) ; une requête qui en dépend passe `en_attente_registre` (tout ou rien, rien n'est transmis ni copié) et se complète à une consultation suivante, sans nouvelle demande.

### Couche 3 : consentement et minimisation (port 3005)

**Minimisation** : un seul mécanisme. Chaque démarche déclare la liste des champs dont elle a besoin par registre. Le filtre laisse passer uniquement ces champs, rien de plus. Pas de « mode minimisé » vs « mode complet », juste un filtre plus ou moins large selon la démarche.

Exemples :
```
Démarche "inscription université"
  registre état-civil : [est_majeur, nationalite]           (2 champs)

Démarche "émission passeport"
  registre état-civil : [nom, prenom, date_naissance,
    lieu_naissance, sexe, pere_iue, mere_iue, nationalite]  (tous les champs)
```

**Consentement** : deux régimes selon le type d'administration.

| Type | Accès | Consentement | Justification |
|------|-------|-------------|---------------|
| Administration publique | Direct | Notification au citoyen (après coup) | Les données sont sur des serveurs publics, les lois en vigueur autorisent l'échange |
| Administration privée | Sur autorisation | Consentement **explicite** requis avant transmission | Entité privée = pas de droit d'accès automatique |

**Cloisonnement par domaine de mission** : Une administration publique ne voit que les données liées à sa mission. L'éducation ne voit pas le fiscal, la justice ne voit pas le médical, etc. Implémenté via la table `AccesMission`.

**Flux de consentement pour admin privée** :
1. L'admin privée envoie une requête à la passerelle
2. La couche consentement détecte une admin privée et crée une demande en attente
3. Notification plateforme + SMS envoyés au citoyen
4. Le citoyen se connecte à son espace, voit la demande, accepte ou refuse
5. Si la demande est acceptée, les données sont transmises et le journal enregistre l'accès. Si elle est refusée, le refus est transmis et le journal l'enregistre aussi
6. Rappels SMS automatiques à 24h et 72h si pas de réponse
7. Expiration après 30 jours
8. Si la demande tarde trop, l'administration peut consulter le **numéro de téléphone** du citoyen via la passerelle et l'appeler directement

### Couche 4 : journal de traçabilité (port 3006)

Enregistre **chaque accès** aux données d'un citoyen :
- Qui a accédé (quelle administration)
- À quelles données (quels champs de quel registre)
- Pour quelle démarche
- Quand
- Type d'accès (direct pour admin publique, consentement pour admin privée)
- **Double traçabilité** : `titulaire_id` (propriétaire des données) + `decideur_id` (qui a autorisé). Pour les adultes c'est la même personne. Pour les mineurs, le titulaire est l'enfant et le décideur est le tuteur quand c'est lui qui répond au consentement. Pour un accès direct d'une administration publique, personne ne décide : le titulaire est inscrit comme décideur (le tuteur voit quand même l'accès).

Le citoyen peut consulter tout son journal depuis son espace usager.

**Journal chaîné par empreintes** : chaque entrée porte son `rang`, l'`empreinte_precedente` et son `empreinte` (SHA-256 de son contenu, de son rang et de l'empreinte précédente), calculées par `services/integrite.service.js` du journal. Les écritures passent sous un verrou PostgreSQL (`pg_advisory_xact_lock`) : deux accès simultanés ne forment jamais deux branches. Modifier ou supprimer une entrée, même directement en base, rompt la chaîne. `GET /journal/verification` (relayée par le BFF, `GET /api/journal/verification`) recalcule toute la chaîne et renvoie `integre`, la `derniere_empreinte` (ancre à conserver ailleurs) et la première `rupture` (`contenu_modifie`, `entree_supprimee`, `chainage_rompu`), sans aucune donnée d'un autre citoyen. Les entrées antérieures au chaînage (démo) sont scellées au démarrage ; le seed ne réécrit jamais une entrée existante. Démonstration : `docker compose exec journal npm run simuler-alteration` (`-- --supprimer`, `-- --annuler`).

### Couche 5 : espace usager (frontend HTML/CSS/JS et BFF port 3000)

Portail web du citoyen. Fonctionnalités :

- **Authentification** : IUE (12 chiffres) + mot de passe. Récupération par SMS.
- **Tableau de bord** : compteur de consentements en attente, demandes en cours, accès récents, alertes
- **Consentements** : voir et répondre (accepter/refuser) aux demandes d'autorisation des admins privées
- **Demandes de pièces** : le citoyen peut demander une pièce, la cascade de dépendances se résout automatiquement
- **Journal** : consulter l'historique complet de qui a accédé à ses données
- **Enfants** : gestion des comptes enfants rattachés (tuteur)
- **Transfert de compte** : recommandation à 15 ans de transférer le contrôle à l'enfant
- **Mes pièces** : consulter le contenu de ses propres pièces (et de celles de ses enfants) et les télécharger pour son usage personnel (voir ci-dessous)
- **Mes données dans les registres** : sur « Mon profil », tout ce que les registres savent de lui (ou d'un enfant sous sa tutelle), en un appel (`GET /api/profil/registres`, voir ci-dessous)

### Consultation et téléchargement de ses pièces

Une demande ne conserve que l'arbre des statuts de la cascade : le **contenu** des pièces est lu à la demande par deux routes, décrites en détail dans les contrats `docs/openapi-espace-usager.yaml` et `docs/openapi-passerelle.yaml` (source de vérité).

**BFF : `GET /api/demandes/{id}/contenu`** (JWT citoyen, `Authorization: Bearer`)

1. **Contrôle d'accès sur le titulaire de la pièce**, pas sur l'auteur de la demande. L'accès est autorisé seulement si le `titulaire_iue` de la demande est :
   - l'IUE du citoyen connecté ;
   - ou l'IUE d'un enfant dont il est **actuellement** tuteur (tutelle relue en base à chaque appel).

   Sinon, réponse `404 DEMANDE_NON_TROUVEE` sans révéler que la demande existe. Après un transfert de compte, l'ancien tuteur perd donc l'accès aux pièces de l'enfant, même pour les demandes qu'il a faites lui-même. C'est la même règle que pour les consentements, où le tuteur « perd ce droit dès qu'il a transféré le compte » (`consentements.service.js` du BFF).
2. Si la demande n'est pas `complete`, quel que soit son statut : `409 PIECE_INDISPONIBLE`.
3. Appelle la passerelle `GET /api/interne/citoyens/{iue}/pieces/{type_piece_id}`, où `iue` est le titulaire de la pièce (le citoyen ou l'enfant). La passerelle fournit `type_piece`, `titulaire` et `donnees` : le BFF, qui n'a pas de catalogue local, ne fait qu'**un seul appel**.
4. Si la passerelle répond `404 PIECE_INDISPONIBLE` alors que la demande est `complete`, le BFF renvoie `409 PIECE_INDISPONIBLE`. Ce cas arrive notamment au test du jury, quand un registre est remplacé par celui d'une autre équipe et que les anciennes demandes visent des pièces absentes du nouveau registre. La page n'a qu'un seul cas d'indisponibilité à gérer.

Réponse `200` :
```json
{
  "demande_id": "uuid",
  "type_piece": { "id": "casier-judiciaire", "nom": "Casier judiciaire", "registre_source": "justice", "est_evolutive": true },
  "titulaire": { "iue": "784302956148", "nom": "OUEDRAOGO", "prenom": "Amadou" },
  "donnees": { "casier_vierge": true, "condamnations": [], "date_delivrance": "2026-11-17" },
  "date_consultation": "2026-11-17T18:00:00Z"
}
```

**Passerelle : `GET /api/interne/citoyens/{iue}/pieces/{type_piece_id}`** (en-tête `X-Cle-Service`, réservée au BFF comme les autres routes `/interne`)

Lit la pièce dans son registre, **uniquement via les routes des contrats des registres** (un registre d'une autre équipe doit fonctionner).

Réponse `200` :
```json
{
  "type_piece": { "id": "casier-judiciaire", "nom": "Casier judiciaire", "registre_source": "justice", "est_evolutive": true },
  "titulaire": { "iue": "784302956148", "nom": "OUEDRAOGO", "prenom": "Amadou" },
  "donnees": { "casier_vierge": true, "condamnations": [], "date_delivrance": "2026-11-17" }
}
```

`titulaire` est toujours lu à l'état civil (`GET /citoyens/{iue}?champs=iue,nom,prenom`), car le casier, le certificat de nationalité et la situation fiscale ne contiennent pas le nom du titulaire.

| Pièce | Route du registre | `donnees` |
|-------|-------------------|-----------|
| `extrait-naissance` | état-civil `GET /citoyens/{iue}` | les champs `DonneesEtatCivil`, avec `pere` et `mere` (`{ iue, nom, prenom }`, lus à l'état civil) qui **remplacent** `pere_iue` et `mere_iue`. Chacun vaut `null` si le parent est inconnu de l'état civil. |
| `certificat-nationalite` | justice `GET /citoyens/{iue}/nationalite` | tous les champs `CertificatNationalite` |
| `casier-judiciaire` | justice `GET /citoyens/{iue}/casier` | tous les champs `CasierJudiciaire` |
| `attestation-fiscale` | fiscal `GET /citoyens/{iue}/fiscal` | tous les champs `SituationFiscale` |

`donnees` ne contient jamais `iue` (déjà dans `titulaire`). La passerelle filtre elle-même les champs (pièce, titulaire, parents) : le paramètre `?champs=` est facultatif dans les contrats des registres, et le registre d'une autre équipe peut l'ignorer et renvoyer toute la fiche.

Erreurs : `404 TYPE_PIECE_INCONNU`, `404 PIECE_INDISPONIBLE` (le registre répond 404 : pièce ou titulaire absent, IUE mal formé compris). Le BFF convertit `PIECE_INDISPONIBLE` en `409` (voir l'étape 4 ci-dessus).

**Règles**
- Pas de minimisation : le citoyen consulte **ses propres** données, sans intermédiaire.
- Pas d'entrée au journal : aucune administration n'accède aux données, comme pour `/interne/citoyens/{iue}`.
- Pas de copie stockée : le registre est relu à chaque consultation, donc une pièce évolutive (casier, fiscal) est toujours à jour.
- Téléchargement : le frontend affiche une page imprimable (le navigateur l'enregistre en PDF avec Ctrl+P), portant la mention « Document informatif, non officiel ». Les registres ne délivrent jamais de PDF.

### Vue d'ensemble de ses données dans les registres (réalisée)

But : montrer au citoyen, sur la page « Mon profil », tout ce que les registres savent de lui, en un seul endroit, sans qu'il ait à faire une demande par pièce. **Route réalisée** (`backend/espace-usager/src/services/profil.service.js`), décrite dans `docs/openapi-espace-usager.yaml` (schéma `VueRegistres`) et testée par `tests/interoperabilite/test-interop.js`. `GET /api/profil` reste inchangée (données du compte seulement).

**BFF : `GET /api/profil/registres`** (JWT citoyen, `Authorization: Bearer`), paramètre facultatif `?iue=` pour un enfant.

1. **Titulaire.** Sans `iue`, le titulaire est le citoyen connecté. Avec `iue`, l'accès n'est autorisé que pour un enfant dont il est **actuellement** tuteur (tutelle relue en base), sinon `404 TITULAIRE_NON_TROUVE`, sans révéler si l'IUE existe. C'est la même règle que pour `GET /api/demandes/{id}/contenu`.
2. **Identité** via la passerelle `GET /api/interne/citoyens/{iue}` (route existante). Titulaire inconnu de l'état civil : `404 TITULAIRE_NON_TROUVE`. État civil hors service : `503 REGISTRE_INDISPONIBLE` pour toute la réponse (sans identité, rien n'est lu).
3. **Catalogue** via la passerelle `GET /types-pieces`, jamais une liste codée en dur : une pièce ajoutée au catalogue apparaît d'elle-même.
4. **Une lecture par pièce**, en parallèle, via la route existante de la passerelle `GET /api/interne/citoyens/{iue}/pieces/{type_piece_id}`. Aucune nouvelle route n'est nécessaire côté passerelle.
5. **Échec partiel toléré.** Une pièce absente (`404 PIECE_INDISPONIBLE`), un registre hors service (`503 REGISTRE_INDISPONIBLE`) ou un registre qui répond de façon inattendue (`502 SERVICE_EN_ERREUR`) ne fait pas échouer la réponse : la pièce est renvoyée avec `disponible: false` et le `code` de la passerelle. Le citoyen voit ainsi ce qui manque, par exemple quand le jury remplace un registre ou qu'un registre tombe.

Réponse `200` (pièces dans l'ordre du catalogue) :
```json
{
  "titulaire": { "iue": "784302956148", "nom": "OUEDRAOGO", "prenom": "Amadou" },
  "pieces": [
    {
      "type_piece": { "id": "extrait-naissance", "nom": "Extrait de naissance", "registre_source": "etat-civil", "est_evolutive": false },
      "disponible": true,
      "donnees": { "nom": "OUEDRAOGO", "prenom": "Amadou", "date_naissance": "1998-03-15", "pere": { "iue": "291047583620", "nom": "OUEDRAOGO", "prenom": "Ibrahim" } }
    },
    {
      "type_piece": { "id": "attestation-fiscale", "nom": "Attestation de situation fiscale", "registre_source": "fiscal", "est_evolutive": true },
      "disponible": false,
      "code": "REGISTRE_INDISPONIBLE"
    }
  ],
  "date_consultation": "2026-11-18T10:00:00Z"
}
```

`donnees` a exactement la forme de `GET /api/demandes/{id}/contenu` (même passerelle, même filtrage). `code` vaut `PIECE_INDISPONIBLE`, `REGISTRE_INDISPONIBLE` ou `SERVICE_EN_ERREUR` (codes de la passerelle, repris tels quels).

**Règles**
- Mêmes règles que la consultation d'une pièce : pas de minimisation (le citoyen consulte ses propres données), pas d'entrée au journal (aucune administration n'accède aux données), pas de copie stockée (registres relus à chaque appel).
- Coût : une lecture d'identité plus une lecture par type de pièce du catalogue (5 appels aujourd'hui), acceptable pour une page consultée ponctuellement.

**Usage frontend** (route disponible, page à faire) : section « Mes données dans les registres » de `profil.html`, regroupée par registre source (`type_piece.registre_source`), chaque bloc nommant son registre. Une pièce `disponible: false` est signalée sans bloquer le reste. Aucune mention « vérifié » : la plateforme relit les registres, elle ne certifie rien. Pour un tuteur, un sélecteur permet de choisir un enfant (`?iue=`).

### Interface de test (pour démo et jury)

Interface minimale pour simuler des requêtes comme si elles venaient d'une administration (publique ou privée). Ce n'est pas une vraie interface agent : chaque ministère ou entreprise construit la sienne et se connecte via l'API. Cette interface sert uniquement pour la démo et les tests.

### Recherche et filtres de l'espace usager

Les listes qui grandissent avec le temps ont une recherche ou des filtres. Le catalogue des pièces n'est pas figé : le frontend le lit toujours via `GET /types-pieces` et ne code jamais la liste des pièces en dur.

| Page | Outils | Où se fait le filtrage |
|------|--------|------------------------|
| Journal d'accès | recherche texte (administration, démarche, donnée consultée, enfant), type d'accès (direct / consentement), plage de dates | dates : **BFF** (`date_debut`, `date_fin`, bornes incluses) ; texte et type : navigateur |
| Mes demandes | filtres type de pièce (issus du catalogue), statut, bénéficiaire (moi / chaque enfant, pour un tuteur) | navigateur |
| Consentements | recherche texte (administration, démarche, donnée demandée, enfant), en plus des onglets de statut | navigateur |
| Nouvelle demande | choix de la pièce par recherche (motif ARIA combobox : ↑ ↓ Entrée Échap) au lieu d'une liste déroulante | navigateur |

Règles :
- Journal et Mes demandes : les options de recherche sont regroupées derrière **un seul bouton loupe**. Le panneau est replié par défaut ; un clic l'ouvre ou le referme (Échap le referme aussi). Une pastille sur la loupe indique le nombre de filtres actifs, visible même panneau fermé.
- La recherche ignore les accents et les majuscules (« etat civil » trouve « État civil »), et chaque mot saisi doit apparaître (« banque nom »).
- Le filtrage côté navigateur porte sur les éléments chargés, au plus **100** (le maximum de `limite` du BFF). Le journal le signale quand la période contient plus d'accès et invite à préciser les dates.
- Les contrats ne prévoient pas de recherche texte côté serveur. Si les volumes l'exigent, il faudra ajouter un paramètre `q` (recherche texte) à `GET /journal`, `GET /consentements` et `GET /demandes`, puis le reporter dans `docs/openapi-espace-usager.yaml`. Ce n'est **pas** implémenté à ce jour.

---

## Modèle de données

Modèle de conception initial. Le modèle réel est dans le `prisma/schema.prisma` de chaque service. Écarts principaux : la filiation est lue à l'état civil (pas de table `LienParente`) ; une demande garde son arbre de cascade en JSON (pas de table `DemandePrerequis`) ; `DemarcheChamps` s'appelle `ChampsDemarche` (service consentement) ; la passerelle a en plus `Requete` (sans copie des données transmises) et `DemarchePiece`.

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

**Exemple : Amadou demande un casier judiciaire.**

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
5. Si un parent n'est pas dans le registre numérique, ce prérequis passe au statut `fallback_physique`

### Donnée numérique manquante

Une pièce peut exister sur papier sans être encore dans le registre numérique (acte ancien jamais saisi, par exemple l'acte de naissance des parents d'un citoyen). C'est une **donnée numérique manquante** : la plateforme ne l'invente pas et ne la stocke pas à la place du registre.
- Le prérequis est marqué `manquant` et la demande passe `fallback_physique` (nom technique conservé dans les contrats ; affiché « donnée à numériser »).
- Le citoyen apprend quelle pièce manque, pour qui, et la démarche à suivre (`demarche_si_absente` du type de pièce, renvoyée par `GET /types-pieces`). La plateforme se contente d'informer : elle ne recueille aucune information pour orienter le citoyen.
- L'administration qui détient l'acte (pour l'état civil : le centre d'état civil) le **numérise dans son registre**, jamais dans la plateforme ; démonstration : `docker compose exec registre-etat-civil npm run numeriser-actes`.
- La chaîne reprend automatiquement : le BFF relance toutes les 10 s les demandes `fallback_physique` et `en_cours` (en attente d'un registre) et notifie le citoyen quand elles se complètent.

Cas distinct : un registre sans IUE où la recherche par nom, prénom et date de naissance trouve **plusieurs** personnes (homonymes). La plateforme ne choisit jamais au hasard et la pièce n'est pas lue ; la levée de l'ambiguïté passe par le mode d'identification `correspondance` (table IUE / identifiant local).

### Identification par correspondance

Un registre qui a ses propres identifiants (numéro d'acte, de dossier) se branche avec `identification: { mode: correspondance, table: correspondances/<registre>.csv }` : la table (fichier du dossier `config/` de la passerelle, une ligne `iue;identifiant` par personne) donne son identifiant, utilisé comme `{identifiant_local}` dans les routes.
- Possible pour l'état civil, qui sert de pivot (il doit être en mode `iue` ou `correspondance`, jamais `recherche`).
- Bijection vérifiée au démarrage : un IUE ou un identifiant en double, ou un IUE mal formé, empêche la passerelle de démarrer.
- Un IUE absent de la table est inconnu de ce registre. Les personnes citées par le registre (données de type `identifiant` : `pere_iue`, `mere_iue`, filiation) sont retraduites en IUE, `null` si absentes de la table : un identifiant local ne sort jamais, la table n'est jamais exposée.
- Test : scénario « identification par correspondance » de `tests/interoperabilite/test-interop.js` (config `tests/interoperabilite/config-correspondance/`).

### Gestion du catalogue

Le catalogue regroupe les données de référence de la plateforme : types de pièces et leurs prérequis, démarches et pièces requises par chacune, administrations et cloisonnement par mission (`AccesMission`), règles de minimisation.

**Dans le MVP**, le catalogue est décrit dans des fichiers et ne se gère pas depuis une interface :

| Données | Propriétaire | Source |
|---------|--------------|--------|
| Types de pièces, prérequis, démarches, administrations, `AccesMission` | passerelle | `backend/passerelle/prisma/reference.js`, inséré par `seed.js` à chaque démarrage |
| Données de la plateforme (nom, type, libellé, données calculées) | passerelle | dictionnaire des données, `backend/passerelle/config/dictionnaire.yaml` |
| Registres, lecture d'une pièce dans son registre, sources de secours | passerelle | catalogue des registres, `backend/passerelle/config/catalogue-registres.yaml` (section `pieces`) |
| Champs autorisés par démarche et par registre | consentement | `backend/consentement/prisma/seed.js` (table `ChampsDemarche`) |

Le catalogue n'est exposé qu'en lecture (`GET /types-pieces`, `GET /types-pieces/{id}/prerequis`, `GET /registres`, `GET /dictionnaire`). Ajouter une pièce demande de modifier `reference.js` et la section `pieces` du catalogue des registres, puis de redémarrer la passerelle. Le frontend n'a rien à changer : il lit toujours le catalogue via `GET /types-pieces`.

### Gestion des mineurs

- Un enfant est rattaché à un tuteur (via `tuteur_id` dans Citoyen)
- Le tuteur administre l'espace de l'enfant
- La plateforme détecte automatiquement les mineurs par leur date de naissance, lue au registre de l'état civil (via la passerelle) ; à son inscription, un parent se voit rattacher ses enfants mineurs trouvés par la filiation de l'état civil
- À **15 ans**, le système recommande au tuteur de transférer le contrôle du compte à l'enfant
- Le journal enregistre `titulaire = enfant` et `decideur = tuteur` pour toute action du tuteur

### Numéro de téléphone

- Stocké dans la table Citoyen (donnée de compte, pas donnée administrative)
- Utilisé pour : récupération de mot de passe, notifications SMS de consentement, rappels
- **Accessible aux administrations** via la passerelle pour relancer les citoyens qui tardent à répondre aux demandes de consentement

---

## Stack technique

- **Backend** : Node.js + Express.js
- **Frontend** : HTML / CSS / JavaScript (vanilla, sans framework) en priorité. Une application mobile est prévue ensuite si le temps le permet : elle consommera le même contrat BFF (`docs/openapi-espace-usager.yaml`), donc aucune route ne doit dépendre du navigateur (pas de cookies, authentification par en-tête `Authorization`).
- **Base de données** : PostgreSQL
- **ORM** : Prisma
- **Authentification** : JWT + bcrypt
- **Déploiement** : Docker Compose
- **Documentation API** : OpenAPI 3.0 et Swagger, via le service `documentation` du docker-compose (image `swaggerapi/swagger-ui:v5.17.14`), http://localhost:3010, qui lit directement `docs/`. Toute description YAML contenant « : » doit être entre guillemets doubles, sinon le contrat devient invalide et Swagger ne l'affiche plus.

---

## Structure du projet

```
/
├── CLAUDE.md                    ce fichier
├── docker-compose.yml           PostgreSQL et tous les services, une seule commande
├── docs/                        spécifications OpenAPI (source de vérité)
│   ├── openapi-espace-usager.yaml      (BFF :3000)
│   ├── openapi-passerelle.yaml         (:3004)
│   ├── openapi-consentement.yaml       (:3005)
│   ├── openapi-journal.yaml            (:3006)
│   ├── openapi-registre-etat-civil.yaml (:3001)
│   ├── openapi-registre-justice.yaml    (:3002)
│   └── openapi-registre-fiscal.yaml     (:3003)
├── backend/                     tous les services Node/Express
│   ├── registres/
│   │   ├── etat-civil/          registre état-civil (gabarit de référence)
│   │   ├── justice/             registre justice
│   │   └── fiscal/              registre fiscal
│   ├── passerelle/              passerelle d'échange
│   ├── consentement/            consentement et minimisation
│   ├── journal/                 journal de traçabilité
│   └── espace-usager/           BFF (Backend for Frontend) :3000
└── frontend/                    espace usager HTML/CSS/JS et interface de test
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
│   ├── schema.prisma            uniquement les tables de ce service
│   └── seed.js                  données de démo de ce service (idempotent, upsert)
└── src/
    ├── server.js                app.listen
    ├── app.js                   création de l'app Express, montage des routes sous /api, errorHandler
    ├── config/                  lecture des variables d'environnement
    ├── routes/                  associe URL et verbe à un controller (avec middlewares auth et validation)
    ├── controllers/             lit req, appelle un service, choisit le code HTTP, renvoie res. Aucune logique métier.
    ├── services/                logique métier. Ne connaît ni req ni res.
    ├── models/                  accès aux données via Prisma (prisma.js = instance unique). Aucune règle métier.
    ├── clients/                 appels HTTP vers d'autres services (passerelle et BFF uniquement)
    ├── middlewares/             auth JWT, errorHandler, validation
    └── utils/                   AppError, helpers
```

Règle : chaque couche n'appelle que la couche immédiatement inférieure (routes, puis controllers, puis services, puis models ou clients). Les erreurs métier sont levées avec `AppError(statut, code, message)` et converties en `{ code, message }` par `errorHandler`.

Les petits utilitaires (`AppError`, `errorHandler`) sont dupliqués dans chaque service plutôt que partagés, pour que chaque service se construise seul (contexte Docker indépendant) et qu'un registre reste remplaçable.

---

## 3 procédures de bout en bout

### 1. Inscription universitaire (admin publique)

**Administration** : Université Joseph KI-ZERBO (publique, domaine : education)
**Champs nécessaires** : `est_majeur`, `nationalite` (registre état-civil)
**Flux** :
1. L'université fait une requête via la passerelle pour le citoyen X
2. La passerelle vérifie : admin publique du domaine education, donc accès direct
3. Minimisation : seuls `est_majeur` et `nationalite` sont transmis
4. Journal enregistre l'accès
5. Notification envoyée au citoyen : "L'Université a consulté vos données pour votre inscription"
6. Résultat retourné : `{ "est_majeur": true, "nationalite": "Burkinabè" }`

### 2. Demande de passeport (admin publique, avec cascade)

**Administration** : Direction de la police nationale (publique, domaine : securite)
**Champs nécessaires** : tous les champs état-civil + casier judiciaire + certificat de nationalité
**Flux** :
1. Requête pour le citoyen X, démarche « émission passeport »
2. Passerelle détecte les prérequis : casier + nationalité + état civil complet
3. Cascade : nationalité nécessite extraits de naissance (citoyen + parents)
4. Résolution via les liens de filiation, puis interrogation des registres
5. Minimisation : tous les champs transmis (démarche passeport = accès complet)
6. Journal enregistre
7. Résultat retourné avec données complètes de tous les registres

### 3. Ouverture de compte bancaire (admin privée, consentement)

**Administration** : Banque Atlantique (privée, domaine : finance)
**Champs nécessaires** : `nom`, `prenom`, `nationalite` (état-civil) + `en_regle` (fiscal)
**Flux** :
1. La banque fait une requête via la passerelle
2. La passerelle détecte une admin privée : consentement requis
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
- **Amadou OUEDRAOGO** (IUE: 784302956148) : citoyen principal pour la démo, majeur
- **Ibrahim OUEDRAOGO** (IUE: 291047583620) : père d'Amadou
- **Fatimata SAWADOGO** (IUE: 638501274093) : mère d'Amadou
- **Awa OUEDRAOGO** (IUE: 456123789012) : sœur d'Amadou, mineure (12 ans), tuteur = Ibrahim
- **Moussa OUEDRAOGO** (IUE: 527814903361) : frère d'Amadou, mineur (16 ans), tuteur = Ibrahim, transfert de compte recommandé
- **Salif OUEDRAOGO** (IUE: 316580942751) : frère aîné d'Amadou, majeur, présent dans les 3 registres mais **volontairement sans compte** : démonstration de l'inscription en direct
- **Aïcha OUEDRAOGO** (IUE: 873045129604) : fille de Salif (5 ans), sans compte : rattachée automatiquement à Salif quand il s'inscrit. Remise à zéro de la démo : `docker compose exec espace-usager node scripts/reinitialiser-inscription-demo.js`

Comptes de démo de l'espace usager (mots de passe de DÉMONSTRATION uniquement) : Amadou `Amadou2026!`, Ibrahim `Ibrahim2026!`, Fatimata `Fatimata2026!`. Awa et Moussa n'ont pas de mot de passe (comptes gérés par Ibrahim).

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
- Extrait de naissance : aucun prérequis
- Certificat de nationalité : extraits de naissance du citoyen, du père et de la mère
- Casier judiciaire : certificat de nationalité
- Attestation fiscale : aucun prérequis

### Démarches
- Inscription universitaire (Université) : état-civil [est_majeur, nationalite]
- Émission de passeport (Police) : état-civil [tous], justice: [casier, nationalité]
- Ouverture de compte bancaire (Banque) : état-civil [nom, prenom, nationalite], fiscal: [en_regle]

---

## Workflow Git

- Jamais de commit direct sur `main` : une branche courte par fonctionnalité (`backend/<fonctionnalite>`, `frontend/<fonctionnalite>`), fusionnée via une **Pull Request** GitHub.
- `main` doit toujours démarrer avec `docker compose up`.
- Message de commit : `Prénom: description en français` (ex : `Axel: registre état-civil, routes et seed`).
- Avant de pousser : `git pull --rebase origin main`, vérifier que tout démarre.
- Les contrats `docs/*.yaml` sont l'interface frontend/backend : prévenir l'autre équipe avant de les modifier.

## Conventions de code

- **Commentaires obligatoires, en français**. Le code doit toujours être commenté :
  - un en-tête par fichier (rôle du fichier, couche concernée) ;
  - un bloc JSDoc par fonction exportée (ce qu'elle fait, `@param`, `@returns`, erreurs levées) ;
  - un commentaire sur toute logique non évidente (règle métier, écart au contrat, contrainte d'ordre).
- **Langue du code** : anglais (noms de variables, fonctions)
- **Routes et champs JSON** : en français, exactement comme dans les contrats `docs/*.yaml` (obligatoire pour l'interopérabilité). Les fichiers sont nommés d'après la ressource du contrat (`citoyens.routes.js`, `requetes.controller.js`).
- **Langue des données** : français (noms des administrations, messages d'erreur, etc.)
- **API** : REST, préfixe `/api/`
- **Auth** : JWT Bearer token dans header `Authorization`. Jetons citoyens émis par le BFF, signés en **HS256** avec le secret partagé `JWT_SECRET` (même valeur dans tous les services, fournie par docker-compose). Contenu du jeton citoyen : `{ "iue": "<12 chiffres>", "enfants": ["<IUE des mineurs dont il est tuteur>"] }` (`enfants` facultatif, seul le BFF connaît les tutelles ; il permet au tuteur de voir et traiter les consentements de ses enfants). Les routes internes (ex : `POST /journal/enregistrer`, appelée par la passerelle) n'ont pas de JWT, conformément aux contrats.
- **Jetons d'administration** (passerelle) : `{ "administration_id": "<uuid>" }`, HS256 avec `JWT_SECRET`. Jetons de démo : `docker compose exec passerelle npm run jeton:admin`.
- **Routes internes** (sans JWT, jamais appelées par le frontend) : consentement `GET /interne/consentements/{id}` et `GET /minimisation/regles/{demarche_id}`. La passerelle et le BFF étant exposés (administrations / internet), leurs routes internes exigent en plus la clé partagée `CLE_SERVICE_INTERNE` dans l'en-tête `X-Cle-Service` : passerelle `GET /interne/citoyens/{iue}` et `POST /interne/cascade` (appelées par le BFF), BFF `GET /interne/citoyens/{iue}/telephone` (appelée par la passerelle).
- **BFF** : ne lit jamais les registres directement (identité et cascade via la passerelle). Les tutelles sont relues en base à chaque requête ; pour appeler consentement et journal, le BFF fabrique un jeton citoyen de 2 minutes avec la liste `enfants` à jour. L'interface de test (`/api/test/*`) fabrique des jetons d'administration : à désactiver en production (`INTERFACE_TEST_ACTIVE=false`).
- **Interopérabilité** : aucun registre n'est écrit en dur dans la passerelle. Le dictionnaire des données (`config/dictionnaire.yaml`) et le catalogue des registres (`config/catalogue-registres.yaml`) décrivent quoi lire, où et comment ; ils sont validés au démarrage (la passerelle refuse de démarrer s'ils sont incohérents). Brancher un registre : le déclarer au catalogue (si le registre publie un contrat OpenAPI, `docker compose exec passerelle npm run proposer-registre -- <contrat> <identifiant>` en propose un brouillon, `suspendu`, à relire : il n'active jamais rien), le tester (`docker compose exec passerelle npm run tester-registre -- <registre> <iue>`), redémarrer la passerelle. Les adresses de nos registres restent surchargeables (`REGISTRE_ETAT_CIVIL_URL`, `REGISTRE_JUSTICE_URL`, `REGISTRE_FISCAL_URL` dans un `.env` à la racine). On ne renomme jamais une donnée du dictionnaire. Une source de secours est une réplique du registre de référence tenue par la même autorité (même `proprietaire`, vérifié au démarrage), jamais le registre d'une autre administration.
- **Minimisation** : les règles « champs autorisés par démarche et par registre » appartiennent au service consentement (table `ChampsDemarche`, seed dans `backend/consentement/prisma/seed.js`). Identifiants des démarches : `inscription-universite`, `emission-passeport`, `ouverture-compte-bancaire`.
- **SMS** : simulés, écrits dans les logs (`docker compose logs passerelle` pour la notification après coup d'un accès direct par une administration publique, `docker compose logs consentement` pour les demandes de consentement, `docker compose logs espace-usager` pour les codes de mot de passe et les transferts).
- **Journal** : en ajout seul, aucune entrée n'est modifiée ni supprimée ; chaque entrée est scellée dans la chaîne des empreintes (voir « Couche 4 »), vérifiable par `GET /journal/verification`. La passerelle envoie, en plus des identifiants, une photo figée des noms (`administration_nom`, `administration_type`, `demarche_nom`).
- **Erreurs** : Format uniforme `{ code: "STRING_CONSTANTE", message: "Message lisible" }`
- **Pagination** : `{ page, limite, total, pages }`
- **IDs** : UUID v4 pour les IDs internes, 12 chiffres pour les IUE
- **Dates** : ISO 8601
- **ORM** : Prisma 6 (version figée `6.19.3`), **un `schema.prisma` par service**. Tous les services partagent la même instance PostgreSQL mais chacun a son propre schéma PostgreSQL via `DATABASE_URL=...?schema=<service>` (ex : `etat_civil`, `journal`). Aucun service ne lit les tables d'un autre : il passe par son API.
- **IUE** : 12 chiffres (`^[0-9]{12}$`). Aucun autre format.
