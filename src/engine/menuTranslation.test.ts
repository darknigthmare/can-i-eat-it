import { describe, expect, it } from 'vitest';
import { analyzeMenuItems } from './compatibility';
import { buildMenuTranslationReport, applyMenuTranslationToText } from './menuTranslation';
import { parseMenuText } from './menuParser';
import { DEFAULT_PROFILE } from '../data/rules';
import type { AllergenId, RuleId, UserProfile } from '../types';

const halalVegetarianProfile: UserProfile = {
  ...DEFAULT_PROFILE,
  name: 'Test halal végétarien lactose',
  rules: ['vegetarian', 'halal', 'no_pork', 'no_alcohol', 'low_lactose'] as RuleId[],
  intolerances: ['milk'] as AllergenId[],
  allergens: [] as AllergenId[],
  strictness: 'strict',
};

describe('menu translation engine', () => {
  it('detects and enriches an Italian menu with risky ingredients', () => {
    const report = buildMenuTranslationReport('Primi\nCarbonara guanciale pecorino 13,90€\nRisotto funghi vino bianco 15,50€', 'auto');
    expect(report.detectedLanguage).toBe('it');
    expect(report.translatedText).toContain('porc');
    expect(report.translatedText).toContain('fromage');
    expect(report.analysisText).toContain('alcool');
    expect(report.dangerousIngredientIds).toContain('porc');
  });

  it('makes translated foreign menu text usable by the compatibility engine', () => {
    const report = buildMenuTranslationReport('Pizza prosciutto mozzarella 11,50€\nChicken curry cream 12,90€', 'auto');
    const translatedForAnalysis = applyMenuTranslationToText(report);
    const items = parseMenuText(translatedForAnalysis);
    const results = analyzeMenuItems(items, halalVegetarianProfile);
    expect(results.length).toBe(2);
    expect(results.some((result) => result.status === 'blocked')).toBe(true);
    expect(results.flatMap((result) => result.reasons.map((reason) => reason.message)).join(' ')).toMatch(/porc|lait|lactose|viande/i);
  });

  it('keeps unknown lines visible instead of pretending a translation is certain', () => {
    const report = buildMenuTranslationReport('Chef Special XQZ 14,00€', 'auto');
    expect(report.unknownLines).toContain('Chef Special XQZ 14,00€');
    expect(report.warnings.join(' ')).toMatch(/inconnue|Aucun terme/i);
  });
});
