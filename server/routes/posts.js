const express = require('express');
const path = require('path');
const fs = require('fs');
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
  const { merchantMid, platforms, captions, mediaFiles, fbLayout, fbLayoutVariant, scheduledTime } = req.body;
  if (!merchantMid || !platforms || platforms.length === 0) {
    return res.status(400).json({ error: 'merchantMid and platforms are required' });
  }

  const db = getDb();
  const postId = uuid();
  const status = scheduledTime ? 'scheduled' : 'draft';

  db.prepare(
    'INSERT INTO posts (id, merchant_mid, status, scheduled_time, fb_layout, fb_layout_variant, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(postId, merchantMid, status, scheduledTime || null, fbLayout || 'collage', fbLayoutVariant || 0, req.user?.id || null);

  for (const platform of platforms) {
    db.prepare(
      'INSERT INTO post_platforms (id, post_id, platform, caption) VALUES (?, ?, ?, ?)'
    ).run(uuid(), postId, platform, captions?.[platform] || '');
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
  const { merchant, platform, status, created_by, limit = 50, offset = 0 } = req.query;

  let sql = 'SELECT * FROM posts WHERE 1=1';
  const params = [];

  if (merchant) { sql += ' AND merchant_mid = ?'; params.push(merchant); }
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (created_by) { sql += ' AND created_by = ?'; params.push(created_by); }

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

// GET /api/posts/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const platforms = db.prepare('SELECT * FROM post_platforms WHERE post_id = ?').all(post.id);
  const media = db.prepare('SELECT * FROM post_media WHERE post_id = ? ORDER BY sort_order').all(post.id);
  res.json({ ...post, platforms, media });
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

// DELETE /api/posts/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  db.prepare('DELETE FROM posts WHERE id = ?').run(post.id);
  res.json({ success: true });
});

module.exports = router;
