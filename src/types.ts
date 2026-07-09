export type DecisionStatus = 'safe' | 'caution' | 'blocked' | 'unknown';

export type Confidence = 'confirmed' | 'probable' | 'estimated' | 'unknown';

export type ContributionStatus = 'queued' | 'pending_review' | 'community_verified' | 'trusted' | 'rejected' | 'deprecated';

export type ContributionKind = 'dish-correction' | 'restaurant-note' | 'official-menu' | 'ingredient-source';

export type PublicSourceType = 'user-correction' | 'menu-photo' | 'restaurant-confirmation' | 'official-menu' | 'open-food-facts' | 'moderator';

export type Severity = 'info' | 'caution' | 'danger';

export type RuleId =
  | 'vegetarian'
  | 'vegan'
  | 'pescetarian'
  | 'no_pork'
  | 'no_beef'
  | 'no_alcohol'
  | 'halal'
  | 'kosher'
  | 'christian_lent'
  | 'hindu_no_beef'
  | 'low_lactose'
  | 'gluten_free'
  | 'custom_strict';

export type Strictness = 'relaxed' | 'normal' | 'strict';

export type AllergenId =
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'peanuts'
  | 'soy'
  | 'milk'
  | 'nuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulphites'
  | 'lupin'
  | 'molluscs';

export type IngredientTag =
  | AllergenId
  | 'meat'
  | 'red_meat'
  | 'pork'
  | 'beef'
  | 'poultry'
  | 'lamb'
  | 'seafood'
  | 'animal_product'
  | 'dairy'
  | 'lactose'
  | 'cheese'
  | 'rennet_risk'
  | 'gelatin'
  | 'animal_fat'
  | 'broth_meat_risk'
  | 'alcohol'
  | 'wine'
  | 'beer'
  | 'rum'
  | 'may_contain_alcohol'
  | 'vegan_ok'
  | 'vegetarian_ok'
  | 'halal_confirmed'
  | 'kosher_confirmed'
  | 'halal_risk'
  | 'kosher_risk'
  | 'cross_contamination_risk'
  | 'unknown_source'
  | 'fried_shared_oil_risk'
  | 'sweetener'
  | 'spicy'
  | 'shellfish'
  | 'hidden_sauce_risk'
  | 'raw_food_risk';

export interface Ingredient {
  id: string;
  names: string[];
  category: string;
  tags: IngredientTag[];
  notes?: string;
  confidence?: Confidence;
}

export interface DishSeed {
  id: string;
  names: string[];
  ingredients: string[];
  cuisine?: string;
  confidence: Confidence;
  notes?: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  rules: RuleId[];
  allergens: AllergenId[];
  intolerances: AllergenId[];
  strictness: Strictness;
  customForbiddenTerms: string[];
  customCautionTerms: string[];
  color?: string;
  enabled?: boolean;
}


export interface LearnedDish {
  id: string;
  name: string;
  normalizedName: string;
  aliases: string[];
  restaurantName?: string;
  ingredientIds: string[];
  confidence: Confidence;
  notes?: string;
  source: 'manual-correction' | 'backend-sync' | 'import';
  updatedAt: string;
  useCount: number;
}

export interface RestaurantMemory {
  id: string;
  name: string;
  normalizedName: string;
  address?: string;
  city?: string;
  notes?: string;
  updatedAt: string;
  favorite?: boolean;
  visitCount?: number;
  lastUsedAt?: string;
}

export interface BackendHealth {
  ok: boolean;
  version: string;
  dbPath?: string;
  learnedDishes: number;
  scans: number;
  restaurants: number;
  contributions?: number;
  verifiedContributions?: number;
  message?: string;
}

export interface MenuItem {
  id: string;
  rawName: string;
  normalizedName: string;
  description?: string;
  price?: string;
  section?: string;
}

export type OcrIssueSeverity = 'blocker' | 'warning' | 'info';

export interface OcrQualityIssue {
  severity: OcrIssueSeverity;
  code: string;
  message: string;
  lineNumber?: number;
  lineText?: string;
  suggestion?: string;
}

export interface OcrSectionSummary {
  title: string;
  lineStart: number;
  lineEnd: number;
  itemCount: number;
}

export interface OcrAdvancedReport {
  generatedAt: string;
  sourceName?: string;
  lineCount: number;
  usableLineCount: number;
  priceCount: number;
  sectionCount: number;
  suspectedColumns: number;
  menuItemsDetected: number;
  averageLineLength: number;
  qualityScore: number;
  issues: OcrQualityIssue[];
  sections: OcrSectionSummary[];
  correctedTextPreview: string;
}


export interface MatchedDish {
  dish?: DishSeed;
  learnedDish?: LearnedDish;
  matchedBy: 'dish-db' | 'learned-db' | 'ingredient-keywords' | 'internet' | 'manual' | 'none';
  confidence: Confidence;
  ingredients: Ingredient[];
  missingTerms: string[];
  sourceNotes?: string[];
}

export interface DecisionReason {
  severity: Severity;
  rule?: RuleId | AllergenId | 'custom' | 'unknown' | 'source' | 'group';
  message: string;
  ingredientIds?: string[];
}

