import type {
  AnalysisResult,
  Confidence,
  DecisionStatus,
  GroupAnalysisRow,
  Ingredient,
  IngredientTag,
  RestaurantMemory,
  SafeOrderAction,
  SafeOrderChoice,
  SafeOrderModification,
  SafeOrderPlan,
  ScanRecord,
  UserProfile,
} from '../types';
import { unique } from './text';

const ACTION_RANK: Record<SafeOrderAction, number> = {
  order_as_is: 0,
  order_with_changes: 1,
  ask_first: 2,
  avoid: 3,
};

const STATUS_RANK: Record<DecisionStatus, number> = {
  safe: 0,
  caution: 1,
  unknown: 2,
  blocked: 3,
};

export interface SafeOrderPlanOptions {
  mode: 'single' | 'group';
  restaurant?: RestaurantMemory | null;
  activeProfile: UserProfile;
  enabledProfiles: UserProfile[];
  results: AnalysisResult[];
  groupRows: GroupAnalysisRow[];
  createdAt?: string;
}

export function buildSafeOrderPlanFromRecord(record: ScanRecord, fallbackRestaurant?: RestaurantMemory | null): SafeOrderPlan {
  return buildSafeOrderPlan({
    mode: record.groupRows?.length ? 'group' : 'single',
    restaurant: record.restaurant ?? fallbackRestaurant ?? null,
    activeProfile: record.profile,
    enabledProfiles: record.profiles?.length ? record.profiles : [record.profile],
    results: record.results,
    groupRows: record.groupRows ?? [],
    createdAt: record.createdAt,
  });
}

export function buildSafeOrderPlan(options: SafeOrderPlanOptions): SafeOrderPlan {
  const generatedAt = options.createdAt ?? new Date().toISOString();
  const choices = options.mode === 'group'
    ? options.groupRows.map((row) => groupRowToChoice(row, options.enabledProfiles))
    : options.results.map((result) => resultToChoice(result, options.activeProfile));

  const bestChoices = choices
    .filter((choice) => choice.action === 'order_as_is')
    .sort(sortChoices)
    .slice(0, 8);

  const conditionalChoices = choices
    .filter((choice) => choice.action === 'order_with_changes' || choice.action === 'ask_first')
    .sort(sortChoices)
    .slice(0, 10);

  const avoidChoices = choices
    .filter((choice) => choice.action === 'avoid')
    .sort((a, b) => a.score - b.score || a.itemName.localeCompare(b.itemName, 'fr'))
    .slice(0, 12);

  const unknownChoices = choices
    .filter((choice) => choice.status === 'unknown')
    .sort(sortChoices)
    .slice(0, 8);

  const questions = unique(choices.flatMap((choice) => choice.questions)).slice(0, 18);
  const modifications = mergeModifications(choices.flatMap((choice) => choice.modifications)).slice(0, 14);

  const plan: SafeOrderPlan = {
    mode: options.mode,
    generatedAt,
    restaurantName: options.restaurant?.name,
    activeProfileName: options.activeProfile.name,
    profileNames: options.enabledProfiles.map((profile) => profile.name),
    totalItems: choices.length,
    bestChoices,
    conditionalChoices,
    avoidChoices,
    unknownChoices,
    questions,
    modifications,
    safetyWarnings: buildSafetyWarnings(options),
    serverScript: '',
    shortText: '',
  };

  plan.shortText = buildSafeOrderShortText(plan);
  plan.serverScript = buildSafeOrderServerScript(plan);
  return plan;
}

export function buildSafeOrderShortText(plan: SafeOrderPlan): string {
  const lines: string[] = [
    'Can I Eat It — commande sûre',
    `Restaurant : ${plan.restaurantName || 'non renseigné'}`,
    `Mode : ${plan.mode === 'group' ? `groupe (${plan.profileNames.join(', ')})` : plan.activeProfileName}`,
    '',
  ];

  if (plan.bestChoices.length) {
    lines.push('## À commander en priorité');
    for (const choice of plan.bestChoices.slice(0, 6)) {
      lines.push(`- ${choice.itemName} — ${choice.score}/100 — ${choice.subtitle}`);
    }
    lines.push('');
  }

  if (plan.conditionalChoices.length) {
    lines.push('## Possible avec modification/vérification');
    for (const choice of plan.conditionalChoices.slice(0, 8)) {
      const mods = choice.modifications.slice(0, 2).map((modification) => modification.label).join(' ; ');
      lines.push(`- ${choice.itemName} — ${labelAction(choice.action)}${mods ? ` — ${mods}` : ''}`);
    }
    lines.push('');
  }

  if (plan.questions.length) {
    lines.push('## Questions rapides');
    for (const question of plan.questions.slice(0, 8)) lines.push(`- ${question}`);
    lines.push('');
  }

  if (plan.avoidChoices.length) {
    lines.push('## À éviter');
    for (const choice of plan.avoidChoices.slice(0, 8)) lines.push(`- ${choice.itemName} — ${choice.blockers.slice(0, 2).join(' ; ') || 'incompatible avec le profil'}`);
  }

  return lines.join('\n').trim();
}

