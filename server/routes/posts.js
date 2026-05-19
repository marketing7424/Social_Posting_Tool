const express = require('express');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { google } = require('googleapis');
const { v4: uuid } = require('uuid');
const { getDb } = require('../services/db');
const { publishToFacebook, publishToInstagram, publishToGoogle } = require('../services/publisher');

const router = express.Router();

function getMerchantFromDb(mid) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(mid);
  if (!row) return null;
  return {
    mid: row.mid,
    dbaName: row.dba_name,
    address: row.address,
    phone: row.phone,
    website: row.website || '',
    fbPageId: row.fb_page_id,
    fbToken: row.fb_token,
    igUserId: row.ig_user_id,
    igToken: row.ig_token,
    googleToken: row.google_token,
    googleLocationId: row.google_location_id,
    timezone: row.timezone || '',
  };
}

// POST /api/posts
router.post('/', (req, res) => {
  const { merchantMid, platforms, captions, mediaFiles, fbLayout, fbLayoutVariant, scheduledTime, originalPostId, googlePostType, googleTitle, googleStartDate, googleStartTime, googleEndDate, googleEndTime, googleCouponCode, googleRedeemUrl, googleTerms, googleCtaType, googleCtaUrl } = req.body;
  if (!merchantMid || !platforms || platforms.length === 0) {
    return res.status(400).json({ error: 'merchantMid and platforms are required' });
  }

  const db = getDb();
  const postId = uuid();
  const status = scheduledTime ? 'scheduled' : 'draft';

  db.prepare(
    'INSERT INTO posts (id, merchant_mid, status, scheduled_time, fb_layout, fb_layout_variant, created_by, original_post_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(postId, merchantMid, status, scheduledTime || null, fbLayout || 'collage', fbLayoutVariant || 0, req.user?.id || null, originalPostId || '');

  if (originalPostId) {
    // Link the original back to this new repost so the failed row can show
    // "Reposted →" in the UI without an extra query per row.
    try {
      db.prepare('UPDATE posts SET reposted_as = ? WHERE id = ?').run(postId, originalPostId);
    } catch (_) { /* original may have been deleted; non-fatal */ }
  }

  for (const platform of platforms) {
    if (platform === 'google') {
      db.prepare(
        'INSERT INTO post_platforms (id, post_id, platform, caption, google_post_type, google_title, google_start_date, google_start_time, google_end_date, google_end_time, google_coupon_code, google_redeem_url, google_terms, google_cta_type, google_cta_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(uuid(), postId, platform, captions?.[platform] || '', googlePostType || 'STANDARD', googleTitle || '', googleStartDate || '', googleStartTime || '', googleEndDate || '', googleEndTime || '', googleCouponCode || '', googleRedeemUrl || '', googleTerms || '', googleCtaType || '', googleCtaUrl || '');
    } else {
      db.prepare(
        'INSERT INTO post_platforms (id, post_id, platform, caption) VALUES (?, ?, ?, ?)'
      ).run(uuid(), postId, platform, captions?.[platform] || '');
    }
  }

  for (let i = 0; i < (mediaFiles || []).length; i++) {
    const file = mediaFiles[i];
    db.prepare(
      'INSERT INTO post_media (id, post_id, filename, original_name, mimetype, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuid(), postId, file.filename || file, file.originalName || file, file.mimetype || '', i);
  }

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  const postPlatforms = db.prepare('SELECT * FROM post_platforms WHERE post_id = ?').all(postId);
  const postMedia = db.prepare('SELECT * FROM post_media WHERE post_id = ? ORDER BY sort_order').all(postId);

  res.status(201).json({ ...post, platforms: postPlatforms, media: postMedia });
});

// GET /api/posts
router.get('/', (req, res) => {
  const db = getDb();
  const { merchant, platform, status, created_by, exclude_statuses, date_from, date_to, limit = 500, offset = 0 } = req.query;

  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params = [];

  if (merchant) { sql += ' AND merchant_mid = ?'; params.push(merchant); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (created_by) { sql += ' AND created_by = ?'; params.push(created_by); }
  if (date_from) { sql += ' AND created_at >= ?'; params.push(date_from); }
  if (date_to) { sql += ' AND created_at <= ?'; params.push(date_to); }
  if (exclude_statuses) {
    const excluded = exclude_statuses.split(',').map(s => s.trim()).filter(Boolean);
    if (excluded.length > 0) {
      sql += ` AND status NOT IN (${excluded.map(() => '?').join(',')})`;
      params.push(...excluded);
    }
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const posts = db.prepare(sql).all(...params);

  const result = posts.map(post => {
    let platforms = db.prepare('SELECT * FROM post_platforms WHERE post_id = ?').all(post.id);
    if (platform) platforms = platforms.filter(p => p.platform === platform);
    const media = db.prepare('SELECT * FROM post_media WHERE post_id = ? ORDER BY sort_order').all(post.id);
    let created_by_name = null;
    if (post.created_by) {
      const user = db.prepare('SELECT display_name, email FROM users WHERE id = ?').get(post.created_by);
      if (user) created_by_name = user.display_name || user.email;
    }
    return { ...post, created_by_name, platforms, media };
  });

  // Filter out posts that have no matching platform if platform filter is set
  const filtered = platform ? result.filter(r => r.platforms.length > 0) : result;
  res.json(filtered);
});

// GET /api/posts/creators — unique users who have created posts
router.get('/creators', (req, res) => {
  const db = getDb();
  const rows = db.prepare(
    `SELECT DISTINCT p.created_by, u.display_name, u.email
     FROM posts p JOIN users u ON p.created_by = u.id
     WHERE p.created_by IS NOT NULL`
  ).all();
  res.json(rows.map(r => ({
    value: r.created_by,
    label: r.display_name || r.email,
  })));
});

// GET /api/posts/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const platforms = db.prepare('SELECT * FROM post_platforms WHERE post_id = ?').all(post.id);
  const media = db.prepare('SELECT * FROM post_media WHERE post_id = ? ORDER BY sort_order').all(post.id);
  res.json({ ...post, platforms, media });
});

// POST /api/posts/:id/link-original — manually mark this post as a repost of another
router.post('/:id/link-original', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { originalPostId } = req.body || {};
  if (!originalPostId) return res.status(400).json({ error: 'originalPostId is required' });
  if (originalPostId === post.id) return res.status(400).json({ error: 'Cannot link a post to itself' });

  const original = db.prepare('SELECT id FROM posts WHERE id = ?').get(originalPostId);
  if (!original) return res.status(404).json({ error: 'Original post not found' });

  // Clear any prior reverse-link on whoever was previously claiming this original
  try { db.prepare("UPDATE posts SET reposted_as = '' WHERE reposted_as = ?").run(originalPostId); } catch (_) {}

  db.prepare('UPDATE posts SET original_post_id = ? WHERE id = ?').run(originalPostId, post.id);
  db.prepare('UPDATE posts SET reposted_as = ? WHERE id = ?').run(post.id, originalPostId);

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
  res.json(updated);
});

// DELETE /api/posts/:id/link-original — remove the repost link
router.delete('/:id/link-original', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });
  if (post.original_post_id) {
    db.prepare("UPDATE posts SET reposted_as = '' WHERE id = ?").run(post.original_post_id);
  }
  db.prepare("UPDATE posts SET original_post_id = '' WHERE id = ?").run(post.id);
  res.json({ ok: true });
});