export interface AnalysisResult {
  menuItem: MenuItem;
  status: DecisionStatus;
  confidence: Confidence;
  matchedDish: MatchedDish;
  reasons: DecisionReason[];
  safeFor: string[];
  askServerQuestions: string[];
  score: number;
}

export interface GroupAnalysisRow {
  menuItem: MenuItem;
  results: AnalysisResult[];
  aggregateStatus: DecisionStatus;
  safeCount: number;
  cautionCount: number;
  blockedCount: number;
  unknownCount: number;
  bestProfiles: string[];
}

export interface ScanRecord {
  id: string;
  createdAt: string;
  source: 'manual' | 'sample' | 'image-ocr' | 'camera';
  imageName?: string;
  rawText: string;
  profile: UserProfile;
  profiles?: UserProfile[];
  results: AnalysisResult[];
  groupRows?: GroupAnalysisRow[];
  restaurant?: RestaurantMemory;
  notes?: string[];
}


export interface OrderSuggestion {
  itemName: string;
  status: DecisionStatus;
  score: number;
  subtitle: string;
  questions: string[];
}

export type SafeOrderAction = 'order_as_is' | 'order_with_changes' | 'ask_first' | 'avoid';

export interface SafeOrderModification {
  label: string;
  reason: string;
  priority: 'required' | 'recommended' | 'optional';
  ingredientIds?: string[];
}

export interface SafeOrderProfileDecision {
  profileName: string;
  status: DecisionStatus;
  score: number;
}

export interface SafeOrderChoice {
  itemId: string;
  itemName: string;
  status: DecisionStatus;
  confidence: Confidence;
  score: number;
  action: SafeOrderAction;
  audienceLabel: string;
  subtitle: string;
  reasons: string[];
  blockers: string[];
  modifications: SafeOrderModification[];
  questions: string[];
  profileBreakdown: SafeOrderProfileDecision[];
}

export interface SafeOrderPlan {
  mode: 'single' | 'group';
  generatedAt: string;
  restaurantName?: string;
  activeProfileName: string;
  profileNames: string[];
  totalItems: number;
  bestChoices: SafeOrderChoice[];
  conditionalChoices: SafeOrderChoice[];
  avoidChoices: SafeOrderChoice[];
  unknownChoices: SafeOrderChoice[];
  questions: string[];
  modifications: SafeOrderModification[];
  safetyWarnings: string[];
  serverScript: string;
  shortText: string;
}


export interface PublicDishContribution {
  id: string;
  kind: ContributionKind;
  status: ContributionStatus;
  createdAt: string;
  updatedAt: string;
  dishName: string;
  normalizedDishName: string;
  aliases: string[];
  restaurantName?: string;
  restaurantCity?: string;
  restaurantAddress?: string;
  ingredientIds: string[];
  allergenTags: AllergenId[];
  dietaryTags: IngredientTag[];
  sourceType: PublicSourceType;
  sourceLabel?: string;
  evidenceUrl?: string;
  notes?: string;
  trustScore: number;
  appVersion: string;
  contributorAlias?: string;
  moderationNotes?: string;
  lastSyncError?: string;
}

export interface PublicDatabaseExport {
  schemaVersion: 1;
  exportedAt: string;
  generatedBy: string;
  stats: {
    contributions: number;
    restaurants: number;
    trusted: number;
    verified: number;
    pending: number;
  };
  restaurants: Array<{
    name: string;
    normalizedName: string;
    city?: string;
    address?: string;
    dishCount: number;
    updatedAt: string;
  }>;
  dishes: PublicDishContribution[];
}

export type QualityIssueSeverity = 'blocker' | 'warning' | 'info';

export interface ContributionQualityIssue {
  severity: QualityIssueSeverity;
  code: string;
  message: string;
}

export interface ModerationReview {
  contribution: PublicDishContribution;
  issues: ContributionQualityIssue[];
  recommendedStatus: ContributionStatus;
  recommendedTrustScore: number;
  duplicateKey: string;
}

export interface ContributionDuplicateCluster {
  key: string;
  label: string;
  items: PublicDishContribution[];
  unionIngredientIds: string[];
  conflictCount: number;
  recommendedPrimaryId: string;
}

export interface ModerationSummary {
  total: number;
  pending: number;
  verified: number;
  trusted: number;
  rejected: number;
  deprecated: number;
  blockers: number;
  warnings: number;
  duplicateClusters: number;
  averageTrust: number;
}

export interface CommunitySyncSummary {
  pushed: number;
  failed: number;
  pulled: number;
  importedAsLearned: number;
}

export interface InternetDishLookup {
  query: string;
  source: 'open-food-facts' | 'manual';
  ingredients: string[];
  allergens: AllergenId[];
  confidence: Confidence;
  url?: string;
}

export interface AppSettings {
  mode: 'single' | 'group';
  activeProfileId: string;
  enabledProfileIds: string[];
  riskFirst: boolean;
  statusFilter: DecisionStatus | 'all';
  resultSearch: string;
  restaurantSearch: string;
  restaurantCityFilter: string;
  restaurantOnlyFavorites: boolean;
  restaurantSort: 'smart' | 'recent' | 'safe' | 'name';
}