export function buildSafeOrderServerScript(plan: SafeOrderPlan): string {
  const lines: string[] = [
    'Bonjour, j’ai des contraintes alimentaires importantes. Pouvez-vous me confirmer les points suivants avant que je commande ?',
  ];

  const priorityQuestions = plan.questions.slice(0, 10);
  if (priorityQuestions.length) {
    for (const question of priorityQuestions) lines.push(`- ${question}`);
  } else {
    lines.push('- Pouvez-vous confirmer les ingrédients exacts, les sauces et les risques de contamination croisée du plat choisi ?');
  }

  const firstConditional = plan.conditionalChoices[0];
  if (firstConditional?.modifications.length) {
    lines.push('', `Pour le plat “${firstConditional.itemName}”, est-ce possible de faire :`);
    for (const modification of firstConditional.modifications.slice(0, 4)) lines.push(`- ${modification.label}`);
  }

  lines.push('', 'Merci, c’est surtout pour éviter une erreur d’allergène, d’ingrédient interdit ou de contamination croisée.');
  return lines.join('\n');
}

function resultToChoice(result: AnalysisResult, profile: UserProfile): SafeOrderChoice {
  const modifications = collectModificationsFromResults([result], [profile]);
  const action = actionForSingleResult(result, modifications);
  const blockers = result.reasons
    .filter((reason) => reason.severity === 'danger')
    .map((reason) => reason.message);

  return {
    itemId: result.menuItem.id,
    itemName: result.menuItem.rawName,
    status: result.status,
    confidence: result.confidence,
    score: result.score,
    action,
    audienceLabel: profile.name,
    subtitle: subtitleForSingle(result, action),
    reasons: result.reasons.map((reason) => reason.message).slice(0, 6),
    blockers,
    modifications,
    questions: result.askServerQuestions,
    profileBreakdown: [{ profileName: profile.name, status: result.status, score: result.score }],
  };
}

function groupRowToChoice(row: GroupAnalysisRow, profiles: UserProfile[]): SafeOrderChoice {
  const modifications = collectModificationsFromResults(row.results, profiles);
  const action = actionForGroupRow(row, modifications);
  const blockers = unique(row.results
    .flatMap((result) => result.reasons.filter((reason) => reason.severity === 'danger').map((reason) => reason.message)))
    .slice(0, 5);
  const profileBreakdown = row.results.map((result, index) => ({
    profileName: profiles[index]?.name ?? result.safeFor[0] ?? `Profil ${index + 1}`,
    status: result.status,
    score: result.score,
  }));
  const groupScore = Math.max(0, Math.round((row.safeCount * 100 + row.cautionCount * 52 + row.unknownCount * 24 - row.blockedCount * 30) / Math.max(1, row.results.length)));

  return {
    itemId: row.menuItem.id,
    itemName: row.menuItem.rawName,
    status: row.aggregateStatus,
    confidence: bestConfidence(row.results.map((result) => result.confidence)),
    score: groupScore,
    action,
    audienceLabel: `${row.safeCount}/${row.results.length} profil(s) OK`,
    subtitle: subtitleForGroup(row, action),
    reasons: unique(row.results.flatMap((result) => result.reasons.map((reason) => reason.message))).slice(0, 6),
    blockers,
    modifications,
    questions: unique(row.results.flatMap((result) => result.askServerQuestions)).slice(0, 10),
    profileBreakdown,
  };
}

function actionForSingleResult(result: AnalysisResult, modifications: SafeOrderModification[]): SafeOrderAction {
  if (result.status === 'safe') return 'order_as_is';
  if (result.status === 'blocked') return 'avoid';
  if (result.status === 'unknown') return 'ask_first';
  return modifications.some((item) => item.priority === 'required' || item.priority === 'recommended')
    ? 'order_with_changes'
    : 'ask_first';
}

function actionForGroupRow(row: GroupAnalysisRow, modifications: SafeOrderModification[]): SafeOrderAction {
  if (row.blockedCount === row.results.length) return 'avoid';
  if (row.safeCount === row.results.length && row.cautionCount === 0 && row.unknownCount === 0) return 'order_as_is';
  if (row.safeCount > 0 || modifications.length > 0) return 'order_with_changes';
  return 'ask_first';
}

function collectModificationsFromResults(results: AnalysisResult[], profiles: UserProfile[]): SafeOrderModification[] {
  return mergeModifications(results.flatMap((result, index) => collectModifications(result, profiles[index] ?? profiles[0])));
}

