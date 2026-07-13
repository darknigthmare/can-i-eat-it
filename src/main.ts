import './styles.css';
import { SAMPLE_MENUS } from './data/dishes';
import { EU_MAJOR_ALLERGENS, INGREDIENTS } from './data/ingredients';
import { DEFAULT_PROFILE, RULE_DESCRIPTIONS, RULE_LABELS, STRICTNESS_LABELS } from './data/rules';
import { analyzeMenuForGroup, analyzeMenuItems, sortGroupRowsByRisk, sortResultsByRisk } from './engine/compatibility';
import { captureMenuPhoto, isNativeCameraAvailable } from './engine/camera';
import { deleteRemoteLearnedDish, fetchCommunityContributions, fetchLearnedDishes, fetchPublicDatabase, fetchRestaurants, isBackendConfigured, pingBackend, pushCommunityContribution, pushLearnedDish, pushRestaurantMemory, pushScanRecord, searchRestaurantsRemote, updateContributionStatus } from './engine/backendClient';
import { buildQuestionSheet, downloadScanAsJson } from './engine/export';
import { applyModerationPatch, buildModerationReviews, buildModerationSummary, buildPublicDatabaseExport, contributionIsImportable, contributionToLearnedDish, downloadPublicDatabaseExport, findContributionDuplicateClusters, isContributionShareable, makeContributionFromAnalysis, makeContributionFromLearnedDish, mergeContributionCluster, summarizeContribution } from './engine/community';
import { buildGroupSuggestions, buildOrderPlanText, buildSingleSuggestions } from './engine/recommendations';
import { buildSafeOrderPlanFromRecord } from './engine/safeOrder';
import { answerValueLabel, buildServerAssistant, languageName, type ServerAnswerMap, type ServerAnswerValue, type ServerAssistantLanguage, type ServerAssistantTone, type ServerAssistantUrgency } from './engine/serverAssistant';
import { buildKnownMenuText, buildRestaurantInsight, markRestaurantVisit, searchRestaurantInsights, toggleRestaurantFavorite } from './engine/restaurantIntelligence';
import { getIngredientById, getIngredientRiskLevel, getLearnedDishes, importLearnedDishes, ingredientDisplayLabel, learnedDishToCsv, removeLearnedDish, searchIngredients, upsertLearnedDish } from './engine/learning';
import { lookupOpenFoodFacts } from './engine/openFoodFacts';
import { fileToImagePreview, readMenuImageAdvanced } from './engine/ocr';
import { parseMenuText } from './engine/menuParser';
import { autoCorrectOcrMenuText, buildOcrAdvancedReport, buildOcrZoneDraft, mergeZoneIntoMenuText, summarizeOcrReport } from './engine/advancedOcr';
import { applyMenuTranslationToText, buildMenuTranslationReport, menuTranslationLanguageLabel, supportedMenuTranslationLanguages, type MenuTranslationLanguage, type MenuTranslationReport } from './engine/menuTranslation';
import { registerServiceWorker } from './engine/pwa';
import {
  clearCommunityQueue,
  clearHistory,
  DEFAULT_SETTINGS,
  enqueueCommunityContribution,
  importRestaurants,
  loadActiveRestaurantId,
  loadCachedPublicDatabase,
  loadCommunityQueue,
  loadHistory,
  loadProfiles,
  loadRestaurants,
  loadSettings,
  removeRestaurantMemory,
  resetAllProfiles,
  saveActiveRestaurantId,
  saveCachedPublicDatabase,
  saveCommunityQueue,
  saveProfile,
  saveProfiles,
  saveScanRecord,
  saveSettings,
  updateCommunityContribution,
  upsertRestaurantMemory,
} from './engine/storage';
import type { AllergenId, AnalysisResult, AppSettings, BackendHealth, ContributionDuplicateCluster, ContributionStatus, DecisionStatus, GroupAnalysisRow, Ingredient, LearnedDish, ModerationReview, OcrAdvancedReport, PublicDatabaseExport, PublicDishContribution, RestaurantMemory, RuleId, SafeOrderChoice, SafeOrderModification, SafeOrderPlan, ScanRecord, Strictness, UserProfile } from './types';
import { normalizeText } from './engine/text';

const appRoot = document.querySelector<HTMLDivElement>('#app');
if (!appRoot) throw new Error('App root not found');
const app = appRoot;


interface RestaurantDraft {
  name: string;
  city: string;
  address: string;
  notes: string;
}

interface LearningDraft {
  itemId: string;
  learnedId?: string;
  source: 'analysis' | 'memory';
  dishName: string;
  selectedIngredientIds: string[];
  ingredientSearch: string;
  restaurantName: string;
  aliasesText: string;
  notes: string;
  missingTerms: string[];
}

const LEARNING_PACKS: { id: string; label: string; ingredientIds: string[] }[] = [
  { id: 'halal-risk', label: 'Viande halal à vérifier', ingredientIds: ['poulet', 'boeuf', 'certification_halal', 'huile_friture', 'sauce_maison'] },
  { id: 'dairy', label: 'Lait/fromage', ingredientIds: ['lait', 'fromage', 'creme', 'beurre', 'yaourt'] },
  { id: 'gluten', label: 'Gluten/panure', ingredientIds: ['gluten_ble', 'orge_biere', 'huile_friture'] },
  { id: 'hidden-sauce', label: 'Sauce maison risquée', ingredientIds: ['sauce_maison', 'oeuf', 'moutarde', 'lait', 'bouillon'] },
  { id: 'veggie-safe', label: 'Base végétarienne', ingredientIds: ['label_vegetarien', 'legumes', 'riz', 'pois_chiche', 'epices'] },
  { id: 'vegan-safe', label: 'Base vegan', ingredientIds: ['label_vegan', 'legumes', 'riz', 'pois_chiche', 'epices'] },
  { id: 'seafood', label: 'Poisson/fruits de mer', ingredientIds: ['poisson_blanc', 'saumon', 'thon', 'crevette', 'mollusques'] },
  { id: 'alcohol', label: 'Alcool/vin', ingredientIds: ['vin', 'alcool_spiritueux', 'sulfites'] },
];

const rules = Object.keys(RULE_LABELS) as RuleId[];
const allergens = EU_MAJOR_ALLERGENS.map((item) => item.id);

let profiles: UserProfile[] = loadProfiles();
let settings: AppSettings = normalizeSettings(loadSettings());
let history = loadHistory();
let currentRecord: ScanRecord | null = history[0] ?? null;
let menuText = currentRecord?.rawText ?? SAMPLE_MENUS[0].text;
let results: AnalysisResult[] = currentRecord?.results ?? [];
let groupRows: GroupAnalysisRow[] = currentRecord?.groupRows ?? [];
let imagePreview = '';
let selectedImageName = '';
let selectedImageFile: File | null = null;
let ocrStatus = '';
let ocrReport: OcrAdvancedReport | null = null;
let ocrZoneDraft = '';
let translationReport: MenuTranslationReport | null = null;
let translationSourceLanguage: MenuTranslationLanguage = 'auto';
let translationStatus = '';
let activeSource: ScanRecord['source'] = currentRecord?.source ?? 'sample';
let offLookups: Record<string, string> = {};
let learnedDishes: LearnedDish[] = getLearnedDishes();
let restaurantMemories: RestaurantMemory[] = loadRestaurants();
let activeRestaurantId = loadActiveRestaurantId();
let restaurantDraft: RestaurantDraft = createRestaurantDraft(getActiveRestaurant());
let restaurantRemoteMatches: RestaurantMemory[] = [];
let orderPlanStatus = '';
const backendConfigured = isBackendConfigured();
const moderationEnabled = backendConfigured && ['localhost', '127.0.0.1'].includes(window.location.hostname);
let backendHealth: BackendHealth | null = null;
let backendStatus = backendConfigured ? 'Service de synchronisation non vérifié' : 'Données conservées sur cet appareil';
let syncStatus = '';
let learningDraft: LearningDraft | null = null;
let learningModalWasOpen = false;
let communityQueue: PublicDishContribution[] = loadCommunityQueue();
let publicDbCache: PublicDatabaseExport | null = loadCachedPublicDatabase();
let communityStatus = '';
let communitySearch = '';
let publicSearchResults: PublicDishContribution[] = [];
let moderationItems: PublicDishContribution[] = [];
let moderationFilter: ContributionStatus | 'all' | 'needs_review' | 'duplicates' = 'pending_review';
let moderationSearch = '';
let moderationStatus = '';
let serverAssistantTone: ServerAssistantTone = 'polite';
let serverAssistantLanguage: ServerAssistantLanguage = 'fr';
let serverAssistantUrgency: ServerAssistantUrgency = 'standard';
let serverAnswers: ServerAnswerMap = {};
let serverAssistantStatus = '';

type AppView = 'scanner' | 'results' | 'restaurants' | 'community' | 'profile';
type ProfileTab = 'identity' | 'diet' | 'allergies' | 'personal' | 'history' | 'privacy';

const APP_VIEWS: { id: AppView; label: string; title: string; description: string }[] = [
  { id: 'scanner', label: 'Scanner', title: 'Scanner un menu', description: 'Prends une photo ou colle le texte du menu, puis lance l’analyse.' },
  { id: 'results', label: 'Résultats', title: 'Choisir sans hésiter', description: 'Retrouve les plats compatibles, les risques et les questions à poser.' },
  { id: 'restaurants', label: 'Restaurants', title: 'Mes restaurants', description: 'Mémorise les bonnes adresses et retrouve les menus déjà analysés.' },
  { id: 'community', label: 'Communauté', title: 'Base communautaire', description: 'Partage des corrections anonymisées et améliore la qualité des données.' },
  { id: 'profile', label: 'Profil', title: 'Mon profil alimentaire', description: 'Gère tes règles, allergies, préférences, historique et corrections.' },
];

registerServiceWorker();

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function render() {
  const activeProfile = getActiveProfile();
  const displayedResults = filterResults(settings.riskFirst ? sortResultsByRisk(results) : results);
  const displayedGroupRows = filterGroupRows(settings.riskFirst ? sortGroupRowsByRisk(groupRows) : groupRows);
  const stats = settings.mode === 'group' ? buildGroupStats(displayedGroupRows) : buildStats(displayedResults);
  const view = getAppView();
  const viewMeta = APP_VIEWS.find((item) => item.id === view) ?? APP_VIEWS[0];

  app.innerHTML = `
    <a class="skip-link" href="#main-content">Aller au contenu principal</a>
    <div class="app-shell">
      <header class="app-header">
        <a class="brand" href="#/scanner" aria-label="Can I Eat It, scanner un menu">
          <span class="brand__mark">CIEI</span>
          <span><strong>Can I Eat It</strong><small>Décider simplement</small></span>
        </a>
        <nav class="desktop-nav" aria-label="Navigation principale">
          ${renderNavigation(view)}
        </nav>
        <a class="profile-shortcut" href="#/profile" aria-label="Ouvrir le profil ${escapeHtml(activeProfile.name)}">
          <span class="profile-shortcut__avatar">${escapeHtml(profileInitial(activeProfile))}</span>
          <span><small>Profil actif</small><strong>${escapeHtml(activeProfile.name)}</strong></span>
        </a>
      </header>

      <main class="screen-shell" id="main-content">
        <header class="screen-heading">
          <div>
            <p class="eyebrow">${escapeHtml(viewMeta.label)}</p>
            <h1>${escapeHtml(viewMeta.title)}</h1>
            <p>${escapeHtml(viewMeta.description)}</p>
          </div>
          <div class="screen-status" title="${escapeHtml(backendStatus)}" role="status" aria-live="polite">
            <span class="backend-dot ${backendHealth?.ok ? 'backend-dot--online' : backendConfigured ? 'backend-dot--offline' : 'backend-dot--local'}"></span>
            <span>${backendHealth?.ok ? 'Synchronisé' : backendConfigured ? 'Service hors ligne' : 'Données locales'}</span>
          </div>
        </header>

        ${renderActiveView(view, activeProfile, displayedResults, displayedGroupRows, stats)}
      </main>

      <nav class="mobile-nav" aria-label="Navigation mobile">
        ${renderNavigation(view, true)}
      </nav>
      ${learningDraft ? renderLearningModal(learningDraft) : ''}
    </div>
  `;

  const shouldFocusLearningModal = Boolean(learningDraft) && !learningModalWasOpen;
  learningModalWasOpen = Boolean(learningDraft);
  if (shouldFocusLearningModal) {
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#learningDialog')?.focus());
  }
}

function getAppView(): AppView {
  const requested = window.location.hash.replace(/^#\/?/, '').split('/')[0] as AppView;
  return APP_VIEWS.some((item) => item.id === requested) ? requested : 'scanner';
}

function navigateToView(view: AppView): void {
  const nextHash = `#/${view}`;
  if (window.location.hash === nextHash) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
    return;
  }
  window.location.hash = nextHash;
}

function renderNavigation(activeView: AppView, compact = false): string {
  return APP_VIEWS.map((item) => `
    <a href="#/${item.id}" class="nav-link ${item.id === activeView ? 'nav-link--active' : ''}" ${item.id === activeView ? 'aria-current="page"' : ''}>
      <span>${escapeHtml(compact && item.id === 'community' ? 'Base' : item.label)}</span>
      ${item.id === 'results' && currentRecord ? '<em>1</em>' : ''}
    </a>
  `).join('');
}

function profileInitial(profile: UserProfile): string {
  return profile.name.trim().charAt(0).toUpperCase() || 'P';
}

function renderActiveView(
  view: AppView,
  activeProfile: UserProfile,
  displayedResults: AnalysisResult[],
  displayedGroupRows: GroupAnalysisRow[],
  stats: ReturnType<typeof buildStats>,
): string {
  if (view === 'results') return renderResultsScreen(displayedResults, displayedGroupRows, stats);
  if (view === 'restaurants') return `<div class="screen-stack">${renderRestaurantCockpit()}</div>`;
  if (view === 'community') return renderCommunityScreen();
  if (view === 'profile') return renderProfileScreen(activeProfile);
  return renderScannerScreen(activeProfile);
}

function renderScannerScreen(activeProfile: UserProfile): string {
  const profileRules = activeProfile.rules.map((rule) => RULE_LABELS[rule]);
  const profileAlerts = activeProfile.allergens.map((allergen) => EU_MAJOR_ALLERGENS.find((item) => item.id === allergen)?.label).filter(Boolean) as string[];
  const profileTags = [...profileRules, ...profileAlerts].slice(0, 5);

  return `
    <div class="scan-layout">
      <section class="card scanner-card scanner-card--focused">
        <div class="card__header">
          <div>
            <p class="eyebrow">Étape 1 sur 2</p>
            <h2>Ajouter le menu</h2>
          </div>
          <span class="pill">${sourceLabel(activeSource)}</span>
        </div>

        <label class="drop-zone drop-zone--primary">
          <input id="imageInput" type="file" accept="image/*" capture="environment" />
          <strong>Prendre ou importer une photo</strong>
          <small>${selectedImageName ? escapeHtml(selectedImageName) : 'Le texte du menu sera extrait automatiquement.'}</small>
        </label>

        <div class="actions scan-photo-actions">
          ${isNativeCameraAvailable() ? '<button class="ghost" data-action="capture-camera">Ouvrir la caméra</button>' : ''}
          <button class="ghost" data-action="run-ocr" ${selectedImageFile ? '' : 'disabled'}>Extraire le texte</button>
          <span class="status-line" role="status" aria-live="polite">${escapeHtml(ocrStatus)}</span>
        </div>

        ${imagePreview ? `<div class="image-preview"><img src="${imagePreview}" alt="Photo du menu importée" /></div>` : ''}

        <label class="field menu-field">
          <span>Texte du menu</span>
          <textarea id="menuText" rows="12" spellcheck="false" placeholder="Colle ici le texte du menu…">${escapeHtml(menuText)}</textarea>
        </label>

        <div class="scan-submit">
          <div>
            <strong>Prêt à vérifier ce menu ?</strong>
            <span>L’analyse utilise le profil ${escapeHtml(activeProfile.name)}.</span>
          </div>
          <button class="primary primary--large" data-action="analyze">Analyser le menu</button>
        </div>
      </section>

      <aside class="scan-sidebar">
        <section class="card active-profile-card">
          <div class="active-profile-card__top">
            <span class="profile-shortcut__avatar">${escapeHtml(profileInitial(activeProfile))}</span>
            <div><small>Analyse avec</small><strong>${escapeHtml(activeProfile.name)}</strong></div>
          </div>
          <div class="segmented" role="tablist" aria-label="Mode d'analyse">
            <button class="segment ${settings.mode === 'single' ? 'segment--active' : ''}" role="tab" aria-selected="${settings.mode === 'single'}" data-action="set-mode" data-mode="single">Solo</button>
            <button class="segment ${settings.mode === 'group' ? 'segment--active' : ''}" role="tab" aria-selected="${settings.mode === 'group'}" data-action="set-mode" data-mode="group">Groupe</button>
          </div>
          ${settings.mode === 'group' ? renderGroupProfilePicker() : `
            <div class="profile-tag-list">
              ${profileTags.length ? profileTags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join('') : '<span>Aucune règle active</span>'}
            </div>
          `}
          <a class="secondary-link" href="#/profile">Modifier mon profil</a>
        </section>

        <section class="card sample-card">
          <div class="card__header card__header--compact">
            <div><p class="eyebrow">Essayer rapidement</p><h2>Menus exemples</h2></div>
          </div>
          <div class="sample-list">
            ${SAMPLE_MENUS.map((sample) => `<button class="sample-button" data-action="sample" data-sample-id="${sample.id}"><span>${escapeHtml(sample.name)}</span><small>Charger cet exemple</small></button>`).join('')}
          </div>
        </section>
      </aside>
    </div>

    <section class="scan-tools" aria-label="Outils de lecture du menu">
      <details class="tool-drawer">
        <summary><span><strong>Outils OCR avancés</strong><small>Nettoyer une photo difficile ou isoler une zone douteuse.</small></span><em>Ouvrir</em></summary>
        ${renderAdvancedOcrPanel()}
      </details>
      <details class="tool-drawer">
        <summary><span><strong>Traduire un menu étranger</strong><small>Détecter la langue et enrichir les ingrédients avant l’analyse.</small></span><em>Ouvrir</em></summary>
        ${renderMenuTranslationPanel()}
      </details>
    </section>
  `;
}

function renderResultsScreen(displayedResults: AnalysisResult[], displayedGroupRows: GroupAnalysisRow[], stats: ReturnType<typeof buildStats>): string {
  if (!currentRecord) {
    return `
      <section class="card empty-screen">
        <p class="eyebrow">Aucune analyse en cours</p>
        <h2>Commence par scanner un menu</h2>
        <p>Les plats compatibles, les alertes et les questions à poser apparaîtront ici.</p>
        <a class="primary primary-link" href="#/scanner">Scanner un menu</a>
      </section>
    `;
  }

  const activeTab = getResultsTab();

  return `
    <section class="result-summary" aria-label="Résumé de l'analyse">
      <div class="score score--safe"><strong>${stats.safe}</strong><span>Compatibles</span></div>
      <div class="score score--caution"><strong>${stats.caution}</strong><span>À vérifier</span></div>
      <div class="score score--blocked"><strong>${stats.blocked}</strong><span>À éviter</span></div>
      <div class="score score--unknown"><strong>${stats.unknown}</strong><span>Inconnus</span></div>
    </section>
    <nav class="section-tabs" aria-label="Vues des résultats">
      <a href="#/results/summary" class="section-tab ${activeTab === 'summary' ? 'section-tab--active' : ''}" ${activeTab === 'summary' ? 'aria-current="page"' : ''}>Résumé</a>
      <a href="#/results/dishes" class="section-tab ${activeTab === 'dishes' ? 'section-tab--active' : ''}" ${activeTab === 'dishes' ? 'aria-current="page"' : ''}>Tous les plats</a>
      <a href="#/results/assistant" class="section-tab ${activeTab === 'assistant' ? 'section-tab--active' : ''}" ${activeTab === 'assistant' ? 'aria-current="page"' : ''}>Assistant serveur</a>
    </nav>
    <div class="screen-stack result-tab-panel">
      ${activeTab === 'dishes'
        ? renderResultsPanel(displayedResults, displayedGroupRows)
        : activeTab === 'assistant'
          ? renderServerAssistantPanel()
          : renderSafeOrderMode()}
    </div>
  `;
}

