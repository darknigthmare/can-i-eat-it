import { INGREDIENTS } from '../data/ingredients';
import type { AllergenId, IngredientTag } from '../types';
import { normalizeText, titleCase, unique } from './text';

export type MenuTranslationLanguage = 'auto' | 'fr' | 'en' | 'es' | 'it' | 'de' | 'ja' | 'tr' | 'ar';
export type DetectedMenuLanguage = Exclude<MenuTranslationLanguage, 'auto'>;

export interface MenuTranslationGlossaryHit {
  term: string;
  language: DetectedMenuLanguage;
  translation: string;
  category: 'section' | 'ingredient' | 'dish' | 'preparation' | 'diet-label';
  ingredientIds: string[];
  tags: IngredientTag[];
  allergens: AllergenId[];
  riskLevel: 'safe' | 'caution' | 'danger' | 'info';
  note?: string;
}

export interface MenuLineTranslation {
  lineNumber: number;
  original: string;
  translated: string;
  analysisLine: string;
  confidence: number;
  hits: MenuTranslationGlossaryHit[];
  warnings: string[];
}

export interface MenuTranslationReport {
  generatedAt: string;
  requestedSourceLanguage: MenuTranslationLanguage;
  detectedLanguage: DetectedMenuLanguage;
  detectedLanguageLabel: string;
  detectionConfidence: number;
  translatedText: string;
  analysisText: string;
  lineTranslations: MenuLineTranslation[];
  glossaryHits: MenuTranslationGlossaryHit[];
  dangerousIngredientIds: string[];
  cautionIngredientIds: string[];
  unknownLines: string[];
  warnings: string[];
  summary: string;
}

interface GlossaryEntry {
  id: string;
  category: MenuTranslationGlossaryHit['category'];
  translation: string;
  ingredientIds?: string[];
  note?: string;
  terms: Partial<Record<DetectedMenuLanguage, string[]>>;
}

const SUPPORTED_LANGUAGES: DetectedMenuLanguage[] = ['fr', 'en', 'es', 'it', 'de', 'ja', 'tr', 'ar'];
const ALLERGEN_TAGS = new Set<AllergenId>(['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']);
const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]));

