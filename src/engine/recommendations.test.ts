import { describe, expect, it } from 'vitest';
import type { AnalysisResult, GroupAnalysisRow, UserProfile } from '../types';
import { buildGroupSuggestions, buildOrderPlanText, buildSingleSuggestions } from './recommendations';

const profile: UserProfile = {
  id: 'p1',
  name: 'Test profil',
  rules: [],
  allergens: [],
  intolerances: [],
  strictness: 'normal',
  customForbiddenTerms: [],
  customCautionTerms: [],
};

function result(name: string, status: AnalysisResult['status'], score: number): AnalysisResult {
  return {
    menuItem: { id: name, rawName: name, normalizedName: name.toLowerCase() },
    status,
    confidence: 'probable',
    matchedDish: { matchedBy: 'manual', confidence: 'probable', ingredients: [], missingTerms: [] },
    reasons: [{ severity: status === 'blocked' ? 'danger' : 'info', message: `${name} ${status}` }],
    safeFor: status === 'safe' ? ['Test profil'] : [],
    askServerQuestions: status === 'caution' ? [`Question ${name}`] : [],
    score,
  };
}

describe('recommendations', () => {
  it('puts safe dishes before caution and blocked dishes', () => {
    const suggestions = buildSingleSuggestions([
      result('Pizza jambon', 'blocked', 8),
      result('Falafel', 'safe', 96),
      result('Burger veggie', 'caution', 58),
    ]);

    expect(suggestions.map((item) => item.itemName)).toEqual(['Falafel', 'Burger veggie', 'Pizza jambon']);
  });

  it('ranks group rows by safe count and status', () => {
    const rows: GroupAnalysisRow[] = [
      { menuItem: { id: 'a', rawName: 'A', normalizedName: 'a' }, results: [result('A1', 'blocked', 8), result('A2', 'blocked', 8)], aggregateStatus: 'blocked', safeCount: 0, cautionCount: 0, blockedCount: 2, unknownCount: 0, bestProfiles: [] },
      { menuItem: { id: 'b', rawName: 'B', normalizedName: 'b' }, results: [result('B1', 'safe', 96), result('B2', 'caution', 58)], aggregateStatus: 'safe', safeCount: 1, cautionCount: 1, blockedCount: 0, unknownCount: 0, bestProfiles: ['Test profil'] },
    ];

    expect(buildGroupSuggestions(rows)[0].itemName).toBe('B');
  });

  it('builds a copyable order plan', () => {
    const plan = buildOrderPlanText({
      id: 'scan-1',
      createdAt: new Date('2026-07-09T08:00:00Z').toISOString(),
      source: 'manual',
      rawText: 'Falafel',
      profile,
      results: [result('Falafel', 'safe', 96), result('Burger veggie', 'caution', 58)],
    });

    expect(plan).toContain('Can I Eat It — plan de commande');
    expect(plan).toContain('Falafel');
    expect(plan).toContain('Question Burger veggie');
  });
});
