# Can I Eat It — V12

Application **web + EXE Tauri + mobile Capacitor** pour scanner un menu de restaurant/fast-food et vérifier rapidement si les plats sont compatibles avec un profil alimentaire, religieux, allergique ou d'intolérance.

La V12 ajoute la **traduction de menus étrangers** : l'app détecte/enrichit les menus anglais, espagnols, italiens, allemands, japonais, turcs et arabes avec un dictionnaire culinaire embarqué. Le nom original du plat reste visible, mais les ingrédients traduits sont ajoutés au texte d'analyse pour que le moteur alimentaire repère porc, alcool, lait/lactose, gluten, œufs, fruits de mer, arachide, soja, etc. L'OCR avancé V11, l'assistant serveur V10, la commande sûre V9, la recherche restaurant intelligente, la base communautaire et la modération restent intégrés.

## Fonctionnalités présentes

- Interface web responsive.
- Import photo ou prise de photo mobile via `<input capture="environment">`.
- Bouton caméra mobile native via Capacitor Camera quand l'app tourne dans un shell mobile.
- OCR local avec Tesseract.js `fra+eng`.
- Prétraitement image léger avant OCR : redimensionnement, niveaux de gris, contraste.
- **OCR avancé V11** : diagnostic qualité `/100`, prix détectés, sections, colonnes probables et problèmes à contrôler.
- **Nettoyage OCR V11** : correction des prix `12,90e`, séparation des plats collés, symboles parasites, lignes trop longues.
- **Zone à recontrôler V11** : extraction d'un bloc douteux, correction manuelle, analyse de la zone seule ou fusion au menu complet.
- **Traduction menu V12** : détection auto ou langue forcée, traduction offline de termes culinaires et enrichissement du texte pour l'analyse.
- Langues V12 embarquées : français, anglais, espagnol, italien, allemand, japonais, turc et arabe.
- Conservation du nom original + ajout des ingrédients français reconnus : utile pour `prosciutto`, `guanciale`, `panna`, `shrimp`, `wine`, `queso`, `Schwein`, `豚肉`, etc.
- Lignes inconnues listées séparément pour éviter de faire croire à une traduction certaine.
- Zone de correction manuelle du texte OCR.
- Extraction de lignes de menu, prix, sections et descriptions.
- Profils multiples sauvegardés localement.
- Mode solo ou mode groupe.
- Profil utilisateur : végétarien, vegan, pescétarien, sans porc, sans alcool, halal, casher, carême/vendredi sans viande, sans bœuf, faible lactose, sans gluten, règles custom.
- Allergies et intolérances basées sur les 14 allergènes majeurs européens.
- Moteur de décision : OK / À vérifier / Non compatible / Inconnu.
- Score visuel sur 100 pour aider à prioriser.
- Questions à poser au restaurant, copiables plat par plat ou en feuille complète.
- Historique local dans `localStorage`.
- Export JSON d'une analyse.
- Base locale ingrédients + plats courants enrichie.
- **Correction guidée** : modale de composition avec recherche, chips, catégories, niveaux de risque et packs rapides.
- **Édition des plats appris** depuis la mémoire locale.
- **Badges ingrédients** visibles directement dans les résultats.
- **Restaurant Intelligence V12** : recherche restaurant par nom/ville/plat/note, favoris, récents, bouton “Je suis ici”, score restaurant et menu connu rechargeable.
- **Commande sûre V9/V12** : panneau de décision rapide avec colonnes “à commander”, “possible avec demande” et “à éviter”.
- **Modifications automatiques** : sans fromage/crème, sans porc, sans alcool, option sans gluten, sauce à part, cuisson séparée, certification halal/casher à confirmer, etc.
- **Script serveur copiable V9** : texte poli prêt à lire au restaurant avec questions consolidées.
- **Plan de commande copiable** : synthèse restaurant + meilleurs choix + modifications + questions + plats à éviter.
- **Assistant serveur V12** : script multilingue français/anglais/espagnol/italien/allemand, ton poli/court/allergie urgente/règle stricte, priorités allergènes/religieux/végé-santé, lecture vocale navigateur/mobile, réponses cochables et réanalyse après confirmation.
- **Backend local SQLite optionnel** : restaurants, corrections, scans, contributions publiques.
- **Community Database V12** : file locale offline, sync backend, téléchargement d'une base publique, import dans mémoire locale, export JSON compatible dépôt GitHub.
- **Modération & qualité V7/V12** : chargement des contributions, détection problèmes qualité, recommandations de statut, validation/rejet, passage en trusted, obsolescence et fusion de doublons.
- Connecteur Open Food Facts expérimental pour chercher une source produit/ingrédients.
- PWA basique avec service worker.
- Structure prête pour EXE Windows/macOS/Linux avec Tauri v2.
- Structure prête Android/iOS avec Capacitor.
- Tests unitaires du moteur via Vitest.