const GLOSSARY: GlossaryEntry[] = [
  section('starters', 'Entrées', {
    fr: ['entrees', 'entrées', 'starter', 'starters'],
    en: ['starters', 'appetizers', 'appetisers', 'small plates'],
    es: ['entrantes', 'tapas', 'aperitivos'],
    it: ['antipasti', 'antipasto'],
    de: ['vorspeisen', 'vorspeise'],
    ja: ['前菜'],
    tr: ['başlangıçlar', 'baslangiclar', 'mezeler'],
    ar: ['مقبلات'],
  }),
  section('mains', 'Plats', {
    fr: ['plats', 'plats principaux'],
    en: ['mains', 'main courses', 'plates'],
    es: ['platos', 'platos principales', 'principales'],
    it: ['primi', 'secondi', 'piatti principali'],
    de: ['hauptgerichte', 'hauptspeisen'],
    ja: ['主菜'],
    tr: ['ana yemekler', 'ana yemek'],
    ar: ['أطباق رئيسية'],
  }),
  section('desserts', 'Desserts', {
    fr: ['desserts'],
    en: ['desserts', 'sweets'],
    es: ['postres'],
    it: ['dolci', 'dessert'],
    de: ['desserts', 'nachtisch'],
    ja: ['デザート'],
    tr: ['tatlılar', 'tatlilar'],
    ar: ['حلويات'],
  }),
  section('drinks', 'Boissons', {
    fr: ['boissons'],
    en: ['drinks', 'beverages'],
    es: ['bebidas'],
    it: ['bevande'],
    de: ['getränke', 'getranke'],
    ja: ['飲み物'],
    tr: ['içecekler', 'icecekler'],
    ar: ['مشروبات'],
  }),

  ingredient('pork', 'porc', ['porc'], {
    fr: ['porc', 'jambon', 'bacon', 'lardons', 'pancetta', 'chorizo', 'saucisson'],
    en: ['pork', 'ham', 'bacon', 'pancetta', 'prosciutto', 'pepperoni', 'salami', 'chorizo', 'pork belly'],
    es: ['cerdo', 'jamón', 'jamon', 'tocino', 'panceta', 'chorizo', 'lomo', 'sobrasada'],
    it: ['maiale', 'prosciutto', 'pancetta', 'guanciale', 'speck', 'salame', 'salsiccia', 'mortadella'],
    de: ['schwein', 'schweinefleisch', 'speck', 'schinken', 'salami', 'wurst'],
    ja: ['豚', '豚肉', 'ポーク', 'チャーシュー'],
    tr: ['domuz', 'domuz eti', 'jambon', 'pastırma domuz'],
    ar: ['خنزير', 'لحم خنزير'],
  }, 'Porc ou charcuterie : incompatible avec sans porc/halal/casher.'),
  ingredient('beef', 'bœuf/veau', ['boeuf', 'veau'], {
    fr: ['boeuf', 'bœuf', 'veau', 'steak'],
    en: ['beef', 'veal', 'steak', 'brisket'],
    es: ['ternera', 'res', 'buey', 'vaca', 'filete'],
    it: ['manzo', 'vitello', 'bistecca'],
    de: ['rind', 'rindfleisch', 'kalb', 'steak'],
    ja: ['牛', '牛肉', 'ビーフ'],
    tr: ['dana', 'sığır', 'sigir', 'biftek'],
    ar: ['لحم بقر', 'بقر', 'عجل'],
  }),
  ingredient('chicken', 'poulet/volaille', ['poulet', 'dinde'], {
    fr: ['poulet', 'dinde', 'volaille'],
    en: ['chicken', 'turkey', 'poultry'],
    es: ['pollo', 'pavo', 'ave'],
    it: ['pollo', 'tacchino', 'gallina'],
    de: ['hähnchen', 'haehnchen', 'huhn', 'pute', 'truthahn'],
    ja: ['鶏', '鶏肉', 'チキン'],
    tr: ['tavuk', 'hindi'],
    ar: ['دجاج', 'فراخ', 'ديك رومي'],
  }, 'Viande de volaille : certification halal/casher à confirmer si nécessaire.'),
  ingredient('lamb', 'agneau', ['agneau'], {
    fr: ['agneau'],
    en: ['lamb', 'mutton'],
    es: ['cordero'],
    it: ['agnello'],
    de: ['lamm'],
    ja: ['ラム', '羊肉'],
    tr: ['kuzu'],
    ar: ['لحم غنم', 'غنم', 'خروف'],
  }),
  ingredient('fish', 'poisson', ['poisson_blanc', 'saumon', 'thon'], {
    fr: ['poisson', 'saumon', 'thon', 'cabillaud'],
    en: ['fish', 'salmon', 'tuna', 'cod', 'anchovy', 'anchovies'],
    es: ['pescado', 'salmón', 'salmon', 'atún', 'atun', 'anchoa'],
    it: ['pesce', 'salmone', 'tonno', 'acciughe', 'alici'],
    de: ['fisch', 'lachs', 'thunfisch', 'sardellen'],
    ja: ['魚', '鮭', 'サーモン', 'マグロ', 'ツナ'],
    tr: ['balık', 'balik', 'somon', 'ton balığı', 'ton baligi'],
    ar: ['سمك', 'سلمون', 'تونة'],
  }),
  ingredient('shellfish', 'crustacés/mollusques', ['crevette', 'crabe_homard', 'mollusques'], {
    fr: ['crevette', 'crabe', 'homard', 'moules', 'mollusques'],
    en: ['shrimp', 'prawn', 'crab', 'lobster', 'mussels', 'shellfish', 'clam'],
    es: ['gambas', 'camarones', 'langostinos', 'cangrejo', 'langosta', 'mejillones'],
    it: ['gamberi', 'gambero', 'scampi', 'granchio', 'aragosta', 'cozze', 'vongole'],
    de: ['garnelen', 'krabben', 'hummer', 'muscheln'],
    ja: ['えび', '海老', 'エビ', '蟹', 'カニ', '貝'],
    tr: ['karides', 'yengeç', 'yengec', 'ıstakoz', 'midye'],
    ar: ['روبيان', 'جمبري', 'قريدس', 'سلطعون', 'محار'],
  }, 'Crustacés ou mollusques : allergène majeur et souvent incompatible casher.'),

  ingredient('milk', 'lait', ['lait'], {
    fr: ['lait'],
    en: ['milk'],
    es: ['leche'],
    it: ['latte'],
    de: ['milch'],
    ja: ['牛乳', '乳'],
    tr: ['süt', 'sut'],
    ar: ['حليب', 'لبن'],
  }),
  ingredient('cheese', 'fromage', ['fromage'], {
    fr: ['fromage', 'mozzarella', 'parmesan', 'feta', 'cheddar'],
    en: ['cheese', 'mozzarella', 'parmesan', 'cheddar', 'feta', 'cream cheese'],
    es: ['queso', 'mozzarella', 'parmesano', 'feta'],
    it: ['formaggio', 'mozzarella', 'parmigiano', 'parmesan', 'ricotta', 'burrata', 'pecorino', 'gorgonzola'],
    de: ['käse', 'kaese', 'mozzarella', 'parmesan', 'feta'],
    ja: ['チーズ'],
    tr: ['peynir', 'kaşar', 'kasar'],
    ar: ['جبن', 'جبنة'],
  }, 'Fromage : lait/lactose et présure animale possible.'),
  ingredient('cream', 'crème', ['creme'], {
    fr: ['crème', 'creme'],
    en: ['cream', 'sour cream'],
    es: ['nata', 'crema'],
    it: ['panna', 'crema'],
    de: ['sahne', 'rahm'],
    ja: ['クリーム'],
    tr: ['krema'],
    ar: ['كريمة', 'قشطة'],
  }),
  ingredient('butter', 'beurre', ['beurre'], {
    fr: ['beurre', 'ghee'],
    en: ['butter', 'ghee'],
    es: ['mantequilla', 'ghee'],
    it: ['burro', 'ghee'],
    de: ['butter', 'ghee'],
    ja: ['バター'],
    tr: ['tereyağı', 'tereyagi'],
    ar: ['زبدة', 'سمن'],
  }),
  ingredient('yogurt', 'yaourt', ['yaourt'], {
    fr: ['yaourt', 'yogourt'],
    en: ['yogurt', 'yoghurt'],
    es: ['yogur'],
    it: ['yogurt'],
    de: ['joghurt'],
    ja: ['ヨーグルト'],
    tr: ['yoğurt', 'yogurt'],
    ar: ['زبادي', 'لبن'],
  }),
  ingredient('egg', 'œuf', ['oeuf'], {
    fr: ['oeuf', 'œuf', 'omelette', 'mayonnaise'],
    en: ['egg', 'eggs', 'omelette', 'mayonnaise', 'mayo'],
    es: ['huevo', 'huevos', 'mayonesa', 'tortilla'],
    it: ['uovo', 'uova', 'maionese', 'frittata'],
    de: ['ei', 'eier', 'mayonnaise', 'omelett'],
    ja: ['卵', '玉子', 'マヨネーズ'],
    tr: ['yumurta', 'mayonez'],
    ar: ['بيض', 'مايونيز'],
  }),
  ingredient('gluten', 'blé/gluten/pain/pâtes', ['gluten_ble'], {
    fr: ['blé', 'ble', 'farine', 'pain', 'pâtes', 'pate', 'pizza', 'wrap', 'panure'],
    en: ['wheat', 'flour', 'bread', 'bun', 'pasta', 'pizza', 'wrap', 'breadcrumbs', 'battered'],
    es: ['trigo', 'harina', 'pan', 'pasta', 'pizza', 'rebozado'],
    it: ['grano', 'farina', 'pane', 'pasta', 'pizza', 'focaccia', 'impanato'],
    de: ['weizen', 'mehl', 'brot', 'nudeln', 'pasta', 'pizza', 'paniert'],
    ja: ['小麦', 'パン', 'パスタ', '麺'],
    tr: ['buğday', 'bugday', 'un', 'ekmek', 'makarna', 'pane'],
    ar: ['قمح', 'دقيق', 'خبز', 'معكرونة'],
  }),
  ingredient('soy', 'soja', ['soja'], {
    fr: ['soja', 'tofu'],
    en: ['soy', 'soya', 'tofu', 'miso'],
    es: ['soja', 'tofu'],
    it: ['soia', 'tofu'],
    de: ['soja', 'tofu'],
    ja: ['大豆', '醤油', 'しょうゆ', '豆腐'],
    tr: ['soya', 'tofu'],
    ar: ['صويا', 'توفو'],
  }),
  ingredient('peanut', 'arachide/cacahuète', ['arachide'], {
    fr: ['arachide', 'cacahuète', 'cacahuete'],
    en: ['peanut', 'peanuts', 'satay'],
    es: ['cacahuete', 'cacahuete', 'maní', 'mani'],
    it: ['arachidi', 'noccioline'],
    de: ['erdnuss', 'erdnüsse', 'erdnusse'],
    ja: ['ピーナッツ', '落花生'],
    tr: ['fıstık', 'fistik', 'yer fıstığı'],
    ar: ['فول سوداني', 'فستق'],
  }),
  ingredient('nuts', 'fruits à coque', ['fruits_coque'], {
    fr: ['noix', 'amande', 'noisette', 'pistache'],
    en: ['nuts', 'almond', 'hazelnut', 'walnut', 'cashew', 'pistachio'],
    es: ['frutos secos', 'almendra', 'avellana', 'nuez', 'anacardo'],
    it: ['frutta secca', 'mandorla', 'nocciola', 'noce', 'pistacchio'],
    de: ['nüsse', 'nusse', 'mandel', 'haselnuss', 'walnuss', 'cashew'],
    ja: ['ナッツ', 'アーモンド', 'くるみ'],
    tr: ['kuruyemiş', 'badem', 'fındık', 'findik', 'ceviz'],
    ar: ['مكسرات', 'لوز', 'جوز', 'كاجو'],
  }),
  ingredient('mustard', 'moutarde', ['moutarde'], {
    fr: ['moutarde'],
    en: ['mustard'],
    es: ['mostaza'],
    it: ['senape'],
    de: ['senf'],
    ja: ['からし', 'マスタード'],
    tr: ['hardal'],
    ar: ['خردل'],
  }),
  ingredient('sesame', 'sésame', ['sesame'], {
    fr: ['sésame', 'sesame', 'tahini'],
    en: ['sesame', 'tahini'],
    es: ['sésamo', 'sesamo', 'ajonjolí'],
    it: ['sesamo', 'tahina'],
    de: ['sesam'],
    ja: ['ごま', 'ゴマ'],
    tr: ['susam', 'tahin'],
    ar: ['سمسم', 'طحينة'],
  }),
  ingredient('celery', 'céleri', ['celeri'], {
    fr: ['céleri', 'celeri'],
    en: ['celery'],
    es: ['apio'],
    it: ['sedano'],
    de: ['sellerie'],
    ja: ['セロリ'],
    tr: ['kereviz'],
    ar: ['كرفس'],
  }),
  ingredient('sulphites', 'sulfites', ['sulfites'], {
    fr: ['sulfites'],
    en: ['sulphites', 'sulfites'],
    es: ['sulfitos'],
    it: ['solfiti'],
    de: ['sulfite', 'sulfit'],
    ja: ['亜硫酸塩'],
    tr: ['sülfit', 'sulfit'],
    ar: ['كبريتيت'],
  }),
  ingredient('alcohol-wine', 'vin/alcool', ['vin', 'sulfites'], {
    fr: ['vin', 'alcool'],
    en: ['wine', 'alcohol', 'red wine', 'white wine'],
    es: ['vino', 'alcohol'],
    it: ['vino', 'alcool'],
    de: ['wein', 'alkohol'],
    ja: ['ワイン', '酒', '料理酒'],
    tr: ['şarap', 'sarap', 'alkol'],
    ar: ['نبيذ', 'كحول'],
  }, 'Alcool ou vin : à bloquer pour sans alcool/halal strict.'),
  ingredient('beer', 'bière/orge', ['orge_biere'], {
    fr: ['bière', 'biere'],
    en: ['beer', 'ale', 'lager'],
    es: ['cerveza'],
    it: ['birra'],
    de: ['bier'],
    ja: ['ビール'],
    tr: ['bira'],
    ar: ['بيرة'],
  }),
  ingredient('gelatin', 'gélatine', ['gelatine'], {
    fr: ['gélatine', 'gelatine'],
    en: ['gelatin', 'gelatine'],
    es: ['gelatina'],
    it: ['gelatina'],
    de: ['gelatine'],
    ja: ['ゼラチン'],
    tr: ['jelatin'],
    ar: ['جيلاتين'],
  }),
  ingredient('broth', 'bouillon', ['bouillon'], {
    fr: ['bouillon'],
    en: ['broth', 'stock'],
    es: ['caldo'],
    it: ['brodo'],
    de: ['brühe', 'bruhe'],
    ja: ['出汁', 'だし', 'スープ'],
    tr: ['et suyu', 'tavuk suyu'],
    ar: ['مرق'],
  }, 'Bouillon : source animale possible si non précisée.'),

  dish('carbonara', 'carbonara — pâtes, œuf, fromage, porc possible', ['gluten_ble', 'oeuf', 'fromage', 'porc', 'creme'], {
    fr: ['carbonara'],
    en: ['carbonara'],
    es: ['carbonara'],
    it: ['carbonara'],
    de: ['carbonara'],
  }),
  dish('tonkotsu', 'ramen tonkotsu — porc, bouillon, œuf, gluten possible', ['porc', 'bouillon', 'oeuf', 'gluten_ble', 'soja'], {
    en: ['tonkotsu'],
    ja: ['豚骨', 'とんこつ', 'トンコツ'],
    fr: ['tonkotsu'],
  }),
  dish('caesar', 'salade Caesar — poulet, fromage, œuf, anchois possible', ['poulet', 'fromage', 'oeuf', 'anchois', 'moutarde'], {
    fr: ['caesar', 'césar'],
    en: ['caesar salad'],
    es: ['ensalada cesar'],
    it: ['insalata caesar'],
    de: ['caesar salat'],
  }),

  ingredient('vegetables', 'légumes', ['legumes'], {
    fr: ['légumes', 'legumes', 'salade', 'tomate'],
    en: ['vegetables', 'veggies', 'salad', 'tomato'],
    es: ['verduras', 'vegetales', 'ensalada', 'tomate'],
    it: ['verdure', 'insalata', 'pomodoro'],
    de: ['gemüse', 'gemuse', 'salat', 'tomate'],
    ja: ['野菜', 'サラダ', 'トマト'],
    tr: ['sebze', 'salata', 'domates'],
    ar: ['خضار', 'سلطة', 'طماطم'],
  }),
  ingredient('rice', 'riz', ['riz'], {
    fr: ['riz'],
    en: ['rice'],
    es: ['arroz'],
    it: ['riso'],
    de: ['reis'],
    ja: ['米', 'ご飯', 'ライス'],
    tr: ['pirinç', 'pirinc', 'pilav'],
    ar: ['أرز'],
  }),
  ingredient('chickpea', 'pois chiche', ['pois_chiche'], {
    fr: ['pois chiche', 'falafel', 'houmous'],
    en: ['chickpea', 'falafel', 'hummus'],
    es: ['garbanzo', 'falafel', 'hummus'],
    it: ['ceci', 'falafel', 'hummus'],
    de: ['kichererbse', 'falafel', 'hummus'],
    ja: ['ひよこ豆', 'ファラフェル', 'フムス'],
    tr: ['nohut', 'falafel', 'humus'],
    ar: ['حمص', 'فلافل'],
  }),
  diet('vegan-label', 'label vegan', ['label_vegan'], {
    fr: ['vegan', 'végan', 'végane'],
    en: ['vegan', 'plant based'],
    es: ['vegano', 'vegana'],
    it: ['vegano', 'vegana'],
    de: ['vegan'],
    ja: ['ビーガン', 'ヴィーガン'],
    tr: ['vegan'],
    ar: ['نباتي صرف'],
  }),
  diet('vegetarian-label', 'label végétarien', ['label_vegetarien'], {
    fr: ['végétarien', 'vegetarien', 'veggie'],
    en: ['vegetarian', 'veggie'],
    es: ['vegetariano', 'vegetariana'],
    it: ['vegetariano', 'vegetariana'],
    de: ['vegetarisch'],
    ja: ['ベジタリアン'],
    tr: ['vejetaryen'],
    ar: ['نباتي'],
  }),
  diet('halal-label', 'mention halal', ['certification_halal'], {
    fr: ['halal'],
    en: ['halal'],
    es: ['halal'],
    it: ['halal'],
    de: ['halal'],
    ja: ['ハラール'],
    tr: ['helal'],
    ar: ['حلال'],
  }, 'Mention halal détectée : vérifier la certification en profil strict.'),
  diet('kosher-label', 'mention casher/kosher', ['certification_kosher'], {
    fr: ['casher', 'kosher'],
    en: ['kosher'],
    es: ['kosher', 'casher'],
    it: ['kosher', 'casher'],
    de: ['koscher', 'kosher'],
    ja: ['コーシャ'],
    tr: ['koşer', 'kosher'],
    ar: ['كوشر'],
  }),
];

