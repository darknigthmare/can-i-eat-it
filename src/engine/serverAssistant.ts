import type { DecisionStatus, SafeOrderChoice, SafeOrderModification, SafeOrderPlan } from '../types';
import { normalizeText } from './text';

export type ServerAssistantTone = 'polite' | 'short' | 'allergy_urgent' | 'strict_religious';
export type ServerAssistantLanguage = 'fr' | 'en' | 'es' | 'it' | 'de';
export type ServerAssistantUrgency = 'standard' | 'allergy' | 'religious' | 'dietary';
export type ServerAnswerValue = 'unanswered' | 'confirmed_safe' | 'confirmed_risk' | 'not_possible' | 'unknown';

export type ServerQuestionCategory =
  | 'allergen'
  | 'cross_contamination'
  | 'halal'
  | 'kosher'
  | 'vegan_vegetarian'
  | 'gluten'
  | 'lactose'
  | 'alcohol'
  | 'pork'
  | 'sauce'
  | 'composition'
  | 'modification'
  | 'general';

export interface ServerAssistantOptions {
  tone: ServerAssistantTone;
  language: ServerAssistantLanguage;
  urgency: ServerAssistantUrgency;
}

export interface ServerAssistantQuestion {
  id: string;
  original: string;
  text: string;
  category: ServerQuestionCategory;
  priority: 'high' | 'medium' | 'low';
  relatedChoiceName?: string;
}

export interface ServerAssistantScript {
  title: string;
  intro: string;
  lines: string[];
  outro: string;
  fullText: string;
}

export interface ServerAnswerSummary {
  answered: number;
  total: number;
  confirmedSafe: number;
  confirmedRisk: number;
  notPossible: number;
  unknown: number;
  unanswered: number;
  provisionalStatus: DecisionStatus;
  verdict: string;
  nextStep: string;
  riskQuestions: ServerAssistantQuestion[];
}

export interface ServerAssistantBundle {
  options: ServerAssistantOptions;
  questions: ServerAssistantQuestion[];
  mainScript: ServerAssistantScript;
  compactScript: ServerAssistantScript;
  emergencyScript: ServerAssistantScript;
  summary: ServerAnswerSummary;
  answerSheet: string;
}

export type ServerAnswerMap = Record<string, ServerAnswerValue>;

const CATEGORY_RANK: Record<ServerQuestionCategory, number> = {
  allergen: 0,
  cross_contamination: 1,
  halal: 2,
  kosher: 2,
  pork: 3,
  alcohol: 4,
  gluten: 5,
  lactose: 6,
  vegan_vegetarian: 7,
  sauce: 8,
  composition: 9,
  modification: 10,
  general: 11,
};

const ANSWER_LABELS_FR: Record<ServerAnswerValue, string> = {
  unanswered: 'Non répondu',
  confirmed_safe: 'Confirmé sûr',
  confirmed_risk: 'Risque confirmé',
  not_possible: 'Modification impossible',
  unknown: 'Le serveur ne sait pas',
};

const LANGUAGE_NAMES: Record<ServerAssistantLanguage, string> = {
  fr: 'Français',
  en: 'English',
  es: 'Español',
  it: 'Italiano',
  de: 'Deutsch',
};

