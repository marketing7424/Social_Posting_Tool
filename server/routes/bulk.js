const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { getDb } = require('../services/db');

const router = express.Router();

const upload = multer({
  dest: path.join(__dirname, '..', '..', '.tmp'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

function parseCSV(content) {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || '').trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// Map flexible header names to internal field names
const HEADER_ALIASES = {
  merchant_mid: ['merchant_mid', 'merchant', 'mid', 'merchant_id', 'client', 'client_id'],
  platforms: ['platforms', 'platform'],
  facebook_caption: ['facebook_caption', 'fb_caption', 'facebook'],
  instagram_caption: ['instagram_caption', 'ig_caption', 'instagram'],
  google_caption: ['google_caption', 'gbp_caption', 'google', 'google_business'],
  caption: ['caption', 'text', 'content', 'message'],
  scheduled_time: ['scheduled_time', 'schedule', 'publish_time', 'publish_at', 'date', 'datetime'],
  fb_layout: ['fb_layout', 'layout'],
};

function resolveHeader(headers, aliases) {
  for (const alias of aliases) {
    if (headers.includes(alias)) return alias;
  }
  return null;
}

// POST /api/bulk/upload - Upload and preview CSV
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const content = fs.readFileSync(req.file.path, 'utf-8');
    fs.unlinkSync(req.file.path); // clean up temp file

    const { headers, rows } = parseCSV(content);

    // Resolve headers
    const fieldMap = {};
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      fieldMap[field] = resolveHeader(headers, aliases);
    }

    if (!fieldMap.merchant_mid) {
      return res.status(400).json({
        error: 'CSV must have a merchant column (merchant_mid, merchant, mid, or client)',
        headers,
      });
    }

    // Validate and transform rows
    const db = getDb();
    const preview = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header

      const mid = row[fieldMap.merchant_mid];
      if (!mid) {
        errors.push({ row: rowNum, error: 'Missing merchant ID' });
        continue;
      }

      // Check merchant exists
      const merchant = db.prepare('SELECT mid, dba_name FROM merchants WHERE mid = ?').get(mid);
      if (!merchant) {
        errors.push({ row: rowNum, error: `Merchant "${mid}" not found` });
        continue;
      }

      // Parse platforms
      let platforms = ['facebook', 'instagram', 'google'];
      if (fieldMap.platforms && row[fieldMap.platforms]) {
        platforms = row[fieldMap.platforms].split(/[;|,]/).map(p => p.trim().toLowerCase()).filter(Boolean);
      }

      // Parse captions
      const captions = {};
      for (const p of platforms) {
        const platformField = `${p}_caption`;
        if (fieldMap[platformField] && row[fieldMap[platformField]]) {
          captions[p] = row[fieldMap[platformField]];
        } else if (fieldMap.caption && row[fieldMap.caption]) {
          captions[p] = row[fieldMap.caption];
        } else {
          captions[p] = '';
        }
      }

      // Parse schedule time
      let scheduledTime = null;
      if (fieldMap.scheduled_time && row[fieldMap.scheduled_time]) {
        const parsed = new Date(row[fieldMap.scheduled_time]);
        if (isNaN(parsed.getTime())) {
          errors.push({ row: rowNum, error: `Invalid date: "${row[fieldMap.scheduled_time]}"` });
          continue;
        }
        scheduledTime = parsed.toISOString();
      }

      const fbLayout = (fieldMap.fb_layout && row[fieldMap.fb_layout]) || 'collage';

      preview.push({
        rowNum,
        merchantMid: mid,
        merchantName: merchant.dba_name,
        platforms,
        captions,
        scheduledTime,
        fbLayout,
      });
    }

    res.json({ preview, errors, totalRows: rows.length });
  } catch (err) {
    // Clean up temp file on error
    if (req.file?.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(400).json({ error: err.message });
  }
});

// POST /api/bulk/schedule - Create posts from validated preview data
router.post('/schedule', (req, res) => {
  const { posts: postData } = req.body;
  if (!postData || !Array.isArray(postData) || postData.length === 0) {
    return res.status(400).json({ error: 'No posts to schedule' });
  }

  const db = getDb();
  const results = [];

  const insertPost = db.prepare(
    'INSERT INTO posts (id, merchant_mid, status, scheduled_time, fb_layout, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertPlatform = db.prepare(
    'INSERT INTO post_platforms (id, post_id, platform, caption) VALUES (?, ?, ?, ?)'
  );

  const transaction = db.transaction(() => {
    for (const item of postData) {
      const postId = uuid();
      const status = item.scheduledTime ? 'scheduled' : 'draft';

      insertPost.run(
        postId, item.merchantMid, status,
        item.scheduledTime || null, item.fbLayout || 'collage',
        req.user?.id || null
      );

      for (const platform of item.platforms) {
        insertPlatform.run(
          uuid(), postId, platform, item.captions?.[platform] || ''
        );
      }

      results.push({ id: postId, merchantMid: item.merchantMid, status });
    }
  });

  try {
    transaction();
    res.status(201).json({
      created: results.length,
      posts: results,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create posts: ' + err.message });
  }
});

// GET /api/bulk/template - Download CSV template
router.get('/template', (_req, res) => {
  const csv = [
    'merchant_mid,platforms,facebook_caption,instagram_caption,google_caption,scheduled_time,fb_layout',
    'MID001,"facebook,instagram,google","Check out our latest!","New post alert!","Visit us today!",2026-03-15T10:00:00,collage',
    'MID002,facebook,"Happy Monday from our team!",,,"2026-03-16T09:00:00",collage',
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=bulk-schedule-template.csv');
  res.send(csv);
});

module.exports = router;
