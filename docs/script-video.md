# Script de la vidéo de démonstration (3 minutes)

DLNUF (Dites-le-nous une fois), Hackathon des Universités 2026, challenge 02. Équipe MESSAF.
Réalisation (enregistrement et montage) : OUEDRAOGO Nebwaoga Lionnel. Script : SANOU Tolo Thède Axel.

Fil conducteur : les trois points de l'épreuve en direct (ne transmettre que l'utile, montrer à l'usager qui a consulté ses données, tenir quand un registre tombe), puis le branchement des registres et le bien commun. Environ 380 mots de voix off, soit 2 minutes 40 à un débit posé : le reste laisse le temps des attentes à l'écran (panne et retour du registre).

## Avant d'enregistrer

1. **Repartir de données propres** (les images sont construites, aucune connexion n'est nécessaire) :
   ```bash
   docker compose down -v
   docker compose up -d
   ```
   Attendre environ 30 secondes, puis vérifier que http://localhost:3000/api/registres montre les trois registres `disponible`.
2. **Ouvrir quatre onglets ou fenêtres** :
   - A : interface de test, http://localhost:3020/pages/test.html ;
   - B : espace usager, connecté avec Amadou (`784302956148` / `Amadou2026!`) ;
   - C : un terminal à la racine du dépôt, commandes déjà tapées ;
   - D : la documentation des API, http://localhost:3010.
3. **Dépend de l'issue #24** : l'état des registres dans l'interface de test et l'affichage de « en attente du registre ». Si ce n'est pas fusionné au moment d'enregistrer, montrer à la place la réponse JSON de l'interface de test et http://localhost:3000/api/registres dans un onglet.
4. Faire une répétition complète sans enregistrer : la sonde met jusqu'à 5 secondes à voir un registre tomber ou revenir.

## Déroulé

### 0:00 à 0:15 : le problème

**À l'écran** : page d'accueil de l'espace usager.

**Voix off** : « Au Burkina Faso, pour une inscription, un passeport ou un compte bancaire, le citoyen court d'un guichet à l'autre avec ses papiers. Pourtant, ces informations, l'État les a déjà. DLNUF, Dites-le-nous une fois, fait circuler les pièces entre administrations, pas les usagers. »

### 0:15 à 0:30 : la solution

**À l'écran** : le schéma d'architecture du rapport technique (§ 4.1), ou la liste des contrats sur Swagger (onglet D).

**Voix off** : « Une administration demande une démarche pour un citoyen, désigné par son identifiant unique. Notre passerelle lit dans les registres seulement ce qui est utile, applique le consentement, inscrit l'accès au journal du citoyen, et remet les données une seule fois, sans en garder de copie. »

### 0:30 à 0:55 : ne transmettre que l'utile

**À l'écran** (onglet A) : administration « Université Joseph KI-ZERBO », démarche « Inscription universitaire », IUE d'Amadou, « Envoyer la requête ». Montrer la réponse : `est_majeur: true`, `nationalite: Burkinabè`.

**Voix off** : « L'université inscrit Amadou. Elle reçoit deux réponses : majeur, oui ; nationalité, burkinabè. Rien d'autre. Et si un registre ne fournit qu'une date de naissance, c'est notre passerelle qui calcule « majeur » : la date de naissance, elle, ne sort jamais. »

### 0:55 à 1:30 : montrer qui a consulté, et le consentement

**À l'écran** (onglet A) : administration « Banque Atlantique », démarche « Ouverture de compte bancaire », IUE d'Amadou, « Envoyer la requête » : la réponse indique qu'un consentement est attendu.
Puis (onglet B) : « Consentements », accepter la demande de la banque.
Puis (onglet A) : « Vérifier le statut de la requête » : la banque reçoit nom, prénom, nationalité et « en règle ». L'accès n'entre au journal qu'à ce moment, quand les données sont remises : ne pas sauter cette étape.
Puis (onglet B) : « Journal » : l'accès de l'université (direct) et celui de la banque (consentement).

**Voix off** : « Une banque, elle, est une entité privée : rien ne lui est transmis sans l'accord d'Amadou. Il reçoit la demande dans son espace, voit qui demande quoi et pourquoi, et accepte. La banque reçoit alors ces quatre données, et seulement celles-là. Dans son journal, Amadou voit tout : qui a consulté ses données, lesquelles, pour quelle démarche et quand. Personne ne peut effacer ces traces. »

### 1:30 à 2:20 : tenir quand un registre tombe

**À l'écran** (onglet C) : `docker compose stop registre-justice`. Attendre 5 secondes.
Onglet A : l'état des registres montre la justice hors service. Université pour Amadou : toujours servie. Police nationale, « Émission de passeport », Amadou : en attente du registre.
Onglet C : `docker compose start registre-justice`. Attendre 10 secondes.
Onglet A : « Vérifier le statut de la requête » de la police : dossier complet.

**Voix off** : « Coupons le registre de la justice, en direct. La plateforme le détecte en quelques secondes. L'université, qui n'en a pas besoin, est toujours servie. La police, qui en a besoin pour un passeport, n'obtient pas un dossier à moitié : sa requête est mise en attente, rien n'est transmis, rien n'est perdu. Rallumons le registre. La police consulte sa requête : le dossier est complet, sans qu'elle ait refait sa demande. »

### 2:20 à 2:45 : brancher n'importe quel registre

**À l'écran** (onglet C) : `backend/passerelle/config/catalogue-registres.yaml` ouvert, puis `docker compose exec passerelle npm run tester-registre -- justice 784302956148`.

**Voix off** : « Les registres du jury ont un format que nous ne connaissons pas. Notre passerelle n'en a aucun écrit en dur : un registre se branche en le déclarant dans un catalogue, avec la correspondance de ses champs, puis en le testant. Notre test automatique branche ainsi des registres d'autres formats, coupe des registres en direct, et passe 367 vérifications sans échec. »

### 2:45 à 3:00 : un bien commun

**À l'écran** (onglet D) : Swagger, puis le terminal avec `docker compose up -d`.

**Voix off** : « DLNUF est libre, sous licence Apache 2.0. Chaque couche a son contrat OpenAPI, et toute la plateforme démarre en une seule commande. Un socle prêt à être réutilisé par l'administration. Dites-le-nous une fois : c'est à l'État de faire circuler les pièces, pas aux citoyens. »

## Si le temps manque au montage

Couper dans cet ordre : le passage Swagger de 0:15 (garder la voix off sur l'écran d'accueil), puis le catalogue de 2:20 (garder seulement `tester-registre`). Ne jamais couper la panne en direct : c'est le cœur de l'épreuve.