export function buildMenuTranslationReport(text: string, sourceLanguage: MenuTranslationLanguage = 'auto'): MenuTranslationReport {
  const lines = text.replace(/\r/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const detected = sourceLanguage === 'auto' ? detectMenuLanguage(text) : { language: sourceLanguage, confidence: 95 };
  const lineTranslations = lines.map((line, index) => translateLine(line, index + 1, sourceLanguage, detected.language));
  const glossaryHits = dedupeHits(lineTranslations.flatMap((line) => line.hits));
  const dangerousIngredientIds = unique(glossaryHits.filter((hit) => hit.riskLevel === 'danger').flatMap((hit) => hit.ingredientIds));
  const cautionIngredientIds = unique(glossaryHits.filter((hit) => hit.riskLevel === 'caution').flatMap((hit) => hit.ingredientIds));
  const unknownLines = lineTranslations.filter((line) => line.hits.length === 0 && looksLikeFoodLine(line.original)).map((line) => line.original).slice(0, 12);
  const warnings = buildReportWarnings(lineTranslations, dangerousIngredientIds, cautionIngredientIds, unknownLines);
  const translatedText = lineTranslations.map((line) => line.translated).join('\n');
  const analysisText = lineTranslations.map((line) => line.analysisLine).join('\n');

  return {
    generatedAt: new Date().toISOString(),
    requestedSourceLanguage: sourceLanguage,
    detectedLanguage: detected.language,
    detectedLanguageLabel: menuTranslationLanguageLabel(detected.language),
    detectionConfidence: detected.confidence,
    translatedText,
    analysisText,
    lineTranslations,
    glossaryHits,
    dangerousIngredientIds,
    cautionIngredientIds,
    unknownLines,
    warnings,
    summary: summarizeMenuTranslation({ detectedLanguage: detected.language, detectedConfidence: detected.confidence, lineTranslations, dangerousIngredientIds, cautionIngredientIds, unknownLines }),
  };
}

export function applyMenuTranslationToText(report: MenuTranslationReport): string {
  return report.analysisText;
}

export function summarizeMenuTranslation(input: Pick<MenuTranslationReport, 'detectedLanguage' | 'lineTranslations' | 'dangerousIngredientIds' | 'cautionIngredientIds' | 'unknownLines'> & { detectedConfidence?: number }): string {
  const linesWithHits = input.lineTranslations.filter((line) => line.hits.length > 0).length;
  const hitCount = input.lineTranslations.reduce((sum, line) => sum + line.hits.length, 0);
  const confidence = typeof input.detectedConfidence === 'number' ? ` · confiance langue ${input.detectedConfidence}%` : '';
  return `${menuTranslationLanguageLabel(input.detectedLanguage)} détecté${confidence} · ${linesWithHits} ligne(s) enrichie(s) · ${hitCount} terme(s) reconnus · ${input.dangerousIngredientIds.length} danger(s) · ${input.cautionIngredientIds.length} prudence(s) · ${input.unknownLines.length} ligne(s) inconnue(s)`;
}

export function menuTranslationLanguageLabel(language: MenuTranslationLanguage): string {
  const labels: Record<MenuTranslationLanguage, string> = {
    auto: 'Auto',
    fr: 'Français',
    en: 'Anglais',
    es: 'Espagnol',
    it: 'Italien',
    de: 'Allemand',
    ja: 'Japonais',
    tr: 'Turc',
    ar: 'Arabe',
  };
  return labels[language];
}

export function supportedMenuTranslationLanguages(): Array<{ value: MenuTranslationLanguage; label: string }> {
  return (['auto', ...SUPPORTED_LANGUAGES] as MenuTranslationLanguage[]).map((value) => ({ value, label: menuTranslationLanguageLabel(value) }));
}

function translateLine(line: string, lineNumber: number, requestedLanguage: MenuTranslationLanguage, detectedLanguage: DetectedMenuLanguage): MenuLineTranslation {
  const languagesToSearch = requestedLanguage === 'auto' ? SUPPORTED_LANGUAGES : [requestedLanguage];
  const hits = dedupeHits(findHits(line, languagesToSearch as DetectedMenuLanguage[]));
  const ingredientHits = hits.filter((hit) => hit.category !== 'section');
  const sectionHit = hits.find((hit) => hit.category === 'section' && looksLikeSectionOnly(line, hit));
  const warnings = buildLineWarnings(hits);

  if (sectionHit && ingredientHits.length === 0) {
    return {
      lineNumber,
      original: line,
      translated: sectionHit.translation,
      analysisLine: sectionHit.translation,
      confidence: computeLineConfidence(hits, requestedLanguage, detectedLanguage),
      hits,
      warnings,
    };
  }

  const translatedTerms = unique(ingredientHits.map((hit) => hit.translation));
  const translated = translatedTerms.length > 0 ? `${line} — ${translatedTerms.join(', ')}` : line;
  const riskNotes = buildAnalysisRiskNotes(ingredientHits);
  const analysisLine = translatedTerms.length > 0 ? `${line} — ${translatedTerms.concat(riskNotes).join(', ')}` : line;

  return {
    lineNumber,
    original: line,
    translated,
    analysisLine,
    confidence: computeLineConfidence(hits, requestedLanguage, detectedLanguage),
    hits,
    warnings,
  };
}

function findHits(line: string, languages: DetectedMenuLanguage[]): MenuTranslationGlossaryHit[] {
  const hits: MenuTranslationGlossaryHit[] = [];
  for (const entry of GLOSSARY) {
    for (const language of languages) {
      const terms = entry.terms[language] ?? [];
      for (const term of terms) {
        if (term && hasTerm(line, term)) {
          hits.push(makeHit(entry, term, language));
        }
      }
    }
  }
  return hits;
}

function makeHit(entry: GlossaryEntry, term: string, language: DetectedMenuLanguage): MenuTranslationGlossaryHit {
  const ingredients = (entry.ingredientIds ?? []).map((id) => INGREDIENT_BY_ID.get(id)).filter(Boolean);
  const tags = unique(ingredients.flatMap((ingredient) => ingredient?.tags ?? []));
  const allergens = tags.filter((tag): tag is AllergenId => ALLERGEN_TAGS.has(tag as AllergenId));
  return {
    term,
    language,
    translation: entry.translation,
    category: entry.category,
    ingredientIds: entry.ingredientIds ?? [],
    tags,
    allergens,
    riskLevel: computeRiskLevel(tags),
    note: entry.note,
  };
}

function detectMenuLanguage(text: string): { language: DetectedMenuLanguage; confidence: number } {
  const scores = new Map<DetectedMenuLanguage, number>(SUPPORTED_LANGUAGES.map((language) => [language, 0]));
  if (/[ぁ-んァ-ン一-龯]/.test(text)) scores.set('ja', (scores.get('ja') ?? 0) + 8);
  if (/[\u0600-\u06FF]/.test(text)) scores.set('ar', (scores.get('ar') ?? 0) + 8);

  for (const entry of GLOSSARY) {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const term of entry.terms[language] ?? []) {
        if (hasTerm(text, term)) scores.set(language, (scores.get(language) ?? 0) + (entry.category === 'section' ? 1 : 2));
      }
    }
  }

  const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]);
  const [bestLanguage, bestScore] = sorted[0] ?? ['fr', 0];
  if (!bestScore) return { language: 'fr', confidence: 35 };
  const secondScore = sorted[1]?.[1] ?? 0;
  const confidence = Math.max(45, Math.min(98, 48 + bestScore * 8 + Math.max(0, bestScore - secondScore) * 4));
  return { language: bestLanguage, confidence: Math.round(confidence) };
}

