# Brancher un registre (par exemple ceux du jury)

Procédure pas à pas pour brancher un registre d'état civil, de nationalité ou de casier judiciaire sur la plateforme, **sans écrire de code**. Compter 5 à 15 minutes par registre. Conception détaillée : [conception-interoperabilite.md](conception-interoperabilite.md) (§ 4 à § 11).

Principe : la passerelle n'a aucun registre écrit en dur. Elle lit deux fichiers de `backend/passerelle/config/`, montés dans son conteneur sur `/app/config` (on les modifie sans reconstruire l'image) :

- `dictionnaire.yaml` : les données de la plateforme (on n'y touche pas pour brancher un registre) ;
- `catalogue-registres.yaml` : chaque registre, ses routes, la façon d'y identifier une personne, la correspondance de ses champs avec le dictionnaire, et quelles opérations il sert (`sources`).

Opérations à servir pour les registres du jury :

| Registre du jury | Opération du catalogue | Données (dictionnaire) |
|------------------|------------------------|------------------------|
| État civil | `etat-civil.fiche` (et `etat-civil.filiation` s'il donne les parents et enfants) | nom, prénom, date et lieu de naissance, sexe, nationalité, parents ; `est_majeur` est calculé par la passerelle si besoin |
| Nationalité | `justice.nationalite` | burkinabè ou non, nationalité, mode et date d'acquisition, numéro de certificat |
| Casier judiciaire | `justice.casier` | condamnations ; `casier_vierge` est calculé par la passerelle si besoin |

Le fiscal reste servi par notre registre : le jury n'en fournit pas.

**L'état civil sert de pivot** : il doit accepter l'IUE (`identification: { mode: iue }`), sinon la passerelle refuse le catalogue. C'est par lui que les autres registres, s'ils ne connaissent pas l'IUE, retrouvent une personne (nom, prénom, date de naissance).

## 1. Rendre le registre joignable

- Noter l'adresse de base du registre (par exemple `http://192.168.1.20:8080/api`).
- Depuis un conteneur, la machine hôte s'appelle `host.docker.internal` (un registre qui tourne sur le même ordinateur : `http://host.docker.internal:8080/api`).
- Vérifier depuis la passerelle : `docker compose exec passerelle wget -qO- <adresse>/<une route>`.

## 2. Faire proposer la déclaration (si le registre a un contrat OpenAPI)

Copier le contrat dans `backend/passerelle/config/` (il apparaît dans le conteneur sous `/app/config/`), puis :

```bash
docker compose exec -T passerelle npm run -s proposer-registre -- /app/config/<contrat>.yaml nationalite-jury > brouillon.yaml
```

- Une URL fonctionne aussi à la place du fichier.
- Le brouillon s'écrit dans `brouillon.yaml` ; le bilan s'affiche à l'écran.
- Sous Git Bash (Windows), préfixer par `MSYS_NO_PATHCONV=1`.
- Sans contrat OpenAPI : partir de l'exemple commenté `nationalite-externe` dans `catalogue-registres.yaml`, et d'une réponse réelle du registre.

## 3. Relire le brouillon (étape humaine, obligatoire)

L'assistant propose ; il ne décide pas du sens des champs. Vérifier :

- `proprietaire` : à renseigner (le ministère qui tient le registre) ;
- `adresse` : de préférence une variable, par exemple `${REGISTRE_NATIONALITE_URL}`, avec la valeur dans un fichier `.env` à la racine ;
- `identification` : `{ mode: iue }` si le registre accepte l'IUE ; sinon `recherche`, avec le bon format de date dans la route (`{date_naissance|jj/mm/aaaa}` si le registre attend ses dates ainsi) ;
- chaque correspondance marquée « nom proche : à vérifier » ou « table de valeurs à vérifier » ;
- les « données du dictionnaire non trouvées » : un champ existe peut-être sous un autre nom ; sinon la donnée est absente de ce registre ;
- les « champs ignorés » : ils n'entreront jamais dans la plateforme, c'est voulu.

## 4. Déclarer le registre dans le catalogue

Dans `backend/passerelle/config/catalogue-registres.yaml` :

1. Coller le registre sous `registres:` (il reste `etat: suspendu` pour l'instant).
2. Dans `sources:`, le mettre **en premier** pour les opérations qu'il sert, à la place de notre registre. Exemple :
   ```yaml
   sources:
     justice.nationalite: [nationalite-jury]
   ```
   On ne garde notre registre en second (source de secours) que s'il appartient à la même autorité : la passerelle le vérifie au démarrage.

## 5. Tester avant d'activer

```bash
docker compose exec passerelle npm run tester-registre -- nationalite-jury <iue d'un citoyen du jury>
```

La commande affiche la connexion, l'identification, puis pour chaque opération les données obtenues, celles qui manquent et les champs ignorés. Corriger le catalogue et relancer jusqu'à ce que les données attendues apparaissent.

## 6. Activer

1. Passer `etat: actif` dans le catalogue.
2. `docker compose restart passerelle`
3. `docker compose logs --tail 20 passerelle` : la passerelle liste chaque registre (`conforme`), ou refuse de démarrer en nommant chaque erreur du catalogue.
4. `curl http://localhost:3000/api/registres` : le registre est `disponible`.
5. Rejouer une procédure (interface de test) pour un citoyen du jury.

## Revenir en arrière

```bash
git checkout backend/passerelle/config/catalogue-registres.yaml
docker compose restart passerelle
```

## Cas particuliers

| Situation | Ce qui se passe | Que faire |
|-----------|-----------------|-----------|
| Le registre ne connaît pas l'IUE | Mode `recherche` : la passerelle lit nom, prénom et date de naissance à l'état civil, puis cherche la personne | Vérifier le format de date de la route de recherche ; impossible pour l'état civil lui-même (pivot) |
| Plusieurs personnes trouvées (homonymes) | La plateforme ne choisit jamais : la pièce n'est pas lue | Limite connue (mode `correspondance` en perspective) |
| Le registre ne fournit pas `est_majeur` ou `casier_vierge` | La passerelle les calcule (date de naissance, liste des condamnations) | Rien : seule la donnée calculée sort |
| Le registre répond lentement | Au-delà de `delai_ms` (2 000 ms), il est jugé hors service | Augmenter `delai_ms` dans le catalogue |
| Le registre exige un jeton | | `entetes: { Authorization: "Bearer ${JETON_REGISTRE}" }`, jeton dans `.env` |
| La passerelle ne démarre plus | Catalogue incohérent : elle liste les erreurs | `docker compose logs passerelle`, corriger, ou revenir en arrière |
