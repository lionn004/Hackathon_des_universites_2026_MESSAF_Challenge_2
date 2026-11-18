# Conception : brancher n'importe quel registre, et tenir quand il tombe

Document de référence de l'équipe (backend, frontend, rapport technique). Il fixe ce que la
plateforme fait, et ce qu'elle ne fait pas encore, à partir de l'énoncé officiel du challenge.

## 1. Ce que demande l'énoncé

> **Challenge 02 : « Dites-le-nous une fois »**
> Faire circuler les pièces entre administrations plutôt que les usagers entre les guichets, dans le
> respect de leurs droits sur leurs données.
>
> **Données** : registres simulés fournis par le jury (état civil, nationalité, casier), peuplés de
> citoyens fictifs.
> **Épreuve en direct** : ne transmettre que l'utile (« majeur : oui »), montrer à l'usager qui a
> consulté ses données, et tenir quand un registre tombe en panne.
> **Bien commun** : un socle d'interopérabilité libre, avec ses règles de consentement et de
> traçabilité, réutilisable par l'administration.

Conséquences :

- Le jour de l'épreuve, la plateforme devra lire des **registres que nous ne connaissons pas** :
  autres routes, autres noms de champs, autres citoyens, peut-être sans IUE. Le jury n'impose aucun
  format et nous laisse libres de la façon de s'y connecter.
- « Majeur : oui » doit sortir même si le registre ne fournit qu'une date de naissance.
- Une panne de registre est provoquée en direct : la plateforme doit continuer à servir ce qui ne
  dépend pas de ce registre, et ne rien perdre de ce qui en dépend.

## 2. Principes

1. **Les registres restent maîtres de leurs données.** La plateforme ne copie rien : elle lit au
   moment de la remise, remet une seule fois, et seule la trace reste au journal (remise unique).
2. **Un vocabulaire commun.** Toute la plateforme (démarches, minimisation, consentement,
   cloisonnement, journal, espace usager) parle la langue d'un **dictionnaire des données**.
   Chaque registre est traduit vers ce dictionnaire.
3. **Brancher, c'est déclarer.** Un nouveau registre se branche en le décrivant dans le
   **catalogue des registres**, sans écrire de code ni redémarrer autre chose que la passerelle.
4. **Ne transmettre que l'utile.** La passerelle calcule elle-même les données dérivées
   (« majeur : oui ») ; les données brutes qui servent au calcul ne sortent jamais.
5. **Tenir.** Une panne n'arrête que ce qui en dépend, rien ne se perd, et tout reprend seul.

Nos trois registres restent : ils sont l'implémentation de référence, le mode par défaut de la démo,
et leurs contrats (`docs/openapi-registre-*.yaml`) deviennent le **format recommandé** pour un nouveau
registre. Un registre qui ne le suit pas se branche quand même, par le catalogue.

## 3. Vocabulaire

| Terme | Sens | Exemples |
|-------|------|----------|
| **Domaine** | Famille de données, utilisée par les règles (minimisation, mission, consentement) | `etat-civil`, `justice`, `fiscal` |
| **Opération** | Une lecture précise dans un domaine | `etat-civil.fiche`, `etat-civil.filiation`, `justice.casier`, `justice.nationalite`, `fiscal.situation` |
| **Donnée** | Une entrée du dictionnaire, rattachée à un domaine et à une opération | `etat-civil.date_naissance`, `justice.casier_vierge` |
| **Registre** | Un service réel, avec une adresse, qui sert une ou plusieurs opérations | notre registre `justice` ; le registre `nationalite-jury` |
| **Source** | Pour une opération, la liste ordonnée des registres qui la servent : le premier fait foi, les suivants sont des sources de secours | `justice.nationalite : [nationalite-jury, justice]` |

Le domaine et l'opération sont **logiques** ; le registre est **physique**. Les règles existantes
(démarches, missions, consentements) ne changent pas : elles parlent déjà de domaines et de données.
Le jury sépare nationalité et casier en deux registres : cela revient à servir `justice.nationalite`
et `justice.casier` par deux registres différents.

## 4. Le dictionnaire des données

