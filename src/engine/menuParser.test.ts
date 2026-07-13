import { describe, expect, it } from 'vitest';
import { parseMenuText } from './menuParser';

describe('menuParser', () => {
  it('retire le séparateur placé avant le prix', () => {
    const [item] = parseMenuText('Cheesecake spéculoos - 4,90€');

    expect(item.rawName).toBe('Cheesecake spéculoos');
    expect(item.price).toBe('4.90€');
  });

  it('corrige les sections évidentes après une section précédente', () => {
    const items = parseMenuText('Tacos\nTacos poulet - 10€\nFrites maison - 3,50€\nCheesecake spéculoos - 4,90€');

    expect(items.map((item) => [item.rawName, item.section])).toEqual([
      ['Tacos poulet', 'Tacos'],
      ['Frites maison', 'Accompagnements'],
      ['Cheesecake spéculoos', 'Desserts'],
    ]);
  });
});
