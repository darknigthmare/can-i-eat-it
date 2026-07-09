import { EU_MAJOR_ALLERGENS, INGREDIENTS } from '../data/ingredients';
import type {
  AllergenId,
  AnalysisResult,
  Confidence,
  ContributionDuplicateCluster,
  ContributionQualityIssue,
  ContributionStatus,
  Ingredient,
  IngredientTag,
  LearnedDish,
  ModerationReview,
  ModerationSummary,
  PublicDatabaseExport,
  PublicDishContribution,
  RestaurantMemory,
} from '../types';
import { normalizeText, unique } from './text';

const APP_VERSION = '1.1.0';
const ALLERGEN_SET = new Set<string>(EU_MAJOR_ALLERGENS.map((item) => item.id));
const INGREDIENT_BY_ID = new Map(INGREDIENTS.map((ingredient) => [ingredient.id, ingredient]));
const TRUST_BY_CONFIDENCE: Record<Confidence, number> = {
  confirmed: 72,
  probable: 58,
  estimated: 42,
  unknown: 22,
};
const STATUS_WEIGHT: Record<ContributionStatus, number> = {
  queued: 0,
  pending_review: 6,
  community_verified: 18,
  trusted: 30,
  rejected: -35,
  deprecated: -16,
};
const SOURCE_WEIGHT: Record<string, number> = {
  'official-menu': 18,
  'restaurant-confirmation': 16,
  'menu-photo': 10,
  'open-food-facts': 8,
  moderator: 12,
  'user-correction': 4,
};

export function makeContributionFromAnalysis(result: AnalysisResult, restaurant?: RestaurantMemory | null): PublicDishContribution {
  return makeContribution({
    dishName: result.menuItem.rawName,
    normalizedDishName: result.menuItem.normalizedName || normalizeText(result.menuItem.rawName),
    aliases: unique([result.menuItem.normalizedName, result.matchedDish.learnedDish?.aliases.join(', ') ?? ''].filter(Boolean)),
    ingredients: result.matchedDish.ingredients,
    ingredientIds: result.matchedDish.ingredients.map((ingredient) => ingredient.id),
    confidence: result.confidence,
    restaurant,
    notes: buildContributionNotes(result),
    sourceLabel: 'Correction/analyse depuis un scan menu Can I Eat It',
  });
}

export function makeContributionFromLearnedDish(dish: LearnedDish, restaurant?: RestaurantMemory | null): PublicDishContribution {
  const ingredients = dish.ingredientIds
    .map((id) => INGREDIENT_BY_ID.get(id))
    .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));

  return makeContribution({
    dishName: dish.name,
    normalizedDishName: dish.normalizedName,
    aliases: dish.aliases,
    ingredients,
    ingredientIds: dish.ingredientIds,
    confidence: dish.confidence,
    restaurant: restaurant ?? restaurantFromLearnedDish(dish),
    notes: dish.notes,
    sourceLabel: 'Correction utilisateur apprise puis partagée',
  });
}

export function contributionToLearnedDish(contribution: PublicDishContribution): LearnedDish {
  return {
    id: `public-${contribution.id}`,
    name: contribution.dishName,
    normalizedName: contribution.normalizedDishName,
    aliases: contribution.aliases,
    restaurantName: contribution.restaurantName,
    ingredientIds: contribution.ingredientIds.filter((id) => INGREDIENT_BY_ID.has(id)),
    confidence: contribution.status === 'trusted' || contribution.status === 'community_verified' ? 'probable' : 'estimated',
    notes: [
      'Importé depuis la base communautaire publique Can I Eat It.',
      `Statut public : ${contribution.status}.`,
      contribution.notes,
    ].filter(Boolean).join('\n'),
    source: 'import',
    updatedAt: contribution.updatedAt,
    useCount: 0,
  };
}

export function contributionIsImportable(contribution: PublicDishContribution): boolean {
  return ['community_verified', 'trusted', 'pending_review'].includes(contribution.status)
    && contribution.ingredientIds.some((id) => INGREDIENT_BY_ID.has(id));
}

export function isContributionShareable(contribution: PublicDishContribution): boolean {
  return Boolean(contribution.dishName.trim()) && contribution.ingredientIds.length > 0;
}

