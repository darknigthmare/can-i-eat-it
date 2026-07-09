import { cloneProfile, PROFILE_TEMPLATES } from '../data/profiles';
import { DEFAULT_PROFILE } from '../data/rules';
import type { AppSettings, PublicDatabaseExport, PublicDishContribution, RestaurantMemory, ScanRecord, UserProfile } from '../types';

const PROFILE_KEY = 'can-i-eat-it:profile';
const PROFILES_KEY = 'can-i-eat-it:profiles:v2';
const HISTORY_KEY = 'can-i-eat-it:history';
const SETTINGS_KEY = 'can-i-eat-it:settings:v2';
const RESTAURANTS_KEY = 'can-i-eat-it:restaurants:v5';
const ACTIVE_RESTAURANT_KEY = 'can-i-eat-it:active-restaurant:v5';
const COMMUNITY_QUEUE_KEY = 'can-i-eat-it:community-queue:v7';
const PUBLIC_DB_CACHE_KEY = 'can-i-eat-it:public-db-cache:v7';

export const DEFAULT_SETTINGS: AppSettings = {
  mode: 'single',
  activeProfileId: DEFAULT_PROFILE.id ?? 'profile-halal-veg-lactose',
  enabledProfileIds: [DEFAULT_PROFILE.id ?? 'profile-halal-veg-lactose'],
  riskFirst: false,
  statusFilter: 'all',
  resultSearch: '',
  restaurantSearch: '',
  restaurantCityFilter: '',
  restaurantOnlyFavorites: false,
  restaurantSort: 'smart',
};

export function loadProfile(): UserProfile {
  const profiles = loadProfiles();
  const settings = loadSettings();
  return profiles.find((profile) => profile.id === settings.activeProfileId) ?? profiles[0] ?? cloneProfile(DEFAULT_PROFILE);
}

export function saveProfile(profile: UserProfile): void {
  const profiles = loadProfiles();
  const profileId = profile.id ?? DEFAULT_SETTINGS.activeProfileId;
  const nextProfile = { ...profile, id: profileId };
  const next = profiles.some((item) => item.id === profileId)
    ? profiles.map((item) => item.id === profileId ? nextProfile : item)
    : [nextProfile, ...profiles];

  saveProfiles(next);
  localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
}

export function loadProfiles(): UserProfile[] {
  const raw = localStorage.getItem(PROFILES_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as UserProfile[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(migrateProfile);
      }
    } catch {
      // ignore and fallback
    }
  }

  const legacy = localStorage.getItem(PROFILE_KEY);
  if (legacy) {
    try {
      const parsed = migrateProfile(JSON.parse(legacy) as UserProfile);
      const seeded = [parsed, ...PROFILE_TEMPLATES.filter((template) => template.id !== parsed.id).map(cloneProfile)];
      saveProfiles(seeded);
      return seeded;
    } catch {
      // ignore and fallback
    }
  }

  const defaults = PROFILE_TEMPLATES.map(cloneProfile);
  saveProfiles(defaults);
  return defaults;
}

export function saveProfiles(profiles: UserProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles.map(migrateProfile)));
}

export function loadSettings(): AppSettings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as AppSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}


