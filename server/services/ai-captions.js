const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const client = new Anthropic();

// Max images to send to Claude (it only needs a few to understand the content)
const MAX_IMAGES_FOR_AI = 3;
// Resize images to this max dimension before base64 encoding
const MAX_IMAGE_DIM = 800;
// Max file size after resize (bytes) — skip if still too large
const MAX_IMAGE_BYTES = 500_000;

/**
 * Get seasonal/holiday context based on the current date.
 * Returns a string describing the current season and any nearby holidays.
 */
function getSeasonalContext() {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const day = now.getDate();

  // Season
  let season;
  if (month >= 2 && month <= 4) season = 'spring';
  else if (month >= 5 && month <= 7) season = 'summer';
  else if (month >= 8 && month <= 10) season = 'fall/autumn';
  else season = 'winter';

  // Nearby holidays & events (within ~2 weeks)
  const holidays = [];
  const md = `${month + 1}-${day}`;
  const monthDay = (m, d) => `${m}-${d}`;

  const holidayCalendar = [
    { start: monthDay(1, 1), end: monthDay(1, 7), name: "New Year's" },
    { start: monthDay(1, 10), end: monthDay(1, 20), name: 'Martin Luther King Jr. Day' },
    { start: monthDay(2, 1), end: monthDay(2, 14), name: "Valentine's Day" },
    { start: monthDay(2, 15), end: monthDay(2, 28), name: "Presidents' Day" },
    { start: monthDay(3, 1), end: monthDay(3, 17), name: "St. Patrick's Day" },
    { start: monthDay(3, 15), end: monthDay(4, 5), name: 'Spring season / Easter' },
    { start: monthDay(4, 15), end: monthDay(4, 22), name: 'Earth Day' },
    { start: monthDay(5, 1), end: monthDay(5, 12), name: "Mother's Day" },
    { start: monthDay(5, 20), end: monthDay(5, 31), name: 'Memorial Day / start of summer' },
    { start: monthDay(6, 10), end: monthDay(6, 20), name: "Father's Day" },
    { start: monthDay(6, 25), end: monthDay(7, 4), name: 'Fourth of July / Independence Day' },
    { start: monthDay(8, 15), end: monthDay(9, 5), name: 'Back to School / Labor Day' },
    { start: monthDay(10, 15), end: monthDay(10, 31), name: 'Halloween' },
    { start: monthDay(11, 1), end: monthDay(11, 11), name: "Veterans Day" },
    { start: monthDay(11, 12), end: monthDay(11, 28), name: 'Thanksgiving' },
    { start: monthDay(11, 25), end: monthDay(11, 30), name: 'Black Friday / Cyber Monday' },
    { start: monthDay(12, 1), end: monthDay(12, 31), name: 'Holiday season / Christmas' },
  ];

  for (const h of holidayCalendar) {
    const [sm, sd] = h.start.split('-').map(Number);
    const [em, ed] = h.end.split('-').map(Number);
    const startVal = sm * 100 + sd;
    const endVal = em * 100 + ed;
    const curVal = (month + 1) * 100 + day;
    if (curVal >= startVal && curVal <= endVal) {
      holidays.push(h.name);
    }
  }

  let context = `Current season: ${season}.`;
  if (holidays.length > 0) {
    context += ` Upcoming/current holidays: ${holidays.join(', ')}.`;
  }
  context += ` Today's date: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.`;
  return context;
}

const HUMAN_TONE_RULES = `
CRITICAL WRITING RULES — follow these exactly:
- Write like a REAL person, not a marketing robot. Imagine the business owner typing this themselves.
- NEVER use these overused AI phrases: "elevate", "transform", "journey", "experience the difference", "look no further", "treat yourself", "indulge", "pamper yourself", "game-changer", "next level", "don't miss out".
- Vary your sentence structure. Mix short punchy lines with slightly longer ones.
- Use natural, everyday language. Write how people actually talk.
- Each caption you write must feel UNIQUE — avoid formulaic patterns. Don't start every caption the same way.
- If seasonal context is provided, weave it in naturally ONLY when it fits. Don't force holiday references if the content doesn't call for it.
- Be specific about what's shown in the images rather than vague and generic.`;

