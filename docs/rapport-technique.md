# Rapport technique : DLNUF (Dites-le-nous une fois)

Hackathon des Universités 2026 (MTDPCE, Semaine du Numérique), challenge 02.
Équipe MESSAF : SANOU Tolo Thède Axel (backend), OUEDRAOGO Nebwaoga Lionnel (frontend). 18 novembre 2026. Code source sous licence Apache 2.0.

## 1. Résumé

DLNUF est un socle d'interopérabilité libre qui fait circuler les pièces entre administrations au lieu de faire circuler les citoyens entre les guichets. Une administration demande une démarche pour un citoyen, désigné par son IUE (identifiant unique électronique). La plateforme lit dans les registres uniquement les données utiles à cette démarche, applique les règles de consentement, inscrit l'accès au journal du citoyen et remet les données une seule fois, sans en garder de copie.

Trois réponses à l'épreuve en direct structurent la solution :

- **Ne transmettre que l'utile.** Chaque démarche déclare ses données ; tout le reste est filtré. La plateforme calcule elle-même les données dérivées : l'université reçoit « majeur : oui », jamais la date de naissance.
- **Montrer à l'usager qui a consulté ses données.** Chaque accès est inscrit dans un journal en ajout seul, que le citoyen consulte depuis son espace, y compris pour ses enfants mineurs.
- **Tenir quand un registre tombe.** Un registre en panne est détecté et contourné ; ce qui n'en dépend pas continue ; ce qui en dépend est mis en attente sans rien perdre, puis se complète seul à son retour.

Les registres du jury ont un format inconnu à l'avance. La plateforme s'y branche donc **par configuration** : un dictionnaire des données et un catalogue des registres décrivent quoi lire, où et comment. Brancher un registre, c'est le déclarer, pas écrire du code.

Toute la plateforme démarre en une commande (`docker compose up`). Un test automatique rejoue les trois procédures, le remplacement des registres, deux registres d'un autre format, la panne en direct et la numérisation d'une donnée manquante : **363 vérifications réussies, 0 échec** au 18 novembre 2026.

## 2. L'énoncé et ce que nous en avons retenu

| Énoncé | Ce que nous en avons retenu |
|--------|-----------------------------|
| « Faire circuler les pièces entre administrations plutôt que les usagers entre les guichets, dans le respect de leurs droits sur leurs données. » | Les administrations interrogent une passerelle ; le citoyen n'apporte rien. Ses droits (consentement, journal, accès à ses pièces) s'exercent dans un espace usager dédié. |
| Données : « registres simulés fournis par le jury (état civil, nationalité, casier), peuplés de citoyens fictifs. » | Les registres ne nous appartiennent pas : la plateforme ne doit supposer ni leurs routes, ni leurs noms de champs, ni même qu'ils connaissent l'IUE. Nos trois registres simulés servent de référence et de démonstration. |
| Épreuve : « ne transmettre que l'utile (« majeur : oui ») » | Minimisation par démarche et données calculées par la passerelle. |
| Épreuve : « montrer à l'usager qui a consulté ses données » | Journal de traçabilité en ajout seul, lisible par le citoyen. |
| Épreuve : « tenir quand un registre tombe en panne » | Sonde, contournement, mise en attente sans perte, reprise automatique, redémarrage des services. |
| Bien commun : « un socle d'interopérabilité libre, avec ses règles de consentement et de traçabilité, réutilisable par l'administration. » | Licence Apache 2.0, contrats OpenAPI pour chaque couche, déploiement en une commande, branchement d'un registre sans code. |

## 3. Principes de conception

1. **Les registres restent maîtres de leurs données.** La plateforme ne copie rien. Elle lit au moment de la remise, remet une seule fois, et seule la trace de l'accès reste au journal.
2. **Un vocabulaire commun.** Toute la plateforme (démarches, minimisation, consentement, cloisonnement, journal, espace usager) parle la langue d'un dictionnaire des données. Chaque registre est traduit vers ce dictionnaire.
3. **Brancher, c'est déclarer.** Un registre se branche en le décrivant dans le catalogue, sans écrire de code ni reconstruire d'image.
4. **Ne transmettre que l'utile.** Une donnée sort seulement si la démarche l'a déclarée. Les données brutes qui servent à un calcul ne sortent jamais.
5. **Pas de trace, pas de données.** Si le journal ne peut pas enregistrer l'accès, rien n'est transmis.
6. **Tenir.** Une panne n'arrête que ce qui en dépend, rien ne se perd, et tout reprend seul.

