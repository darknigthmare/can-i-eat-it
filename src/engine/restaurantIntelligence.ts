import { INGREDIENTS } from '../data/ingredients';
import type {
  AnalysisResult,
  DecisionStatus,
  GroupAnalysisRow,
  LearnedDish,
  PublicDatabaseExport,
  PublicDishContribution,
  RestaurantMemory,
  UserProfile,
} from '../types';
import { analyzeMenuForGroup, analyzeMenuItems } from './compatibility';
import { parseMenuText } from './menuParser';
import { normalizeText, unique } from './text';

const INGREDIENT_LABEL_BY_ID = new Map(INGREDIENTS.map((ingredient) => [ingredient.id, ingredient.names[0]]));
const STATUS_RANK: Record<DecisionStatus, number> = {
  safe: 0,
  caution: 1,
  unknown: 2,
  blocked: 3,
};

export type RestaurantSortMode = 'smart' | 'recent' | 'safe' | 'name';

export interface RestaurantSearchOptions {
  query: string;
  city: string;
  onlyFavorites: boolean;
  sortBy: RestaurantSortMode;
  mode: 'single' | 'group';
  activeProfile: UserProfile;
  enabledProfiles: UserProfile[];
  localRestaurants: RestaurantMemory[];
  learnedDishes: LearnedDish[];
  publicDb?: PublicDatabaseExport | null;
  queuedContributions?: PublicDishContribution[];
  maxResults?: number;
}

export interface KnownRestaurantDish {
  name: string;
  normalizedName: string;
  ingredientIds: string[];
  source: 'learned' | 'public-db' | 'local-queue';
  trustScore: number;
  updatedAt: string;
  notes?: string;
}

export interface RestaurantCompatibilitySummary {
  mode: 'single' | 'group';
  total: number;
  safe: number;
  caution: number;
  blocked: number;
  unknown: number;
  safeRatio: number;
  averageScore: number;
  bestDishes: Array<{
    name: string;
    status: DecisionStatus;
    score: number;
    subtitle: string;
  }>;
  questions: string[];
  menuText: string;
  results: AnalysisResult[];
  groupRows: GroupAnalysisRow[];
}

export interface RestaurantInsight {
  restaurant: RestaurantMemory;
  score: number;
  matchReasons: string[];
  knownDishes: KnownRestaurantDish[];
  localDishCount: number;
  publicDishCount: number;
  queuedDishCount: number;
  trustedDishCount: number;
  compatibility: RestaurantCompatibilitySummary;
}

export function searchRestaurantInsights(options: RestaurantSearchOptions): RestaurantInsight[] {
  const candidates = buildRestaurantCandidates(options.localRestaurants, options.publicDb, options.queuedContributions ?? []);
  const normalizedQuery = normalizeText(options.query);
  const normalizedCity = normalizeText(options.city);

  const insights = candidates
    .map((restaurant) => buildRestaurantInsight(restaurant, options))
    .map((insight) => ({ ...insight, score: insight.score + scoreRestaurantSearchMatch(insight.restaurant, normalizedQuery, normalizedCity, insight.matchReasons) }))
    .filter((insight) => {
      if (options.onlyFavorites && !insight.restaurant.favorite) return false;
      if (normalizedQuery && !restaurantSearchText(insight.restaurant, insight.knownDishes).includes(normalizedQuery)) return false;
      if (normalizedCity && !normalizeText([insight.restaurant.city, insight.restaurant.address].filter(Boolean).join(' ')).includes(normalizedCity)) return false;
      return true;
    });

  return sortRestaurantInsights(insights, options.sortBy).slice(0, options.maxResults ?? 18);
}

export function buildRestaurantInsight(restaurant: RestaurantMemory, options: Omit<RestaurantSearchOptions, 'query' | 'city' | 'onlyFavorites' | 'sortBy' | 'localRestaurants' | 'maxResults'>): RestaurantInsight {
  const knownDishes = buildKnownRestaurantDishes(restaurant, options.learnedDishes, options.publicDb, options.queuedContributions ?? []);
  const compatibility = buildRestaurantCompatibilitySummary(knownDishes, options.mode, options.activeProfile, options.enabledProfiles);
  const trustedDishCount = knownDishes.filter((dish) => dish.trustScore >= 70).length;
  const localDishCount = knownDishes.filter((dish) => dish.source === 'learned').length;
  const publicDishCount = knownDishes.filter((dish) => dish.source === 'public-db').length;
  const queuedDishCount = knownDishes.filter((dish) => dish.source === 'local-queue').length;
  const matchReasons = buildRestaurantReasons(restaurant, knownDishes, compatibility, trustedDishCount);

  const score = Math.round(
    Math.min(100,
      (restaurant.favorite ? 16 : 0)
      + Math.min(20, (restaurant.visitCount ?? 0) * 4)
      + Math.min(24, knownDishes.length * 4)
      + Math.min(16, trustedDishCount * 5)
      + Math.round(compatibility.safeRatio * 26)
      + recencyBoost(restaurant.lastUsedAt ?? restaurant.updatedAt)
    )
  );

  return {
    restaurant,
    score,
    matchReasons,
    knownDishes,
    localDishCount,
    publicDishCount,
    queuedDishCount,
    trustedDishCount,
    compatibility,
  };
}

