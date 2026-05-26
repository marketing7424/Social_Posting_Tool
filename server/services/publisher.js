const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const FormData = require('form-data');
const { google } = require('googleapis');

const META_API = 'https://graph.facebook.com/v21.0';
const GOOGLE_API = 'https://mybusiness.googleapis.com/v4';

const UPLOADS_DIR = process.env.NODE_ENV === 'production'
  ? '/data/uploads'
  : path.join(__dirname, '..', '..', 'uploads');

async function withRetry(fn, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      // Extract the real error message from Meta API responses
      const apiError = err.response?.data?.error;
      if (apiError) {
        const detail = apiError.error_user_msg || apiError.message || JSON.stringify(apiError);
        err.message = `${err.message}: ${detail}`;
        console.error('[publisher] API error detail:', JSON.stringify(apiError));
      }
      if (i === retries) throw err;
      const status = err.response?.status;
      if (status && status < 500 && status !== 429) throw err;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, i)));
    }
  }
}

function buildUploadForm(filePath, accessToken, extraFields = {}) {
  const form = new FormData();
  form.append('source', fs.createReadStream(filePath));
  form.append('access_token', accessToken);
  for (const [k, v] of Object.entries(extraFields)) {
    form.append(k, v);
  }
  return form;
}

function buildUploadFormFromBuffer(buffer, accessToken, extraFields = {}) {
  const form = new FormData();
  form.append('source', buffer, { filename: 'hero.jpg', contentType: 'image/jpeg' });
  form.append('access_token', accessToken);
  for (const [k, v] of Object.entries(extraFields)) {
    form.append(k, v);
  }
  return form;
}

/**
 * Facebook chooses layout based on the first image's aspect ratio.
 * We crop the hero image to force the desired layout.
 *
 * Based on official Facebook image size guide (LucidGen):
 *
 * 2 images:
 *   0 = Side by Side squares (900×900 each, 1:1)
 *   1 = Portraits side by side (448×900, 1:2)
 *   2 = Stacked landscapes (900×452, 2:1)
 *
 * 3 images:
 *   0 = Hero Top landscape (900×452, 2:1) + 2 squares
 *   1 = Hero Left portrait (448×900, 1:2) + 2 squares
 *   2 = Grid all squares (900×900, 1:1)
 *
 * 4 images:
 *   0 = 2×2 Grid squares (900×900, 1:1)
 *   1 = Hero Left portrait (598×900, 1:1.505) + 3 squares
 *   2 = Hero Top landscape (900×603, 1.493:1 ≈ 3:2) + 3 squares
 *
 * 5+ images:
 *   0 = 2+3 (all squares, 1:1)
 *   1 = 3+2 (all squares, 1:1)
 */
function getHeroAspectRatio(imageCount, layoutVariant) {
  if (imageCount === 2) {
    if (layoutVariant === 1) return { w: 448, h: 900 };  // Portraits (1:2)
    if (layoutVariant === 2) return { w: 900, h: 452 };  // Stacked landscapes (2:1)
    return { w: 1, h: 1 };                                // Side by side squares
  }
  if (imageCount === 3) {
    if (layoutVariant === 1) return { w: 448, h: 900 };  // Hero Left portrait (1:2)
    if (layoutVariant === 2) return { w: 1, h: 1 };      // Grid squares
    return { w: 900, h: 452 };                             // Hero Top landscape (2:1)
  }
  if (imageCount === 4) {
    if (layoutVariant === 1) return { w: 598, h: 900 };  // Hero Left portrait (1:1.5)
    if (layoutVariant === 2) return { w: 900, h: 603 };  // Hero Top landscape (3:2)
    return { w: 1, h: 1 };                                // 2×2 Grid squares
  }
  // 5+: all squares
  return { w: 1, h: 1 };
}

/**
 * Crop the hero image to the target aspect ratio to influence Facebook's layout.
 * Returns a Buffer of the cropped JPEG, or null if no cropping needed.
 */
async function cropHeroImage(filePath, targetRatio) {
  const metadata = await sharp(filePath).metadata();
  const { width, height } = metadata;

  const targetW = targetRatio.w;
  const targetH = targetRatio.h;

  // Calculate crop dimensions
  const currentRatio = width / height;
  const desiredRatio = targetW / targetH;

  let cropW = width;
  let cropH = height;

  if (Math.abs(currentRatio - desiredRatio) < 0.05) {
    // Already close enough, no crop needed
    return null;
  }

  if (currentRatio > desiredRatio) {
    // Image is wider than target — crop width
    cropW = Math.round(height * desiredRatio);
  } else {
    // Image is taller than target — crop height
    cropH = Math.round(width / desiredRatio);
  }

  const left = Math.round((width - cropW) / 2);
  const top = Math.round((height - cropH) / 2);

  const buffer = await sharp(filePath)
    .extract({ left, top, width: cropW, height: cropH })
    .jpeg({ quality: 92 })
    .toBuffer();

  return buffer;
}

