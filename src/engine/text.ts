export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9€.,:;\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function includesAny(text: string, terms: string[]): string[] {
  const normalized = normalizeText(text);
  return terms.filter((term) => normalized.includes(normalizeText(term)));
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

export function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
