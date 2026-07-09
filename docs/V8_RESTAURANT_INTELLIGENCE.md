# V8 — Recherche restaurant intelligente

Cette passe transforme le **Restaurant Cockpit** en outil de terrain : l'utilisateur peut retrouver rapidement un restaurant, voir ce que l'app sait déjà de son menu et recharger un menu connu sans rescanner.

## Ce qui est ajouté

- Recherche par nom de restaurant, ville, adresse, note et plats connus.
- Tri intelligent, récent, compatibilité profil ou nom A-Z.
- Filtre favoris.
- Bouton **Je suis ici** : active la fiche et incrémente `visitCount`.
- Favoris persistants via `favorite`.
- `lastUsedAt` pour les restaurants récents.
- Score restaurant `/100` calculé avec : favoris, visites, fraîcheur, nombre de plats connus, sources fiables et compatibilité du profil.
- Dashboard du restaurant actif : nombre de plats OK, à vérifier, bloqués, inconnus et meilleurs choix.
- Bouton **Charger menu connu** : génère un texte de menu depuis les plats appris/publics, puis relance l'analyse.
- Bouton **Copier menu connu**.
- Recherche backend optionnelle : `GET /api/restaurants/search?q=...&city=...`.

## Sources utilisées pour le menu connu

Un menu connu de restaurant peut venir de plusieurs sources :

1. corrections locales apprises ;
2. contributions publiques téléchargées ;
3. file locale communautaire encore offline ;
4. restaurants synchronisés depuis le backend SQLite.

Les profils utilisateur ne sont pas partagés. Le moteur utilise seulement les ingrédients publics/locaux associés aux plats.

## Backend SQLite

La table `restaurants` supporte maintenant :

```sql
favorite INTEGER NOT NULL DEFAULT 0
visit_count INTEGER NOT NULL DEFAULT 0
last_used_at TEXT
```

Le serveur ajoute une migration légère au démarrage avec `ALTER TABLE` si les colonnes manquent déjà dans une ancienne base.

Nouvel endpoint :

```text
GET /api/restaurants/search?q=<texte>&city=<ville>&limit=80
```

## Fichiers principaux

- `src/engine/restaurantIntelligence.ts`
- `src/engine/restaurantIntelligence.test.ts`
- `src/main.ts`
- `src/styles.css`
- `server/server.mjs`
- `server/schema.sql`
- `src/types.ts`
- `src/engine/storage.ts`

## Limite volontaire

La V8 ne prétend toujours pas garantir un allergène absent. Même si un restaurant obtient un bon score, les allergies graves doivent rester confirmées auprès du restaurant.
