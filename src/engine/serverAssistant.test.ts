import { describe, expect, it } from 'vitest';
import type { SafeOrderPlan } from '../types';
import { buildServerAssistant, summarizeServerAnswers } from './serverAssistant';

const basePlan: SafeOrderPlan = {
  mode: 'single',
  generatedAt: '2026-07-09T12:00:00.000Z',
  restaurantName: 'Test Resto',
  activeProfileName: 'Halal lactose',
  profileNames: ['Halal lactose'],
  totalItems: 2,
  bestChoices: [],
  conditionalChoices: [
    {
      itemId: 'tacos',
      itemName: 'Tacos poulet fromage',
      status: 'caution',
      confidence: 'probable',
      score: 48,
      action: 'order_with_changes',
      audienceLabel: 'Halal lactose',
      subtitle: 'possible avec demande',
      reasons: ['halal à confirmer', 'lactose possible'],
      blockers: [],
      modifications: [
        { label: 'Demander sans fromage, crème, beurre ni sauce lactée.', reason: 'lait/lactose', priority: 'required' },
        { label: 'Demander viande/bouillon/gélatine certifiés halal.', reason: 'halal non confirmé', priority: 'required' },
      ],
      questions: ['La viande est-elle certifiée halal ?', 'La sauce contient-elle du lait ?'],
      profileBreakdown: [{ profileName: 'Halal lactose', status: 'caution', score: 48 }],
    },
  ],
  avoidChoices: [],
  unknownChoices: [],
  questions: ['La viande est-elle certifiée halal ?', 'La sauce contient-elle du lait ?'],
  modifications: [],
  safetyWarnings: ['Vérifier les allergènes.'],
  serverScript: '',
  shortText: '',
};

describe('serverAssistant', () => {
  it('génère un script serveur multilingue basé sur les questions du plan', () => {
    const assistant = buildServerAssistant(basePlan, { tone: 'polite', language: 'en', urgency: 'religious' });

    expect(assistant.mainScript.fullText).toContain('Hello');
    expect(assistant.questions.some((question) => question.category === 'halal')).toBe(true);
    expect(assistant.questions.some((question) => question.text.includes('halal'))).toBe(true);
  });

  it('réanalyse les réponses serveur et bloque si un risque est confirmé', () => {
    const assistant = buildServerAssistant(basePlan, { tone: 'polite', language: 'fr', urgency: 'standard' });
    const firstQuestion = assistant.questions[0];
    const summary = summarizeServerAnswers(assistant.questions, { [firstQuestion.id]: 'confirmed_risk' });

    expect(summary.provisionalStatus).toBe('blocked');
    expect(summary.riskQuestions.length).toBe(1);
    expect(summary.verdict).toContain('ne commande pas');
  });

  it('consolide les questions répétées par type de risque', () => {
    const duplicatedPlan: SafeOrderPlan = {
      ...basePlan,
      conditionalChoices: [
        basePlan.conditionalChoices[0],
        { ...basePlan.conditionalChoices[0], itemId: 'tacos-2', itemName: 'Tacos poulet 2' },
      ],
      questions: [
        'La viande est-elle certifiée halal ?',
        'La viande est-elle certifiée halal ?',
        'La sauce contient-elle du lait ?',
      ],
    };

    const assistant = buildServerAssistant(duplicatedPlan, { tone: 'polite', language: 'fr', urgency: 'standard' });
    const categories = assistant.questions.map((question) => question.category);

    expect(assistant.questions.length).toBeLessThanOrEqual(5);
    expect(new Set(categories).size).toBe(categories.length);
  });
});
