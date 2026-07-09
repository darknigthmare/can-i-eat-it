# V6 — Community Database

Objectif : permettre à l'application de grossir toute seule à l'usage, sans publier les données sensibles des utilisateurs.

## Principe

L'utilisateur corrige un plat ou confirme une composition. Il peut ensuite choisir de partager cette correction dans une base publique.

La contribution publique contient uniquement :

- nom du plat ;
- alias OCR ;
- restaurant, ville, adresse optionnelle ;
- ingrédients ;
- tags allergènes/diet/religieux dérivés des ingrédients ;
- source déclarée ;
- notes de source ;
- score de confiance.

Elle ne contient pas :

- profil utilisateur ;
- religion déclarée ;
- allergies personnelles ;
- intolérances personnelles ;
- historique personnel ;
- identité réelle.

## Architecture

```text
App web / mobile / Tauri
  ├─ localStorage privé
  ├─ file locale contributions V6
  ├─ cache public-db
  ↓
Backend SQLite local ou communautaire
  ├─ public_contributions
  ├─ restaurants
  ├─ learned_dishes
  └─ scans privés locaux
  ↓
Export public JSON
  └─ dépôt GitHub open-data possible
```

## Statuts

```text
queued
pending_review
community_verified
trusted
rejected
deprecated
```

- `queued` : contribution stockée offline dans l'application.
- `pending_review` : envoyée au backend, en attente de modération.
- `community_verified` : plusieurs sources/utilisateurs concordent.
- `trusted` : validée par modération ou source fiable.
- `rejected` : invalide, spam, doublon dangereux.
- `deprecated` : ancienne info remplacée.

## Endpoints backend

```text
GET    /health
GET    /api/contributions?status=&limit=300
POST   /api/contributions
PATCH  /api/contributions/:id/status
GET    /api/public-db
GET    /api/public-db/search?q=burger&limit=80
GET    /api/export
```

## Export GitHub JSON

Le bouton **Exporter GitHub JSON** génère un fichier :

```text
can-i-eat-it-public-db-YYYY-MM-DD.json
```

Structure :

```json
{
  "schemaVersion": 1,
  "exportedAt": "...",
  "generatedBy": "Can I Eat It 0.6.0",
  "stats": {},
  "restaurants": [],
  "dishes": []
}
```

Ce fichier peut être publié dans un dépôt public, par exemple :

```text
public-database/
  can-i-eat-it-public-db.latest.json
  exports/
    can-i-eat-it-public-db-2026-07-09.json
```

## Prochaine évolution logique

V7 devrait ajouter :

- écran admin/modération ;
- fusion de doublons ;
- votes communautaires ;
- preuves photo/menu officiel ;
- score de réputation contributeur ;
- import direct depuis URL GitHub raw ;
- mode Supabase/PostgreSQL pour vrai déploiement public.
