const express = require('express');
const {
  getMetaAuthorizeUrl,
  getMetaBulkAuthorizeUrl,
  handleMetaCallback,
  handleMetaBulkCallback,
  selectMetaPage,
  listMetaPages,
  testFacebookConnection,
  testInstagramConnection,
  getGoogleAuthorizeUrl,
  getGoogleBulkAuthorizeUrl,
  handleGoogleCallback,
  handleGoogleBulkCallback,
  selectGoogleLocation,
  testGoogleConnection,
  BULK_OAUTH_STATE,
  META_BULK_STATE,
} = require('../services/oauth');
const { getDb } = require('../services/db');

const router = express.Router();

// Temporary in-memory store for OAuth page data (cleared after selection)
const pendingOAuth = new Map();

function getFrontendUrl() {
  return process.env.FRONTEND_URL || process.env.BASE_URL || 'http://localhost:5173';
}

// GET /api/oauth/meta/authorize/:mid
router.get('/meta/authorize/:mid', (req, res) => {
  try {
    const url = getMetaAuthorizeUrl(req.params.mid);
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start Meta OAuth: ' + err.message });
  }
});

// GET /api/oauth/meta/bulk-authorize - start a bulk reconnect (one login, many merchants)
router.get('/meta/bulk-authorize', (req, res) => {
  try {
    res.redirect(getMetaBulkAuthorizeUrl());
  } catch (err) {
    res.status(500).json({ error: 'Failed to start Meta OAuth: ' + err.message });
  }
});