## Installation web simple

```bash
npm install
npm run dev
```

Puis ouvrir :

```text
http://localhost:5173
```

## Lancer avec backend local SQLite

Terminal 1 :

```bash
npm install
npm run server
```

Terminal 2 :

```bash
npm run dev
```

Par défaut :

```text
Backend : http://localhost:4177
SQLite  : data/can-i-eat-it.sqlite
```

Sur Windows :

```text
LANCER_WEB_AVEC_BACKEND.bat
```

ou seulement le backend :

```text
LANCER_BACKEND_SQLITE.bat
```


## OCR avancé V11

La V11 ajoute une couche de contrôle entre la photo et l'analyse alimentaire.

Le panneau **OCR avancé V11** affiche :

- un score de qualité OCR `/100` ;
- le nombre de plats détectés ;
- le nombre de prix reconnus ;
- les sections repérées ;
- le nombre de colonnes probables ;
- les lignes suspectes à vérifier.

Actions disponibles :

```text
Diagnostic OCR          -> calcule la qualité du texte actuel
Nettoyer texte          -> applique les corrections OCR courantes
Isoler zone douteuse    -> extrait les lignes à vérifier
Appliquer preview       -> remplace le texte par la version nettoyée
Analyser cette zone     -> analyse seulement le bloc corrigé
Fusionner au menu       -> ajoute le bloc corrigé au menu complet
```

Cela permet de corriger rapidement un menu multi-colonnes ou une photo floue avant de lancer la décision alimentaire.

Documentation : `docs/V11_ADVANCED_OCR.md`.


## Traduction menu étranger V12

La V12 ajoute une couche entre l'OCR et l'analyse alimentaire.

Le panneau **Traduction menu V12** permet de :

- détecter automatiquement la langue probable du menu ;
- forcer une langue si l'OCR se trompe ;
- enrichir chaque ligne avec des ingrédients français exploitables par le moteur ;
- repérer avant analyse les termes à risque : porc, alcool, lait/lactose, gluten, œufs, crustacés/mollusques, arachide, soja, moutarde, sésame, céleri, sulfites, gélatine, bouillon ;
- garder une liste de lignes inconnues à vérifier auprès du restaurant.

Exemple :

```text
Carbonara guanciale pecorino 13,90€
```

devient pour l'analyse :

```text
Carbonara guanciale pecorino 13,90€ — carbonara — pâtes, œuf, fromage, porc possible, porc, fromage, gluten blé, œuf
```

Boutons :

```text
Traduire menu        -> génère le rapport de traduction
Appliquer au texte   -> remplace le champ menu par la version enrichie
Traduire + analyser  -> enrichit puis lance directement l'analyse alimentaire
Copier texte enrichi -> copie la version utile pour debug ou contribution
```

Documentation : `docs/V12_MENU_TRANSLATION.md`.

## Recherche restaurant intelligente V9

La V8 ajoute un cockpit terrain pour retrouver très vite un restaurant et réutiliser ce que l'app sait déjà de son menu.

Fonctions principales :

- recherche par nom de restaurant, ville, adresse, note et plats connus ;
- tri intelligent, tri récent, tri par compatibilité et tri alphabétique ;
- filtre favoris ;
- bouton **Je suis ici** qui active le restaurant et incrémente son compteur de visite ;
- favoris persistants ;
- score restaurant `/100` calculé selon favoris, visites, plats connus, sources fiables, compatibilité du profil et fraîcheur de la fiche ;
- résumé actif : nombre de plats compatibles, à vérifier, bloqués et inconnus ;
- meilleurs plats connus selon le profil solo ou groupe ;
- bouton **Charger menu connu** pour générer automatiquement un menu depuis les plats appris/publics du restaurant et relancer l’analyse ;
- bouton **Copier menu connu** ;
- recherche backend optionnelle via `GET /api/restaurants/search`.

Le menu connu est construit depuis :

- corrections locales apprises ;
- contributions publiques téléchargées ;
- file locale communautaire ;
- restaurants synchronisés avec le backend SQLite.