const CATEGORY_TRANSLATIONS: Record<ServerAssistantLanguage, Record<ServerQuestionCategory, string>> = {
  fr: {
    allergen: 'Pouvez-vous confirmer les allergènes exacts du plat et les traces possibles ?',
    cross_contamination: 'Pouvez-vous confirmer si le plat est préparé avec des ustensiles, plaques ou friteuses séparés ?',
    halal: 'La viande, le bouillon, la gélatine et les sauces sont-ils certifiés halal ?',
    kosher: 'Les ingrédients sont-ils certifiés casher et y a-t-il un mélange lait/viande ?',
    vegan_vegetarian: 'Le plat contient-il viande, poisson, bouillon animal, gélatine, présure animale, œuf ou lait ?',
    gluten: 'Le plat contient-il blé, farine, panure, bière, sauce soja ou une friteuse partagée avec gluten ?',
    lactose: 'Le plat contient-il lait, fromage, crème, beurre, yaourt ou une sauce lactée ?',
    alcohol: 'Le plat contient-il vin, bière, alcool flambé, mirin, rhum ou une sauce alcoolisée ?',
    pork: 'Le plat contient-il porc, jambon, lardons, bacon, chorizo, gélatine ou graisse de porc ?',
    sauce: 'Pouvez-vous me donner la composition exacte de la sauce et la servir à part ?',
    composition: 'Pouvez-vous confirmer la composition complète du plat avant commande ?',
    modification: 'Cette modification est-elle possible sans changer la préparation avec des ingrédients à risque ?',
    general: 'Pouvez-vous confirmer les ingrédients exacts et les risques de contamination croisée ?',
  },
  en: {
    allergen: 'Can you confirm the exact allergens in this dish and any possible traces?',
    cross_contamination: 'Can you confirm whether the dish is prepared with separate utensils, surfaces, or fryer oil?',
    halal: 'Are the meat, broth, gelatin, and sauces halal certified?',
    kosher: 'Are the ingredients kosher certified, and is there any meat/dairy mixing?',
    vegan_vegetarian: 'Does the dish contain meat, fish, animal broth, gelatin, animal rennet, egg, or dairy?',
    gluten: 'Does the dish contain wheat, flour, breading, beer, soy sauce, or shared fryer oil with gluten?',
    lactose: 'Does the dish contain milk, cheese, cream, butter, yogurt, or a dairy-based sauce?',
    alcohol: 'Does the dish contain wine, beer, flambéed alcohol, mirin, rum, or an alcoholic sauce?',
    pork: 'Does the dish contain pork, ham, bacon, lardons, chorizo, gelatin, or pork fat?',
    sauce: 'Can you tell me the exact ingredients of the sauce and serve it on the side?',
    composition: 'Can you confirm the full ingredient list before I order?',
    modification: 'Is this modification possible without using risky ingredients in the preparation?',
    general: 'Can you confirm the exact ingredients and any cross-contamination risks?',
  },
  es: {
    allergen: '¿Puede confirmar los alérgenos exactos del plato y posibles trazas?',
    cross_contamination: '¿Puede confirmar si el plato se prepara con utensilios, superficies o freidora separados?',
    halal: '¿La carne, el caldo, la gelatina y las salsas tienen certificación halal?',
    kosher: '¿Los ingredientes tienen certificación kosher y hay mezcla de carne y lácteos?',
    vegan_vegetarian: '¿El plato contiene carne, pescado, caldo animal, gelatina, cuajo animal, huevo o lácteos?',
    gluten: '¿El plato contiene trigo, harina, rebozado, cerveza, salsa de soja o freidora compartida con gluten?',
    lactose: '¿El plato contiene leche, queso, nata, mantequilla, yogur o salsa láctea?',
    alcohol: '¿El plato contiene vino, cerveza, alcohol flameado, mirin, ron o salsa con alcohol?',
    pork: '¿El plato contiene cerdo, jamón, bacon, chorizo, gelatina o grasa de cerdo?',
    sauce: '¿Puede decirme los ingredientes exactos de la salsa y servirla aparte?',
    composition: '¿Puede confirmar la composición completa del plato antes de pedir?',
    modification: '¿Es posible esta modificación sin usar ingredientes de riesgo?',
    general: '¿Puede confirmar los ingredientes exactos y los riesgos de contaminación cruzada?',
  },
  it: {
    allergen: 'Può confermare gli allergeni esatti del piatto e le possibili tracce?',
    cross_contamination: 'Può confermare se il piatto è preparato con utensili, superfici o friggitrice separati?',
    halal: 'Carne, brodo, gelatina e salse sono certificati halal?',
    kosher: 'Gli ingredienti sono certificati kosher e c’è una combinazione di carne e latticini?',
    vegan_vegetarian: 'Il piatto contiene carne, pesce, brodo animale, gelatina, caglio animale, uova o latticini?',
    gluten: 'Il piatto contiene grano, farina, impanatura, birra, salsa di soia o olio di frittura condiviso con glutine?',
    lactose: 'Il piatto contiene latte, formaggio, panna, burro, yogurt o salsa a base di latticini?',
    alcohol: 'Il piatto contiene vino, birra, alcol flambé, mirin, rum o salsa alcolica?',
    pork: 'Il piatto contiene maiale, prosciutto, pancetta, chorizo, gelatina o grasso di maiale?',
    sauce: 'Può dirmi gli ingredienti esatti della salsa e servirla a parte?',
    composition: 'Può confermare la composizione completa del piatto prima dell’ordine?',
    modification: 'Questa modifica è possibile senza usare ingredienti a rischio?',
    general: 'Può confermare gli ingredienti esatti e i rischi di contaminazione crociata?',
  },
  de: {
    allergen: 'Können Sie die genauen Allergene im Gericht und mögliche Spuren bestätigen?',
    cross_contamination: 'Können Sie bestätigen, ob das Gericht mit separaten Utensilien, Flächen oder Frittieröl zubereitet wird?',
    halal: 'Sind Fleisch, Brühe, Gelatine und Soßen halal-zertifiziert?',
    kosher: 'Sind die Zutaten koscher zertifiziert, und gibt es eine Mischung aus Fleisch und Milchprodukten?',
    vegan_vegetarian: 'Enthält das Gericht Fleisch, Fisch, tierische Brühe, Gelatine, tierisches Lab, Ei oder Milchprodukte?',
    gluten: 'Enthält das Gericht Weizen, Mehl, Panade, Bier, Sojasoße oder gemeinsames Frittieröl mit Gluten?',
    lactose: 'Enthält das Gericht Milch, Käse, Sahne, Butter, Joghurt oder eine milchbasierte Soße?',
    alcohol: 'Enthält das Gericht Wein, Bier, flambierten Alkohol, Mirin, Rum oder eine alkoholische Soße?',
    pork: 'Enthält das Gericht Schwein, Schinken, Speck, Chorizo, Gelatine oder Schweinefett?',
    sauce: 'Können Sie mir die genauen Zutaten der Soße nennen und sie separat servieren?',
    composition: 'Können Sie die vollständige Zusammensetzung des Gerichts vor der Bestellung bestätigen?',
    modification: 'Ist diese Änderung möglich, ohne riskante Zutaten in der Zubereitung zu verwenden?',
    general: 'Können Sie die genauen Zutaten und Risiken einer Kreuzkontamination bestätigen?',
  },
};