function getResultsTab(): 'summary' | 'dishes' | 'assistant' {
  const tab = window.location.hash.replace(/^#\/?/, '').split('/')[1];
  return tab === 'dishes' || tab === 'assistant' ? tab : 'summary';
}

function renderResultsPanel(displayedResults: AnalysisResult[], displayedGroupRows: GroupAnalysisRow[]): string {
  return `
    <section class="card results-card">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Analyse détaillée</p>
          <h2>${settings.mode === 'group' ? `${displayedGroupRows.length} plat(s) · ${getEnabledProfiles().length} profil(s)` : `${displayedResults.length} plat(s) analysé(s)`}</h2>
        </div>
        <div class="toolbar">
          <select id="statusFilter" aria-label="Filtrer par statut">${renderStatusOptions(settings.statusFilter)}</select>
          <input id="resultSearch" type="search" value="${escapeHtml(settings.resultSearch)}" placeholder="Rechercher un plat…" />
          <button class="ghost" data-action="copy-question-sheet">Copier les questions</button>
          <button class="ghost" data-action="export-json">Exporter</button>
          <button class="ghost" data-action="clear-results">Vider</button>
        </div>
      </div>
      ${settings.mode === 'group'
        ? (displayedGroupRows.length ? `<div class="group-list">${displayedGroupRows.map(renderGroupRowCard).join('')}</div>` : renderEmptyResults())
        : (displayedResults.length ? `<div class="result-list">${displayedResults.map(renderResultCard).join('')}</div>` : renderEmptyResults())}
    </section>
  `;
}

function renderProfileScreen(activeProfile: UserProfile): string {
  const restrictionCount = activeProfile.rules.length + activeProfile.allergens.length + activeProfile.intolerances.length;
  const activeTab = getProfileTab();
  return `
    ${renderProfileTabs(activeTab)}
    <div class="profile-layout profile-layout--focused">
      <section class="card profile-card profile-editor-card" aria-labelledby="profile-panel-title">
        ${renderProfileTabContent(activeTab, activeProfile)}
      </section>
      <aside class="profile-aside">
        <section class="card profile-overview">
          <div class="profile-overview__identity">
            <span class="profile-overview__avatar">${escapeHtml(profileInitial(activeProfile))}</span>
            <div><p class="eyebrow">Profil actif</p><h2>${escapeHtml(activeProfile.name)}</h2></div>
          </div>
          <div class="profile-overview__stats">
            <div><strong>${restrictionCount}</strong><span>règles actives</span></div>
            <div><strong>${activeProfile.strictness === 'strict' ? 'Strict' : activeProfile.strictness === 'relaxed' ? 'Souple' : 'Normal'}</strong><span>prudence</span></div>
            <div><strong>${history.length}</strong><span>scans enregistrés</span></div>
          </div>
        </section>
        ${activeTab === 'identity' ? renderAnalysisModeCard() : ''}
      </aside>
    </div>
  `;
}

function getProfileTab(): ProfileTab {
  const tab = window.location.hash.replace(/^#\/?/, '').split('/')[1] as ProfileTab;
  return ['identity', 'diet', 'allergies', 'personal', 'history', 'privacy'].includes(tab) ? tab : 'identity';
}

function renderProfileTabs(activeTab: ProfileTab): string {
  const tabs: Array<[ProfileTab, string]> = [
    ['identity', 'Identité'],
    ['diet', 'Alimentation'],
    ['allergies', 'Allergies'],
    ['personal', 'Personnalisation'],
    ['history', 'Historique'],
    ['privacy', 'Confidentialité'],
  ];
  return `
    <nav class="section-tabs profile-tabs" aria-label="Sections du profil">
      ${tabs.map(([id, label]) => `<a href="#/profile/${id}" class="section-tab ${activeTab === id ? 'section-tab--active' : ''}" ${activeTab === id ? 'aria-current="page"' : ''}>${label}</a>`).join('')}
    </nav>
  `;
}

function renderProfileTabContent(tab: ProfileTab, profile: UserProfile): string {
  if (tab === 'diet') {
    return `
      <div class="card__header"><div><p class="eyebrow">Alimentation</p><h2 id="profile-panel-title">Règles alimentaires</h2></div></div>
      <p class="muted">Active uniquement les règles qui doivent réellement modifier les recommandations.</p>
      <div class="check-grid">
        ${rules.map((rule) => renderCheckbox('rule', rule, RULE_LABELS[rule], profile.rules.includes(rule), RULE_DESCRIPTIONS[rule])).join('')}
      </div>
    `;
  }
  if (tab === 'allergies') {
    return `
      <div class="card__header"><div><p class="eyebrow">Sécurité</p><h2 id="profile-panel-title">Allergies et intolérances</h2></div></div>
      <p class="muted">Une allergie est traitée plus strictement qu’une intolérance. En cas de doute, confirme toujours avec le restaurant.</p>
      <h3>Allergies déclarées</h3>
      <div class="check-grid">
        ${EU_MAJOR_ALLERGENS.map((allergen) => renderCheckbox('allergen', allergen.id, allergen.label, profile.allergens.includes(allergen.id), allergen.examples)).join('')}
      </div>
      <h3>Intolérances et sensibilités</h3>
      <div class="check-grid">
        ${EU_MAJOR_ALLERGENS.map((allergen) => renderCheckbox('intolerance', allergen.id, allergen.label, profile.intolerances.includes(allergen.id), allergen.examples)).join('')}
      </div>
    `;
  }
  if (tab === 'personal') {
    return `
      <div class="card__header"><div><p class="eyebrow">Personnalisation</p><h2 id="profile-panel-title">Termes et corrections</h2></div></div>
      <label class="field">
        <span>Termes interdits personnalisés</span>
        <input id="forbiddenTerms" type="text" value="${escapeHtml(profile.customForbiddenTerms.join(', '))}" placeholder="porc, alcool, gélatine..." />
      </label>
      <label class="field">
        <span>Termes à vérifier personnalisés</span>
        <input id="cautionTerms" type="text" value="${escapeHtml(profile.customCautionTerms.join(', '))}" placeholder="sauce maison, bouillon..." />
      </label>
      ${renderMemoryCard(true)}
    `;
  }
  if (tab === 'history') return renderHistoryCard(true);
  if (tab === 'privacy') {
    return `
      <div class="card__header"><div><p class="eyebrow">Confidentialité</p><h2 id="profile-panel-title">Données sur cet appareil</h2></div></div>
      <div class="privacy-notice">
        <strong>Stockage local non chiffré</strong>
        <span>Les profils, allergies, historiques et corrections sont enregistrés dans le stockage de ce navigateur. Ils ne sont pas envoyés tant qu’aucun service de synchronisation n’est configuré.</span>
      </div>
      <p class="muted">Toute personne ayant accès à cette session de navigateur peut potentiellement consulter ces données. Évite un appareil partagé pour un profil sensible.</p>
      <button class="ghost danger-action" data-action="reset-profiles">Réinitialiser profils et résultats</button>
    `;
  }
  return `
    <div class="card__header card__header--wrap">
      <div><p class="eyebrow">Identité</p><h2 id="profile-panel-title">Profil utilisé pour l’analyse</h2></div>
      <div class="actions">
        <button class="ghost" data-action="duplicate-profile">Dupliquer</button>
        <button class="ghost danger-action" data-action="delete-profile" ${profiles.length <= 1 ? 'disabled' : ''}>Supprimer</button>
      </div>
    </div>
    <label class="field">
      <span>Profil à modifier</span>
      <select id="activeProfileId">
        ${profiles.map((item) => `<option value="${escapeHtml(item.id ?? '')}" ${item.id === profile.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
      </select>
    </label>
    <label class="field"><span>Nom du profil</span><input id="profileName" type="text" value="${escapeHtml(profile.name)}" /></label>
    <label class="field">
      <span>Niveau de prudence</span>
      <select id="strictness">
        ${(['relaxed', 'normal', 'strict'] as Strictness[]).map((level) => `<option value="${level}" ${profile.strictness === level ? 'selected' : ''}>${STRICTNESS_LABELS[level]}</option>`).join('')}
      </select>
    </label>
    <div class="notice"><strong>Important</strong><span>L’app aide à décider, mais ne remplace pas la confirmation du restaurant, surtout pour les allergies.</span></div>
  `;
}

function renderAnalysisModeCard(): string {
  return `
    <section class="card analysis-mode-card">
      <p class="eyebrow">Mode d’analyse</p>
      <h2>Solo ou groupe</h2>
      <div class="segmented" role="tablist" aria-label="Mode d'analyse">
        <button class="segment ${settings.mode === 'single' ? 'segment--active' : ''}" role="tab" aria-selected="${settings.mode === 'single'}" data-action="set-mode" data-mode="single">Solo</button>
        <button class="segment ${settings.mode === 'group' ? 'segment--active' : ''}" role="tab" aria-selected="${settings.mode === 'group'}" data-action="set-mode" data-mode="group">Groupe</button>
      </div>
      ${settings.mode === 'group' ? renderGroupProfilePicker() : '<p class="muted">Le prochain scan utilisera uniquement le profil actif.</p>'}
    </section>
  `;
}

function renderHistoryCard(embedded = false): string {
  const tag = embedded ? 'div' : 'article';
  return `
    <${tag} class="${embedded ? 'embedded-profile-panel' : 'card'} history-card">
      <div class="card__header">
        <div><p class="eyebrow">Historique</p><h2 id="${embedded ? 'profile-panel-title' : 'history-card-title'}">${history.length} scan(s)</h2></div>
        <button class="ghost danger-action" data-action="clear-history" ${history.length ? '' : 'disabled'}>Effacer</button>
      </div>
      ${history.length ? `<div class="history-list">${history.slice(0, 12).map(renderHistoryItem).join('')}</div>` : '<p class="muted">Tes prochaines analyses apparaîtront ici pour être consultées à nouveau.</p>'}
    </${tag}>
  `;
}

function renderMemoryCard(embedded = false): string {
  const tag = embedded ? 'div' : 'article';
  return `
    <${tag} class="${embedded ? 'embedded-profile-panel' : 'card'} memory-card">
      <div class="card__header card__header--wrap">
        <div><p class="eyebrow">Mémoire personnelle</p><h2>${learnedDishes.length} correction(s)</h2></div>
        ${backendConfigured ? `<div class="actions">
          <button class="ghost" data-action="refresh-backend">Tester la synchro</button>
          <button class="ghost" data-action="sync-backend">Synchroniser</button>
        </div>` : ''}
      </div>
      <p class="muted">Les corrections apprises passent avant les estimations générales pour tes prochains scans.</p>
      ${syncStatus ? `<p class="sync-status" role="status" aria-live="polite">${escapeHtml(syncStatus)}</p>` : ''}
      ${learnedDishes.length ? `<div class="memory-list">${learnedDishes.slice(0, 12).map(renderLearnedDishItem).join('')}</div>` : '<p class="muted">Aucune correction apprise pour le moment.</p>'}
    </${tag}>
  `;
}

function renderCommunityScreen(): string {
  return `
    <div class="screen-stack">
      <section class="card knowledge-card">
        <div class="card__header"><div><p class="eyebrow">Moteur local</p><h2>${INGREDIENTS.length} ingrédients et risques reconnus</h2></div></div>
        <p class="muted">Porc, alcool, lactose, gluten, fruits de mer, allergènes, gélatine, bouillons, sauces cachées et contamination croisée.</p>
        <div class="tag-cloud">${INGREDIENTS.slice(0, 24).map((ingredient) => `<span>${escapeHtml(ingredient.names[0])}</span>`).join('')}</div>
      </section>
      ${renderCommunityPanel()}
      ${moderationEnabled ? `<details class="tool-drawer moderation-drawer">
        <summary><span><strong>Modération et qualité</strong><small>Réservé à la validation des contributions publiques.</small></span><em>Ouvrir</em></summary>
        ${renderModerationPanel()}
      </details>` : ''}
    </div>
  `;
}


function renderAdvancedOcrPanel(): string {
  const items = parseMenuText(menuText);
  const report = ocrReport;
  const summary = report ? summarizeOcrReport(report) : `${items.length} plat(s) détectable(s) dans le texte actuel`;
  const qualityClass = report ? (report.qualityScore >= 80 ? 'safe' : report.qualityScore >= 55 ? 'caution' : 'blocked') : 'unknown';
  const issues = report?.issues ?? [];
  const sections = report?.sections ?? [];

  return `
    <section class="card advanced-ocr-card">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Outils OCR</p>
          <h2>Diagnostic de lecture du menu</h2>
          <p class="muted">Nettoyage OCR, détection colonnes/sections/prix, lignes collées et zone à recontrôler avant l’analyse alimentaire.</p>
        </div>
        <div class="toolbar">
          <button class="ghost" data-action="build-ocr-report">Diagnostic OCR</button>
          <button class="ghost" data-action="auto-correct-ocr">Nettoyer texte</button>
          <button class="ghost" data-action="extract-ocr-zone">Isoler zone douteuse</button>
          <button class="ghost" data-action="use-ocr-preview" ${report?.correctedTextPreview ? '' : 'disabled'}>Appliquer preview</button>
        </div>
      </div>

      <div class="ocr-metrics">
        <div class="ocr-metric ocr-metric--${qualityClass}"><strong>${report ? report.qualityScore : '—'}</strong><span>qualité OCR</span></div>
        <div class="ocr-metric"><strong>${report?.menuItemsDetected ?? items.length}</strong><span>plats détectés</span></div>
        <div class="ocr-metric"><strong>${report?.priceCount ?? '—'}</strong><span>prix</span></div>
        <div class="ocr-metric"><strong>${report?.sectionCount ?? '—'}</strong><span>sections</span></div>
        <div class="ocr-metric"><strong>${report?.suspectedColumns ?? '—'}</strong><span>colonnes</span></div>
      </div>

      <p class="sync-status">${escapeHtml(summary)}</p>

      <div class="advanced-ocr-layout">
        <div class="ocr-panel">
          <div class="ocr-panel__title">
            <strong>Problèmes détectés</strong>
            <span>${issues.length ? `${issues.length} point(s) à contrôler` : 'aucun diagnostic bloquant'}</span>
          </div>
          ${issues.length ? `<div class="ocr-issue-list">${issues.slice(0, 8).map(renderOcrIssue).join('')}</div>` : '<p class="muted">Lance le diagnostic OCR après import/photo ou modification du texte pour voir les lignes suspectes.</p>'}
        </div>

        <div class="ocr-panel">
          <div class="ocr-panel__title">
            <strong>Sections reconnues</strong>
            <span>${sections.length ? `${sections.length} section(s)` : 'à générer'}</span>
          </div>
          ${sections.length ? `<div class="ocr-section-list">${sections.slice(0, 8).map((section) => `
            <span class="ocr-section-chip"><strong>${escapeHtml(section.title)}</strong><small>${section.itemCount} plat(s), lignes ${section.lineStart}-${section.lineEnd}</small></span>
          `).join('')}</div>` : '<p class="muted">Les sections aident à éviter de mélanger entrées, plats, desserts et boissons.</p>'}
        </div>
      </div>

      <details class="ocr-details" ${ocrZoneDraft ? 'open' : ''}>
        <summary>Zone à recontrôler / re-scanner manuellement</summary>
        <p class="muted">Colle ici uniquement une zone du menu, ou utilise “Isoler zone douteuse”. Tu peux ensuite analyser seulement cette zone ou la fusionner au menu complet.</p>
        <textarea id="ocrZoneDraft" rows="6" spellcheck="false" placeholder="Ex : copie une colonne ou un bloc flou du menu…">${escapeHtml(ocrZoneDraft)}</textarea>
        <div class="actions">
          <button class="primary" data-action="analyze-ocr-zone" ${ocrZoneDraft.trim() ? '' : 'disabled'}>Analyser uniquement cette zone</button>
          <button class="ghost" data-action="merge-ocr-zone" ${ocrZoneDraft.trim() ? '' : 'disabled'}>Fusionner au menu complet</button>
          <button class="ghost" data-action="clear-ocr-zone" ${ocrZoneDraft.trim() ? '' : 'disabled'}>Vider zone</button>
        </div>
      </details>

      ${report?.correctedTextPreview && report.correctedTextPreview !== menuText ? `
        <details class="ocr-details">
          <summary>Preview texte nettoyé</summary>
          <pre class="ocr-preview-text">${escapeHtml(report.correctedTextPreview.slice(0, 3500))}</pre>
        </details>
      ` : ''}
    </section>
  `;
}


function renderMenuTranslationPanel(): string {
  const report = translationReport;
  const languageOptions = supportedMenuTranslationLanguages().map((language) => `
    <option value="${language.value}" ${translationSourceLanguage === language.value ? 'selected' : ''}>${escapeHtml(language.label)}</option>
  `).join('');
  const riskClass = !report ? 'unknown' : report.dangerousIngredientIds.length ? 'blocked' : report.cautionIngredientIds.length ? 'caution' : 'safe';
  const enrichedLines = report?.lineTranslations.filter((line) => line.hits.length > 0).length ?? '—';
  const dangerousHits = report?.glossaryHits.filter((hit) => hit.riskLevel === 'danger') ?? [];
  const cautionHits = report?.glossaryHits.filter((hit) => hit.riskLevel === 'caution') ?? [];

  return `
    <section class="card translation-card">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Traduction du menu</p>
          <h2>Menu étranger → texte exploitable par l’analyse</h2>
          <p class="muted">Détecte anglais, espagnol, italien, allemand, japonais, turc et arabe. Le nom original reste visible, mais les ingrédients traduits sont ajoutés pour le moteur alimentaire.</p>
        </div>
        <div class="toolbar">
          <select id="translationSourceLanguage" aria-label="Langue source du menu">
            ${languageOptions}
          </select>
          <button class="ghost" data-action="build-translation-report">Traduire menu</button>
          <button class="ghost" data-action="apply-translation" ${report ? '' : 'disabled'}>Appliquer au texte</button>
          <button class="primary" data-action="translate-analyze" ${report ? '' : ''}>Traduire + analyser</button>
        </div>
      </div>

      <div class="translation-metrics">
        <div class="translation-metric translation-metric--${riskClass}"><strong>${report ? report.detectionConfidence : '—'}</strong><span>confiance langue</span></div>
        <div class="translation-metric"><strong>${report ? escapeHtml(report.detectedLanguageLabel) : '—'}</strong><span>langue détectée</span></div>
        <div class="translation-metric"><strong>${enrichedLines}</strong><span>lignes enrichies</span></div>
        <div class="translation-metric translation-metric--blocked"><strong>${report?.dangerousIngredientIds.length ?? '—'}</strong><span>dangers</span></div>
        <div class="translation-metric translation-metric--caution"><strong>${report?.cautionIngredientIds.length ?? '—'}</strong><span>prudences</span></div>
      </div>

      <p class="sync-status">${escapeHtml(translationStatus || report?.summary || 'Lance la traduction si le menu contient des noms étrangers ou des ingrédients non français.')}</p>

      <div class="translation-layout">
        <div class="translation-panel">
          <div class="translation-panel__title">
            <strong>Termes à risque reconnus</strong>
            <span>${dangerousHits.length + cautionHits.length ? `${dangerousHits.length + cautionHits.length} terme(s)` : 'à générer'}</span>
          </div>
          ${report ? renderTranslationRiskTerms(dangerousHits, cautionHits) : '<p class="muted">Exemples : prosciutto → porc, guanciale → porc, panna → crème, wine/vino → alcool.</p>'}
        </div>

        <div class="translation-panel">
          <div class="translation-panel__title">
            <strong>Lignes inconnues</strong>
            <span>${report?.unknownLines.length ?? 0} à vérifier</span>
          </div>
          ${report?.unknownLines.length ? `<div class="translation-unknown-list">${report.unknownLines.slice(0, 8).map((line) => `<code>${escapeHtml(line)}</code>`).join('')}</div>` : '<p class="muted">Les lignes inconnues restent visibles : l’app ne prétend pas traduire ce qu’elle ne reconnaît pas.</p>'}
        </div>
      </div>

      ${report ? `
        <details class="translation-details" open>
          <summary>Aperçu ligne par ligne</summary>
          <div class="translation-line-list">
            ${report.lineTranslations.slice(0, 16).map(renderTranslationLine).join('')}
          </div>
        </details>

        <details class="translation-details">
          <summary>Texte enrichi appliquable à l’analyse</summary>
          <pre class="translation-preview-text">${escapeHtml(report.analysisText.slice(0, 4500))}</pre>
          <div class="actions">
            <button class="ghost" data-action="copy-translated-menu">Copier texte enrichi</button>
            <button class="ghost" data-action="clear-translation-report">Vider traduction</button>
          </div>
        </details>
      ` : ''}
    </section>
  `;
}

function renderTranslationRiskTerms(dangerousHits: MenuTranslationReport['glossaryHits'], cautionHits: MenuTranslationReport['glossaryHits']): string {
  const hits = [...dangerousHits, ...cautionHits].slice(0, 18);
  if (!hits.length) return '<p class="muted">Aucun terme bloquant détecté dans le dictionnaire embarqué.</p>';
  return `<div class="translation-hit-list">${hits.map((hit) => `
    <span class="translation-hit translation-hit--${escapeHtml(hit.riskLevel)}">
      <strong>${escapeHtml(hit.term)}</strong>
      <small>${escapeHtml(menuTranslationLanguageLabel(hit.language))} → ${escapeHtml(hit.translation)}</small>
    </span>
  `).join('')}</div>`;
}

function renderTranslationLine(line: MenuTranslationReport['lineTranslations'][number]): string {
  const topRisk = line.hits.some((hit) => hit.riskLevel === 'danger') ? 'danger' : line.hits.some((hit) => hit.riskLevel === 'caution') ? 'caution' : line.hits.length ? 'safe' : 'unknown';
  return `
    <article class="translation-line translation-line--${topRisk}">
      <div class="translation-line__top">
        <strong>${line.lineNumber}. ${escapeHtml(line.original)}</strong>
        <span>${line.confidence}%</span>
      </div>
      <p>${escapeHtml(line.translated)}</p>
      ${line.warnings.length ? `<ul>${line.warnings.slice(0, 3).map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}
    </article>
  `;
}

function renderOcrIssue(issue: OcrAdvancedReport['issues'][number]): string {
  const icon = issue.severity === 'blocker' ? '⛔' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
  return `
    <article class="ocr-issue ocr-issue--${escapeHtml(issue.severity)}">
      <div><strong>${icon} ${escapeHtml(issue.message)}</strong>${issue.lineNumber ? `<small>Ligne ${issue.lineNumber}</small>` : ''}</div>
      ${issue.lineText ? `<code>${escapeHtml(issue.lineText)}</code>` : ''}
      ${issue.suggestion ? `<small>Suggestion : ${escapeHtml(issue.suggestion)}</small>` : ''}
    </article>
  `;
}


function renderSafeOrderMode(): string {
  const plan = getCurrentSafeOrderPlan();

  if (!plan) {
    return `
      <section class="card safe-order-card safe-order-card--empty">
        <div class="card__header card__header--wrap">
          <div>
          <p class="eyebrow">Décision</p>
          <h2>Comparer les options avant de commander</h2>
          </div>
          <div class="toolbar">
            <button class="ghost" disabled>Copier le plan</button>
            <button class="ghost" disabled>Script serveur</button>
          </div>
        </div>
        <div class="safe-order-empty">
          <strong>Analyse un menu pour générer le plan de commande.</strong>
          <span>Les résultats seront séparés entre options compatibles, options à confirmer et plats à éviter.</span>
        </div>
      </section>
    `;
  }

  const safeChoice = plan.bestChoices[0] ?? null;
  const fallbackChoice = plan.conditionalChoices[0] ?? plan.unknownChoices[0] ?? null;
  const cautionLabel = plan.conditionalChoices.length + plan.unknownChoices.length;

  return `
    <section class="card safe-order-card safe-order-card--v9">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Décision</p>
          <h2>${safeChoice ? `Option compatible : ${escapeHtml(safeChoice.itemName)}` : 'Aucune option confirmée compatible'}</h2>
          ${!safeChoice && fallbackChoice ? `<p class="decision-caution">À vérifier en premier : <strong>${escapeHtml(fallbackChoice.itemName)}</strong>. Ne commande pas sans confirmation.</p>` : ''}
          <p class="muted">${escapeHtml(plan.restaurantName ? `${plan.restaurantName} · ${plan.mode === 'group' ? 'mode groupe' : plan.activeProfileName}` : `${plan.mode === 'group' ? 'mode groupe' : plan.activeProfileName}`)}</p>
        </div>
        <div class="toolbar">
          <button class="ghost" data-action="copy-safe-order-plan">Copier le plan</button>
          <button class="ghost" data-action="copy-safe-order-script">Script serveur</button>
          <button class="ghost" data-action="copy-safe-order-questions" ${plan.questions.length ? '' : 'disabled'}>Copier questions</button>
          <button class="ghost" data-action="copy-safe-order-avoid" ${plan.avoidChoices.length ? '' : 'disabled'}>Copier à éviter</button>
        </div>
      </div>

      <div class="safe-order-metrics">
        <div class="safe-order-metric safe-order-metric--safe"><strong>${plan.bestChoices.length}</strong><span>à commander</span></div>
        <div class="safe-order-metric safe-order-metric--caution"><strong>${cautionLabel}</strong><span>avec vérification</span></div>
        <div class="safe-order-metric safe-order-metric--blocked"><strong>${plan.avoidChoices.length}</strong><span>à éviter</span></div>
        <div class="safe-order-metric"><strong>${plan.questions.length}</strong><span>questions utiles</span></div>
      </div>

      ${plan.safetyWarnings.length ? `<div class="safe-order-warnings">${plan.safetyWarnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join('')}</div>` : ''}

      <div class="safe-order-layout">
        <div class="safe-order-column safe-order-column--best">
          <div class="safe-order-column__title">
            <strong>À commander en priorité</strong>
            <span>${plan.bestChoices.length ? 'choix les plus simples' : 'aucun plat vert'}</span>
          </div>
          ${plan.bestChoices.length ? plan.bestChoices.slice(0, 6).map(renderSafeOrderChoice).join('') : '<p class="muted">Aucun plat n’est assez clair pour être commandé tel quel. Regarde les choix à modifier/vérifier.</p>'}
        </div>

        <div class="safe-order-column safe-order-column--conditional">
          <div class="safe-order-column__title">
            <strong>Possible avec demande</strong>
            <span>modifications et confirmations</span>
          </div>
          ${plan.conditionalChoices.length || plan.unknownChoices.length
            ? [...plan.conditionalChoices, ...plan.unknownChoices].slice(0, 8).map(renderSafeOrderChoice).join('')
            : '<p class="muted">Aucun plat orange/inconnu à traiter.</p>'}
        </div>

        <div class="safe-order-column safe-order-column--avoid">
          <div class="safe-order-column__title">
            <strong>À éviter</strong>
            <span>risque incompatible</span>
          </div>
          ${plan.avoidChoices.length ? plan.avoidChoices.slice(0, 8).map(renderSafeOrderChoice).join('') : '<p class="muted">Aucun plat bloqué dans ce scan.</p>'}
        </div>
      </div>

      ${plan.modifications.length ? `
        <details class="safe-order-details" open>
          <summary>Modifications les plus utiles à demander</summary>
          <div class="safe-order-mod-list">
            ${plan.modifications.slice(0, 10).map(renderSafeOrderModification).join('')}
          </div>
        </details>
      ` : ''}

      ${plan.questions.length ? `
        <details class="safe-order-details">
          <summary>Questions consolidées pour le restaurant</summary>
          <ul class="safe-order-question-list">${plan.questions.slice(0, 12).map((question) => `<li>${escapeHtml(question)}</li>`).join('')}</ul>
        </details>
      ` : ''}
    </section>
  `;
}

function getCurrentSafeOrderPlan(): SafeOrderPlan | null {
  if (!currentRecord || (results.length === 0 && groupRows.length === 0)) return null;
  const restaurant = getActiveRestaurant() ?? currentRecord.restaurant ?? null;
  const record: ScanRecord = {
    ...currentRecord,
    profile: getActiveProfile(),
    profiles: getEnabledProfiles(),
    restaurant: restaurant ?? undefined,
    results,
    groupRows: settings.mode === 'group' ? groupRows : undefined,
  };
  return buildSafeOrderPlanFromRecord(record, restaurant);
}

function renderSafeOrderChoice(choice: SafeOrderChoice): string {
  const modifications = choice.modifications.slice(0, 3);
  const breakdown = choice.profileBreakdown.length > 1
    ? `<div class="safe-order-profiles">${choice.profileBreakdown.map((item) => `<span class="mini-status mini-status--${item.status}">${escapeHtml(item.profileName)} · ${statusLabel(item.status)}</span>`).join('')}</div>`
    : '';

  return `
    <article class="safe-order-choice safe-order-choice--${choice.action} safe-order-choice--${choice.status}">
      <div class="safe-order-choice__top">
        <span class="status-badge status-badge--${choice.status}">${statusLabel(choice.status)}</span>
        <strong>${escapeHtml(choice.itemName)}</strong>
        <em>${confidenceLabel(choice.confidence)}</em>
      </div>
      <p>${escapeHtml(choice.subtitle)}</p>
      <small>${escapeHtml(safeOrderActionLabel(choice.action))} · ${escapeHtml(choice.audienceLabel)}</small>
      ${breakdown}
      ${modifications.length ? `<div class="safe-order-choice__mods">${modifications.map((modification) => `<span>${escapeHtml(modification.label)}</span>`).join('')}</div>` : ''}
      ${choice.blockers.length ? `<ul>${choice.blockers.slice(0, 3).map((blocker) => `<li>${escapeHtml(blocker)}</li>`).join('')}</ul>` : ''}
    </article>
  `;
}

function renderSafeOrderModification(modification: SafeOrderModification): string {
  return `
    <article class="safe-order-mod safe-order-mod--${modification.priority}">
      <strong>${escapeHtml(modification.label)}</strong>
      <span>${escapeHtml(modification.reason)}</span>
      <em>${safeOrderPriorityLabel(modification.priority)}</em>
    </article>
  `;
}

function safeOrderActionLabel(action: SafeOrderChoice['action']): string {
  return {
    order_as_is: 'Commander tel quel',
    order_with_changes: 'Commander avec modification',
    ask_first: 'Demander avant',
    avoid: 'Éviter',
  }[action];
}

function safeOrderPriorityLabel(priority: SafeOrderModification['priority']): string {
  return {
    required: 'obligatoire',
    recommended: 'recommandé',
    optional: 'optionnel',
  }[priority];
}


function renderServerAssistantPanel(): string {
  const plan = getCurrentSafeOrderPlan();

  if (!plan) {
    return `
      <section class="card server-assistant-card server-assistant-card--empty">
        <div class="card__header card__header--wrap">
          <div>
            <p class="eyebrow">Assistant serveur</p>
            <h2>Questions prêtes à lire au restaurant</h2>
          </div>
          <div class="toolbar">
            <button class="ghost" disabled>Copier script</button>
            <button class="ghost" disabled>Lire à voix haute</button>
          </div>
        </div>
        <div class="safe-order-empty">
          <strong>Analyse un menu pour générer l’assistant serveur.</strong>
          <span>Les questions prioritaires seront regroupées en un script court, avec suivi des réponses.</span>
        </div>
      </section>
    `;
  }

  const assistant = buildServerAssistant(plan, {
    tone: serverAssistantTone,
    language: serverAssistantLanguage,
    urgency: serverAssistantUrgency,
  }, serverAnswers);
  const summary = assistant.summary;
  const statusClass = `status-badge--${summary.provisionalStatus}`;

  return `
    <section class="card server-assistant-card server-assistant-card--v11">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Questions prioritaires</p>
          <h2>Assistant serveur · ${escapeHtml(languageName(serverAssistantLanguage))}</h2>
          <p class="muted">Script prêt à lire, mode urgence, réponses cochables et réanalyse après confirmation serveur.</p>
        </div>
        <div class="toolbar">
          <button class="ghost" data-action="copy-server-assistant-main">Copier script</button>
          <button class="ghost" data-action="copy-server-assistant-compact">Version courte</button>
          <button class="ghost" data-action="speak-server-assistant">Lire à voix haute</button>
        </div>
      </div>

      <details class="compact-action-drawer">
        <summary>Actions après échange</summary>
        <div class="actions">
          <button class="ghost" data-action="copy-server-assistant-emergency">Script urgence allergie</button>
          <button class="ghost" data-action="copy-server-answer-sheet">Copier les réponses</button>
          <button class="ghost" data-action="save-server-answer-sheet">Enregistrer les réponses</button>
          <button class="ghost danger-action" data-action="reset-server-answers" ${summary.answered ? '' : 'disabled'}>Effacer les réponses</button>
        </div>
      </details>

      <div class="server-assistant-controls">
        <label class="field field--compact">
          <span>Langue</span>
          <select id="serverAssistantLanguage">
            ${renderServerAssistantLanguageOptions()}
          </select>
        </label>
        <label class="field field--compact">
          <span>Ton</span>
          <select id="serverAssistantTone">
            ${renderServerAssistantToneOptions()}
          </select>
        </label>
        <label class="field field--compact">
          <span>Priorité</span>
          <select id="serverAssistantUrgency">
            ${renderServerAssistantUrgencyOptions()}
          </select>
        </label>
      </div>

      <div class="server-assistant-summary server-assistant-summary--${summary.provisionalStatus}">
        <div>
          <span class="status-badge ${statusClass}">${statusLabel(summary.provisionalStatus)}</span>
          <strong>${escapeHtml(summary.verdict)}</strong>
          <small>${escapeHtml(summary.nextStep)}</small>
        </div>
        <div class="server-assistant-counters">
          <span>${summary.answered}/${summary.total} répondues</span>
          <span>${summary.confirmedSafe} sûres</span>
          <span>${summary.confirmedRisk + summary.notPossible} risques</span>
          <span>${summary.unknown + summary.unanswered} à clarifier</span>
        </div>
      </div>

      ${serverAssistantStatus ? `<p class="sync-status" role="status" aria-live="polite">${escapeHtml(serverAssistantStatus)}</p>` : ''}

      <div class="server-assistant-layout">
        <details class="server-assistant-script server-assistant-script-drawer">
          <summary>Voir le script principal · ${escapeHtml(assistant.mainScript.lines.length.toString())} question(s)</summary>
          <pre>${escapeHtml(assistant.mainScript.fullText)}</pre>
        </details>

        <div class="server-assistant-questions">
          <div class="server-assistant-script__title">
            <strong>Réponses du serveur</strong>
            <span>cocher pendant la discussion</span>
          </div>
          ${assistant.questions.map((question) => renderServerAssistantQuestion(question.id, question.text, question.original, question.priority, question.category, question.relatedChoiceName)).join('')}
        </div>
      </div>

      ${summary.riskQuestions.length ? `
        <div class="server-assistant-risk-box">
          <strong>Risques confirmés / modifications impossibles</strong>
          <ul>${summary.riskQuestions.map((question) => `<li>${escapeHtml(question.text)}</li>`).join('')}</ul>
        </div>
      ` : ''}
    </section>
  `;
}

function renderServerAssistantQuestion(
  questionId: string,
  text: string,
  original: string,
  priority: 'high' | 'medium' | 'low',
  category: string,
  relatedChoiceName?: string,
): string {
  const answer = serverAnswers[questionId] ?? 'unanswered';
  const originalBlock = text !== original ? `<small>Original FR : ${escapeHtml(original)}</small>` : '';
  const relatedBlock = relatedChoiceName ? `<em>${escapeHtml(relatedChoiceName)}</em>` : '';
  const values: ServerAnswerValue[] = ['confirmed_safe', 'confirmed_risk', 'not_possible', 'unknown'];

  return `
    <article class="server-question server-question--${priority} server-question--answer-${answer}">
      <div class="server-question__head">
        <span>${escapeHtml(priorityLabel(priority))}</span>
        <strong>${escapeHtml(categoryLabel(category))}</strong>
        ${relatedBlock}
      </div>
      <p>${escapeHtml(text)}</p>
      ${originalBlock}
      <div class="server-question__answers">
        <label class="field field--compact">
          <span>Réponse du serveur</span>
          <select data-action="server-answer-select" data-question-id="${escapeHtml(questionId)}">
            <option value="unanswered" ${answer === 'unanswered' ? 'selected' : ''}>Non répondu</option>
            ${values.filter((value) => value !== 'unanswered').map((value) => `<option value="${value}" ${answer === value ? 'selected' : ''}>${escapeHtml(answerValueLabel(value))}</option>`).join('')}
          </select>
        </label>
      </div>
    </article>
  `;
}

function renderServerAssistantLanguageOptions(): string {
  const languages: ServerAssistantLanguage[] = ['fr', 'en', 'es', 'it', 'de'];
  return languages.map((language) => `<option value="${language}" ${serverAssistantLanguage === language ? 'selected' : ''}>${escapeHtml(languageName(language))}</option>`).join('');
}

function renderServerAssistantToneOptions(): string {
  const labels: Record<ServerAssistantTone, string> = {
    polite: 'Poli / complet',
    short: 'Court / direct',
    allergy_urgent: 'Allergie urgente',
    strict_religious: 'Règle stricte',
  };
  return (Object.keys(labels) as ServerAssistantTone[]).map((tone) => `<option value="${tone}" ${serverAssistantTone === tone ? 'selected' : ''}>${escapeHtml(labels[tone])}</option>`).join('');
}

function renderServerAssistantUrgencyOptions(): string {
  const labels: Record<ServerAssistantUrgency, string> = {
    standard: 'Standard',
    allergy: 'Allergènes en priorité',
    religious: 'Religieux strict',
    dietary: 'Végétarien/vegan/santé',
  };
  return (Object.keys(labels) as ServerAssistantUrgency[]).map((urgency) => `<option value="${urgency}" ${serverAssistantUrgency === urgency ? 'selected' : ''}>${escapeHtml(labels[urgency])}</option>`).join('');
}

function priorityLabel(priority: 'high' | 'medium' | 'low'): string {
  return {
    high: 'priorité haute',
    medium: 'priorité normale',
    low: 'optionnel',
  }[priority];
}

function categoryLabel(category: string): string {
  return {
    allergen: 'allergène',
    cross_contamination: 'contamination',
    halal: 'halal',
    kosher: 'casher',
    vegan_vegetarian: 'végé/vegan',
    gluten: 'gluten',
    lactose: 'lactose',
    alcohol: 'alcool',
    pork: 'porc',
    sauce: 'sauce',
    composition: 'composition',
    modification: 'modification',
    general: 'général',
  }[category] ?? category;
}


function renderRestaurantCockpit(): string {
  const activeRestaurant = getActiveRestaurant();
  const restaurantPool = mergeRestaurantPools(restaurantMemories, restaurantRemoteMatches);
  const restaurantInsights = searchRestaurantInsights({
    query: settings.restaurantSearch,
    city: settings.restaurantCityFilter,
    onlyFavorites: settings.restaurantOnlyFavorites,
    sortBy: settings.restaurantSort,
    mode: settings.mode,
    activeProfile: getActiveProfile(),
    enabledProfiles: getEnabledProfiles(),
    localRestaurants: restaurantPool,
    learnedDishes,
    publicDb: publicDbCache,
    queuedContributions: communityQueue,
    maxResults: 18,
  });
  const activeInsight = activeRestaurant
    ? buildRestaurantInsight(activeRestaurant, {
      mode: settings.mode,
      activeProfile: getActiveProfile(),
      enabledProfiles: getEnabledProfiles(),
      learnedDishes,
      publicDb: publicDbCache,
      queuedContributions: communityQueue,
    })
    : null;
  const suggestions = settings.mode === 'group'
    ? buildGroupSuggestions(groupRows, 6)
    : buildSingleSuggestions(results, 6);
  const favorites = restaurantMemories.filter((item) => item.favorite).length;
  const recent = restaurantMemories.filter((item) => item.lastUsedAt).length;

  return `
    <section class="card restaurant-card restaurant-card--v9">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Carnet de restaurants</p>
          <h2>${activeRestaurant ? escapeHtml(activeRestaurant.name) : 'Retrouver un restaurant connu'}</h2>
        </div>
        <div class="toolbar">
          <button class="ghost" data-action="save-restaurant" ${restaurantDraft.name || activeRestaurant ? '' : 'disabled'}>Sauvegarder fiche</button>
          <button class="ghost" data-action="restaurant-i-am-here" ${restaurantDraft.name || activeRestaurant ? '' : 'disabled'}>Je suis ici</button>
          <button class="ghost" data-action="copy-order-plan" ${currentRecord ? '' : 'disabled'}>Copier plan de commande</button>
        </div>
      </div>

      <details class="compact-action-drawer">
        <summary>Plus d’actions</summary>
        <div class="actions">
          <button class="ghost" data-action="toggle-active-restaurant-favorite" ${activeRestaurant ? '' : 'disabled'}>${activeRestaurant?.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}</button>
          <button class="ghost" data-action="restaurant-load-known-menu" ${activeInsight?.knownDishes.length ? '' : 'disabled'}>Charger menu connu</button>
          <button class="ghost" data-action="restaurant-copy-known-menu" ${activeInsight?.knownDishes.length ? '' : 'disabled'}>Copier menu connu</button>
          ${backendConfigured ? '<button class="ghost" data-action="sync-restaurants">Synchroniser</button>' : ''}
          <button class="ghost" data-action="clear-restaurant" ${activeRestaurant || restaurantDraft.name ? '' : 'disabled'}>Détacher</button>
        </div>
      </details>

      <div class="restaurant-searchbar">
        <label class="field">
          <span>Recherche restaurant, plat ou note</span>
          <input id="restaurantSearch" type="search" value="${escapeHtml(settings.restaurantSearch)}" placeholder="Ex : tacos, pizza, halal, Aubagne…" />
        </label>
        <label class="field">
          <span>Ville/adresse</span>
          <input id="restaurantCityFilter" type="search" value="${escapeHtml(settings.restaurantCityFilter)}" placeholder="Aubagne, Marseille, centre commercial…" />
        </label>
        <label class="field field--small">
          <span>Tri</span>
          <select id="restaurantSort">
            ${renderRestaurantSortOptions()}
          </select>
        </label>
        <label class="toggle toggle--restaurant">
          <input id="restaurantOnlyFavorites" type="checkbox" ${settings.restaurantOnlyFavorites ? 'checked' : ''} />
          Favoris seuls
        </label>
        ${backendConfigured ? '<button class="ghost" data-action="restaurant-remote-search">Chercher en ligne</button>' : ''}
      </div>

      <div class="restaurant-stats-v9">
        <div><strong>${restaurantMemories.length}</strong><span>fiches locales</span><small>${favorites} favori(s) · ${recent} récent(s)</small></div>
        ${backendConfigured ? `<div><strong>${restaurantRemoteMatches.length}</strong><span>résultat(s) distant(s)</span><small>service de synchronisation</small></div>` : ''}
        ${activeInsight ? `
          <div><strong>${activeInsight.knownDishes.length}</strong><span>plats connus</span><small>${activeInsight.trustedDishCount} source(s) fiable(s)</small></div>
          <div><strong>${activeInsight.compatibility.safe}</strong><span>plats compatibles</span><small>${activeInsight.compatibility.total ? `${activeInsight.compatibility.safe} sur ${activeInsight.compatibility.total} connus` : 'menu inconnu'}</small></div>
        ` : ''}
      </div>

      ${activeInsight ? renderActiveRestaurantDashboard(activeInsight) : `
        <div class="restaurant-empty-dashboard">
          <strong>Aucun restaurant actif.</strong>
          <span>Recherche une fiche existante ou ajoute simplement le nom d’un restaurant.</span>
        </div>
      `}

      <div class="restaurant-layout restaurant-layout--v9">
        <details class="restaurant-editor-drawer" ${activeRestaurant || restaurantDraft.name ? 'open' : ''}>
          <summary>${activeRestaurant ? 'Modifier la fiche active' : 'Ajouter un restaurant manuellement'}</summary>
          <div class="restaurant-form">
          <label class="field">
            <span>Nom restaurant / enseigne</span>
            <input id="restaurantName" type="text" value="${escapeHtml(restaurantDraft.name)}" placeholder="Ex : O'Tacos, pizzeria, cantine, restaurant local…" />
          </label>
          <div class="split-fields">
            <label class="field">
              <span>Ville</span>
              <input id="restaurantCity" type="text" value="${escapeHtml(restaurantDraft.city)}" placeholder="Aubagne, Marseille…" />
            </label>
            <label class="field">
              <span>Adresse optionnelle</span>
              <input id="restaurantAddress" type="text" value="${escapeHtml(restaurantDraft.address)}" placeholder="Rue, centre commercial…" />
            </label>
          </div>
          <label class="field">
            <span>Notes restaurant</span>
            <textarea id="restaurantNotes" rows="4" placeholder="Ex : dit halal mais certification à vérifier, sauce blanche lactée, friteuse séparée…">${escapeHtml(restaurantDraft.notes)}</textarea>
          </label>
          <p class="muted">Les fiches locales et les plats corrigés servent de repères lors des prochaines visites.</p>
          ${orderPlanStatus ? `<p class="sync-status" role="status" aria-live="polite">${escapeHtml(orderPlanStatus)}</p>` : ''}
          </div>
        </details>

        <aside class="restaurant-memory restaurant-memory--v9">
          <div class="card__header card__header--compact">
            <div>
              <p class="eyebrow">Résultats</p>
              <h3>${restaurantInsights.length ? `${restaurantInsights.length} restaurant(s)` : 'Aucun résultat'}</h3>
            </div>
          </div>
          ${restaurantInsights.length ? `<div class="restaurant-list restaurant-list--smart">${restaurantInsights.map(renderRestaurantInsightCard).join('')}</div>` : '<p class="muted">Aucun restaurant trouvé. Ajoute une fiche avec le formulaire.</p>'}
        </aside>
      </div>

      ${activeRestaurant ? `<div class="recommendation-panel">
        <div>
          <p class="eyebrow">Recommandations du scan actuel</p>
          <h3>${suggestions.length ? 'Meilleurs choix selon le profil actuel' : 'Analyse un menu pour obtenir les meilleurs choix'}</h3>
        </div>
        ${suggestions.length ? `<div class="suggestion-grid">${suggestions.map(renderOrderSuggestion).join('')}</div>` : '<p class="muted">Le cockpit affichera les plats les plus sûrs, les plats à vérifier et les questions prioritaires à poser avant de commander.</p>'}
      </div>` : ''}
    </section>
  `;
}
function renderRestaurantSortOptions(): string {
  const options: Array<[AppSettings['restaurantSort'], string]> = [
    ['smart', 'Pertinence'],
    ['recent', 'Récents'],
    ['safe', 'Meilleurs pour le profil'],
    ['name', 'Nom A-Z'],
  ];
  return options.map(([value, label]) => `<option value="${value}" ${settings.restaurantSort === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderActiveRestaurantDashboard(insight: ReturnType<typeof buildRestaurantInsight>): string {
  const compatibility = insight.compatibility;
  return `
    <div class="active-restaurant-dashboard active-restaurant-dashboard--${compatibility.safeRatio >= 0.5 ? 'good' : compatibility.total ? 'mixed' : 'empty'}">
      <div class="restaurant-score-ring">
        <strong>${compatibility.safe}</strong>
        <span>/${compatibility.total}</span>
        <small>compatibles</small>
      </div>
      <div class="restaurant-dashboard-main">
        <div class="restaurant-dashboard-title">
          <div>
            <h3>${escapeHtml(insight.restaurant.name)}</h3>
            <small>${escapeHtml([insight.restaurant.city, insight.restaurant.address].filter(Boolean).join(' · ') || 'localisation non renseignée')}</small>
          </div>
          <span class="favorite-mark">${insight.restaurant.favorite ? 'Favori' : 'Non favori'}</span>
        </div>
        <div class="restaurant-reasons">${insight.matchReasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join('')}</div>
        <div class="restaurant-compat-row">
          <span class="dot dot--safe">${compatibility.safe}</span>
          <span class="dot dot--caution">${compatibility.caution}</span>
          <span class="dot dot--blocked">${compatibility.blocked}</span>
          <span class="dot dot--unknown">${compatibility.unknown}</span>
          <em>${compatibility.total ? `${compatibility.safe} plat(s) compatible(s) sur ${compatibility.total}` : 'aucun menu connu à analyser'}</em>
        </div>
        ${compatibility.bestDishes.length ? `
          <div class="known-best-dishes">
            ${compatibility.bestDishes.map((dish) => `
              <article class="known-dish known-dish--${dish.status}">
                <strong>${escapeHtml(dish.name)}</strong>
                <span>${escapeHtml(dish.subtitle)}</span>
              </article>
            `).join('')}
          </div>
        ` : '<p class="muted">Aucun plat connu pour ce restaurant. Les prochaines corrections/partages alimenteront automatiquement cette fiche.</p>'}
      </div>
    </div>
  `;
}

function renderRestaurantInsightCard(insight: ReturnType<typeof buildRestaurantInsight>): string {
  const restaurant = insight.restaurant;
  const compatibility = insight.compatibility;
  const isActive = restaurant.id === activeRestaurantId;
  return `
    <article class="restaurant-smart-card ${isActive ? 'restaurant-smart-card--active' : ''}">
      <button class="restaurant-smart-card__main" data-action="load-restaurant" data-restaurant-id="${escapeHtml(restaurant.id)}">
        <span class="restaurant-rank-score">${compatibility.safe}/${compatibility.total}</span>
        <span class="restaurant-smart-info">
          <strong>${escapeHtml(restaurant.name)}</strong>
          <small>${escapeHtml([restaurant.city, restaurant.address].filter(Boolean).join(' · ') || 'Sans localisation')}</small>
          <em>${escapeHtml(insight.matchReasons.join(' · '))}</em>
        </span>
      </button>
      <div class="restaurant-smart-metrics">
        <span class="dot dot--safe">${compatibility.safe}</span>
        <span class="dot dot--caution">${compatibility.caution}</span>
        <span class="dot dot--blocked">${compatibility.blocked}</span>
        <span>${insight.knownDishes.length} plat(s)</span>
      </div>
      <div class="restaurant-smart-actions">
        <button class="ghost" data-action="restaurant-i-am-here-id" data-restaurant-id="${escapeHtml(restaurant.id)}">Utiliser</button>
        <button class="ghost" data-action="restaurant-load-known-menu-id" data-restaurant-id="${escapeHtml(restaurant.id)}" ${insight.knownDishes.length ? '' : 'disabled'}>Menu</button>
        <button class="ghost" data-action="toggle-restaurant-favorite-id" data-restaurant-id="${escapeHtml(restaurant.id)}" aria-label="${restaurant.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}">${restaurant.favorite ? 'Favori' : 'Ajouter favori'}</button>
        ${restaurant.id.startsWith('public-restaurant-') || restaurant.id.startsWith('queued-restaurant-') ? '' : `<button class="icon-button" data-action="forget-restaurant" data-restaurant-id="${escapeHtml(restaurant.id)}" aria-label="Oublier ${escapeHtml(restaurant.name)}">×</button>`}
      </div>
    </article>
  `;
}

function mergeRestaurantPools(local: RestaurantMemory[], remote: RestaurantMemory[]): RestaurantMemory[] {
  const byKey = new Map<string, RestaurantMemory>();
  for (const item of [...remote, ...local]) {
    const key = normalizeText([item.name, item.city, item.address].filter(Boolean).join(' | '));
    const current = byKey.get(key);
    if (!current || item.favorite || new Date(item.updatedAt).getTime() > new Date(current.updatedAt).getTime()) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}


function renderCommunityPanel(): string {
  const cached = publicDbCache;
  const cachedDishes = cached?.dishes ?? [];
  const preview = publicSearchResults.length ? publicSearchResults : cachedDishes.slice(0, 8);
  const queuePreview = communityQueue.slice(0, 8);
  const pendingLocal = communityQueue.filter((item) => item.status === 'queued').length;
  const pushedLocal = communityQueue.filter((item) => item.status !== 'queued').length;

  return `
    <section class="card community-card">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Contributions</p>
          <h2>${backendConfigured ? 'Base publique sans profil utilisateur' : 'Préparer des corrections localement'}</h2>
        </div>
        <div class="toolbar">
          ${backendConfigured ? `
            <button class="ghost" data-action="community-sync">Synchroniser</button>
            <button class="ghost" data-action="community-fetch-db">Actualiser la base</button>
          ` : ''}
          <button class="ghost" data-action="community-import-public-db" ${cachedDishes.length ? '' : 'disabled'}>Importer dans mémoire</button>
          <button class="ghost" data-action="community-export-github-json">Exporter JSON</button>
          <button class="ghost danger-action" data-action="community-clear-queue" ${communityQueue.length ? '' : 'disabled'}>Vider la file</button>
        </div>
      </div>

      <div class="privacy-notice">
        <strong>${backendConfigured ? 'Données partagées' : 'Données locales'}</strong>
        <span>${backendConfigured
          ? 'Seuls le plat, le restaurant, la localisation optionnelle, les ingrédients et les notes de source sont envoyés. Le profil, les allergies personnelles et l’historique restent exclus.'
          : 'Les corrections restent dans ce navigateur jusqu’à un export manuel. Le profil, les allergies personnelles et l’historique ne sont jamais inclus dans cet export.'}</span>
      </div>

      <div class="community-stats">
        <div><strong>${communityQueue.length}</strong><span>contribution(s) locale(s)</span><small>${pendingLocal} en attente · ${pushedLocal} déjà envoyée(s)</small></div>
        <div><strong>${cached?.stats.contributions ?? 0}</strong><span>plat(s) dans cache public</span><small>${cached ? new Date(cached.exportedAt).toLocaleString('fr-FR') : 'aucun cache téléchargé'}</small></div>
        ${backendConfigured ? `<div><strong>${backendHealth?.contributions ?? 0}</strong><span>contribution(s) distante(s)</span><small>${backendHealth?.verifiedContributions ?? 0} vérifiée(s)</small></div>` : ''}
      </div>

      ${communityStatus ? `<p class="sync-status" role="status" aria-live="polite">${escapeHtml(communityStatus)}</p>` : ''}

      <div class="community-layout">
        <article class="community-column">
          <div class="card__header card__header--compact">
            <div>
              <p class="eyebrow">File locale</p>
              <h3>Corrections préparées</h3>
            </div>
          </div>
          ${queuePreview.length ? `<div class="community-list">${queuePreview.map(renderCommunityContributionItem).join('')}</div>` : '<p class="muted">Aucune correction préparée. Analyse un plat puis utilise “Préparer le partage”.</p>'}
        </article>

        <article class="community-column">
          <div class="card__header card__header--compact">
            <div>
              <p class="eyebrow">Base publique en cache</p>
              <h3>${publicSearchResults.length ? `${publicSearchResults.length} résultat(s)` : 'Aperçu du cache public'}</h3>
            </div>
            <input id="communitySearch" type="search" value="${escapeHtml(communitySearch)}" placeholder="chercher burger, pizza, restaurant…" />
          </div>
          ${preview.length ? `<div class="community-list">${preview.map(renderCommunityContributionItem).join('')}</div>` : `<p class="muted">${backendConfigured ? 'Actualise la base publique pour afficher les plats validés.' : 'Aucune base publique n’est embarquée. Les corrections locales peuvent être exportées en JSON.'}</p>`}
        </article>
      </div>
    </section>
  `;
}

function renderCommunityContributionItem(item: PublicDishContribution): string {
  const summary = summarizeContribution(item);
  return `
    <div class="community-item community-item--${item.status}">
      <div>
        <strong>${escapeHtml(item.dishName)}</strong>
        <small>${escapeHtml([item.restaurantName, item.restaurantCity].filter(Boolean).join(' · ') || 'Restaurant non renseigné')}</small>
        <span>${escapeHtml(summary)}</span>
      </div>
      <em>${escapeHtml(communityStatusLabel(item.status))}</em>
    </div>
  `;
}

function communityStatusLabel(status: PublicDishContribution['status']): string {
  return {
    queued: 'file locale',
    pending_review: 'en modération',
    community_verified: 'vérifié communauté',
    trusted: 'trusted',
    rejected: 'rejeté',
    deprecated: 'obsolète',
  }[status];
}


function renderModerationPanel(): string {
  const sourceItems = getModerationSourceItems();
  const filteredItems = filterModerationItems(sourceItems);
  const reviews = buildModerationReviews(filteredItems).slice(0, 30);
  const summary = buildModerationSummary(sourceItems);
  const duplicateClusters = findContributionDuplicateClusters(filteredItems).slice(0, 8);

  return `
    <section class="card moderation-card">
      <div class="card__header card__header--wrap">
        <div>
          <p class="eyebrow">Modération et qualité</p>
          <h2>Valider, rejeter ou fusionner avant export public</h2>
        </div>
        <div class="toolbar">
          <button class="ghost" data-action="moderation-load">Charger contributions</button>
          <button class="ghost" data-action="moderation-load-cache" ${(publicDbCache?.dishes.length || communityQueue.length) ? '' : 'disabled'}>Utiliser cache/local</button>
          <button class="ghost" data-action="moderation-apply-safe-batch" ${reviews.length ? '' : 'disabled'}>Appliquer recos sûres</button>
        </div>
      </div>

      <div class="quality-notice">
        <strong>But :</strong>
        <span>Les contributions restent en attente, les doublons sont signalés et seules les données anonymisées validées peuvent rejoindre la base publique.</span>
      </div>

      <div class="moderation-stats">
        <div><strong>${summary.total}</strong><span>Total</span><small>${summary.pending} à revoir</small></div>
        <div><strong>${summary.verified + summary.trusted}</strong><span>Validées</span><small>${summary.trusted} trusted · ${summary.verified} communautaires</small></div>
        <div><strong>${summary.blockers}</strong><span>Bloquants</span><small>${summary.warnings} avertissement(s)</small></div>
        <div><strong>${summary.duplicateClusters}</strong><span>Doublons</span><small>confiance moyenne ${summary.averageTrust}/100</small></div>
      </div>

      <div class="moderation-tools">
        <select id="moderationFilter" aria-label="Filtre modération">
          ${renderModerationFilterOptions()}
        </select>
        <input id="moderationSearch" type="search" value="${escapeHtml(moderationSearch)}" placeholder="chercher plat, ville, restaurant, ingrédient…" />
      </div>

      ${moderationStatus ? `<p class="sync-status">${escapeHtml(moderationStatus)}</p>` : ''}

      <div class="moderation-layout">
        <article class="moderation-column moderation-column--wide">
          <div class="card__header card__header--compact">
            <div>
              <p class="eyebrow">Queue de review</p>
              <h3>${reviews.length ? `${reviews.length} contribution(s) affichée(s)` : 'Aucune contribution à afficher'}</h3>
            </div>
          </div>
          ${reviews.length ? `<div class="moderation-list">${reviews.map(renderModerationReviewCard).join('')}</div>` : '<p class="muted">Clique sur “Charger contributions”. Si le backend est hors ligne, utilise le cache public/local.</p>'}
        </article>

        <article class="moderation-column">
          <div class="card__header card__header--compact">
            <div>
              <p class="eyebrow">Doublons / fusion</p>
              <h3>${duplicateClusters.length ? `${duplicateClusters.length} cluster(s)` : 'Aucun doublon filtré'}</h3>
            </div>
          </div>
          ${duplicateClusters.length ? `<div class="duplicate-list">${duplicateClusters.map(renderDuplicateClusterCard).join('')}</div>` : '<p class="muted">Les doublons sont groupés par plat + restaurant + ville/adresse. La fusion conserve l’entrée la plus fiable et obsolète les autres.</p>'}
        </article>
      </div>
    </section>
  `;
}

function renderModerationFilterOptions(): string {
  const options: Array<[typeof moderationFilter, string]> = [
    ['pending_review', 'À modérer'],
    ['needs_review', 'Problèmes qualité'],
    ['duplicates', 'Doublons'],
    ['community_verified', 'Vérifiés'],
    ['trusted', 'Trusted'],
    ['rejected', 'Rejetés'],
    ['deprecated', 'Obsolètes'],
    ['all', 'Tout'],
  ];
  return options.map(([value, label]) => `<option value="${value}" ${moderationFilter === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderModerationReviewCard(review: ModerationReview): string {
  const item = review.contribution;
  const ingredients = item.ingredientIds.map((id) => getIngredientById(id)).filter((ingredient): ingredient is Ingredient => Boolean(ingredient)).map(ingredientDisplayLabel).slice(0, 12);
  const issueHtml = review.issues.length
    ? review.issues.map((issue) => `<li class="quality-issue quality-issue--${issue.severity}"><strong>${escapeHtml(qualityIssueSeverityLabel(issue.severity))}</strong>${escapeHtml(issue.message)}</li>`).join('')
    : '<li class="quality-issue quality-issue--info"><strong>OK</strong>Aucun problème évident détecté.</li>';
  const recommendedLabel = `${communityStatusLabel(review.recommendedStatus)} · ${review.recommendedTrustScore}/100`;

  return `
    <article class="moderation-item moderation-item--${item.status}">
      <div class="moderation-item__top">
        <div>
          <strong>${escapeHtml(item.dishName)}</strong>
          <small>${escapeHtml([item.restaurantName, item.restaurantCity].filter(Boolean).join(' · ') || 'Restaurant non renseigné')}</small>
        </div>
        <div class="trust-badge">
          <span>${escapeHtml(communityStatusLabel(item.status))}</span>
          <strong>${item.trustScore}/100</strong>
        </div>
      </div>

      <div class="ingredient-mini-list">
        ${ingredients.length ? ingredients.map((label) => `<span>${escapeHtml(label)}</span>`).join('') : '<span>composition vide</span>'}
      </div>

      <ul class="quality-list">${issueHtml}</ul>

      <div class="moderation-meta">
        <span>Source : ${escapeHtml(item.sourceType)}${item.sourceLabel ? ` · ${escapeHtml(item.sourceLabel)}` : ''}</span>
        <span>Reco : <strong>${escapeHtml(recommendedLabel)}</strong></span>
        ${item.moderationNotes ? `<span>Notes modération : ${escapeHtml(item.moderationNotes)}</span>` : ''}
      </div>

      <div class="actions moderation-actions">
        <button class="primary" data-action="moderation-apply-recommendation" data-contribution-id="${escapeHtml(item.id)}" data-status="${review.recommendedStatus}" data-trust="${review.recommendedTrustScore}">Appliquer reco</button>
        <button class="ghost" data-action="moderation-set-status" data-contribution-id="${escapeHtml(item.id)}" data-status="community_verified">Vérifier</button>
        <button class="ghost" data-action="moderation-set-status" data-contribution-id="${escapeHtml(item.id)}" data-status="trusted">Trusted</button>
        <button class="ghost" data-action="moderation-set-status" data-contribution-id="${escapeHtml(item.id)}" data-status="rejected">Rejeter</button>
        <button class="ghost" data-action="moderation-set-status" data-contribution-id="${escapeHtml(item.id)}" data-status="deprecated">Obsolète</button>
        <button class="ghost" data-action="moderation-copy-summary" data-contribution-id="${escapeHtml(item.id)}">Copier fiche</button>
      </div>
    </article>
  `;
}

function renderDuplicateClusterCard(cluster: ContributionDuplicateCluster): string {
  const ingredients = cluster.unionIngredientIds.map((id) => getIngredientById(id)).filter((ingredient): ingredient is Ingredient => Boolean(ingredient)).map(ingredientDisplayLabel).slice(0, 10);
  return `
    <article class="duplicate-card">
      <div class="duplicate-card__top">
        <strong>${escapeHtml(cluster.label)}</strong>
        <em>${cluster.items.length} entrées · ${cluster.conflictCount} différence(s)</em>
      </div>
      <div class="ingredient-mini-list">
        ${ingredients.length ? ingredients.map((label) => `<span>${escapeHtml(label)}</span>`).join('') : '<span>aucun ingrédient consolidé</span>'}
      </div>
      <div class="duplicate-members">
        ${cluster.items.slice(0, 5).map((item) => `<span>${escapeHtml(item.dishName)} · ${escapeHtml(communityStatusLabel(item.status))} · ${item.trustScore}/100</span>`).join('')}
      </div>
      <button class="ghost" data-action="moderation-merge-cluster" data-cluster-key="${escapeHtml(cluster.key)}">Fusionner ce cluster</button>
    </article>
  `;
}

function qualityIssueSeverityLabel(severity: 'blocker' | 'warning' | 'info'): string {
  return {
    blocker: 'Bloquant',
    warning: 'Attention',
    info: 'Info',
  }[severity];
}

function getModerationSourceItems(): PublicDishContribution[] {
  if (moderationItems.length) return moderationItems;
  const fromCache = publicDbCache?.dishes ?? [];
  return [...communityQueue, ...fromCache].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}

function filterModerationItems(items: PublicDishContribution[]): PublicDishContribution[] {
  const normalizedSearch = normalizeText(moderationSearch);
  const duplicateIds = moderationFilter === 'duplicates'
    ? new Set(findContributionDuplicateClusters(items).flatMap((cluster) => cluster.items.map((item) => item.id)))
    : new Set<string>();

  return items.filter((item) => {
    const matchesFilter = moderationFilter === 'all'
      || (moderationFilter === 'needs_review' && buildModerationReviews([item]).some((review) => review.issues.some((issue) => issue.severity !== 'info')))
      || (moderationFilter === 'duplicates' && duplicateIds.has(item.id))
      || item.status === moderationFilter;
    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;
    return normalizeText([
      item.dishName,
      item.restaurantName,
      item.restaurantCity,
      item.restaurantAddress,
      item.sourceLabel,
      item.notes,
      item.ingredientIds.join(' '),
      item.aliases.join(' '),
    ].filter(Boolean).join(' ')).includes(normalizedSearch);
  });
}

function renderOrderSuggestion(suggestion: ReturnType<typeof buildSingleSuggestions>[number]): string {
  return `
    <article class="suggestion suggestion--${suggestion.status}">
      <span class="status-badge status-badge--${suggestion.status}">${statusLabel(suggestion.status)}</span>
      <strong>${escapeHtml(suggestion.itemName)}</strong>
      <small>${escapeHtml(suggestion.subtitle)}</small>
      <em>${suggestion.questions.length ? `${suggestion.questions.length} question(s) à poser` : 'Aucune question prioritaire'}</em>
    </article>
  `;
}

function renderGroupProfilePicker(): string {
  return `
    <details class="group-picker" open>
      <summary>Profils inclus dans le scan groupe</summary>
      <div class="profile-pill-list">
        ${profiles.map((profile) => `
          <label class="profile-pill">
            <input type="checkbox" data-kind="group-profile" value="${escapeHtml(profile.id ?? '')}" ${settings.enabledProfileIds.includes(profile.id ?? '') ? 'checked' : ''} />
            <span style="--profile-color:${escapeHtml(profile.color ?? '#74f7b0')}">${escapeHtml(profile.name)}</span>
          </label>
        `).join('')}
      </div>
    </details>
  `;
}

function renderCheckbox(kind: 'rule' | 'allergen' | 'intolerance', value: string, label: string, checked: boolean, hint: string): string {
  return `
    <label class="check-card" title="${escapeHtml(hint)}">
      <input type="checkbox" data-kind="${kind}" value="${escapeHtml(value)}" ${checked ? 'checked' : ''} />
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(hint)}</small>
    </label>
  `;
}


function renderIngredientBadges(ingredients: Ingredient[], limit = 18): string {
  if (ingredients.length === 0) {
    return '<span class="ingredient-badge ingredient-badge--unknown">Composition inconnue</span>';
  }

  const visible = ingredients.slice(0, limit);
  const rest = ingredients.length - visible.length;
  return [
    ...visible.map((ingredient) => {
      const risk = getIngredientRiskLevel(ingredient);
      return `<span class="ingredient-badge ingredient-badge--${risk}" title="${escapeHtml(ingredient.tags.join(', '))}">${escapeHtml(ingredient.names[0])}</span>`;
    }),
    rest > 0 ? `<span class="ingredient-badge ingredient-badge--unknown">+${rest}</span>` : '',
  ].filter(Boolean).join('');
}

function renderLearningModal(draft: LearningDraft): string {
  const selectedIngredients = draft.selectedIngredientIds
    .map((id) => getIngredientById(id))
    .filter((ingredient): ingredient is Ingredient => Boolean(ingredient));

  return `
    <div class="modal-backdrop">
      <div class="learning-modal" id="learningDialog" role="dialog" aria-modal="true" aria-labelledby="learningDialogTitle" tabindex="-1">
        <div class="modal-header">
          <div>
            <p class="eyebrow">Correction guidée</p>
            <h2 id="learningDialogTitle">${escapeHtml(draft.dishName)}</h2>
            <p class="muted">Sélectionne la composition réelle du plat. Cette mémoire passera avant les estimations automatiques aux prochains scans.</p>
          </div>
          <button class="icon-button" data-action="learning-close" aria-label="Fermer">×</button>
        </div>

        <div class="learning-layout">
          <section class="learning-panel learning-panel--main">
            <label class="field">
              <span>Restaurant / enseigne optionnel</span>
              <input id="learningRestaurant" type="text" value="${escapeHtml(draft.restaurantName)}" placeholder="Ex : O'Tacos Aubagne, cantine, menu maison…" />
            </label>

            <label class="field">
              <span>Alias du plat</span>
              <input id="learningAliases" type="text" value="${escapeHtml(draft.aliasesText)}" placeholder="noms OCR alternatifs, séparés par virgules" />
            </label>

            <label class="field">
              <span>Rechercher un ingrédient / allergène / tag</span>
              <input id="learningSearch" type="search" value="${escapeHtml(draft.ingredientSearch)}" placeholder="porc, fromage, gluten, halal, sauce, friture…" autocomplete="off" />
            </label>

            <div class="quick-packs">
              ${LEARNING_PACKS.map((pack) => `<button class="chip" data-action="learning-pack" data-pack-id="${escapeHtml(pack.id)}">${escapeHtml(pack.label)}</button>`).join('')}
            </div>

            <div class="ingredient-search-results">
              ${renderIngredientSearchResults(draft)}
            </div>
          </section>

          <aside class="learning-panel">
            <h3>Composition sélectionnée</h3>
            <div class="selected-ingredients">
              ${selectedIngredients.length ? selectedIngredients.map((ingredient) => renderSelectedIngredient(ingredient)).join('') : '<p class="muted">Aucun ingrédient sélectionné. Ajoute au moins un élément pour apprendre le plat.</p>'}
            </div>

            ${draft.missingTerms.length ? `
              <details class="missing-box" open>
                <summary>Termes OCR non interprétés</summary>
                <p>${draft.missingTerms.map(escapeHtml).join(', ')}</p>
              </details>
            ` : ''}

            <label class="field">
              <span>Notes de source</span>
              <textarea id="learningNotes" rows="5" placeholder="Ex : confirmé par le serveur, sauce sans alcool, cuisson séparée…">${escapeHtml(draft.notes)}</textarea>
            </label>

            <div class="modal-actions">
              <button class="ghost" data-action="learning-clear">Vider ingrédients</button>
              <button class="ghost" data-action="learning-close">Annuler</button>
              <button class="primary" data-action="learning-save" ${draft.selectedIngredientIds.length ? '' : 'disabled'}>Sauvegarder correction</button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;
}

function renderIngredientSearchResults(draft: LearningDraft): string {
  const selected = new Set(draft.selectedIngredientIds);
  const matches = searchIngredients(draft.ingredientSearch, 48).filter((ingredient) => !selected.has(ingredient.id));

  if (matches.length === 0) {
    return '<p class="muted">Aucun ingrédient trouvé. Essaie un terme plus simple : lait, porc, gluten, sauce, friture, vin…</p>';
  }

  return matches.map((ingredient) => {
    const risk = getIngredientRiskLevel(ingredient);
    return `
      <button class="ingredient-option ingredient-option--${risk}" data-action="learning-add-ingredient" data-ingredient-id="${escapeHtml(ingredient.id)}">
        <strong>${escapeHtml(ingredient.names[0])}</strong>
        <span>${escapeHtml(ingredient.category)}</span>
        <small>${escapeHtml(ingredient.tags.slice(0, 5).join(' · '))}</small>
      </button>
    `;
  }).join('');
}

function renderSelectedIngredient(ingredient: Ingredient): string {
  const risk = getIngredientRiskLevel(ingredient);
  return `
    <button class="selected-ingredient selected-ingredient--${risk}" data-action="learning-remove-ingredient" data-ingredient-id="${escapeHtml(ingredient.id)}" title="Retirer ${escapeHtml(ingredientDisplayLabel(ingredient))}">
      <span>${escapeHtml(ingredient.names[0])}</span>
      <small>${escapeHtml(ingredient.category)}</small>
      <strong>×</strong>
    </button>
  `;
}

function renderResultCard(result: AnalysisResult): string {
  const ingredients = result.matchedDish.ingredients;
  const lookup = offLookups[result.menuItem.id];

  return `
    <article class="result result--${result.status}">
      <div class="result__top">
        <div>
          <span class="status-badge status-badge--${result.status}">${statusLabel(result.status)}</span>
          <h3>${escapeHtml(result.menuItem.rawName)} ${result.menuItem.price ? `<em>${escapeHtml(result.menuItem.price)}</em>` : ''}</h3>
          ${result.menuItem.section ? `<span class="section-pill">${escapeHtml(result.menuItem.section)}</span>` : ''}
          ${result.menuItem.description ? `<p class="muted">${escapeHtml(result.menuItem.description)}</p>` : ''}
        </div>
        <div class="confidence"><strong>${confidenceLabel(result.confidence)}</strong><small>niveau de confiance</small></div>
      </div>

      <div class="result__meta">
        <span>Match : ${escapeHtml(result.matchedDish.matchedBy)}</span>
        <span>Confiance : ${confidenceLabel(result.confidence)}</span>
      </div>

      <div class="ingredient-strip">
        ${renderIngredientBadges(ingredients)}
      </div>

      ${result.matchedDish.sourceNotes?.length ? `<div class="source-notes">${result.matchedDish.sourceNotes.map((note) => `<span>${escapeHtml(note)}</span>`).join('')}</div>` : ''}

      <ul class="reason-list">
        ${result.reasons.map((reason) => `<li class="reason reason--${reason.severity}">${escapeHtml(reason.message)}</li>`).join('')}
      </ul>

      ${result.askServerQuestions.length ? `
        <details class="questions">
          <summary>Questions à poser au restaurant</summary>
          <ul>${result.askServerQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join('')}</ul>
        </details>
      ` : ''}

      ${lookup ? `<div class="lookup-box">${lookup}</div>` : ''}

      <div class="result__actions">
        <button class="ghost" data-action="learn-dish" data-item-id="${result.menuItem.id}">Corriger / apprendre</button>
        <button class="ghost" data-action="share-dish-public" data-item-id="${result.menuItem.id}">Préparer le partage</button>
        <button class="ghost" data-action="off-lookup" data-item-id="${result.menuItem.id}">Chercher source produit</button>
        <button class="ghost" data-action="copy-questions" data-item-id="${result.menuItem.id}">Copier questions</button>
      </div>
    </article>
  `;
}

function renderGroupRowCard(row: GroupAnalysisRow): string {
  const questions = uniqueStrings(row.results.flatMap((result) => result.askServerQuestions));
  const ingredients = row.results[0]?.matchedDish.ingredients ?? [];
  return `
    <article class="result group-row result--${row.aggregateStatus}">
      <div class="result__top">
        <div>
          <span class="status-badge status-badge--${row.aggregateStatus}">${groupStatusLabel(row)}</span>
          <h3>${escapeHtml(row.menuItem.rawName)} ${row.menuItem.price ? `<em>${escapeHtml(row.menuItem.price)}</em>` : ''}</h3>
          ${row.menuItem.section ? `<span class="section-pill">${escapeHtml(row.menuItem.section)}</span>` : ''}
          ${row.menuItem.description ? `<p class="muted">${escapeHtml(row.menuItem.description)}</p>` : ''}
        </div>
        <div class="mini-stats">
          <span class="dot dot--safe">${row.safeCount}</span>
          <span class="dot dot--caution">${row.cautionCount}</span>
          <span class="dot dot--blocked">${row.blockedCount}</span>
          <span class="dot dot--unknown">${row.unknownCount}</span>
        </div>
      </div>
      <div class="ingredient-strip">${renderIngredientBadges(ingredients)}</div>
      <div class="profile-result-grid">
        ${row.results.map(renderProfileDecision).join('')}
      </div>
      ${questions.length ? `
        <details class="questions">
          <summary>Questions groupe à poser au restaurant</summary>
          <ul>${questions.map((question) => `<li>${escapeHtml(question)}</li>`).join('')}</ul>
        </details>
      ` : ''}
      <div class="result__actions">
        <button class="ghost" data-action="learn-dish" data-item-id="${row.menuItem.id}">Corriger / apprendre</button>
        <button class="ghost" data-action="share-dish-public" data-item-id="${row.menuItem.id}">Préparer le partage</button>
        <button class="ghost" data-action="copy-group-questions" data-item-id="${row.menuItem.id}">Copier questions groupe</button>
      </div>
    </article>
  `;
}

function renderProfileDecision(result: AnalysisResult): string {
  return `
    <details class="profile-decision profile-decision--${result.status}">
      <summary>
        <span>${escapeHtml(result.safeFor[0] || getProfileNameForResult(result))}</span>
        <strong>${statusLabel(result.status)}</strong>
      </summary>
      <ul>${result.reasons.slice(0, 5).map((reason) => `<li>${escapeHtml(reason.message)}</li>`).join('')}</ul>
    </details>
  `;
}

function renderEmptyResults(): string {
  return `
    <div class="empty">
      <strong>Commence avec un exemple ou une photo de menu.</strong>
      <span>L’application peut analyser un profil seul ou un groupe complet selon les règles alimentaires, allergies et intolérances.</span>
    </div>
  `;
}

function renderHistoryItem(record: ScanRecord): string {
  const stats = record.groupRows ? buildGroupStats(record.groupRows) : buildStats(record.results);
  return `
    <button class="history-item" data-action="load-history" data-record-id="${record.id}">
      <span>${new Date(record.createdAt).toLocaleString('fr-FR')}</span>
      <strong>${record.groupRows ? `${record.groupRows.length} plats groupe` : `${record.results.length} plats`} · ${stats.blocked} bloqués · ${stats.caution} à vérifier</strong>
      <small>${escapeHtml(record.profile.name)} · ${escapeHtml(record.source)}</small>
    </button>
  `;
}

function renderLearnedDishItem(dish: LearnedDish): string {
  return `
    <div class="memory-item">
      <div>
        <strong>${escapeHtml(dish.name)}</strong>
        <small>${escapeHtml(learnedDishToCsv(dish) || 'Aucun ingrédient connu')}</small>
        <span>${escapeHtml(dish.source)} · ${new Date(dish.updatedAt).toLocaleString('fr-FR')}</span>
      </div>
      <div class="memory-actions">
        <button class="ghost" data-action="edit-learned-dish" data-learned-id="${escapeHtml(dish.id)}">Modifier</button>
        <button class="ghost" data-action="share-learned-public" data-learned-id="${escapeHtml(dish.id)}">Partager</button>
        <button class="ghost" data-action="forget-learned-dish" data-learned-id="${escapeHtml(dish.id)}">Oublier</button>
      </div>
    </div>
  `;
}

function renderStatusOptions(value: AppSettings['statusFilter']): string {
  const options: { value: AppSettings['statusFilter']; label: string }[] = [
    { value: 'all', label: 'Tous statuts' },
    { value: 'safe', label: 'OK' },
    { value: 'caution', label: 'À vérifier' },
    { value: 'blocked', label: 'Bloqué' },
    { value: 'unknown', label: 'Inconnu' },
  ];
  return options.map((option) => `<option value="${option.value}" ${value === option.value ? 'selected' : ''}>${option.label}</option>`).join('');
}

function statusLabel(status: DecisionStatus): string {
  return {
    safe: 'OK',
    caution: 'À vérifier',
    blocked: 'Non compatible',
    unknown: 'Inconnu',
  }[status];
}

function groupStatusLabel(row: GroupAnalysisRow): string {
  if (row.safeCount > 0) return `${row.safeCount}/${row.results.length} OK`;
  if (row.cautionCount > 0) return `${row.cautionCount}/${row.results.length} à vérifier`;
  if (row.blockedCount === row.results.length) return 'Bloqué pour tous';
  return 'Inconnu pour le groupe';
}

function confidenceLabel(confidence: AnalysisResult['confidence']): string {
  return {
    confirmed: 'confirmé',
    probable: 'probable',
    estimated: 'estimé',
    unknown: 'inconnu',
  }[confidence];
}

function sourceLabel(source: ScanRecord['source']): string {
  return {
    sample: 'Exemple',
    manual: 'Manuel',
    'image-ocr': 'Image OCR',
    camera: 'Caméra',
  }[source];
}

function buildStats(items: AnalysisResult[]) {
  return {
    safe: items.filter((item) => item.status === 'safe').length,
    caution: items.filter((item) => item.status === 'caution').length,
    blocked: items.filter((item) => item.status === 'blocked').length,
    unknown: items.filter((item) => item.status === 'unknown').length,
  };
}

function buildGroupStats(rows: GroupAnalysisRow[]) {
  return {
    safe: rows.filter((row) => row.aggregateStatus === 'safe').length,
    caution: rows.filter((row) => row.aggregateStatus === 'caution').length,
    blocked: rows.filter((row) => row.aggregateStatus === 'blocked').length,
    unknown: rows.filter((row) => row.aggregateStatus === 'unknown').length,
  };
}

function syncActiveProfileFromDom() {
  const active = getActiveProfile();
  const nameInput = document.querySelector<HTMLInputElement>('#profileName');
  const strictnessSelect = document.querySelector<HTMLSelectElement>('#strictness');
  const forbiddenInput = document.querySelector<HTMLInputElement>('#forbiddenTerms');
  const cautionInput = document.querySelector<HTMLInputElement>('#cautionTerms');
  const hasRuleControls = Boolean(document.querySelector('input[data-kind="rule"]'));
  const hasAllergenControls = Boolean(document.querySelector('input[data-kind="allergen"]'));
  const hasIntoleranceControls = Boolean(document.querySelector('input[data-kind="intolerance"]'));

  if (!nameInput && !strictnessSelect && !forbiddenInput && !cautionInput && !hasRuleControls && !hasAllergenControls && !hasIntoleranceControls) return;

  const updated: UserProfile = {
    ...active,
    name: nameInput ? (nameInput.value.trim() || DEFAULT_PROFILE.name) : active.name,
    strictness: (strictnessSelect?.value as Strictness) || active.strictness,
    rules: hasRuleControls ? getCheckedValues<RuleId>('rule', rules) : active.rules,
    allergens: hasAllergenControls ? getCheckedValues<AllergenId>('allergen', allergens) : active.allergens,
    intolerances: hasIntoleranceControls ? getCheckedValues<AllergenId>('intolerance', allergens) : active.intolerances,
    customForbiddenTerms: forbiddenInput ? splitTerms(forbiddenInput.value) : active.customForbiddenTerms,
    customCautionTerms: cautionInput ? splitTerms(cautionInput.value) : active.customCautionTerms,
  };

  profiles = profiles.map((profile) => profile.id === updated.id ? updated : profile);
  saveProfiles(profiles);
  saveProfile(updated);
}

function getCheckedValues<T extends string>(kind: string, allowed: readonly T[]): T[] {
  const allowedSet = new Set<string>(allowed);
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[data-kind="${kind}"]:checked`))
    .map((input) => input.value)
    .filter((value): value is T => allowedSet.has(value));
}

function splitTerms(value: string): string[] {
  return value
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
}

function confirmDestructive(message: string): boolean {
  return window.confirm(message);
}

function analyzeCurrentMenu(source: ScanRecord['source'] = activeSource) {
  syncMenuTextFromDom();
  syncActiveProfileFromDom();
  syncRestaurantDraftFromDom();

  const items = parseMenuText(menuText);
  ocrReport = buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
  const activeProfile = getActiveProfile();
  const enabledProfiles = getEnabledProfiles();
  const activeRestaurant = buildCurrentRestaurantMemory(false) ?? getActiveRestaurant();
  results = analyzeMenuItems(items, activeProfile);
  groupRows = analyzeMenuForGroup(items, enabledProfiles);
  activeSource = source;
  serverAnswers = {};
  serverAssistantStatus = '';

  currentRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
    source,
    imageName: selectedImageName || undefined,
    rawText: menuText,
    profile: activeProfile,
    profiles: enabledProfiles,
    restaurant: activeRestaurant ?? undefined,
    results,
    groupRows: settings.mode === 'group' ? groupRows : undefined,
  };

  if (items.length > 0) {
    saveScanRecord(currentRecord);
    history = loadHistory();
    void persistScanToBackend(currentRecord);
  }
  navigateToView('results');
}

async function refreshBackendStatus(showRender = true) {
  if (!backendConfigured) {
    backendHealth = null;
    backendStatus = 'Données conservées sur cet appareil';
    if (showRender) render();
    return;
  }
  const health = await pingBackend();
  backendHealth = health;
  backendStatus = health?.ok
    ? `Backend SQLite connecté · ${health.learnedDishes} plat(s) appris · ${health.scans} scan(s) · ${health.contributions ?? 0} contribution(s)`
    : 'Backend SQLite optionnel hors ligne';
  if (showRender) render();
}

async function syncLearningWithBackend() {
  if (!backendConfigured) {
    syncStatus = 'Aucun service de synchronisation n’est configuré. Les corrections restent sur cet appareil.';
    render();
    return;
  }
  syncStatus = 'Synchronisation avec le backend SQLite…';
  render();

  const health = await pingBackend(2200);
  backendHealth = health;
  if (!health?.ok) {
    backendStatus = 'Backend SQLite optionnel hors ligne';
    syncStatus = 'Backend indisponible. Lance pnpm run server puis retente la synchronisation.';
    render();
    return;
  }

  const remoteDishes = await fetchLearnedDishes().catch(() => []);
  learnedDishes = importLearnedDishes(remoteDishes);

  let pushed = 0;
  for (const dish of learnedDishes) {
    const saved = await pushLearnedDish(dish);
    if (saved) pushed += 1;
  }

  learnedDishes = importLearnedDishes(await fetchLearnedDishes().catch(() => []));
  backendStatus = `Backend SQLite connecté · ${learnedDishes.length} plat(s) appris · ${backendHealth?.contributions ?? 0} contribution(s)`;
  syncStatus = `Sync terminée : ${remoteDishes.length} correction(s) reçue(s), ${pushed} correction(s) envoyée(s).`;

  if (results.length > 0 || groupRows.length > 0) {
    const items = parseMenuText(menuText);
    results = analyzeMenuItems(items, getActiveProfile());
    groupRows = analyzeMenuForGroup(items, getEnabledProfiles());
  }
  render();
}

async function persistScanToBackend(record: ScanRecord) {
  if (!backendConfigured) return;
  const saved = await pushScanRecord(record);
  if (!saved) return;
  backendHealth = await pingBackend().catch(() => backendHealth);
  if (backendHealth?.ok) backendStatus = `Backend SQLite connecté · ${backendHealth.learnedDishes} plat(s) appris · ${backendHealth.scans} scan(s) · ${backendHealth.contributions ?? 0} contribution(s)`;
}

function openLearningDraftFromResult(itemId: string) {
  const result = findSingleResult(itemId) ?? findGroupRow(itemId)?.results[0];
  if (!result) return;

  const learned = result.matchedDish.learnedDish;
  learningDraft = {
    itemId,
    learnedId: learned?.id,
    source: 'analysis',
    dishName: result.menuItem.rawName,
    selectedIngredientIds: uniqueStrings(result.matchedDish.ingredients.map((ingredient) => ingredient.id)),
    ingredientSearch: '',
    restaurantName: learned?.restaurantName ?? getActiveRestaurant()?.name ?? restaurantDraft.name,
    aliasesText: learned?.aliases.join(', ') ?? '',
    notes: learned?.notes ?? buildInitialLearningNotes(result),
    missingTerms: result.matchedDish.missingTerms,
  };
  render();
}

function openLearningDraftFromMemory(learnedId: string) {
  const dish = learnedDishes.find((item) => item.id === learnedId);
  if (!dish) return;

  learningDraft = {
    itemId: `memory-${dish.id}`,
    learnedId: dish.id,
    source: 'memory',
    dishName: dish.name,
    selectedIngredientIds: [...dish.ingredientIds],
    ingredientSearch: '',
    restaurantName: dish.restaurantName ?? '',
    aliasesText: dish.aliases.join(', '),
    notes: dish.notes ?? '',
    missingTerms: [],
  };
  render();
}

function syncLearningDraftFromDom() {
  if (!learningDraft) return;
  const restaurant = document.querySelector<HTMLInputElement>('#learningRestaurant');
  const aliases = document.querySelector<HTMLInputElement>('#learningAliases');
  const search = document.querySelector<HTMLInputElement>('#learningSearch');
  const notes = document.querySelector<HTMLTextAreaElement>('#learningNotes');

  learningDraft = {
    ...learningDraft,
    restaurantName: restaurant?.value.trim() ?? learningDraft.restaurantName,
    aliasesText: aliases?.value ?? learningDraft.aliasesText,
    ingredientSearch: search?.value ?? learningDraft.ingredientSearch,
    notes: notes?.value.trim() ?? learningDraft.notes,
  };
}

async function saveLearningDraft() {
  syncLearningDraftFromDom();
  if (!learningDraft) return;

  const selectedIngredientIds = uniqueStrings(learningDraft.selectedIngredientIds).filter((id) => Boolean(getIngredientById(id)));
  if (selectedIngredientIds.length === 0) {
    syncStatus = 'Impossible de sauvegarder : ajoute au moins un ingrédient reconnu.';
    render();
    return;
  }

  const learned = upsertLearnedDish({
    menuItem: {
      id: learningDraft.itemId,
      rawName: learningDraft.dishName,
      normalizedName: normalizeText(learningDraft.dishName),
    },
    ingredientIds: selectedIngredientIds,
    aliases: splitTerms(learningDraft.aliasesText),
    restaurantName: learningDraft.restaurantName || getActiveRestaurant()?.name || restaurantDraft.name || undefined,
    notes: learningDraft.notes || undefined,
    source: 'manual-correction',
  });

  learnedDishes = getLearnedDishes();
  syncStatus = `Correction guidée sauvegardée pour “${learned.name}” avec : ${learnedDishToCsv(learned)}.`;
  learningDraft = null;

  void pushLearnedDish(learned).then((saved) => {
    if (saved) void refreshBackendStatus(false);
  });

  reanalyzeCurrentState();
  render();
}

function addIngredientToLearningDraft(ingredientId: string) {
  if (!learningDraft || !getIngredientById(ingredientId)) return;
  syncLearningDraftFromDom();
  learningDraft.selectedIngredientIds = uniqueStrings([...learningDraft.selectedIngredientIds, ingredientId]);
  learningDraft.ingredientSearch = '';
  render();
}

function removeIngredientFromLearningDraft(ingredientId: string) {
  if (!learningDraft) return;
  syncLearningDraftFromDom();
  learningDraft.selectedIngredientIds = learningDraft.selectedIngredientIds.filter((id) => id !== ingredientId);
  render();
}

function addLearningPack(packId: string) {
  if (!learningDraft) return;
  const pack = LEARNING_PACKS.find((item) => item.id === packId);
  if (!pack) return;
  syncLearningDraftFromDom();
  learningDraft.selectedIngredientIds = uniqueStrings([...learningDraft.selectedIngredientIds, ...pack.ingredientIds]).filter((id) => Boolean(getIngredientById(id)));
  render();
}

function updateLearningSearchResults(value: string) {
  if (!learningDraft) return;
  learningDraft.ingredientSearch = value;
  const box = document.querySelector<HTMLElement>('.ingredient-search-results');
  if (box) box.innerHTML = renderIngredientSearchResults(learningDraft);
}

function clearLearningIngredients() {
  if (!learningDraft) return;
  syncLearningDraftFromDom();
  learningDraft.selectedIngredientIds = [];
  render();
}

function reanalyzeCurrentState() {
  if (results.length === 0 && groupRows.length === 0) return;
  const items = parseMenuText(menuText);
  results = analyzeMenuItems(items, getActiveProfile());
  groupRows = analyzeMenuForGroup(items, getEnabledProfiles());
}

function buildInitialLearningNotes(result: AnalysisResult): string {
  const notes: string[] = [];
  if (result.matchedDish.sourceNotes?.length) notes.push(result.matchedDish.sourceNotes.join(' '));
  if (result.matchedDish.missingTerms.length) notes.push(`Termes à vérifier : ${result.matchedDish.missingTerms.join(', ')}`);
  return notes.join('\n');
}



function createRestaurantDraft(restaurant?: RestaurantMemory | null): RestaurantDraft {
  return {
    name: restaurant?.name ?? '',
    city: restaurant?.city ?? '',
    address: restaurant?.address ?? '',
    notes: restaurant?.notes ?? '',
  };
}

function getActiveRestaurant(): RestaurantMemory | null {
  return restaurantMemories.find((item) => item.id === activeRestaurantId) ?? null;
}

function syncRestaurantDraftFromDom() {
  const name = document.querySelector<HTMLInputElement>('#restaurantName');
  const city = document.querySelector<HTMLInputElement>('#restaurantCity');
  const address = document.querySelector<HTMLInputElement>('#restaurantAddress');
  const notes = document.querySelector<HTMLTextAreaElement>('#restaurantNotes');

  restaurantDraft = {
    name: name?.value.trim() ?? restaurantDraft.name,
    city: city?.value.trim() ?? restaurantDraft.city,
    address: address?.value.trim() ?? restaurantDraft.address,
    notes: notes?.value.trim() ?? restaurantDraft.notes,
  };
}

function buildCurrentRestaurantMemory(refreshTimestamp = true): RestaurantMemory | null {
  const name = restaurantDraft.name.trim();
  if (!name) return null;
  const normalizedName = normalizeText([name, restaurantDraft.city, restaurantDraft.address].filter(Boolean).join(' | '));
  const existing = restaurantMemories.find((item) => item.id === activeRestaurantId || item.normalizedName === normalizedName);
  return {
    id: existing?.id ?? `restaurant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name,
    normalizedName,
    city: restaurantDraft.city || undefined,
    address: restaurantDraft.address || undefined,
    notes: restaurantDraft.notes || undefined,
    updatedAt: refreshTimestamp ? new Date().toISOString() : existing?.updatedAt ?? new Date().toISOString(),
    favorite: existing?.favorite ?? false,
    visitCount: existing?.visitCount ?? 0,
    lastUsedAt: existing?.lastUsedAt,
  };
}

async function saveRestaurantFromDraft() {
  syncRestaurantDraftFromDom();
  const restaurant = buildCurrentRestaurantMemory(true);
  if (!restaurant) {
    orderPlanStatus = 'Ajoute au moins un nom de restaurant avant de sauvegarder.';
    render();
    return;
  }

  restaurantMemories = upsertRestaurantMemory(restaurant);
  activeRestaurantId = restaurant.id;
  saveActiveRestaurantId(activeRestaurantId);
  restaurantDraft = createRestaurantDraft(restaurant);
  orderPlanStatus = `Restaurant sauvegardé : ${restaurant.name}.`;
  render();

  const remote = await pushRestaurantMemory(restaurant).catch(() => null);
  if (remote) {
    restaurantMemories = upsertRestaurantMemory(remote);
    activeRestaurantId = remote.id;
    saveActiveRestaurantId(activeRestaurantId);
    restaurantDraft = createRestaurantDraft(remote);
    orderPlanStatus = `Restaurant sauvegardé localement et envoyé au backend : ${remote.name}.`;
    await refreshBackendStatus(false);
    render();
  }
}

async function syncRestaurantsWithBackend() {
  if (!backendConfigured) {
    orderPlanStatus = 'Aucun service de synchronisation n’est configuré. Les fiches restent sur cet appareil.';
    render();
    return;
  }
  syncRestaurantDraftFromDom();
  orderPlanStatus = 'Synchronisation restaurants avec le backend SQLite…';
  render();

  const health = await pingBackend(2200);
  backendHealth = health;
  if (!health?.ok) {
    backendStatus = 'Backend SQLite optionnel hors ligne';
    orderPlanStatus = 'Backend indisponible. Lance pnpm run server puis retente la synchronisation restaurants.';
    render();
    return;
  }

  const localRestaurant = buildCurrentRestaurantMemory(false);
  if (localRestaurant) {
    restaurantMemories = upsertRestaurantMemory(localRestaurant);
    activeRestaurantId = localRestaurant.id;
    saveActiveRestaurantId(activeRestaurantId);
    await pushRestaurantMemory(localRestaurant).catch(() => null);
  }

  for (const restaurant of restaurantMemories) {
    await pushRestaurantMemory(restaurant).catch(() => null);
  }

  const remoteRestaurants = await fetchRestaurants().catch(() => []);
  restaurantMemories = importRestaurants(remoteRestaurants);
  if (activeRestaurantId && !restaurantMemories.some((item) => item.id === activeRestaurantId)) {
    activeRestaurantId = restaurantMemories[0]?.id ?? '';
    saveActiveRestaurantId(activeRestaurantId);
  }
  restaurantDraft = createRestaurantDraft(getActiveRestaurant());
  backendStatus = `Backend SQLite connecté · ${learnedDishes.length} plat(s) appris · ${health.scans} scan(s) · ${health.contributions ?? 0} contribution(s)`;
  orderPlanStatus = `Sync restaurants terminée : ${restaurantMemories.length} fiche(s) disponible(s).`;
  render();
}

function loadRestaurantIntoDraft(id: string) {
  const restaurant = findRestaurantCandidateById(id);
  if (!restaurant) return;
  setRestaurantActive(restaurant, `Restaurant actif : ${restaurant.name}.`);
  render();
}

function clearActiveRestaurant() {
  activeRestaurantId = '';
  saveActiveRestaurantId('');
  restaurantDraft = createRestaurantDraft(null);
  orderPlanStatus = 'Scan détaché de tout restaurant.';
  render();
}

function findRestaurantCandidateById(id: string): RestaurantMemory | null {
  return mergeRestaurantPools(restaurantMemories, restaurantRemoteMatches).find((item) => item.id === id)
    ?? restaurantMemories.find((item) => item.id === id)
    ?? restaurantRemoteMatches.find((item) => item.id === id)
    ?? null;
}

function setRestaurantActive(restaurant: RestaurantMemory, statusMessage?: string) {
  restaurantMemories = upsertRestaurantMemory(restaurant);
  activeRestaurantId = restaurant.id;
  saveActiveRestaurantId(activeRestaurantId);
  restaurantDraft = createRestaurantDraft(restaurant);
  if (statusMessage) orderPlanStatus = statusMessage;
}

async function markRestaurantAsHere(id?: string) {
  syncRestaurantDraftFromDom();
  const source = id ? findRestaurantCandidateById(id) : (buildCurrentRestaurantMemory(false) ?? getActiveRestaurant());
  if (!source) {
    orderPlanStatus = 'Ajoute ou sélectionne un restaurant avant de marquer “Je suis ici”.';
    render();
    return;
  }

  const visited = markRestaurantVisit(source);
  setRestaurantActive(visited, `Restaurant actif : ${visited.name}. Visite enregistrée.`);
  render();

  const remote = await pushRestaurantMemory(visited).catch(() => null);
  if (remote) {
    setRestaurantActive(remote, `Restaurant actif synchronisé : ${remote.name}.`);
    void refreshBackendStatus(false);
    render();
  }
}

async function toggleFavoriteRestaurant(id?: string) {
  syncRestaurantDraftFromDom();
  const source = id ? findRestaurantCandidateById(id) : (getActiveRestaurant() ?? buildCurrentRestaurantMemory(false));
  if (!source) {
    orderPlanStatus = 'Sélectionne un restaurant avant de le passer en favori.';
    render();
    return;
  }

  const updated = toggleRestaurantFavorite(source);
  setRestaurantActive(updated, updated.favorite ? `Restaurant ajouté aux favoris : ${updated.name}.` : `Restaurant retiré des favoris : ${updated.name}.`);
  render();

  const remote = await pushRestaurantMemory(updated).catch(() => null);
  if (remote) {
    setRestaurantActive(remote);
    void refreshBackendStatus(false);
    render();
  }
}

function buildInsightForRestaurant(restaurant: RestaurantMemory) {
  return buildRestaurantInsight(restaurant, {
    mode: settings.mode,
    activeProfile: getActiveProfile(),
    enabledProfiles: getEnabledProfiles(),
    learnedDishes,
    publicDb: publicDbCache,
    queuedContributions: communityQueue,
  });
}

function loadKnownMenuForRestaurant(id?: string) {
  const restaurant = id ? findRestaurantCandidateById(id) : getActiveRestaurant();
  if (!restaurant) {
    orderPlanStatus = 'Sélectionne un restaurant avant de charger son menu connu.';
    render();
    return;
  }

  const insight = buildInsightForRestaurant(restaurant);
  if (!insight.knownDishes.length) {
    orderPlanStatus = `Aucun menu connu pour ${restaurant.name}.`;
    render();
    return;
  }

  setRestaurantActive(restaurant, `Menu connu chargé : ${insight.knownDishes.length} plat(s) pour ${restaurant.name}.`);
  menuText = insight.compatibility.menuText || buildKnownMenuText(insight.knownDishes, `Menu connu · ${restaurant.name}`);
  activeSource = 'manual';
  resetTranslationState('Menu connu chargé : traduction V12 à relancer si besoin.');
  analyzeCurrentMenu('manual');
}

async function copyKnownMenuForRestaurant(id?: string) {
  const restaurant = id ? findRestaurantCandidateById(id) : getActiveRestaurant();
  if (!restaurant) return;
  const insight = buildInsightForRestaurant(restaurant);
  const text = insight.compatibility.menuText || buildKnownMenuText(insight.knownDishes, `Menu connu · ${restaurant.name}`);
  if (!text.trim()) {
    orderPlanStatus = `Aucun menu connu à copier pour ${restaurant.name}.`;
    render();
    return;
  }
  await navigator.clipboard.writeText(text);
  orderPlanStatus = `Menu connu de ${restaurant.name} copié.`;
  render();
}

async function fetchRestaurantRemoteSearch() {
  if (!backendConfigured) {
    orderPlanStatus = 'La recherche distante n’est pas configurée.';
    render();
    return;
  }
  syncRestaurantDraftFromDom();
  const query = settings.restaurantSearch || restaurantDraft.name;
  const city = settings.restaurantCityFilter || restaurantDraft.city;
  if (!query && !city) {
    orderPlanStatus = 'Renseigne une recherche ou une ville avant de chercher côté backend.';
    render();
    return;
  }
  orderPlanStatus = 'Recherche restaurant côté backend…';
  render();
  const health = await pingBackend(2200);
  backendHealth = health;
  if (!health?.ok) {
    backendStatus = 'Backend SQLite optionnel hors ligne';
    orderPlanStatus = 'Backend indisponible. Lance pnpm run server pour chercher dans la base SQLite.';
    render();
    return;
  }
  restaurantRemoteMatches = await searchRestaurantsRemote(query, city, 80).catch(() => []);
  backendStatus = `Backend SQLite connecté · ${health.learnedDishes} plat(s) appris · ${health.scans} scan(s) · ${health.contributions ?? 0} contribution(s)`;
  orderPlanStatus = `${restaurantRemoteMatches.length} restaurant(s) trouvé(s) côté backend.`;
  render();
}

async function copyCurrentOrderPlan(button: HTMLElement) {
  if (!currentRecord) return;
  const restaurant = buildCurrentRestaurantMemory(false) ?? getActiveRestaurant();
  await navigator.clipboard.writeText(buildOrderPlanText(currentRecord, restaurant));
  button.textContent = 'Plan copié';
  orderPlanStatus = 'Plan de commande copié dans le presse-papiers.';
}

async function copySafeOrderText(button: HTMLElement, kind: 'plan' | 'script' | 'questions' | 'avoid') {
  const plan = getCurrentSafeOrderPlan();
  if (!plan) return;

  const text = kind === 'script'
    ? plan.serverScript
    : kind === 'questions'
      ? (plan.questions.join('\n') || 'Aucune question prioritaire.')
      : kind === 'avoid'
        ? (plan.avoidChoices.map((choice) => `- ${choice.itemName} : ${choice.blockers.slice(0, 2).join(' ; ') || 'incompatible avec le profil'}`).join('\n') || 'Aucun plat à éviter dans ce scan.')
        : plan.shortText;

  await navigator.clipboard.writeText(text);
  button.textContent = kind === 'script' ? 'Script copié' : kind === 'questions' ? 'Questions copiées' : kind === 'avoid' ? 'Liste copiée' : 'Plan sûr copié';
  orderPlanStatus = 'Plan de commande copié dans le presse-papiers.';
}


function getCurrentServerAssistantBundle() {
  const plan = getCurrentSafeOrderPlan();
  if (!plan) return null;
  return buildServerAssistant(plan, {
    tone: serverAssistantTone,
    language: serverAssistantLanguage,
    urgency: serverAssistantUrgency,
  }, serverAnswers);
}

async function copyServerAssistantText(button: HTMLElement, kind: 'main' | 'compact' | 'emergency' | 'answers') {
  const assistant = getCurrentServerAssistantBundle();
  if (!assistant) return;

  const text = kind === 'compact'
    ? assistant.compactScript.fullText
    : kind === 'emergency'
      ? assistant.emergencyScript.fullText
      : kind === 'answers'
        ? assistant.answerSheet
        : assistant.mainScript.fullText;

  await navigator.clipboard.writeText(text);
  button.textContent = kind === 'compact'
    ? 'Version courte copiée'
    : kind === 'emergency'
      ? 'Urgence copiée'
      : kind === 'answers'
        ? 'Réanalyse copiée'
        : 'Script copié';
  serverAssistantStatus = 'Script copié dans le presse-papiers.';
}

function speakServerAssistant() {
  const assistant = getCurrentServerAssistantBundle();
  if (!assistant) return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    serverAssistantStatus = 'Lecture vocale indisponible dans ce navigateur. Copie le script à la place.';
    render();
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(assistant.compactScript.fullText);
  utterance.lang = {
    fr: 'fr-FR',
    en: 'en-US',
    es: 'es-ES',
    it: 'it-IT',
    de: 'de-DE',
  }[serverAssistantLanguage];
  utterance.rate = serverAssistantTone === 'short' ? 1.03 : 0.92;
  window.speechSynthesis.speak(utterance);
  serverAssistantStatus = 'Lecture vocale lancée.';
  render();
}

function saveServerAssistantAnswersToRecord() {
  const assistant = getCurrentServerAssistantBundle();
  if (!assistant || !currentRecord) return;
  currentRecord = {
    ...currentRecord,
    notes: [
      ...(currentRecord.notes ?? []),
      `Assistant serveur · ${new Date().toLocaleString('fr-FR')}\n${assistant.answerSheet}`,
    ],
  };
  saveScanRecord(currentRecord);
  history = loadHistory();
  serverAssistantStatus = 'Réanalyse serveur enregistrée dans l’historique du scan.';
  render();
}


async function queueContributionFromResult(itemId: string) {
  const result = findSingleResult(itemId) ?? findGroupRow(itemId)?.results[0];
  if (!result) return;
  const restaurant = buildCurrentRestaurantMemory(false) ?? getActiveRestaurant();
  const contribution = makeContributionFromAnalysis(result, restaurant);
  queueCommunityContribution(contribution);
}

function queueContributionFromLearnedDish(learnedId: string) {
  const dish = learnedDishes.find((item) => item.id === learnedId);
  if (!dish) return;
  const restaurant = buildCurrentRestaurantMemory(false) ?? getActiveRestaurant();
  const contribution = makeContributionFromLearnedDish(dish, restaurant);
  queueCommunityContribution(contribution);
}

function queueCommunityContribution(contribution: PublicDishContribution) {
  if (!isContributionShareable(contribution)) {
    communityStatus = 'Contribution non partageable : ajoute une composition confirmée avec au moins un ingrédient reconnu.';
    render();
    return;
  }
  communityQueue = enqueueCommunityContribution(contribution);
  communityStatus = `Contribution ajoutée à la file locale : ${summarizeContribution(contribution)}.`;
  render();
}

async function syncCommunityDatabase() {
  if (!backendConfigured) {
    communityStatus = 'Aucun service de partage n’est configuré. La file reste locale et peut être exportée en JSON.';
    render();
    return;
  }
  communityStatus = 'Synchronisation de la base communautaire…';
  render();

  const health = await pingBackend(2400);
  backendHealth = health;
  if (!health?.ok) {
    backendStatus = 'Backend SQLite optionnel hors ligne';
    communityStatus = 'Backend indisponible. La file locale reste stockée hors ligne ; lance pnpm run server pour l’envoyer.';
    render();
    return;
  }

  let pushed = 0;
  let failed = 0;
  for (const contribution of communityQueue) {
    if (contribution.status !== 'queued' && !contribution.lastSyncError) continue;
    const remote = await pushCommunityContribution(contribution);
    if (remote) {
      communityQueue = updateCommunityContribution({ ...remote, lastSyncError: undefined });
      pushed += 1;
    } else {
      communityQueue = updateCommunityContribution({ ...contribution, lastSyncError: 'Échec sync backend', updatedAt: new Date().toISOString() });
      failed += 1;
    }
  }

  const publicDb = await fetchPublicDatabase();
  if (publicDb) {
    publicDbCache = publicDb;
    saveCachedPublicDatabase(publicDb);
  }

  await refreshBackendStatus(false);
  communityStatus = `Sync communauté terminée : ${pushed} envoyée(s), ${failed} échec(s), ${publicDbCache?.stats.contributions ?? 0} entrée(s) publiques en cache.`;
  render();
}

async function fetchPublicDatabaseToCache() {
  if (!backendConfigured) {
    communityStatus = 'Aucune base publique distante n’est configurée.';
    render();
    return;
  }
  communityStatus = 'Téléchargement de la base publique depuis le backend…';
  render();
  const publicDb = await fetchPublicDatabase();
  if (!publicDb) {
    communityStatus = 'Base publique indisponible. Lance le backend local/communautaire ou réessaie plus tard.';
    render();
    return;
  }
  publicDbCache = publicDb;
  saveCachedPublicDatabase(publicDb);
  publicSearchResults = [];
  communityStatus = `Base publique téléchargée : ${publicDb.stats.contributions} plat(s), ${publicDb.stats.restaurants} restaurant(s).`;
  render();
}

function importPublicDatabaseIntoLearnedMemory() {
  if (!publicDbCache?.dishes.length) {
    communityStatus = 'Aucune base publique en cache à importer.';
    render();
    return;
  }

  const importable = publicDbCache.dishes.filter(contributionIsImportable);
  const learned = importable.map(contributionToLearnedDish);
  learnedDishes = importLearnedDishes(learned);
  communityStatus = `${learned.length} plat(s) communautaire(s) importé(s) dans la mémoire locale. Ils seront utilisés comme source estimée/probable.`;
  reanalyzeCurrentState();
  render();
}

function exportPublicDatabaseForGithub() {
  const db = publicDbCache ?? buildPublicDatabaseExport(communityQueue);
  downloadPublicDatabaseExport(db, `can-i-eat-it-public-db-${new Date().toISOString().slice(0, 10)}.json`);
  communityStatus = 'Export JSON public généré. Ce fichier peut être publié dans un dépôt GitHub open-data.';
  render();
}

function clearLocalCommunityQueue() {
  clearCommunityQueue();
  communityQueue = [];
  communityStatus = 'File locale communautaire vidée.';
  render();
}

function searchCommunityCache(query: string) {
  communitySearch = query;
  const normalized = normalizeText(query);
  if (!normalized || !publicDbCache) {
    publicSearchResults = [];
    render();
    return;
  }
  publicSearchResults = publicDbCache.dishes.filter((item) => normalizeText([
    item.dishName,
    item.restaurantName,
    item.restaurantCity,
    item.ingredientIds.join(' '),
    item.aliases.join(' '),
  ].filter(Boolean).join(' ')).includes(normalized)).slice(0, 40);
  render();
}


async function loadModerationQueue() {
  if (!backendConfigured) {
    moderationStatus = 'La modération distante nécessite un service configuré.';
    render();
    return;
  }
  moderationStatus = 'Chargement des contributions depuis le backend…';
  render();

  const health = await pingBackend(2400);
  backendHealth = health;
  if (health?.ok) {
    const remote = await fetchCommunityContributions('', 1200).catch(() => []);
    moderationItems = remote;
    moderationStatus = `${remote.length} contribution(s) chargée(s) depuis le backend SQLite.`;
    backendStatus = `Backend SQLite connecté · ${health.learnedDishes} plat(s) appris · ${health.scans} scan(s) · ${health.contributions ?? 0} contribution(s)`;
  } else {
    moderationItems = getModerationSourceItems();
    backendStatus = 'Backend SQLite optionnel hors ligne';
    moderationStatus = `Backend hors ligne : review locale avec ${moderationItems.length} contribution(s) depuis la file/cache.`;
  }
  render();
}

function loadModerationFromCache() {
  moderationItems = [...communityQueue, ...(publicDbCache?.dishes ?? [])].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  moderationStatus = `${moderationItems.length} contribution(s) chargée(s) depuis le cache public et la file locale.`;
  render();
}

function findModerationContribution(id: string): PublicDishContribution | null {
  return getModerationSourceItems().find((item) => item.id === id)
    ?? publicDbCache?.dishes.find((item) => item.id === id)
    ?? communityQueue.find((item) => item.id === id)
    ?? null;
}

function upsertContributionEverywhere(item: PublicDishContribution) {
  moderationItems = upsertContributionInArray(moderationItems, item);

  if (communityQueue.some((contribution) => contribution.id === item.id)) {
    communityQueue = upsertContributionInArray(communityQueue, item);
    saveCommunityQueue(communityQueue);
  }

  if (publicDbCache) {
    publicDbCache = {
      ...publicDbCache,
      exportedAt: new Date().toISOString(),
      dishes: upsertContributionInArray(publicDbCache.dishes, item),
    };
    saveCachedPublicDatabase(publicDbCache);
  }
}

function upsertContributionInArray(items: PublicDishContribution[], item: PublicDishContribution): PublicDishContribution[] {
  const next = items.some((existing) => existing.id === item.id)
    ? items.map((existing) => existing.id === item.id ? item : existing)
    : [item, ...items];
  return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function buildModerationNote(review: ModerationReview, status: ContributionStatus): string {
  const issues = review.issues
    .filter((issue) => issue.severity !== 'info')
    .map((issue) => `${qualityIssueSeverityLabel(issue.severity)}: ${issue.message}`)
    .join(' / ');
  return [`V12 review -> ${communityStatusLabel(status)}.`, issues].filter(Boolean).join(' ');
}

async function moderateContributionStatus(id: string, status: ContributionStatus, trustScore?: number, silent = false) {
  const item = findModerationContribution(id);
  if (!item) {
    moderationStatus = 'Contribution introuvable dans la queue de modération.';
    render();
    return;
  }

  const review = buildModerationReviews(getModerationSourceItems()).find((entry) => entry.contribution.id === id)
    ?? buildModerationReviews([item])[0];
  const note = buildModerationNote(review, status);
  const localPatch = applyModerationPatch(item, status, note, trustScore ?? (status === review.recommendedStatus ? review.recommendedTrustScore : undefined));

  const health = await pingBackend(1800);
  let persisted: PublicDishContribution | null = null;
  if (health?.ok) {
    persisted = item.status === 'queued'
      ? await pushCommunityContribution(localPatch)
      : await updateContributionStatus(item.id, localPatch.status, localPatch.moderationNotes ?? note, localPatch.trustScore);
  }

  upsertContributionEverywhere(persisted ?? localPatch);
  moderationStatus = persisted
    ? `Contribution “${persisted.dishName}” mise à jour côté backend : ${communityStatusLabel(persisted.status)}.`
    : `Contribution “${localPatch.dishName}” mise à jour localement : ${communityStatusLabel(localPatch.status)}.`;

  if (!silent) render();
}

async function applySafeModerationBatch() {
  const candidates = buildModerationReviews(filterModerationItems(getModerationSourceItems()))
    .filter((review) => ['community_verified', 'trusted'].includes(review.recommendedStatus)
      && !review.issues.some((issue) => issue.severity === 'blocker')
      && review.issues.filter((issue) => issue.severity === 'warning').length === 0)
    .slice(0, 25);

  if (!candidates.length) {
    moderationStatus = 'Aucune recommandation sûre à appliquer automatiquement dans le filtre actuel.';
    render();
    return;
  }

  moderationStatus = `Application de ${candidates.length} recommandation(s) sûre(s)…`;
  render();
  for (const review of candidates) {
    await moderateContributionStatus(review.contribution.id, review.recommendedStatus, review.recommendedTrustScore, true);
  }
  moderationStatus = `${candidates.length} recommandation(s) sûre(s) appliquée(s).`;
  render();
}

async function copyModerationSummary(id: string) {
  const item = findModerationContribution(id);
  if (!item) return;
  const review = buildModerationReviews(getModerationSourceItems()).find((entry) => entry.contribution.id === id)
    ?? buildModerationReviews([item])[0];
  const text = [
    `Can I Eat It — fiche modération V12`,
    `Plat : ${item.dishName}`,
    `Restaurant : ${[item.restaurantName, item.restaurantCity, item.restaurantAddress].filter(Boolean).join(' · ') || 'non renseigné'}`,
    `Statut actuel : ${communityStatusLabel(item.status)} (${item.trustScore}/100)`,
    `Recommandation : ${communityStatusLabel(review.recommendedStatus)} (${review.recommendedTrustScore}/100)`,
    `Ingrédients : ${item.ingredientIds.map((ingredientId) => getIngredientById(ingredientId)).filter((ingredient): ingredient is Ingredient => Boolean(ingredient)).map(ingredientDisplayLabel).join(', ') || 'aucun'}`,
    `Points qualité : ${review.issues.map((issue) => `${qualityIssueSeverityLabel(issue.severity)} - ${issue.message}`).join(' | ') || 'aucun'}`,
  ].join('\n');
  await navigator.clipboard.writeText(text);
  moderationStatus = 'Fiche modération copiée.';
  render();
}

async function mergeModerationClusterByKey(key: string) {
  const source = getModerationSourceItems();
  const cluster = findContributionDuplicateClusters(source).find((item) => item.key === key);
  if (!cluster) {
    moderationStatus = 'Cluster de doublons introuvable.';
    render();
    return;
  }

  const merged = mergeContributionCluster(cluster);
  const health = await pingBackend(1800);
  let persisted = merged;
  if (health?.ok) {
    persisted = await pushCommunityContribution(merged) ?? merged;
  }
  upsertContributionEverywhere(persisted);

  for (const item of cluster.items) {
    if (item.id === persisted.id) continue;
    await moderateContributionStatus(item.id, 'deprecated', Math.min(item.trustScore, 35), true);
  }

  moderationStatus = `Cluster fusionné : “${persisted.dishName}” conserve ${persisted.ingredientIds.length} ingrédient(s), ${cluster.items.length - 1} doublon(s) obsolété(s).`;
  render();
}

function getActiveProfile(): UserProfile {
  return profiles.find((profile) => profile.id === settings.activeProfileId) ?? profiles[0] ?? DEFAULT_PROFILE;
}

function getEnabledProfiles(): UserProfile[] {
  const selected = profiles.filter((profile) => settings.enabledProfileIds.includes(profile.id ?? ''));
  return selected.length ? selected : [getActiveProfile()];
}

function filterResults(items: AnalysisResult[]): AnalysisResult[] {
  const query = normalizeText(settings.resultSearch);
  return items.filter((item) => {
    if (settings.statusFilter !== 'all' && item.status !== settings.statusFilter) return false;
    if (!query) return true;
    const text = normalizeText([
      item.menuItem.rawName,
      item.menuItem.description,
      item.menuItem.section,
      item.reasons.map((reason) => reason.message).join(' '),
      item.matchedDish.ingredients.map((ingredient) => ingredient.names[0]).join(' '),
    ].filter(Boolean).join(' '));
    return text.includes(query);
  });
}

function filterGroupRows(rows: GroupAnalysisRow[]): GroupAnalysisRow[] {
  const query = normalizeText(settings.resultSearch);
  return rows.filter((row) => {
    if (settings.statusFilter !== 'all' && row.aggregateStatus !== settings.statusFilter) return false;
    if (!query) return true;
    const text = normalizeText([
      row.menuItem.rawName,
      row.menuItem.description,
      row.menuItem.section,
      row.results.flatMap((result) => result.reasons.map((reason) => reason.message)).join(' '),
    ].filter(Boolean).join(' '));
    return text.includes(query);
  });
}

function normalizeSettings(value: AppSettings): AppSettings {
  const fallbackProfileId = profiles[0]?.id ?? DEFAULT_SETTINGS.activeProfileId;
  const activeProfileId = profiles.some((profile) => profile.id === value.activeProfileId) ? value.activeProfileId : fallbackProfileId;
  const enabledProfileIds = value.enabledProfileIds.filter((id) => profiles.some((profile) => profile.id === id));
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    activeProfileId,
    enabledProfileIds: enabledProfileIds.length ? enabledProfileIds : [activeProfileId],
  };
}

function persistSettings() {
  settings = normalizeSettings(settings);
  saveSettings(settings);
}

function syncMenuTextFromDom() {
  const textarea = document.querySelector<HTMLTextAreaElement>('#menuText');
  menuText = textarea?.value ?? menuText;
}

function resetTranslationState(status = '') {
  translationReport = null;
  translationStatus = status;
}

function findSingleResult(itemId: string): AnalysisResult | undefined {
  return results.find((result) => result.menuItem.id === itemId);
}

function findGroupRow(itemId: string): GroupAnalysisRow | undefined {
  return groupRows.find((row) => row.menuItem.id === itemId);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function getProfileNameForResult(result: AnalysisResult): string {
  return result.safeFor[0] || 'Profil';
}

app.addEventListener('click', async (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>('[data-action]');
  if (!button) return;

  const action = button.dataset.action;

  if (action === 'sample') {
    const sample = SAMPLE_MENUS.find((item) => item.id === button.dataset.sampleId);
    if (!sample) return;
    menuText = sample.text;
    activeSource = 'sample';
    selectedImageFile = null;
    selectedImageName = '';
    imagePreview = '';
    ocrStatus = '';
    ocrReport = null;
    ocrZoneDraft = '';
    resetTranslationState();
    render();
    return;
  }

  if (action === 'capture-camera') {
    const file = await captureMenuPhoto();
    if (!file) {
      ocrStatus = 'Caméra native indisponible ici. Utilise le bouton import/photo.';
      render();
      return;
    }
    selectedImageFile = file;
    selectedImageName = file.name;
    imagePreview = await fileToImagePreview(file);
    activeSource = 'camera';
    ocrStatus = 'Photo caméra chargée. Lance l’OCR.';
    ocrReport = null;
    ocrZoneDraft = '';
    resetTranslationState();
    render();
    return;
  }

  if (action === 'run-ocr') {
    if (!selectedImageFile) return;

    ocrStatus = 'OCR en cours…';
    render();

    try {
      const ocrResult = await readMenuImageAdvanced(selectedImageFile, (progress) => {
        ocrStatus = `${progress.status} ${Math.round(progress.progress * 100)}%`;
        const statusLine = document.querySelector('.status-line');
        if (statusLine) statusLine.textContent = ocrStatus;
      });
      menuText = ocrResult.text;
      ocrReport = ocrResult.report;
      ocrZoneDraft = buildOcrZoneDraft(menuText, ocrReport);
      activeSource = activeSource === 'camera' ? 'camera' : 'image-ocr';
      ocrStatus = `OCR terminé · ${summarizeOcrReport(ocrReport)}`;
      resetTranslationState('OCR terminé : lance la traduction V12 si le menu contient des termes étrangers.');
    } catch (error) {
      ocrStatus = `OCR impossible : ${error instanceof Error ? error.message : 'erreur inconnue'}`;
    }
    render();
    return;
  }

  if (action === 'build-ocr-report') {
    const items = parseMenuText(menuText);
    ocrReport = buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
    ocrStatus = summarizeOcrReport(ocrReport);
    render();
    return;
  }

  if (action === 'auto-correct-ocr') {
    menuText = autoCorrectOcrMenuText(menuText);
    const items = parseMenuText(menuText);
    ocrReport = buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
    ocrZoneDraft = buildOcrZoneDraft(menuText, ocrReport);
    ocrStatus = `Texte nettoyé · ${summarizeOcrReport(ocrReport)}`;
    activeSource = 'manual';
    resetTranslationState('Texte OCR nettoyé : traduction V12 à relancer si besoin.');
    render();
    return;
  }

  if (action === 'use-ocr-preview') {
    if (!ocrReport?.correctedTextPreview) return;
    menuText = ocrReport.correctedTextPreview;
    const items = parseMenuText(menuText);
    ocrReport = buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
    ocrZoneDraft = buildOcrZoneDraft(menuText, ocrReport);
    ocrStatus = `Preview appliquée · ${summarizeOcrReport(ocrReport)}`;
    activeSource = 'manual';
    resetTranslationState('Preview OCR appliquée : traduction V12 à relancer si besoin.');
    render();
    return;
  }

  if (action === 'extract-ocr-zone') {
    const items = parseMenuText(menuText);
    ocrReport = ocrReport ?? buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
    ocrZoneDraft = buildOcrZoneDraft(menuText, ocrReport);
    ocrStatus = ocrZoneDraft ? 'Zone douteuse isolée. Corrige-la ou analyse-la séparément.' : 'Aucune zone douteuse isolable.';
    render();
    return;
  }

  if (action === 'analyze-ocr-zone') {
    if (!ocrZoneDraft.trim()) return;
    menuText = autoCorrectOcrMenuText(ocrZoneDraft);
    activeSource = 'manual';
    analyzeCurrentMenu('manual');
    return;
  }

  if (action === 'merge-ocr-zone') {
    if (!ocrZoneDraft.trim()) return;
    menuText = mergeZoneIntoMenuText(menuText, autoCorrectOcrMenuText(ocrZoneDraft));
    const items = parseMenuText(menuText);
    ocrReport = buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
    ocrStatus = 'Zone fusionnée au menu complet.';
    activeSource = 'manual';
    resetTranslationState('Zone OCR fusionnée : traduction V12 à relancer si besoin.');
    render();
    return;
  }

  if (action === 'clear-ocr-zone') {
    ocrZoneDraft = '';
    render();
    return;
  }

  if (action === 'build-translation-report') {
    syncMenuTextFromDom();
    translationReport = buildMenuTranslationReport(menuText, translationSourceLanguage);
    translationStatus = translationReport.summary;
    render();
    return;
  }

  if (action === 'apply-translation') {
    syncMenuTextFromDom();
    translationReport = translationReport ?? buildMenuTranslationReport(menuText, translationSourceLanguage);
    menuText = applyMenuTranslationToText(translationReport);
    const items = parseMenuText(menuText);
    ocrReport = buildOcrAdvancedReport(menuText, items, selectedImageName || undefined);
    ocrZoneDraft = buildOcrZoneDraft(menuText, ocrReport);
    activeSource = 'manual';
    translationStatus = 'Texte enrichi appliqué au champ menu. Tu peux analyser normalement.';
    render();
    return;
  }

  if (action === 'translate-analyze') {
    syncMenuTextFromDom();
    translationReport = buildMenuTranslationReport(menuText, translationSourceLanguage);
    menuText = applyMenuTranslationToText(translationReport);
    translationStatus = `Traduction appliquée puis analyse lancée · ${translationReport.summary}`;
    activeSource = 'manual';
    analyzeCurrentMenu('manual');
    return;
  }

  if (action === 'copy-translated-menu') {
    if (!translationReport) return;
    await navigator.clipboard.writeText(translationReport.analysisText);
    translationStatus = 'Texte traduit/enrichi copié.';
    render();
    return;
  }

  if (action === 'clear-translation-report') {
    resetTranslationState();
    render();
    return;
  }

  if (action === 'analyze') {
    analyzeCurrentMenu(activeSource === 'image-ocr' || activeSource === 'camera' ? activeSource : 'manual');
    return;
  }

  if (action === 'set-mode') {
    settings.mode = button.dataset.mode === 'group' ? 'group' : 'single';
    persistSettings();
    render();
    return;
  }

  if (action === 'duplicate-profile') {
    syncActiveProfileFromDom();
    const active = getActiveProfile();
    const copy: UserProfile = {
      ...active,
      id: `profile-${Date.now()}`,
      name: `${active.name} copie`,
      enabled: true,
    };
    profiles = [copy, ...profiles];
    settings.activeProfileId = copy.id ?? settings.activeProfileId;
    settings.enabledProfileIds = uniqueStrings([...(settings.enabledProfileIds ?? []), copy.id ?? '']);
    saveProfiles(profiles);
    persistSettings();
    render();
    return;
  }

  if (action === 'delete-profile') {
    const active = getActiveProfile();
    if (profiles.length <= 1) return;
    if (!confirmDestructive(`Supprimer définitivement le profil “${active.name}” ?`)) return;
    profiles = profiles.filter((profile) => profile.id !== active.id);
    settings.activeProfileId = profiles[0]?.id ?? DEFAULT_SETTINGS.activeProfileId;
    settings.enabledProfileIds = settings.enabledProfileIds.filter((id) => id !== active.id);
    if (settings.enabledProfileIds.length === 0 && profiles[0]?.id) settings.enabledProfileIds = [profiles[0].id];
    saveProfiles(profiles);
    persistSettings();
    render();
    return;
  }

  if (action === 'reset-profiles') {
    if (!confirmDestructive('Réinitialiser tous les profils et effacer les résultats en cours ?')) return;
    profiles = resetAllProfiles();
    settings = normalizeSettings(DEFAULT_SETTINGS);
    results = [];
    groupRows = [];
    currentRecord = null;
    serverAnswers = {};
    serverAssistantStatus = '';
    render();
    return;
  }

  if (action === 'clear-results') {
    if (!confirmDestructive('Effacer les résultats de l’analyse en cours ?')) return;
    results = [];
    groupRows = [];
    offLookups = {};
    currentRecord = null;
    render();
    return;
  }

  if (action === 'clear-history') {
    if (!confirmDestructive('Effacer tout l’historique des scans sur cet appareil ?')) return;
    clearHistory();
    history = [];
    render();
    return;
  }

  if (action === 'refresh-backend') {
    syncStatus = 'Test du backend local…';
    render();
    await refreshBackendStatus(false);
    syncStatus = backendHealth?.ok ? 'Backend SQLite joignable.' : 'Backend hors ligne. Lance pnpm run server pour activer SQLite.';
    render();
    return;
  }

  if (action === 'sync-backend') {
    await syncLearningWithBackend();
    return;
  }

  if (action === 'save-restaurant') {
    await saveRestaurantFromDraft();
    return;
  }

  if (action === 'sync-restaurants') {
    await syncRestaurantsWithBackend();
    return;
  }

  if (action === 'load-restaurant') {
    const id = button.dataset.restaurantId;
    if (id) loadRestaurantIntoDraft(id);
    return;
  }

  if (action === 'clear-restaurant') {
    clearActiveRestaurant();
    return;
  }

  if (action === 'restaurant-i-am-here') {
    await markRestaurantAsHere();
    return;
  }

  if (action === 'restaurant-i-am-here-id') {
    const id = button.dataset.restaurantId;
    if (!id) return;
    await markRestaurantAsHere(id);
    return;
  }

  if (action === 'toggle-active-restaurant-favorite') {
    await toggleFavoriteRestaurant();
    return;
  }

  if (action === 'toggle-restaurant-favorite-id') {
    const id = button.dataset.restaurantId;
    if (!id) return;
    await toggleFavoriteRestaurant(id);
    return;
  }

  if (action === 'restaurant-load-known-menu') {
    loadKnownMenuForRestaurant();
    return;
  }

  if (action === 'restaurant-load-known-menu-id') {
    const id = button.dataset.restaurantId;
    if (!id) return;
    loadKnownMenuForRestaurant(id);
    return;
  }

  if (action === 'restaurant-copy-known-menu') {
    await copyKnownMenuForRestaurant();
    return;
  }

  if (action === 'restaurant-remote-search') {
    await fetchRestaurantRemoteSearch();
    return;
  }

  if (action === 'forget-restaurant') {
    const id = button.dataset.restaurantId;
    if (!id) return;
    const restaurant = findRestaurantCandidateById(id);
    if (!confirmDestructive(`Oublier la fiche “${restaurant?.name ?? 'ce restaurant'}” sur cet appareil ?`)) return;
    restaurantMemories = removeRestaurantMemory(id);
    if (activeRestaurantId === id) {
      activeRestaurantId = '';
      restaurantDraft = createRestaurantDraft(null);
    }
    orderPlanStatus = 'Restaurant oublié localement.';
    render();
    return;
  }

  if (action === 'copy-order-plan') {
    await copyCurrentOrderPlan(button);
    return;
  }

  if (action === 'copy-safe-order-plan') {
    await copySafeOrderText(button, 'plan');
    return;
  }

  if (action === 'copy-safe-order-script') {
    await copySafeOrderText(button, 'script');
    return;
  }

  if (action === 'copy-safe-order-questions') {
    await copySafeOrderText(button, 'questions');
    return;
  }

  if (action === 'copy-safe-order-avoid') {
    await copySafeOrderText(button, 'avoid');
    return;
  }

  if (action === 'copy-server-assistant-main') {
    await copyServerAssistantText(button, 'main');
    return;
  }

  if (action === 'copy-server-assistant-compact') {
    await copyServerAssistantText(button, 'compact');
    return;
  }

  if (action === 'copy-server-assistant-emergency') {
    await copyServerAssistantText(button, 'emergency');
    return;
  }

  if (action === 'copy-server-answer-sheet') {
    await copyServerAssistantText(button, 'answers');
    return;
  }

  if (action === 'save-server-answer-sheet') {
    saveServerAssistantAnswersToRecord();
    return;
  }

  if (action === 'speak-server-assistant') {
    speakServerAssistant();
    return;
  }

  if (action === 'reset-server-answers') {
    if (!confirmDestructive('Effacer toutes les réponses notées pour cet échange ?')) return;
    serverAnswers = {};
    serverAssistantStatus = 'Réponses serveur réinitialisées.';
    render();
    return;
  }

  if (action === 'server-answer') {
    const questionId = button.dataset.questionId;
    const answer = button.dataset.answer as ServerAnswerValue | undefined;
    if (!questionId || !answer) return;
    if (answer === 'unanswered') delete serverAnswers[questionId];
    else serverAnswers[questionId] = answer;
    serverAssistantStatus = `Réponse serveur notée : ${answerValueLabel(answer)}.`;
    render();
    return;
  }

  if (action === 'community-sync') {
    await syncCommunityDatabase();
    return;
  }

  if (action === 'community-fetch-db') {
    await fetchPublicDatabaseToCache();
    return;
  }

  if (action === 'community-import-public-db') {
    importPublicDatabaseIntoLearnedMemory();
    return;
  }

  if (action === 'community-export-github-json') {
    exportPublicDatabaseForGithub();
    return;
  }

  if (action === 'community-clear-queue') {
    if (!confirmDestructive('Vider toute la file locale de corrections préparées ?')) return;
    clearLocalCommunityQueue();
    return;
  }

  if (action === 'moderation-load') {
    await loadModerationQueue();
    return;
  }

  if (action === 'moderation-load-cache') {
    loadModerationFromCache();
    return;
  }

  if (action === 'moderation-apply-safe-batch') {
    await applySafeModerationBatch();
    return;
  }

  if (action === 'moderation-set-status') {
    const id = button.dataset.contributionId;
    const status = button.dataset.status as ContributionStatus | undefined;
    if (!id || !status) return;
    await moderateContributionStatus(id, status);
    return;
  }

  if (action === 'moderation-apply-recommendation') {
    const id = button.dataset.contributionId;
    const status = button.dataset.status as ContributionStatus | undefined;
    const trust = Number(button.dataset.trust);
    if (!id || !status) return;
    await moderateContributionStatus(id, status, Number.isFinite(trust) ? trust : undefined);
    return;
  }

  if (action === 'moderation-copy-summary') {
    const id = button.dataset.contributionId;
    if (!id) return;
    await copyModerationSummary(id);
    return;
  }

  if (action === 'moderation-merge-cluster') {
    const key = button.dataset.clusterKey;
    if (!key) return;
    await mergeModerationClusterByKey(key);
    return;
  }

  if (action === 'learn-dish') {
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    openLearningDraftFromResult(itemId);
    return;
  }

  if (action === 'share-dish-public') {
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    await queueContributionFromResult(itemId);
    return;
  }

  if (action === 'edit-learned-dish') {
    const id = button.dataset.learnedId;
    if (!id) return;
    openLearningDraftFromMemory(id);
    return;
  }

  if (action === 'share-learned-public') {
    const id = button.dataset.learnedId;
    if (!id) return;
    queueContributionFromLearnedDish(id);
    return;
  }

  if (action === 'learning-close') {
    learningDraft = null;
    render();
    return;
  }

  if (action === 'learning-add-ingredient') {
    const id = button.dataset.ingredientId;
    if (!id) return;
    addIngredientToLearningDraft(id);
    return;
  }

  if (action === 'learning-remove-ingredient') {
    const id = button.dataset.ingredientId;
    if (!id) return;
    removeIngredientFromLearningDraft(id);
    return;
  }

  if (action === 'learning-pack') {
    const packId = button.dataset.packId;
    if (!packId) return;
    addLearningPack(packId);
    return;
  }

  if (action === 'learning-clear') {
    if (!confirmDestructive('Retirer tous les ingrédients sélectionnés de cette correction ?')) return;
    clearLearningIngredients();
    return;
  }

  if (action === 'learning-save') {
    await saveLearningDraft();
    return;
  }

  if (action === 'forget-learned-dish') {
    const id = button.dataset.learnedId;
    if (!id) return;
    const learnedDish = learnedDishes.find((item) => item.id === id);
    if (!confirmDestructive(`Oublier la correction “${learnedDish?.name ?? 'ce plat'}” ?`)) return;
    removeLearnedDish(id);
    learnedDishes = getLearnedDishes();
    syncStatus = 'Correction oubliée localement.';
    void deleteRemoteLearnedDish(id);
    if (results.length > 0 || groupRows.length > 0) {
      const items = parseMenuText(menuText);
      results = analyzeMenuItems(items, getActiveProfile());
      groupRows = analyzeMenuForGroup(items, getEnabledProfiles());
    }
    render();
    return;
  }

  if (action === 'load-history') {
    const record = history.find((item) => item.id === button.dataset.recordId);
    if (!record) return;
    menuText = record.rawText;
    results = record.results;
    groupRows = record.groupRows ?? [];
    currentRecord = record;
    activeSource = record.source;
    resetTranslationState('Historique chargé : traduction V12 à relancer si besoin.');
    serverAnswers = {};
    serverAssistantStatus = '';
    if (record.restaurant) {
      restaurantMemories = upsertRestaurantMemory(record.restaurant);
      activeRestaurantId = record.restaurant.id;
      saveActiveRestaurantId(activeRestaurantId);
      restaurantDraft = createRestaurantDraft(record.restaurant);
    }
    if (record.profiles?.length) {
      profiles = record.profiles;
      settings.enabledProfileIds = record.profiles.map((profile) => profile.id ?? '').filter(Boolean);
      settings.activeProfileId = record.profile.id ?? settings.activeProfileId;
      persistSettings();
      saveProfiles(profiles);
    }
    navigateToView('results');
    return;
  }

  if (action === 'copy-questions') {
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    const result = findSingleResult(itemId);
    const text = result?.askServerQuestions.join('\n') || 'Aucune question nécessaire.';
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copié';
    return;
  }

  if (action === 'copy-group-questions') {
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    const row = findGroupRow(itemId);
    const text = uniqueStrings(row?.results.flatMap((result) => result.askServerQuestions) ?? []).join('\n') || 'Aucune question nécessaire.';
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copié';
    return;
  }

  if (action === 'copy-question-sheet') {
    if (!currentRecord) return;
    await navigator.clipboard.writeText(buildQuestionSheet(currentRecord));
    button.textContent = 'Questions copiées';
    return;
  }

  if (action === 'export-json') {
    if (currentRecord) downloadScanAsJson(currentRecord);
    return;
  }

  if (action === 'off-lookup') {
    const itemId = button.dataset.itemId;
    if (!itemId) return;
    const result = findSingleResult(itemId);
    if (!result) return;

    offLookups[itemId] = 'Recherche Open Food Facts en cours…';
    render();
    const lookup = await lookupOpenFoodFacts(result.menuItem.rawName).catch(() => null);
    if (!lookup) {
      offLookups[itemId] = 'Aucune source produit exploitable trouvée. Pour un plat restaurant, la confirmation serveur reste prioritaire.';
    } else {
      const urlPart = lookup.url ? `<br><a href="${escapeHtml(lookup.url)}" target="_blank" rel="noreferrer">Ouvrir la fiche source</a>` : '';
      offLookups[itemId] = `Source ${lookup.source} · confiance ${lookup.confidence}<br><strong>Ingrédients trouvés :</strong> ${escapeHtml(lookup.ingredients.join(', ') || 'non renseignés')}<br><strong>Allergènes :</strong> ${escapeHtml(lookup.allergens.join(', ') || 'non renseignés')}${urlPart}`;
    }
    render();
  }
});

app.addEventListener('change', async (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;

  if (target.id === 'imageInput' && target instanceof HTMLInputElement) {
    const file = target.files?.[0];
    if (!file) return;
    selectedImageFile = file;
    imagePreview = await fileToImagePreview(file);
    selectedImageName = file.name;
    activeSource = 'image-ocr';
    ocrStatus = 'Image chargée. Lance l’OCR ou copie le texte manuellement.';
    ocrReport = null;
    ocrZoneDraft = '';
    resetTranslationState();
    render();
    return;
  }

  if (target.id === 'riskFirst' && target instanceof HTMLInputElement) {
    settings.riskFirst = target.checked;
    persistSettings();
    render();
    return;
  }

  if (target.id === 'statusFilter' && target instanceof HTMLSelectElement) {
    settings.statusFilter = target.value as AppSettings['statusFilter'];
    persistSettings();
    render();
    return;
  }

  if (target.id === 'resultSearch' && target instanceof HTMLInputElement) {
    settings.resultSearch = target.value;
    persistSettings();
    render();
    return;
  }

  if (target.id === 'moderationFilter' && target instanceof HTMLSelectElement) {
    moderationFilter = target.value as typeof moderationFilter;
    render();
    return;
  }

  if (target.id === 'restaurantSort' && target instanceof HTMLSelectElement) {
    settings.restaurantSort = target.value as AppSettings['restaurantSort'];
    persistSettings();
    render();
    return;
  }

  if (target.id === 'restaurantOnlyFavorites' && target instanceof HTMLInputElement) {
    settings.restaurantOnlyFavorites = target.checked;
    persistSettings();
    render();
    return;
  }

  if (target.id === 'translationSourceLanguage' && target instanceof HTMLSelectElement) {
    translationSourceLanguage = target.value as MenuTranslationLanguage;
    resetTranslationState(`Langue source ${menuTranslationLanguageLabel(translationSourceLanguage)} sélectionnée. Relance “Traduire menu”.`);
    render();
    return;
  }

  if (target.matches('select[data-action="server-answer-select"]') && target instanceof HTMLSelectElement) {
    const questionId = target.dataset.questionId;
    const answer = target.value as ServerAnswerValue;
    if (!questionId) return;
    if (answer === 'unanswered') delete serverAnswers[questionId];
    else serverAnswers[questionId] = answer;
    serverAssistantStatus = `Réponse serveur notée : ${answerValueLabel(answer)}.`;
    render();
    return;
  }

  if (target.id === 'serverAssistantLanguage' && target instanceof HTMLSelectElement) {
    serverAssistantLanguage = target.value as ServerAssistantLanguage;
    serverAssistantStatus = 'Langue de l’assistant serveur mise à jour.';
    render();
    return;
  }

  if (target.id === 'serverAssistantTone' && target instanceof HTMLSelectElement) {
    serverAssistantTone = target.value as ServerAssistantTone;
    serverAssistantStatus = 'Ton de l’assistant serveur mis à jour.';
    render();
    return;
  }

  if (target.id === 'serverAssistantUrgency' && target instanceof HTMLSelectElement) {
    serverAssistantUrgency = target.value as ServerAssistantUrgency;
    serverAssistantStatus = 'Priorité de l’assistant serveur mise à jour.';
    render();
    return;
  }

  if (target.id === 'activeProfileId' && target instanceof HTMLSelectElement) {
    settings.activeProfileId = target.value;
    persistSettings();
    render();
    return;
  }

  if (target.matches('input[data-kind="group-profile"]')) {
    settings.enabledProfileIds = Array.from(document.querySelectorAll<HTMLInputElement>('input[data-kind="group-profile"]:checked')).map((input) => input.value);
    if (!settings.enabledProfileIds.includes(settings.activeProfileId)) {
      settings.enabledProfileIds.push(settings.activeProfileId);
    }
    persistSettings();
    if (results.length > 0 || groupRows.length > 0) analyzeCurrentMenu(activeSource);
    else render();
    return;
  }

  if (target.matches('input[data-kind], #strictness')) {
    syncActiveProfileFromDom();
    if (results.length > 0 || groupRows.length > 0) {
      const items = parseMenuText(menuText);
      results = analyzeMenuItems(items, getActiveProfile());
      groupRows = analyzeMenuForGroup(items, getEnabledProfiles());
    }
    render();
  }
});

app.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;

  if (target.id === 'communitySearch') {
    searchCommunityCache(target.value);
    return;
  }

  if (target.id === 'moderationSearch') {
    moderationSearch = target.value;
    render();
    return;
  }

  if (target.id === 'restaurantSearch') {
    settings.restaurantSearch = target.value;
    persistSettings();
    render();
    return;
  }

  if (target.id === 'restaurantCityFilter') {
    settings.restaurantCityFilter = target.value;
    persistSettings();
    render();
    return;
  }

  if (['restaurantName', 'restaurantCity', 'restaurantAddress', 'restaurantNotes'].includes(target.id)) {
    syncRestaurantDraftFromDom();
    return;
  }

  if (target.id === 'learningSearch') {
    updateLearningSearchResults(target.value);
    return;
  }

  if (['learningRestaurant', 'learningAliases', 'learningNotes'].includes(target.id)) {
    syncLearningDraftFromDom();
    return;
  }

  if (target.id === 'ocrZoneDraft') {
    ocrZoneDraft = target.value;
    return;
  }

  if (target.id === 'menuText') {
    menuText = target.value;
    activeSource = 'manual';
    translationReport = null;
    translationStatus = 'Texte modifié : traduction V12 à relancer si besoin.';
    return;
  }
  if (['profileName', 'forbiddenTerms', 'cautionTerms'].includes(target.id)) {
    syncActiveProfileFromDom();
  }
});

window.addEventListener('keydown', (event) => {
  if (!learningDraft) return;
  if (event.key === 'Escape') {
    learningDraft = null;
    render();
    return;
  }
  if (event.key !== 'Tab') return;

  const dialog = document.querySelector<HTMLElement>('#learningDialog');
  if (!dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

window.addEventListener('hashchange', () => {
  window.scrollTo({ top: 0, behavior: 'auto' });
  render();
});

render();
if (backendConfigured) void refreshBackendStatus(true);
