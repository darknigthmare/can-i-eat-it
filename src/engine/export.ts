import type { ScanRecord } from '../types';

export function downloadScanAsJson(record: ScanRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `can-i-eat-it-scan-${record.createdAt.slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildQuestionSheet(record: ScanRecord): string {
  const lines = [
    `Can I Eat It — questions restaurant`,
    `Date : ${new Date(record.createdAt).toLocaleString('fr-FR')}`,
    `Profil : ${record.profile.name}`,
    `Restaurant : ${record.restaurant?.name ?? 'non renseigné'}`,
    '',
  ];

  for (const result of record.results) {
    if (result.askServerQuestions.length === 0) continue;
    lines.push(`## ${result.menuItem.rawName}`);
    for (const question of result.askServerQuestions) {
      lines.push(`- ${question}`);
    }
    lines.push('');
  }

  if (record.groupRows) {
    for (const row of record.groupRows) {
      const questions = Array.from(new Set(row.results.flatMap((result) => result.askServerQuestions)));
      if (questions.length === 0) continue;
      lines.push(`## ${row.menuItem.rawName} — groupe`);
      for (const question of questions) {
        lines.push(`- ${question}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').trim() || 'Aucune question nécessaire.';
}