## 4. Architecture

### 4.1 Cinq couches, neuf services

```
Citoyen (navigateur)
  └─▶ Frontend HTML/CSS/JS :3020
        └─▶ Espace usager (BFF) :3000
              ├─▶ Consentement :3005   répondre aux demandes de consentement
              ├─▶ Journal :3006        lire son journal et celui de ses enfants
              └─▶ Passerelle :3004     identité, cascade des pièces, contenu des pièces

Administration (API REST, jeton)
  └─▶ Passerelle :3004                 dictionnaire des données, catalogue des registres
        ├─▶ Consentement :3005         règles de minimisation, demandes de consentement
        ├─▶ Journal :3006              inscription de chaque accès
        └─▶ Registres                  état civil :3001, justice :3002, fiscal :3003,
                                       ou tout registre déclaré au catalogue
```

| Couche | Service | Port | Rôle |
|--------|---------|------|------|
| 1. Registres | `registre-etat-civil`, `registre-justice`, `registre-fiscal` | 3001 à 3003 | Registres simulés (naissance, filiation, nationalité, casier, situation fiscale), exposés en JSON. Implémentation de référence du format recommandé. |
| 2. Passerelle | `passerelle` | 3004 | Point d'entrée des administrations. Droits et cloisonnement, résolution des cascades, lecture et traduction des registres, données calculées, consentement, journal, remise unique, tenue en panne. |
| 3. Consentement et minimisation | `consentement` | 3005 | Règles « données autorisées par démarche », demandes de consentement, rappels SMS à 24 h et 72 h, expiration à 30 jours. |
| 4. Journal | `journal` | 3006 | Traçabilité de chaque accès, en ajout seul. |
| 5. Espace usager | `espace-usager` (BFF) et `frontend` | 3000 et 3020 | Portail du citoyen : journal, consentements, pièces, enfants, compte. |
| Documentation | `documentation` (Swagger UI) | 3010 | Les sept contrats OpenAPI, lus directement depuis `docs/`. |

### 4.2 Choix techniques

- **Node.js 22 et Express** pour tous les services, **PostgreSQL 16**, **Prisma 6** (version figée), **Docker Compose**. Frontend en HTML, CSS et JavaScript sans framework.
- **Un service, un schéma.** Tous les services partagent une instance PostgreSQL, mais chacun a son propre schéma et ne lit jamais les tables d'un autre : il passe par son API. Un service peut donc être remplacé ou déployé ailleurs sans toucher aux autres.
- **Architecture en couches dans chaque service** : routes, controllers (aucune logique métier), services (règles métier), models (accès aux données) et clients (appels aux autres services). Erreurs uniformes `{ code, message }`.
- **Contrats d'abord.** Chaque couche a son contrat OpenAPI 3.0 dans `docs/`. Les contrats sont la source de vérité entre frontend et backend, et entre la plateforme et les registres.
- **Un BFF (Backend for Frontend)** entre le navigateur et la plateforme : le frontend ne parle qu'à lui, avec un seul contrat. La même API servira une future application mobile (aucune dépendance au navigateur : pas de cookie, jeton dans l'en-tête `Authorization`).

### 4.3 Le parcours d'une requête

1. L'administration envoie `POST /api/requetes` à la passerelle : une démarche (par exemple `inscription-universite`) et l'IUE du citoyen, avec son jeton.
2. **Droits.** La passerelle vérifie que l'administration est connue et que les données de la démarche relèvent de sa mission (cloisonnement, sinon `403 HORS_MISSION`).
3. **Données voulues.** Le service consentement donne les données de la démarche ; le dictionnaire donne l'opération qui fournit chacune.
4. **Cascade.** Si la démarche demande des pièces qui en exigent d'autres (le casier exige le certificat de nationalité, qui exige les extraits de naissance du citoyen et de ses parents), la passerelle résout l'arbre en suivant la filiation lue à l'état civil.
5. **Lecture.** Pour chaque opération, le catalogue désigne le premier registre disponible qui sait fournir les données. La passerelle identifie la personne dans ce registre, lit, traduit la réponse vers le dictionnaire et calcule les données dérivées.
6. **Minimisation.** Seules les données de la démarche restent.
7. **Consentement.** Administration publique : accès direct. Administration privée : la requête attend l'accord explicite du citoyen.
8. **Journal, puis remise.** L'accès est inscrit au journal, puis les données sont remises une seule fois. La passerelle n'en garde aucune copie.

