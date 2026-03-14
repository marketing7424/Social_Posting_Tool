const express = require('express');
const {
  getMetaAuthorizeUrl,
  handleMetaCallback,
  selectMetaPage,
  listMetaPages,
  testFacebookConnection,
  testInstagramConnection,
  getGoogleAuthorizeUrl,
  handleGoogleCallback,
  selectGoogleLocation,
  testGoogleConnection,
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

// GET /api/oauth/meta/callback
router.get('/meta/callback', async (req, res) => {
  const frontendUrl = getFrontendUrl();
  try {
    const { code, state: mid, error } = req.query;
    if (error) {
      return res.redirect(`${frontendUrl}/settings/${mid}?oauth_error=${encodeURIComponent(error)}`);
    }
    const result = await handleMetaCallback(code, mid);

    // Store pages data temporarily for the page picker
    pendingOAuth.set(mid, result);
    // Auto-expire after 10 minutes
    setTimeout(() => pendingOAuth.delete(mid), 10 * 60 * 1000);

    res.redirect(`${frontendUrl}/settings/${mid}?pick_page=true`);
  } catch (err) {
    console.error('[oauth] Meta callback error:', err.response?.data || err.message);
    const mid = req.query.state || '';
    res.redirect(`${frontendUrl}/settings/${mid}?oauth_error=${encodeURIComponent(err.message)}`);
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

// GET /api/oauth/google/callback
router.get('/google/callback', async (req, res) => {
  const frontendUrl = getFrontendUrl();
  try {
    const { code, state: mid, error } = req.query;
    if (error) {
      return res.redirect(`${frontendUrl}/settings/${mid}?oauth_error=${encodeURIComponent(error)}`);
    }
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
    const mid = req.query.state || '';
    res.redirect(`${frontendUrl}/settings/${mid}?oauth_error=${encodeURIComponent(err.message)}`);
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

module.exports = router;