## Commande sûre V9/V12

La V9 ajoute un panneau **Commande sûre** juste après le Restaurant Cockpit. Il ne remplace pas le diagnostic détaillé : il le transforme en décision rapide pour commander.

Le panneau affiche :

- **À commander en priorité** : les plats verts les plus fiables ;
- **Possible avec demande** : plats orange/inconnus avec modifications ou questions à poser ;
- **À éviter** : plats rouges ou incompatibles avec le profil ;
- **Modifications utiles** : demandes prêtes à l'emploi, par exemple “sans fromage/crème”, “sans porc”, “sans alcool”, “cuisson séparée”, “sauce à part” ;
- **Questions consolidées** : doublons supprimés pour ne pas poser 12 fois la même question ;
- **Avertissements sécurité** : rappel allergie/contamination croisée/profil strict.

Actions disponibles :

```text
Copier plan sûr      -> résumé complet de la commande
Script serveur       -> message poli prêt à lire au restaurant
Copier questions     -> seulement les questions essentielles
Copier à éviter      -> liste des plats bloqués et raisons principales
```

En mode groupe, la V9 calcule un choix selon les profils activés : un plat peut être conseillé pour certains, à modifier pour d'autres, ou bloqué pour tout le groupe.

## Modération & Qualité V7/V9

La V7 ajoute un panneau **Modération & qualité** au-dessus de la base communautaire.

Objectifs :

- garder les contributions publiques en `pending_review` tant qu'elles ne sont pas relues ;
- détecter les contributions inutilisables : plat vide, composition vide, notes pouvant contenir un mail/téléphone ;
- signaler les infos faibles : pas de restaurant, source peu fiable, score bas, composition trop courte ;
- recommander automatiquement un statut : `pending_review`, `community_verified`, `trusted`, `rejected` ou `deprecated` ;
- ajuster le score de confiance selon source, preuves, restaurant, nombre d'ingrédients et doublons concordants ;
- regrouper les doublons par plat + restaurant + ville/adresse ;
- fusionner les doublons en conservant la contribution la plus fiable et en obsolétant les autres ;
- copier une fiche de review lisible.

Les actions de modération utilisent le backend si disponible. Si le backend est hors ligne, l'app peut tout de même faire une review locale depuis la file offline et le cache public.

## Community Database V12

La V6 ajoute le panneau Community Database, conservé et intégré dans la V12.

Ce qui peut être partagé :

- nom du plat ;
- restaurant/ville/adresse optionnelle ;
- ingrédients confirmés ou estimés ;
- allergènes/tags alimentaires dérivés des ingrédients ;
- notes de source : menu officiel, serveur, correction utilisateur, etc.

Ce qui n'est jamais partagé :

- profil utilisateur ;
- religion ou régime personnel ;
- allergies personnelles ;
- intolérances personnelles ;
- historique privé ;
- règles custom du profil.

Flux recommandé :

1. Analyse un menu.
2. Corrige un plat avec **Corriger / apprendre** si nécessaire.
3. Clique sur **Partager public** sur le plat ou sur **Partager** depuis la mémoire apprise.
4. La contribution part dans une file locale offline.
5. Clique sur **Sync contributions** quand le backend est disponible.
6. Le backend transforme le statut `queued` en `pending_review`.
7. Le JSON public peut être exporté avec **Exporter GitHub JSON**.

Statuts prévus :

```text
queued -> pending_review -> community_verified -> trusted
                       └-> rejected / deprecated
```

Le backend local fournit aussi :

```text
GET   /api/contributions
POST  /api/contributions
PATCH /api/contributions/:id/status        # statut + notes + score de confiance
GET   /api/restaurants/search?q=...&city=...
GET   /api/public-db
GET   /api/public-db/search?q=...
GET   /api/export                          # export complet local
```

La table `contribution_moderation_events` garde un historique des changements de statut.

L'export public est volontairement compatible avec un dépôt GitHub open-data, par exemple :

```text
public-database/
  can-i-eat-it-public-db.latest.json
  exports/
    can-i-eat-it-public-db-2026-07-09.json
```

## Build web

```bash
npm run build
npm run preview
```

## Tests

```bash
npm run test
```

## Build EXE / desktop avec Tauri

Prérequis Windows : Rust, Node.js, Microsoft C++ Build Tools, WebView2.

```bash
npm install
npm run tauri:dev
npm run tauri:build
```

Le build final sera généré dans `src-tauri/target/release/bundle`.