function collectModifications(result: AnalysisResult, profile?: UserProfile): SafeOrderModification[] {
  const tags = ingredientTags(result.matchedDish.ingredients);
  const reasonText = result.reasons.map((reason) => reason.message).join(' ').toLowerCase();
  const modifications: SafeOrderModification[] = [];
  const add = (label: string, reason: string, priority: SafeOrderModification['priority'], ingredientIds: string[] = []) => {
    modifications.push({ label, reason, priority, ingredientIds: ingredientIds.length ? ingredientIds : undefined });
  };
  const idsWithTags = (...wanted: IngredientTag[]) => result.matchedDish.ingredients
    .filter((ingredient) => wanted.some((tag) => ingredient.tags.includes(tag)))
    .map((ingredient) => ingredient.id);
  const has = (tag: IngredientTag) => tags.has(tag);
  const hasAny = (...values: IngredientTag[]) => values.some((tag) => tags.has(tag));
  const hasRule = (...values: UserProfile['rules']) => values.some((rule) => profile?.rules.includes(rule));
  const hasSensitivity = (...values: string[]) => values.some((value) => profile?.allergens.includes(value as never) || profile?.intolerances.includes(value as never));
  const customTerms = [...(profile?.customForbiddenTerms ?? []), ...(profile?.customCautionTerms ?? [])].join(' ').toLowerCase();

  if (hasAny('milk', 'dairy', 'lactose', 'cheese') && (hasRule('vegan', 'low_lactose') || hasSensitivity('milk'))) {
    add('Demander sans fromage, crème, beurre ni sauce lactée.', 'lait/lactose/fromage détecté ou probable', result.status === 'blocked' ? 'required' : 'recommended', idsWithTags('milk', 'dairy', 'lactose', 'cheese'));
  }
  if (has('pork') && (hasRule('vegetarian', 'vegan', 'no_pork', 'halal', 'kosher') || customTerms.includes('porc'))) {
    add('Retirer jambon, lardons, bacon, chorizo ou dérivé de porc ; éviter si ce n’est pas possible.', 'porc détecté ou probable', 'required', idsWithTags('pork'));
  }
  if (hasAny('alcohol', 'wine', 'beer', 'rum', 'may_contain_alcohol') && (hasRule('no_alcohol', 'halal') || customTerms.includes('alcool'))) {
    add('Demander une version sans vin, bière, alcool flambé, mirin ou sauce alcoolisée.', 'alcool détecté ou possible', 'required', idsWithTags('alcohol', 'wine', 'beer', 'rum', 'may_contain_alcohol'));
  }
  if (hasAny('gluten', 'fried_shared_oil_risk') && (hasRule('gluten_free') || hasSensitivity('gluten'))) {
    add('Demander une option sans blé/farine/panure et confirmer la friture séparée.', 'gluten ou huile partagée possible', result.status === 'blocked' ? 'required' : 'recommended', idsWithTags('gluten', 'fried_shared_oil_risk'));
  }
  if (hasRule('halal') && hasAny('meat', 'poultry', 'beef', 'lamb', 'halal_risk') && reasonText.includes('halal')) {
    add('Demander viande/bouillon/gélatine certifiés halal, ou remplacer par une option végétarienne.', 'certification halal non confirmée', 'required', idsWithTags('meat', 'poultry', 'beef', 'lamb', 'halal_risk'));
  }
  if (hasAny('gelatin', 'broth_meat_risk', 'animal_fat') && (hasRule('vegetarian', 'vegan', 'halal', 'kosher', 'hindu_no_beef') || customTerms.includes('gélatine') || customTerms.includes('bouillon'))) {
    add('Demander si le bouillon, la gélatine ou la graisse sont végétaux/certifiés.', 'source animale cachée possible', result.status === 'blocked' ? 'required' : 'recommended', idsWithTags('gelatin', 'broth_meat_risk', 'animal_fat'));
  }
  if (has('hidden_sauce_risk') && (reasonText.includes('sauce') || customTerms.includes('sauce'))) {
    add('Demander la sauce à part et la liste exacte des ingrédients.', 'sauce maison ou composition opaque', 'recommended', idsWithTags('hidden_sauce_risk'));
  }
  if (hasAny('eggs', 'mustard') && (hasRule('vegan') || hasSensitivity('eggs', 'mustard'))) {
    add('Vérifier mayonnaise, œuf ou moutarde dans la sauce.', 'œuf/moutarde souvent présents dans les sauces', 'recommended', idsWithTags('eggs', 'mustard'));
  }
  if (hasAny('peanuts', 'nuts', 'sesame', 'soy', 'celery', 'sulphites', 'lupin') && hasSensitivity('peanuts', 'nuts', 'sesame', 'soy', 'celery', 'sulphites', 'lupin')) {
    add('Confirmer les allergènes et la contamination croisée avant commande.', 'allergènes majeurs détectés/probables', 'required', idsWithTags('peanuts', 'nuts', 'sesame', 'soy', 'celery', 'sulphites', 'lupin'));
  }
  if (hasAny('crustaceans', 'molluscs', 'shellfish', 'seafood', 'fish') && (hasRule('vegetarian', 'vegan', 'kosher') || hasSensitivity('fish', 'crustaceans', 'molluscs'))) {
    add('Confirmer poisson/fruits de mer et les ustensiles de préparation séparés.', 'poisson ou fruits de mer détectés/probables', result.status === 'blocked' ? 'required' : 'recommended', idsWithTags('crustaceans', 'molluscs', 'shellfish', 'seafood', 'fish'));
  }
  if (result.status === 'unknown') {
    add('Demander la composition complète du plat avant de commander.', 'composition inconnue', 'required');
  }
  if (reasonText.includes('présure') && hasRule('vegetarian', 'halal', 'kosher')) {
    add('Demander si le fromage contient de la présure animale.', 'fromage potentiellement non végétarien strict', 'recommended');
  }
  if ((reasonText.includes('contamination croisée') || has('cross_contamination_risk')) && ((profile?.allergens.length ?? 0) > 0 || profile?.strictness === 'strict')) {
    add('Demander une préparation séparée pour limiter la contamination croisée.', 'contamination croisée possible', 'required', idsWithTags('cross_contamination_risk'));
  }

  return modifications;
}

