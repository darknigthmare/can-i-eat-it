import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

let Database;
try {
  ({ default: Database } = await import('better-sqlite3'));
} catch (error) {
  console.error('\n[Can I Eat It] better-sqlite3 est manquant.');
  console.error('Lance d’abord : npm install');
  console.error('Puis relance : npm run server\n');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.CIEI_BACKEND_PORT || 4177);
const HOST = process.env.CIEI_BACKEND_HOST || '127.0.0.1';
const dbPath = process.env.CIEI_DB_PATH || path.join(process.cwd(), 'data', 'can-i-eat-it.sqlite');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
ensureColumn('restaurants', 'favorite', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('restaurants', 'visit_count', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('restaurants', 'last_used_at', 'TEXT');

const statements = {
  healthLearned: db.prepare('SELECT COUNT(*) AS count FROM learned_dishes'),
  healthScans: db.prepare('SELECT COUNT(*) AS count FROM scans'),
  healthRestaurants: db.prepare('SELECT COUNT(*) AS count FROM restaurants'),
  healthContributions: db.prepare('SELECT COUNT(*) AS count FROM public_contributions'),
  healthVerifiedContributions: db.prepare("SELECT COUNT(*) AS count FROM public_contributions WHERE status IN ('community_verified','trusted')"),
  listLearned: db.prepare('SELECT * FROM learned_dishes ORDER BY updated_at DESC LIMIT ?'),
  upsertLearned: db.prepare(`
    INSERT INTO learned_dishes (id, name, normalized_name, aliases_json, restaurant_name, ingredient_ids_json, confidence, notes, source, updated_at, use_count)
    VALUES (@id, @name, @normalized_name, @aliases_json, @restaurant_name, @ingredient_ids_json, @confidence, @notes, @source, @updated_at, @use_count)
    ON CONFLICT(normalized_name) DO UPDATE SET
      name = excluded.name,
      aliases_json = excluded.aliases_json,
      restaurant_name = excluded.restaurant_name,
      ingredient_ids_json = excluded.ingredient_ids_json,
      confidence = excluded.confidence,
      notes = excluded.notes,
      source = excluded.source,
      updated_at = excluded.updated_at,
      use_count = excluded.use_count
  `),
  deleteLearned: db.prepare('DELETE FROM learned_dishes WHERE id = ?'),
  listScans: db.prepare('SELECT * FROM scans ORDER BY created_at DESC LIMIT ?'),
  upsertScan: db.prepare(`
    INSERT INTO scans (id, created_at, source, profile_name, raw_text, payload_json)
    VALUES (@id, @created_at, @source, @profile_name, @raw_text, @payload_json)
    ON CONFLICT(id) DO UPDATE SET
      created_at = excluded.created_at,
      source = excluded.source,
      profile_name = excluded.profile_name,
      raw_text = excluded.raw_text,
      payload_json = excluded.payload_json
  `),
  listRestaurants: db.prepare('SELECT * FROM restaurants ORDER BY COALESCE(last_used_at, updated_at) DESC, updated_at DESC LIMIT ?'),
  searchRestaurants: db.prepare("SELECT * FROM restaurants WHERE (@query = '' OR normalized_name LIKE @queryLike OR name LIKE @queryLike OR notes LIKE @queryLike) AND (@city = '' OR city LIKE @cityLike OR address LIKE @cityLike) ORDER BY favorite DESC, COALESCE(last_used_at, updated_at) DESC, updated_at DESC LIMIT @limit"),
  upsertRestaurant: db.prepare(`
    INSERT INTO restaurants (id, name, normalized_name, address, city, notes, updated_at, favorite, visit_count, last_used_at)
    VALUES (@id, @name, @normalized_name, @address, @city, @notes, @updated_at, @favorite, @visit_count, @last_used_at)
    ON CONFLICT(normalized_name) DO UPDATE SET
      name = excluded.name,
      address = excluded.address,
      city = excluded.city,
      notes = excluded.notes,
      updated_at = excluded.updated_at,
      favorite = excluded.favorite,
      visit_count = excluded.visit_count,
      last_used_at = excluded.last_used_at
  `),
  listContributions: db.prepare("SELECT * FROM public_contributions WHERE (? = '' OR status = ?) ORDER BY updated_at DESC LIMIT ?"),
  listPublicContributions: db.prepare("SELECT * FROM public_contributions WHERE status NOT IN ('rejected','deprecated') ORDER BY trust_score DESC, updated_at DESC LIMIT ?"),
  searchPublicContributions: db.prepare("SELECT * FROM public_contributions WHERE status NOT IN ('rejected','deprecated') AND (normalized_dish_name LIKE @query OR dish_name LIKE @query OR restaurant_name LIKE @query OR restaurant_city LIKE @query) ORDER BY trust_score DESC, updated_at DESC LIMIT @limit"),
  getContribution: db.prepare('SELECT * FROM public_contributions WHERE id = ?'),
  upsertContribution: db.prepare(`
    INSERT INTO public_contributions (id, kind, status, created_at, updated_at, dish_name, normalized_dish_name, aliases_json, restaurant_name, restaurant_city, restaurant_address, ingredient_ids_json, allergen_tags_json, dietary_tags_json, source_type, source_label, evidence_url, notes, trust_score, app_version, contributor_alias, moderation_notes, payload_json)
    VALUES (@id, @kind, @status, @created_at, @updated_at, @dish_name, @normalized_dish_name, @aliases_json, @restaurant_name, @restaurant_city, @restaurant_address, @ingredient_ids_json, @allergen_tags_json, @dietary_tags_json, @source_type, @source_label, @evidence_url, @notes, @trust_score, @app_version, @contributor_alias, @moderation_notes, @payload_json)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      status = excluded.status,
      updated_at = excluded.updated_at,
      dish_name = excluded.dish_name,
      normalized_dish_name = excluded.normalized_dish_name,
      aliases_json = excluded.aliases_json,
      restaurant_name = excluded.restaurant_name,
      restaurant_city = excluded.restaurant_city,
      restaurant_address = excluded.restaurant_address,
      ingredient_ids_json = excluded.ingredient_ids_json,
      allergen_tags_json = excluded.allergen_tags_json,
      dietary_tags_json = excluded.dietary_tags_json,
      source_type = excluded.source_type,
      source_label = excluded.source_label,
      evidence_url = excluded.evidence_url,
      notes = excluded.notes,
      trust_score = excluded.trust_score,
      app_version = excluded.app_version,
      contributor_alias = excluded.contributor_alias,
      moderation_notes = excluded.moderation_notes,
      payload_json = excluded.payload_json
  `),
  updateContributionStatus: db.prepare('UPDATE public_contributions SET status = @status, moderation_notes = @moderation_notes, trust_score = COALESCE(@trust_score, trust_score), updated_at = @updated_at WHERE id = @id'),
  insertModerationEvent: db.prepare(`
    INSERT INTO contribution_moderation_events (id, contribution_id, created_at, action, status_before, status_after, trust_score_before, trust_score_after, note)
    VALUES (@id, @contribution_id, @created_at, @action, @status_before, @status_after, @trust_score_before, @trust_score_after, @note)
  `),
};

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        version: '1.2.0',
        dbPath,
        learnedDishes: Number(statements.healthLearned.get().count),
        scans: Number(statements.healthScans.get().count),
        restaurants: Number(statements.healthRestaurants.get().count),
        contributions: Number(statements.healthContributions.get().count),
        verifiedContributions: Number(statements.healthVerifiedContributions.get().count),
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/learned-dishes') {
      const limit = clampLimit(url.searchParams.get('limit'), 600);
      sendJson(res, 200, { items: statements.listLearned.all(limit).map(rowToLearnedDish) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/learned-dishes') {
      const body = await readJson(req);
      const item = normalizeLearnedDish(body);
      statements.upsertLearned.run(itemToLearnedRow(item));
      sendJson(res, 200, { ok: true, item });
      return;
    }

    if (req.method === 'DELETE' && url.pathname.startsWith('/api/learned-dishes/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      statements.deleteLearned.run(id);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/scans') {
      const limit = clampLimit(url.searchParams.get('limit'), 120);
      const items = statements.listScans.all(limit).map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        source: row.source,
        profileName: row.profile_name,
        rawText: row.raw_text,
        payload: safeJson(row.payload_json, {}),
      }));
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/scans') {
      const record = await readJson(req);
      statements.upsertScan.run({
        id: record.id || randomUUID(),
        created_at: record.createdAt || new Date().toISOString(),
        source: record.source || 'manual',
        profile_name: record.profile?.name || null,
        raw_text: record.rawText || '',
        payload_json: JSON.stringify(record),
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/restaurants') {
      const limit = clampLimit(url.searchParams.get('limit'), 300);
      sendJson(res, 200, { items: statements.listRestaurants.all(limit).map(rowToRestaurant) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/restaurants/search') {
      const rawQuery = normalizeText(url.searchParams.get('q') || '');
      const rawCity = normalizeText(url.searchParams.get('city') || '');
      const limit = clampLimit(url.searchParams.get('limit'), 80);
      const items = statements.searchRestaurants.all({
        query: rawQuery,
        queryLike: `%${rawQuery}%`,
        city: rawCity,
        cityLike: `%${rawCity}%`,
        limit,
      }).map(rowToRestaurant);
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/restaurants') {
      const body = await readJson(req);
      const restaurant = normalizeRestaurant(body);
      statements.upsertRestaurant.run(restaurantToRow(restaurant));
      sendJson(res, 200, { ok: true, item: restaurant });
      return;
    }


    if (req.method === 'GET' && url.pathname === '/api/contributions') {
      const limit = clampLimit(url.searchParams.get('limit'), 300);
      const status = String(url.searchParams.get('status') || '');
      sendJson(res, 200, { items: statements.listContributions.all(status, status, limit).map(rowToContribution) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/contributions') {
      const body = await readJson(req);
      const contribution = normalizeContribution({ ...body, status: body?.status === 'queued' ? 'pending_review' : body?.status });
      statements.upsertContribution.run(contributionToRow(contribution));
      sendJson(res, 200, { ok: true, item: contribution });
      return;
    }

    if (req.method === 'PATCH' && url.pathname.startsWith('/api/contributions/') && url.pathname.endsWith('/status')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = decodeURIComponent(parts[2] || '');
      const before = statements.getContribution.get(id);
      if (!before) {
        sendJson(res, 404, { ok: false, error: 'Contribution inconnue' });
        return;
      }
      const body = await readJson(req);
      const status = normalizeContributionStatus(body?.status || 'pending_review');
      const trustScore = Number.isFinite(Number(body?.trustScore))
        ? Math.max(0, Math.min(100, Math.round(Number(body.trustScore))))
        : null;
      const moderationNotes = trimOrNull(body?.moderationNotes) || before.moderation_notes || null;
      const updatedAt = new Date().toISOString();
      statements.updateContributionStatus.run({
        id,
        status,
        moderation_notes: moderationNotes,
        trust_score: trustScore,
        updated_at: updatedAt,
      });
      const item = statements.getContribution.get(id);
      statements.insertModerationEvent.run({
        id: randomUUID(),
        contribution_id: id,
        created_at: updatedAt,
        action: 'status-update',
        status_before: before.status,
        status_after: status,
        trust_score_before: before.trust_score,
        trust_score_after: item?.trust_score ?? trustScore ?? before.trust_score,
        note: moderationNotes,
      });
      sendJson(res, 200, { ok: true, item: item ? rowToContribution(item) : null });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/public-db') {
      const dishes = statements.listPublicContributions.all(10000).map(rowToContribution);
      sendJson(res, 200, buildPublicExport(dishes));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/public-db/search') {
      const q = normalizeText(url.searchParams.get('q') || '');
      const limit = clampLimit(url.searchParams.get('limit'), 80);
      if (!q) {
        sendJson(res, 200, { items: [] });
        return;
      }
      const query = `%${q}%`;
      const items = statements.searchPublicContributions.all({ query, limit }).map(rowToContribution);
      sendJson(res, 200, { items });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/export') {
      sendJson(res, 200, {
        exportedAt: new Date().toISOString(),
        restaurants: statements.listRestaurants.all(10000).map(rowToRestaurant),
        learnedDishes: statements.listLearned.all(10000).map(rowToLearnedDish),
        scans: statements.listScans.all(10000).map((row) => safeJson(row.payload_json, {})),
        publicDatabase: buildPublicExport(statements.listPublicContributions.all(10000).map(rowToContribution)),
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[Can I Eat It] Backend SQLite prêt sur http://${HOST}:${PORT}`);
  console.log(`[Can I Eat It] Base : ${dbPath}`);
});

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9%€$£\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLearnedDish(value) {
  const name = String(value?.name || value?.normalizedName || 'Plat appris').trim();
  const normalizedName = value?.normalizedName || normalizeText(name);
  return {
    id: value?.id || randomUUID(),
    name,
    normalizedName,
    aliases: Array.isArray(value?.aliases) ? value.aliases : [],
    restaurantName: value?.restaurantName || null,
    ingredientIds: Array.isArray(value?.ingredientIds) ? [...new Set(value.ingredientIds.map(String))] : [],
    confidence: value?.confidence || 'confirmed',
    notes: value?.notes || null,
    source: value?.source || 'backend-sync',
    updatedAt: value?.updatedAt || new Date().toISOString(),
    useCount: Number.isFinite(value?.useCount) ? Number(value.useCount) : 0,
  };
}

function itemToLearnedRow(item) {
  return {
    id: item.id,
    name: item.name,
    normalized_name: item.normalizedName,
    aliases_json: JSON.stringify(item.aliases || []),
    restaurant_name: item.restaurantName || null,
    ingredient_ids_json: JSON.stringify(item.ingredientIds || []),
    confidence: item.confidence || 'confirmed',
    notes: item.notes || null,
    source: item.source || 'backend-sync',
    updated_at: item.updatedAt || new Date().toISOString(),
    use_count: item.useCount || 0,
  };
}

function rowToLearnedDish(row) {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    aliases: safeJson(row.aliases_json, []),
    restaurantName: row.restaurant_name || undefined,
    ingredientIds: safeJson(row.ingredient_ids_json, []),
    confidence: row.confidence,
    notes: row.notes || undefined,
    source: row.source,
    updatedAt: row.updated_at,
    useCount: row.use_count,
  };
}

function normalizeRestaurant(value) {
  const name = String(value?.name || 'Restaurant').trim();
  return {
    id: value?.id || randomUUID(),
    name,
    normalizedName: value?.normalizedName || normalizeText([name, value?.city, value?.address].filter(Boolean).join(' | ')),
    address: value?.address || null,
    city: value?.city || null,
    notes: value?.notes || null,
    updatedAt: value?.updatedAt || new Date().toISOString(),
    favorite: Boolean(value?.favorite),
    visitCount: Number.isFinite(Number(value?.visitCount ?? value?.visit_count)) ? Math.max(0, Math.round(Number(value?.visitCount ?? value?.visit_count))) : 0,
    lastUsedAt: trimOrNull(value?.lastUsedAt || value?.last_used_at),
  };
}

function restaurantToRow(item) {
  return {
    id: item.id,
    name: item.name,
    normalized_name: item.normalizedName,
    address: item.address || null,
    city: item.city || null,
    notes: item.notes || null,
    updated_at: item.updatedAt,
    favorite: item.favorite ? 1 : 0,
    visit_count: Number.isFinite(Number(item.visitCount)) ? Math.max(0, Math.round(Number(item.visitCount))) : 0,
    last_used_at: item.lastUsedAt || null,
  };
}

function rowToRestaurant(row) {
  return {
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    address: row.address || undefined,
    city: row.city || undefined,
    notes: row.notes || undefined,
    updatedAt: row.updated_at,
    favorite: Boolean(row.favorite),
    visitCount: Number(row.visit_count || 0),
    lastUsedAt: row.last_used_at || undefined,
  };
}


function normalizeContribution(value) {
  const dishName = String(value?.dishName || value?.dish_name || 'Plat').trim();
  const normalizedDishName = value?.normalizedDishName || value?.normalized_dish_name || normalizeText(dishName);
  const now = new Date().toISOString();
  return {
    id: value?.id || randomUUID(),
    kind: value?.kind || 'dish-correction',
    status: normalizeContributionStatus(value?.status || 'pending_review'),
    createdAt: value?.createdAt || value?.created_at || now,
    updatedAt: value?.updatedAt || value?.updated_at || now,
    dishName,
    normalizedDishName,
    aliases: toStringArray(value?.aliases || value?.aliases_json),
    restaurantName: trimOrNull(value?.restaurantName || value?.restaurant_name),
    restaurantCity: trimOrNull(value?.restaurantCity || value?.restaurant_city),
    restaurantAddress: trimOrNull(value?.restaurantAddress || value?.restaurant_address),
    ingredientIds: toStringArray(value?.ingredientIds || value?.ingredient_ids_json),
    allergenTags: toStringArray(value?.allergenTags || value?.allergen_tags_json),
    dietaryTags: toStringArray(value?.dietaryTags || value?.dietary_tags_json),
    sourceType: value?.sourceType || value?.source_type || 'user-correction',
    sourceLabel: trimOrNull(value?.sourceLabel || value?.source_label),
    evidenceUrl: trimOrNull(value?.evidenceUrl || value?.evidence_url),
    notes: trimOrNull(value?.notes),
    trustScore: Math.max(0, Math.min(100, Math.round(Number(value?.trustScore ?? value?.trust_score ?? 45)))),
    appVersion: value?.appVersion || value?.app_version || '1.2.0',
    contributorAlias: trimOrNull(value?.contributorAlias || value?.contributor_alias),
    moderationNotes: trimOrNull(value?.moderationNotes || value?.moderation_notes),
  };
}

function contributionToRow(item) {
  return {
    id: item.id,
    kind: item.kind,
    status: item.status === 'queued' ? 'pending_review' : item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt || new Date().toISOString(),
    dish_name: item.dishName,
    normalized_dish_name: item.normalizedDishName,
    aliases_json: JSON.stringify(item.aliases || []),
    restaurant_name: item.restaurantName || null,
    restaurant_city: item.restaurantCity || null,
    restaurant_address: item.restaurantAddress || null,
    ingredient_ids_json: JSON.stringify(item.ingredientIds || []),
    allergen_tags_json: JSON.stringify(item.allergenTags || []),
    dietary_tags_json: JSON.stringify(item.dietaryTags || []),
    source_type: item.sourceType || 'user-correction',
    source_label: item.sourceLabel || null,
    evidence_url: item.evidenceUrl || null,
    notes: item.notes || null,
    trust_score: item.trustScore || 45,
    app_version: item.appVersion || '1.2.0',
    contributor_alias: item.contributorAlias || null,
    moderation_notes: item.moderationNotes || null,
    payload_json: JSON.stringify(item),
  };
}

function rowToContribution(row) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dishName: row.dish_name,
    normalizedDishName: row.normalized_dish_name,
    aliases: safeJson(row.aliases_json, []),
    restaurantName: row.restaurant_name || undefined,
    restaurantCity: row.restaurant_city || undefined,
    restaurantAddress: row.restaurant_address || undefined,
    ingredientIds: safeJson(row.ingredient_ids_json, []),
    allergenTags: safeJson(row.allergen_tags_json, []),
    dietaryTags: safeJson(row.dietary_tags_json, []),
    sourceType: row.source_type,
    sourceLabel: row.source_label || undefined,
    evidenceUrl: row.evidence_url || undefined,
    notes: row.notes || undefined,
    trustScore: row.trust_score,
    appVersion: row.app_version,
    contributorAlias: row.contributor_alias || undefined,
    moderationNotes: row.moderation_notes || undefined,
  };
}

function normalizeContributionStatus(status) {
  const allowed = new Set(['queued', 'pending_review', 'community_verified', 'trusted', 'rejected', 'deprecated']);
  return allowed.has(status) ? status : 'pending_review';
}

function buildPublicExport(dishes) {
  const publicDishes = dishes
    .filter((item) => !['rejected', 'deprecated'].includes(item.status))
    .sort((a, b) => (b.trustScore || 0) - (a.trustScore || 0) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const restaurants = buildPublicRestaurants(publicDishes);
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    generatedBy: 'Can I Eat It backend 1.2.0',
    stats: {
      contributions: publicDishes.length,
      restaurants: restaurants.length,
      trusted: publicDishes.filter((item) => item.status === 'trusted').length,
      verified: publicDishes.filter((item) => item.status === 'community_verified').length,
      pending: publicDishes.filter((item) => item.status === 'pending_review' || item.status === 'queued').length,
    },
    restaurants,
    dishes: publicDishes,
  };
}

function buildPublicRestaurants(dishes) {
  const byKey = new Map();
  for (const dish of dishes) {
    if (!dish.restaurantName) continue;
    const key = normalizeText([dish.restaurantName, dish.restaurantCity, dish.restaurantAddress].filter(Boolean).join(' '));
    const current = byKey.get(key);
    const updatedAt = current && new Date(current.updatedAt).getTime() > new Date(dish.updatedAt).getTime() ? current.updatedAt : dish.updatedAt;
    byKey.set(key, {
      name: dish.restaurantName,
      normalizedName: key,
      city: dish.restaurantCity,
      address: dish.restaurantAddress,
      dishCount: (current?.dishCount || 0) + 1,
      updatedAt,
    });
  }
  return Array.from(byKey.values()).sort((a, b) => b.dishCount - a.dishCount || a.name.localeCompare(b.name, 'fr'));
}


function ensureColumn(table, column, definition) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!rows.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function toStringArray(value) {
  if (Array.isArray(value)) return [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))];
  if (typeof value === 'string' && value.startsWith('[')) return toStringArray(safeJson(value, []));
  return [];
}

function trimOrNull(value) {
  const clean = String(value || '').trim();
  return clean || null;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Payload trop volumineux'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function clampLimit(value, fallback) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10000, Math.floor(parsed)));
}
