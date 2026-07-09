import { describe, expect, it } from 'vitest';
import { parseMenuText } from './menuParser';
import { analyzeMenuItems } from './compatibility';
import type { UserProfile } from '../types';

const halalVegetarian: UserProfile = {
  id: 'test-halal-veg',
  name: 'Test halal veg',
  rules: ['vegetarian', 'halal', 'no_alcohol', 'low_lactose'],
  allergens: [],
  intolerances: ['milk'],
  strictness: 'normal',
  customForbiddenTerms: [],
  customCautionTerms: [],
};

const peanutAllergy: UserProfile = {
  id: 'test-peanut',
  name: 'Test peanut',
  rules: [],
  allergens: ['peanuts'],
  intolerances: [],
  strictness: 'strict',
  customForbiddenTerms: [],
  customCautionTerms: [],
};

describe('menu compatibility engine', () => {
  it('blocks pork for a halal vegetarian profile', () => {
    const items = parseMenuText('Pizza Reine jambon champignons 13€');
    const [result] = analyzeMenuItems(items, halalVegetarian);
    expect(result.status).toBe('blocked');
    expect(result.reasons.some((reason) => reason.message.toLowerCase().includes('porc'))).toBe(true);
  });

  it('flags dairy for lactose intolerance', () => {
    const items = parseMenuText('Tacos poulet sauce fromagère - 10,50€');
    const [result] = analyzeMenuItems(items, halalVegetarian);
    expect(['blocked', 'caution']).toContain(result.status);
    expect(result.reasons.some((reason) => reason.message.toLowerCase().includes('lactose'))).toBe(true);
  });

  it('blocks peanut allergy in pad thai', () => {
    const items = parseMenuText('Pad thaï tofu cacahuètes - 12€');
    const [result] = analyzeMenuItems(items, peanutAllergy);
    expect(result.status).toBe('blocked');
    expect(result.askServerQuestions.join(' ')).toContain('arachides');
  });
});
