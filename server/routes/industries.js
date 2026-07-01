const express = require('express');
const { getDb } = require('../services/db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function listIndustries(db) {
  return db
    .prepare('SELECT name FROM industries ORDER BY name COLLATE NOCASE')
    .all()
    .map((r) => r.name);
}

// GET /api/industries — the shared master list (available to every logged-in user).
router.get('/', (req, res) => {
  const db = getDb();
  res.json(listIndustries(db));
});

// POST /api/industries — admin adds a new industry; it applies globally to all
// clients and everywhere the dropdown is used. Idempotent on name.
router.post('/', authenticate, requireAdmin, (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Industry name is required' });

  const db = getDb();
  db.prepare('INSERT OR IGNORE INTO industries (name) VALUES (?)').run(name);
  res.status(201).json(listIndustries(db));
});

// DELETE /api/industries/:name — admin removes an industry. Any merchant still
// using it has its industry cleared (left blank), per product decision.
router.delete('/:name', authenticate, requireAdmin, (req, res) => {
  const name = req.params.name;
  const db = getDb();

  const clear = db.transaction((ind) => {
    const affected = db
      .prepare("UPDATE merchants SET industry = '', updated_at = datetime('now') WHERE industry = ?")
      .run(ind).changes;
    db.prepare('DELETE FROM industries WHERE name = ?').run(ind);
    return affected;
  });

  const affected = clear(name);
  res.json({ industries: listIndustries(db), cleared: affected });
});

module.exports = router;
