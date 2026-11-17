# Contrats API

## Architecture des services

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND REACT                        │
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

## Fichiers de contrats

| Fichier | Port | Consommé par |
|---------|------|-------------|
| `openapi-espace-usager.yaml` | :3000 | **Frontend React** (seul contrat nécessaire pour le frontend) |
| `openapi-passerelle.yaml` | :3004 | BFF, Interface de test |
| `openapi-consentement.yaml` | :3005 | Passerelle, BFF |
| `openapi-journal.yaml` | :3006 | Passerelle, BFF |
| `openapi-registre-etat-civil.yaml` | :3001 | Passerelle uniquement |
| `openapi-registre-justice.yaml` | :3002 | Passerelle uniquement |
| `openapi-registre-fiscal.yaml` | :3003 | Passerelle uniquement |

## Développement parallèle

### Équipe Frontend
Travailler uniquement avec **`openapi-espace-usager.yaml`** (port 3000).
C'est le seul contrat dont le frontend a besoin. Tous les endpoints
sont préfixés `/api/`.

### Équipe Backend
Implémenter les 7 services en respectant les contrats.
L'ordre recommandé :
1. Registres (3 API indépendantes) — le plus simple
2. Journal — pas de dépendance
3. Consentement — pas de dépendance
4. Passerelle — dépend des registres + consentement + journal
5. BFF Espace Usager — orchestre tout

### Test d'interopérabilité
Les contrats des registres (`openapi-registre-*.yaml`) sont standardisés.
Le jury pourra remplacer un registre par celui d'une autre équipe
si le contrat est respecté.

## Conventions communes

- **Auth** : JWT Bearer token dans le header `Authorization`
- **Erreurs** : Format uniforme `{ code: string, message: string }`
- **Pagination** : `{ page, limite, total, pages }`
- **IUE** : Format `12 chiffres aléatoires (ex: 784302956148)`
- **Dates** : ISO 8601 (`2026-01-15` ou `2026-01-15T10:30:00Z`)
- **IDs internes** : UUID v4
