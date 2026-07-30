import { describe, expect, it } from 'vitest';
import { autoCorrectOcrMenuText, buildOcrAdvancedReport, buildOcrZoneDraft, mergeZoneIntoMenuText } from './advancedOcr';
import { parseMenuText } from './menuParser';

describe('advanced OCR helpers', () => {
  it('splits joined menu lines after prices', () => {
    const raw = 'Burgers\nBurger poulet sauce maison 12,90e Pizza reine jambon fromage 11,50e';
    const corrected = autoCorrectOcrMenuText(raw);
    expect(corrected).toContain('12,90€');
    expect(corrected).toMatch(/\nPizza reine/i);
    const items = parseMenuText(corrected);
    expect(items.map((item) => item.normalizedName)).toContain('burger poulet sauce maison');
    expect(items.map((item) => item.normalizedName)).toContain('pizza reine jambon fromage');
  });

  it('builds a quality report with sections, prices and possible columns', () => {
    const text = autoCorrectOcrMenuText('ENTREES\nFalafel sauce tahini 6,50e\nPLATS\nTacos poulet sauce fromagere 10,90e Burger bacon cheddar 12,90e');
    const items = parseMenuText(text);
    const report = buildOcrAdvancedReport(text, items, 'menu.jpg');
    expect(report.menuItemsDetected).toBeGreaterThanOrEqual(3);
    expect(report.priceCount).toBeGreaterThanOrEqual(3);
    expect(report.sectionCount).toBeGreaterThanOrEqual(2);
    expect(report.qualityScore).toBeGreaterThan(40);
  });

  it('does not treat dish names as section headings', () => {
    const text = 'Burgers\nBurger boeuf cheddar 9,90€\nBurger vegan crispy 9,40€\nTacos\nTacos poulet 10,50€';
    const report = buildOcrAdvancedReport(text, parseMenuText(text));
    expect(report.sectionCount).toBe(2);
    expect(report.sections.map((section) => section.title)).toEqual(['Burgers', 'Tacos']);
    expect(report.sections.map((section) => section.itemCount)).toEqual([2, 1]);
    expect(report.sections.every((section) => section.lineEnd >= section.lineStart)).toBe(true);
  });

  it('creates and merges a zone draft without duplicating existing lines', () => {
    const text = 'Pizzas\nPizza reine 11,50€';
    const report = buildOcrAdvancedReport(text, parseMenuText(text));
    const zone = buildOcrZoneDraft(text, report);
    const merged = mergeZoneIntoMenuText(text, `${zone}\nTiramisu maison 5,50€`);
    expect(merged).toContain('Tiramisu maison');
    expect(merged.match(/Pizza reine/g)?.length).toBe(1);
  });
});
