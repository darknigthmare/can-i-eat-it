import { DISHES } from '../data/dishes';
import { INGREDIENTS } from '../data/ingredients';
import type {
  AllergenId,
  AnalysisResult,
  Confidence,
  DecisionReason,
  DecisionStatus,
  GroupAnalysisRow,
  Ingredient,
  IngredientTag,
  MatchedDish,
  MenuItem,
  RuleId,
  UserProfile,
} from '../types';
import { findLearnedDishForText, ingredientsFromLearnedDish } from './learning';
import { includesAny, normalizeText, unique } from './text';

const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]));

const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  confirmed: 4,
  probable: 3,
  estimated: 2,
  unknown: 1,
};

const STATUS_WEIGHT: Record<DecisionStatus, number> = {
  safe: 1,
  caution: 2,
  unknown: 3,
  blocked: 4,
};

const RISK_SCORE: Record<DecisionStatus, number> = {
  safe: 96,
  caution: 58,
  unknown: 35,
  blocked: 8,
};

const ALLERGEN_LABELS: Record<AllergenId, string> = {
  gluten: 'gluten',
  crustaceans: 'crustacés',
  eggs: 'œufs',
  fish: 'poisson',
  peanuts: 'arachides',
  soy: 'soja',
  milk: 'lait/lactose',
  nuts: 'fruits à coque',
  celery: 'céleri',
  mustard: 'moutarde',
  sesame: 'sésame',
  sulphites: 'sulfites',
  lupin: 'lupin',
  molluscs: 'mollusques',
};

export function analyzeMenuItems(items: MenuItem[], profile: UserProfile): AnalysisResult[] {
  return items.map((item) => analyzeMenuItem(item, profile));
}

export function analyzeMenuForGroup(items: MenuItem[], profiles: UserProfile[]): GroupAnalysisRow[] {
  const enabledProfiles = profiles.filter((profile) => profile.enabled !== false);
  return items.map((item) => {
    const results = enabledProfiles.map((profile) => analyzeMenuItem(item, profile));
    const stats = buildStatusStats(results);
    return {
      menuItem: item,
      results,
      aggregateStatus: computeAggregateStatus(results),
      safeCount: stats.safe,
      cautionCount: stats.caution,
      blockedCount: stats.blocked,
      unknownCount: stats.unknown,
      bestProfiles: results.filter((result) => result.status === 'safe').map((result) => result.safeFor[0]).filter(Boolean),
    };
  });
}

export function analyzeMenuItem(menuItem: MenuItem, profile: UserProfile): AnalysisResult {
  const matchedDish = matchDish(menuItem);
  const reasons: DecisionReason[] = [];
  const ingredientIds = matchedDish.ingredients.map((ingredient) => ingredient.id);
  const tags = new Set<IngredientTag>(matchedDish.ingredients.flatMap((ingredient) => ingredient.tags));

  const textForCustomRules = normalizeText([
    menuItem.rawName,
    menuItem.description,
    matchedDish.ingredients.flatMap((ingredient) => ingredient.names).join(' '),
  ].filter(Boolean).join(' '));

  addAllergenReasons(profile, matchedDish.ingredients, reasons);
  addDietaryReasons(profile, tags, ingredientIds, reasons);
  addCustomReasons(profile, textForCustomRules, reasons);
  addSourceAndUnknownReasons(matchedDish, profile, reasons);

  const status = computeStatus(reasons, matchedDish, profile);
  const confidence = computeConfidence(matchedDish, reasons);
  const score = computeScore(status, confidence, reasons);

  return {
    menuItem,
    status,
    confidence,
    matchedDish,
    reasons: reasons.length > 0 ? reasons : [{ severity: 'info', message: 'Aucun conflit détecté avec le profil actuel.' }],
    safeFor: buildSafeForList(status, profile),
    askServerQuestions: buildServerQuestions(matchedDish, profile, status),
    score,
  };
}

