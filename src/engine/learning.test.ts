import { describe, expect, it } from 'vitest';
import { getIngredientById, getIngredientRiskLevel, searchIngredients } from './learning';

describe('guided learning ingredient search', () => {
  it('finds common risky ingredients by name', () => {
    expect(searchIngredients('porc').some((ingredient) => ingredient.id === 'porc')).toBe(true);
    expect(searchIngredients('fromage').some((ingredient) => ingredient.id === 'fromage')).toBe(true);
    expect(searchIngredients('gluten').some((ingredient) => ingredient.id === 'gluten_ble')).toBe(true);
  });

  it('classifies high risk ingredients for the guided chips', () => {
    const pork = getIngredientById('porc');
    const cheese = getIngredientById('fromage');
    const rice = getIngredientById('riz');

    expect(pork && getIngredientRiskLevel(pork)).toBe('danger');
    expect(cheese && getIngredientRiskLevel(cheese)).toBe('caution');
    expect(rice && getIngredientRiskLevel(rice)).toBe('info');
  });
});