## Build mobile avec Capacitor

```bash
npm install
npm run build
npm run mobile:add:android
npm run mobile:sync
npm run mobile:open:android
```

Pour iOS :

```bash
npm run mobile:add:ios
npm run mobile:sync
npm run mobile:open:ios
```

## Utiliser Restaurant Intelligence V12

1. Recherche un restaurant par nom, ville, note ou plat connu.
2. Clique sur **Utiliser** ou renseigne une nouvelle fiche puis **Je suis ici**.
3. Marque les restaurants importants en favori.
4. Si des plats sont connus, clique sur **Charger menu connu** pour relancer automatiquement l’analyse sans rescanner.
5. Analyse ou corrige les plats manquants pour enrichir la fiche.
6. Clique sur **Copier plan de commande** pour obtenir une synthèse lisible.

## Utiliser la correction guidée

Après une analyse, clique sur **Corriger / apprendre** sur un plat.

La modale permet de :

- chercher un ingrédient par nom, catégorie ou tag ;
- ajouter/retirer des ingrédients avec des chips ;
- utiliser des packs rapides comme **Lait/fromage**, **Gluten/panure**, **Sauce maison risquée**, **Viande halal à vérifier** ;
- préremplir le restaurant actif ;
- ajouter des alias OCR pour mieux reconnaître le plat la prochaine fois ;
- noter la source : confirmé par serveur, menu officiel, sauce sans alcool, cuisson séparée, etc. ;
- modifier une correction depuis le panneau **Mémoire apprise**.

La prochaine fois qu'un plat du même nom ou alias apparaît, cette correction passe avant la base générique.

## Architecture

```text
src/
  data/
    dishes.ts          Base de plats connus + menus exemples
    ingredients.ts     Base ingrédients, tags et allergènes
    profiles.ts        Profils modèles pour solo/groupe
    rules.ts           Règles utilisateur
  engine/
    backendClient.ts   Client HTTP vers le backend local SQLite
    camera.ts          Capture Capacitor Camera avec fallback
    community.ts       Contributions publiques, modération qualité, doublons, export GitHub JSON
    compatibility.ts   Moteur de décision solo + groupe + mémoire apprise
    export.ts          Export JSON et feuille de questions
    learning.ts        Corrections guidées, recherche ingrédients, résolution et mémoire
    menuParser.ts      Extraction plats/sections/prix depuis OCR/texte
    ocr.ts             Tesseract.js + prétraitement image
    openFoodFacts.ts   Connecteur API produit
    pwa.ts             Service worker optionnel
    recommendations.ts Classement meilleurs choix et plan de commande
    safeOrder.ts      Mode Commande sûre : choix, modifications, script serveur
    storage.ts         LocalStorage profils/historique/réglages/restaurants/community
    text.ts            Normalisation texte
  main.ts              Interface et logique UI
  styles.css           Design responsive
server/
  server.mjs           Backend HTTP local sans Express
  schema.sql           Tables SQLite
src-tauri/             Shell desktop Tauri v2
capacitor.config.ts    Shell mobile Capacitor
public/sw.js           Cache PWA basique
```

## Logique du moteur

Chaque ingrédient possède des tags, par exemple :

```ts
porc -> meat, pork, animal_product
fromage -> milk, dairy, lactose, cheese, animal_product, rennet_risk
vin -> alcohol, wine, may_contain_alcohol, sulphites
sauce maison -> hidden_sauce_risk, unknown_source
friture -> fried_shared_oil_risk, cross_contamination_risk
```

Le moteur compare les tags avec le profil utilisateur.

Exemples :

- Profil halal strict + burger bœuf : bloqué ou à vérifier selon mention/certification halal.
- Profil végétarien + pizza jambon : non compatible.
- Intolérance lactose + tacos sauce fromagère : à vérifier / non compatible selon prudence.
- Allergie arachide + pad thaï : non compatible.
- Mode groupe : le plat peut être OK pour un profil, à vérifier pour un autre, et bloqué pour un troisième.

## Limites assumées

- OCR dépend de la qualité photo, lumière, angle et police du menu.
- La base plat/ingrédient doit continuer à être enrichie.
- Les contributions publiques doivent être modérées avant d'être considérées fiables.
- Open Food Facts est plus adapté aux produits emballés qu'aux plats restaurant.
- L'app ne peut pas garantir l'absence d'allergène ou de contamination croisée.
- Le statut vert signifie “aucun conflit détecté”, pas “garanti sans risque”.
