# Backend local SQLite — Can I Eat It V10

Backend HTTP local minimal, sans Express, utilisé pour centraliser :

- restaurants ;
- plats appris/corrections ;
- scans locaux ;
- contributions publiques communautaires ;
- export JSON public compatible GitHub ;
- historique de modération des contributions publiques.

## Lancer

```bash
npm install
npm run server
```

Par défaut :

```text
http://localhost:4177
```

Base :

```text
data/can-i-eat-it.sqlite
```

## Routes principales

- `GET /health`
- `GET /api/restaurants`
- `POST /api/restaurants`
- `GET /api/learned-dishes`
- `POST /api/learned-dishes`
- `DELETE /api/learned-dishes/:id`
- `GET /api/scans`
- `POST /api/scans`
- `GET /api/contributions?status=&limit=300`
- `POST /api/contributions`
- `PATCH /api/contributions/:id/status` — statut, notes de modération et score de confiance
- `GET /api/public-db`
- `GET /api/public-db/search?q=...`
- `GET /api/export`

## Données publiques vs privées

Les profils, allergies personnelles, règles religieuses/personnelles et historiques restent dans l'application locale. Les contributions publiques ne contiennent que plat, restaurant, ingrédients, tags dérivés et notes de source.


## Modération V10

`PATCH /api/contributions/:id/status` accepte :

```json
{
  "status": "community_verified",
  "moderationNotes": "V10 review -> vérifié communauté.",
  "trustScore": 74
}
```

Chaque changement de statut est journalisé dans `contribution_moderation_events` avec statut avant/après, score avant/après et note.
