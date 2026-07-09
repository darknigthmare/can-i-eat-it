# V7 — Modération & qualité communautaire

La V7 transforme la base publique en système contributif contrôlé. L'objectif n'est pas seulement de collecter des plats, mais de garder une base exploitable pour des décisions alimentaires sensibles.

## Nouveautés

- Panneau **Modération & qualité V7** dans l'interface.
- Chargement des contributions depuis le backend SQLite ou depuis le cache/local si le backend est hors ligne.
- Filtres : à modérer, problèmes qualité, doublons, vérifiés, trusted, rejetés, obsolètes, tout.
- Recherche par plat, restaurant, ville, adresse, ingrédient, alias ou note de source.
- Inspection automatique des problèmes qualité :
  - plat absent ou trop court ;
  - aucun ingrédient reconnu ;
  - composition trop courte ;
  - restaurant absent ;
  - source faible ;
  - score bas ;
  - possible donnée personnelle dans les notes ;
  - doublon probable.
- Recommandation de statut et de score de confiance.
- Actions rapides : appliquer reco, vérifier, trusted, rejeter, obsolète, copier fiche.
- Détection de clusters de doublons par plat + restaurant + ville/adresse.
- Fusion d'un cluster : union des ingrédients, conservation de l'entrée la plus fiable, obsolescence des doublons.
- Historique backend des changements dans `contribution_moderation_events`.

## Statuts utilisés

```text
queued            Contribution locale non envoyée
pending_review    Contribution reçue, pas encore validée
community_verified Contribution validée mais pas encore source très forte
trusted           Contribution fiable / consolidée
rejected          Contribution inutilisable ou risquée
deprecated        Contribution remplacée par une meilleure entrée
```

## Score de confiance

Le score est ajusté selon :

- statut actuel ;
- type de source : menu officiel, confirmation restaurant, photo menu, correction utilisateur, modérateur ;
- présence d'une preuve URL/source ;
- présence d'un restaurant ;
- nombre d'ingrédients reconnus ;
- nombre de doublons concordants ;
- problèmes bloquants ou avertissements.

## Backend

L'endpoint existant `PATCH /api/contributions/:id/status` accepte désormais :

```json
{
  "status": "community_verified",
  "moderationNotes": "V7 review -> vérifié communauté.",
  "trustScore": 74
}
```

À chaque changement de statut, le backend ajoute un événement dans `contribution_moderation_events`.

## Règle de confidentialité

La V7 ne modère que des données publiques anonymisées : plat, restaurant, ville/adresse optionnelle, ingrédients, tags, notes de source. Elle ne publie jamais profil utilisateur, religion, allergies personnelles, intolérances, historique privé ni règles custom.
