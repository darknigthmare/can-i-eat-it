import type { MenuItem, OcrAdvancedReport, OcrQualityIssue, OcrSectionSummary } from '../types';
import { normalizeText, titleCase } from './text';

const PRICE_FRAGMENT_REGEX = /(?:\d{1,3}\s*[,.]\s*\d{1,2}|\d{1,3})\s*(?:€|euro?s?|eur|e|£|\$)/gi;
const SECTION_HINTS = [
  'entree', 'entrees', 'starter', 'starters', 'aperitif', 'tapas', 'salade', 'salades',
  'plat', 'plats', 'specialite', 'specialites', 'burger', 'burgers', 'tacos', 'sandwich', 'sandwichs',
  'pizza', 'pizzas', 'pate', 'pates', 'pasta', 'risotto', 'viande', 'viandes', 'grillade', 'grillades',
  'poisson', 'poissons', 'seafood', 'bowl', 'bowls', 'menu', 'menus', 'formule', 'formules',
  'accompagnement', 'accompagnements', 'dessert', 'desserts', 'boisson', 'boissons', 'drink', 'drinks',
];
const SECTION_REGEX = new RegExp(`^(?:(?:nos|les|our)\\s+)?(?:${SECTION_HINTS.join('|')})$`, 'i');

const OCR_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\b([0-9]{1,3})\s*[,.]\s*([0-9]{2})\s*(?:e|E|eur|euros?)\b/g, '$1,$2€'],
  [/\b([0-9]{1,3})\s*[,.]\s*([0-9]{2})\s*[€£$]?/g, '$1,$2€'],
  [/\b([0-9]{1,3})\s*[oO]\s*([0-9]{2})\s*€/g, '$1,0$2€'],
  [/\b([0-9]{1,3})\s*€\s*([0-9]{2})\b/g, '$1,$2€'],
  [/\bEur\b/gi, '€'],
  [/\bEUROS?\b/gi, '€'],
  [/\bfromagee\b/gi, 'fromage'],
  [/\bcreme\b/gi, 'crème'],
  [/\bboeuf\b/gi, 'bœuf'],
  [/\bpou1et\b/gi, 'poulet'],
  [/\bjarnbon\b/gi, 'jambon'],
  [/\bsauoe\b/gi, 'sauce'],
  [/\bsaum0n\b/gi, 'saumon'],
  [/\bvegetarien\b/gi, 'végétarien'],
  [/\bvegan\b/gi, 'vegan'],
  [/\ballergenes\b/gi, 'allergènes'],
  [/\s+([,.;:!?€])/g, '$1'],
  [/([€])(?=\S)/g, '$1 '],
  [/\s{3,}/g, '  '],
];

export function autoCorrectOcrMenuText(text: string): string {
  let next = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\r/g, '\n');
  for (const [pattern, replacement] of OCR_REPLACEMENTS) {
    next = next.replace(pattern, replacement);
  }

  next = splitJoinedMenuLines(next)
    .split('\n')
    .map((line) => line.replace(/[|¦]+/g, ' ').replace(/\.{3,}/g, ' ').replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return restoreLikelySectionCase(next);
}