Fichier `backend/passerelle/config/dictionnaire.yaml`. Nos noms de champs actuels **sont** le
dictionnaire : nos registres le parlent déjà.

```yaml
version: 1.0.0
domaines:
  etat-civil:
    nom:            { operation: fiche, type: texte,   libelle: "Nom",               sensibilite: personnelle }
    date_naissance: { operation: fiche, type: date,    libelle: "Date de naissance", sensibilite: personnelle }
    est_majeur:     { operation: fiche, type: booleen, libelle: "Majeur",            sensibilite: personnelle,
                      calcul: { regle: age_au_moins, a_partir_de: date_naissance, seuil: 18 } }
  justice:
    casier_vierge:  { operation: casier, type: booleen, libelle: "Casier judiciaire vierge", sensibilite: sensible,
                      calcul: { regle: liste_vide, a_partir_de: condamnations } }
```

- `libelle` : texte montré au citoyen dans son journal (« Majeur » plutôt que `est_majeur`).
- `sensibilite` : `publique`, `personnelle` ou `sensible` (avis de la CIL).
- `calcul` : donnée dérivée, calculée par la passerelle quand le registre ne la fournit pas (voir § 7).

**Qui le met à jour, et comment.** Dans la réalité, l'autorité qui porte le référentiel
d'interopérabilité, avec l'avis de la CIL pour les données sensibles ; pendant le hackathon, notre
équipe. Une administration propose une donnée, l'autorité vérifie qu'elle n'existe pas déjà sous un
autre nom, la CIL juge sa sensibilité, puis la donnée est ajoutée par une Pull Request relue, avec une
nouvelle version.

