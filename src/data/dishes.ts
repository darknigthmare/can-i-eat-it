import type { DishSeed } from '../types';

export const DISHES: DishSeed[] = [
  {
    id: 'pizza-margherita',
    names: ['pizza margherita', 'margherita'],
    ingredients: ['gluten_ble', 'fromage', 'legumes'],
    cuisine: 'italien',
    confidence: 'probable',
    notes: 'Tomate + mozzarella + pâte. Présure du fromage à vérifier en strict végétarien.',
  },
  {
    id: 'pizza-jambon',
    names: ['pizza jambon', 'reine', 'pizza reine', 'pizza prosciutto', 'regina'],
    ingredients: ['gluten_ble', 'fromage', 'porc', 'legumes'],
    cuisine: 'italien',
    confidence: 'probable',
  },
  {
    id: 'pizza-pepperoni',
    names: ['pizza pepperoni', 'pepperoni'],
    ingredients: ['gluten_ble', 'fromage', 'porc'],
    cuisine: 'italien',
    confidence: 'probable',
  },
  {
    id: 'pizza-4-fromages',
    names: ['pizza quatre fromages', 'pizza 4 fromages', 'quatre fromages', '4 fromages'],
    ingredients: ['gluten_ble', 'fromage'],
    cuisine: 'italien',
    confidence: 'probable',
  },
  {
    id: 'pizza-vegetarienne',
    names: ['pizza végétarienne', 'pizza vegetarienne', 'pizza veggie', 'pizza légumes', 'pizza legumes'],
    ingredients: ['gluten_ble', 'fromage', 'legumes'],
    cuisine: 'italien',
    confidence: 'probable',
  },
  {
    id: 'burger-boeuf',
    names: ['burger boeuf', 'burger bœuf', 'cheeseburger', 'hamburger', 'double cheese', 'big burger'],
    ingredients: ['gluten_ble', 'boeuf', 'fromage', 'oeuf', 'moutarde', 'sauce_maison'],
    cuisine: 'fast-food',
    confidence: 'probable',
    notes: 'Mayonnaise/sauce souvent à base d’œuf et moutarde.',
  },
  {
    id: 'burger-poulet',
    names: ['burger poulet', 'chicken burger', 'crispy chicken', 'burger crispy'],
    ingredients: ['gluten_ble', 'poulet', 'oeuf', 'moutarde', 'huile_friture', 'sauce_maison'],
    cuisine: 'fast-food',
    confidence: 'probable',
  },
  {
    id: 'burger-veggie',
    names: ['burger végétarien', 'burger vegetarien', 'veggie burger', 'burger veggie'],
    ingredients: ['label_vegetarien', 'gluten_ble', 'fromage', 'oeuf', 'soja', 'moutarde', 'sauce_maison'],
    cuisine: 'fast-food',
    confidence: 'estimated',
    notes: 'Peut être vegan ou seulement végétarien selon steak/sauce/fromage.',
  },
  {
    id: 'burger-vegan',
    names: ['burger vegan', 'burger végan', 'plant based burger'],
    ingredients: ['label_vegan', 'gluten_ble', 'soja', 'moutarde', 'sauce_maison'],
    cuisine: 'fast-food',
    confidence: 'estimated',
    notes: 'Même si le nom indique vegan, la friture et les sauces restent à vérifier pour allergènes.',
  },
  {
    id: 'falafel-wrap',
    names: ['wrap falafel', 'falafel', 'sandwich falafel', 'pita falafel'],
    ingredients: ['gluten_ble', 'pois_chiche', 'legumes', 'sesame', 'yaourt'],
    cuisine: 'levantin',
    confidence: 'estimated',
    notes: 'Sauce blanche/yaourt fréquente, demander sans sauce si lactose/vegan.',
  },
  {
    id: 'kebab',
    names: ['kebab', 'doner', 'döner', 'durum', 'dürüm', 'tacos kebab'],
    ingredients: ['gluten_ble', 'agneau', 'poulet', 'legumes', 'yaourt', 'huile_friture'],
    cuisine: 'fast-food oriental',
    confidence: 'estimated',
    notes: 'Viande et certification halal variables selon restaurant; sauce blanche contient souvent lait.',
  },
  {
    id: 'tacos-poulet',
    names: ['tacos poulet', 'french tacos poulet', 'tacos tenders'],
    ingredients: ['gluten_ble', 'poulet', 'fromage', 'creme', 'huile_friture'],
    cuisine: 'fast-food',
    confidence: 'estimated',
    notes: 'Sauce fromagère presque toujours lactée; viande halal à vérifier.',
  },
  {
    id: 'tacos-viande-hachee',
    names: ['tacos viande hachée', 'tacos viande hachee', 'tacos steak', 'tacos boeuf'],
    ingredients: ['gluten_ble', 'boeuf', 'fromage', 'creme', 'huile_friture'],
    cuisine: 'fast-food',
    confidence: 'estimated',
  },
  {
    id: 'salade-caesar',
    names: ['salade caesar', 'salade césar', 'caesar salad', 'césar poulet'],
    ingredients: ['poulet', 'fromage', 'oeuf', 'anchois', 'gluten_ble', 'moutarde'],
    cuisine: 'international',
    confidence: 'probable',
    notes: 'La sauce Caesar contient souvent anchois, œuf, parmesan.',
  },
  {
    id: 'salade-grecque',
    names: ['salade grecque', 'greek salad', 'salade feta'],
    ingredients: ['fromage', 'legumes'],
    cuisine: 'grec',
    confidence: 'probable',
  },
  {
    id: 'pates-carbonara',
    names: ['carbonara', 'pâtes carbonara', 'pates carbonara', 'spaghetti carbonara'],
    ingredients: ['gluten_ble', 'porc', 'oeuf', 'fromage', 'creme'],
    cuisine: 'italien',
    confidence: 'probable',
  },
  {
    id: 'pates-bolognaise',
    names: ['bolognaise', 'spaghetti bolognaise', 'pâtes bolognaise', 'pates bolognaise'],
    ingredients: ['gluten_ble', 'boeuf', 'legumes', 'vin', 'bouillon'],
    cuisine: 'italien',
    confidence: 'estimated',
    notes: 'Certaines recettes contiennent vin ou bouillon.',
  },
  {
    id: 'risotto-champignon',
    names: ['risotto champignons', 'risotto aux champignons', 'risotto fungi', 'risotto funghi'],
    ingredients: ['riz', 'fromage', 'beurre', 'vin', 'bouillon'],
    cuisine: 'italien',
    confidence: 'estimated',
    notes: 'Risotto classique : vin blanc, beurre, parmesan, bouillon.',
  },
  {
    id: 'sushi-saumon',
    names: ['sushi saumon', 'maki saumon', 'sashimi saumon'],
    ingredients: ['saumon', 'riz', 'soja', 'raw_food_risk'],
    cuisine: 'japonais',
    confidence: 'probable',
  },
  {
    id: 'sushi-veggie',
    names: ['maki avocat', 'sushi végétarien', 'sushi vegetarien', 'california veggie'],
    ingredients: ['riz', 'legumes', 'soja', 'sesame'],
    cuisine: 'japonais',
    confidence: 'probable',
  },
  {
    id: 'ramen-porc',
    names: ['ramen porc', 'tonkotsu', 'ramen tonkotsu', 'chashu ramen'],
    ingredients: ['porc', 'gluten_ble', 'oeuf', 'bouillon', 'soja'],
    cuisine: 'japonais',
    confidence: 'probable',
  },
  {
    id: 'ramen-poulet',
    names: ['ramen poulet', 'shoyu chicken ramen'],
    ingredients: ['poulet', 'gluten_ble', 'oeuf', 'bouillon', 'soja'],
    cuisine: 'japonais',
    confidence: 'probable',
  },
  {
    id: 'pad-thai-crevettes',
    names: ['pad thai crevettes', 'pad thaï crevettes', 'pad thai shrimp'],
    ingredients: ['crevette', 'oeuf', 'arachide', 'soja', 'huile_friture'],
    cuisine: 'thaï',
    confidence: 'probable',
  },
  {
    id: 'pad-thai-tofu',
    names: ['pad thai tofu', 'pad thaï tofu'],
    ingredients: ['soja', 'oeuf', 'arachide', 'huile_friture'],
    cuisine: 'thaï',
    confidence: 'probable',
    notes: 'Demander sans œuf pour vegan.',
  },
  {
    id: 'curry-poulet',
    names: ['curry poulet', 'chicken curry'],
    ingredients: ['poulet', 'creme', 'epices', 'riz'],
    cuisine: 'indien/thaï',
    confidence: 'estimated',
    notes: 'Peut contenir crème, yaourt, ghee ou lait de coco selon recette.',
  },
  {
    id: 'curry-legumes',
    names: ['curry légumes', 'curry legumes', 'vegetable curry', 'curry végétarien'],
    ingredients: ['legumes', 'epices', 'creme', 'riz'],
    cuisine: 'indien/thaï',
    confidence: 'estimated',
  },
  {
    id: 'naan-fromage',
    names: ['naan fromage', 'cheese naan'],
    ingredients: ['gluten_ble', 'fromage', 'yaourt'],
    cuisine: 'indien',
    confidence: 'probable',
  },
  {
    id: 'boeuf-bourguignon',
    names: ['boeuf bourguignon', 'bœuf bourguignon'],
    ingredients: ['boeuf', 'porc', 'vin', 'bouillon', 'gluten_ble'],
    cuisine: 'français',
    confidence: 'probable',
  },
  {
    id: 'moules-frites',
    names: ['moules frites', 'moules marinières', 'moules marinieres'],
    ingredients: ['mollusques', 'vin', 'beurre', 'huile_friture'],
    cuisine: 'français/belge',
    confidence: 'probable',
  },
  {
    id: 'fish-and-chips',
    names: ['fish and chips', 'poisson frit'],
    ingredients: ['poisson_blanc', 'gluten_ble', 'oeuf', 'huile_friture'],
    cuisine: 'britannique',
    confidence: 'probable',
  },
  {
    id: 'omelette',
    names: ['omelette', 'omelette fromage', 'omelette champignons'],
    ingredients: ['oeuf', 'fromage', 'beurre', 'legumes'],
    cuisine: 'brasserie',
    confidence: 'estimated',
  },
  {
    id: 'crepe-sucree',
    names: ['crêpe sucre', 'crepe sucre', 'crêpe nutella', 'crepe nutella', 'crêpe chocolat', 'crepe chocolat'],
    ingredients: ['gluten_ble', 'oeuf', 'lait', 'beurre', 'fruits_coque'],
    cuisine: 'français',
    confidence: 'estimated',
  },
  {
    id: 'panna-cotta',
    names: ['panna cotta'],
    ingredients: ['lait', 'creme', 'gelatine'],
    cuisine: 'italien',
    confidence: 'probable',
  },
  {
    id: 'cheesecake',
    names: ['cheesecake', 'cheese cake', 'cheesecake spéculoos', 'cheesecake speculoos'],
    ingredients: ['fromage', 'creme', 'gluten_ble', 'beurre', 'oeuf'],
    cuisine: 'dessert',
    confidence: 'probable',
  },
  {
    id: 'poke-bowl-saumon',
    names: ['poke bowl saumon', 'poké saumon', 'poke saumon'],
    ingredients: ['saumon', 'riz', 'soja', 'sesame', 'legumes'],
    cuisine: 'hawaiien/japonais',
    confidence: 'estimated',
  },
  {
    id: 'planche-charcuterie',
    names: ['planche charcuterie', 'assiette charcuterie', 'charcuterie fromage'],
    ingredients: ['charcuterie_mixte', 'fromage', 'gluten_ble'],
    cuisine: 'brasserie',
    confidence: 'probable',
  },
  {
    id: 'houmous',
    names: ['houmous', 'hummus', 'houmous maison'],
    ingredients: ['pois_chiche', 'sesame', 'legumes'],
    cuisine: 'levantin',
    confidence: 'probable',
  },
];