## 5. Brancher n'importe quel registre

C'est la réponse à la contrainte principale de l'énoncé : les registres du jury ont un format que nous ne connaissons pas.

### 5.1 Le dictionnaire des données

Fichier `backend/passerelle/config/dictionnaire.yaml`. C'est la langue commune de la plateforme : chaque donnée a un domaine (`etat-civil`, `justice`, `fiscal`), une opération qui la fournit, un type, un **libellé** montré au citoyen (« Majeur » plutôt que `est_majeur`) et une **sensibilité** (`publique`, `personnelle`, `sensible`).

```yaml
etat-civil:
  date_naissance: { operation: fiche, type: date, libelle: "Date de naissance", sensibilite: personnelle }
  est_majeur:     { operation: fiche, type: booleen, libelle: "Majeur", sensibilite: personnelle,
                    calcul: { regle: age_au_moins, a_partir_de: date_naissance, seuil: 18 } }
```

**Gouvernance.** Dans la réalité, le dictionnaire est porté par l'autorité du référentiel d'interopérabilité, avec l'avis de la CIL sur la sensibilité. Une administration propose une donnée ; l'autorité vérifie qu'elle n'existe pas déjà sous un autre nom ; la donnée est ajoutée avec une nouvelle version. On ne renomme jamais une donnée et on n'en change jamais le sens : on en ajoute une nouvelle et on marque l'ancienne obsolète.

### 5.2 Le catalogue des registres

Fichier `backend/passerelle/config/catalogue-registres.yaml`. Il dit, pour chaque registre :

- son **adresse**, son **délai** maximal de réponse et sa route de **sonde** ;
- comment y **identifier une personne** (§ 5.3) ;
- ses **routes**, une par opération (lectures `GET` uniquement) ;
- ses **correspondances** : pour chaque donnée du dictionnaire, le champ du registre (chemin possible, par exemple `identite.nom`) et la conversion (`date` pour `JJ/MM/AAAA`, `booleen` pour `oui/non`, `nombre`, ou une table de valeurs comme `{ Masculin: M, Féminin: F }`).

Il dit aussi, pour chaque opération, la liste ordonnée des **sources** : le premier registre fait foi, les suivants sont des **sources de secours**. Exemple : `justice.nationalite: [nationalite-jury, justice]`. Une source de secours est une **réplique** du registre de référence (serveur ou site de secours), tenue par la **même autorité** : la passerelle vérifie au démarrage que les sources d'une opération ont le même propriétaire. Ce n'est jamais le registre d'une autre administration qui détiendrait aussi la donnée : elle pourrait être périmée, et le journal, qui enregistre le domaine consulté, masquerait son origine. Dans notre configuration, chaque opération n'a qu'une source.

Un champ que le registre envoie sans correspondance **n'entre jamais dans la plateforme**. Le catalogue et le dictionnaire sont validés au démarrage : routes, sources, correspondances vers des données existantes, cohérence avec les démarches et les missions. S'ils sont incohérents, la passerelle refuse de démarrer et liste toutes les erreurs.

### 5.3 Identifier une personne : l'IUE comme pivot

Toute requête désigne le citoyen par son IUE, sans exception : c'est l'identifiant que les administrations doivent adopter. Pour un registre qui ne l'a pas encore, le catalogue dit comment retrouver la personne.

| Mode | Fonctionnement |
|------|----------------|
| `iue` | Le registre accepte l'IUE directement. C'est la cible, et le cas de nos registres. |
| `recherche` | La passerelle lit nom, prénom et date de naissance à l'état civil (par l'IUE), cherche la personne dans le registre et en tire son identifiant local. Pour les bases anciennes, sans IUE. |