// PATCH /api/posts/:id
router.patch('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const { captions, scheduledTime, fbLayout, mediaOrder, status, previousStatus } = req.body;

  if (status) {
    if (previousStatus) {
      db.prepare('UPDATE posts SET status = ?, previous_status = ? WHERE id = ?').run(status, previousStatus, post.id);
    } else {
      db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(status, post.id);
    }
  }

  if (scheduledTime !== undefined) {
    db.prepare('UPDATE posts SET scheduled_time = ? WHERE id = ?').run(scheduledTime, post.id);
  }
  if (fbLayout) {
    db.prepare('UPDATE posts SET fb_layout = ? WHERE id = ?').run(fbLayout, post.id);
  }

  if (captions) {
    for (const [platform, caption] of Object.entries(captions)) {
      db.prepare('UPDATE post_platforms SET caption = ? WHERE post_id = ? AND platform = ?')
        .run(caption, post.id, platform);
    }
  }

  if (mediaOrder) {
    for (let i = 0; i < mediaOrder.length; i++) {
      db.prepare('UPDATE post_media SET sort_order = ? WHERE id = ? AND post_id = ?')
        .run(i, mediaOrder[i], post.id);
    }
  }

  const updated = db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id);
  const platforms = db.prepare('SELECT * FROM post_platforms WHERE post_id = ?').all(post.id);
  const media = db.prepare('SELECT * FROM post_media WHERE post_id = ? ORDER BY sort_order').all(post.id);
  res.json({ ...updated, platforms, media });
});