const PLATFORM_PROMPTS = {
  facebook: `Write a Facebook Page post caption following this EXACT structure:

1. HOOK LINE: Start with 1-2 relevant emojis + a bold, catchy first line (under 80 chars). This must stop the scroll — be specific, not generic.
2. DESCRIPTION: 1-2 short sentences describing what's shown. Conversational and warm, like a friend recommending something. Keep under 150 characters.
3. CTA LINE: One emoji + a natural call-to-action (e.g., "📅 Spots are going fast — grab yours!")
4. SEPARATOR: A line of dashes: "----------"
5. BUSINESS INFO BLOCK:
   {name}
   📞 Phone: {phone}
   📍 Address: {address}
   🌐 Website: {website}
6. HASHTAGS: 5-8 relevant hashtags, mix of industry + niche + location tags on their own line.

Platform-specific best practices:
- Facebook rewards longer-form engagement — you can be slightly more descriptive than Instagram
- Keep total caption under 500 characters (before hashtags)
- Use emojis sparingly (2-4 in caption body) — Facebook audiences skew slightly older
- First line must be compelling in under 80 characters (this shows in preview)
- Hashtags should be specific, not generic (#NailArtInspo not #beautiful)
- Facebook users engage more with relatable, community-oriented language
- Ask a question or use a relatable statement to boost comments`,

  instagram: `Write an Instagram Business post caption following this EXACT structure:

1. HOOK LINE: Start with 1-2 emojis + a bold, attention-grabbing first line. Must be compelling within the first 125 characters (what shows before "...more").
2. DESCRIPTION: 2-3 short sentences. Warm and personal — talk TO the reader, not AT them. Use line breaks between sentences.
3. CTA LINE: One emoji + natural call-to-action (e.g., "📅 Link in bio to book!")
4. BUSINESS INFO:
   📞 {phone}
   📍 {address}
   🌐 {website}
5. HASHTAGS: 3-5 highly targeted hashtags on a new line.

Platform-specific best practices:
- Instagram is VISUAL FIRST — the caption supports the image, don't over-describe what people can already see
- First 125 characters are critical — they show in the feed before "...more" truncation
- Use 3-5 targeted hashtags (the algorithm now prefers keyword-rich captions over hashtag spam)
- Include relevant keywords naturally in the caption for Instagram SEO
- Speak directly to the customer — "you" and "your" feel personal
- Line breaks dramatically improve readability
- Instagram audiences respond to authenticity and personality, not corporate speak
- Emojis should enhance, not clutter — use them as visual breaks`,

  google: `Write a Google Business Profile post caption following this EXACT structure:

1. Professional, service-focused description (2-4 sentences)
2. Highlight what makes this specific service/product stand out
3. End with a subtle, natural call-to-action

Platform-specific best practices:
- NO hashtags (Google Business doesn't use them — never include any)
- NO emojis (keep it clean and professional — Google penalizes emoji-heavy posts)
- Keep between 150-300 characters for optimal engagement
- Use relevant local SEO keywords naturally (service type + city/neighborhood)
- Google users are searching with intent — speak to their needs directly
- Write in professional but warm tone — not stiff corporate language
- Focus on what the customer gets, not just what you offer
- Don't include phone/address (Google shows that separately in the listing)
- If a website URL is provided, include it naturally as a "Learn more" or "Visit" link at the end
- This is NOT social media — it's a business listing. Write accordingly.`,
};

function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp',
  };
  return types[ext] || null;
}

function fillMerchantInfo(prompt, merchant) {
  return prompt
    .replace(/\{name\}/g, merchant.name || 'Business Name')
    .replace(/\{phone\}/g, merchant.phone || '(xxx) xxx-xxxx')
    .replace(/\{address\}/g, merchant.address || 'Business Address')
    .replace(/\{website\}/g, merchant.website || '');
}

/**
 * Resize an image to max dimensions and return a smaller base64 buffer.
 * This dramatically reduces the payload sent to Claude's vision API.
 */
async function resizeImageForAI(filePath) {
  try {
    const buffer = await sharp(filePath)
      .resize(MAX_IMAGE_DIM, MAX_IMAGE_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 70 })
      .toBuffer();

    if (buffer.length > MAX_IMAGE_BYTES) return null;
    return { data: buffer.toString('base64'), media_type: 'image/jpeg' };
  } catch (err) {
    console.error('[ai-captions] resize failed:', filePath, err.message);
    return null;
  }
}

/**
 * Load and resize images for AI. Limits to MAX_IMAGES_FOR_AI.
 */
async function loadImagesForAI(mediaFiles) {
  const imageContent = [];
  const files = (mediaFiles || []).slice(0, MAX_IMAGES_FOR_AI);

  for (const file of files) {
    const filePath = path.isAbsolute(file) ? file : path.join(__dirname, '..', 'uploads', file);
    const mediaType = getMediaType(filePath);
    if (!mediaType) continue;

    const resized = await resizeImageForAI(filePath);
    if (!resized) continue;

    imageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: resized.media_type, data: resized.data },
    });
  }

  return imageContent;
}

