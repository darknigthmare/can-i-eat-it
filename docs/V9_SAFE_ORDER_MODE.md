# V9 — Mode Commande sûre

La V9 ajoute une couche “terrain” : au lieu de seulement afficher le diagnostic complet, l'app génère une décision rapide pour commander.

## Objectif

Transformer les résultats d'analyse en quatre blocs utiles :

1. **À commander en priorité** : plats compatibles avec le profil actif ou le groupe.
2. **Possible avec demande** : plats qui nécessitent une modification ou une confirmation serveur.
3. **À éviter** : plats bloqués par une allergie, une intolérance, une règle religieuse/alimentaire ou un ingrédient interdit.
4. **Questions/modifications consolidées** : doublons supprimés, phrases prêtes à copier.

## Fichiers ajoutés

```text
src/engine/safeOrder.ts       Génération du plan de commande sûre
src/engine/safeOrder.test.ts  Tests unitaires du mode commande sûre
docs/V9_SAFE_ORDER_MODE.md    Documentation de cette passe
```

## Fonctions principales

```ts
buildSafeOrderPlan(options)
buildSafeOrderPlanFromRecord(record)
buildSafeOrderShortText(plan)
buildSafeOrderServerScript(plan)
```

## Actions UI

Le panneau V9 expose :

```text
Copier plan sûr      -> synthèse complète de commande
Script serveur       -> message poli à lire au restaurant
Copier questions     -> questions seulement
Copier à éviter      -> plats bloqués avec raison courte
```

## Modifications automatiques détectées

Le moteur propose automatiquement des demandes comme :

- demander sans fromage, crème, beurre ou sauce lactée ;
- retirer jambon/lardons/bacon/chorizo ;
- demander une recette sans vin, bière, mirin ou alcool flambé ;
- demander option sans gluten et friture séparée ;
- demander certification halal/casher pour viande, bouillon ou gélatine ;
- demander sauce à part ;
- confirmer allergènes et contamination croisée ;
- demander préparation séparée.

## Mode groupe

En mode groupe, un plat n'est pas seulement “vert/orange/rouge”. Il indique :

```text
2/4 profils OK · 1 à vérifier · 1 bloqué
```

La carte affiche aussi les statuts individuels pour éviter de commander un plat collectif risqué pour une personne du groupe.

## Limite volontaire

La V9 reste prudente : elle ne transforme pas une estimation en garantie. Pour les allergies sévères ou les profils stricts, le script serveur insiste sur la confirmation restaurant et la contamination croisée.