async function publishToFacebook({ pageId, accessToken, caption, mediaFiles, layout, layoutVariant = 0, videoFile }) {
  if (!pageId || !accessToken) throw new Error('Facebook credentials not configured');

  return withRetry(async () => {
    // Video post — upload via Facebook Reels API (3-step resumable upload)
    if (videoFile) {
      const filePath = path.join(UPLOADS_DIR, videoFile);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Video file not found: ${videoFile}`);
      }
      const fileSize = fs.statSync(filePath).size;
      console.log(`[publisher] Uploading video to Facebook Reels: ${videoFile} (${fileSize} bytes)`);

      // Step 1: Create reel container
      const createResp = await axios.post(`${META_API}/${pageId}/video_reels`, {
        upload_phase: 'start',
        access_token: accessToken,
      });
      const videoId = createResp.data.video_id;
      const uploadUrl = createResp.data.upload_url;

      // Step 2: Upload video binary to the upload URL
      const videoBuffer = fs.readFileSync(filePath);
      await axios.post(uploadUrl, videoBuffer, {
        headers: {
          'Authorization': `OAuth ${accessToken}`,
          'offset': '0',
          'file_size': String(fileSize),
          'Content-Type': 'application/octet-stream',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      });

      // Step 3: Finish and publish (video_state PUBLISHED is required to show on Page)
      const finishResp = await axios.post(`${META_API}/${pageId}/video_reels`, {
        upload_phase: 'finish',
        video_id: videoId,
        video_state: 'PUBLISHED',
        description: caption || '',
        access_token: accessToken,
      });

      console.log(`[publisher] Facebook Reel published: ${finishResp.data.post_id || videoId}`);
      return { postId: finishResp.data.post_id || videoId };
    }

    // Text-only post
    if (!mediaFiles || mediaFiles.length === 0) {
      const resp = await axios.post(`${META_API}/${pageId}/feed`, {
        message: caption,
        access_token: accessToken,
      });
      return { postId: resp.data.id, url: `https://facebook.com/${resp.data.id}` };
    }

    // Single image
    if (mediaFiles.length === 1) {
      const filePath = path.join(UPLOADS_DIR, mediaFiles[0]);
      const form = buildUploadForm(filePath, accessToken, { message: caption });

      const resp = await axios.post(`${META_API}/${pageId}/photos`, form, {
        headers: form.getHeaders(),
      });

      // Fetch the CDN URL so Instagram can reuse it (no second upload needed)
      let imageUrls = [];
      try {
        const photoResp = await axios.get(`${META_API}/${resp.data.id}`, {
          params: { fields: 'images', access_token: accessToken },
        });
        imageUrls = [photoResp.data.images[0].source];
      } catch (_) {}

      return { postId: resp.data.id, imageUrls };
    }

    // Album mode: create a photo album
    if (layout === 'album') {
      const albumResp = await axios.post(`${META_API}/${pageId}/albums`, {
        name: caption.split('\n')[0].slice(0, 100) || 'Photo Album',
        message: caption,
        access_token: accessToken,
      });
      const albumId = albumResp.data.id;

      await Promise.all(mediaFiles.map(async (file) => {
        const filePath = path.join(UPLOADS_DIR, file);
        const form = buildUploadForm(filePath, accessToken);
        await axios.post(`${META_API}/${albumId}/photos`, form, {
          headers: form.getHeaders(),
        });
      }));

      return { postId: albumId };
    }

    // Collage mode — crop hero image to force desired layout
    const imgCount = Math.min(mediaFiles.length, 5);
    const targetRatio = getHeroAspectRatio(imgCount, layoutVariant);

    // Upload all photos in parallel (hero gets cropped, others stay original)
    const photoIds = await Promise.all(mediaFiles.map(async (file, i) => {
      const filePath = path.join(UPLOADS_DIR, file);

      let form;
      if (i === 0) {
        // Crop hero image to target aspect ratio
        const croppedBuffer = await cropHeroImage(filePath, targetRatio);
        if (croppedBuffer) {
          form = buildUploadFormFromBuffer(croppedBuffer, accessToken, { published: 'false' });
        } else {
          form = buildUploadForm(filePath, accessToken, { published: 'false' });
        }
      } else {
        form = buildUploadForm(filePath, accessToken, { published: 'false' });
      }

      const resp = await axios.post(`${META_API}/${pageId}/photos`, form, {
        headers: form.getHeaders(),
      });
      return resp.data.id;
    }));

    // Fetch CDN URLs from uploaded photos so Instagram can reuse them
    let imageUrls = [];
    try {
      imageUrls = await Promise.all(photoIds.map(async (id) => {
        const photoResp = await axios.get(`${META_API}/${id}`, {
          params: { fields: 'images', access_token: accessToken },
        });
        return photoResp.data.images[0].source;
      }));
    } catch (_) {}

    const params = new URLSearchParams();
    params.append('message', caption);
    params.append('access_token', accessToken);
    photoIds.forEach((id, i) => {
      params.append(`attached_media[${i}]`, JSON.stringify({ media_fbid: id }));
    });

    const resp = await axios.post(`${META_API}/${pageId}/feed`, params);
    return { postId: resp.data.id, imageUrls };
  });
}