const INTRO_LINES: Record<ServerAssistantLanguage, Record<ServerAssistantTone, string>> = {
  fr: {
    polite: 'Bonjour, j’ai des contraintes alimentaires importantes. Pouvez-vous m’aider à confirmer quelques points avant que je commande ?',
    short: 'Bonjour, pouvez-vous confirmer rapidement ces points avant ma commande ?',
    allergy_urgent: 'Bonjour, j’ai une allergie ou contrainte alimentaire importante. J’ai besoin d’une confirmation précise avant de commander.',
    strict_religious: 'Bonjour, j’ai des règles alimentaires strictes. Pouvez-vous confirmer précisément ces points avant ma commande ?',
  },
  en: {
    polite: 'Hello, I have important dietary requirements. Could you help me confirm a few points before I order?',
    short: 'Hello, could you quickly confirm these points before I order?',
    allergy_urgent: 'Hello, I have an allergy or serious dietary restriction. I need precise confirmation before ordering.',
    strict_religious: 'Hello, I follow strict dietary rules. Could you confirm these points precisely before I order?',
  },
  es: {
    polite: 'Hola, tengo restricciones alimentarias importantes. ¿Puede ayudarme a confirmar algunos puntos antes de pedir?',
    short: 'Hola, ¿puede confirmar rápidamente estos puntos antes de pedir?',
    allergy_urgent: 'Hola, tengo una alergia o restricción alimentaria importante. Necesito una confirmación precisa antes de pedir.',
    strict_religious: 'Hola, sigo reglas alimentarias estrictas. ¿Puede confirmar estos puntos con precisión antes de pedir?',
  },
  it: {
    polite: 'Buongiorno, ho esigenze alimentari importanti. Può aiutarmi a confermare alcuni punti prima di ordinare?',
    short: 'Buongiorno, può confermare rapidamente questi punti prima del mio ordine?',
    allergy_urgent: 'Buongiorno, ho un’allergia o una restrizione alimentare importante. Ho bisogno di una conferma precisa prima di ordinare.',
    strict_religious: 'Buongiorno, seguo regole alimentari rigide. Può confermare questi punti con precisione prima del mio ordine?',
  },
  de: {
    polite: 'Hallo, ich habe wichtige Ernährungsanforderungen. Können Sie mir helfen, ein paar Punkte vor der Bestellung zu bestätigen?',
    short: 'Hallo, können Sie diese Punkte vor meiner Bestellung kurz bestätigen?',
    allergy_urgent: 'Hallo, ich habe eine Allergie oder eine wichtige Ernährungseinschränkung. Ich brauche vor der Bestellung eine genaue Bestätigung.',
    strict_religious: 'Hallo, ich befolge strenge Ernährungsregeln. Können Sie diese Punkte vor meiner Bestellung genau bestätigen?',
  },
};