export function buildKnownRestaurantDishes(
  restaurant: RestaurantMemory,
  learnedDishes: LearnedDish[],
  publicDb?: PublicDatabaseExport | null,
  queuedContributions: PublicDishContribution[] = [],
): KnownRestaurantDish[] {
  const fromLearned: KnownRestaurantDish[] = learnedDishes
    .filter((dish) => dish.restaurantName && sameRestaurantLabel(dish.restaurantName, restaurant.name))
    .map((dish) => ({
      name: dish.name,
      normalizedName: dish.normalizedName,
      ingredientIds: dish.ingredientIds,
      source: 'learned' as const,
      trustScore: dish.confidence === 'confirmed' ? 82 : dish.confidence === 'probable' ? 68 : 45,
      updatedAt: dish.updatedAt,
      notes: dish.notes,
    }));

  const publicItems = [...(publicDb?.dishes ?? []), ...queuedContributions]
    .filter((item) => item.restaurantName && contributionMatchesRestaurant(item, restaurant))
    .filter((item) => !['rejected', 'deprecated'].includes(item.status));

  const fromPublic: KnownRestaurantDish[] = publicItems.map((item) => ({
    name: item.dishName,
    normalizedName: item.normalizedDishName || normalizeText(item.dishName),
    ingredientIds: item.ingredientIds,
    source: item.status === 'queued' ? 'local-queue' : 'public-db',
    trustScore: item.status === 'queued' ? Math.min(item.trustScore, 45) : item.trustScore,
    updatedAt: item.updatedAt,
    notes: item.notes,
  }));

  const byName = new Map<string, KnownRestaurantDish>();
  for (const dish of [...fromPublic, ...fromLearned]) {
    const key = dish.normalizedName || normalizeText(dish.name);
    const existing = byName.get(key);
    if (!existing || dish.trustScore > existing.trustScore || new Date(dish.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      byName.set(key, {
        ...dish,
        ingredientIds: unique(dish.ingredientIds).filter((id) => INGREDIENT_LABEL_BY_ID.has(id)),
      });
    }
  }

  return Array.from(byName.values())
    .filter((dish) => dish.ingredientIds.length > 0)
    .sort((a, b) => b.trustScore - a.trustScore || a.name.localeCompare(b.name, 'fr'));
}

export function buildKnownMenuText(dishes: KnownRestaurantDish[], title = 'Menu connu'): string {
  const lines = [title];
  for (const dish of dishes) {
    const ingredients = dish.ingredientIds.map((id) => INGREDIENT_LABEL_BY_ID.get(id) ?? id).join(', ');
    const source = dish.source === 'learned' ? 'mémoire locale' : dish.source === 'public-db' ? 'base publique' : 'file locale';
    lines.push(`${dish.name} - ${ingredients} (${source}, confiance ${dish.trustScore}/100)`);
  }
  return lines.join('\n');
}

export function buildRestaurantCompatibilitySummary(
  knownDishes: KnownRestaurantDish[],
  mode: 'single' | 'group',
  activeProfile: UserProfile,
  enabledProfiles: UserProfile[],
): RestaurantCompatibilitySummary {
  if (knownDishes.length === 0) {
    return emptyRestaurantCompatibility(mode);
  }

  const menuText = buildKnownMenuText(knownDishes);
  const items = parseMenuText(menuText);
  const results = analyzeMenuItems(items, activeProfile);
  const groupRows = analyzeMenuForGroup(items, enabledProfiles);
  const activeRows = mode === 'group' ? groupRows : [];
  const stats = mode === 'group' ? countGroupStatus(groupRows) : countStatus(results);
  const total = mode === 'group' ? groupRows.length : results.length;
  const averageScore = mode === 'group'
    ? Math.round(groupRows.reduce((sum, row) => sum + row.safeCount * 100 - row.blockedCount * 45 - row.unknownCount * 20 + row.cautionCount * 10, 0) / Math.max(1, groupRows.length))
    : Math.round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(1, results.length));
  const bestDishes = mode === 'group'
    ? [...groupRows]
      .sort((a, b) => b.safeCount - a.safeCount || a.blockedCount - b.blockedCount || a.menuItem.rawName.localeCompare(b.menuItem.rawName, 'fr'))
      .slice(0, 6)
      .map((row) => ({
        name: row.menuItem.rawName,
        status: row.aggregateStatus,
        score: row.safeCount * 100 - row.blockedCount * 45 - row.unknownCount * 20 + row.cautionCount * 10,
        subtitle: `${row.safeCount}/${row.results.length} profil(s) OK · ${row.cautionCount} à vérifier`,
      }))
    : [...results]
      .sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.score - a.score)
      .slice(0, 6)
      .map((result) => ({
        name: result.menuItem.rawName,
        status: result.status,
        score: result.score,
        subtitle: result.reasons[0]?.message ?? 'Aucun conflit détecté.',
      }));

  const questions = mode === 'group'
    ? unique(activeRows.flatMap((row) => row.results.flatMap((result) => result.askServerQuestions))).slice(0, 12)
    : unique(results.flatMap((result) => result.askServerQuestions)).slice(0, 12);

  return {
    mode,
    total,
    ...stats,
    safeRatio: total ? stats.safe / total : 0,
    averageScore,
    bestDishes,
    questions,
    menuText,
    results,
    groupRows,
  };
}

