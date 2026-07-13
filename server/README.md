# Backend local SQLite — Can I Eat It

Backend HTTP local minimal, sans Express, utilisé pour centraliser :

- restaurants ;
- plats appris/corrections ;
- scans locaux ;
- contributions publiques communautaires ;
- export JSON public compatible GitHub ;
- historique de modération des contributions publiques.

Prérequis : Node.js 22 ou plus récent. Le serveur utilise le module SQLite intégré à Node, sans dépendance native à compiler.

## Lancer

```bash
pnpm install
pnpm run server
```

Par défaut :

```text
http://localhost:4177
```

Base :

```text
data/can-i-eat-it.sqlite
```

En local sur `127.0.0.1`, le serveur fonctionne sans jeton. Pour toute exposition réseau, il refuse de démarrer tant que ces variables ne sont pas définies :

```text
CIEI_BACKEND_HOST=0.0.0.0
CIEI_USER_TOKEN=un-secret-long-pour-l-application
CIEI_ADMIN_TOKEN=un-secret-distinct-pour-la-moderation
CIEI_ALLOWED_ORIGINS=https://mon-application.example
```

Le frontend reçoit la même valeur via `VITE_CIEI_BACKEND_TOKEN` et l’envoie avec `Authorization: Bearer …`. Le jeton administrateur ne doit jamais être placé dans une variable frontend publique : la modération intégrée est réservée à une utilisation locale.

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
- `PATCH /api/contributions/:id/status` — administrateur uniquement
- `GET /api/public-db`
- `GET /api/public-db/search?q=...`
- `GET /api/export` — administrateur uniquement

## Données publiques vs privées

Les profils, allergies personnelles, règles religieuses/personnelles et historiques restent dans l'application locale. Les contributions publiques ne contiennent que plat, restaurant, ingrédients, tags dérivés et notes de source. Une contribution nouvelle est toujours forcée en attente de modération ; seules les contributions `community_verified` ou `trusted` apparaissent dans la base publique.


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
