PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'global',
  language TEXT NOT NULL DEFAULT 'auto',
  trust_tier INTEGER NOT NULL DEFAULT 2,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS news_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_item_id TEXT,
  canonical_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  title_original TEXT NOT NULL,
  title_zh_tw TEXT NOT NULL,
  summary_zh_tw TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'news',
  member_tags TEXT NOT NULL DEFAULT '[]',
  image_url TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  cluster_id TEXT,
  FOREIGN KEY (source_id) REFERENCES sources(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS news_items_url_uq ON news_items(canonical_url);
CREATE UNIQUE INDEX IF NOT EXISTS news_items_hash_uq ON news_items(content_hash);
CREATE INDEX IF NOT EXISTS news_items_status_date_idx ON news_items(status, published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_category_idx ON news_items(category, published_at DESC);

CREATE TABLE IF NOT EXISTS news_clusters (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  title_zh_tw TEXT NOT NULL,
  summary_zh_tw TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'news',
  primary_item_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS subscribers (
  line_user_id TEXT PRIMARY KEY,
  display_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscriber_preferences (
  line_user_id TEXT PRIMARY KEY,
  member_tags TEXT NOT NULL DEFAULT '[]',
  categories TEXT NOT NULL DEFAULT '["official","video","release","concert"]',
  quiet_hours TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (line_user_id) REFERENCES subscribers(line_user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO sources (id,name,url,kind,region,language,trust_tier) VALUES
('pledis-notice','PLEDIS 官方公告','https://www.pledis.co.kr/artist/detail/seventeen/notice/','html','KR','ko',1),
('weverse-notice','Weverse 官方公告','https://weverse.io/seventeen/notice/','html','global','multi',1),
('weverse-media','Weverse 官方影音','https://weverse.io/seventeen/media','html','global','multi',1),
('svt-japan','SEVENTEEN 日本官網','https://www.seventeen-17.jp/posts/information','html','JP','ja',1),
('youtube-official','SEVENTEEN 官方 YouTube','https://www.youtube.com/channel/UCfkXDY7vwkcJ8ddFGz8KusA','youtube','global','multi',1);
