const cron = require('node-cron');
const { getDb } = require('./db');
const { publishToFacebook, publishToInstagram, publishToGoogle } = require('./publisher');

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
          });
        } else {
          throw new Error(`Missing credentials for ${pp.platform}`);
        }

        db.prepare(
          "UPDATE post_platforms SET status = 'success', platform_post_id = ? WHERE id = ?"
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