**Règle de sûreté du mode `recherche`** : il faut exactement un résultat, la plateforme ne devine jamais. Avec zéro résultat, la personne n'est pas dans le registre numérique : c'est une donnée numérique manquante (§ 10). Avec plusieurs résultats (homonymes), la pièce n'est pas lue : on ne transmet jamais les données d'une autre personne. Lever cette ambiguïté demande le mode `correspondance` (§ 17).

### 5.4 Brancher un registre en quatre étapes

1. **Déclarer** le registre au catalogue : adresse, identification, routes, correspondances.
2. **Le désigner** dans `sources` pour les opérations qu'il sert.
3. **Le tester** avant de l'activer :

   ```
   docker compose exec passerelle npm run tester-registre -- <registre> <iue>
   ```

   La commande affiche la connexion, l'identification puis, pour chaque opération, les données obtenues, les données manquantes et les champs ignorés.
4. **L'activer** : `docker compose restart passerelle`. Les fichiers sont montés dans le conteneur : aucune image n'est reconstruite.

`GET /api/registres` montre ensuite l'état de chaque registre ; `GET /api/dictionnaire` donne les libellés. Nos trois registres suivent le **format recommandé** (contrats `docs/openapi-registre-*.yaml`) et se branchent sans aucune correspondance.

## 6. Ne transmettre que l'utile

**Minimisation par démarche.** Chaque démarche déclare les données dont elle a besoin, par domaine (table `ChampsDemarche` du service consentement). Le filtre ne laisse passer que ces données. Il n'y a pas de « mode minimisé » ou « complet » : seulement un filtre plus ou moins large selon la démarche.

| Démarche | Administration | Données transmises |
|----------|----------------|--------------------|
| Inscription universitaire | Université Joseph KI-ZERBO (publique) | `est_majeur`, `nationalite` |
| Émission de passeport | Direction de la police nationale (publique) | état civil complet, casier judiciaire, certificat de nationalité |
| Ouverture de compte bancaire | Banque Atlantique (privée) | `nom`, `prenom`, `nationalite`, `en_regle` (fiscal) |

**Données calculées.** Quand une démarche demande une donnée calculée et que le registre ne la fournit pas, la passerelle la calcule à partir de la donnée source. Règles disponibles : `age_au_moins` (âge révolu ; `est_majeur` à partir de `date_naissance`) et `liste_vide` (`casier_vierge` à partir de la liste des condamnations). La date de naissance est lue mais ne quitte jamais la passerelle : seule la réponse « majeur : oui » est remise et inscrite au journal.

**Cloisonnement par mission.** Une administration publique ne voit que les données liées à sa mission (table `AccesMission`) : l'université (éducation) ne voit pas le fiscal. Une démarche hors mission est refusée (`403 HORS_MISSION`).

**Remise unique.** Les données partent dans une seule réponse : celle du `POST /requetes` pour une administration publique, la première consultation de `GET /requetes/{id}` après l'accord du citoyen pour une privée. Ensuite, la requête ne contient plus que son statut. La plateforme n'est pas un entrepôt de données.

## 7. Consentement

| Type d'administration | Accès | Information du citoyen |
|-----------------------|-------|------------------------|
| Publique | Direct, dans les limites de sa mission | Notification après coup, et entrée au journal |
| Privée | Sur autorisation explicite | Demande de consentement avant toute transmission |

Pour une administration privée :

1. La requête crée une demande de consentement (réponse `202 en_attente_consentement`). Le citoyen est prévenu par SMS et sur son espace.
2. Il voit qui demande, quelles données et pour quelle démarche. Il accepte ou refuse.
3. Sans réponse, des rappels SMS partent à 24 h et à 72 h ; la demande expire après 30 jours.
4. Si la demande tarde, l'administration peut obtenir le numéro de téléphone du citoyen par la passerelle pour l'appeler (`GET /requetes/{id}/telephone`, requête en attente uniquement).
5. Accord ou refus, la décision est inscrite au journal. En cas d'accord, les données sont remises à la consultation suivante de l'administration.

Le tuteur d'un mineur répond pour lui. Il perd ce droit dès qu'il a transféré le compte à l'enfant.

## 8. Traçabilité : montrer qui a consulté

Le journal enregistre **chaque accès** : quelle administration, quelles données de quels registres, pour quelle démarche, quand, et par quel type d'accès (direct ou consentement).

