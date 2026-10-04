CREATE TABLE IF NOT EXISTS rich_menu_releases (
  id TEXT PRIMARY KEY,
  news_menu_id TEXT NOT NULL,
  support_menu_id TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS rich_menu_releases_date_idx ON rich_menu_releases(published_at DESC);
