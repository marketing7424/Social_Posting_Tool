const express = require('express');
const { getDb } = require('../services/db');
const { timezoneFromAddress } = require('../services/zip-timezone');

const router = express.Router();

function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) \u2013 ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) \u2013 ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

function rowToMerchant(row) {
  return {
    mid: row.mid,
    dbaName: row.dba_name,
    address: row.address || '',
    phone: row.phone || '',
    phone2: row.phone2 || '',
    website: row.website || '',
    fbPageId: row.fb_page_id || '',
    fbToken: row.fb_token || '',
    fbPageName: row.fb_page_name || '',
    igUserId: row.ig_user_id || '',
    igToken: row.ig_token || '',
    igUsername: row.ig_username || '',
    googleToken: row.google_token || '',
    googleLocationId: row.google_location_id || '',
    googleLocationName: row.google_location_name || '',
    timezone: row.timezone || '',
    hashtags: row.hashtags || '',
    fbTokenCreatedAt: row.fb_token_created_at || '',
    googleTokenCreatedAt: row.google_token_created_at || '',
    created: row.created_at || '',
    updated: row.updated_at || '',
  };
}

// GET /api/merchants?search=term
router.get('/', (req, res) => {
  const db = getDb();
  const search = req.query.search;

  let merchants;
  if (search) {
    merchants = db.prepare(
      "SELECT * FROM merchants WHERE mid LIKE ? OR dba_name LIKE ? ORDER BY dba_name"
    ).all(`%${search}%`, `%${search}%`);
  } else {
    merchants = db.prepare("SELECT * FROM merchants ORDER BY dba_name").all();
  }

  res.json(merchants.map(rowToMerchant));
});

// GET /api/merchants/:mid
router.get('/:mid', (req, res) => {
  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(req.params.mid);
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
  res.json(rowToMerchant(merchant));
});

// POST /api/merchants
router.post('/', (req, res) => {
  const { mid, dbaName, address, phone, phone2, website, hashtags } = req.body;
  if (!mid || !dbaName) {
    return res.status(400).json({ error: 'MID and DBA Name are required' });
  }

  const db = getDb();
  const existing = db.prepare('SELECT mid FROM merchants WHERE mid = ?').get(mid);
  if (existing) {
    return res.status(409).json({ error: 'Merchant with this MID already exists' });
  }

  const formattedPhone = formatPhone(phone);
  const formattedPhone2 = formatPhone(phone2);
  const detectedTz = timezoneFromAddress(address) || '';
  db.prepare(
    'INSERT INTO merchants (mid, dba_name, address, phone, phone2, website, timezone, hashtags) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(mid, dbaName, address || '', formattedPhone, formattedPhone2, website || '', detectedTz, hashtags || '');

  const merchant = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(mid);
  res.status(201).json(rowToMerchant(merchant));
});

// PATCH /api/merchants/:mid
router.patch('/:mid', (req, res) => {
  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(req.params.mid);
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

  const updates = req.body;
  const fields = [];
  const values = [];

  const fieldMap = {
    dbaName: 'dba_name', address: 'address', phone: 'phone', phone2: 'phone2', website: 'website',
    timezone: 'timezone', hashtags: 'hashtags',
    fbPageId: 'fb_page_id', fbToken: 'fb_token', fbPageName: 'fb_page_name',
    igUserId: 'ig_user_id', igToken: 'ig_token', igUsername: 'ig_username',
    googleToken: 'google_token', googleLocationId: 'google_location_id', googleLocationName: 'google_location_name',
  };

  // Auto-detect timezone when address changes (unless timezone is explicitly provided)
  if (updates.address && updates.timezone === undefined) {
    const detectedTz = timezoneFromAddress(updates.address);
    if (detectedTz) {
      updates.timezone = detectedTz;
    }
  }

  for (const [key, col] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      const val = (key === 'phone' || key === 'phone2') ? formatPhone(updates[key]) : updates[key];
      fields.push(`${col} = ?`);
      values.push(val);
    }
  }

  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(req.params.mid);
    try {
      db.prepare(`UPDATE merchants SET ${fields.join(', ')} WHERE mid = ?`).run(...values);
    } catch (err) {
      console.error('[merchants] PATCH update error:', err.message);
      return res.status(500).json({ error: 'Database update failed: ' + err.message });
    }
  }

  const updated = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(req.params.mid);
  res.json(rowToMerchant(updated));
});

// DELETE /api/merchants/:mid
router.delete('/:mid', (req, res) => {
  const db = getDb();
  const merchant = db.prepare('SELECT mid FROM merchants WHERE mid = ?').get(req.params.mid);
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });

  db.prepare('DELETE FROM merchants WHERE mid = ?').run(req.params.mid);
  res.json({ success: true });
});

module.exports = router;