const OUTRO_LINES: Record<ServerAssistantLanguage, string> = {
  fr: 'Merci. Si vous n’êtes pas sûr, je préfère choisir un autre plat plutôt que prendre un risque.',
  en: 'Thank you. If you are not sure, I would rather choose another dish than take a risk.',
  es: 'Gracias. Si no está seguro, prefiero elegir otro plato antes que correr un riesgo.',
  it: 'Grazie. Se non è sicuro, preferisco scegliere un altro piatto invece di rischiare.',
  de: 'Danke. Wenn Sie nicht sicher sind, wähle ich lieber ein anderes Gericht, statt ein Risiko einzugehen.',
};

export function buildServerAssistant(
  plan: SafeOrderPlan,
  options: ServerAssistantOptions,
  answers: ServerAnswerMap = {},
): ServerAssistantBundle {
  const questions = buildServerQuestions(plan, options);
  const summary = summarizeServerAnswers(questions, answers);
  const mainScript = buildScript('Assistant serveur', questions, options, false);
  const compactScript = buildScript('Version courte', questions.slice(0, 6), { ...options, tone: 'short' }, false);
  const emergencyScript = buildScript('Version allergie urgente', prioritizeEmergencyQuestions(questions).slice(0, 8), { ...options, tone: 'allergy_urgent', urgency: 'allergy' }, true);
  const answerSheet = buildAnswerSheet(plan, questions, answers, summary, options);

  return {
    options,
    questions,
    mainScript,
    compactScript,
    emergencyScript,
    summary,
    answerSheet,
  };
}

export function buildServerQuestions(plan: SafeOrderPlan, options: ServerAssistantOptions): ServerAssistantQuestion[] {
  const rawQuestions: Array<{ text: string; choice?: SafeOrderChoice; priority?: ServerAssistantQuestion['priority'] }> = [];

  for (const question of plan.questions) rawQuestions.push({ text: question, priority: 'medium' });

  for (const choice of [...plan.conditionalChoices, ...plan.unknownChoices].slice(0, 8)) {
    for (const question of choice.questions.slice(0, 4)) rawQuestions.push({ text: question, choice, priority: 'high' });
    for (const modification of choice.modifications.slice(0, 3)) {
      rawQuestions.push({ text: modificationToQuestion(modification, choice), choice, priority: modification.priority === 'required' ? 'high' : 'medium' });
    }
  }

  if (!rawQuestions.length) {
    const choice = plan.bestChoices[0];
    rawQuestions.push({
      text: choice ? `Pouvez-vous confirmer que “${choice.itemName}” correspond bien aux ingrédients indiqués sur le menu ?` : 'Pouvez-vous confirmer les ingrédients exacts et les risques de contamination croisée ?',
      choice,
      priority: 'medium',
    });
  }

  if (options.urgency === 'allergy') {
    rawQuestions.unshift({ text: 'Pouvez-vous confirmer les allergènes et les traces possibles avec la cuisine avant que je commande ?', priority: 'high' });
    rawQuestions.unshift({ text: 'La préparation peut-elle être faite avec ustensiles et surface séparés pour éviter la contamination croisée ?', priority: 'high' });
  }
  if (options.urgency === 'religious') {
    rawQuestions.unshift({ text: 'Pouvez-vous confirmer l’absence de porc, alcool, gélatine animale et viande non certifiée ?', priority: 'high' });
  }
  if (options.urgency === 'dietary') {
    rawQuestions.unshift({ text: 'Pouvez-vous confirmer si une version végétarienne/vegan/sans lactose/sans gluten est réellement possible ?', priority: 'high' });
  }

  const deduped = new Map<ServerQuestionCategory, ServerAssistantQuestion>();
  for (const item of rawQuestions) {
    const category = classifyQuestion(item.text);
    const baseText = translateQuestion(item.text, category, options.language);
    const id = makeQuestionId(category);
    const existing = deduped.get(category);
    const question: ServerAssistantQuestion = {
      id,
      original: item.text,
      text: baseText,
      category,
      priority: item.priority ?? priorityForCategory(category),
      relatedChoiceName: undefined,
    };
    if (!existing || priorityScore(question.priority) > priorityScore(existing.priority)) deduped.set(category, question);
  }

  return Array.from(deduped.values())
    .sort((a, b) => priorityScore(b.priority) - priorityScore(a.priority) || CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.text.localeCompare(b.text, 'fr'))
    .slice(0, options.urgency === 'standard' ? 5 : 6);
}

