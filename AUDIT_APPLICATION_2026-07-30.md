# Audit complet de Can I Eat It

Date : 30 juillet 2026

## Périmètre

L'audit couvre le parcours complet sur ordinateur et mobile :

1. Première ouverture et création du profil.
2. Saisie, import et lecture OCR d'un menu.
3. Analyse individuelle et en groupe.
4. Résultats, détails des plats et plan de commande.
5. Assistant serveur.
6. Adresses de restaurants.
7. Contributions communautaires.
8. Profil, historique, corrections et confidentialité.

## Problèmes trouvés et corrigés

| Priorité | Problème constaté | Correction livrée |
| --- | --- | --- |
| Critique | Le profil devenait presque illisible sur mobile à cause d'une grille à deux colonnes. | Écran profil pleine largeur, navigation horizontale et rubriques dédiées. |
| Critique | Le mode individuel pouvait inclure les allergies d'autres profils du groupe. | L'analyse individuelle utilise exclusivement le profil actif. |
| Haute | Changer ou créer un profil conservait des résultats calculés pour l'ancien profil. | Réanalyse immédiate et synchronisation des exports, du groupe et de l'historique courant. |
| Haute | Les termes personnels interdits n'étaient appliqués qu'avec une ancienne option cachée. | Les termes personnels sont toujours pris en compte par le moteur. |
| Haute | L'effacement des données ne supprimait pas toutes les données locales de l'application. | Action d'effacement global des clés locales `can-i-eat-it:*`. |
| Haute | L'OCR prenait des noms de plats pour des titres de section et produisait des plages de lignes impossibles. | Détection stricte des sections, bornes cohérentes et test de non-régression. |
| Haute | Les rapports OCR et de traduction se refermaient au moment de leur affichage. | Les rapports restent ouverts lorsqu'ils contiennent un résultat. |
| Moyenne | Le premier lancement imposait un faux profil et un menu d'exemple. | Profil neutre, menu vide et onboarding court en quatre étapes. |
| Moyenne | Résultats, plan de commande et assistant répétaient les mêmes informations et actions. | Résumé unique, cartes repliables et questions regroupées dans l'assistant. |
| Moyenne | Allergies et intolérances étaient mélangées dans une longue page. | Écrans séparés, grilles compactes et 14 allergènes réglementaires clairement identifiés. |
| Moyenne | Les régimes végétalien, végétarien et pescétarien pouvaient être contradictoires. | Sélection mutuellement exclusive. |
| Moyenne | Restaurants et communauté ressemblaient à des tableaux techniques et perdaient le focus pendant la saisie. | Interfaces recentrées sur les tâches, filtres secondaires repliés et focus préservé. |
| Moyenne | Plusieurs contrôles, badges et gestionnaires d'événements étaient morts ou trompeurs. | Suppression des doublons, du badge fixe et des actions inutilisées. |

## Résultat UX et UI

- Navigation principale conservée, avec de vrais écrans pour chaque responsabilité.
- Profil découpé en huit rubriques : identité, alimentation, allergies, intolérances, termes, corrections, historique et données.
- Design clair, sobre et professionnel, avec un code couleur réservé aux états de sécurité.
- Textes courts, détails progressifs et panneaux secondaires repliables.
- Mise en page vérifiée sans débordement horizontal aux formats `1440x900` et `390x844`.
- Résumé mobile ramené de plus de `4 000 px` à `2 253 px` de hauteur grâce à la suppression des répétitions et aux détails progressifs.
- Actions principales visibles et dimensions stables sur ordinateur comme sur mobile.

## Cohérence métier

- Les 14 allergènes obligatoires de l'Union européenne sont traités séparément des intolérances.
- Une allergie déclarée bloque le plat ; les ambiguïtés et contaminations croisées restent à confirmer avec le restaurant.
- L'application reste un outil d'aide à la décision et ne remplace pas la confirmation d'un professionnel.

Références : [Commission européenne](https://food.ec.europa.eu/food-safety/labelling-and-nutrition/food-information-consumers-legislation/mandatory-food-information_en), [EFSA](https://www.efsa.europa.eu/en/safe2eat/food-allergens), [Anses](https://www.anses.fr/fr/content/allergies-alimentaires-ameliorer-linformation-pour-prevenir-les-risques).

## Validation

- Vérification TypeScript stricte sans erreur ni symbole inutilisé.
- `30/30` tests unitaires réussis sur le moteur, le stockage, l'OCR et l'intelligence restaurant.
- Build Vite de production réussi.
- Parcours navigateur complet sur ordinateur et mobile.
- Vérification de la version publiée sur Vercel.

## Limites connues

- L'OCR reste heuristique : une photo floue ou un menu très graphique peut demander une correction manuelle.
- La synchronisation communautaire distante reste optionnelle ; le fonctionnement local et l'export restent disponibles sans serveur.
