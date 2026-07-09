import type { AnalysisResult, DecisionStatus, GroupAnalysisRow, OrderSuggestion, RestaurantMemory, ScanRecord } from '../types';

const STATUS_RANK: Record<DecisionStatus, number> = {
  safe: 0,
  caution: 1,
  unknown: 2,
  blocked: 3,
};

export function rankSingleResults(results: AnalysisResult[]): AnalysisResult[] {
  return [...results].sort((a, b) => {
    const statusDelta = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (statusDelta !== 0) return statusDelta;
    return b.score - a.score || a.menuItem.rawName.localeCompare(b.menuItem.rawName, 'fr');
  });
}

export function rankGroupRows(rows: GroupAnalysisRow[]): GroupAnalysisRow[] {
  return [...rows].sort((a, b) => {
    const statusDelta = STATUS_RANK[a.aggregateStatus] - STATUS_RANK[b.aggregateStatus];
    if (statusDelta !== 0) return statusDelta;
    const safeDelta = b.safeCount - a.safeCount;
    if (safeDelta !== 0) return safeDelta;
    const blockedDelta = a.blockedCount - b.blockedCount;
    if (blockedDelta !== 0) return blockedDelta;
    const cautionDelta = b.cautionCount - a.cautionCount;
    if (cautionDelta !== 0) return cautionDelta;
    return a.menuItem.rawName.localeCompare(b.menuItem.rawName, 'fr');
  });
}

export function buildSingleSuggestions(results: AnalysisResult[], limit = 5): OrderSuggestion[] {
  return rankSingleResults(results).slice(0, limit).map((result) => ({
    itemName: result.menuItem.rawName,
    status: result.status,
    score: result.score,
    subtitle: result.reasons[0]?.message ?? 'Aucun conflit détecté.',
    questions: result.askServerQuestions,
  }));
}

export function buildGroupSuggestions(rows: GroupAnalysisRow[], limit = 5): OrderSuggestion[] {
  return rankGroupRows(rows).slice(0, limit).map((row) => ({
    itemName: row.menuItem.rawName,
    status: row.aggregateStatus,
    score: row.safeCount * 100 - row.blockedCount * 45 - row.unknownCount * 20 + row.cautionCount * 10,
    subtitle: `${row.safeCount}/${row.results.length} profil(s) OK · ${row.cautionCount} à vérifier · ${row.blockedCount} bloqué(s)`,
    questions: Array.from(new Set(row.results.flatMap((result) => result.askServerQuestions))),
  }));
}

export function buildOrderPlanText(record: ScanRecord, restaurant?: RestaurantMemory | null): string {
  const lines: string[] = [
    'Can I Eat It — plan de commande',
    `Date : ${new Date(record.createdAt).toLocaleString('fr-FR')}`,
    `Restaurant : ${restaurant?.name || record.restaurant?.name || 'non renseigné'}`,
    `Profil principal : ${record.profile.name}`,
    '',
  ];

  if (record.groupRows?.length) {
    lines.push('## Meilleurs choix groupe');
    for (const row of rankGroupRows(record.groupRows).slice(0, 8)) {
      lines.push(`- ${row.menuItem.rawName} : ${row.safeCount}/${row.results.length} OK, ${row.cautionCount} à vérifier, ${row.blockedCount} bloqué(s)`);
    }
    lines.push('');
  } else {
    lines.push('## Meilleurs choix');
    for (const result of rankSingleResults(record.results).slice(0, 8)) {
      lines.push(`- ${result.menuItem.rawName} : ${labelStatus(result.status)} (${result.score}/100) — ${result.reasons[0]?.message ?? 'Aucun conflit détecté.'}`);
    }
    lines.push('');
  }

  const questions = record.groupRows?.length
    ? Array.from(new Set(record.groupRows.flatMap((row) => row.results.flatMap((result) => result.askServerQuestions))))
    : Array.from(new Set(record.results.flatMap((result) => result.askServerQuestions)));

  if (questions.length > 0) {
    lines.push('## Questions à poser avant de commander');
    for (const question of questions) lines.push(`- ${question}`);
    lines.push('');
  }

  const blocked = record.groupRows?.length
    ? record.groupRows.filter((row) => row.blockedCount === row.results.length).map((row) => row.menuItem.rawName)
    : record.results.filter((result) => result.status === 'blocked').map((result) => result.menuItem.rawName);
  if (blocked.length > 0) {
    lines.push('## À éviter');
    for (const name of blocked.slice(0, 10)) lines.push(`- ${name}`);
  }

  return lines.join('\n').trim();
}

function labelStatus(status: DecisionStatus): string {
  return {
    safe: 'OK',
    caution: 'à vérifier',
    blocked: 'non compatible',
    unknown: 'inconnu',
  }[status];
}
