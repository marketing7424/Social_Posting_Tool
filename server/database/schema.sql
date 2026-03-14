CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  merchant_mid TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  scheduled_time TEXT,
  fb_layout TEXT DEFAULT 'grid',
  created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS post_platforms (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  caption TEXT DEFAULT '',
  platform_post_id TEXT,
  status TEXT DEFAULT 'pending',
  error TEXT,
  UNIQUE(post_id, platform)
);

CREATE TABLE IF NOT EXISTS post_media (
  id TEXT PRIMARY KEY,
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT,
  mimetype TEXT,
  size INTEGER,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS merchants (
  mid TEXT PRIMARY KEY,
  dba_name TEXT NOT NULL,
  address TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  website TEXT DEFAULT '',
  fb_page_id TEXT DEFAULT '',
  fb_token TEXT DEFAULT '',
  ig_user_id TEXT DEFAULT '',
  ig_token TEXT DEFAULT '',
  google_token TEXT DEFAULT '',
  google_location_id TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_media_order (
  post_id TEXT REFERENCES posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  media_id TEXT REFERENCES post_media(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  PRIMARY KEY(post_id, platform, media_id)
);