export function matchDish(menuItem: MenuItem): MatchedDish {
  const searchable = normalizeText(`${menuItem.rawName} ${menuItem.description ?? ''}`);
  const learnedDish = findLearnedDishForText(searchable);
  if (learnedDish) {
    const ingredients = ingredientsFromLearnedDish(learnedDish);
    return {
      learnedDish,
      matchedBy: 'learned-db',
      confidence: learnedDish.confidence,
      ingredients,
      missingTerms: getMissingTerms(searchable, ingredients),
      sourceNotes: [
        `Correction utilisateur apprise le ${new Date(learnedDish.updatedAt).toLocaleDateString('fr-FR')}.`,
        learnedDish.notes,
      ].filter(Boolean) as string[],
    };
  }

  const exactDish = DISHES.find((dish) => dish.names.some((name) => searchable === normalizeText(name)));
  const includedDish = exactDish ?? DISHES.find((dish) => dish.names.some((name) => {
    const normalizedName = normalizeText(name);
    return searchable.includes(normalizedName) || (searchable.length > 4 && normalizedName.includes(searchable));
  }));

  const keywordIngredients = INGREDIENTS.filter((ingredient) =>
    ingredient.names.some((name) => {
      const normalizedName = normalizeText(name);
      return normalizedName.length > 2 && hasTerm(searchable, normalizedName);
    })
  );

  if (includedDish) {
    const seededIngredients = includedDish.ingredients
      .map((id) => INGREDIENT_BY_ID.get(id))
      .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));

    const allIngredients = uniqueById([...seededIngredients, ...keywordIngredients]);
    return {
      dish: includedDish,
      matchedBy: 'dish-db',
      confidence: includedDish.confidence,
      ingredients: allIngredients,
      missingTerms: getMissingTerms(searchable, allIngredients),
      sourceNotes: includedDish.notes ? [includedDish.notes] : [],
    };
  }

  if (keywordIngredients.length > 0) {
    return {
      matchedBy: 'ingredient-keywords',
      confidence: 'estimated',
      ingredients: uniqueById(keywordIngredients),
      missingTerms: getMissingTerms(searchable, keywordIngredients),
      sourceNotes: ['Analyse construite depuis les mots-clés du menu, pas depuis une recette confirmée.'],
    };
  }

  return {
    matchedBy: 'none',
    confidence: 'unknown',
    ingredients: [],
    missingTerms: searchable.split(' ').filter((token) => token.length > 3).slice(0, 8),
    sourceNotes: ['Aucun plat ou ingrédient reconnu dans la base locale.'],
  };
}

function addAllergenReasons(profile: UserProfile, ingredients: Ingredient[], reasons: DecisionReason[]) {
  for (const allergen of profile.allergens) {
    const hits = ingredients.filter((ingredient) => ingredient.tags.includes(allergen));
    if (hits.length > 0) {
      reasons.push({
        severity: 'danger',
        rule: allergen,
        ingredientIds: hits.map((hit) => hit.id),
        message: `Allergie déclarée : présence ou forte probabilité de ${ALLERGEN_LABELS[allergen]}.`,
      });
    }
  }

  for (const intolerance of profile.intolerances) {
    const hits = ingredients.filter((ingredient) => ingredient.tags.includes(intolerance));
    if (hits.length > 0) {
      reasons.push({
        severity: profile.strictness === 'strict' ? 'danger' : 'caution',
        rule: intolerance,
        ingredientIds: hits.map((hit) => hit.id),
        message: `Intolérance déclarée : ${ALLERGEN_LABELS[intolerance]} détecté/probable.`,
      });
    }
  }
}

