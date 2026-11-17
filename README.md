# DLNUF — Dites-le-nous une fois

Plateforme d'interopérabilité qui permet aux administrations du Burkina Faso d'échanger les données des citoyens entre elles, au lieu de demander aux citoyens de transporter des documents d'un guichet à l'autre. Le citoyen fournit ses informations **une seule fois** ; chaque échange est **filtré** (seuls les champs utiles à la démarche passent), **autorisé** (consentement explicite pour les entités privées) et **tracé** (le citoyen voit qui a consulté quoi, et pourquoi).

Projet réalisé pour le **Hackathon des Universités 2026** (MTDPCE, Semaine du Numérique) — Challenge 02 « Dites-le-nous une fois ».

---

## Démarrage rapide

**Prérequis** : [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ou Docker Engine avec Docker Compose v2). Rien d'autre à installer.

```bash
docker compose up -d --build
```

Cette commande unique construit et démarre PostgreSQL et les 8 services. Chaque service crée ses tables et charge ses données de démonstration au démarrage. Le premier lancement prend quelques minutes (téléchargement des dépendances).

Vérifier que tout tourne :

```bash
docker compose ps
curl http://localhost:3000/api/sante
# {"statut":"ok","service":"espace-usager"}
```

| Service | URL | Rôle |
|---------|-----|------|
| **Espace usager (site web)** | **http://localhost:3020** | Portail du citoyen ; interface de test des administrations sur `/pages/test.html` |
| Espace usager (BFF) | http://localhost:3000/api | Seul point d'entrée du frontend citoyen |
| Registre état-civil | http://localhost:3001/api | Naissance, filiation, nationalité |
| Registre justice | http://localhost:3002/api | Casier judiciaire, certificat de nationalité |
| Registre fiscal | http://localhost:3003/api | IFU, situation fiscale |
| Passerelle d'échange | http://localhost:3004/api | Point d'entrée des administrations |
| Consentement & minimisation | http://localhost:3005/api | Demandes de consentement, filtre des champs |
| Journal de traçabilité | http://localhost:3006/api | Historique de tous les accès |
| **Documentation des API** | **http://localhost:3010** | Swagger UI : les 7 contrats OpenAPI, consultables dans le navigateur |

Chaque service répond sur `GET /api/sante`.

Arrêter : `docker compose down`. Repartir de zéro (efface la base) : `docker compose down -v`.

---

## Données de démonstration

### Citoyens

| Citoyen | IUE | Mot de passe | Particularité |
|---------|-----|--------------|---------------|
| Amadou OUEDRAOGO | `784302956148` | `Amadou2026!` | Majeur, citoyen principal de la démo |
| Ibrahim OUEDRAOGO | `291047583620` | `Ibrahim2026!` | Père d'Amadou, tuteur d'Awa et Moussa ; ses parents ne sont pas enregistrés (passage au guichet) |
| Fatimata SAWADOGO | `638501274093` | `Fatimata2026!` | Mère d'Amadou |
| Awa OUEDRAOGO | `456123789012` | — | Mineure (12 ans), compte géré par Ibrahim |
| Moussa OUEDRAOGO | `527814903361` | — | Mineur (16 ans), transfert de compte recommandé |
| Salif OUEDRAOGO | `316580942751` | *pas de compte* | Majeur, connu de l'état civil mais **pas encore inscrit** : sert à l'inscription en direct |
| Aïcha OUEDRAOGO | `873045129604` | — | Fille de Salif (5 ans), rattachée automatiquement à son père quand il s'inscrit |

Ces mots de passe sont uniquement des mots de passe de démonstration.

### Administrations

| UUID | Nom | Type | Domaine de mission |
|------|-----|------|--------------------|
| `00000000-0000-4000-8000-000000000001` | Université Joseph KI-ZERBO | publique | education |
| `00000000-0000-4000-8000-000000000002` | Direction de la police nationale | publique | securite |
| `00000000-0000-4000-8000-000000000003` | Tribunal de Grande Instance de Ouagadougou | publique | justice |
| `00000000-0000-4000-8000-000000000004` | Banque Atlantique | privee | finance |
| `00000000-0000-4000-8000-000000000005` | Orange Money Burkina | privee | telecoms |

### Démarches

| Identifiant | Administration | Champs transmis |
|-------------|----------------|-----------------|
| `inscription-universite` | Université | état-civil : `est_majeur`, `nationalite` |
| `emission-passeport` | Police | état-civil complet + justice : `casier_vierge`, `est_national`, `mode_acquisition`, `numero_certificat` |
| `ouverture-compte-bancaire` | Banque | état-civil : `nom`, `prenom`, `nationalite` + fiscal : `en_regle` |

---

## Démonstration des 3 procédures

