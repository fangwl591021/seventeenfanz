CREATE TABLE IF NOT EXISTS market_sellers (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  picture_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS market_listings (
  id TEXT PRIMARY KEY,
  seller_line_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  member_tag TEXT,
  item_condition TEXT NOT NULL CHECK (item_condition IN ('sealed','excellent','good','used')),
  price_twd INTEGER NOT NULL CHECK (price_twd BETWEEN 1 AND 999999),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
  image_keys TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','reserved','sold','hidden')),
  moderation_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_line_user_id) REFERENCES market_sellers(line_user_id)
);

CREATE INDEX IF NOT EXISTS market_listings_status_date_idx ON market_listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS market_listings_seller_date_idx ON market_listings(seller_line_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS market_uploads (
  object_key TEXT PRIMARY KEY,
  line_user_id TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS market_uploads_user_date_idx ON market_uploads(line_user_id, created_at DESC);