// Background publish helper — runs after response is sent
async function publishInBackground(postId) {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!post) return;

  const platforms = db.prepare('SELECT * FROM post_platforms WHERE post_id = ?').all(post.id);
  const media = db.prepare('SELECT filename, mimetype FROM post_media WHERE post_id = ? ORDER BY sort_order').all(post.id);

  // Filter out media files that no longer exist on disk
  const uploadsDir = process.env.NODE_ENV === 'production' ? '/data/uploads' : path.join(__dirname, '..', 'uploads');
  const existingMedia = media.filter(m => {
    try { return fs.existsSync(path.join(uploadsDir, m.filename)); } catch { return false; }
  });

  const mediaFiles = existingMedia.map(m => m.filename);
  const hasVideo = existingMedia.some(m => m.mimetype?.startsWith('video/'));
  const videoFile = existingMedia.find(m => m.mimetype?.startsWith('video/'));
  const imageFiles = existingMedia.filter(m => !m.mimetype?.startsWith('video/')).map(m => m.filename);
  const merchant = getMerchantFromDb(post.merchant_mid);

  // Publish platforms sequentially to avoid cross-posting duplication.
  // Facebook first (so we can reuse its CDN URLs for Instagram).
  const platformOrder = ['facebook', 'google', 'instagram'];
  const ordered = platformOrder
    .map(p => platforms.find(pp => pp.platform === p))
    .filter(Boolean);

  const settled = [];
  let fbImageUrls = []; // Reuse Facebook CDN URLs for Instagram

  for (const pp of ordered) {
    try {
      let result;
      if (pp.platform === 'facebook' && merchant) {
        result = await publishToFacebook({
          pageId: merchant.fbPageId, accessToken: merchant.fbToken,
          caption: pp.caption, mediaFiles: hasVideo ? [] : mediaFiles,
          layout: post.fb_layout, layoutVariant: post.fb_layout_variant,
          videoFile: videoFile?.filename || null,
        });
        // Save image URLs so Instagram can reuse them (no duplicate upload)
        // Skip for collage layouts — hero image is cropped and may violate IG aspect ratio limits
        if (result?.imageUrls && (post.fb_layout === 'album' || mediaFiles.length === 1)) {
          fbImageUrls = result.imageUrls;
        }
      } else if (pp.platform === 'instagram' && merchant) {
        result = await publishToInstagram({
          igUserId: merchant.igUserId, accessToken: merchant.igToken,
          caption: pp.caption, mediaFiles: hasVideo ? [] : mediaFiles,
          videoFile: videoFile?.filename || null,
          fbPageId: merchant.fbPageId,
          fbImageUrls,
        });
      } else if (pp.platform === 'google' && merchant) {
        result = await publishToGoogle({
          accessToken: merchant.googleToken, locationId: merchant.googleLocationId,
          caption: pp.caption, mediaFiles: imageFiles,
          googlePostType: pp.google_post_type, googleTitle: pp.google_title,
          googleStartDate: pp.google_start_date, googleStartTime: pp.google_start_time,
          googleEndDate: pp.google_end_date, googleEndTime: pp.google_end_time,
          googleCouponCode: pp.google_coupon_code, googleRedeemUrl: pp.google_redeem_url,
          googleTerms: pp.google_terms, googleCtaType: pp.google_cta_type, googleCtaUrl: pp.google_cta_url,
        });
      } else {
        throw new Error(`Missing credentials for ${pp.platform}`);
      }

      db.prepare("UPDATE post_platforms SET status = 'success', platform_post_id = ?, published_at = datetime('now') WHERE id = ?")
        .run(result?.postId || null, pp.id);
      settled.push({ platform: pp.platform, status: 'success', postId: result?.postId });
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || err.response?.data?.error_description || err.message;
      console.error(`[publish] ${pp.platform} error:`, errMsg);
      db.prepare("UPDATE post_platforms SET status = 'failed', error = ? WHERE id = ?")
        .run(errMsg, pp.id);
      settled.push({ platform: pp.platform, status: 'failed', error: errMsg });
    }
  }
  const anySuccess = settled.some(r => r.status === 'success');
  const allSuccess = settled.every(r => r.status === 'success');
  const finalStatus = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed';
  db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(finalStatus, post.id);

  console.log(`[publish] Post ${postId} finished: ${finalStatus}`, settled.map(r => `${r.platform}=${r.status}`).join(', '));
}