- **Ajout seul.** Le service journal n'a qu'une route d'écriture (`POST /journal/enregistrer`, appelée par la passerelle) : aucune entrée n'est modifiée ni supprimée. Il conserve une photo figée des noms (administration, démarche), pour que le journal reste lisible même si le catalogue change.
- **Double traçabilité.** Chaque entrée porte le **titulaire** des données et le **décideur**. Pour un mineur dont le tuteur a répondu au consentement, le titulaire est l'enfant et le décideur le tuteur.
- **Visible par le citoyen.** Le citoyen consulte tout son journal depuis son espace, et celui de ses enfants mineurs, avec une recherche et des filtres par période et par type d'accès. Le dictionnaire fournit le libellé de chaque donnée (`GET /api/dictionnaire` : « Majeur » plutôt que `est_majeur`) ; son affichage dans le journal et les consentements est en cours d'intégration au frontend.
- **Pas de trace, pas de données.** Si le journal est indisponible, la passerelle ne transmet rien.

## 9. Tenir quand un registre tombe

**Détection.** Chaque registre est `disponible` ou `hors_service`. Un appel sans réponse dans le délai déclaré (2 s par défaut), ou une erreur 5xx, le passe `hors_service`. Une sonde l'appelle toutes les 5 s et le repasse `disponible` dès qu'il répond.

**Contournement immédiat.** Un registre `hors_service` n'est plus appelé : les requêtes suivantes sont traitées sans attendre de délai. Si une **source de secours** (réplique tenue par la même autorité, § 5.2) est déclarée pour l'opération, elle prend le relais : c'est une bascule, pas une répartition de charge.

**Ce qui ne dépend pas du registre continue.** Si le casier tombe, l'université (qui ne lit que l'état civil) reste servie. L'espace usager reste utilisable : connexion, journal, consentements, tableau de bord.

**Ce qui en dépend attend, sans rien perdre.** La règle est « tout ou rien » : une requête qui a besoin d'un registre en panne ne reçoit pas de dossier partiel. Elle passe `en_attente_registre` (réponse `202`, avec la liste des registres attendus). Rien n'est transmis, rien n'est copié, rien n'est inscrit au journal. Au retour du registre, la consultation suivante de `GET /requetes/{id}` reprend là où la requête s'était arrêtée, sans que l'administration refasse sa demande.

| Situation | Statut, puis au retour du registre |
|-----------|------------------------------------|
| Administration publique, registre en panne | `en_attente_registre`, puis `complete` |
| Administration privée, état civil en panne au dépôt | `en_attente_registre`, puis `en_attente_consentement` |
| Administration privée, consentement accepté, registre en panne | `en_attente_registre`, puis `complete` |
| Citoyen inconnu, découvert à la reprise | `echouee` |

**Reprise automatique des demandes des citoyens.** Une demande de pièce qui touche un registre en panne passe `en_cours`. L'espace usager relance toutes les 10 s les demandes en attente ; au retour du registre, la demande se complète et le citoyen est prévenu par SMS.

**Services.** Tous les services redémarrent seuls après un plantage (`restart: unless-stopped`).

**Visibilité.** `GET /api/registres` donne l'état de chaque registre et depuis quand.

## 10. Les cascades et les données numériques manquantes

Une pièce peut en exiger d'autres. Exemple : Amadou demande un casier judiciaire.

```
Casier judiciaire (Amadou)
  └── Certificat de nationalité (Amadou)
       ├── Extrait de naissance (Amadou)
       ├── Extrait de naissance (père d'Amadou)
       └── Extrait de naissance (mère d'Amadou)
```

La passerelle détecte les prérequis, trouve les parents par la filiation de l'état civil et vérifie chaque pièce dans son registre. Le citoyen ne fournit rien.

**Donnée numérique manquante.** Une pièce peut exister sur papier sans être encore dans le registre numérique : c'est le cas des actes anciens jamais saisis, par exemple l'acte de naissance d'un parent. La plateforme ne l'invente pas et ne la stocke pas à la place du registre. La demande passe `fallback_physique` (affiché « donnée à numériser ») : la plateforme informe le citoyen de la pièce qui manque, pour qui, et de la démarche à suivre, décrite pour chaque type de pièce dans le catalogue (par exemple, pour un extrait de naissance : s'adresser au centre d'état civil du lieu de naissance, ou obtenir d'abord un jugement supplétif si la naissance n'a jamais été déclarée). Elle ne recueille aucune information pour l'orienter : son rôle est d'informer. L'administration qui détient l'acte (pour l'état civil, le centre d'état civil) **le numérise dans son registre**, là où la donnée doit vivre. La reprise automatique trouve alors la pièce, la demande se complète et le citoyen est prévenu. Une donnée manquante est ainsi numérisée **une fois**, puis circule.