function addDietaryReasons(profile: UserProfile, tags: Set<IngredientTag>, ingredientIds: string[], reasons: DecisionReason[]) {
  const has = (tag: IngredientTag) => tags.has(tag);
  const hasAny = (values: IngredientTag[]) => values.some((value) => tags.has(value));
  const hasHalalConfirmation = has('halal_confirmed');
  const hasKosherConfirmation = has('kosher_confirmed');
  const add = (severity: DecisionReason['severity'], rule: RuleId, message: string, ids = ingredientIds) => {
    reasons.push({ severity, rule, message, ingredientIds: ids });
  };

  if (profile.rules.includes('vegetarian')) {
    if (hasAny(['meat', 'seafood', 'fish', 'crustaceans', 'molluscs'])) {
      add('danger', 'vegetarian', 'Profil végétarien : viande, poisson ou fruits de mer détectés/probables.');
    }
    if (hasAny(['broth_meat_risk', 'gelatin', 'animal_fat'])) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'vegetarian', 'Profil végétarien : bouillon, gélatine ou graisse animale possible.');
    }
    if (has('rennet_risk') && profile.strictness === 'strict') {
      add('caution', 'vegetarian', 'Fromage détecté : présure animale possible, à vérifier en végétarien strict.');
    }
  }

  if (profile.rules.includes('vegan')) {
    if (has('animal_product') || hasAny(['meat', 'seafood', 'dairy', 'eggs', 'gelatin'])) {
      add('danger', 'vegan', 'Profil vegan : produit animal détecté/probable.');
    }
    if (hasAny(['cross_contamination_risk', 'hidden_sauce_risk'])) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'vegan', 'Vegan strict : sauce ou contamination croisée possible.');
    }
  }

  if (profile.rules.includes('pescetarian')) {
    if (hasAny(['meat', 'pork', 'beef', 'poultry', 'lamb']) && !onlySeafood(tags)) {
      add('danger', 'pescetarian', 'Profil pescétarien : viande terrestre détectée/probable.');
    }
  }

  if (profile.rules.includes('no_pork') && has('pork')) {
    add('danger', 'no_pork', 'Règle sans porc : porc ou dérivé probable.');
  }

  if (profile.rules.includes('no_beef') && has('beef')) {
    add('danger', 'no_beef', 'Règle sans bœuf : bœuf/veau détecté ou probable.');
  }

  if (profile.rules.includes('no_alcohol')) {
    if (has('alcohol')) {
      add('danger', 'no_alcohol', 'Règle sans alcool : alcool explicite ou recette au vin/bière/spiritueux.');
    } else if (has('may_contain_alcohol')) {
      add('caution', 'no_alcohol', 'Règle sans alcool : présence possible d’alcool résiduel ou ingrédient à vérifier.');
    }
  }

  if (profile.rules.includes('halal')) {
    if (has('pork')) add('danger', 'halal', 'Halal : porc ou dérivé du porc détecté/probable.');
    if (has('alcohol')) add('danger', 'halal', 'Halal : alcool explicite ou recette à base d’alcool.');
    if (hasAny(['gelatin', 'broth_meat_risk', 'animal_fat'])) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'halal', 'Halal : gélatine, bouillon ou graisse animale non certifiés à vérifier.');
    }
    if (has('halal_risk') && !hasHalalConfirmation) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'halal', 'Halal : viande non certifiée automatiquement, certification à vérifier.');
    }
    if (has('halal_risk') && hasHalalConfirmation && profile.strictness === 'strict') {
      add('caution', 'halal', 'Mention halal détectée : vérifier la certification si ton profil est strict.');
    }
    if (profile.strictness !== 'relaxed' && hasAny(['cross_contamination_risk', 'fried_shared_oil_risk'])) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'halal', 'Halal : cuisson ou huile partagée possible, à vérifier.');
    }
  }

  if (profile.rules.includes('kosher')) {
    if (has('pork')) add('danger', 'kosher', 'Casher : porc détecté/probable.');
    if (hasAny(['crustaceans', 'molluscs', 'shellfish'])) add('danger', 'kosher', 'Casher : crustacés ou mollusques détectés/probables.');
    if (hasAny(['gelatin', 'broth_meat_risk', 'animal_fat'])) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'kosher', 'Casher : source animale ou gélatine à vérifier.');
    }
    if (has('kosher_risk') && !hasKosherConfirmation) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'kosher', 'Casher : certification non confirmée.');
    }
    if (hasAny(['meat', 'poultry', 'beef', 'lamb']) && hasAny(['dairy', 'milk', 'cheese'])) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'kosher', 'Casher : mélange viande/lait possible.');
    }
  }

  if (profile.rules.includes('christian_lent')) {
    if (hasAny(['meat', 'pork', 'beef', 'poultry', 'lamb'])) {
      add('caution', 'christian_lent', 'Carême/vendredi sans viande : viande terrestre détectée/probable.');
    }
  }

  if (profile.rules.includes('hindu_no_beef') && has('beef')) {
    add('danger', 'hindu_no_beef', 'Règle hindoue personnalisée : bœuf/veau détecté ou probable.');
  }

  if (profile.rules.includes('low_lactose') && hasAny(['milk', 'dairy', 'lactose', 'cheese'])) {
    add(profile.strictness === 'strict' ? 'danger' : 'caution', 'low_lactose', 'Faible lactose : lait, crème, fromage ou sauce lactée probable.');
  }

  if (profile.rules.includes('gluten_free')) {
    if (has('gluten')) {
      add(profile.strictness === 'strict' ? 'danger' : 'caution', 'gluten_free', 'Sans gluten : blé/farine/pain/pâte/panure détecté ou probable.');
    }
    if (profile.strictness === 'strict' && has('fried_shared_oil_risk')) {
      add('caution', 'gluten_free', 'Sans gluten strict : friture partagée possible.');
    }
  }

  if (profile.strictness === 'strict' && has('hidden_sauce_risk')) {
    reasons.push({ severity: 'caution', rule: 'source', message: 'Sauce ou préparation maison : composition non transparente, demander le détail.' });
  }
}

