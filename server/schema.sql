CREATE TABLE IF NOT EXISTS restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  address TEXT,
  city TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS learned_dishes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  restaurant_name TEXT,
  ingredient_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL DEFAULT 'confirmed',
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual-correction',
  updated_at TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_learned_dishes_normalized_name ON learned_dishes(normalized_name);
CREATE INDEX IF NOT EXISTS idx_learned_dishes_restaurant ON learned_dishes(restaurant_name);

CREATE TABLE IF NOT EXISTS scans (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  profile_name TEXT,
  raw_text TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scans_source ON scans(source);

CREATE TABLE IF NOT EXISTS dish_sources (
  id TEXT PRIMARY KEY,
  dish_normalized_name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dish_sources_name ON dish_sources(dish_normalized_name);

CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  learned_dish_id TEXT,
  created_at TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (learned_dish_id) REFERENCES learned_dishes(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public_contributions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'dish-correction',
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  dish_name TEXT NOT NULL,
  normalized_dish_name TEXT NOT NULL,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  restaurant_name TEXT,
  restaurant_city TEXT,
  restaurant_address TEXT,
  ingredient_ids_json TEXT NOT NULL DEFAULT '[]',
  allergen_tags_json TEXT NOT NULL DEFAULT '[]',
  dietary_tags_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL DEFAULT 'user-correction',
  source_label TEXT,
  evidence_url TEXT,
  notes TEXT,
  trust_score INTEGER NOT NULL DEFAULT 45,
  app_version TEXT NOT NULL DEFAULT '1.0.0',
  contributor_alias TEXT,
  moderation_notes TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_public_contributions_status ON public_contributions(status);
CREATE INDEX IF NOT EXISTS idx_public_contributions_dish ON public_contributions(normalized_dish_name);
CREATE INDEX IF NOT EXISTS idx_public_contributions_restaurant ON public_contributions(restaurant_name, restaurant_city);
CREATE INDEX IF NOT EXISTS idx_restaurants_lookup ON restaurants(normalized_name, city, updated_at DESC);

CREATE TABLE IF NOT EXISTS contribution_moderation_events (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  action TEXT NOT NULL,
  status_before TEXT,
  status_after TEXT,
  trust_score_before INTEGER,
  trust_score_after INTEGER,
  note TEXT,
  FOREIGN KEY (contribution_id) REFERENCES public_contributions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contribution_moderation_events_contribution ON contribution_moderation_events(contribution_id, created_at DESC);
