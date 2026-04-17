const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const { publishToFacebook, publishToInstagram, publishToGoogle } = require('./publisher');

const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/data/uploads'
  : path.join(__dirname, '..', '..', 'uploads');

const MAX_RETRIES = 3;

function getMerchantFromDb(mid) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(mid);
  if (!row) return null;
  return {
    mid: row.mid,
    dbaName: row.dba_name,
    address: row.address,
    phone: row.phone,
    fbPageId: row.fb_page_id,
    fbToken: row.fb_token,
    igUserId: row.ig_user_id,
    igToken: row.ig_token,
    googleToken: row.google_token,
    googleLocationId: row.google_location_id,
  };
}

function initScheduler() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledPosts();
    } catch (err) {
      console.error('[scheduler] Error processing posts:', err.message);
    }
  });
  console.log('[scheduler] Started - checking every minute');

  // Clean up posts older than 2 months — runs daily at 3 AM
  cron.schedule('0 3 * * *', () => {
    try {
      cleanupOldPosts();
    } catch (err) {
      console.error('[scheduler] Cleanup error:', err.message);
    }
  });

  // Also run cleanup on startup
  try { cleanupOldPosts(); } catch (_) {}
}

function cleanupOldPosts() {
  const db = getDb();
  const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 2 months ago

  // Delete related records first, then posts
  const oldPosts = db.prepare('SELECT id FROM posts WHERE created_at < ?').all(cutoff);
  if (oldPosts.length === 0) return;

  const ids = oldPosts.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');

  // Collect media filenames before deleting records
  const mediaFiles = db.prepare(
    `SELECT filename FROM post_media WHERE post_id IN (${placeholders})`
  ).all(...ids).map(m => m.filename);

  db.prepare(`DELETE FROM post_platforms WHERE post_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM post_media WHERE post_id IN (${placeholders})`).run(...ids);
  const result = db.prepare(`DELETE FROM posts WHERE id IN (${placeholders})`).run(...ids);

  if (result.changes > 0) {
    console.log(`[scheduler] Cleaned up ${result.changes} posts older than 2 months`);
  }

  // Delete media files from disk that are no longer referenced by any post
  let deletedFiles = 0;
  for (const filename of mediaFiles) {
    const stillUsed = db.prepare('SELECT 1 FROM post_media WHERE filename = ? LIMIT 1').get(filename);
    if (!stillUsed) {
      const filePath = path.join(UPLOADS_DIR, filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedFiles++;
        }
      } catch (_) {}
    }
  }
  if (deletedFiles > 0) {
    console.log(`[scheduler] Deleted ${deletedFiles} orphaned media files`);
  }

  // Clean up any orphaned files older than 7 days not referenced in DB
  cleanupOrphanedUploads(db);
}

function cleanupOrphanedUploads(db) {
  try {
    if (!fs.existsSync(UPLOADS_DIR)) return;
    const files = fs.readdirSync(UPLOADS_DIR);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const file of files) {
      const filePath = path.join(UPLOADS_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs > sevenDaysAgo) continue; // too recent, skip
        const referenced = db.prepare('SELECT 1 FROM post_media WHERE filename = ? LIMIT 1').get(file);
        if (!referenced) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (_) {}
    }
    if (deleted > 0) {
      console.log(`[scheduler] Deleted ${deleted} orphaned upload files (>7 days, unreferenced)`);
    }
  } catch (_) {}
}

const publishingPosts = new Set();

async function processScheduledPosts() {
  const db = getDb();
  const now = new Date().toISOString();

  const posts = db.prepare(
    "SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_time <= ?"
  ).all(now);

  for (const post of posts) {
    // Skip if already being published by a previous tick
    if (publishingPosts.has(post.id)) {
      console.log(`[scheduler] Skipping ${post.id} — already publishing`);
      continue;
    }

    publishingPosts.add(post.id);
    db.prepare("UPDATE posts SET status = 'publishing' WHERE id = ?").run(post.id);

    const platforms = db.prepare(
      "SELECT * FROM post_platforms WHERE post_id = ? AND status = 'pending'"
    ).all(post.id);

    const media = db.prepare(
      'SELECT filename, mimetype FROM post_media WHERE post_id = ? ORDER BY sort_order'
    ).all(post.id);
    const hasVideo = media.some(m => m.mimetype?.startsWith('video/'));
    const videoFile = hasVideo ? media.find(m => m.mimetype?.startsWith('video/')) : null;
    const mediaFiles = media.map(m => m.filename);
    const imageFiles = media.filter(m => !m.mimetype?.startsWith('video/')).map(m => m.filename);

    const merchant = getMerchantFromDb(post.merchant_mid);

    let allSuccess = true;
    let anySuccess = false;

    for (const pp of platforms) {
      try {
        let result;

        if (pp.platform === 'facebook' && merchant) {
          result = await publishToFacebook({
            pageId: merchant.fbPageId,
            accessToken: merchant.fbToken,
            caption: pp.caption,
            mediaFiles: hasVideo ? [] : mediaFiles,
            layout: post.fb_layout,
            layoutVariant: post.fb_layout_variant,
            videoFile: videoFile?.filename || null,
          });
        } else if (pp.platform === 'instagram' && merchant) {
          result = await publishToInstagram({
            igUserId: merchant.igUserId,
            accessToken: merchant.igToken,
            caption: pp.caption,
            mediaFiles: hasVideo ? [] : mediaFiles,
            videoFile: videoFile?.filename || null,
            fbPageId: merchant.fbPageId,
          });
        } else if (pp.platform === 'google' && merchant) {
          result = await publishToGoogle({
            accessToken: merchant.googleToken,
            locationId: merchant.googleLocationId,
            caption: pp.caption,
            mediaFiles: imageFiles,
            googlePostType: pp.google_post_type, googleTitle: pp.google_title,
            googleStartDate: pp.google_start_date, googleStartTime: pp.google_start_time,
            googleEndDate: pp.google_end_date, googleEndTime: pp.google_end_time,
            googleCouponCode: pp.google_coupon_code, googleRedeemUrl: pp.google_redeem_url,
            googleTerms: pp.google_terms, googleCtaType: pp.google_cta_type, googleCtaUrl: pp.google_cta_url,
          });
        } else {
          throw new Error(`Missing credentials for ${pp.platform}`);
        }

        db.prepare(
          "UPDATE post_platforms SET status = 'success', platform_post_id = ?, published_at = datetime('now') WHERE id = ?"
        ).run(result?.postId || null, pp.id);
        anySuccess = true;
      } catch (err) {
        allSuccess = false;
        let retryCount = 0;
        try {
          retryCount = pp.error ? (JSON.parse(pp.error).retries || 0) : 0;
        } catch (_) {}
        retryCount++;

        if (retryCount < MAX_RETRIES) {
          db.prepare(
            "UPDATE post_platforms SET status = 'pending', error = ? WHERE id = ?"
          ).run(JSON.stringify({ message: err.message, retries: retryCount }), pp.id);
        } else {
          db.prepare(
            "UPDATE post_platforms SET status = 'failed', error = ? WHERE id = ?"
          ).run(JSON.stringify({ message: err.message, retries: retryCount }), pp.id);
        }
      }
    }

    const finalStatus = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed';
    db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(finalStatus, post.id);
    publishingPosts.delete(post.id);
  }
}

module.exports = { initScheduler };
