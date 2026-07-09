# V11 — OCR avancé

La V11 renforce la partie scanner avant l'analyse alimentaire. Le but est de limiter les faux résultats liés aux menus mal lus : colonnes mélangées, prix perdus, lignes collées, sections non détectées ou texte bruité.

## Nouveautés

- Diagnostic OCR après import/photo ou texte manuel.
- Score de qualité OCR sur 100.
- Compteurs : plats détectés, prix, sections, colonnes probables.
- Nettoyage automatique du texte OCR.
- Correction des prix mal reconnus : `12,90e`, `12.90 eur`, `12 € 90`.
- Séparation automatique des plats collés après un prix.
- Détection des menus multi-colonnes probable.
- Détection des lignes suspectes : bruit OCR, symboles parasites, chiffres au milieu des mots, plusieurs prix sur une ligne.
- Résumé des sections : entrées, plats, burgers, tacos, pizzas, desserts, boissons, etc.
- Zone à recontrôler / re-scanner : l'app extrait les lignes les plus sensibles pour permettre une correction manuelle rapide.
- Analyse de la zone seule ou fusion de la zone corrigée dans le menu complet.

## Fichiers ajoutés

```text
src/engine/advancedOcr.ts
src/engine/advancedOcr.test.ts
docs/V11_ADVANCED_OCR.md
```

## Fichiers modifiés

```text
src/engine/ocr.ts
src/engine/menuParser.ts
src/main.ts
src/styles.css
src/types.ts
README.md
package.json
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
```

## Utilisation dans l'app

1. Importer ou prendre une photo du menu.
2. Cliquer sur **Lire la photo avec OCR**.
3. Vérifier le panneau **OCR avancé V11**.
4. Cliquer sur **Nettoyer texte** si besoin.
5. Cliquer sur **Isoler zone douteuse** si le menu est multi-colonnes ou flou.
6. Corriger la zone manuellement.
7. Analyser la zone seule ou fusionner au menu complet.
8. Lancer l'analyse alimentaire.

## Sécurité

La V11 améliore la qualité du texte, mais ne garantit pas que le menu est complet ni que la composition exacte du plat est connue. Pour les allergies graves, contaminations croisées, règles halal/casher strictes ou ingrédients cachés, l'app continue de recommander une confirmation auprès du restaurant.
