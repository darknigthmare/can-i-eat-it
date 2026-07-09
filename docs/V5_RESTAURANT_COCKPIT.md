# V5 — Restaurant Cockpit

Objectif : rendre l'app utile en situation réelle au restaurant, pas seulement comme analyseur OCR.

## Ajouts

- Fiche restaurant active : nom, ville, adresse, notes.
- Sauvegarde locale des restaurants dans `localStorage`.
- Synchronisation des fiches restaurants avec le backend SQLite existant.
- Association du restaurant actif au `ScanRecord`.
- Correction guidée préremplie avec le restaurant actif.
- Recommandations de commande en solo ou groupe.
- Plan de commande copiable : meilleurs choix, questions à poser, plats à éviter.

## Comportement

1. L'utilisateur renseigne un restaurant.
2. Il sauvegarde la fiche.
3. Il scanne/analyse le menu.
4. Le scan contient `restaurant` dans son JSON.
5. Les corrections apprises peuvent garder `restaurantName`.
6. La vue cockpit classe les plats par niveau de compatibilité.

## Backend

La V3 avait déjà les tables `restaurants`, `learned_dishes` et `scans`.
La V5 active réellement les routes restaurants côté frontend :

- `GET /api/restaurants`
- `POST /api/restaurants`

## Prudence produit

Le Restaurant Cockpit ne transforme pas une estimation en certitude. Pour les allergies et règles strictes, le plan de commande met volontairement les questions à poser en avant.
