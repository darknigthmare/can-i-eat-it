import type { MenuItem } from '../types';
import { normalizeText, titleCase } from './text';

const PRICE_REGEX = /(?:^|\s)(\d{1,3}(?:[,.]\d{1,2})?)\s*(?:€|£|\$|eur\b|euros?\b|euro\b)/i;
const SECTION_HINT_REGEX = /^(entr[ée]es?|starters?|tapas|plats?|sp[ée]cialit[ée]s?|burgers?|tacos|sandwichs?|menus?|desserts?|boissons?|drinks?|pizzas?|salades?|bowls?|p[âa]tes?|pasta|viandes?|grillades?|poissons?|formules?|accompagnements?|extras?)$/i;
const IGNORE_LINE_REGEX = /^(restaurant|carte|prix|service|allerg[èe]nes?|nos\s+|du\s+jour|page\s+\d+|scan|photo)$/i;

export function parseMenuText(rawText: string): MenuItem[] {
  const cleanedLines = rawText
    .replace(/\r/g, '\n')
    .replace(/([0-9]{1,3})\s*[,.]\s*([0-9]{2})\s*(?:e|eur|euros?)\b/gi, '$1,$2€')
    .split('\n')
    .flatMap((line) => splitLikelyJoinedLines(line))
    .map(cleanLine)
    .filter(Boolean);

  const items: MenuItem[] = [];
  let currentSection = '';

  for (let index = 0; index < cleanedLines.length; index += 1) {
    const line = cleanedLines[index];
    if (isSectionLine(line)) {
      currentSection = titleCase(normalizeText(line));
      continue;
    }
    if (shouldIgnore(line)) continue;

    const next = cleanedLines[index + 1];
    const parsed = parseLine(line, currentSection);

    if (!parsed && next && !isSectionLine(next) && !PRICE_REGEX.test(next) && items.length > 0) {
      const last = items[items.length - 1];
      last.description = [last.description, line].filter(Boolean).join(' · ');
      continue;
    }

    if (parsed) {
      const maybeDescription = cleanedLines[index + 1];
      if (maybeDescription && !PRICE_REGEX.test(maybeDescription) && !isSectionLine(maybeDescription) && looksLikeDescription(maybeDescription)) {
        parsed.description = [parsed.description, maybeDescription].filter(Boolean).join(' · ');
        index += 1;
      }
      items.push(parsed);
    }
  }

  return dedupeItems(items).slice(0, 80);
}

function parseLine(line: string, section?: string): MenuItem | null {
  const withoutBullets = line.replace(/^[-–—•*\d.)\s]+/, '').trim();
  if (withoutBullets.length < 3) return null;

  const priceMatch = withoutBullets.match(PRICE_REGEX);
  const price = priceMatch ? `${priceMatch[1].replace(',', '.')}€` : undefined;
  const lineWithoutPrice = priceMatch ? withoutBullets.replace(priceMatch[0], ' ').trim() : withoutBullets;

  const [namePart, ...descriptionParts] = lineWithoutPrice
    .split(/\s[-–—:]\s|\s{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const rawName = cleanDishName(namePart ?? lineWithoutPrice);
  const description = descriptionParts.join(' · ') || inferDescription(lineWithoutPrice, rawName);

  if (!rawName || rawName.length < 3) return null;
  if (shouldIgnore(rawName)) return null;
  if (!price && rawName.split(' ').length === 1 && rawName.length < 14) return null;

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    rawName,
    normalizedName: normalizeText(rawName),
    description: description || undefined,
    price,
    section,
  };
}

function cleanLine(line: string): string {
  return line
    .replace(/[|]+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDishName(value: string): string {
  return value
    .replace(/\b(x\s?\d+|\d+\s?pcs?|\d+\s?pi[eè]ces?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitLikelyJoinedLines(line: string): string[] {
  const withBreaks = line
    .replace(/(\d{1,3}[,.]\d{1,2}\s*(?:€|eur|euros?|£|\$))\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ][\wÀ-ÿ'’ -]{2,})/gi, '$1\n')
    .replace(/(\d{1,3}\s*(?:€|eur|euros?|£|\$))\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ][\wÀ-ÿ'’ -]{2,})/gi, '$1\n')
    .replace(/([a-zà-ÿ])\s{4,}(?=[A-ZÉÈÀÂÊÎÔÛÇ][\wÀ-ÿ'’ -]{2,})/g, '$1\n')
    .replace(/(\b(?:ENTR[ÉE]ES?|PLATS?|DESSERTS?|BOISSONS?|BURGERS?|TACOS|PIZZAS?|SALADES?|FORMULES?)\b)\s+(?=[A-ZÉÈÀÂÊÎÔÛÇ])/g, '$1\n');
  return withBreaks.split('\n');
}

function isSectionLine(line: string): boolean {
  const normalized = normalizeText(line);
  return SECTION_HINT_REGEX.test(normalized) && !PRICE_REGEX.test(line);
}

function shouldIgnore(line: string): boolean {
  const normalized = normalizeText(line);
  if (IGNORE_LINE_REGEX.test(normalized)) return true;
  if (/^\d+$/.test(normalized)) return true;
  if (normalized.length < 3) return true;
  return false;
}

function looksLikeDescription(line: string): boolean {
  const normalized = normalizeText(line);
  return normalized.includes('avec') || normalized.includes('sauce') || normalized.includes('servi') || normalized.includes('supplement') || normalized.includes('maison') || normalized.includes('choix') || normalized.length > 28;
}

function inferDescription(fullLine: string, name: string): string {
  const normalizedName = normalizeText(name);
  const full = normalizeText(fullLine);
  if (full === normalizedName) return '';
  const extra = full.replace(normalizedName, '').trim();
  return extra.length > 8 ? extra : '';
}

function dedupeItems(items: MenuItem[]): MenuItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.normalizedName}-${item.price ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
