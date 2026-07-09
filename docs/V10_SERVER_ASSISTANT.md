# V10 — Assistant serveur avancé

La V10 ajoute une couche terrain au-dessus de la commande sûre : au lieu de seulement copier une liste de questions, l'app prépare une discussion guidée avec le serveur, puis réanalyse le risque selon les réponses obtenues.

## Objectif

Quand un plat est orange ou inconnu, l'utilisateur doit pouvoir faire trois choses rapidement :

1. lire une phrase claire au serveur ;
2. cocher la réponse obtenue ;
3. savoir si le plat devient acceptable, reste à vérifier ou doit être évité.

## Données privées

L'assistant serveur n'envoie rien sur internet. Il utilise seulement les résultats déjà présents dans le scan courant.

Les profils utilisateur, allergies personnelles, règles religieuses et intolérances restent locaux.

## Langues intégrées

La V10 embarque des modèles de questions pour :

- français ;
- anglais ;
- espagnol ;
- italien ;
- allemand.

Les traductions sont des modèles de sécurité par catégorie : allergène, contamination croisée, halal, casher, porc, alcool, gluten, lactose, sauce, composition, modification.

## Tons disponibles

- poli / complet ;
- court / direct ;
- allergie urgente ;
- règle stricte.

## Priorités

- standard ;
- allergènes en priorité ;
- religieux strict ;
- végétarien / vegan / santé.

## Réponses cochables

Chaque question peut être marquée comme :

```text
Confirmé sûr
Risque confirmé
Modification impossible
Le serveur ne sait pas
Non répondu
```

## Réanalyse

La réanalyse suit une logique volontairement prudente :

- si au moins un risque est confirmé : `blocked` ;
- si une modification impossible est cochée : `blocked` ;
- si une réponse est inconnue ou non répondue : `caution` ;
- si toutes les réponses sont favorables : `safe`.

Pour une allergie sévère, l'app continue à afficher un rappel de prudence. Une estimation ou une réponse incertaine ne devient jamais une garantie.

## Lecture vocale

La V10 utilise `window.speechSynthesis` quand le navigateur ou le shell mobile/desktop la fournit. Si l'API n'est pas disponible, l'app garde les boutons de copie.

## Fichiers ajoutés

```text
src/engine/serverAssistant.ts
src/engine/serverAssistant.test.ts
docs/V10_SERVER_ASSISTANT.md
```

## Points à améliorer ensuite

- enregistrer une réponse par plat plutôt que par question globale ;
- transformer automatiquement une réponse serveur en correction guidée proposée ;
- ajouter arabe, portugais, japonais ;
- ajouter un mode conversation phrase par phrase ;
- connecter un traducteur cloud optionnel si l'utilisateur accepte le réseau.