export function summarizeServerAnswers(questions: ServerAssistantQuestion[], answers: ServerAnswerMap): ServerAnswerSummary {
  const values = questions.map((question) => answers[question.id] ?? 'unanswered');
  const confirmedRisk = values.filter((value) => value === 'confirmed_risk').length;
  const notPossible = values.filter((value) => value === 'not_possible').length;
  const unknown = values.filter((value) => value === 'unknown').length;
  const unanswered = values.filter((value) => value === 'unanswered').length;
  const confirmedSafe = values.filter((value) => value === 'confirmed_safe').length;
  const answered = values.length - unanswered;

  let provisionalStatus: DecisionStatus = 'safe';
  if (confirmedRisk > 0 || notPossible > 0) provisionalStatus = 'blocked';
  else if (unknown > 0 || unanswered > 0) provisionalStatus = 'caution';

  const riskQuestions = questions.filter((question) => {
    const value = answers[question.id] ?? 'unanswered';
    return value === 'confirmed_risk' || value === 'not_possible';
  });

  const verdict = provisionalStatus === 'blocked'
    ? 'Réanalyse : ne commande pas ce plat/choix tant que le risque confirmé n’est pas levé.'
    : provisionalStatus === 'caution'
      ? 'Réanalyse : encore à vérifier. Les réponses ne suffisent pas pour valider comme sûr.'
      : 'Réanalyse : toutes les réponses cochées sont favorables. Garde quand même la prudence en cas d’allergie sévère.';

  const nextStep = provisionalStatus === 'blocked'
    ? 'Choisis un autre plat ou demande une alternative sans l’ingrédient/procédé bloquant.'
    : provisionalStatus === 'caution'
      ? 'Continue à poser les questions non répondues ou prends un plat plus simple.'
      : 'Tu peux envisager la commande si le niveau de confiance te convient.';

  return {
    answered,
    total: questions.length,
    confirmedSafe,
    confirmedRisk,
    notPossible,
    unknown,
    unanswered,
    provisionalStatus,
    verdict,
    nextStep,
    riskQuestions,
  };
}

export function answerValueLabel(value: ServerAnswerValue): string {
  return ANSWER_LABELS_FR[value];
}

export function languageName(language: ServerAssistantLanguage): string {
  return LANGUAGE_NAMES[language];
}

function buildScript(title: string, questions: ServerAssistantQuestion[], options: ServerAssistantOptions, forceEmergencyOutro: boolean): ServerAssistantScript {
  const intro = INTRO_LINES[options.language][options.tone];
  const outro = forceEmergencyOutro ? emergencyOutro(options.language) : OUTRO_LINES[options.language];
  const lines = questions.map((question) => question.text);
  const fullText = [intro, '', ...lines.map((line) => `- ${line}`), '', outro].join('\n').trim();
  return { title, intro, lines, outro, fullText };
}

function buildAnswerSheet(plan: SafeOrderPlan, questions: ServerAssistantQuestion[], answers: ServerAnswerMap, summary: ServerAnswerSummary, options: ServerAssistantOptions): string {
  const lines: string[] = [
    'Can I Eat It — Assistant serveur V11',
    `Restaurant : ${plan.restaurantName || 'non renseigné'}`,
    `Langue : ${LANGUAGE_NAMES[options.language]}`,
    `Réponses : ${summary.answered}/${summary.total}`,
    `Statut après réponses : ${summary.provisionalStatus}`,
    summary.verdict,
    '',
    '## Réponses serveur',
  ];

  for (const question of questions) {
    const answer = answers[question.id] ?? 'unanswered';
    lines.push(`- [${ANSWER_LABELS_FR[answer]}] ${question.text}${question.relatedChoiceName ? ` (${question.relatedChoiceName})` : ''}`);
  }

  if (summary.riskQuestions.length) {
    lines.push('', '## Risques confirmés / modifications impossibles');
    for (const question of summary.riskQuestions) lines.push(`- ${question.text}`);
  }

  lines.push('', `Prochaine étape : ${summary.nextStep}`);
  return lines.join('\n');
}