export function splitJoinedMenuLines(text: string): string {
  return text
    .replace(/(\d{1,3}\s*[,.]\s*\d{1,2}\s*€)\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ][A-Za-zÀ-ÿ'’ -]{2,})/g, '$1\n')
    .replace(/(\d{1,3}\s*€)\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ][A-Za-zÀ-ÿ'’ -]{2,})/g, '$1\n')
    .replace(/([a-zà-ÿ])\s{4,}(?=[A-ZÉÈÀÂÊÎÔÛÇ][A-Za-zÀ-ÿ'’ -]{2,})/g, '$1\n')
    .replace(/(\b(?:ENTR[ÉE]ES?|PLATS?|DESSERTS?|BOISSONS?|BURGERS?|TACOS|PIZZAS?|SALADES?)\b)\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ])/g, '$1\n');
}

export function buildOcrAdvancedReport(text: string, menuItems: MenuItem[] = [], imageName?: string): OcrAdvancedReport {
  const corrected = autoCorrectOcrMenuText(text);
  const rawLines = text.replace(/\r/g, '\n').split('\n');
  const lines = rawLines.map((line) => line.trim()).filter(Boolean);
  const correctedLines = corrected.split('\n').map((line) => line.trim()).filter(Boolean);
  const priceCount = countMatches(corrected, PRICE_FRAGMENT_REGEX);
  const sections = buildSectionSummary(correctedLines, menuItems);
  const suspectedColumns = estimateColumnCount(lines);
  const issues = buildQualityIssues(lines, correctedLines, menuItems, priceCount, suspectedColumns);
  const usableLineCount = correctedLines.filter((line) => isUsableMenuLine(line)).length;
  const averageLineLength = lines.length ? Math.round(lines.join('').length / lines.length) : 0;
  const qualityScore = computeQualityScore({
    lineCount: lines.length,
    usableLineCount,
    priceCount,
    sectionCount: sections.length,
    suspectedColumns,
    itemCount: menuItems.length,
    issues,
  });

  return {
    generatedAt: new Date().toISOString(),
    sourceName: imageName,
    lineCount: lines.length,
    usableLineCount,
    priceCount,
    sectionCount: sections.length,
    suspectedColumns,
    menuItemsDetected: menuItems.length,
    averageLineLength,
    qualityScore,
    issues,
    sections,
    correctedTextPreview: corrected,
  };
}

export function buildOcrZoneDraft(text: string, report?: OcrAdvancedReport | null): string {
  const corrected = autoCorrectOcrMenuText(text);
  const lines = corrected.split('\n').map((line) => line.trim()).filter(Boolean);
  const flagged = new Set((report?.issues ?? []).map((issue) => issue.lineNumber).filter((lineNumber): lineNumber is number => typeof lineNumber === 'number'));
  const zoneLines: string[] = [];

  lines.forEach((line, index) => {
    const oneBased = index + 1;
    const hasPrice = PRICE_FRAGMENT_REGEX.test(line);
    PRICE_FRAGMENT_REGEX.lastIndex = 0;
    if (flagged.has(oneBased) || hasPrice || looksLikeSection(line) || line.length > 42) {
      zoneLines.push(line);
    }
  });

  return dedupeLines(zoneLines).slice(0, 30).join('\n') || corrected;
}

export function mergeZoneIntoMenuText(originalText: string, zoneText: string): string {
  const existing = new Set(originalText.split('\n').map((line) => normalizeText(line)).filter(Boolean));
  const additions = zoneText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !existing.has(normalizeText(line)));
  if (!additions.length) return originalText.trim();
  return `${originalText.trim()}\n\n# Zone corrigée\n${additions.join('\n')}`.trim();
}

export function summarizeOcrReport(report: OcrAdvancedReport | null): string {
  if (!report) return 'Aucun diagnostic OCR généré.';
  const quality = report.qualityScore >= 80 ? 'bon' : report.qualityScore >= 55 ? 'moyen' : 'faible';
  return `Qualité ${quality} (${report.qualityScore}/100) · ${report.menuItemsDetected} plat(s) · ${report.priceCount} prix · ${report.sectionCount} section(s) · ${report.suspectedColumns} colonne(s) probable(s)`;
}

function buildQualityIssues(
  lines: string[],
  correctedLines: string[],
  menuItems: MenuItem[],
  priceCount: number,
  suspectedColumns: number,
): OcrQualityIssue[] {
  const issues: OcrQualityIssue[] = [];

  if (lines.length < 3) {
    issues.push({ severity: 'blocker', code: 'too_few_lines', message: 'Très peu de lignes détectées : photo trop floue, trop sombre ou menu trop petit.' });
  }
  if (menuItems.length === 0) {
    issues.push({ severity: 'blocker', code: 'no_items', message: 'Aucun plat exploitable détecté après parsing.' });
  }
  if (priceCount === 0 && menuItems.length > 3) {
    issues.push({ severity: 'warning', code: 'no_prices', message: 'Aucun prix détecté : l’OCR a peut-être perdu la colonne des prix.' });
  }
  if (suspectedColumns > 1) {
    issues.push({ severity: 'info', code: 'multi_column', message: `Menu probablement multi-colonnes (${suspectedColumns}). Vérifie que les plats et prix ne sont pas mélangés.` });
  }

  correctedLines.forEach((line, index) => {
    const normalized = normalizeText(line);
    const hasManySymbols = (line.match(/[{}[\]_=~<>]/g) ?? []).length >= 2;
    const hasSuspiciousDigits = /[a-zà-ÿ][0-9][a-zà-ÿ]/i.test(line);
    const tooLongWithPrices = countMatches(line, PRICE_FRAGMENT_REGEX) >= 2;
    const likelyAllergenFooter = /allergen|allergene|gluten|lactose|traces/i.test(normalized) && line.length > 60;

    if (hasManySymbols) {
      issues.push({ severity: 'warning', code: 'symbols_noise', lineNumber: index + 1, lineText: line, message: 'Ligne avec symboles parasites : probable bruit OCR.', suggestion: line.replace(/[{}[\]_=~<>]/g, ' ') });
    }
    if (hasSuspiciousDigits) {
      issues.push({ severity: 'warning', code: 'digit_inside_word', lineNumber: index + 1, lineText: line, message: 'Chiffre au milieu d’un mot : erreur OCR probable.', suggestion: line.replace(/0/g, 'o').replace(/1/g, 'l') });
    }
    if (tooLongWithPrices) {
      issues.push({ severity: 'warning', code: 'joined_items', lineNumber: index + 1, lineText: line, message: 'Plusieurs prix dans la même ligne : plusieurs plats sont probablement collés.', suggestion: splitJoinedMenuLines(line) });
    }
    if (likelyAllergenFooter) {
      issues.push({ severity: 'info', code: 'allergen_footer', lineNumber: index + 1, lineText: line, message: 'Ligne informative allergènes détectée : utile mais à ne pas confondre avec un plat.' });
    }
  });

  return issues.slice(0, 18);
}

function buildSectionSummary(lines: string[], menuItems: MenuItem[]): OcrSectionSummary[] {
  const boundaries: Array<{ title: string; index: number }> = [];
  lines.forEach((line, index) => {
    if (looksLikeSection(line)) {
      boundaries.push({ title: titleCase(normalizeText(line)), index });
    }
  });

  const summaries: OcrSectionSummary[] = [];
  if (!boundaries.length || boundaries[0].index > 0) {
    summaries.push({
      title: 'Menu',
      lineStart: 1,
      lineEnd: boundaries[0]?.index ?? lines.length,
      itemCount: 0,
    });
  }
  boundaries.forEach((boundary, index) => {
    summaries.push({
      title: boundary.title,
      lineStart: boundary.index + 1,
      lineEnd: boundaries[index + 1]?.index ?? lines.length,
      itemCount: 0,
    });
  });

  const usedLineIndexes = new Set<number>();
  for (const item of menuItems) {
    const itemName = normalizeText(item.rawName);
    const lineIndex = lines.findIndex((line, index) => (
      !usedLineIndexes.has(index)
      && !looksLikeSection(line)
      && normalizeText(line).includes(itemName)
    ));
    const oneBasedLine = lineIndex + 1;
    const rangeMatch = lineIndex >= 0
      ? summaries.find((summary) => oneBasedLine >= summary.lineStart && oneBasedLine <= summary.lineEnd)
      : undefined;
    const sectionMatch = summaries.find((summary) => normalizeText(summary.title) === normalizeText(item.section || 'Menu'));
    const found = rangeMatch ?? sectionMatch;
    if (found) {
      found.itemCount += 1;
      if (lineIndex >= 0) usedLineIndexes.add(lineIndex);
    }
  }
  return summaries.filter((summary) => summary.itemCount > 0 || summary.lineEnd >= summary.lineStart).slice(0, 16);
}

function estimateColumnCount(lines: string[]): number {
  const priceRichLines = lines.filter((line) => {
    const count = countMatches(line, PRICE_FRAGMENT_REGEX);
    return count >= 2 || /\S\s{8,}\S/.test(line);
  }).length;
  if (priceRichLines >= 4) return 3;
  if (priceRichLines >= 2) return 2;
  return 1;
}

function computeQualityScore(input: {
  lineCount: number;
  usableLineCount: number;
  priceCount: number;
  sectionCount: number;
  suspectedColumns: number;
  itemCount: number;
  issues: OcrQualityIssue[];
}): number {
  let score = 45;
  score += Math.min(25, input.itemCount * 3);
  score += Math.min(12, input.priceCount * 2);
  score += Math.min(8, input.sectionCount * 2);
  score += Math.min(8, input.usableLineCount);
  if (input.suspectedColumns > 1) score -= 4;
  for (const issue of input.issues) {
    score -= issue.severity === 'blocker' ? 18 : issue.severity === 'warning' ? 7 : 2;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function isUsableMenuLine(line: string): boolean {
  const normalized = normalizeText(line);
  if (normalized.length < 3) return false;
  if (/^(menu|carte|prix|allergenes?|service)$/.test(normalized)) return false;
  return /[a-zà-ÿ]/i.test(normalized);
}

function looksLikeSection(line: string): boolean {
  const normalized = normalizeText(line).replace(/[^a-z0-9 ]/g, '').trim();
  if (!normalized || normalized.length > 34) return false;
  return SECTION_REGEX.test(normalized);
}

function restoreLikelySectionCase(text: string): string {
  return text
    .split('\n')
    .map((line) => looksLikeSection(line) ? titleCase(normalizeText(line)) : line)
    .join('\n');
}

function countMatches(value: string, regex: RegExp): number {
  regex.lastIndex = 0;
  const matches = value.match(regex);
  regex.lastIndex = 0;
  return matches?.length ?? 0;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = normalizeText(line);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
