# V4 — Correction guidée

Objectif : rendre la mémoire apprise utilisable au quotidien.

## Ce qui a changé

Avant, la correction d'un plat demandait une liste texte dans un `prompt()`. En V4, l'utilisateur ouvre une modale et sélectionne visuellement les ingrédients.

## Flux utilisateur

1. Scanner/analyser un menu.
2. Cliquer sur **Corriger / apprendre**.
3. Vérifier ou compléter les ingrédients détectés.
4. Ajouter un restaurant, des alias OCR et des notes de source.
5. Sauvegarder.
6. Le plat est réanalysé immédiatement avec la nouvelle composition.

## Recherche ingrédients

La recherche couvre :

- noms usuels ;
- IDs internes ;
- catégories ;
- tags de risque ;
- allergènes ;
- mots comme porc, fromage, gluten, alcool, sauce, friture, halal, casher.

## Packs rapides

Les packs servent à accélérer les cas fréquents :

- Viande halal à vérifier ;
- Lait/fromage ;
- Gluten/panure ;
- Sauce maison risquée ;
- Base végétarienne ;
- Base vegan ;
- Poisson/fruits de mer ;
- Alcool/vin.

## Important sécurité

Une correction apprise reflète ce que l'utilisateur a renseigné. Pour allergies sévères, garder une note de source et demander confirmation au restaurant.
