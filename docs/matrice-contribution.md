# Matrice de contribution

DLNUF (Dites-le-nous une fois), Hackathon des Universités 2026, challenge 02. Équipe MESSAF.

| Membre | Rôle principal |
|--------|----------------|
| **SANOU Tolo Thède Axel** | Backend : registres, passerelle, consentement, journal, BFF, déploiement, tests, rapport technique |
| **OUEDRAOGO Nebwaoga Lionnel** | Frontend : espace usager et interface de test ; premières versions des contrats OpenAPI ; vidéo de démonstration |

Légende : **R** = responsable (conçoit et réalise), **C** = contribue.

## 1. Par couche

| Couche | SANOU Tolo Thède Axel | OUEDRAOGO Nebwaoga Lionnel |
|--------|-----------------------|----------------------------|
| **1. Registres** (état civil, justice, fiscal) | **R** : les trois services, données de démonstration, script de numérisation des actes manquants | **C** : premières versions des trois contrats |
| **2. Passerelle d'échange** | **R** : droits et cloisonnement, cascades, dictionnaire des données et catalogue des registres, connecteur générique (correspondances, conversions, identification par IUE, par table de correspondance ou par recherche, données calculées), tenue en panne, remise unique, commande `tester-registre` | **C** : première version du contrat ; spécification de la consultation du contenu des pièces |
| **3. Consentement et minimisation** | **R** : règles par démarche, demandes de consentement, rappels à 24 h et 72 h, expiration | **C** : première version du contrat |
| **4. Journal de traçabilité** | **R** : journal en ajout seul, chaîné par empreintes et vérifiable, double traçabilité titulaire et décideur | **C** : première version du contrat |
| **5. Espace usager : BFF** | **R** : authentification, tutelle et transfert, inscription, demandes de pièces et reprise automatique, consultation des pièces, vue d'ensemble des registres, statistiques de numérisation, interface de test | **C** : première version du contrat ; spécification de la consultation du contenu des pièces |
| **5. Espace usager : frontend** | non concerné | **R** : toutes les pages (connexion, inscription, mot de passe en 3 étapes, tableau de bord, profil, consentements, demandes, pièce, journal, enfants), interface de test (état des registres, mise en attente d'une requête, remise unique), libellés du dictionnaire, démarche à suivre, recherche et filtres, style |
| **Contrats OpenAPI** (7) | **R** : compléments (réponses d'erreur, statuts de panne, état des registres, dictionnaire, démarche à suivre), validation, documentation Swagger | **R** : premières versions des 7 contrats, à l'initialisation du dépôt |
| **Déploiement** (Docker Compose, Swagger UI) | **R** : déploiement en une commande, redémarrage automatique, configuration | **C** : service du frontend |
| **Tests d'interopérabilité** | **R** : registre externe, registres d'un autre format, registres sans IUE (table de correspondance), panne en direct, donnée numérique manquante, altération du journal (427 vérifications) | non concerné |
| **Documentation** | **R** : README, conception de l'interopérabilité, conventions du projet | **C** : sections du CLAUDE.md (acteurs du système, recherche et filtres, gestion du catalogue) |

## 2. Par livrable

| Livrable | SANOU Tolo Thède Axel | OUEDRAOGO Nebwaoga Lionnel |
|----------|-----------------------|----------------------------|
| Code source libre (licence Apache 2.0) | **R** (backend, licence) | **R** (frontend) |
| Déploiement en une seule commande | **R** | **C** (service du frontend) |
| Spécifications OpenAPI de chaque couche | **R** (compléments, validation) | **R** (premières versions) |
| 3 procédures de bout en bout | **R** (traitement côté plateforme) | **R** (parcours dans l'espace usager et l'interface de test) |
| Rapport technique | **R** | non concerné |
| Vidéo de démonstration | **C** (script) | **R** (enregistrement et montage) |
| Matrice de contribution | **R** | non concerné |

## 3. Indicateur tiré de l'historique git

Lignes ajoutées par couche, sur tous les commits du dépôt (hors fusions et hors fichiers générés `package-lock.json`). C'est un ordre de grandeur, pas une mesure de la valeur du travail : une ligne de conception ne pèse pas autant qu'une ligne de style.

| Couche | Axel | Lionnel |
|--------|-----:|--------:|
| 1. Registres | 1 755 | 0 |
| 2. Passerelle | 4 520 | 0 |
| 3. Consentement | 1 246 | 0 |
| 4. Journal | 811 | 0 |
| 5. BFF | 2 580 | 0 |
| 5. Frontend | 0 | 5 591 |
| Contrats OpenAPI | 1 681 | 2 258 |
| Déploiement | 215 | 10 |
| Tests d'interopérabilité | 1 543 | 0 |
| Documentation | 1 800 | 851 |
| **Commits** | 34 | 28 |

État au 18 novembre 2026, 14 h 30, branche `main`.
