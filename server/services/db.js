const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = process.env.NODE_ENV === 'production' ? '/data' : path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'social-posting.db');

let db;

function getDb() {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Wait (instead of throwing "database is locked") when a write briefly
    // collides with another — e.g. the scheduler's concurrent publishers vs. a
    // /status or /retry request hitting the same rows.
    db.pragma('busy_timeout = 5000');

    const schema = fs.readFileSync(
      path.join(__dirname, '..', 'database', 'schema.sql'),
      'utf-8'
    );
    db.exec(schema);

    // Add name columns if missing (safe migrations)
    const migrations = [
      "ALTER TABLE merchants ADD COLUMN fb_page_name TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN ig_username TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN google_location_name TEXT DEFAULT ''",
      "ALTER TABLE posts ADD COLUMN fb_layout_variant INTEGER DEFAULT 0",
      "ALTER TABLE merchants ADD COLUMN website TEXT DEFAULT ''",
      "ALTER TABLE posts ADD COLUMN previous_status TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN published_at TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN timezone TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN fb_token_created_at TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN google_token_created_at TEXT DEFAULT ''",
      "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'",
      // Google Business post type fields
      "ALTER TABLE post_platforms ADD COLUMN google_post_type TEXT DEFAULT 'STANDARD'",
      "ALTER TABLE post_platforms ADD COLUMN google_title TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_start_date TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_start_time TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_end_date TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_end_time TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_coupon_code TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_redeem_url TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_terms TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_cta_type TEXT DEFAULT ''",
      "ALTER TABLE post_platforms ADD COLUMN google_cta_url TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN hashtags TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN phone2 TEXT DEFAULT ''",
      // Repost linking: original_post_id on the new post, reposted_as on the original
      "ALTER TABLE posts ADD COLUMN original_post_id TEXT DEFAULT ''",
      "ALTER TABLE posts ADD COLUMN reposted_as TEXT DEFAULT ''",
      // Per-platform connection liveness (populated by POST /api/oauth/test-all)
      "ALTER TABLE merchants ADD COLUMN fb_last_check_at TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN fb_last_check_ok INTEGER DEFAULT 0",
      "ALTER TABLE merchants ADD COLUMN fb_last_check_error TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN ig_last_check_at TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN ig_last_check_ok INTEGER DEFAULT 0",
      "ALTER TABLE merchants ADD COLUMN ig_last_check_error TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN google_last_check_at TEXT DEFAULT ''",
      "ALTER TABLE merchants ADD COLUMN google_last_check_ok INTEGER DEFAULT 0",
      "ALTER TABLE merchants ADD COLUMN google_last_check_error TEXT DEFAULT ''",
      // Business category for targeted mass-publishing
      "ALTER TABLE merchants ADD COLUMN industry TEXT DEFAULT ''",
    ];
    for (const sql of migrations) {
      try { db.exec(sql); } catch (_) { /* column already exists */ }
    }

    // One-time backfill for the industry column: classify existing merchants by
    // their DBA name (names containing "hair" → Hair Salon, everything else →
    // Nail Salon). Idempotent — only touches rows that don't have an industry yet.
    try {
      db.prepare(
        "UPDATE merchants SET industry = CASE WHEN LOWER(dba_name) LIKE '%hair%' " +
        "THEN 'Hair Salon' ELSE 'Nail Salon' END WHERE industry IS NULL OR industry = ''"
      ).run();
    } catch (_) {}

    // Ensure admin emails have admin role
    const adminEmails = [
      'marketing@richpaymentsolutions.com',
      'hoang.tran@richpaymentsolutions.com',
    ];
    for (const email of adminEmails) {
      try {
        db.prepare("UPDATE users SET role = 'admin' WHERE email = ? AND (role IS NULL OR role != 'admin')").run(email);
      } catch (_) {}
    }
  }
  return db;
}

module.exports = { getDb };