function addCustomReasons(profile: UserProfile, normalizedText: string, reasons: DecisionReason[]) {
  if (!profile.rules.includes('custom_strict')) return;

  const forbiddenHits = includesAny(normalizedText, profile.customForbiddenTerms);
  for (const hit of forbiddenHits) {
    reasons.push({
      severity: 'danger',
      rule: 'custom',
      message: `Règle personnelle : “${hit}” est interdit dans ton profil.`,
    });
  }

  const cautionHits = includesAny(normalizedText, profile.customCautionTerms);
  for (const hit of cautionHits) {
    reasons.push({
      severity: 'caution',
      rule: 'custom',
      message: `Règle personnelle : “${hit}” doit être vérifié.`,
    });
  }
}

function addSourceAndUnknownReasons(matchedDish: MatchedDish, profile: UserProfile, reasons: DecisionReason[]) {
  if (matchedDish.matchedBy === 'none') {
    reasons.push({
      severity: 'caution',
      rule: 'unknown',
      message: 'Plat inconnu : composition insuffisante pour conclure. À vérifier avec le restaurant.',
    });
    return;
  }

  if (matchedDish.confidence === 'estimated') {
    reasons.push({
      severity: 'caution',
      rule: 'source',
      message: 'Composition estimée depuis la base locale : demander confirmation si le risque est important.',
    });
  }

  if ((profile.allergens.length > 0 || profile.strictness === 'strict') && matchedDish.missingTerms.length > 0) {
    reasons.push({
      severity: 'caution',
      rule: 'unknown',
      message: `Termes non interprétés automatiquement : ${matchedDish.missingTerms.slice(0, 5).join(', ')}.`,
    });
  }
}

function computeStatus(reasons: DecisionReason[], matchedDish: MatchedDish, profile: UserProfile): DecisionStatus {
  if (matchedDish.matchedBy === 'none') return 'unknown';
  if (reasons.some((reason) => reason.severity === 'danger')) return 'blocked';
  if (reasons.some((reason) => reason.severity === 'caution')) return 'caution';
  if (profile.strictness === 'strict' && matchedDish.confidence !== 'confirmed') return 'caution';
  return 'safe';
}

function computeConfidence(matchedDish: MatchedDish, reasons: DecisionReason[]): Confidence {
  if (matchedDish.matchedBy === 'none') return 'unknown';
  if (matchedDish.confidence === 'confirmed') return 'confirmed';
  if (reasons.some((reason) => reason.rule === 'unknown')) return 'estimated';
  return matchedDish.confidence;
}

function computeScore(status: DecisionStatus, confidence: Confidence, reasons: DecisionReason[]): number {
  const base = RISK_SCORE[status];
  const confidencePenalty = { confirmed: 0, probable: 5, estimated: 12, unknown: 25 }[confidence];
  const cautionPenalty = Math.min(18, reasons.filter((reason) => reason.severity === 'caution').length * 3);
  return Math.max(0, Math.min(100, base - confidencePenalty - cautionPenalty));
}

function buildSafeForList(status: DecisionStatus, profile: UserProfile): string[] {
  if (status === 'safe') return [profile.name, 'Compatible avec le profil actuel'];
  if (status === 'caution') return ['Possible seulement après vérification'];
  if (status === 'blocked') return [];
  return ['Information insuffisante'];
}