function ingredientTags(ingredients: Ingredient[]): Set<IngredientTag> {
  return new Set(ingredients.flatMap((ingredient) => ingredient.tags));
}

function mergeModifications(modifications: SafeOrderModification[]): SafeOrderModification[] {
  const priorityRank = { required: 3, recommended: 2, optional: 1 } as const;
  const byLabel = new Map<string, SafeOrderModification>();
  for (const modification of modifications) {
    const key = modification.label.toLowerCase();
    const current = byLabel.get(key);
    if (!current) {
      byLabel.set(key, modification);
      continue;
    }
    byLabel.set(key, {
      ...current,
      priority: priorityRank[modification.priority] > priorityRank[current.priority] ? modification.priority : current.priority,
      ingredientIds: unique([...(current.ingredientIds ?? []), ...(modification.ingredientIds ?? [])]),
    });
  }

  return Array.from(byLabel.values()).sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority] || a.label.localeCompare(b.label, 'fr'));
}

function subtitleForSingle(result: AnalysisResult, action: SafeOrderAction): string {
  if (action === 'order_as_is') return 'À commander tel quel si la recette correspond bien au menu.';
  if (action === 'order_with_changes') return 'Possible, mais seulement avec modification ou confirmation serveur.';
  if (action === 'ask_first') return 'Composition à clarifier avant commande.';
  return result.reasons.find((reason) => reason.severity === 'danger')?.message ?? 'Incompatible avec le profil.';
}

function subtitleForGroup(row: GroupAnalysisRow, action: SafeOrderAction): string {
  if (action === 'order_as_is') return `OK pour les ${row.results.length} profils.`;
  if (action === 'order_with_changes') return `${row.safeCount}/${row.results.length} OK · ${row.cautionCount} à vérifier · ${row.blockedCount} bloqué(s).`;
  if (action === 'ask_first') return 'À clarifier pour le groupe avant commande.';
  return 'À éviter : bloqué pour tous les profils du groupe.';
}

function bestConfidence(values: Confidence[]): Confidence {
  if (values.includes('confirmed')) return 'confirmed';
  if (values.includes('probable')) return 'probable';
  if (values.includes('estimated')) return 'estimated';
  return 'unknown';
}

function sortChoices(a: SafeOrderChoice, b: SafeOrderChoice): number {
  return ACTION_RANK[a.action] - ACTION_RANK[b.action]
    || STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || b.score - a.score
    || a.itemName.localeCompare(b.itemName, 'fr');
}

function buildSafetyWarnings(options: SafeOrderPlanOptions): string[] {
  const warnings = [
    'Pour une allergie sévère, ne considère jamais une estimation comme une garantie : demande confirmation au restaurant.',
  ];
  if (options.activeProfile.strictness === 'strict' || options.enabledProfiles.some((profile) => profile.strictness === 'strict')) {
    warnings.push('Profil strict détecté : privilégie les plats confirmés et les préparations séparées.');
  }
  if (options.enabledProfiles.some((profile) => profile.allergens.length > 0)) {
    warnings.push('Au moins un profil contient une allergie : vérifie aussi la contamination croisée.');
  }
  return unique(warnings);
}

function labelAction(action: SafeOrderAction): string {
  return {
    order_as_is: 'à commander tel quel',
    order_with_changes: 'à commander avec modification',
    ask_first: 'à demander avant',
    avoid: 'à éviter',
  }[action];
}
