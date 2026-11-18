# DLNUF (Dites-le-nous une fois)

Plateforme d'interopérabilité qui permet aux administrations du Burkina Faso d'échanger les données des citoyens entre elles, au lieu de demander aux citoyens de transporter des documents d'un guichet à l'autre. Le citoyen fournit ses informations une seule fois. Chaque échange ne laisse passer que les champs utiles à la démarche, exige le consentement explicite du citoyen quand le demandeur est une entité privée, et reste visible du citoyen, qui sait qui a consulté quoi et pourquoi.

**DLNUF** est le socle d'interopérabilité : l'API centrale que les administrations appellent (passerelle d'échange, consentement, journal, branchement des registres). **e-FASO** est le portail du citoyen, une application construite sur ce socle.

Projet réalisé pour le Hackathon des Universités 2026 (MTDPCE, Semaine du Numérique), challenge 02 « Dites-le-nous une fois ».

---

## Pour le jury : évaluer en 10 minutes

1. **Démarrer** : `docker compose up -d --build` (une seule commande), puis ouvrir l'espace usager http://localhost:3020, l'interface de test des administrations http://localhost:3020/pages/test.html et la documentation des API http://localhost:3010.
2. **Ne transmettre que l'utile (« majeur : oui »)** : dans l'interface de test, choisir « Université Joseph KI-ZERBO », « Inscription universitaire » et l'IUE d'Amadou (`784302956148`). L'université reçoit seulement `est_majeur: true` et la nationalité, jamais la date de naissance.
3. **Montrer à l'usager qui a consulté ses données** : se connecter avec Amadou (`784302956148` / `Amadou2026!`), ouvrir « Journal d'accès » : administration, démarche, données transmises, date, accès direct ou par consentement. Le journal est chaîné par empreintes : une trace modifiée directement en base se voit (voir « Journal chaîné » plus bas). Pour le consentement : même interface de test avec « Banque Atlantique », puis « Consentements » côté Amadou.
4. **Tenir quand un registre tombe** : `docker compose stop registre-justice`. En quelques secondes, l'état des registres de l'interface de test le montre hors service ; l'université reste servie ; la police (« Émission de passeport ») est mise en attente, sans rien recevoir. `docker compose start registre-justice` : au retour, « Vérifier le statut » de la police donne le dossier complet, sans nouvelle demande.
5. **Brancher vos registres** : un registre se branche par configuration, sans code. Procédure pas à pas : [docs/brancher-un-registre.md](docs/brancher-un-registre.md).
6. **Tout rejouer automatiquement** : `node tests/interoperabilite/test-interop.js` (stack principale arrêtée) : procédures, remplacement des registres, registres d'un autre format, panne en direct, donnée numérique manquante.

Livrables : [vidéo de démonstration](https://drive.google.com/drive/folders/1SSAkeUu0k1GZuOAAao0BR8OXZCI1ydFg?usp=sharing) (dossier Google Drive), [rapport technique](docs/rapport-technique.md), [matrice de contribution](docs/matrice-contribution.md), [contrats OpenAPI](docs/) (affichés sur http://localhost:3010), licence [Apache 2.0](LICENSE).

---

## Démarrage rapide

**Prérequis** : [Docker Desktop](https://www.docker.com/products/docker-desktop/) (ou Docker Engine avec Docker Compose v2). Rien d'autre à installer.

```bash
docker compose up -d --build
```

Cette commande unique construit et démarre PostgreSQL et les 9 services (3 registres, passerelle, consentement, journal, espace usager, site web, documentation). Chaque service crée ses tables et charge ses données de démonstration au démarrage. Le premier lancement prend quelques minutes (téléchargement des dépendances).

Vérifier que tout tourne :

```bash
docker compose ps
curl http://localhost:3000/api/sante
# {"statut":"ok","service":"espace-usager"}
```

| Service | URL | Rôle |
|---------|-----|------|
| **Espace usager (site web)** | **http://localhost:3020** | e-FASO, le portail du citoyen ; interface de test des administrations sur `/pages/test.html` |
| Espace usager (BFF) | http://localhost:3000/api | Seul point d'entrée du frontend citoyen |
| Registre état-civil | http://localhost:3001/api | Naissance, filiation, nationalité |
| Registre justice | http://localhost:3002/api | Casier judiciaire, certificat de nationalité |
| Registre fiscal | http://localhost:3003/api | IFU, situation fiscale |
| Passerelle DLNUF | http://localhost:3004/api | API centrale, point d'entrée des administrations |
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
| Ibrahim OUEDRAOGO | `291047583620` | `Ibrahim2026!` | Père d'Amadou, tuteur d'Awa et Moussa ; les actes de ses parents ne sont pas encore numérisés (donnée numérique manquante) |
| Fatimata SAWADOGO | `638501274093` | `Fatimata2026!` | Mère d'Amadou |
| Awa OUEDRAOGO | `456123789012` | aucun | Mineure (12 ans), compte géré par Ibrahim |
| Moussa OUEDRAOGO | `527814903361` | aucun | Mineur (16 ans), transfert de compte recommandé |
| Salif OUEDRAOGO | `316580942751` | pas de compte | Majeur, connu de l'état civil mais pas encore inscrit : sert à l'inscription en direct |
| Aïcha OUEDRAOGO | `873045129604` | aucun | Fille de Salif (5 ans), rattachée automatiquement à son père quand il s'inscrit |

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

Les exemples utilisent `curl` dans un terminal bash (Git Bash sous Windows). L'interface de test du BFF (`/api/test/*`) permet de jouer le rôle d'une administration sans gérer de jeton.

### 1. Inscription universitaire (administration publique, accès direct)

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000001","iue_citoyen":"784302956148","demarche_id":"inscription-universite"}'
```

L'université reçoit uniquement `{"etat-civil":{"est_majeur":true,"nationalite":"Burkinabè"}}`, et l'accès est inscrit au journal d'Amadou.

### 2. Émission de passeport (administration publique, résolution en cascade)

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000002","iue_citoyen":"784302956148","demarche_id":"emission-passeport"}'
```

La réponse contient l'état civil complet, les données de justice et la cascade : le casier judiciaire dépend du certificat de nationalité, qui dépend lui-même des extraits de naissance d'Amadou, de son père et de sa mère, tous `resolu`. Avec l'IUE d'Ibrahim (`291047583620`), les extraits de naissance de ses parents apparaissent en `manquant_fallback_physique` : ces actes existent sur papier mais ne sont pas encore dans le registre numérique.

### 3. Ouverture de compte bancaire (administration privée, consentement explicite)

**a. La banque fait sa demande.** Rien n'est transmis, une demande de consentement est créée :

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000004","iue_citoyen":"784302956148","demarche_id":"ouverture-compte-bancaire"}'
# réponse 202 {"type_admin":"privee","requete_id":"<REQUETE_ID>","consentement_id":"<CONSENTEMENT_ID>",...}
```

Le SMS simulé envoyé au citoyen est visible avec `docker compose logs consentement`.

**b. Amadou se connecte et accepte.**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/connexion \
  -H "Content-Type: application/json" \
  -d '{"iue":"784302956148","mot_de_passe":"Amadou2026!"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')

curl "http://localhost:3000/api/consentements?statut=en_attente" -H "Authorization: Bearer $TOKEN"

curl -X PUT http://localhost:3000/api/consentements/<CONSENTEMENT_ID> \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"decision":"accepte"}'
```

**c. La banque consulte sa requête.** Elle reçoit uniquement les 4 champs acceptés :

```bash
curl "http://localhost:3000/api/test/requetes/<REQUETE_ID>?administration_id=00000000-0000-4000-8000-000000000004"
# réponse {"statut":"complete","donnees":{"etat-civil":{"nom":"OUEDRAOGO","prenom":"Amadou","nationalite":"Burkinabè"},"fiscal":{"en_regle":true}},...}
```

**d. Amadou voit l'accès dans son journal.**

```bash
curl http://localhost:3000/api/journal -H "Authorization: Bearer $TOKEN"
```

### Mes données dans les registres

En un seul appel, tout ce que les registres savent du citoyen (ou, avec `?iue=`, d'un enfant dont il est tuteur), lu à l'instant ; une pièce absente ou un registre en panne est signalé (`disponible: false` et son code) sans bloquer le reste :

```bash
curl http://localhost:3000/api/profil/registres -H "Authorization: Bearer $TOKEN"
# {"titulaire":{"iue":"784302956148","nom":"OUEDRAOGO","prenom":"Amadou"},
#  "pieces":[{"type_piece":{"id":"attestation-fiscale",...},"disponible":true,"donnees":{...}}, ...]}
```

### Journal chaîné : une trace modifiée se voit

Chaque entrée du journal est scellée par une empreinte SHA-256 qui inclut celle de l'entrée précédente. Modifier ou supprimer une entrée, même directement en base, rompt la chaîne :

```bash
curl http://localhost:3000/api/journal/verification -H "Authorization: Bearer $TOKEN"
# {"integre":true,"entrees_verifiees":4,"vos_entrees":3,"derniere_empreinte":"...","rupture":null,...}

docker compose exec journal npm run simuler-alteration               # quelqu'un modifie une entrée d'Amadou en base
curl http://localhost:3000/api/journal/verification -H "Authorization: Bearer $TOKEN"
# {"integre":false,...,"rupture":{"rang":1,"cause":"contenu_modifie","concerne_vos_donnees":true}}

docker compose exec journal npm run simuler-alteration -- --supprimer  # ou une suppression (cause entree_supprimee)
docker compose exec journal npm run simuler-alteration -- --annuler    # remise en état de la démonstration
```

### Inscription en direct

Salif OUEDRAOGO est connu de l'état civil mais n'a pas encore de compte. Il s'inscrit en ne donnant que son IUE, un mot de passe et son téléphone :

```bash
curl -X POST http://localhost:3000/api/auth/inscription \
  -H "Content-Type: application/json" \
  -d '{"iue":"316580942751","mot_de_passe":"Salif2026!","telephone":"+22670998877"}'
# réponse 201 {"token":"...","citoyen":{"iue":"316580942751","nom":"OUEDRAOGO","prenom":"Salif",...}}
```

Son nom n'a été saisi nulle part : la plateforme l'a lu à l'état civil. Sa fille mineure Aïcha a été détectée et rattachée automatiquement à son compte :

```bash
curl http://localhost:3000/api/enfants -H "Authorization: Bearer <TOKEN_DE_SALIF>"
# réponse {"enfants":[{"iue":"873045129604","prenom":"Aïcha","age":5,"transfert_recommande":false,...}]}
```

La même inscription peut se faire depuis la documentation Swagger (http://localhost:3010, `POST /auth/inscription`, « Try it out ») : l'exemple pré-rempli est celui de Salif.

Pour rejouer la démonstration (supprime uniquement les comptes de Salif et d'Aïcha) :

```bash
docker compose exec espace-usager node scripts/reinitialiser-inscription-demo.js
```

### Cloisonnement par mission

Une administration ne peut obtenir que les données liées à sa mission. L'université qui demande un passeport est refusée :

```bash
curl -X POST http://localhost:3000/api/test/requete \
  -H "Content-Type: application/json" \
  -d '{"administration_id":"00000000-0000-4000-8000-000000000001","iue_citoyen":"784302956148","demarche_id":"emission-passeport"}'
# réponse 403 {"code":"HORS_MISSION","message":"Accès refusé : hors du domaine de mission « education » (...)"}
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
| `GET /api/requetes/{id}` | Suivre une requête ; les données arrivent après l'acceptation du citoyen, remises une seule fois (la passerelle n'en garde pas de copie) |
| `GET /api/requetes/{id}/telephone` | Obtenir le téléphone du citoyen pour le relancer (requête en attente uniquement) |
| `GET /api/demarches`, `GET /api/types-pieces`, `GET /api/types-pieces/{id}/prerequis` | Catalogue public |

---

## Brancher n'importe quel registre, et tenir quand il tombe

L'énoncé prévoit des registres fournis par le jury (état civil, nationalité, casier), dans un format qui n'est pas connu à l'avance, et une épreuve en direct où un registre tombe en panne. Conception complète : [docs/conception-interoperabilite.md](docs/conception-interoperabilite.md).

### Brancher un registre : une déclaration, pas du code

La passerelle n'a aucun registre écrit en dur. Elle lit deux fichiers, montés dans le conteneur (on les modifie sans reconstruire l'image) :

- [backend/passerelle/config/dictionnaire.yaml](backend/passerelle/config/dictionnaire.yaml) : le **dictionnaire des données**, langue commune de la plateforme (nom, type, libellé montré au citoyen, sensibilité, données calculées comme `est_majeur`) ;
- [backend/passerelle/config/catalogue-registres.yaml](backend/passerelle/config/catalogue-registres.yaml) : le **catalogue des registres** (adresse, routes, identification de la personne, correspondances entre les champs du registre et le dictionnaire, sources de secours).

Pour brancher un registre, par exemple celui du jury (procédure détaillée, avec les cas particuliers et le retour en arrière : [docs/brancher-un-registre.md](docs/brancher-un-registre.md)) :

1. Le déclarer dans le catalogue : adresse, routes, mode d'identification (`iue` ; `correspondance`, par une table IUE / identifiant du registre, pour un registre qui a ses propres identifiants, état civil compris ; ou `recherche` par nom, prénom et date de naissance), et correspondances de ses champs (conversions de dates `JJ/MM/AAAA`, de booléens `oui/non`, de codes).

   Si le registre publie un contrat OpenAPI, l'**assistant de branchement** en tire un brouillon de déclaration :

   ```bash
   docker compose exec passerelle npm run proposer-registre -- <fichier ou URL du contrat OpenAPI> <identifiant>
   ```

   Il propose l'adresse, les routes, l'identification (IUE dans la route, route de recherche, ou table de correspondance à remplir), l'emplacement de la fiche dans la réponse, les correspondances (par rapprochement des noms et des types) et les tables de valeurs (`Masculin` vers `M`). Il **n'active rien** : le registre est marqué `suspendu`, chaque correspondance est à relire, car le sens d'un champ ne se devine pas avec certitude. Le fichier doit être lisible depuis le conteneur (par exemple dans `backend/passerelle/config/`, monté sur `/app/config`), ou donné par son URL. Sous Git Bash (Windows), préfixer la commande par `MSYS_NO_PATHCONV=1`, sinon le chemin `/app/...` est réécrit en chemin Windows.
2. Le désigner dans `sources` pour les opérations qu'il sert (en premier s'il fait foi ; les suivants servent de secours et doivent être des répliques tenues par la même autorité, même `proprietaire`, ce que la passerelle vérifie au démarrage).
3. Le tester avant de l'activer :

   ```bash
   docker compose exec passerelle npm run tester-registre -- <registre> <iue>
   ```

   La commande affiche la connexion, l'identification, puis pour chaque opération les données obtenues, celles qui manquent et les champs ignorés (hors dictionnaire : ils n'entrent jamais dans la plateforme).
4. Redémarrer la passerelle : `docker compose restart passerelle`. Si le catalogue est incohérent, elle refuse de démarrer et liste les erreurs (`docker compose logs passerelle`).

`GET http://localhost:3000/api/registres` montre l'état de chaque registre ; `GET http://localhost:3000/api/dictionnaire` donne les libellés des données. Les adresses de nos trois registres restent surchargeables par `REGISTRE_ETAT_CIVIL_URL`, `REGISTRE_JUSTICE_URL` et `REGISTRE_FISCAL_URL` (fichier `.env` à la racine) ; depuis un conteneur, la machine hôte s'appelle `host.docker.internal`.

Nos registres suivent le **format recommandé** (`docs/openapi-registre-*.yaml`) : ils se branchent sans aucune correspondance.

### « Majeur : oui » : ne transmettre que l'utile

Quand un registre ne fournit qu'une date de naissance, la passerelle calcule elle-même `est_majeur`. Seule la donnée calculée est remise à l'administration et inscrite au journal ; la date de naissance ne quitte jamais la passerelle.

### Tenir quand un registre tombe

- Une sonde vérifie chaque registre toutes les 5 s ; un registre en panne est contourné immédiatement, sans attendre de délai.
- Ce qui ne dépend pas du registre en panne continue normalement (l'université reste servie si le casier tombe), et l'espace usager reste utilisable.
- Une requête qui en dépend passe `en_attente_registre` (réponse 202) : rien n'est transmis ni copié. Dès que le registre revient, la consultation suivante de `GET /api/requetes/{id}` remet le dossier complet, sans nouvelle demande.
- Une demande de pièce d'un citoyen passe `en_cours` et se termine seule au retour du registre (reprise automatique toutes les 10 s).
- Si un registre de secours (réplique du registre, tenue par la même autorité) est déclaré pour l'opération, il prend le relais.
- Tous les services redémarrent seuls après un plantage (`restart: unless-stopped`).

Pour le montrer en direct : `docker compose stop registre-justice`, une requête de la police (passeport) passe en attente pendant que l'université reste servie, puis `docker compose start registre-justice` et la police reçoit son dossier à la consultation suivante.

### Donnée numérique manquante

Une pièce peut exister sur papier sans être encore dans le registre numérique : les actes de naissance des parents d'Ibrahim n'ont jamais été saisis. La demande attend alors cette donnée (statut `fallback_physique`, affiché « donnée à numériser »). Le centre d'état civil qui détient les actes les numérise **dans le registre de l'état civil**, jamais dans la plateforme : la reprise automatique complète alors la demande, et le citoyen est notifié. Démonstration :

```bash
docker compose exec registre-etat-civil npm run numeriser-actes              # le centre d'état civil numérise les actes des parents d'Ibrahim
docker compose exec registre-etat-civil npm run numeriser-actes -- --annuler # remise à zéro de la démonstration
```

Un redémarrage du registre de l'état civil remet aussi cette démonstration à zéro (son seed est relancé) : faire la numérisation après une coupure de ce registre, pas avant.

### Test automatique

`node tests/interoperabilite/test-interop.js` rejoue tout cela sans intervention (Node 18 ou plus, stack principale arrêtée). Il démarre une stack de test séparée (projet Docker `dlnuf-interop`, base à part) avec un registre « d'une autre équipe » ([tests/interoperabilite/registre-externe.js](tests/interoperabilite/registre-externe.js)) et :

- branche ce registre à la place de l'état civil, de la justice, du fiscal, puis des trois, et rejoue les 3 procédures, les demandes de pièces et l'inscription ;
- branche, par le seul catalogue ([tests/interoperabilite/config-format-different/](tests/interoperabilite/config-format-different/)), deux registres d'un autre format : un état civil sans `est_majeur` (la passerelle le calcule), et un registre de nationalité sans IUE, avec un homonyme qui ne doit jamais être choisi au hasard ; il teste la source de secours, la commande `tester-registre`, et l'assistant `proposer-registre`, qui doit retrouver ces deux déclarations à partir des seuls contrats OpenAPI des registres ;
- branche, par des tables de correspondance ([tests/interoperabilite/config-correspondance/](tests/interoperabilite/config-correspondance/)), un état civil qui ne connaît que ses numéros d'acte (comme pivot) et le registre de nationalité, dont l'homonyme est levé par la table ;
- coupe le casier puis l'état civil en direct, vérifie que la plateforme tient, que rien ne se perd et que tout se complète au retour ;
- joue la numérisation d'une donnée manquante et la reprise automatique ;
- modifie puis supprime une entrée du journal directement en base, et vérifie que la chaîne des empreintes le détecte ;
- vérifie partout qu'aucun champ hors dictionnaire ne sort de la plateforme.

Option `--garder` pour laisser la stack de test en marche à la fin, `--sans-build` pour réutiliser les images, `--seul=<scénario>` pour rejouer un seul scénario (par exemple `--seul="panne en direct"`).

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

Les administrations appellent directement la passerelle (:3004) ; les citoyens passent par l'espace usager (:3000).

Le frontend citoyen est d'abord une application web en HTML / CSS / JavaScript. Une application mobile pourra suivre : elle utilisera le même contrat (`openapi-espace-usager.yaml`), sans aucune modification du backend, car l'authentification passe par un jeton dans l'en-tête `Authorization` et non par des cookies.

### Ce qui se passe quand une administration demande des données

1. **Droits** : l'administration doit exister, et tous les champs requis par la démarche doivent appartenir à son domaine de mission. Sinon : refus (403), rien n'est transmis.
2. **Administration publique** :
   - la passerelle résout la cascade des pièces prérequises (via la filiation à l'état civil) ;
   - elle interroge les registres en ne demandant que les champs requis ;
   - le service de minimisation retire tout champ non autorisé pour la démarche ;
   - l'accès est inscrit au journal (si le journal est indisponible, rien n'est transmis) ;
   - le citoyen est notifié (notification simulée, visible avec `docker compose logs passerelle`) et les données sont renvoyées.
3. **Administration privée** : une demande de consentement est créée et le citoyen est prévenu par SMS (rappels à 24 h et 72 h, expiration à 30 jours). Quand l'administration consulte sa requête, la passerelle vérifie la réponse du citoyen : en cas d'acceptation, seuls les champs acceptés sont transmis et l'accès est tracé ; un refus est également tracé.

### Mineurs

Le compte d'un mineur est géré par son tuteur, qui voit ses demandes de consentement, y répond et consulte son journal. Le journal distingue le titulaire des données (l'enfant) et le décideur (le tuteur). À 15 ans, le tuteur peut transférer le compte à l'enfant.

---

## Contrats API

Les spécifications OpenAPI 3.0 sont dans `docs/` et font foi.

Documentation interactive : http://localhost:3010 (Swagger UI, démarré avec le reste de la plateforme). Le menu en haut à droite permet de passer d'un contrat à l'autre. La page lit directement les fichiers de `docs/` : elle est toujours à jour. Le bouton « Try it out » permet d'appeler l'espace usager (:3000) depuis la page ; pour les autres services, utiliser `curl` (voir les exemples ci-dessus).

| Fichier | Port | Consommé par |
|---------|------|-------------|
| `openapi-espace-usager.yaml` | :3000 | Frontend (seul contrat nécessaire pour le frontend) |
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
| `REGISTRE_ETAT_CIVIL_URL`, `REGISTRE_JUSTICE_URL`, `REGISTRE_FISCAL_URL` | registres internes | Adresses de nos registres, lues par le catalogue des registres |
| `CATALOGUE_DOSSIER` | `/app/config` | Dossier du dictionnaire et du catalogue des registres, dans le conteneur de la passerelle |
| `SONDE_INTERVALLE_MS` | `5000` | Intervalle de la sonde de disponibilité des registres |
| `REPRISE_INTERVALLE_MS` | `10000` | Intervalle de la reprise automatique des demandes en attente d'un registre ou d'une donnée à numériser |

En production, changer `JWT_SECRET` et `CLE_SERVICE_INTERNE`, mettre l'adresse du frontend dans `CORS_ORIGINES`, passer `INTERFACE_TEST_ACTIVE=false` (l'interface de test peut se faire passer pour n'importe quelle administration), et ne publier que les ports de la passerelle et du BFF.

Les notifications et les SMS sont simulés et écrits dans les logs : `docker compose logs passerelle` (notification après coup d'un accès direct par une administration publique), `docker compose logs consentement` (demandes de consentement, rappels) et `docker compose logs espace-usager` (codes de mot de passe, transferts de compte, demandes complétées par la reprise automatique).

La première construction télécharge les images Docker, les paquets npm et les moteurs Prisma : une connexion internet est nécessaire. Ensuite, la plateforme fonctionne sans aucun service extérieur.

---

## Développement

### Stack

Node.js 22 + Express, PostgreSQL 16, Prisma 6, JWT + bcrypt, Docker Compose.

### Organisation du dépôt

```
docker-compose.yml        toute la plateforme en une commande
docs/                     contrats OpenAPI (source de vérité), affichés sur http://localhost:3010
backend/
├── registres/
│   ├── etat-civil/       :3001
│   ├── justice/          :3002
│   └── fiscal/           :3003
├── passerelle/           :3004
├── consentement/         :3005
├── journal/              :3006
└── espace-usager/        :3000 (BFF)
frontend/                 espace usager (équipe frontend)
```

Chaque service est autonome (son `package.json`, son `Dockerfile`, son schéma Prisma et son schéma PostgreSQL) et suit la même architecture en couches :

```
src/routes/        associe chaque URL à un controller (et à l'authentification)
src/controllers/   lit la requête, appelle un service et renvoie la réponse, sans logique métier
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

- Équipe frontend : travaille uniquement avec `openapi-espace-usager.yaml` (port 3000). Tous les endpoints sont préfixés `/api/`.
- Équipe backend : implémente les services dans `backend/` en respectant les contrats.
- Contrats : ils sont l'interface entre les deux équipes ; prévenir l'autre équipe avant d'en modifier un.
- Git : une branche courte par fonctionnalité (`backend/...`, `frontend/...`), fusionnée dans `main` par Pull Request. Messages de commit : `Prénom: description`.

---

## Licence

Copyright 2026 Équipe MESSAF.

DLNUF est un logiciel libre publié sous la licence Apache, version 2.0 : chacun peut l'utiliser, le modifier et le redistribuer, y compris à des fins commerciales, à condition de conserver la mention de copyright et le texte de la licence. Voir les fichiers [LICENSE](LICENSE) et [NOTICE](NOTICE).