export function markRestaurantVisit(restaurant: RestaurantMemory, at = new Date().toISOString()): RestaurantMemory {
  return {
    ...restaurant,
    visitCount: (restaurant.visitCount ?? 0) + 1,
    lastUsedAt: at,
    updatedAt: at,
  };
}

export function toggleRestaurantFavorite(restaurant: RestaurantMemory): RestaurantMemory {
  return {
    ...restaurant,
    favorite: !restaurant.favorite,
    updatedAt: new Date().toISOString(),
  };
}

function buildRestaurantCandidates(
  localRestaurants: RestaurantMemory[],
  publicDb?: PublicDatabaseExport | null,
  queuedContributions: PublicDishContribution[] = [],
): RestaurantMemory[] {
  const byKey = new Map<string, RestaurantMemory>();
  for (const restaurant of localRestaurants) {
    byKey.set(restaurantKey(restaurant.name, restaurant.city, restaurant.address), restaurant);
  }

  for (const restaurant of publicDb?.restaurants ?? []) {
    const key = restaurantKey(restaurant.name, restaurant.city, restaurant.address);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: `public-restaurant-${key}`,
      name: restaurant.name,
      normalizedName: restaurant.normalizedName || normalizeText(restaurant.name),
      city: restaurant.city,
      address: restaurant.address,
      notes: `${restaurant.dishCount} plat(s) dans la base publique.`,
      updatedAt: restaurant.updatedAt,
      favorite: false,
      visitCount: 0,
    });
  }

  for (const item of queuedContributions) {
    if (!item.restaurantName) continue;
    const key = restaurantKey(item.restaurantName, item.restaurantCity, item.restaurantAddress);
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: `queued-restaurant-${key}`,
      name: item.restaurantName,
      normalizedName: normalizeText(item.restaurantName),
      city: item.restaurantCity,
      address: item.restaurantAddress,
      notes: 'Restaurant issu de la file locale de contribution.',
      updatedAt: item.updatedAt,
      favorite: false,
      visitCount: 0,
    });
  }

  return Array.from(byKey.values());
}

function restaurantKey(name?: string, city?: string, address?: string): string {
  return normalizeText([name, city, address].filter(Boolean).join(' | '));
}

function contributionMatchesRestaurant(contribution: PublicDishContribution, restaurant: RestaurantMemory): boolean {
  if (!contribution.restaurantName) return false;
  const nameOk = sameRestaurantLabel(contribution.restaurantName, restaurant.name);
  const cityOk = !restaurant.city || !contribution.restaurantCity || normalizeText(restaurant.city) === normalizeText(contribution.restaurantCity);
  const addressOk = !restaurant.address || !contribution.restaurantAddress || normalizeText(restaurant.address) === normalizeText(contribution.restaurantAddress);
  return nameOk && cityOk && addressOk;
}