Démonstration : `docker compose exec registre-etat-civil npm run numeriser-actes` simule la numérisation des actes des parents d'Ibrahim.

**Un outil de pilotage de la numérisation.** Chaque demande en attente d'une donnée numérique manquante dit précisément quelle pièce manque et combien de démarches elle bloque. Agrégées et anonymisées, ces attentes indiquent à l'État où accentuer la numérisation : quels types d'actes, quels registres, avec quel effet sur les démarches des citoyens. Numériser en priorité ce qui bloque le plus de démarches, plutôt que tout numériser dans l'ordre des archives. Les données existent déjà dans la plateforme ; leur restitution sous forme de statistiques est une perspective (§ 17).

## 11. L'espace usager

L'espace usager sert à une seule chose : **exercer ses droits sur ses données**.

| Pilier | Fonctions |
|--------|-----------|
| **Savoir** | Journal : qui a consulté quoi, pourquoi, quand, en accès direct ou par consentement. Tableau de bord : consentements en attente, demandes en cours, accès récents. Pour une demande qui attend un registre : « un registre est momentanément indisponible, votre demande reprendra automatiquement ». |
| **Décider** | Consentements : accepter ou refuser les demandes des administrations privées. |
| **Accéder** | Mes pièces : consulter ses propres pièces, lues dans les registres à chaque consultation, et les imprimer comme document informatif non officiel. |
| **Protéger ses enfants** | Le tuteur gère les consentements et le journal de ses enfants mineurs. À 15 ans, la plateforme recommande de transférer le compte à l'enfant. |
| Compte | Inscription par IUE (le nom est lu à l'état civil, pas saisi ; les enfants mineurs sont rattachés automatiquement par la filiation), connexion, récupération du mot de passe par SMS. |

Le contrôle d'accès porte sur le **titulaire** des données : un citoyen voit ses pièces et celles des enfants dont il est **actuellement** tuteur, la tutelle étant relue en base à chaque appel. Après un transfert de compte, l'ancien tuteur perd l'accès.

## 12. Sécurité

- **Authentification des citoyens** : IUE et mot de passe, haché avec bcrypt. La connexion compare toujours un hachage, même pour un IUE inconnu, pour ne pas révéler quels comptes existent. Code de récupération par SMS, à durée limitée et limité à 5 essais.
- **Jetons** : JWT signés en HS256. Jeton citoyen émis par le BFF (IUE et liste des enfants sous tutelle) ; jeton d'administration pour la passerelle (identifiant de l'administration).
- **Routes internes** entre la passerelle et le BFF protégées par une clé partagée (`X-Cle-Service`), en plus du réseau interne.
- **Moindre exposition** : en production, seuls la passerelle (administrations) et le BFF (citoyens) sont publiés ; les registres, le consentement, le journal et la base restent sur le réseau interne.
- **Configuration de production** : changer `JWT_SECRET` et `CLE_SERVICE_INTERNE`, limiter `CORS_ORIGINES` à l'adresse du frontend, désactiver l'interface de test (`INTERFACE_TEST_ACTIVE=false`), qui peut se faire passer pour n'importe quelle administration.
- **Données** : aucune copie des données transmises ; un champ hors dictionnaire n'entre jamais dans la plateforme ; un citoyen ne peut lire que ses données et celles de ses enfants sous tutelle.

## 13. Les trois procédures de bout en bout

**1. Inscription universitaire (administration publique, accès direct).** L'université demande `inscription-universite` pour Amadou. Elle reçoit uniquement `{"etat-civil": {"est_majeur": true, "nationalite": "Burkinabè"}}`. L'accès apparaît dans le journal d'Amadou.