export function loadRestaurants(): RestaurantMemory[] {
  const raw = localStorage.getItem(RESTAURANTS_KEY);
  if (!raw) return [];

  try {
    const restaurants = JSON.parse(raw) as RestaurantMemory[];
    return Array.isArray(restaurants)
      ? restaurants.map(migrateRestaurant).filter((item): item is RestaurantMemory => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

export function saveRestaurants(restaurants: RestaurantMemory[]): void {
  const clean = restaurants
    .map(migrateRestaurant)
    .filter((item): item is RestaurantMemory => Boolean(item))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 300);
  localStorage.setItem(RESTAURANTS_KEY, JSON.stringify(clean));
}

export function upsertRestaurantMemory(restaurant: RestaurantMemory): RestaurantMemory[] {
  const clean = migrateRestaurant(restaurant);
  if (!clean) return loadRestaurants();

  const normalizedName = clean.normalizedName;
  const next = [
    clean,
    ...loadRestaurants().filter((item) => item.id !== clean.id && item.normalizedName !== normalizedName),
  ];
  saveRestaurants(next);
  return next;
}

export function importRestaurants(restaurants: RestaurantMemory[]): RestaurantMemory[] {
  const byName = new Map<string, RestaurantMemory>();
  for (const restaurant of [...loadRestaurants(), ...restaurants]) {
    const migrated = migrateRestaurant(restaurant);
    if (!migrated) continue;
    const current = byName.get(migrated.normalizedName);
    if (!current || new Date(migrated.updatedAt).getTime() >= new Date(current.updatedAt).getTime()) {
      byName.set(migrated.normalizedName, migrated);
    }
  }
  const merged = Array.from(byName.values());
  saveRestaurants(merged);
  return merged;
}

export function removeRestaurantMemory(id: string): RestaurantMemory[] {
  const next = loadRestaurants().filter((item) => item.id !== id);
  saveRestaurants(next);
  if (loadActiveRestaurantId() === id) saveActiveRestaurantId('');
  return next;
}

export function loadActiveRestaurantId(): string {
  return localStorage.getItem(ACTIVE_RESTAURANT_KEY) || '';
}

export function saveActiveRestaurantId(id: string): void {
  if (id) localStorage.setItem(ACTIVE_RESTAURANT_KEY, id);
  else localStorage.removeItem(ACTIVE_RESTAURANT_KEY);
}


export function loadCommunityQueue(): PublicDishContribution[] {
  const raw = localStorage.getItem(COMMUNITY_QUEUE_KEY);
  if (!raw) return [];

  try {
    const items = JSON.parse(raw) as PublicDishContribution[];
    return Array.isArray(items)
      ? items.map(migrateContribution).filter((item): item is PublicDishContribution => Boolean(item))
      : [];
  } catch {
    return [];
  }
}

export function saveCommunityQueue(items: PublicDishContribution[]): void {
  const clean = items
    .map(migrateContribution)
    .filter((item): item is PublicDishContribution => Boolean(item))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 800);
  localStorage.setItem(COMMUNITY_QUEUE_KEY, JSON.stringify(clean));
}

export function enqueueCommunityContribution(item: PublicDishContribution): PublicDishContribution[] {
  const clean = migrateContribution(item);
  if (!clean) return loadCommunityQueue();
  const next = [
    clean,
    ...loadCommunityQueue().filter((existing) => existing.id !== clean.id && existing.normalizedDishName !== clean.normalizedDishName),
  ];
  saveCommunityQueue(next);
  return next;
}

export function updateCommunityContribution(item: PublicDishContribution): PublicDishContribution[] {
  const clean = migrateContribution(item);
  if (!clean) return loadCommunityQueue();
  const next = loadCommunityQueue().map((existing) => existing.id === clean.id ? clean : existing);
  saveCommunityQueue(next.some((existing) => existing.id === clean.id) ? next : [clean, ...next]);
  return loadCommunityQueue();
}

export function removeCommunityContribution(id: string): PublicDishContribution[] {
  const next = loadCommunityQueue().filter((item) => item.id !== id);
  saveCommunityQueue(next);
  return next;
}

export function clearCommunityQueue(): void {
  localStorage.removeItem(COMMUNITY_QUEUE_KEY);
}

export function loadCachedPublicDatabase(): PublicDatabaseExport | null {
  const raw = localStorage.getItem(PUBLIC_DB_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublicDatabaseExport;
    return parsed?.schemaVersion === 1 && Array.isArray(parsed.dishes) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCachedPublicDatabase(db: PublicDatabaseExport): void {
  localStorage.setItem(PUBLIC_DB_CACHE_KEY, JSON.stringify(db));
}

export function loadHistory(): ScanRecord[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];

  try {
    const records = JSON.parse(raw) as ScanRecord[];
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function saveScanRecord(record: ScanRecord): void {
  const records = [record, ...loadHistory()].slice(0, 80);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(records));
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function resetProfile(): UserProfile {
  const profile = cloneProfile(DEFAULT_PROFILE);
  saveProfile(profile);
  return profile;
}

export function resetAllProfiles(): UserProfile[] {
  const profiles = PROFILE_TEMPLATES.map(cloneProfile);
  saveProfiles(profiles);
  saveSettings(DEFAULT_SETTINGS);
  return profiles;
}



function migrateContribution(value: Partial<PublicDishContribution> | null | undefined): PublicDishContribution | null {
  if (!value) return null;
  const dishName = value.dishName?.trim();
  if (!dishName) return null;
  const now = new Date().toISOString();
  return {
    id: value.id || `contribution-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    kind: value.kind || 'dish-correction',
    status: value.status || 'queued',
    createdAt: value.createdAt || now,
    updatedAt: value.updatedAt || now,
    dishName,
    normalizedDishName: value.normalizedDishName || normalizeRestaurantText(dishName),
    aliases: Array.isArray(value.aliases) ? value.aliases.filter(Boolean) : [],
    restaurantName: value.restaurantName?.trim() || undefined,
    restaurantCity: value.restaurantCity?.trim() || undefined,
    restaurantAddress: value.restaurantAddress?.trim() || undefined,
    ingredientIds: Array.isArray(value.ingredientIds) ? Array.from(new Set(value.ingredientIds.filter(Boolean))) : [],
    allergenTags: Array.isArray(value.allergenTags) ? Array.from(new Set(value.allergenTags.filter(Boolean))) : [],
    dietaryTags: Array.isArray(value.dietaryTags) ? Array.from(new Set(value.dietaryTags.filter(Boolean))) : [],
    sourceType: value.sourceType || 'user-correction',
    sourceLabel: value.sourceLabel?.trim() || undefined,
    evidenceUrl: value.evidenceUrl?.trim() || undefined,
    notes: value.notes?.trim() || undefined,
    trustScore: Number.isFinite(value.trustScore) ? Math.max(0, Math.min(100, Number(value.trustScore))) : 45,
    appVersion: value.appVersion || '1.1.0',
    contributorAlias: value.contributorAlias?.trim() || undefined,
    moderationNotes: value.moderationNotes?.trim() || undefined,
    lastSyncError: value.lastSyncError?.trim() || undefined,
  };
}

function migrateRestaurant(value: Partial<RestaurantMemory> | null | undefined): RestaurantMemory | null {
  if (!value) return null;
  const name = value.name?.trim();
  if (!name) return null;
  const normalizedName = value.normalizedName || normalizeRestaurantText(name);
  if (!normalizedName) return null;
  return {
    id: value.id || `restaurant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    normalizedName,
    address: value.address?.trim() || undefined,
    city: value.city?.trim() || undefined,
    notes: value.notes?.trim() || undefined,
    updatedAt: value.updatedAt || new Date().toISOString(),
    favorite: Boolean(value.favorite),
    visitCount: Number.isFinite(Number(value.visitCount)) ? Math.max(0, Math.round(Number(value.visitCount))) : 0,
    lastUsedAt: value.lastUsedAt?.trim() || undefined,
  };
}

function normalizeRestaurantText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function migrateProfile(profile: UserProfile): UserProfile {
  return {
    ...cloneProfile(DEFAULT_PROFILE),
    ...profile,
    id: profile.id ?? `profile-${Math.random().toString(16).slice(2)}`,
    rules: Array.isArray(profile.rules) ? profile.rules : [],
    allergens: Array.isArray(profile.allergens) ? profile.allergens : [],
    intolerances: Array.isArray(profile.intolerances) ? profile.intolerances : [],
    customForbiddenTerms: Array.isArray(profile.customForbiddenTerms) ? profile.customForbiddenTerms : [],
    customCautionTerms: Array.isArray(profile.customCautionTerms) ? profile.customCautionTerms : [],
    enabled: profile.enabled ?? true,
  };
}
