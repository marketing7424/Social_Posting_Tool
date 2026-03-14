const express = require('express');
const { generateCaptions, regenerateCaption } = require('../services/ai-captions');

const router = express.Router();

// POST /api/captions/generate
router.post('/generate', async (req, res) => {
  try {
    const { mediaFiles, merchantName, merchantPhone, merchantAddress, merchantWebsite, platforms, context } = req.body;
    if (!platforms || platforms.length === 0) {
      return res.status(400).json({ error: 'At least one platform is required' });
    }
    const captions = await generateCaptions({
      mediaFiles, merchantName, merchantPhone, merchantAddress, merchantWebsite, platforms, context,
    });
    res.json(captions);
  } catch (err) {
    console.error('[captions] generate error:', err.message);
    res.status(500).json({ error: 'Failed to generate captions' });
  }
});

// POST /api/captions/regenerate
router.post('/regenerate', async (req, res) => {
  try {
    const { platform, currentCaption, feedback, merchantName, merchantPhone, merchantAddress, merchantWebsite, mediaFiles } = req.body;
    if (!platform) {
      return res.status(400).json({ error: 'Platform is required' });
    }
    const caption = await regenerateCaption({
      platform, currentCaption, feedback, merchantName, merchantPhone, merchantAddress, merchantWebsite, mediaFiles,
    });
    res.json({ caption });
  } catch (err) {
    console.error('[captions] regenerate error:', err.message);
    res.status(500).json({ error: 'Failed to regenerate caption' });
  }
});

module.exports = router;