export const SAMPLE_MENUS = [
  {
    id: 'fast-food-fr',
    name: 'Fast-food français',
    text: `Burgers\nBurger boeuf cheddar - 9,90€\nBurger végétarien sauce maison - 8,90€\nBurger vegan crispy - 9,40€\n\nTacos\nTacos poulet sauce fromagère - 10,50€\nWrap falafel sauce blanche - 7,90€\nFrites maison - 3,50€\nCheesecake spéculoos - 4,90€`,
  },
  {
    id: 'brasserie-fr',
    name: 'Brasserie',
    text: `Entrées\nSalade Caesar poulet - 13€\nPlanche charcuterie fromage - 15€\n\nPlats\nOmelette fromage champignons - 11€\nBoeuf bourguignon - 17€\nMoules marinières frites - 16€\nRisotto aux champignons - 14€\n\nDesserts\nCrêpe chocolat noisette - 6€`,
  },
  {
    id: 'italien-japonais',
    name: 'Menu mix italien/japonais',
    text: `Pizza Margherita 11€\nPizza Reine jambon champignons 13€\nPâtes Carbonara 12€\nSushi saumon x6 8€\nMaki avocat sésame x6 6€\nRamen tonkotsu porc 14€`,
  },
  {
    id: 'groupe-allergies',
    name: 'Groupe/allergies',
    text: `Houmous maison et pain pita - 7€\nPad thaï tofu cacahuètes - 12€\nPoke bowl saumon soja sésame - 13€\nCurry légumes crème coco - 11€\nFish and chips sauce tartare - 14€\nPanna cotta fruits rouges - 6€`,
  },
  {
    id: 'v12-italian-foreign',
    name: 'V12 menu italien',
    text: `Antipasti
Bruschetta pomodoro e basilico 7,50€
Prosciutto crudo e mozzarella 11,90€

Primi
Carbonara guanciale pecorino 13,90€
Risotto funghi vino bianco 15,50€

Dolci
Panna cotta gelatina 6,50€`,
  },
  {
    id: 'v12-world-foreign',
    name: 'V12 menu international',
    text: `Starters
Shrimp tempura sesame mayo 8,90€
Chicken curry cream rice 12,90€

Tapas
Tacos cerdo queso crema 9,50€
Vegetarian falafel tahini salad 8,50€

Ramen
豚骨 ramen egg soy wheat noodles 14,00€`,
  },
];