Les exemples utilisent `curl` dans un terminal bash (Git Bash sous Windows). L'**interface de test** du BFF (`/api/test/*`) permet de jouer le rôle d'une administration sans gérer de jeton.

### 1. Inscription universitaire — administration publique, accès direct

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000001","iue_citoyen":"784302956148","demarche_id":"inscription-universite"}'
```

L'université reçoit **uniquement** `{"etat-civil":{"est_majeur":true,"nationalite":"Burkinabè"}}`, et l'accès est inscrit au journal d'Amadou.

### 2. Émission de passeport — administration publique, résolution en cascade

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000002","iue_citoyen":"784302956148","demarche_id":"emission-passeport"}'
```

La réponse contient l'état civil complet, les données de justice et la **cascade** : casier judiciaire → certificat de nationalité → extraits de naissance d'Amadou, de son père et de sa mère, tous `resolu`. Avec l'IUE d'Ibrahim (`291047583620`), les extraits de naissance de ses parents apparaissent en `manquant_fallback_physique` : il devra les présenter au guichet.

### 3. Ouverture de compte bancaire — administration privée, consentement explicite

**a. La banque fait sa demande** — rien n'est transmis, une demande de consentement est créée :

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000004","iue_citoyen":"784302956148","demarche_id":"ouverture-compte-bancaire"}'
# → 202 {"type_admin":"privee","requete_id":"<REQUETE_ID>","consentement_id":"<CONSENTEMENT_ID>",...}
```

Le SMS simulé envoyé au citoyen est visible avec `docker compose logs consentement`.

**b. Amadou se connecte et accepte** :

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"iue":"784302956148","mot_de_passe":"Amadou2026!"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl "http://localhost:3000/api/consentements?statut=en_attente" -H "Authorization: Bearer $TOKEN"

curl -X PUT http://localhost:3000/api/consentements/<CONSENTEMENT_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"accepte"}'
```

**c. La banque consulte sa requête** et reçoit uniquement les 4 champs acceptés :

```bash
curl "http://localhost:3000/api/test/requetes/<REQUETE_ID>?administration_id=00000000-0000-4000-8000-000000000004"
# → {"statut":"complete","donnees":{"etat-civil":{"nom":"OUEDRAOGO","prenom":"Amadou","nationalite":"Burkinabè"},"fiscal":{"en_regle":true}},...}
```

**d. Amadou voit l'accès dans son journal** :

```bash
curl http://localhost:3000/api/journal -H "Authorization: Bearer $TOKEN"
```

### Inscription en direct

Salif OUEDRAOGO est connu de l'état civil mais n'a pas encore de compte. Il s'inscrit en ne donnant que son IUE, un mot de passe et son téléphone :

```bash
curl -X POST http://localhost:3000/api/auth/inscription \
  -H "Content-Type: application/json" \
  -d '{"iue":"316580942751","mot_de_passe":"Salif2026!","telephone":"+22670998877"}'
# → 201 {"token":"...","citoyen":{"iue":"316580942751","nom":"OUEDRAOGO","prenom":"Salif",...}}
```

Son nom n'a été saisi nulle part : la plateforme l'a lu à l'état civil. Sa fille mineure Aïcha a été **détectée et rattachée automatiquement** à son compte :

```bash
curl http://localhost:3000/api/enfants -H "Authorization: Bearer <TOKEN_DE_SALIF>"
# → {"enfants":[{"iue":"873045129604","prenom":"Aïcha","age":5,"transfert_recommande":false,...}]}
```

