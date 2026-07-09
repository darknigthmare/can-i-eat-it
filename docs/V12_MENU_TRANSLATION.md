# V12 — Traduction de menus étrangers

La V12 ajoute une couche de **traduction/enrichissement offline** entre l'OCR et le moteur alimentaire.

L'objectif n'est pas de faire une traduction littéraire complète. L'objectif est de rendre un menu étranger exploitable par le moteur de compatibilité : reconnaître les termes à risque et ajouter des ingrédients français à la ligne du plat.

## Flux recommandé

```text
Photo menu
  ↓
OCR avancé V11
  ↓
Traduction menu V12
  ↓
Texte enrichi
  ↓
Analyse profil / groupe
  ↓
Commande sûre + assistant serveur
```

## Langues embarquées

La V12 fonctionne offline avec un dictionnaire culinaire pour :

- français ;
- anglais ;
- espagnol ;
- italien ;
- allemand ;
- japonais ;
- turc ;
- arabe.

## Ce que la V12 reconnaît

Exemples de familles :

- porc / charcuterie : `prosciutto`, `guanciale`, `pancetta`, `ham`, `bacon`, `cerdo`, `Schwein`, `豚肉` ;
- alcool : `wine`, `vino`, `cerveza`, `birra`, `Wein`, `ビール` ;
- lait/lactose : `cheese`, `panna`, `queso`, `Käse`, `milk`, `cream`, `チーズ` ;
- gluten : `wheat`, `flour`, `pasta`, `farina`, `trigo`, `Weizen`, `小麦` ;
- œuf : `egg`, `uovo`, `huevo`, `Ei`, `卵` ;
- crustacés/mollusques : `shrimp`, `gamberi`, `gambas`, `Garnelen`, `えび` ;
- soja, arachide, fruits à coque, moutarde, sésame, céleri, sulfites, gélatine, bouillon.

## Exemple

Entrée menu :

```text
Primi
Carbonara guanciale pecorino 13,90€
Risotto funghi vino bianco 15,50€
```

Sortie enrichie :

```text
Primi — Plats
Carbonara guanciale pecorino 13,90€ — carbonara — pâtes, œuf, fromage, porc possible, porc, fromage, œuf, gluten blé
Risotto funghi vino bianco 15,50€ — vin/alcool, alcool, sulfites
```

Le moteur alimentaire peut ensuite bloquer ou signaler :

- porc ;
- alcool ;
- lait/lactose ;
- gluten ;
- œufs ;
- certification halal/casher à vérifier.

## Prudence

La V12 ne remplace pas une confirmation serveur. Elle aide à détecter plus vite les risques, mais :

- un plat peut contenir des ingrédients non écrits sur le menu ;
- l'OCR peut mal lire une langue étrangère ;
- certaines recettes changent selon le restaurant ;
- les allergènes graves doivent toujours être confirmés auprès du restaurant.

## Fichiers ajoutés

```text
src/engine/menuTranslation.ts
src/engine/menuTranslation.test.ts
docs/V12_MENU_TRANSLATION.md
```
