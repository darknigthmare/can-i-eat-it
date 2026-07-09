import { describe, expect, it } from 'vitest';
import { PROFILE_TEMPLATES, cloneProfile } from '../data/profiles';
import type { LearnedDish, PublicDatabaseExport, RestaurantMemory } from '../types';
import { buildKnownMenuText, buildKnownRestaurantDishes, searchRestaurantInsights } from './restaurantIntelligence';

const profile = cloneProfile(PROFILE_TEMPLATES[0]);
const restaurant: RestaurantMemory = {
  id: 'r1',
  name: 'Tacos Test',
  normalizedName: 'tacos test',
  city: 'Aubagne',
  updatedAt: '2026-07-09T08:00:00.000Z',
  favorite: true,
  visitCount: 2,
};

const learned: LearnedDish = {
  id: 'l1',
  name: 'Tacos falafel',
  normalizedName: 'tacos falafel',
  aliases: [],
  restaurantName: 'Tacos Test',
  ingredientIds: ['pois_chiche', 'legumes', 'sauce_maison'],
  confidence: 'confirmed',
  notes: 'Correction test',
  source: 'manual-correction',
  updatedAt: '2026-07-09T08:00:00.000Z',
  useCount: 1,
};

const publicDb: PublicDatabaseExport = {
  schemaVersion: 1,
  exportedAt: '2026-07-09T08:00:00.000Z',
  generatedBy: 'test',
  stats: { contributions: 1, restaurants: 1, trusted: 1, verified: 0, pending: 0 },
  restaurants: [{ name: 'Tacos Test', normalizedName: 'tacos test aubagne', city: 'Aubagne', dishCount: 1, updatedAt: '2026-07-09T08:00:00.000Z' }],
  dishes: [{
    id: 'p1',
    kind: 'dish-correction',
    status: 'trusted',
    createdAt: '2026-07-09T08:00:00.000Z',
    updatedAt: '2026-07-09T08:00:00.000Z',
    dishName: 'Bowl poulet',
    normalizedDishName: 'bowl poulet',
    aliases: [],
    restaurantName: 'Tacos Test',
    restaurantCity: 'Aubagne',
    ingredientIds: ['poulet', 'riz', 'legumes', 'certification_halal'],
    allergenTags: [],
    dietaryTags: [],
    sourceType: 'restaurant-confirmation',
    trustScore: 88,
    appVersion: '1.1.0',
  }],
};

describe('restaurantIntelligence', () => {
  it('regroupe les plats connus locaux et publics pour un restaurant', () => {
    const dishes = buildKnownRestaurantDishes(restaurant, [learned], publicDb, []);
    expect(dishes.map((dish) => dish.name)).toContain('Tacos falafel');
    expect(dishes.map((dish) => dish.name)).toContain('Bowl poulet');
    expect(buildKnownMenuText(dishes)).toContain('Tacos falafel');
  });

  it('score et filtre les restaurants selon recherche, favoris et compatibilité', () => {
    const insights = searchRestaurantInsights({
      query: 'tacos',
      city: 'aubagne',
      onlyFavorites: true,
      sortBy: 'smart',
      mode: 'single',
      activeProfile: profile,
      enabledProfiles: [profile],
      localRestaurants: [restaurant],
      learnedDishes: [learned],
      publicDb,
    });
    expect(insights).toHaveLength(1);
    expect(insights[0].restaurant.name).toBe('Tacos Test');
    expect(insights[0].knownDishes.length).toBeGreaterThanOrEqual(2);
    expect(insights[0].score).toBeGreaterThan(40);
  });
});