La même inscription peut se faire depuis la documentation Swagger (http://localhost:3010, `POST /auth/inscription`, « Try it out ») : l'exemple pré-rempli est celui de Salif.

**Rejouer la démonstration** (supprime uniquement les comptes de Salif et d'Aïcha) :

```bash
docker compose exec espace-usager node scripts/reinitialiser-inscription-demo.js
```

### Cloisonnement par mission

Une administration ne peut obtenir que les données liées à sa mission. L'université qui demande un passeport est refusée :

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000001","iue_citoyen":"784302956148","demarche_id":"emission-passeport"}'
# → 403 {"code":"HORS_MISSION","message":"Accès refusé : hors du domaine de mission « education » (...)"}
```

---

## Appeler la passerelle comme une vraie administration

Une administration (ministère, banque…) se connecte directement à la passerelle avec un jeton JWT contenant son identifiant. Pour la démo, générer les jetons des 5 administrations :

```bash
docker compose exec passerelle npm run jeton:admin
```

Puis :

```bash
curl -X POST http://localhost:3004/api/requetes \
  -H "Authorization: Bearer <JETON_ADMINISTRATION>" -H "Content-Type: application/json" \
  -d '{"iue_citoyen":"784302956148","demarche_id":"inscription-universite"}'
```

| Route | Rôle |
|-------|------|
| `POST /api/requetes` | Demander des données (200 si publique, 202 si consentement requis) |
| `GET /api/requetes/{id}` | Suivre une requête ; les données arrivent après l'acceptation du citoyen |
| `GET /api/requetes/{id}/telephone` | Obtenir le téléphone du citoyen pour le relancer (requête en attente uniquement) |
| `GET /api/demarches`, `GET /api/types-pieces`, `GET /api/types-pieces/{id}/prerequis` | Catalogue public |

---

## Test d'interopérabilité : brancher le registre d'une autre équipe

Les contrats des registres (`docs/openapi-registre-*.yaml`) sont standardisés. La passerelle n'utilise **que** les routes de ces contrats ; n'importe quel registre conforme peut remplacer le nôtre, **sans modifier le code**.

1. Démarrer le registre de l'autre équipe et noter son adresse. Depuis un conteneur Docker, la machine hôte s'appelle `host.docker.internal`.
2. Créer un fichier `.env` à la racine du dépôt :

   ```bash
   # Exemple : registre état-civil d'une autre équipe, lancé sur le port 4001 de la machine
   REGISTRE_ETAT_CIVIL_URL=http://host.docker.internal:4001/api
   # REGISTRE_JUSTICE_URL=http://...
   # REGISTRE_FISCAL_URL=http://...
   ```

3. Redémarrer la passerelle : `docker compose up -d passerelle`.
4. Rejouer les procédures ci-dessus.

Ce que la passerelle attend d'un registre :

| Registre | Routes utilisées |
|----------|------------------|
| État-civil | `GET /citoyens/{iue}?champs=...`, `GET /citoyens/{iue}/filiation` |
| Justice | `GET /citoyens/{iue}/casier?champs=...`, `GET /citoyens/{iue}/nationalite?champs=...` |
| Fiscal | `GET /citoyens/{iue}/fiscal?champs=...` |

Réponses : `200` avec les champs du contrat, `404` si le citoyen est inconnu, erreurs au format `{ code, message }`. L'IUE est composé de 12 chiffres.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              FRONTEND HTML / CSS / JS                    │
│                  (Espace Usager)                         │
└──────────────────────┬──────────────────────────────────┘
                       │ ← openapi-espace-usager.yaml
                       │    (seul point d'entrée frontend)
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

Les administrations appellent directement la **passerelle** (:3004) ; les citoyens passent par l'**espace usager** (:3000).

Le frontend citoyen est d'abord une application web en HTML / CSS / JavaScript. Une application mobile pourra suivre : elle utilisera le même contrat (`openapi-espace-usager.yaml`), sans aucune modification du backend, car l'authentification passe par un jeton dans l'en-tête `Authorization` et non par des cookies.

### Ce qui se passe quand une administration demande des données

1. **Droits** : l'administration doit exister, et tous les champs requis par la démarche doivent appartenir à son domaine de mission. Sinon : refus (403), rien n'est transmis.
2. **Administration publique** :
   - la passerelle résout la **cascade** des pièces prérequises (via la filiation à l'état civil) ;
   - elle interroge les registres en ne demandant **que** les champs requis ;
   - le service de **minimisation** retire tout champ non autorisé pour la démarche ;
   - l'accès est inscrit au **journal** — si le journal est indisponible, rien n'est transmis ;
   - le citoyen est notifié et les données sont renvoyées.
3. **Administration privée** : une demande de consentement est créée et le citoyen est prévenu par SMS (rappels à 24 h et 72 h, expiration à 30 jours). Quand l'administration consulte sa requête, la passerelle vérifie la réponse du citoyen : en cas d'acceptation, **seuls les champs acceptés** sont transmis et l'accès est tracé ; un refus est également tracé.

### Mineurs

Le compte d'un mineur est géré par son tuteur, qui voit ses demandes de consentement, y répond et consulte son journal. Le journal distingue le **titulaire** des données (l'enfant) et le **décideur** (le tuteur). À 15 ans, le tuteur peut transférer le compte à l'enfant.

---

## Contrats API

Les spécifications OpenAPI 3.0 sont dans `docs/` et font foi.

**Documentation interactive** : http://localhost:3010 (Swagger UI, démarré avec le reste de la plateforme). Le menu en haut à droite permet de passer d'un contrat à l'autre. La page lit directement les fichiers de `docs/` : elle est toujours à jour. Le bouton « Try it out » permet d'appeler l'espace usager (:3000) depuis la page ; pour les autres services, utiliser `curl` (voir les exemples ci-dessus).

| Fichier | Port | Consommé par |
|---------|------|-------------|
| `openapi-espace-usager.yaml` | :3000 | **Frontend** (seul contrat nécessaire pour le frontend) |
| `openapi-passerelle.yaml` | :3004 | Administrations, BFF, interface de test |
| `openapi-consentement.yaml` | :3005 | Passerelle, BFF |
| `openapi-journal.yaml` | :3006 | Passerelle, BFF |
| `openapi-registre-etat-civil.yaml` | :3001 | Passerelle uniquement |
| `openapi-registre-justice.yaml` | :3002 | Passerelle uniquement |
| `openapi-registre-fiscal.yaml` | :3003 | Passerelle uniquement |

### Conventions communes

- **Auth** : JWT Bearer dans l'en-tête `Authorization` (jetons citoyens émis par le BFF, jetons d'administration pour la passerelle)
- **Erreurs** : format uniforme `{ "code": "CODE_CONSTANTE", "message": "Message lisible" }`
- **Pagination** : `{ page, limite, total, pages }`
- **IUE** : 12 chiffres (ex : `784302956148`)
- **Dates** : ISO 8601 (`2026-01-15` ou `2026-01-15T10:30:00Z`)
- **IDs internes** : UUID v4

---

## Configuration

Les valeurs par défaut conviennent pour la démonstration. Pour les modifier, créer un fichier `.env` à la racine (lu automatiquement par Docker Compose) :

| Variable | Défaut | Rôle |
|----------|--------|------|
| `JWT_SECRET` | `dlnuf-dev-secret-a-changer` | Secret de signature des jetons, partagé par tous les services |
| `CLE_SERVICE_INTERNE` | `dlnuf-cle-interne-a-changer` | Clé qui protège les routes internes entre la passerelle et le BFF |
| `CORS_ORIGINES` | `*` | Origines autorisées à appeler le BFF depuis un navigateur |
| `INTERFACE_TEST_ACTIVE` | `true` | Active l'interface de test `/api/test/*` |
| `REGISTRE_ETAT_CIVIL_URL`, `REGISTRE_JUSTICE_URL`, `REGISTRE_FISCAL_URL` | registres internes | Registres utilisés par la passerelle (interopérabilité) |

**En production** : changer `JWT_SECRET` et `CLE_SERVICE_INTERNE`, mettre l'adresse du frontend dans `CORS_ORIGINES`, passer `INTERFACE_TEST_ACTIVE=false` (l'interface de test peut se faire passer pour n'importe quelle administration), et ne publier que les ports de la passerelle et du BFF.

**SMS** : ils sont simulés et écrits dans les logs : `docker compose logs consentement` (demandes de consentement, rappels) et `docker compose logs espace-usager` (codes de mot de passe, transferts de compte).

---

## Développement

### Stack

Node.js 22 + Express, PostgreSQL 16, Prisma 6, JWT + bcrypt, Docker Compose.

### Organisation du dépôt

```
docker-compose.yml        ← toute la plateforme en une commande
docs/                     ← contrats OpenAPI (source de vérité), affichés sur http://localhost:3010
backend/
├── registres/
│   ├── etat-civil/       :3001
│   ├── justice/          :3002
│   └── fiscal/           :3003
├── passerelle/           :3004
├── consentement/         :3005
├── journal/              :3006
└── espace-usager/        :3000 (BFF)
frontend/                 ← espace usager (équipe frontend)
```

Chaque service est autonome (son `package.json`, son `Dockerfile`, son schéma Prisma et son schéma PostgreSQL) et suit la même architecture en couches :

```
src/routes/        URL → controller (+ authentification)
src/controllers/   requête HTTP → service → réponse, sans logique métier
src/services/      logique métier
src/models/        accès à la base (Prisma)
src/clients/       appels HTTP vers les autres services
```

### Lancer un service hors Docker

```bash
docker compose up -d postgres          # la base seule
cd backend/registres/etat-civil
cp .env.example .env
npm install
npx prisma db push && npm run db:seed
npm run dev                            # rechargement automatique
```

Consulter les logs d'un service : `docker compose logs -f passerelle`.

### Développement parallèle

- **Équipe frontend** : travaille uniquement avec `openapi-espace-usager.yaml` (port 3000). Tous les endpoints sont préfixés `/api/`.
- **Équipe backend** : implémente les services dans `backend/` en respectant les contrats.
- **Contrats** : ils sont l'interface entre les deux équipes ; prévenir l'autre équipe avant d'en modifier un.
- **Git** : une branche courte par fonctionnalité (`backend/...`, `frontend/...`), fusionnée dans `main` par Pull Request. Messages de commit : `Prénom: description`.

---

## Licence

Copyright 2026 Équipe MESSAF.

DLNUF est un logiciel libre publié sous la **licence Apache, version 2.0** : chacun peut l'utiliser, le modifier et le redistribuer, y compris à des fins commerciales, à condition de conserver la mention de copyright et le texte de la licence. Voir les fichiers [LICENSE](LICENSE) et [NOTICE](NOTICE).