**2. Émission de passeport (administration publique, cascade).** La police demande `emission-passeport`. La passerelle résout la cascade (casier, certificat de nationalité, extraits de naissance d'Amadou et de ses parents) et remet l'état civil complet et les données de justice, avec l'arbre de la cascade.

**3. Ouverture de compte bancaire (administration privée, consentement).** La banque demande `ouverture-compte-bancaire` : rien n'est transmis, une demande de consentement est créée (`202`). Amadou se connecte, voit la banque, la démarche et les données demandées (nom, prénom, nationalité, situation fiscale), et accepte. La banque consulte sa requête et reçoit uniquement ces quatre données ; le journal enregistre un accès par consentement.

Les commandes `curl` de chaque procédure sont dans le `README.md`. L'interface de test (`frontend/pages/test.html`) permet de jouer le rôle de chaque administration sans gérer de jeton.

## 14. Validation

Le test `tests/interoperabilite/test-interop.js` démarre une stack séparée (sa propre base) et rejoue sans intervention :

| Scénario | Ce qui est vérifié |
|----------|--------------------|
| Nos trois registres | Les 3 procédures, l'identité, les demandes de pièces et leur contenu |
| Un registre externe à la place de l'état civil, puis de la justice, du fiscal et des trois | Les mêmes vérifications, avec un registre « d'une autre équipe » au format recommandé |
| Format différent | Deux registres d'un autre format branchés par le seul catalogue : un état civil sans `est_majeur` (la passerelle le calcule) et un registre de nationalité sans IUE, avec un homonyme qui ne doit jamais être choisi ; la source de secours ; la commande `tester-registre` |
| Panne en direct | Coupure du casier, puis de l'état civil : ce qui n'en dépend pas reste servi, ce qui en dépend attend, rien n'est transmis ni copié, tout se complète au retour, une seule entrée au journal |
| Donnée numérique manquante | La demande bloquée se complète seule après la numérisation des actes, et le citoyen est prévenu |
| Pannes et configuration | Registre arrêté, adresse mal saisie |

Partout, le test vérifie qu'aucun champ hors dictionnaire ne sort de la plateforme. Résultat au 18 novembre 2026 : **363 vérifications réussies, 0 échec, 0 avertissement.** L'option `--seul=<scénario>` rejoue un seul scénario, par exemple pour répéter la panne en direct.

## 15. Conformité aux livrables

| Livrable attendu | Réponse | Où le vérifier |
|------------------|---------|----------------|
| Code source libre | Licence Apache 2.0 | `LICENSE`, `NOTICE` |
| Déploiement en une seule commande | `docker compose up -d --build` démarre les 10 conteneurs | `docker-compose.yml`, `README.md` |
| Spécifications OpenAPI pour chaque couche | 7 contrats OpenAPI 3.0, validés, affichés par Swagger UI | `docs/openapi-*.yaml`, http://localhost:3010 |
| 3 procédures de bout en bout | Université, passeport, banque | § 13, `README.md` |
| Rapport technique | Ce document | `docs/rapport-technique.md` |
| Vidéo de démonstration de 3 minutes | Réalisée par OUEDRAOGO Nebwaoga Lionnel, sur le script `docs/script-video.md` | à joindre |
| Matrice de contribution | Par membre et par couche | `docs/matrice-contribution.md` |

## 16. Démonstration de l'épreuve

1. L'université demande l'inscription d'Amadou : elle reçoit « majeur : oui » et la nationalité, rien d'autre.
2. Amadou ouvre son journal : il voit l'université, la démarche, « Majeur », l'heure.
3. On coupe le registre du casier (`docker compose stop registre-justice`) : l'université est toujours servie ; la police (passeport) reçoit « en attente du registre » ; l'état des registres (`GET /api/registres`, affiché dans l'interface de test) montre la justice hors service ; l'espace usager fonctionne.
4. On rallume le registre (`docker compose start registre-justice`) : la police consulte sa requête et reçoit le dossier complet, sans refaire sa demande ; le journal d'Amadou montre l'accès.
5. On branche un registre d'un autre format par le catalogue, on le teste avec `tester-registre`, et la plateforme le lit.

## 17. Limites et perspectives

**Limites actuelles**

- Le catalogue des registres et le dictionnaire sont des fichiers YAML : les modifier demande un accès au serveur et un redémarrage de la passerelle.
- Les registres doivent répondre en JSON à des lectures `GET`. Un registre en XML ou en SOAP demanderait un adaptateur.
- Le mode `recherche` compare nom, prénom et date de naissance exactement : une orthographe différente donne « personne absente », ce qui est sûr mais moins fluide.
- Homonymes en mode `recherche` (même nom, prénom et date de naissance) : la pièce n'est pas lue, et la reprise automatique ne peut pas lever l'ambiguïté seule. Il faut le mode `correspondance`.
- La reprise des demandes interroge les registres à intervalle régulier (10 s) plutôt que d'être prévenue par un événement.
- Remise unique : une administration qui perd la réponse doit refaire sa demande, qui est alors à nouveau inscrite au journal. C'est voulu (aucune copie), mais cela suppose des administrations fiables.
- Les SMS sont simulés (écrits dans les journaux des services).
- Le secret des jetons est partagé entre services (HS256), et tous les schémas sont dans une même instance PostgreSQL. C'est suffisant pour une démonstration, pas pour une production.

**Perspectives**

- **Catalogue en base de données**, avec une API et une interface d'administration réservées à un rôle « gestionnaire du catalogue » (autorité du référentiel), et l'historique de chaque modification.
- **Assistant de branchement** qui propose les correspondances en rapprochant les noms de champs d'un registre de ceux du dictionnaire.
- **Mode d'identification `correspondance`** : une table IUE / identifiant local (numéro d'acte, NIP, IFU), remplie au fil de l'enrôlement.
- **Statistiques de numérisation pour l'État** : nombre de démarches bloquées par type de pièce manquante et par registre, sans aucune donnée personnelle, pour orienter les campagnes de numérisation. Une répartition par centre d'état civil demanderait de connaître le centre qui détient chaque acte manquant, ce que la plateforme ne sait pas aujourd'hui (elle ne recueille rien auprès du citoyen).
- **Production** : clés asymétriques ou TLS mutuel entre services, limitation du nombre de tentatives de connexion, HTTPS, journal chaîné par empreintes pour prouver qu'aucune entrée n'a été modifiée, bases séparées par service, vrai fournisseur de SMS.
- **Espace usager** : vue d'ensemble de ce que les registres savent du citoyen, documents à durée de validité (CNIB, casier), application mobile sur le même contrat.

## Annexe A : comptes de démonstration

Mots de passe de démonstration uniquement.

| Citoyen | IUE | Mot de passe | Rôle dans la démo |
|---------|-----|--------------|-------------------|
| Amadou OUEDRAOGO | `784302956148` | `Amadou2026!` | Majeur, citoyen principal |
| Ibrahim OUEDRAOGO | `291047583620` | `Ibrahim2026!` | Père d'Amadou, tuteur d'Awa et de Moussa ; actes de ses parents pas encore numérisés (donnée numérique manquante) |
| Fatimata SAWADOGO | `638501274093` | `Fatimata2026!` | Mère d'Amadou |
| Awa OUEDRAOGO | `456123789012` | aucun | Mineure (12 ans), compte géré par Ibrahim |
| Moussa OUEDRAOGO | `527814903361` | aucun | Mineur (16 ans), transfert de compte recommandé |
| Salif OUEDRAOGO | `316580942751` | pas de compte | Majeur, sert à l'inscription en direct |
| Aïcha OUEDRAOGO | `873045129604` | aucun | Fille de Salif (5 ans), rattachée automatiquement à son inscription |

## Annexe B : commandes utiles

| Action | Commande |
|--------|----------|
| Démarrer la plateforme | `docker compose up -d --build` |
| Documentation des API | http://localhost:3010 |
| Espace usager | http://localhost:3020 |
| Jetons d'administration de démo | `docker compose exec passerelle npm run jeton:admin` |
| Tester un registre | `docker compose exec passerelle npm run tester-registre -- <registre> <iue>` |
| État des registres | `curl http://localhost:3000/api/registres` |
| Simuler une panne | `docker compose stop registre-justice`, puis `docker compose start registre-justice` |
| Numériser les actes manquants (et remise à zéro) | `docker compose exec registre-etat-civil npm run numeriser-actes` (`-- --annuler`) |
| Test d'interopérabilité complet | `node tests/interoperabilite/test-interop.js` (stack principale arrêtée) |
| SMS simulés | `docker compose logs consentement espace-usager` |
