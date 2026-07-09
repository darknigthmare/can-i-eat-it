import { describe, expect, it } from 'vitest';
import { buildModerationReviews, buildPublicDatabaseExport, contributionIsImportable, contributionToLearnedDish, findContributionDuplicateClusters, isContributionShareable, makeContributionFromLearnedDish, mergeContributionCluster } from './community';
import type { LearnedDish } from '../types';

const learnedDish: LearnedDish = {
  id: 'learned-1',
  name: 'Burger savoyard',
  normalizedName: 'burger savoyard',
  aliases: ['burger fromage lardons'],
  restaurantName: 'Test Food',
  ingredientIds: ['gluten_ble', 'boeuf', 'fromage', 'porc'],
  confidence: 'confirmed',
  notes: 'Composition confirmée par le menu.',
  source: 'manual-correction',
  updatedAt: '2026-07-09T08:00:00.000Z',
  useCount: 1,
};

describe('community database', () => {
  it('builds a shareable public contribution from a learned dish', () => {
    const contribution = makeContributionFromLearnedDish(learnedDish);
    expect(contribution.dishName).toBe('Burger savoyard');
    expect(contribution.restaurantName).toBe('Test Food');
    expect(contribution.status).toBe('queued');
    expect(contribution.ingredientIds).toContain('porc');
    expect(isContributionShareable(contribution)).toBe(true);
  });

  it('exports a public database without private profile data', () => {
    const contribution = makeContributionFromLearnedDish(learnedDish);
    const exportDb = buildPublicDatabaseExport([{ ...contribution, status: 'community_verified' }]);
    expect(exportDb.schemaVersion).toBe(1);
    expect(exportDb.stats.contributions).toBe(1);
    expect(JSON.stringify(exportDb)).not.toContain('allergies personnelles');
    expect(JSON.stringify(exportDb)).not.toContain('profile');
  });

  it('converts importable public contribution to learned dish', () => {
    const contribution = { ...makeContributionFromLearnedDish(learnedDish), status: 'trusted' as const };
    expect(contributionIsImportable(contribution)).toBe(true);
    const learned = contributionToLearnedDish(contribution);
    expect(learned.source).toBe('import');
    expect(learned.ingredientIds).toContain('fromage');
  });


  it('flags low quality contributions before publication', () => {
    const contribution = makeContributionFromLearnedDish({ ...learnedDish, ingredientIds: [] });
    const [review] = buildModerationReviews([contribution]);
    expect(review.issues.some((issue) => issue.severity === 'blocker')).toBe(true);
    expect(review.recommendedStatus).toBe('rejected');
  });

  it('groups and merges duplicate contributions', () => {
    const first = { ...makeContributionFromLearnedDish(learnedDish), id: 'dup-1', status: 'pending_review' as const, trustScore: 60 };
    const second = { ...makeContributionFromLearnedDish({ ...learnedDish, ingredientIds: ['gluten_ble', 'boeuf', 'fromage', 'porc', 'sauce_maison'] }), id: 'dup-2', status: 'community_verified' as const, trustScore: 72 };
    const [cluster] = findContributionDuplicateClusters([first, second]);
    expect(cluster.items).toHaveLength(2);
    const merged = mergeContributionCluster(cluster);
    expect(merged.status).toBe('community_verified');
    expect(merged.ingredientIds).toContain('sauce_maison');
  });
});