// Upload a local file to Facebook as unpublished photo and get its public URL.
// Uses the IG user's linked page to avoid duplicating on the merchant's FB page.
async function getPublicImageUrl(pageId, accessToken, filePath) {
  const form = buildUploadForm(filePath, accessToken, { published: 'false', temporary: 'true' });

  console.log(`[publisher] Uploading temp photo to FB page ${pageId} for IG retry...`);
  const resp = await axios.post(`${META_API}/${pageId}/photos`, form, {
    headers: form.getHeaders(),
    timeout: 60000,
  });

  const photoResp = await axios.get(`${META_API}/${resp.data.id}`, {
    params: { fields: 'images', access_token: accessToken },
    timeout: 30000,
  });

  console.log(`[publisher] Temp photo uploaded, got CDN url`);
  return photoResp.data.images[0].source;
}

// Publish an IG media container, retrying with backoff while it's still
// processing. Replaces the old polling+publish flow: on at least some IG
// Business accounts, GET /{container-id}?fields=status_code returns
// "100/33 Authorization Error" even though the container is valid and
// publishable. Skip the read entirely — just try to publish, and if IG
// says "Media ID is not available" (still processing), wait and retry.
async function publishIgContainer(igUserId, containerId, accessToken) {
  // ~5-180s budget: initial 5s wait, then 30 attempts at 6s = up to 185s total.
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, attempt === 0 ? 5000 : 6000));
    try {
      const resp = await axios.post(`${META_API}/${igUserId}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken,
      }, { timeout: 30000 });
      console.log(`[publisher] IG container ${containerId} published on attempt ${attempt + 1}: ${resp.data.id}`);
      return resp.data.id;
    } catch (err) {
      const apiErr = err.response?.data?.error;
      // Code 9007 / subcode 2207027 = "Media ID is not available" (still processing).
      const stillProcessing =
        apiErr?.code === 9007 ||
        apiErr?.error_subcode === 2207027 ||
        (apiErr?.message || '').toLowerCase().includes('not available');
      if (stillProcessing) {
        console.log(`[publisher] IG container ${containerId} not ready (attempt ${attempt + 1}/30): ${apiErr.message}`);
        continue;
      }
      // Real error — surface it
      throw err;
    }
  }
  throw new Error('Instagram media processing timed out');
}

/**
 * Ensure an image meets Instagram aspect ratio requirements (4:5 to 1.91:1).
 * If outside range, crop to the nearest valid ratio. Returns the original path
 * if already valid, or a temporary file path with the cropped image.
 */
async function ensureInstagramAspectRatio(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    const { width, height } = metadata;
    if (!width || !height) return filePath;

    const ratio = width / height;
    const MIN_RATIO = 4 / 5;   // 0.8 (portrait)
    const MAX_RATIO = 1.91;     // landscape

    if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) return filePath; // already valid

    let cropW = width;
    let cropH = height;

    if (ratio < MIN_RATIO) {
      // Too tall — crop height to 4:5
      cropH = Math.round(width / MIN_RATIO);
    } else {
      // Too wide — crop width to 1.91:1
      cropW = Math.round(height * MAX_RATIO);
    }

    const left = Math.round((width - cropW) / 2);
    const top = Math.round((height - cropH) / 2);

    const tmpPath = filePath.replace(/(\.\w+)$/, '_igcrop$1');
    await sharp(filePath)
      .extract({ left, top, width: cropW, height: cropH })
      .jpeg({ quality: 92 })
      .toFile(tmpPath);

    console.log(`[publisher] Auto-cropped for IG: ${width}x${height} (${ratio.toFixed(2)}) → ${cropW}x${cropH}`);
    return tmpPath;
  } catch (err) {
    console.error('[publisher] IG aspect ratio crop failed, using original:', err.message);
    return filePath;
  }
}

async function publishToInstagram({ igUserId, accessToken, caption, mediaFiles, videoFile, fbPageId, fbImageUrls }) {
  if (!igUserId || !accessToken) throw new Error('Instagram credentials not configured');

  return withRetry(async () => {
    // Video post — publish as Instagram Reel using resumable upload
    if (videoFile) {
      const filePath = path.join(UPLOADS_DIR, videoFile);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Video file not found: ${videoFile}`);
      }
      const fileSize = fs.statSync(filePath).size;
      console.log(`[publisher] Publishing Instagram Reel: ${videoFile} (${fileSize} bytes)`);

      // Step 1: Create container for Reel with resumable upload
      const createResp = await axios.post(`${META_API}/${igUserId}/media`, {
        media_type: 'REELS',
        upload_type: 'resumable',
        caption,
        access_token: accessToken,
      });
      const containerId = createResp.data.id;
      const uploadUrl = createResp.data.uri;

      // Step 2: Upload video binary
      const videoBuffer = fs.readFileSync(filePath);
      await axios.post(uploadUrl, videoBuffer, {
        headers: {
          'Authorization': `OAuth ${accessToken}`,
          'offset': '0',
          'file_size': String(fileSize),
          'Content-Type': 'application/octet-stream',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      });

      // Step 3 + 4: Publish with retry while still processing.
      const reelId = await publishIgContainer(igUserId, containerId, accessToken);
      return { postId: reelId };
    }

    if (!mediaFiles || mediaFiles.length === 0) {
      throw new Error('Instagram requires at least one image or video');
    }

    if (mediaFiles.length === 1) {
      // Reuse Facebook CDN URL if available, otherwise upload with aspect ratio fix
      let imageUrl;
      if (fbImageUrls && fbImageUrls[0]) {
        imageUrl = fbImageUrls[0];
      } else {
        const originalPath = path.join(UPLOADS_DIR, mediaFiles[0]);
        const croppedPath = await ensureInstagramAspectRatio(originalPath);
        imageUrl = await getPublicImageUrl(fbPageId, accessToken, croppedPath);
        if (croppedPath !== originalPath) try { fs.unlinkSync(croppedPath); } catch (_) {}
      }

      console.log(`[publisher] Creating IG single-image container...`);
      const createResp = await axios.post(`${META_API}/${igUserId}/media`, {
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      }, { timeout: 30000 });

      console.log(`[publisher] IG container created: ${createResp.data.id}, publishing...`);
      const mediaId = await publishIgContainer(igUserId, createResp.data.id, accessToken);
      return { postId: mediaId };
    }

    // Carousel - reuse Facebook CDN URLs if available, otherwise upload temporarily
    let imageUrls;
    if (fbImageUrls && fbImageUrls.length >= mediaFiles.length) {
      imageUrls = fbImageUrls;
    } else {
      imageUrls = await Promise.all(mediaFiles.slice(0, 10).map(async (file) => {
        const originalPath = path.join(UPLOADS_DIR, file);
        const croppedPath = await ensureInstagramAspectRatio(originalPath);
        const url = await getPublicImageUrl(fbPageId, accessToken, croppedPath);
        if (croppedPath !== originalPath) try { fs.unlinkSync(croppedPath); } catch (_) {}
        return url;
      }));
    }

    // Create carousel items sequentially — Meta API rejects concurrent container creation
    const childIds = [];
    for (const imageUrl of imageUrls) {
      const resp = await axios.post(`${META_API}/${igUserId}/media`, {
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: accessToken,
      }, { timeout: 30000 });
      childIds.push(resp.data.id);
    }

    // Small wait so each child container is processable before being attached.
    // (We don't poll status — see publishIgContainer for why.)
    await new Promise(r => setTimeout(r, 10000));

    const carouselResp = await axios.post(`${META_API}/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: accessToken,
    }, { timeout: 30000 });

    const carouselId = await publishIgContainer(igUserId, carouselResp.data.id, accessToken);
    return { postId: carouselId };
  });
}

async function getGoogleAccessToken(refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error('Failed to get Google access token from refresh token');
  return token;
}

async function publishToGoogle({ accessToken, locationId, caption, mediaFiles, googlePostType, googleTitle, googleStartDate, googleStartTime, googleEndDate, googleEndTime, googleCouponCode, googleRedeemUrl, googleTerms, googleCtaType, googleCtaUrl }) {
  if (!accessToken || !locationId) throw new Error('Google Business credentials not configured');

  const token = await getGoogleAccessToken(accessToken);
  const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
  const headers = { Authorization: `Bearer ${token}` };
  const hasCaption = caption && caption.trim().length > 0;
  const hasMedia = mediaFiles && mediaFiles.length > 0;
  const postType = googlePostType || 'STANDARD';

  // EVENT or OFFER posts — require title and dates
  if (postType === 'EVENT' || postType === 'OFFER') {
    if (!googleTitle) throw new Error(`Title is required for ${postType} posts`);
    if (!googleStartDate || !googleEndDate) throw new Error(`Start and end dates are required for ${postType} posts`);

    return withRetry(async () => {
      const startParts = googleStartDate.split('-'); // YYYY-MM-DD
      const endParts = googleEndDate.split('-');
      const startTimeParts = googleStartTime ? googleStartTime.split(':') : ['9', '0'];
      const endTimeParts = googleEndTime ? googleEndTime.split(':') : ['17', '0'];

      const body = {
        languageCode: 'en',
        topicType: postType,
        event: {
          title: googleTitle,
          schedule: {
            startDate: { year: Number(startParts[0]), month: Number(startParts[1]), day: Number(startParts[2]) },
            startTime: { hours: Number(startTimeParts[0]), minutes: Number(startTimeParts[1]), seconds: 0, nanos: 0 },
            endDate: { year: Number(endParts[0]), month: Number(endParts[1]), day: Number(endParts[2]) },
            endTime: { hours: Number(endTimeParts[0]), minutes: Number(endTimeParts[1]), seconds: 0, nanos: 0 },
          },
        },
      };

      if (hasCaption) body.summary = caption;

      if (hasMedia) {
        body.media = {
          mediaFormat: 'PHOTO',
          sourceUrl: `${baseUrl}/uploads/${mediaFiles[0]}`,
        };
      }

      // Add offer-specific fields
      if (postType === 'OFFER') {
        body.offer = {};
        if (googleCouponCode) body.offer.couponCode = googleCouponCode;
        if (googleRedeemUrl) body.offer.redeemOnlineUrl = googleRedeemUrl;
        if (googleTerms) body.offer.termsConditions = googleTerms;
      }

      // Add Call to Action button
      if (googleCtaType) {
        body.callToAction = { actionType: googleCtaType };
        if (googleCtaType !== 'CALL' && googleCtaUrl) {
          body.callToAction.url = googleCtaUrl;
        }
      }

      console.log(`[google] Creating ${postType} post for`, locationId);
      const resp = await axios.post(
        `${GOOGLE_API}/${locationId}/localPosts`,
        body,
        { headers }
      );
      console.log(`[google] ${postType} post created:`, resp.data.name);
      return { postId: resp.data.name };
    });
  }

  // STANDARD post — existing behavior
  if (hasCaption) {
    return withRetry(async () => {
      const body = {
        languageCode: 'en',
        summary: caption,
        topicType: 'STANDARD',
      };
      if (hasMedia) {
        body.media = {
          mediaFormat: 'PHOTO',
          sourceUrl: `${baseUrl}/uploads/${mediaFiles[0]}`,
        };
      }

      // Add Call to Action button for standard posts too
      if (googleCtaType) {
        body.callToAction = { actionType: googleCtaType };
        if (googleCtaType !== 'CALL' && googleCtaUrl) {
          body.callToAction.url = googleCtaUrl;
        }
      }

      console.log('[google] Creating local post for', locationId);
      const resp = await axios.post(
        `${GOOGLE_API}/${locationId}/localPosts`,
        body,
        { headers }
      );
      console.log('[google] Local post created:', resp.data.name);
      return { postId: resp.data.name };
    });
  }

  // If no caption but has photos → upload to business photos
  if (hasMedia) {
    const postIds = [];
    for (const file of mediaFiles) {
      await withRetry(async () => {
        const body = {
          mediaFormat: 'PHOTO',
          locationAssociation: { category: 'ADDITIONAL' },
          sourceUrl: `${baseUrl}/uploads/${file}`,
        };
        console.log('[google] Uploading photo for', locationId, ':', file);
        const resp = await axios.post(
          `${GOOGLE_API}/${locationId}/media`,
          body,
          { headers }
        );
        console.log('[google] Photo uploaded:', resp.data.name);
        postIds.push(resp.data.name);
      });
    }
    return { postId: postIds.join(',') };
  }

  throw new Error('Nothing to publish — no caption or media provided');
}

module.exports = { publishToFacebook, publishToInstagram, publishToGoogle };
