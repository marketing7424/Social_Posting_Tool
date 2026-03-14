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
    ];
    for (const sql of migrations) {
      try { db.exec(sql); } catch (_) { /* column already exists */ }
    }
  }
  return db;
}

module.exports = { getDb };
