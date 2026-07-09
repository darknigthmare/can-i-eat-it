import { describe, expect, it } from 'vitest';
import { INGREDIENTS } from '../data/ingredients';
import type { AnalysisResult, UserProfile } from '../types';
import { buildSafeOrderPlan } from './safeOrder';

const profile: UserProfile = {
  id: 'p1',
  name: 'Profil test',
  rules: ['halal', 'low_lactose'],
  allergens: [],
  intolerances: ['milk'],
  strictness: 'strict',
  customForbiddenTerms: [],
  customCautionTerms: [],
};

function ingredient(id: string) {
  const found = INGREDIENTS.find((item) => item.id === id);
  if (!found) throw new Error(`missing ingredient ${id}`);
  return found;
}

function result(name: string, status: AnalysisResult['status'], score: number, ingredientIds: string[], questions: string[] = []): AnalysisResult {
  return {
    menuItem: { id: name, rawName: name, normalizedName: name.toLowerCase() },
    status,
    confidence: status === 'unknown' ? 'unknown' : 'probable',
    matchedDish: { matchedBy: status === 'unknown' ? 'none' : 'manual', confidence: status === 'unknown' ? 'unknown' : 'probable', ingredients: ingredientIds.map(ingredient), missingTerms: [] },
    reasons: status === 'blocked'
      ? [{ severity: 'danger', message: `${name} bloqué halal/lactose` }]
      : status === 'caution'
        ? [{ severity: 'caution', message: `${name} à vérifier halal` }]
        : [{ severity: 'info', message: `${name} OK` }],
    safeFor: status === 'safe' ? [profile.name] : [],
    askServerQuestions: questions,
    score,
  };
}

describe('safeOrder', () => {
  it('sépare les choix sûrs, modifiables et à éviter', () => {
    const plan = buildSafeOrderPlan({
      mode: 'single',
      activeProfile: profile,
      enabledProfiles: [profile],
      results: [
        result('Falafel riz légumes', 'safe', 94, ['pois_chiche', 'riz', 'legumes']),
        result('Tacos poulet fromage', 'caution', 49, ['poulet', 'fromage'], ['La viande est-elle halal ?']),
        result('Pizza jambon fromage', 'blocked', 5, ['porc', 'fromage']),
      ],
      groupRows: [],
    });

    expect(plan.bestChoices.map((choice) => choice.itemName)).toEqual(['Falafel riz légumes']);
    expect(plan.conditionalChoices[0].itemName).toBe('Tacos poulet fromage');
    expect(plan.conditionalChoices[0].modifications.some((modification) => modification.label.includes('fromage'))).toBe(true);
    expect(plan.avoidChoices[0].itemName).toBe('Pizza jambon fromage');
    expect(plan.shortText).toContain('commande sûre');
    expect(plan.serverScript).toContain('Pouvez-vous');
  });
});
