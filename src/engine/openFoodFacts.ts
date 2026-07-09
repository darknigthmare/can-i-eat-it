import type { AllergenId, InternetDishLookup } from '../types';
import { normalizeText } from './text';

const ALLERGEN_MAP: Record<string, AllergenId> = {
  gluten: 'gluten',
  'en:gluten': 'gluten',
  crustaceans: 'crustaceans',
  'en:crustaceans': 'crustaceans',
  eggs: 'eggs',
  'en:eggs': 'eggs',
  fish: 'fish',
  'en:fish': 'fish',
  peanuts: 'peanuts',
  'en:peanuts': 'peanuts',
  soybeans: 'soy',
  soy: 'soy',
  'en:soybeans': 'soy',
  milk: 'milk',
  'en:milk': 'milk',
  nuts: 'nuts',
  'en:nuts': 'nuts',
  celery: 'celery',
  'en:celery': 'celery',
  mustard: 'mustard',
  'en:mustard': 'mustard',
  sesame: 'sesame',
  'en:sesame-seeds': 'sesame',
  sulphites: 'sulphites',
  sulfites: 'sulphites',
  'en:sulphur-dioxide-and-sulphites': 'sulphites',
  lupin: 'lupin',
  'en:lupin': 'lupin',
  molluscs: 'molluscs',
  'en:molluscs': 'molluscs',
};

type OffProduct = {
  product_name?: string;
  product_name_fr?: string;
  ingredients_text?: string;
  ingredients_text_fr?: string;
  allergens_tags?: string[];
  traces_tags?: string[];
  url?: string;
};

type OffSearchResponse = {
  products?: OffProduct[];
};

export async function lookupOpenFoodFacts(query: string): Promise<InternetDishLookup | null> {
  const cleanQuery = normalizeText(query);
  if (cleanQuery.length < 3) return null;

  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', cleanQuery);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '5');
  url.searchParams.set('fields', 'product_name,product_name_fr,ingredients_text,ingredients_text_fr,allergens_tags,traces_tags,url');

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as OffSearchResponse;
  const product = payload.products?.find((item) => item.ingredients_text_fr || item.ingredients_text || item.allergens_tags?.length);
  if (!product) return null;

  const ingredientsText = product.ingredients_text_fr ?? product.ingredients_text ?? '';
  const ingredients = ingredientsText
    .split(/[,;•]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 30);

  const allergens = [...(product.allergens_tags ?? []), ...(product.traces_tags ?? [])]
    .map((tag) => ALLERGEN_MAP[tag] ?? ALLERGEN_MAP[tag.replace(/^en:/, '')])
    .filter((tag): tag is AllergenId => Boolean(tag));

  return {
    query,
    source: 'open-food-facts',
    ingredients,
    allergens: Array.from(new Set(allergens)),
    confidence: ingredients.length > 0 ? 'probable' : 'estimated',
    url: product.url,
  };
}