async function generateCaptions({ mediaFiles, merchantName, merchantPhone, merchantAddress, merchantWebsite, platforms, context }) {
  const imageContent = await loadImagesForAI(mediaFiles);
  const seasonalContext = getSeasonalContext();

  const merchantInfo = {
    name: merchantName || 'this business',
    phone: merchantPhone || '',
    address: merchantAddress || '',
    website: merchantWebsite || '',
  };

  // Generate all platform captions in a single call to avoid duplicates across platforms
  const platformPrompts = platforms.map(platform => {
    const prompt = fillMerchantInfo(PLATFORM_PROMPTS[platform], merchantInfo);
    return `=== ${platform.toUpperCase()} ===\n${prompt}`;
  }).join('\n\n');

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        {
          type: 'text',
          text: `You are a skilled social media manager who writes like a real person — not a bot, not a marketer. You manage social media for "${merchantInfo.name}".
${merchantInfo.phone ? `Business phone: ${merchantInfo.phone}` : ''}
${merchantInfo.address ? `Business address: ${merchantInfo.address}` : ''}
${merchantInfo.website ? `Business website: ${merchantInfo.website}` : ''}

${seasonalContext}
${context ? `Additional context from user: ${context}` : ''}
${HUMAN_TONE_RULES}
${merchantInfo.website ? `\nWEBSITE RULE: The business has a website at ${merchantInfo.website}. Include this website link naturally in every caption — in the business info block or as part of the CTA. Do NOT skip it.` : ''}

ANTI-DUPLICATE RULE: You are writing captions for ${platforms.length} platform(s) in one go. Each caption MUST use a different hook, angle, and wording. Do NOT reuse the same opening line, CTA, or phrasing across platforms. Each platform has a different audience and tone — write accordingly.

${imageContent.length > 0 ? 'Look at the uploaded images carefully. Describe what you actually see — be specific, not vague.' : 'No images provided — write a general promotional post.'}

Write a caption for EACH platform below. Separate each with the exact marker line.

${platformPrompts}

Format your response EXACTLY like this (one section per platform):
${platforms.map(p => `--- ${p.toUpperCase()} ---\n(caption here)`).join('\n')}

Return ONLY the captions with the separator markers. No extra commentary.`,
        },
      ],
    }],
  });

  const responseText = message.content[0].text.trim();

  // Parse platform captions from response
  const captions = {};
  for (let i = 0; i < platforms.length; i++) {
    const platform = platforms[i];
    const marker = `--- ${platform.toUpperCase()} ---`;
    const nextPlatform = platforms[i + 1];
    const nextMarker = nextPlatform ? `--- ${nextPlatform.toUpperCase()} ---` : null;

    const startIdx = responseText.indexOf(marker);
    if (startIdx === -1) continue;

    const captionStart = startIdx + marker.length;
    const captionEnd = nextMarker ? responseText.indexOf(nextMarker) : responseText.length;
    captions[platform] = responseText.slice(captionStart, captionEnd).trim();
  }

  // Fallback: if parsing failed for any platform, generate individually
  for (const platform of platforms) {
    if (!captions[platform]) {
      const prompt = fillMerchantInfo(PLATFORM_PROMPTS[platform], merchantInfo);
      const fallback = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: `You are a skilled social media manager for "${merchantInfo.name}".
${merchantInfo.phone ? `Business phone: ${merchantInfo.phone}` : ''}
${merchantInfo.address ? `Business address: ${merchantInfo.address}` : ''}
${merchantInfo.website ? `Business website: ${merchantInfo.website}` : ''}
${seasonalContext}
${HUMAN_TONE_RULES}
${merchantInfo.website ? `\nWEBSITE RULE: Include the website ${merchantInfo.website} naturally in the caption.` : ''}

${imageContent.length > 0 ? 'Look at the uploaded images and describe what you see specifically. ' : ''}Write a caption for ${platform}:

${prompt}

Return ONLY the caption text.`,
            },
          ],
        }],
      });
      captions[platform] = fallback.content[0].text.trim();
    }
  }

  return captions;
}

async function regenerateCaption({ platform, currentCaption, feedback, merchantName, merchantPhone, merchantAddress, merchantWebsite, mediaFiles }) {
  const imageContent = await loadImagesForAI(mediaFiles);
  const seasonalContext = getSeasonalContext();

  const merchantInfo = {
    name: merchantName || 'this business',
    phone: merchantPhone || '',
    address: merchantAddress || '',
    website: merchantWebsite || '',
  };

  const prompt = fillMerchantInfo(PLATFORM_PROMPTS[platform], merchantInfo);

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{
      role: 'user',
      content: [
        ...imageContent,
        {
          type: 'text',
          text: `You are a skilled social media manager for "${merchantInfo.name}" who writes like a real person.
${merchantInfo.phone ? `Business phone: ${merchantInfo.phone}` : ''}
${merchantInfo.address ? `Business address: ${merchantInfo.address}` : ''}
${merchantInfo.website ? `Business website: ${merchantInfo.website}` : ''}
${seasonalContext}
${HUMAN_TONE_RULES}
${merchantInfo.website ? `\nWEBSITE RULE: Include the website ${merchantInfo.website} naturally in the caption.` : ''}

Platform: ${platform}
${prompt}

Here is the CURRENT caption (rewrite it — do NOT copy phrases from it):
${currentCaption}

User feedback: ${feedback || 'Rewrite with a completely different angle, hook, and wording. Same structure but fresh approach.'}

Write a new caption that feels genuinely different from the current one. Use a different opening, different CTA, different tone/angle. Return ONLY the caption text.`,
        },
      ],
    }],
  });

  return message.content[0].text.trim();
}

module.exports = { generateCaptions, regenerateCaption };