// POST /api/posts/:id/publish — returns immediately, publishes in background
router.post('/:id/publish', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (post.status === 'publishing') {
    return res.json({ status: 'publishing', message: 'Already publishing, please wait' });
  }

  db.prepare("UPDATE posts SET status = 'publishing' WHERE id = ?").run(post.id);

  // Fire and forget — publish in background
  publishInBackground(post.id).catch(err => {
    console.error('[publish] Background publish error:', err.message);
    db.prepare("UPDATE posts SET status = 'failed' WHERE id = ?").run(post.id);
  });

  res.json({ status: 'publishing', message: 'Publishing in background' });
});

// GET /api/posts/:id/status — poll for publish results
router.get('/:id/status', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const platforms = db.prepare('SELECT platform, status, error, platform_post_id FROM post_platforms WHERE post_id = ?').all(post.id);
  const results = {};
  for (const p of platforms) {
    results[p.platform] = { status: p.status, error: p.error, postId: p.platform_post_id };
  }

  res.json({ status: post.status, results });
});

// POST /api/posts/:id/schedule
router.post('/:id/schedule', (req, res) => {
  const db = getDb();
  const { scheduledTime } = req.body;
  if (!scheduledTime) return res.status(400).json({ error: 'scheduledTime is required' });

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  db.prepare("UPDATE posts SET status = 'scheduled', scheduled_time = ? WHERE id = ?")
    .run(scheduledTime, post.id);

  res.json({ success: true, scheduledTime });
});

// POST /api/posts/:id/retry - retry failed platform posts
router.post('/:id/retry', async (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  if (post.status === 'publishing') {
    return res.json({ status: 'publishing', message: 'Already publishing, please wait' });
  }

  // Only retry platforms that actually failed
  const failedPlatforms = db.prepare(
    "SELECT * FROM post_platforms WHERE post_id = ? AND status = 'failed'"
  ).all(post.id);

  if (failedPlatforms.length === 0) {
    return res.json({ status: post.status, message: 'No failed platforms to retry' });
  }

  // Reset failed platforms back to pending
  db.prepare(
    "UPDATE post_platforms SET status = 'pending', error = NULL WHERE post_id = ? AND status = 'failed'"
  ).run(post.id);

  db.prepare("UPDATE posts SET status = 'publishing' WHERE id = ?").run(post.id);

  const platforms = failedPlatforms;

  const media = db.prepare(
    'SELECT filename, mimetype FROM post_media WHERE post_id = ? ORDER BY sort_order'
  ).all(post.id);
  const mediaFiles = media.map(m => m.filename);
  const retryHasVideo = media.some(m => m.mimetype?.startsWith('video/'));
  const retryVideoFile = media.find(m => m.mimetype?.startsWith('video/'));
  const retryImageFiles = media.filter(m => !m.mimetype?.startsWith('video/')).map(m => m.filename);

  const merchant = getMerchantFromDb(post.merchant_mid);

  const results = {};
  let allSuccess = true;
  let anySuccess = false;

  for (const pp of platforms) {
    try {
      let result;
      if (pp.platform === 'facebook' && merchant) {
        result = await publishToFacebook({
          pageId: merchant.fbPageId, accessToken: merchant.fbToken,
          caption: pp.caption, mediaFiles: retryHasVideo ? [] : mediaFiles,
          layout: post.fb_layout, layoutVariant: post.fb_layout_variant,
          videoFile: retryVideoFile?.filename || null,
        });
      } else if (pp.platform === 'instagram' && merchant) {
        result = await publishToInstagram({
          igUserId: merchant.igUserId, accessToken: merchant.igToken,
          caption: pp.caption, mediaFiles: retryHasVideo ? [] : mediaFiles,
          videoFile: retryVideoFile?.filename || null,
          fbPageId: merchant.fbPageId,
        });
      } else if (pp.platform === 'google' && merchant) {
        result = await publishToGoogle({
          accessToken: merchant.googleToken, locationId: merchant.googleLocationId,
          caption: pp.caption, mediaFiles: retryImageFiles,
          googlePostType: pp.google_post_type, googleTitle: pp.google_title,
          googleStartDate: pp.google_start_date, googleStartTime: pp.google_start_time,
          googleEndDate: pp.google_end_date, googleEndTime: pp.google_end_time,
          googleCouponCode: pp.google_coupon_code, googleRedeemUrl: pp.google_redeem_url,
          googleTerms: pp.google_terms, googleCtaType: pp.google_cta_type, googleCtaUrl: pp.google_cta_url,
        });
      } else {
        throw new Error(`Missing credentials for ${pp.platform}`);
      }

      db.prepare("UPDATE post_platforms SET status = 'success', platform_post_id = ?, published_at = datetime('now') WHERE id = ?")
        .run(result?.postId || null, pp.id);
      results[pp.platform] = { status: 'success', postId: result?.postId };
      anySuccess = true;
    } catch (err) {
      allSuccess = false;
      const errMsg = err.response?.data?.error?.message || err.response?.data?.error_description || err.message;
      console.error(`[publish-retry] ${pp.platform} error:`, errMsg);
      db.prepare("UPDATE post_platforms SET status = 'failed', error = ? WHERE id = ?")
        .run(errMsg, pp.id);
      results[pp.platform] = { status: 'failed', error: errMsg };
    }
  }

  // Also check already-successful platforms
  const successPlatforms = db.prepare(
    "SELECT * FROM post_platforms WHERE post_id = ? AND status = 'success'"
  ).all(post.id);
  if (successPlatforms.length > 0) anySuccess = true;

  const finalStatus = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed';
  db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(finalStatus, post.id);

  res.json({ status: finalStatus, results });
});

