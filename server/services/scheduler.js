const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { getDb } = require('./db');
const { publishToFacebook, publishToInstagram, publishToGoogle } = require('./publisher');

const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/data/uploads'
  : path.join(__dirname, '..', '..', 'uploads');

// How many posts to publish concurrently per tick. Posts almost always belong
// to different merchants (different FB pages/IG accounts), and Meta rate-limits
// per page/token, so running a few in parallel is safe and ~Nx faster than the
// old fully-sequential loop. Kept small so a mid-batch crash strands at most
// this many posts in 'publishing' (the rest stay 'scheduled' and survive).
const CONCURRENCY = 4;

// Stop claiming new posts once a tick has run this long, leaving the remainder
// for the next minute's tick. Prevents one giant batch (or a slow IG post) from
// monopolising the process indefinitely.
const TICK_BUDGET_MS = 55 * 1000;

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

// Posts whose publish was killed mid-flight by a deploy or crash get left in
// status='publishing' with some platforms still 'pending'. The retry route
// refuses to touch them because of the 'publishing' guard, so they stay stuck
// forever. On startup we settle them: mark any still-pending platforms as
// failed (so the user knows to retry), then recompute the post's overall
// status from its platform rows.
function recoverStuckPublishing() {
  const db = getDb();
  const stuck = db.prepare("SELECT id FROM posts WHERE status = 'publishing'").all();
  if (stuck.length === 0) return;

  console.log(`[scheduler] Recovering ${stuck.length} post(s) stuck in 'publishing'`);

  db.prepare(
    "UPDATE post_platforms SET status = 'failed', error = ? " +
    "WHERE status = 'pending' AND post_id IN (SELECT id FROM posts WHERE status = 'publishing')"
  ).run('Interrupted by server restart - please retry');

  for (const p of stuck) {
    const plats = db.prepare(
      "SELECT status FROM post_platforms WHERE post_id = ?"
    ).all(p.id);
    const anyFail = plats.some(x => x.status === 'failed');
    const anySuccess = plats.some(x => x.status === 'success');
    const newStatus = !anyFail ? 'success' : anySuccess ? 'partial' : 'failed';
    db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(newStatus, p.id);
  }
}

function initScheduler() {
  // Recover any posts left in 'publishing' state from a prior crash/deploy
  try { recoverStuckPublishing(); } catch (err) {
    console.error('[scheduler] Recovery error:', err.message);
  }

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
// Guards against overlapping ticks: node-cron fires every minute, but a batch
// (or a slow IG post) can run longer than that. A second concurrent run would
// double the effective concurrency, so we skip it.
let isProcessing = false;

// Atomically claim the next due post: flip exactly one 'scheduled' row whose
// time has arrived to 'publishing'. The conditional UPDATE guarantees only one
// worker (or process) can ever own a given post. Scans a small window of
// candidates so a lost race (another worker grabbed the first) still claims the
// next available one instead of giving up. Returns the claimed post row, or
// null when nothing is due.
function claimNextDuePost(db, nowIso) {
  const claim = db.transaction(() => {
    const candidates = db.prepare(
      "SELECT id FROM posts WHERE status = 'scheduled' AND scheduled_time <= ? ORDER BY scheduled_time LIMIT 20"
    ).all(nowIso);
    for (const c of candidates) {
      const r = db.prepare(
        "UPDATE posts SET status = 'publishing' WHERE id = ? AND status = 'scheduled'"
      ).run(c.id);
      if (r.changes === 1) {
        return db.prepare('SELECT * FROM posts WHERE id = ?').get(c.id);
      }
    }
    return null;
  });
  return claim();
}

// Publish every pending platform of a single already-claimed post, then set the
// post's overall status. On a platform error we mark it 'failed' immediately —
// NO auto-retry: a post-creating API call that timed out may have actually
// succeeded on the platform, so retrying would risk a duplicate. The user
// retries manually. (See memory: feedback_no_retry_on_create.)
async function publishOnePost(db, post) {
  // Belt-and-suspenders: in-memory guard against publishing the same post twice
  // within this Node process.
  if (publishingPosts.has(post.id)) {
    console.log(`[scheduler] Skipping ${post.id} — already publishing in-process`);
    return;
  }
  publishingPosts.add(post.id);

  try {
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
        const errMsg = err.response?.data?.error?.message || err.response?.data?.error_description || err.message;
        console.error(`[scheduler] ${pp.platform} error for post ${post.id}:`, errMsg);
        db.prepare(
          "UPDATE post_platforms SET status = 'failed', error = ? WHERE id = ?"
        ).run(errMsg, pp.id);
      }
    }

    const finalStatus = allSuccess ? 'success' : anySuccess ? 'partial' : 'failed';
    db.prepare('UPDATE posts SET status = ? WHERE id = ?').run(finalStatus, post.id);
    console.log(`[scheduler] Post ${post.id} finished: ${finalStatus}`);
  } finally {
    publishingPosts.delete(post.id);
  }
}

// A single worker: claim-and-publish due posts one at a time until none are
// left or the tick's time budget is spent. Running CONCURRENCY of these in
// parallel gives bounded concurrency without ever claiming more posts than are
// actively being published — so a crash strands at most CONCURRENCY posts.
async function publishWorker(db, deadline) {
  while (Date.now() < deadline) {
    const now = new Date().toISOString();
    const post = claimNextDuePost(db, now);
    if (!post) return; // nothing due right now
    try {
      await publishOnePost(db, post);
    } catch (err) {
      console.error(`[scheduler] Unexpected error publishing ${post.id}:`, err.message);
      // Settle the post so it doesn't stay stuck in 'publishing'.
      try {
        db.prepare("UPDATE posts SET status = 'failed' WHERE id = ? AND status = 'publishing'")
          .run(post.id);
      } catch (_) {}
    }
  }
}

async function processScheduledPosts() {
  if (isProcessing) {
    console.log('[scheduler] Previous tick still running — skipping');
    return;
  }
  isProcessing = true;
  const db = getDb();
  const deadline = Date.now() + TICK_BUDGET_MS;
  try {
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(publishWorker(db, deadline));
    }
    await Promise.all(workers);
  } finally {
    isProcessing = false;
  }
}

module.exports = { initScheduler };