// GET /api/oauth/meta/callback
router.get('/meta/callback', async (req, res) => {
  const frontendUrl = getFrontendUrl();
  const { code, state, error } = req.query;
  const isBulk = state === META_BULK_STATE;

  if (error) {
    return isBulk
      ? res.redirect(`${frontendUrl}/bulk-reconnect-facebook?oauth_error=${encodeURIComponent(error)}`)
      : res.redirect(`${frontendUrl}/settings/${state || ''}?oauth_error=${encodeURIComponent(error)}`);
  }

  try {
    if (isBulk) {
      const result = await handleMetaBulkCallback(code);
      pendingOAuth.set(META_BULK_STATE, result);
      setTimeout(() => pendingOAuth.delete(META_BULK_STATE), 10 * 60 * 1000);
      return res.redirect(`${frontendUrl}/bulk-reconnect-facebook?ready=1`);
    }

    const mid = state;
    const result = await handleMetaCallback(code, mid);

    // Store pages data temporarily for the page picker
    pendingOAuth.set(mid, result);
    // Auto-expire after 10 minutes
    setTimeout(() => pendingOAuth.delete(mid), 10 * 60 * 1000);

    res.redirect(`${frontendUrl}/settings/${mid}?pick_page=true`);
  } catch (err) {
    console.error('[oauth] Meta callback error:', err.response?.data || err.message);
    return isBulk
      ? res.redirect(`${frontendUrl}/bulk-reconnect-facebook?oauth_error=${encodeURIComponent(err.message)}`)
      : res.redirect(`${frontendUrl}/settings/${state || ''}?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/oauth/meta/pages/:mid - Get pending pages for selection
router.get('/meta/pages/:mid', (req, res) => {
  const data = pendingOAuth.get(req.params.mid);
  if (!data) {
    return res.status(404).json({ error: 'No pending OAuth data. Please reconnect Facebook.' });
  }
  res.json({ pages: data.pages });
});

// POST /api/oauth/meta/select-page/:mid - User selects a page
router.post('/meta/select-page/:mid', async (req, res) => {
  const { mid } = req.params;
  const { pageId } = req.body;
  const data = pendingOAuth.get(mid);
  if (!data) {
    return res.status(404).json({ error: 'No pending OAuth data. Please reconnect Facebook.' });
  }

  const page = data.pages.find(p => p.id === pageId);
  if (!page) {
    return res.status(400).json({ error: 'Invalid page selection' });
  }

  try {
    const result = await selectMetaPage(mid, page.id, page.accessToken, page.name, data.userToken);
    pendingOAuth.delete(mid);

    const platforms = [];
    if (result.fbPageId) platforms.push('facebook');
    if (result.igUserId) platforms.push('instagram');
    res.json({ success: true, platforms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/oauth/meta/connect-instagram/:mid - Manual Instagram connection
router.post('/meta/connect-instagram/:mid', async (req, res) => {
  const { mid } = req.params;
  const { igUserId } = req.body;

  if (!igUserId) {
    return res.status(400).json({ error: 'Instagram Business Account ID is required' });
  }

  const db = getDb();
  const merchant = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(mid);
  if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
  const token = merchant.fb_token;

  try {
    const axios = require('axios');
    const META_API = 'https://graph.facebook.com/v21.0';

    let username = '';

    // Try to verify and get username (may fail if token lacks IG permissions)
    try {
      const igResp = await axios.get(`${META_API}/${igUserId}`, {
        params: { fields: 'id,username', access_token: token },
      });
      username = igResp.data.username || '';
    } catch (verifyErr) {
      console.log('[oauth] Could not verify IG account via API (likely missing permissions), saving anyway');
    }

    // Save to database regardless — we trust the ID from Business Portfolio
    db.prepare('UPDATE merchants SET ig_user_id = ?, ig_token = ?, ig_username = ?, updated_at = datetime(\'now\') WHERE mid = ?')
      .run(igUserId, token || '', username, mid);

    res.json({ success: true, username: username || igUserId, igUserId });
  } catch (err) {
    console.error('[oauth] Manual IG connect error:', err.response?.data || err.message);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/oauth/google/authorize/:mid
router.get('/google/authorize/:mid', (req, res) => {
  try {
    const url = getGoogleAuthorizeUrl(req.params.mid);
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start Google OAuth: ' + err.message });
  }
});

// GET /api/oauth/google/bulk-authorize - start a bulk reconnect (one login, many merchants)
router.get('/google/bulk-authorize', (req, res) => {
  try {
    const url = getGoogleBulkAuthorizeUrl();
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: 'Failed to start Google OAuth: ' + err.message });
  }
});

// GET /api/oauth/google/callback
router.get('/google/callback', async (req, res) => {
  const frontendUrl = getFrontendUrl();
  const { code, state, error } = req.query;
  const isBulk = state === BULK_OAUTH_STATE;

  if (error) {
    return isBulk
      ? res.redirect(`${frontendUrl}/bulk-reconnect?oauth_error=${encodeURIComponent(error)}`)
      : res.redirect(`${frontendUrl}/settings/${state || ''}?oauth_error=${encodeURIComponent(error)}`);
  }

  try {
    if (isBulk) {
      const result = await handleGoogleBulkCallback(code);
      pendingOAuth.set(BULK_OAUTH_STATE, result);
      setTimeout(() => pendingOAuth.delete(BULK_OAUTH_STATE), 10 * 60 * 1000);
      return res.redirect(`${frontendUrl}/bulk-reconnect?ready=1`);
    }

    const mid = state;
    const result = await handleGoogleCallback(code, mid);

    if (result.autoSelected) {
      // Only one location — already saved
      res.redirect(`${frontendUrl}/settings/${mid}?oauth_success=google`);
    } else {
      // Multiple locations — store for picker
      pendingOAuth.set(`google_${mid}`, result);
      setTimeout(() => pendingOAuth.delete(`google_${mid}`), 10 * 60 * 1000);
      res.redirect(`${frontendUrl}/settings/${mid}?pick_google_location=true`);
    }
  } catch (err) {
    console.error('[oauth] Google callback error:', err.message);
    return isBulk
      ? res.redirect(`${frontendUrl}/bulk-reconnect?oauth_error=${encodeURIComponent(err.message)}`)
      : res.redirect(`${frontendUrl}/settings/${state || ''}?oauth_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /api/oauth/google/locations/:mid - Get pending locations for selection
router.get('/google/locations/:mid', (req, res) => {
  const data = pendingOAuth.get(`google_${req.params.mid}`);
  if (!data) {
    return res.status(404).json({ error: 'No pending Google OAuth data. Please reconnect Google.' });
  }
  res.json({ locations: data.locations });
});

// POST /api/oauth/google/select-location/:mid - User selects a location
router.post('/google/select-location/:mid', (req, res) => {
  const { mid } = req.params;
  const { locationName } = req.body;
  const data = pendingOAuth.get(`google_${mid}`);
  if (!data) {
    return res.status(404).json({ error: 'No pending Google OAuth data. Please reconnect Google.' });
  }

  const location = data.locations.find(l => l.name === locationName);
  if (!location) {
    return res.status(400).json({ error: 'Invalid location selection' });
  }

  try {
    selectGoogleLocation(mid, data.refreshToken, location.name, location.title);
    pendingOAuth.delete(`google_${mid}`);
    res.json({ success: true, locationName: location.name, locationTitle: location.title });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Bulk Google reconnect ---

// Match a merchant's stored location id against the locations the authorizing
// account can manage. Stored ids look like `accounts/X/locations/Y`; the bulk
// list returns the same shape, but fall back to comparing the `locations/Y`
// tail in case of historical formatting differences.
function locationMatches(storedId, fetchedLocations) {
  if (!storedId) return false;
  if (fetchedLocations.some(l => l.name === storedId)) return true;
  const tail = storedId.split('/').slice(-2).join('/'); // "locations/Y"
  return fetchedLocations.some(l => (l.name || '').endsWith(tail));
}

function tokenAgeDays(createdAt) {
  if (!createdAt) return null;
  const t = Date.parse(createdAt);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000));
}

// GET /api/oauth/google/bulk-preview - which merchants this Google login can reconnect
router.get('/google/bulk-preview', (req, res) => {
  const data = pendingOAuth.get(BULK_OAUTH_STATE);
  if (!data) {
    return res.status(404).json({ error: 'Google session expired. Connect a Google account again.' });
  }

  const db = getDb();
  const rows = db.prepare("SELECT * FROM merchants WHERE google_location_id IS NOT NULL AND google_location_id != ''").all();

  const matched = [];
  const unmatched = [];
  for (const row of rows) {
    const entry = {
      mid: row.mid,
      dbaName: row.dba_name,
      googleLocationId: row.google_location_id,
      googleLocationName: row.google_location_name || '',
      tokenAgeDays: tokenAgeDays(row.google_token_created_at),
    };
    if (locationMatches(row.google_location_id, data.locations)) matched.push(entry);
    else unmatched.push(entry);
  }

  res.json({
    locationCount: (data.locations || []).length,
    matched,
    unmatched,
  });
});

// --- Bulk Meta reconnect ---

// GET /api/oauth/meta/bulk-preview - which merchants this Facebook login can reconnect
router.get('/meta/bulk-preview', (req, res) => {
  const data = pendingOAuth.get(META_BULK_STATE);
  if (!data) {
    return res.status(404).json({ error: 'Facebook session expired. Connect a Facebook account again.' });
  }

  const db = getDb();
  const rows = db.prepare("SELECT * FROM merchants WHERE fb_page_id IS NOT NULL AND fb_page_id != ''").all();
  const pageById = new Map(data.pages.map(p => [p.id, p]));

  const matched = [];
  const unmatched = [];
  for (const row of rows) {
    const page = pageById.get(row.fb_page_id);
    const entry = {
      mid: row.mid,
      dbaName: row.dba_name,
      fbPageId: row.fb_page_id,
      fbPageName: row.fb_page_name || (page?.name || ''),
      hasInstagram: !!(page?.hasInstagram),
      tokenAgeDays: tokenAgeDays(row.fb_token_created_at),
    };
    if (page) matched.push(entry); else unmatched.push(entry);
  }

  res.json({
    pageCount: (data.pages || []).length,
    matched,
    unmatched,
  });
});

// POST /api/oauth/meta/bulk-apply - attach the new page token (and IG if linked) to chosen merchants
router.post('/meta/bulk-apply', async (req, res) => {
  const data = pendingOAuth.get(META_BULK_STATE);
  if (!data) {
    return res.status(404).json({ error: 'Facebook session expired. Connect a Facebook account again.' });
  }

  const mids = Array.isArray(req.body?.mids) ? req.body.mids : [];
  if (mids.length === 0) return res.status(400).json({ error: 'No merchants selected' });

  const db = getDb();
  const pageById = new Map(data.pages.map(p => [p.id, p]));
  let updated = 0;
  let igUpdated = 0;
  const skipped = [];

  for (const mid of mids) {
    const row = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(mid);
    if (!row) { skipped.push({ mid, reason: 'not found' }); continue; }
    const page = pageById.get(row.fb_page_id);
    if (!page) { skipped.push({ mid, reason: 'page not under this account' }); continue; }
    try {
      // selectMetaPage already detects Instagram and writes ig_user_id/ig_token/ig_username
      // in the same transaction, so FB + IG reconnect in one shot.
      const result = await selectMetaPage(mid, page.id, page.accessToken, page.name, data.userToken);
      updated++;
      if (result.igUserId) igUpdated++;
    } catch (err) {
      console.error(`[oauth] Meta bulk-apply failed for ${mid}:`, err.response?.data || err.message);
      skipped.push({ mid, reason: err.message });
    }
  }

  // Keep the pending data so the user can run another batch from the same login
  // (it self-expires after 10 minutes).
  res.json({ updated, igUpdated, skipped });
});

// POST /api/oauth/google/bulk-apply - attach the new refresh token to chosen merchants
router.post('/google/bulk-apply', (req, res) => {
  const data = pendingOAuth.get(BULK_OAUTH_STATE);
  if (!data) {
    return res.status(404).json({ error: 'Google session expired. Connect a Google account again.' });
  }

  const mids = Array.isArray(req.body?.mids) ? req.body.mids : [];
  if (mids.length === 0) return res.status(400).json({ error: 'No merchants selected' });

  const db = getDb();
  let updated = 0;
  const skipped = [];
  for (const mid of mids) {
    const row = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(mid);
    if (!row) { skipped.push({ mid, reason: 'not found' }); continue; }
    if (!locationMatches(row.google_location_id, data.locations)) {
      skipped.push({ mid, reason: 'location not under this account' });
      continue;
    }
    selectGoogleLocation(mid, data.refreshToken, row.google_location_id, row.google_location_name || '');
    updated++;
  }

  // Keep the pending data so the user can run another batch from the same login
  // (it self-expires after 10 minutes).
  res.json({ updated, skipped });
});

// POST /api/oauth/test/:mid - Test all platform connections for a merchant
router.post('/test/:mid', async (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(req.params.mid);
  if (!row) return res.status(404).json({ error: 'Merchant not found' });

  const results = {};

  // Test Facebook
  if (row.fb_page_id && row.fb_token) {
    try {
      results.facebook = await testFacebookConnection(row.fb_page_id, row.fb_token);
    } catch (err) {
      results.facebook = { connected: false, error: err.response?.data?.error?.message || err.message };
    }
  } else {
    results.facebook = { connected: false, error: 'Not configured' };
  }

  // Test Instagram
  if (row.ig_user_id && row.ig_token) {
    try {
      results.instagram = await testInstagramConnection(row.ig_user_id, row.ig_token);
    } catch (err) {
      results.instagram = { connected: false, error: err.response?.data?.error?.message || err.message };
    }
  } else {
    results.instagram = { connected: false, error: 'Not configured' };
  }

  // Test Google
  if (row.google_token) {
    try {
      results.google = await testGoogleConnection(row.google_token, row.google_location_id);
    } catch (err) {
      results.google = { connected: false, error: err.response?.data?.error?.message || err.message };
    }
  } else {
    results.google = { connected: false, error: 'Not configured' };
  }

  res.json(results);
});

// POST /api/oauth/test-all - Test every merchant's platform connections and
// persist the result so /clients can show real liveness instead of just DB presence.
router.post('/test-all', async (req, res) => {
  const db = getDb();
  const merchants = db.prepare('SELECT * FROM merchants').all();
  const now = new Date().toISOString();
  const summary = {
    tested: 0,
    fbOk: 0, fbFail: 0,
    igOk: 0, igFail: 0,
    googleOk: 0, googleFail: 0,
  };

  async function testOne(row) {
    const updates = {};

    if (row.fb_page_id && row.fb_token) {
      try {
        await testFacebookConnection(row.fb_page_id, row.fb_token);
        updates.fb_last_check_ok = 1;
        updates.fb_last_check_error = '';
        summary.fbOk++;
      } catch (err) {
        updates.fb_last_check_ok = 0;
        updates.fb_last_check_error = String(err.response?.data?.error?.message || err.message || 'unknown').slice(0, 500);
        summary.fbFail++;
      }
      updates.fb_last_check_at = now;
    }

    if (row.ig_user_id && row.ig_token) {
      try {
        await testInstagramConnection(row.ig_user_id, row.ig_token);
        updates.ig_last_check_ok = 1;
        updates.ig_last_check_error = '';
        summary.igOk++;
      } catch (err) {
        updates.ig_last_check_ok = 0;
        updates.ig_last_check_error = String(err.response?.data?.error?.message || err.message || 'unknown').slice(0, 500);
        summary.igFail++;
      }
      updates.ig_last_check_at = now;
    }

    if (row.google_token) {
      try {
        await testGoogleConnection(row.google_token, row.google_location_id);
        updates.google_last_check_ok = 1;
        updates.google_last_check_error = '';
        summary.googleOk++;
      } catch (err) {
        updates.google_last_check_ok = 0;
        updates.google_last_check_error = String(err.response?.data?.error?.message || err.message || 'unknown').slice(0, 500);
        summary.googleFail++;
      }
      updates.google_last_check_at = now;
    }

    const fields = Object.keys(updates);
    if (fields.length > 0) {
      const setClause = fields.map(k => `${k} = ?`).join(', ');
      const values = fields.map(k => updates[k]);
      values.push(row.mid);
      db.prepare(`UPDATE merchants SET ${setClause}, updated_at = datetime('now') WHERE mid = ?`).run(...values);
    }
    summary.tested++;
  }

  // Run in chunks of 10 to avoid hitting Facebook's 200/user/hour rate limit
  // and to keep memory bounded for large merchant lists.
  const CHUNK = 10;
  for (let i = 0; i < merchants.length; i += CHUNK) {
    const slice = merchants.slice(i, i + CHUNK);
    await Promise.allSettled(slice.map(testOne));
  }

  res.json(summary);
});

module.exports = router;