function buildLineWarnings(hits: MenuTranslationGlossaryHit[]): string[] {
  const warnings: string[] = [];
  const danger = unique(hits.filter((hit) => hit.riskLevel === 'danger').map((hit) => hit.translation));
  const caution = unique(hits.filter((hit) => hit.riskLevel === 'caution').map((hit) => hit.translation));
  if (danger.length) warnings.push(`Danger profil possible : ${danger.join(', ')}.`);
  if (caution.length) warnings.push(`À vérifier : ${caution.join(', ')}.`);
  const notes = unique(hits.map((hit) => hit.note).filter(Boolean) as string[]);
  warnings.push(...notes.slice(0, 2));
  return warnings;
}

function buildAnalysisRiskNotes(hits: MenuTranslationGlossaryHit[]): string[] {
  const notes: string[] = [];
  if (hits.some((hit) => hit.tags.includes('pork'))) notes.push('porc');
  if (hits.some((hit) => hit.tags.includes('alcohol'))) notes.push('alcool');
  if (hits.some((hit) => hit.tags.includes('halal_risk'))) notes.push('certification halal à vérifier');
  if (hits.some((hit) => hit.tags.includes('kosher_risk'))) notes.push('certification casher à vérifier');
  if (hits.some((hit) => hit.tags.includes('dairy') || hit.tags.includes('lactose'))) notes.push('lait lactose');
  if (hits.some((hit) => hit.tags.includes('eggs'))) notes.push('œuf');
  if (hits.some((hit) => hit.tags.includes('gluten'))) notes.push('gluten blé');
  if (hits.some((hit) => hit.tags.includes('crustaceans') || hit.tags.includes('molluscs') || hit.tags.includes('shellfish'))) notes.push('crustacés mollusques');
  return unique(notes);
}