// Recompute a post's overall status from its post_platforms rows.
function recomputePostStatus(db, postId) {
  const all = db.prepare("SELECT status FROM post_platforms WHERE post_id = ?").all(postId);
  if (all.length === 0) return;
  const allSuccess = all.every(p => p.status === 'success');
  const anySuccess = all.some(p => p.status === 'success');
  const finalStatus = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed';
  db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(finalStatus, postId);
}

// GET /api/posts/:id/verify-google
// Verify a freshly-published Google post is actually LIVE on Google Business
// Profile. Used by mass publish to catch silent spam-filter rejections where
// the create call returns 200 OK but the post never goes public. Read-only
// against Google; only writes to DB if Google reports REJECTED/REMOVED.
router.get('/:id/verify-google', async (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ verified: false, reason: 'post not found' });

  const pp = db.prepare(
    "SELECT * FROM post_platforms WHERE post_id = ? AND platform = 'google'"
  ).get(post.id);
  if (!pp) return res.json({ verified: true, reason: 'no google platform' });
  if (pp.status !== 'success') return res.json({ verified: true, reason: 'already not success' });

  if (!pp.platform_post_id) {
    // Marked success but with no postId — that's a silent failure
    db.prepare("UPDATE post_platforms SET status = 'failed', error = ? WHERE id = ?")
      .run('Google API returned no post name — likely blocked by spam filter', pp.id);
    recomputePostStatus(db, post.id);
    return res.json({ verified: false, reason: 'no post id', action: 'marked_failed' });
  }

  const merchant = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(post.merchant_mid);
  if (!merchant?.google_token) return res.json({ verified: true, reason: 'no token' });

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: merchant.google_token });
    const { token } = await oauth2Client.getAccessToken();

    const resp = await axios.get(
      `https://mybusiness.googleapis.com/v4/${pp.platform_post_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const state = resp.data.state || 'unknown';
    // LIVE = visible publicly. PROCESSING = still being reviewed (give benefit of doubt).
    // REJECTED / REMOVED = blocked by Google.
    if (state === 'REJECTED' || state === 'REMOVED') {
      const errMsg = `Google blocked the post (state=${state}). Common cause: identical content across many locations triggers the spam filter. Try varying caption per store.`;
      db.prepare("UPDATE post_platforms SET status = 'failed', error = ? WHERE id = ?")
        .run(errMsg, pp.id);
      recomputePostStatus(db, post.id);
      return res.json({ verified: false, state, action: 'marked_failed' });
    }
    return res.json({ verified: true, state });
  } catch (err) {
    // Be conservative: if verify itself fails, don't downgrade success
    console.error('[verify-google]', err.response?.data?.error?.message || err.message);
    return res.json({ verified: true, error: err.message, action: 'kept_status' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ success: true });
});

module.exports = router;
