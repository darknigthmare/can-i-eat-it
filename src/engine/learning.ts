import { INGREDIENTS } from '../data/ingredients';
import type { Ingredient, LearnedDish, MenuItem } from '../types';
import { normalizeText, unique } from './text';

const LEARNED_DISHES_KEY = 'can-i-eat-it:learned-dishes:v3';
const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]));
const INGREDIENT_SHORTCUTS: Record<string, string> = {
  gluten: 'gluten_ble',
  ble: 'gluten_ble',
  blé: 'gluten_ble',
  lactose: 'lait',
  lait: 'lait',
  alcool: 'vin',
  vin: 'vin',
  friture: 'huile_friture',
  huile: 'huile_friture',
  sauce: 'sauce_maison',
  'sauce maison': 'sauce_maison',
  cacahuete: 'arachide',
  cacahuète: 'arachide',
  arachide: 'arachide',
  oeuf: 'oeuf',
  œuf: 'oeuf',
};

function getLocalStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `learned-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getLearnedDishes(): LearnedDish[] {
  const storage = getLocalStorage();
  if (!storage) return [];

  const raw = storage.getItem(LEARNED_DISHES_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as LearnedDish[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(migrateLearnedDish)
      .filter((dish): dish is LearnedDish => Boolean(dish));
  } catch {
    return [];
  }
}

export function saveLearnedDishes(dishes: LearnedDish[]): void {
  const storage = getLocalStorage();
  if (!storage) return;
  const clean = dishes
    .map(migrateLearnedDish)
    .filter((dish): dish is LearnedDish => Boolean(dish))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  storage.setItem(LEARNED_DISHES_KEY, JSON.stringify(clean.slice(0, 600)));
}

export function importLearnedDishes(dishes: LearnedDish[]): LearnedDish[] {
  const byName = new Map<string, LearnedDish>();
  for (const dish of [...getLearnedDishes(), ...dishes]) {
    const migrated = migrateLearnedDish(dish);
    if (!migrated) continue;
    const current = byName.get(migrated.normalizedName);
    if (!current || new Date(migrated.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      byName.set(migrated.normalizedName, migrated);
    }
  }
  const merged = Array.from(byName.values());
  saveLearnedDishes(merged);
  return merged;
}

export function upsertLearnedDish(input: {
  menuItem: MenuItem;
  ingredientIds: string[];
  aliases?: string[];
  restaurantName?: string;
  notes?: string;
  source?: LearnedDish['source'];
}): LearnedDish {
  const normalizedName = normalizeText(input.menuItem.rawName);
  const existing = getLearnedDishes().find((dish) => dish.normalizedName === normalizedName);
  const now = new Date().toISOString();
  const ingredientIds = unique(input.ingredientIds).filter((id) => INGREDIENT_BY_ID.has(id));

  const dish: LearnedDish = {
    id: existing?.id ?? makeId(),
    name: input.menuItem.rawName.trim(),
    normalizedName,
    aliases: unique([...(existing?.aliases ?? []), ...(input.aliases ?? []), input.menuItem.normalizedName].filter(Boolean)),
    restaurantName: input.restaurantName || existing?.restaurantName,
    ingredientIds,
    confidence: 'confirmed',
    notes: input.notes ?? existing?.notes,
    source: input.source ?? 'manual-correction',
    updatedAt: now,
    useCount: (existing?.useCount ?? 0) + 1,
  };

  const next = [dish, ...getLearnedDishes().filter((item) => item.id !== dish.id && item.normalizedName !== dish.normalizedName)];
  saveLearnedDishes(next);
  return dish;
}

export function removeLearnedDish(id: string): void {
  saveLearnedDishes(getLearnedDishes().filter((dish) => dish.id !== id));
}

export function findLearnedDishForText(searchable: string): LearnedDish | undefined {
  const text = normalizeText(searchable);
  return getLearnedDishes().find((dish) => {
    if (text === dish.normalizedName || text.includes(dish.normalizedName)) return true;
    return dish.aliases.some((alias) => {
      const normalizedAlias = normalizeText(alias);
      return normalizedAlias.length > 3 && (text.includes(normalizedAlias) || normalizedAlias.includes(text));
    });
  });
}

export function ingredientsFromLearnedDish(dish: LearnedDish): Ingredient[] {
  return dish.ingredientIds
    .map((id) => INGREDIENT_BY_ID.get(id))
    .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));
}

export function resolveIngredientTerms(rawTerms: string): { ingredientIds: string[]; ingredients: Ingredient[]; missingTerms: string[] } {
  const terms = rawTerms
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);

  const ingredientIds: string[] = [];
  const missingTerms: string[] = [];

  for (const term of terms) {
    const match = findIngredientByTerm(term);
    if (match) ingredientIds.push(match.id);
    else missingTerms.push(term);
  }

  const uniqueIds = unique(ingredientIds);
  return {
    ingredientIds: uniqueIds,
    ingredients: uniqueIds.map((id) => INGREDIENT_BY_ID.get(id)).filter((ingredient): ingredient is Ingredient => Boolean(ingredient)),
    missingTerms,
  };
}


export function getIngredientById(id: string): Ingredient | undefined {
  return INGREDIENT_BY_ID.get(id);
}

export function searchIngredients(query: string, limit = 36): Ingredient[] {
  const normalizedQuery = normalizeText(query);
  const scored = INGREDIENTS.map((ingredient) => {
    const names = ingredient.names.map(normalizeText);
    const category = normalizeText(ingredient.category);
    const tags = ingredient.tags.map(normalizeText);
    let score = 0;

    if (!normalizedQuery) {
      score = ingredient.tags.some((tag) => CRITICAL_TAGS.has(tag)) ? 4 : 1;
    } else if (normalizeText(ingredient.id) === normalizedQuery) {
      score = 100;
    } else if (names.some((name) => name === normalizedQuery)) {
      score = 90;
    } else if (names.some((name) => name.startsWith(normalizedQuery))) {
      score = 70;
    } else if (names.some((name) => name.includes(normalizedQuery) || normalizedQuery.includes(name))) {
      score = 52;
    } else if (category.includes(normalizedQuery)) {
      score = 32;
    } else if (tags.some((tag) => tag.includes(normalizedQuery))) {
      score = 22;
    }

    return { ingredient, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.ingredient.names[0].localeCompare(b.ingredient.names[0], 'fr'));

  return scored.slice(0, limit).map((entry) => entry.ingredient);
}

export function getIngredientRiskLevel(ingredient: Ingredient): 'danger' | 'caution' | 'info' {
  if (ingredient.tags.some((tag) => ['pork', 'alcohol', 'gelatin', 'meat', 'beef', 'crustaceans', 'molluscs', 'peanuts'].includes(tag))) return 'danger';
  if (ingredient.tags.some((tag) => ['milk', 'lactose', 'gluten', 'eggs', 'soy', 'nuts', 'mustard', 'sesame', 'sulphites', 'halal_risk', 'kosher_risk', 'hidden_sauce_risk', 'fried_shared_oil_risk', 'cross_contamination_risk', 'unknown_source'].includes(tag))) return 'caution';
  return 'info';
}

export function ingredientDisplayLabel(ingredient: Ingredient): string {
  return `${ingredient.names[0]} · ${ingredient.category}`;
}

const CRITICAL_TAGS = new Set<string>([
  'pork',
  'alcohol',
  'milk',
  'lactose',
  'gluten',
  'eggs',
  'peanuts',
  'nuts',
  'soy',
  'fish',
  'crustaceans',
  'molluscs',
  'sesame',
  'mustard',
  'halal_risk',
  'kosher_risk',
  'hidden_sauce_risk',
  'fried_shared_oil_risk',
]);

export function formatIngredientSuggestions(limit = 90): string {
  return INGREDIENTS
    .slice(0, limit)
    .map((ingredient) => `${ingredient.names[0]} [${ingredient.id}]`)
    .join(', ');
}

export function learnedDishToCsv(dish: LearnedDish): string {
  return dish.ingredientIds
    .map((id) => INGREDIENT_BY_ID.get(id)?.names[0] ?? id)
    .join(', ');
}

function findIngredientByTerm(term: string): Ingredient | undefined {
  const normalized = normalizeText(term);
  if (!normalized) return undefined;

  const shortcut = INGREDIENT_SHORTCUTS[normalized] || INGREDIENT_SHORTCUTS[term.trim().toLowerCase()];
  if (shortcut) return INGREDIENT_BY_ID.get(shortcut);

  const byId = INGREDIENTS.find((ingredient) => normalizeText(ingredient.id) === normalized || ingredient.id === term.trim());
  if (byId) return byId;

  const exact = INGREDIENTS.find((ingredient) => ingredient.names.some((name) => normalizeText(name) === normalized));
  if (exact) return exact;

  return INGREDIENTS.find((ingredient) => ingredient.names.some((name) => {
    const ingredientName = normalizeText(name);
    return ingredientName.length > 2 && (normalized.includes(ingredientName) || ingredientName.includes(normalized));
  }));
}

function migrateLearnedDish(value: Partial<LearnedDish> | null | undefined): LearnedDish | null {
  if (!value?.name && !value?.normalizedName) return null;
  const normalizedName = value.normalizedName || normalizeText(value.name ?? '');
  if (!normalizedName) return null;

  return {
    id: value.id || makeId(),
    name: value.name || normalizedName,
    normalizedName,
    aliases: Array.isArray(value.aliases) ? value.aliases : [],
    restaurantName: value.restaurantName,
    ingredientIds: Array.isArray(value.ingredientIds) ? unique(value.ingredientIds).filter((id) => INGREDIENT_BY_ID.has(id)) : [],
    confidence: value.confidence || 'confirmed',
    notes: value.notes,
    source: value.source || 'import',
    updatedAt: value.updatedAt || new Date().toISOString(),
    useCount: typeof value.useCount === 'number' ? value.useCount : 0,
  };
}