**Règles intangibles** : on ne renomme jamais une donnée (on en ajoute une nouvelle et on marque
l'ancienne `obsolete: true`) ; on ne change jamais le sens d'une donnée. Au démarrage, la passerelle
vérifie que chaque démarche, chaque mission et chaque correspondance du catalogue n'utilisent que des
données du dictionnaire ; sinon elle refuse de démarrer et nomme l'erreur.

## 5. Le catalogue des registres : où aller chercher

Fichier `backend/passerelle/config/catalogue-registres.yaml`, monté dans le conteneur : on le modifie
puis on redémarre la passerelle (`docker compose restart passerelle`), sans reconstruire d'image.

```yaml
registres:
  justice:                                   # notre registre (format recommandé)
    nom: Registre de la justice (MESSAF)
    proprietaire: Ministère de la Justice
    etat: actif                              # actif | suspendu
    adresse: ${REGISTRE_JUSTICE_URL:-http://registre-justice:3002/api}
    delai_ms: 2000                           # au-delà, le registre est jugé en panne
    identification: { mode: iue }
    operations:
      justice.casier:      { route: "GET /citoyens/{iue}/casier" }
      justice.nationalite: { route: "GET /citoyens/{iue}/nationalite" }
    # aucune correspondance : il parle déjà le dictionnaire

  nationalite-jury:                          # exemple : registre du jury, autre format
    nom: Registre de la nationalité (jury)
    proprietaire: Ministère de la Justice
    etat: actif
    adresse: ${REGISTRE_NATIONALITE_URL}
    delai_ms: 2000
    identification:                          # il ne connaît pas encore l'IUE (§ 6)
      mode: recherche
      route: "GET /personnes?nom={nom}&prenom={prenom}&naissance={date_naissance}"
      liste: items                           # où se trouve la liste des résultats
      identifiant_local: numeroDossier
    operations:
      justice.nationalite:
        route: "GET /personnes/{identifiant_local}/nationalite"
        donnees: data                        # la fiche se trouve sous "data"
        inconnu: [404]                       # code qui veut dire « personne inconnue »
        correspondances:                     # notre donnée : son champ, et la conversion
          est_national:      { champ: estBurkinabe,  conversion: booleen }
          nationalite:       { champ: nationalite }
          date_acquisition:  { champ: dateObtention, conversion: date }
          numero_certificat: { champ: numCertificat }

sources:                                     # pour chaque opération : qui fait foi, puis les secours
  etat-civil.fiche:      [etat-civil]
  etat-civil.filiation:  [etat-civil]
  justice.casier:        [justice]
  justice.nationalite:   [nationalite-jury, justice]
  fiscal.situation:      [fiscal]

pieces:                                      # quelle opération lit chaque pièce
  extrait-naissance: etat-civil.fiche
  certificat-nationalite: justice.nationalite
  casier-judiciaire: justice.casier
  attestation-fiscale: fiscal.situation
```

- `${VARIABLE:-défaut}` : les adresses restent surchargeables par les variables d'environnement
  existantes (`REGISTRE_ETAT_CIVIL_URL`...).
- `conversion` : `texte` (défaut), `booleen` (`oui/non`, `vrai/faux`, `1/0`, `true/false`), `date`
  (`JJ/MM/AAAA`, `AAAA-MM-JJ` ou date-heure ISO, toujours rendue en `AAAA-MM-JJ`), `nombre`, ou une
  table `valeurs` (ex : `{ Masculin: M, Féminin: F }`).
- `champ` accepte un chemin (`identite.nom`) pour les réponses imbriquées.
- Les routes sont des lectures (`GET`). Une variable de route peut être mise en forme :
  `{date_naissance|jj/mm/aaaa}` pour un registre qui attend ses dates ainsi.
- `parametre_champs` : nom du paramètre de filtrage des champs, si le registre en a un (nos
  registres : `champs`). La passerelle filtre de toute façon elle-même.
- `entetes` : en-têtes à envoyer (ex : `Authorization: "Bearer ${JETON_REGISTRE}"`).
- `sonde` : route appelée toutes les 5 s pour savoir si le registre répond (défaut : l'adresse).
- Un champ que le registre envoie sans correspondance **n'entre jamais** dans la plateforme.
- `etat-civil.filiation` est facultative : sans elle, les parents viennent de `pere_iue` et
  `mere_iue` de la fiche, et la liste des enfants est vide (rattachement automatique indisponible).

## 6. Identifier une personne : l'IUE comme pivot

Toute requête sur la plateforme désigne la personne par son **IUE**, sans exception : c'est
l'identifiant que les administrations doivent adopter. Pour un registre qui ne l'a pas encore, le
catalogue dit comment traduire l'IUE en identifiant local.

| Mode | Fonctionnement | Statut |
|------|----------------|--------|
| `iue` | Le registre accepte l'IUE directement (`{iue}` dans la route) | Cible ; nos registres |
| `recherche` | La passerelle lit nom, prénom et date de naissance à l'état civil (par l'IUE), cherche la personne dans le registre et en tire son identifiant local | Bases anciennes, sans lien |
| `correspondance` | Une table IUE / identifiant local (numéro d'acte, NIP, IFU), tenue par le gestionnaire du registre IUE et remplie au fil de l'enrôlement | Perspective, si le temps le permet |

**Règle de sûreté du mode `recherche`** : il faut exactement un résultat. Avec zéro ou plusieurs
résultats (homonymes), la plateforme ne devine jamais : la pièce est traitée comme absente et part au
guichet pour une vérification humaine (§ 9).

## 7. « Majeur : oui » : les données calculées

Quand une démarche demande une donnée calculée (ex : `est_majeur`) et que le registre ne la fournit
pas, la passerelle la calcule à partir de la donnée source (ex : `date_naissance`). Seule la donnée
calculée est remise et inscrite au journal : la date de naissance est lue, mais ne quitte jamais la
passerelle. Règles prévues : `age_au_moins` (âge révolu, en UTC) et `liste_vide`.

## 8. Lire une donnée : le parcours d'une requête

1. L'administration demande une démarche pour un IUE.
2. Droits : administration connue, champs de la démarche dans sa mission (cloisonnement).
3. Les règles de la démarche donnent les données voulues ; le dictionnaire donne leurs opérations.
4. Pour chaque opération, le catalogue donne le premier registre **disponible** de sa source qui sait
   fournir toutes les données voulues (sinon : attente, § 10).
5. Identification de la personne dans ce registre (§ 6).
6. Lecture, puis traduction vers le dictionnaire (correspondances et conversions).
7. Données calculées (§ 7), puis minimisation : seules les données de la démarche restent.
8. Consentement si l'administration est privée, entrée au journal, remise unique.

## 9. Le guichet et la reprise automatique

Quand une pièce manque (parent jamais enregistré, homonymes), la demande passe au guichet :

1. La plateforme dit au citoyen quelle pièce manque et où se présenter.
2. Le citoyen présente l'acte papier au guichet de son centre d'état civil.
3. L'agent vérifie l'original et **numérise l'acte dans le registre de l'état civil** : la donnée va
   là où elle doit vivre, jamais dans la plateforme.
4. La **reprise automatique** relance régulièrement les demandes bloquées : la pièce existe
   désormais, la cascade se résout, la demande devient complète et le citoyen est notifié.

Le guichet n'est donc pas un logiciel de plus : c'est le moment où la donnée manquante entre dans son
registre. Pour la démonstration, un script simule la saisie de l'agent dans notre registre d'état
civil (actes des parents d'Ibrahim). Une file de tâches avec une interface pour les agents est une
perspective.

## 10. Tenir quand un registre tombe

**État de chaque registre** : `disponible` ou `hors_service`. Un appel en échec (pas de réponse,
délai `delai_ms` dépassé, erreur 5xx) le passe `hors_service` ; une sonde toutes les 5 s le repasse
`disponible` dès qu'il répond. Un registre `hors_service` est contourné **immédiatement**, sans
attendre de délai. Un registre `suspendu` dans le catalogue est traité comme `hors_service`.

**Source de secours** : si le registre qui fait foi est hors service, la passerelle prend le suivant de
la source, s'il est disponible et sait fournir toutes les données demandées.

**Requêtes des administrations : tout ou rien, puis complétion automatique.** Si une donnée nécessaire
ne peut pas être lue, rien n'est remis : la requête passe `en_attente_registre` (réponse 202 avec la
liste des registres attendus). Elle n'est pas perdue : à la consultation suivante de
`GET /requetes/{id}`, si les registres sont revenus, la passerelle reprend là où elle s'était arrêtée
(vérification du citoyen, demande de consentement, ou lecture et remise), sans que l'administration
refasse sa demande. Aucune copie n'est gardée pendant l'attente.

| Situation | Statut |
|-----------|--------|
| Publique, registre en panne | `en_attente_registre`, puis `complete` à la consultation qui suit son retour |
| Privée, état civil en panne au dépôt | `en_attente_registre`, puis `en_attente_consentement` à son retour |
| Privée, consentement accepté, registre en panne | `en_attente_registre`, puis `complete` à son retour |
| Citoyen inconnu découvert à la reprise | `echouee` |

**Demandes de pièces des citoyens** : une cascade qui touche un registre en panne donne une demande
`en_cours` ; la reprise automatique (§ 9, tâche du BFF toutes les 10 s, `REPRISE_INTERVALLE_MS`) la termine au retour du
registre et notifie le citoyen.

**Espace usager** : il reste utilisable quand un registre tombe (connexion, journal, consentements,
tableau de bord). Les noms lus à l'état civil manquent seulement pendant la panne de celui-ci.

**Services** : tous les services redémarrent seuls après un plantage (`restart: unless-stopped`).

**Visibilité** : `GET /registres` donne l'état de chaque registre, et depuis quand.

## 11. Brancher un registre en quelques minutes

1. **Déclarer** le registre dans le catalogue : adresse, mode d'identification, routes.
2. **Décrire les correspondances** entre ses champs et le dictionnaire.
3. **Le désigner** dans `sources` pour les opérations qu'il sert (en premier s'il fait foi).
4. **Tester** :
   ```
   $ docker compose exec passerelle npm run tester-registre -- nationalite-jury 784302956148
   Connexion           OK (212 ms)
   Identification      recherche nom + prénom + date : 1 résultat (dossier N-2291)
   Lecture             OK
   Données obtenues    est_national = true, nationalite = Burkinabè, date_acquisition = 1998-03-15
   Données manquantes  numero_certificat (numCertificat absent de la réponse)
   Champs ignorés      adresse, profession (hors dictionnaire, jamais transmis)
   ```
5. **Activer** : `docker compose restart passerelle`. `GET /registres` le montre `disponible`.

Aujourd'hui, la déclaration se fait dans le fichier YAML (option A). La page web d'administration
(déclarer, tester, activer, avec un rôle « administrateur de la plateforme ») viendra avec le passage
du catalogue en base de données (option C, § 14).

## 12. L'espace usager : périmètre

L'espace usager sert à une seule chose : **exercer ses droits sur ses données**.

| Pilier | Fonctions |
|--------|-----------|
| **Savoir** | Journal : qui a consulté quoi (avec les libellés du dictionnaire : « Majeur : oui »), pourquoi, quand, en accès direct ou par consentement. Tableau de bord et alertes |
| **Décider** | Consentements : accepter ou refuser les demandes des entités privées |
| **Accéder** | Mes pièces : voir ses données et leur disponibilité (droit d'accès, document informatif non officiel) |
| **Protéger ses enfants** | Tutelle : consentements et journal des enfants ; transfert du compte à 15 ans |
| Compte | Inscription (rattachement automatique des enfants), connexion, récupération par SMS |

Nouveau, et seulement ceci : les libellés du dictionnaire dans le journal, l'état des registres, le
statut « en attente d'un registre » pour les demandes. Aucune autre fonctionnalité ni finition n'est
ajoutée. « Demander une pièce pour la porter au guichet » n'est pas l'objectif : les pièces circulent
entre administrations ; l'écran « Mes pièces » sert au droit d'accès et à suivre la cascade.

## 13. Changements des contrats

| Contrat | Changement |
|---------|------------|
| Passerelle | `GET /registres` (état), `GET /dictionnaire` (données et libellés) ; statuts `en_attente_registre` et `echouee` pour les requêtes ; réponse 202 avec `registres_indisponibles` ; nœud de cascade `en_attente_registre` |
| Espace usager (BFF) | `GET /registres` et `GET /dictionnaire` (relais publics) ; une demande `en_cours` peut attendre un registre (nœud `en_cours`) |
| Registres | Inchangés : ils deviennent le format recommandé |
| Consentement, journal | Inchangés |

Les corrections de l'audit sont faites en même temps : codes d'erreur déclarés (`401`, `400`,
`404`), champs `nullable` manquants, `numero_certificat` omis plutôt que `null` dans notre registre
justice, entrée du journal de démo d'Awa (décideur = titulaire pour un accès direct).

## 14. Hors périmètre aujourd'hui (perspectives)

- **Catalogue en base de données**, API d'administration et page web de branchement (option C).
- **Assistant de branchement** : proposer les correspondances en rapprochant les noms de champs.
- **Mode d'identification `correspondance`** (table IUE / identifiant local).
- **File de tâches et interface des agents de guichet.**

## 15. Répartition

| Qui | Travail |
|-----|---------|
| Backend (fait) | Dictionnaire, catalogue, connecteur générique, données calculées, identification `iue` et `recherche`, commande de test ; état des registres et contournement, sources de secours, `en_attente_registre` et reprise ; reprise des demandes dans le BFF ; script du guichet ; `restart` ; contrats ; corrections de l'audit ; test d'interopérabilité étendu (registre externe d'un autre format, branché par le catalogue) |
| Frontend | Page « État des registres » (lecture seule) ; libellés du dictionnaire dans le journal ; statut « en attente d'un registre » dans Mes pièces et l'interface de test ; vérification et fusion de la PR #18 |

## 16. Démonstration de l'épreuve

1. L'université demande l'inscription d'un citoyen : elle reçoit « majeur : oui » et la nationalité,
   rien d'autre.
2. Le citoyen ouvre son journal : il voit l'université, la démarche, « Majeur », l'heure.
3. On coupe le registre du casier : l'université est toujours servie ; la police (passeport) reçoit
   « en attente du registre casier » ; l'état des registres le montre hors service ; l'espace usager
   fonctionne.
4. On rallume le registre : la police consulte sa requête et reçoit le dossier complet, sans refaire
   sa demande ; le journal du citoyen montre l'accès.
5. On branche en direct un registre d'un autre format, par le catalogue, et on le teste.
