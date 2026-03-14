const express = require('express');
const axios = require('axios');
const { getDb } = require('../services/db');

const router = express.Router();
const META_API = 'https://graph.facebook.com/v21.0';

// GET /api/analytics/:mid — fetch engagement metrics for a merchant
router.get('/:mid', async (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM merchants WHERE mid = ?').get(req.params.mid);
  if (!row) return res.status(404).json({ error: 'Merchant not found' });

  const { period = '30' } = req.query; // days
  const since = Math.floor(Date.now() / 1000) - (Number(period) * 86400);
  const until = Math.floor(Date.now() / 1000);

  const results = { facebook: null, instagram: null };

  // Facebook Page Insights
  if (row.fb_page_id && row.fb_token) {
    try {
      // Fetch posts and page follower count
      const [postsResp, pageResp] = await Promise.all([
        axios.get(`${META_API}/${row.fb_page_id}/published_posts`, {
          params: {
            fields: 'id,message,created_time,shares,full_picture',
            since,
            until,
            limit: 50,
            access_token: row.fb_token,
          },
        }),
        axios.get(`${META_API}/${row.fb_page_id}`, {
          params: {
            fields: 'followers_count,fan_count',
            access_token: row.fb_token,
          },
        }),
      ]);

      // Note: likes/comments require Page Public Content Access (App Review).
      // They'll show as 0 until that feature is approved.

      // Try to fetch page insights (may fail for some page types)
      let insights = {};
      try {
        const insightsResp = await axios.get(`${META_API}/${row.fb_page_id}/insights`, {
          params: {
            metric: 'page_impressions,page_post_engagements',
            period: 'day',
            since,
            until,
            access_token: row.fb_token,
          },
        });
        for (const metric of insightsResp.data.data || []) {
          const total = (metric.values || []).reduce((sum, v) => sum + (v.value || 0), 0);
          insights[metric.name] = total;
        }
      } catch (_) {}

      // Process posts
      const posts = (postsResp.data.data || []).map(p => ({
        id: p.id,
        message: (p.message || '').slice(0, 100),
        createdTime: p.created_time,
        image: p.full_picture || null,
        likes: 0,
        comments: 0,
        shares: p.shares?.count || 0,
      }));

      const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
      const totalComments = posts.reduce((s, p) => s + p.comments, 0);
      const totalShares = posts.reduce((s, p) => s + p.shares, 0);

      results.facebook = {
        impressions: insights.page_impressions || 0,
        engagements: insights.page_post_engagements || totalLikes + totalComments + totalShares,
        followers: pageResp.data.followers_count || pageResp.data.fan_count || 0,
        postCount: posts.length,
        totalLikes,
        totalComments,
        totalShares,
        posts,
      };
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      results.facebook = { error: detail };
    }
  }

  // Instagram Insights
  if (row.ig_user_id && row.ig_token) {
    try {
      const [profileResp, mediaResp] = await Promise.all([
        axios.get(`${META_API}/${row.ig_user_id}`, {
          params: {
            fields: 'followers_count,media_count',
            access_token: row.ig_token,
          },
        }),
        axios.get(`${META_API}/${row.ig_user_id}/media`, {
          params: {
            fields: 'id,caption,timestamp,media_type,thumbnail_url,media_url,like_count,comments_count',
            since,
            until,
            limit: 50,
            access_token: row.ig_token,
          },
        }),
      ]);

      const posts = (mediaResp.data.data || []).map(m => ({
        id: m.id,
        caption: (m.caption || '').slice(0, 100),
        createdTime: m.timestamp,
        mediaType: m.media_type,
        image: m.thumbnail_url || m.media_url || null,
        likes: m.like_count || 0,
        comments: m.comments_count || 0,
      }));

      const totalLikes = posts.reduce((s, p) => s + p.likes, 0);
      const totalComments = posts.reduce((s, p) => s + p.comments, 0);

      results.instagram = {
        followers: profileResp.data.followers_count || 0,
        totalPosts: profileResp.data.media_count || 0,
        periodPosts: posts.length,
        totalLikes,
        totalComments,
        engagementRate: profileResp.data.followers_count
          ? (((totalLikes + totalComments) / posts.length) / profileResp.data.followers_count * 100).toFixed(2)
          : 0,
        posts,
      };
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.message;
      results.instagram = { error: detail };
    }
  }

  res.json(results);
});

module.exports = router;