function modificationToQuestion(modification: SafeOrderModification, choice: SafeOrderChoice): string {
  const cleanLabel = modification.label.replace(/[.!?]+$/g, '').trim();
  return `Pour “${choice.itemName}”, est-ce possible de faire : ${cleanLabel} ?`;
}

function translateQuestion(original: string, category: ServerQuestionCategory, language: ServerAssistantLanguage): string {
  if (language === 'fr') return original.trim();
  const translated = CATEGORY_TRANSLATIONS[language][category] || CATEGORY_TRANSLATIONS[language].general;
  const dishMatch = original.match(/[“"]([^”"]+)[”"]/);
  if (dishMatch?.[1]) return `${translated} (${dishMatch[1]})`;
  return translated;
}

function classifyQuestion(value: string): ServerQuestionCategory {
  const text = normalizeText(value);
  if (hasAny(text, ['contamination', 'croisee', 'ustensile', 'friture separee', 'friteuse', 'surface separee'])) return 'cross_contamination';
  if (hasAny(text, ['allergene', 'arachide', 'cacahuete', 'noix', 'sesame', 'soja', 'moutarde', 'celeri', 'lupin', 'sulfite'])) return 'allergen';
  if (hasAny(text, ['halal'])) return 'halal';
  if (hasAny(text, ['casher', 'kosher'])) return 'kosher';
  if (hasAny(text, ['porc', 'jambon', 'lardon', 'bacon', 'chorizo'])) return 'pork';
  if (hasAny(text, ['alcool', 'vin', 'biere', 'mirin', 'rhum', 'flambe'])) return 'alcohol';
  if (hasAny(text, ['gluten', 'ble', 'farine', 'panure', 'pain', 'soja'])) return 'gluten';
  if (hasAny(text, ['lait', 'fromage', 'creme', 'beurre', 'yaourt', 'lactose'])) return 'lactose';
  if (hasAny(text, ['vegan', 'vegetarien', 'viande', 'poisson', 'bouillon animal', 'gelatine', 'presure', 'oeuf'])) return 'vegan_vegetarian';
  if (hasAny(text, ['sauce', 'mayonnaise'])) return 'sauce';
  if (hasAny(text, ['composition complete', 'ingredients exacts', 'liste exacte'])) return 'composition';
  if (hasAny(text, ['possible de faire', 'demander sans', 'retirer', 'remplacer'])) return 'modification';
  return 'general';
}

function priorityForCategory(category: ServerQuestionCategory): ServerAssistantQuestion['priority'] {
  if (category === 'allergen' || category === 'cross_contamination' || category === 'halal' || category === 'pork' || category === 'alcohol') return 'high';
  if (category === 'gluten' || category === 'lactose' || category === 'kosher' || category === 'vegan_vegetarian') return 'medium';
  return 'low';
}

function priorityScore(priority: ServerAssistantQuestion['priority']): number {
  return priority === 'high' ? 3 : priority === 'medium' ? 2 : 1;
}

function makeQuestionId(category: ServerQuestionCategory): string {
  const source = category;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return `server-q-${Math.abs(hash).toString(36)}`;
}

function prioritizeEmergencyQuestions(questions: ServerAssistantQuestion[]): ServerAssistantQuestion[] {
  return [...questions].sort((a, b) => {
    const emergencyA = a.category === 'allergen' || a.category === 'cross_contamination' ? 1 : 0;
    const emergencyB = b.category === 'allergen' || b.category === 'cross_contamination' ? 1 : 0;
    return emergencyB - emergencyA || priorityScore(b.priority) - priorityScore(a.priority) || a.text.localeCompare(b.text, 'fr');
  });
}

function emergencyOutro(language: ServerAssistantLanguage): string {
  return {
    fr: 'Merci. Si vous ne pouvez pas confirmer précisément, je ne prendrai pas ce plat.',
    en: 'Thank you. If you cannot confirm this precisely, I will not order this dish.',
    es: 'Gracias. Si no puede confirmarlo con precisión, no pediré este plato.',
    it: 'Grazie. Se non può confermarlo con precisione, non ordinerò questo piatto.',
    de: 'Danke. Wenn Sie das nicht genau bestätigen können, werde ich dieses Gericht nicht bestellen.',
  }[language];
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeText(term)));
}