function buildReportWarnings(
  lines: MenuLineTranslation[],
  dangerousIngredientIds: string[],
  cautionIngredientIds: string[],
  unknownLines: string[],
): string[] {
  const warnings: string[] = [];
  if (dangerousIngredientIds.length) warnings.push('Des ingrédients probablement bloquants ont été reconnus avant analyse profil.');
  if (cautionIngredientIds.length) warnings.push('Certains ingrédients demandent une confirmation serveur ou source officielle.');
  if (unknownLines.length) warnings.push('Certaines lignes n’ont pas été traduites : garde le statut “à vérifier” si le plat reste inconnu.');
  if (lines.length && lines.every((line) => line.hits.length === 0)) warnings.push('Aucun terme culinaire étranger reconnu : vérifie la langue ou corrige l’OCR.');
  return warnings;
}

function computeLineConfidence(hits: MenuTranslationGlossaryHit[], requestedLanguage: MenuTranslationLanguage, detectedLanguage: DetectedMenuLanguage): number {
  if (!hits.length) return 25;
  const languageMatchBonus = requestedLanguage === 'auto' || requestedLanguage === detectedLanguage ? 12 : 0;
  const ingredientBonus = hits.filter((hit) => hit.category !== 'section').length * 12;
  return Math.max(40, Math.min(96, 45 + languageMatchBonus + ingredientBonus));
}