function buildServerQuestions(matchedDish: MatchedDish, profile: UserProfile, status: DecisionStatus): string[] {
  const tags = new Set<IngredientTag>(matchedDish.ingredients.flatMap((ingredient) => ingredient.tags));
  const questions: string[] = [];

  if (status === 'unknown') {
    questions.push('Quels sont les ingrédients exacts de ce plat ?');
  }
  if (matchedDish.confidence === 'estimated' || tags.has('hidden_sauce_risk')) {
    questions.push('La sauce ou préparation maison contient-elle lait, œuf, moutarde, gluten, poisson, alcool ou bouillon animal ?');
  }
  if (profile.rules.includes('halal') && (tags.has('halal_risk') || tags.has('meat') || tags.has('gelatin') || tags.has('broth_meat_risk'))) {
    questions.push('La viande, le bouillon et/ou la gélatine sont-ils certifiés halal ?');
  }
  if (profile.rules.includes('kosher') && (tags.has('kosher_risk') || tags.has('meat') || tags.has('gelatin') || tags.has('broth_meat_risk'))) {
    questions.push('La viande, le bouillon et/ou la gélatine sont-ils certifiés casher ?');
  }
  if (profile.rules.includes('no_alcohol') || profile.rules.includes('halal')) {
    if (tags.has('alcohol') || tags.has('may_contain_alcohol')) {
      questions.push('La recette contient-elle du vin, de la bière, un alcool flambé, du mirin ou une sauce alcoolisée ?');
    }
  }
  if (profile.rules.includes('low_lactose') || profile.intolerances.includes('milk') || profile.allergens.includes('milk')) {
    if (tags.has('milk') || tags.has('dairy') || tags.has('cheese')) {
      questions.push('Peut-on retirer le fromage, la crème, le beurre ou la sauce lactée ?');
    }
  }
  if (profile.rules.includes('gluten_free') || profile.allergens.includes('gluten')) {
    if (tags.has('gluten') || tags.has('fried_shared_oil_risk')) {
      questions.push('Y a-t-il du blé/farine/panure ou une friture partagée avec produits panés ?');
    }
  }
  if (profile.rules.includes('vegetarian') || profile.rules.includes('vegan')) {
    if (tags.has('rennet_risk')) questions.push('Le fromage utilise-t-il de la présure animale ?');
    if (tags.has('broth_meat_risk')) questions.push('La sauce ou le bouillon est-il végétal ou à base de viande ?');
  }

  for (const allergen of profile.allergens) {
    if (tags.has(allergen)) {
      questions.push(`Pouvez-vous confirmer l’absence de ${ALLERGEN_LABELS[allergen]} et de contamination croisée ?`);
    }
  }

  return unique(questions).slice(0, 8);
}

function getMissingTerms(searchable: string, ingredients: Ingredient[]): string[] {
  const knownNames = ingredients.flatMap((ingredient) => ingredient.names.map(normalizeText));
  const noise = new Set(['avec', 'sans', 'menu', 'plat', 'prix', 'maison', 'sauce', 'supplement', 'fromage']);
  const tokens = searchable
    .split(' ')
    .filter((token) => token.length > 4)
    .filter((token) => !noise.has(token))
    .filter((token) => !knownNames.some((known) => known.includes(token) || token.includes(known)))
    .filter((token) => !/\d|euro|euros/.test(token));

  return unique(tokens).slice(0, 8);
}

function uniqueById(ingredients: Ingredient[]): Ingredient[] {
  const map = new Map<string, Ingredient>();
  for (const ingredient of ingredients) map.set(ingredient.id, ingredient);
  return Array.from(map.values());
}

function onlySeafood(tags: Set<IngredientTag>): boolean {
  const terrestrialTags = ['pork', 'beef', 'poultry', 'lamb'] as IngredientTag[];
  return !terrestrialTags.some((tag) => tags.has(tag));
}

function hasTerm(text: string, term: string): boolean {
  if (term.includes(' ')) return text.includes(term);
  return new RegExp(`(^|\\s|-)${escapeRegex(term)}($|\\s|-)`).test(text);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeAggregateStatus(results: AnalysisResult[]): DecisionStatus {
  if (results.length === 0) return 'unknown';
  if (results.every((result) => result.status === 'blocked')) return 'blocked';
  if (results.some((result) => result.status === 'safe')) return 'safe';
  if (results.some((result) => result.status === 'caution')) return 'caution';
  return 'unknown';
}

function buildStatusStats(results: AnalysisResult[]) {
  return {
    safe: results.filter((result) => result.status === 'safe').length,
    caution: results.filter((result) => result.status === 'caution').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    unknown: results.filter((result) => result.status === 'unknown').length,
  };
}

export function sortResultsByRisk(results: AnalysisResult[]): AnalysisResult[] {
  return [...results].sort((a, b) => STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status] || CONFIDENCE_WEIGHT[a.confidence] - CONFIDENCE_WEIGHT[b.confidence]);
}

export function sortGroupRowsByRisk(rows: GroupAnalysisRow[]): GroupAnalysisRow[] {
  return [...rows].sort((a, b) => STATUS_WEIGHT[b.aggregateStatus] - STATUS_WEIGHT[a.aggregateStatus] || b.blockedCount - a.blockedCount || a.safeCount - b.safeCount);
}