export function buildPublicDatabaseExport(dishes: PublicDishContribution[]): PublicDatabaseExport {
  const publicDishes = dishes
    .map(sanitizeContribution)
    .filter((item) => item.status !== 'rejected' && item.status !== 'deprecated')
    .sort((a, b) => b.trustScore - a.trustScore || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const restaurants = buildRestaurantsFromContributions(publicDishes);

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    generatedBy: `Can I Eat It ${APP_VERSION}`,
    stats: {
      contributions: publicDishes.length,
      restaurants: restaurants.length,
      trusted: publicDishes.filter((item) => item.status === 'trusted').length,
      verified: publicDishes.filter((item) => item.status === 'community_verified').length,
      pending: publicDishes.filter((item) => item.status === 'pending_review' || item.status === 'queued').length,
    },
    restaurants,
    dishes: publicDishes,
  };
}

export function mergePublicContributions(local: PublicDishContribution[], remote: PublicDishContribution[]): PublicDishContribution[] {
  const byId = new Map<string, PublicDishContribution>();
  for (const item of [...local, ...remote]) {
    const clean = sanitizeContribution(item);
    const current = byId.get(clean.id);
    if (!current || new Date(clean.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      byId.set(clean.id, clean);
    }
  }
  return Array.from(byId.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function summarizeContribution(contribution: PublicDishContribution): string {
  const restaurant = contribution.restaurantName
    ? ` · ${contribution.restaurantName}${contribution.restaurantCity ? ` (${contribution.restaurantCity})` : ''}`
    : '';
  const ingredients = contribution.ingredientIds
    .map((id) => INGREDIENT_BY_ID.get(id)?.names[0] ?? id)
    .slice(0, 10)
    .join(', ');
  return `${contribution.dishName}${restaurant} · ${ingredients || 'composition inconnue'} · confiance ${contribution.trustScore}/100`;
}

export function downloadPublicDatabaseExport(db: PublicDatabaseExport, filename = 'can-i-eat-it-public-db.json'): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function inspectContributionQuality(contribution: PublicDishContribution, all: PublicDishContribution[] = []): ContributionQualityIssue[] {
  const item = sanitizeContribution(contribution);
  const issues: ContributionQualityIssue[] = [];

  if (!item.dishName || item.dishName.length < 2) {
    issues.push({ severity: 'blocker', code: 'dish-name-missing', message: 'Nom du plat absent ou trop court.' });
  }

  if (item.ingredientIds.length === 0) {
    issues.push({ severity: 'blocker', code: 'ingredients-missing', message: 'Aucun ingrédient reconnu : impossible de publier une décision fiable.' });
  } else if (item.ingredientIds.length === 1) {
    issues.push({ severity: 'warning', code: 'ingredients-too-short', message: 'Un seul ingrédient : composition probablement incomplète.' });
  }

  if (!item.restaurantName) {
    issues.push({ severity: 'warning', code: 'restaurant-missing', message: 'Restaurant absent : la contribution restera générique et moins fiable.' });
  }

  if (item.sourceType === 'user-correction' && !item.sourceLabel && !item.evidenceUrl) {
    issues.push({ severity: 'warning', code: 'source-light', message: 'Source faible : ajoute idéalement photo menu, confirmation restaurant ou URL officielle.' });
  }

  if (item.trustScore < 35 && !['rejected', 'deprecated'].includes(item.status)) {
    issues.push({ severity: 'warning', code: 'low-trust', message: 'Score de confiance faible : garder en modération.' });
  }

  if (containsPossiblePersonalData([item.notes, item.sourceLabel, item.contributorAlias].filter(Boolean).join(' '))) {
    issues.push({ severity: 'warning', code: 'personal-data-risk', message: 'Notes/source semblent contenir mail ou téléphone : anonymiser avant publication.' });
  }

  const duplicates = all.filter((candidate) => candidate.id !== item.id && duplicateKeyForContribution(candidate) === duplicateKeyForContribution(item));
  if (duplicates.length > 0) {
    issues.push({ severity: 'info', code: 'duplicate-candidate', message: `${duplicates.length} contribution(s) similaire(s) détectée(s) pour le même plat/restaurant.` });
  }

  if (item.status === 'rejected') {
    issues.push({ severity: 'info', code: 'already-rejected', message: 'Contribution déjà rejetée.' });
  }

  if (item.status === 'deprecated') {
    issues.push({ severity: 'info', code: 'already-deprecated', message: 'Contribution déjà marquée obsolète.' });
  }

  return issues;
}

export function buildModerationReviews(contributions: PublicDishContribution[]): ModerationReview[] {
  const clean = contributions.map(sanitizeContribution);
  return clean.map((contribution) => {
    const issues = inspectContributionQuality(contribution, clean);
    const recommendedTrustScore = suggestTrustScore(contribution, issues, clean);
    return {
      contribution,
      issues,
      recommendedStatus: suggestContributionStatus(contribution, issues, recommendedTrustScore),
      recommendedTrustScore,
      duplicateKey: duplicateKeyForContribution(contribution),
    };
  }).sort((a, b) => {
    const priority = issuePriority(b.issues) - issuePriority(a.issues);
    if (priority !== 0) return priority;
    return new Date(b.contribution.updatedAt).getTime() - new Date(a.contribution.updatedAt).getTime();
  });
}

export function buildModerationSummary(contributions: PublicDishContribution[]): ModerationSummary {
  const clean = contributions.map(sanitizeContribution);
  const reviews = buildModerationReviews(clean);
  const clusters = findContributionDuplicateClusters(clean);
  const averageTrust = clean.length
    ? Math.round(clean.reduce((sum, item) => sum + item.trustScore, 0) / clean.length)
    : 0;

  return {
    total: clean.length,
    pending: clean.filter((item) => item.status === 'pending_review' || item.status === 'queued').length,
    verified: clean.filter((item) => item.status === 'community_verified').length,
    trusted: clean.filter((item) => item.status === 'trusted').length,
    rejected: clean.filter((item) => item.status === 'rejected').length,
    deprecated: clean.filter((item) => item.status === 'deprecated').length,
    blockers: reviews.reduce((sum, review) => sum + review.issues.filter((issue) => issue.severity === 'blocker').length, 0),
    warnings: reviews.reduce((sum, review) => sum + review.issues.filter((issue) => issue.severity === 'warning').length, 0),
    duplicateClusters: clusters.length,
    averageTrust,
  };
}

export function duplicateKeyForContribution(contribution: PublicDishContribution): string {
  const item = sanitizeContribution(contribution);
  return normalizeText([
    item.restaurantName,
    item.restaurantCity,
    item.restaurantAddress,
    item.normalizedDishName || item.dishName,
  ].filter(Boolean).join(' | '));
}

export function findContributionDuplicateClusters(contributions: PublicDishContribution[]): ContributionDuplicateCluster[] {
  const byKey = new Map<string, PublicDishContribution[]>();
  for (const contribution of contributions.map(sanitizeContribution)) {
    const key = duplicateKeyForContribution(contribution);
    if (!key) continue;
    const current = byKey.get(key) ?? [];
    current.push(contribution);
    byKey.set(key, current);
  }

  return Array.from(byKey.entries())
    .filter(([, items]) => items.length > 1)
    .map(([key, items]) => {
      const sorted = [...items].sort(compareContributionPriority);
      const unionIngredientIds = unique(items.flatMap((item) => item.ingredientIds)).filter((id) => INGREDIENT_BY_ID.has(id));
      const intersection = unionIngredientIds.filter((id) => items.every((item) => item.ingredientIds.includes(id)));
      const label = [sorted[0].dishName, sorted[0].restaurantName, sorted[0].restaurantCity].filter(Boolean).join(' · ');
      return {
        key,
        label: label || key,
        items: sorted,
        unionIngredientIds,
        conflictCount: Math.max(0, unionIngredientIds.length - intersection.length),
        recommendedPrimaryId: sorted[0].id,
      };
    })
    .sort((a, b) => b.items.length - a.items.length || b.conflictCount - a.conflictCount || a.label.localeCompare(b.label, 'fr'));
}

export function mergeContributionCluster(cluster: ContributionDuplicateCluster, note = 'Fusion V9 doublons/qualité'): PublicDishContribution {
  const primary = cluster.items.find((item) => item.id === cluster.recommendedPrimaryId) ?? cluster.items[0];
  const ingredientIds = unique(cluster.unionIngredientIds).filter((id) => INGREDIENT_BY_ID.has(id));
  const ingredients = ingredientIds
    .map((id) => INGREDIENT_BY_ID.get(id))
    .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));
  const tags = unique(ingredients.flatMap((ingredient) => ingredient.tags));
  const allergenTags = tags.filter((tag): tag is AllergenId => ALLERGEN_SET.has(tag));
  const bestStatus = cluster.items.some((item) => item.status === 'trusted') ? 'trusted' : 'community_verified';
  const bestTrust = Math.max(...cluster.items.map((item) => item.trustScore || 0));
  const now = new Date().toISOString();

  return sanitizeContribution({
    ...primary,
    status: bestStatus,
    updatedAt: now,
    aliases: unique(cluster.items.flatMap((item) => [item.dishName, ...item.aliases])).filter(Boolean),
    ingredientIds,
    allergenTags,
    dietaryTags: tags as IngredientTag[],
    trustScore: Math.min(98, Math.max(68, bestTrust + 3 * Math.min(cluster.items.length - 1, 6) + Math.min(8, ingredientIds.length))),
    moderationNotes: [
      note,
      `Contribution principale : ${primary.id}.`,
      `Fusion de ${cluster.items.length} entrées. Ingrédients consolidés : ${ingredientIds.length}.`,
      primary.moderationNotes,
    ].filter(Boolean).join(' '),
    appVersion: APP_VERSION,
  });
}

export function applyModerationPatch(contribution: PublicDishContribution, status: ContributionStatus, note = '', trustScore?: number): PublicDishContribution {
  const clean = sanitizeContribution(contribution);
  const nextTrust = typeof trustScore === 'number'
    ? trustScore
    : status === 'trusted'
      ? Math.max(clean.trustScore, 85)
      : status === 'community_verified'
        ? Math.max(clean.trustScore, 68)
        : status === 'rejected'
          ? Math.min(clean.trustScore, 20)
          : status === 'deprecated'
            ? Math.min(clean.trustScore, 35)
            : clean.trustScore;

  return sanitizeContribution({
    ...clean,
    status,
    trustScore: Math.max(0, Math.min(100, Math.round(nextTrust))),
    moderationNotes: [note, clean.moderationNotes].filter(Boolean).join(' | '),
    updatedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
  });
}

function makeContribution(input: {
  dishName: string;
  normalizedDishName: string;
  aliases: string[];
  ingredients: Ingredient[];
  ingredientIds: string[];
  confidence: Confidence;
  restaurant?: RestaurantMemory | null;
  notes?: string;
  sourceLabel?: string;
}): PublicDishContribution {
  const now = new Date().toISOString();
  const ingredientIds = unique(input.ingredientIds).filter((id) => INGREDIENT_BY_ID.has(id));
  const tags = unique(input.ingredients.flatMap((ingredient) => ingredient.tags));
  const allergenTags = tags.filter((tag): tag is AllergenId => ALLERGEN_SET.has(tag));
  const trustScore = computeTrustScore(input.confidence, ingredientIds.length, Boolean(input.restaurant));

  return sanitizeContribution({
    id: makeContributionId(input.normalizedDishName || input.dishName, input.restaurant?.normalizedName),
    kind: 'dish-correction',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    dishName: input.dishName.trim(),
    normalizedDishName: input.normalizedDishName || normalizeText(input.dishName),
    aliases: unique(input.aliases.flatMap((alias) => alias.split(',')).map((alias) => alias.trim()).filter(Boolean)),
    restaurantName: input.restaurant?.name,
    restaurantCity: input.restaurant?.city,
    restaurantAddress: input.restaurant?.address,
    ingredientIds,
    allergenTags,
    dietaryTags: tags as IngredientTag[],
    sourceType: 'user-correction',
    sourceLabel: input.sourceLabel,
    notes: input.notes,
    trustScore,
    appVersion: APP_VERSION,
  });
}

function sanitizeContribution(value: PublicDishContribution): PublicDishContribution {
  const dishName = value.dishName.trim();
  const normalizedDishName = value.normalizedDishName || normalizeText(dishName);
  return {
    ...value,
    dishName,
    normalizedDishName,
    aliases: unique((value.aliases ?? []).map((alias) => alias.trim()).filter(Boolean)).slice(0, 20),
    restaurantName: value.restaurantName?.trim() || undefined,
    restaurantCity: value.restaurantCity?.trim() || undefined,
    restaurantAddress: value.restaurantAddress?.trim() || undefined,
    ingredientIds: unique(value.ingredientIds ?? []).filter((id) => INGREDIENT_BY_ID.has(id)).slice(0, 80),
    allergenTags: unique(value.allergenTags ?? []).filter((tag): tag is AllergenId => ALLERGEN_SET.has(tag)).slice(0, 20),
    dietaryTags: unique(value.dietaryTags ?? []).slice(0, 80),
    notes: sanitizeFreeText(value.notes),
    sourceLabel: sanitizeFreeText(value.sourceLabel),
    evidenceUrl: value.evidenceUrl?.trim() || undefined,
    contributorAlias: sanitizeFreeText(value.contributorAlias),
    moderationNotes: sanitizeFreeText(value.moderationNotes),
    trustScore: Math.max(0, Math.min(100, Math.round(value.trustScore || 0))),
    appVersion: value.appVersion || APP_VERSION,
  };
}

function sanitizeFreeText(value?: string): string | undefined {
  const clean = value?.replace(/[\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, 900) : undefined;
}

function computeTrustScore(confidence: Confidence, ingredientCount: number, hasRestaurant: boolean): number {
  let score = TRUST_BY_CONFIDENCE[confidence] ?? 35;
  if (ingredientCount >= 3) score += 8;
  if (ingredientCount >= 6) score += 5;
  if (hasRestaurant) score += 5;
  return Math.max(10, Math.min(95, score));
}

function suggestTrustScore(contribution: PublicDishContribution, issues: ContributionQualityIssue[], all: PublicDishContribution[]): number {
  const duplicateCount = all.filter((candidate) => candidate.id !== contribution.id && duplicateKeyForContribution(candidate) === duplicateKeyForContribution(contribution)).length;
  let score = contribution.trustScore || 45;
  score += STATUS_WEIGHT[contribution.status] ?? 0;
  score += SOURCE_WEIGHT[contribution.sourceType] ?? 0;
  if (contribution.restaurantName) score += 5;
  if (contribution.evidenceUrl) score += 8;
  if (contribution.ingredientIds.length >= 3) score += 6;
  if (contribution.ingredientIds.length >= 6) score += 5;
  if (duplicateCount >= 1) score += 6;
  if (duplicateCount >= 2) score += 6;
  score -= issues.filter((issue) => issue.severity === 'blocker').length * 50;
  score -= issues.filter((issue) => issue.severity === 'warning').length * 8;
  if (contribution.status === 'rejected') score = Math.min(score, 20);
  if (contribution.status === 'deprecated') score = Math.min(score, 35);
  return Math.max(0, Math.min(98, Math.round(score)));
}

function suggestContributionStatus(contribution: PublicDishContribution, issues: ContributionQualityIssue[], trustScore: number): ContributionStatus {
  if (issues.some((issue) => issue.severity === 'blocker')) return 'rejected';
  if (contribution.status === 'rejected' || contribution.status === 'deprecated') return contribution.status;
  if (trustScore >= 86 && issues.filter((issue) => issue.severity === 'warning').length === 0) return 'trusted';
  if (trustScore >= 64) return 'community_verified';
  return 'pending_review';
}

function issuePriority(issues: ContributionQualityIssue[]): number {
  return issues.filter((issue) => issue.severity === 'blocker').length * 100
    + issues.filter((issue) => issue.severity === 'warning').length * 10
    + issues.filter((issue) => issue.severity === 'info').length;
}

function compareContributionPriority(a: PublicDishContribution, b: PublicDishContribution): number {
  const statusScore = (STATUS_WEIGHT[b.status] ?? 0) - (STATUS_WEIGHT[a.status] ?? 0);
  if (statusScore !== 0) return statusScore;
  return (b.trustScore || 0) - (a.trustScore || 0) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function containsPossiblePersonalData(value: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) || /(?:\+\d{1,3}\s?)?(?:0|\(0\))?[1-9](?:[ .-]?\d{2}){4}/.test(value);
}

function makeContributionId(dishName: string, restaurantName?: string): string {
  const stable = normalizeText([restaurantName, dishName].filter(Boolean).join(' ')).replace(/\s+/g, '-').slice(0, 80);
  return `pub-${stable || 'dish'}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildContributionNotes(result: AnalysisResult): string {
  return [
    result.menuItem.description,
    result.matchedDish.sourceNotes?.join(' '),
    result.reasons.slice(0, 4).map((reason) => reason.message).join(' | '),
  ].filter(Boolean).join('\n');
}

function restaurantFromLearnedDish(dish: LearnedDish): RestaurantMemory | null {
  if (!dish.restaurantName) return null;
  return {
    id: `restaurant-${normalizeText(dish.restaurantName).replace(/\s+/g, '-')}`,
    name: dish.restaurantName,
    normalizedName: normalizeText(dish.restaurantName),
    updatedAt: dish.updatedAt,
  };
}

function buildRestaurantsFromContributions(dishes: PublicDishContribution[]): PublicDatabaseExport['restaurants'] {
  const byRestaurant = new Map<string, PublicDatabaseExport['restaurants'][number]>();
  for (const dish of dishes) {
    if (!dish.restaurantName) continue;
    const normalizedName = normalizeText([dish.restaurantName, dish.restaurantCity, dish.restaurantAddress].filter(Boolean).join(' '));
    const current = byRestaurant.get(normalizedName);
    const updatedAt = current && new Date(current.updatedAt).getTime() > new Date(dish.updatedAt).getTime()
      ? current.updatedAt
      : dish.updatedAt;
    byRestaurant.set(normalizedName, {
      name: dish.restaurantName,
      normalizedName,
      city: dish.restaurantCity,
      address: dish.restaurantAddress,
      dishCount: (current?.dishCount ?? 0) + 1,
      updatedAt,
    });
  }
  return Array.from(byRestaurant.values()).sort((a, b) => b.dishCount - a.dishCount || a.name.localeCompare(b.name, 'fr'));
}