function computeRiskLevel(tags: IngredientTag[]): MenuTranslationGlossaryHit['riskLevel'] {
  if (tags.some((tag) => ['pork', 'alcohol', 'crustaceans', 'molluscs', 'peanuts', 'nuts'].includes(tag))) return 'danger';
  if (tags.some((tag) => ['halal_risk', 'kosher_risk', 'dairy', 'lactose', 'milk', 'eggs', 'gluten', 'soy', 'mustard', 'sesame', 'celery', 'sulphites', 'gelatin', 'broth_meat_risk'].includes(tag))) return 'caution';
  if (tags.some((tag) => ['vegan_ok', 'vegetarian_ok', 'halal_confirmed', 'kosher_confirmed'].includes(tag))) return 'safe';
  return 'info';
}

function dedupeHits(hits: MenuTranslationGlossaryHit[]): MenuTranslationGlossaryHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const key = `${hit.language}:${normalizeLoose(hit.term)}:${hit.translation}:${hit.ingredientIds.join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel) || b.term.length - a.term.length);
}

function riskRank(level: MenuTranslationGlossaryHit['riskLevel']): number {
  return level === 'danger' ? 4 : level === 'caution' ? 3 : level === 'safe' ? 2 : 1;
}

function hasTerm(text: string, term: string): boolean {
  const rawText = text.toLowerCase();
  const rawTerm = term.toLowerCase();
  if (containsNonLatin(rawTerm)) return rawText.includes(rawTerm);
  const normalizedText = ` ${normalizeLoose(text)} `;
  const normalizedTerm = normalizeLoose(term);
  if (!normalizedTerm) return false;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalizedTerm)}([^a-z0-9]|$)`, 'i');
  return pattern.test(normalizedText);
}