function sameRestaurantLabel(left: string, right: string): boolean {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function restaurantSearchText(restaurant: RestaurantMemory, knownDishes: KnownRestaurantDish[]): string {
  return normalizeText([
    restaurant.name,
    restaurant.city,
    restaurant.address,
    restaurant.notes,
    knownDishes.map((dish) => dish.name).join(' '),
  ].filter(Boolean).join(' '));
}

function scoreRestaurantSearchMatch(restaurant: RestaurantMemory, normalizedQuery: string, normalizedCity: string, reasons: string[]): number {
  let score = 0;
  const text = normalizeText([restaurant.name, restaurant.city, restaurant.address, restaurant.notes].filter(Boolean).join(' '));
  const normalizedName = normalizeText(restaurant.name);
  if (normalizedQuery) {
    if (normalizedName === normalizedQuery) {
      score += 44;
      reasons.push('nom exact');
    } else if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
      score += 28;
      reasons.push('nom proche');
    } else if (text.includes(normalizedQuery)) {
      score += 15;
      reasons.push('recherche trouvée dans la fiche');
    }
  }
  if (normalizedCity && normalizeText([restaurant.city, restaurant.address].filter(Boolean).join(' ')).includes(normalizedCity)) {
    score += 18;
    reasons.push('ville/adresse correspondante');
  }
  return score;
}

function sortRestaurantInsights(items: RestaurantInsight[], sortBy: RestaurantSortMode): RestaurantInsight[] {
  const byRecent = (a: RestaurantInsight, b: RestaurantInsight) => new Date(b.restaurant.lastUsedAt ?? b.restaurant.updatedAt).getTime() - new Date(a.restaurant.lastUsedAt ?? a.restaurant.updatedAt).getTime();
  if (sortBy === 'name') return [...items].sort((a, b) => a.restaurant.name.localeCompare(b.restaurant.name, 'fr'));
  if (sortBy === 'recent') return [...items].sort((a, b) => byRecent(a, b) || b.score - a.score);
  if (sortBy === 'safe') return [...items].sort((a, b) => b.compatibility.safeRatio - a.compatibility.safeRatio || b.compatibility.safe - a.compatibility.safe || b.score - a.score);
  return [...items].sort((a, b) => b.score - a.score || byRecent(a, b) || a.restaurant.name.localeCompare(b.restaurant.name, 'fr'));
}

function buildRestaurantReasons(
  restaurant: RestaurantMemory,
  knownDishes: KnownRestaurantDish[],
  compatibility: RestaurantCompatibilitySummary,
  trustedDishCount: number,
): string[] {
  const reasons: string[] = [];
  if (restaurant.favorite) reasons.push('favori');
  if (restaurant.visitCount) reasons.push(`${restaurant.visitCount} visite(s)`);
  if (knownDishes.length) reasons.push(`${knownDishes.length} plat(s) connu(s)`);
  if (trustedDishCount) reasons.push(`${trustedDishCount} source(s) fiable(s)`);
  if (compatibility.total) reasons.push(`${compatibility.safe} compatible(s) sur ${compatibility.total}`);
  return reasons.length ? reasons : ['fiche restaurant vide à compléter'];
}

function recencyBoost(date?: string): number {
  if (!date) return 0;
  const ageMs = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return 4;
  const days = ageMs / 86_400_000;
  if (days < 2) return 10;
  if (days < 14) return 7;
  if (days < 60) return 4;
  return 0;
}

function countStatus(results: AnalysisResult[]) {
  return {
    safe: results.filter((result) => result.status === 'safe').length,
    caution: results.filter((result) => result.status === 'caution').length,
    blocked: results.filter((result) => result.status === 'blocked').length,
    unknown: results.filter((result) => result.status === 'unknown').length,
  };
}

function countGroupStatus(rows: GroupAnalysisRow[]) {
  return {
    safe: rows.filter((row) => row.aggregateStatus === 'safe').length,
    caution: rows.filter((row) => row.aggregateStatus === 'caution').length,
    blocked: rows.filter((row) => row.aggregateStatus === 'blocked').length,
    unknown: rows.filter((row) => row.aggregateStatus === 'unknown').length,
  };
}

function emptyRestaurantCompatibility(mode: 'single' | 'group'): RestaurantCompatibilitySummary {
  return {
    mode,
    total: 0,
    safe: 0,
    caution: 0,
    blocked: 0,
    unknown: 0,
    safeRatio: 0,
    averageScore: 0,
    bestDishes: [],
    questions: [],
    menuText: '',
    results: [],
    groupRows: [],
  };
}