function normalizeLoose(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^\p{L}\p{N}€.,:;\-\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsNonLatin(value: string): boolean {
  return /[^\u0000-\u024F]/.test(value);
}

function looksLikeSectionOnly(line: string, hit: MenuTranslationGlossaryHit): boolean {
  const normalizedLine = normalizeText(line);
  const normalizedTerm = normalizeText(hit.term);
  return hit.category === 'section' && (normalizedLine === normalizedTerm || normalizedLine.length <= normalizedTerm.length + 10);
}

function looksLikeFoodLine(line: string): boolean {
  const normalized = normalizeLoose(line);
  if (normalized.length < 4) return false;
  if (/^(menu|carte|prix|service|tax|allergen|allergenes?)$/.test(normalized)) return false;
  return /\d/.test(normalized) || normalized.split(' ').length >= 2;
}

function section(id: string, translation: string, terms: GlossaryEntry['terms']): GlossaryEntry {
  return { id, category: 'section', translation: titleCase(translation), terms };
}

function ingredient(id: string, translation: string, ingredientIds: string[], terms: GlossaryEntry['terms'], note?: string): GlossaryEntry {
  return { id, category: 'ingredient', translation, ingredientIds, terms, note };
}

function dish(id: string, translation: string, ingredientIds: string[], terms: GlossaryEntry['terms'], note?: string): GlossaryEntry {
  return { id, category: 'dish', translation, ingredientIds, terms, note };
}

function diet(id: string, translation: string, ingredientIds: string[], terms: GlossaryEntry['terms'], note?: string): GlossaryEntry {
  return { id, category: 'diet-label', translation, ingredientIds, terms, note };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
