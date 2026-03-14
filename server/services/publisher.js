const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const FormData = require('form-data');

const META_API = 'https://graph.facebook.com/v21.0';
const GOOGLE_API = 'https://mybusiness.googleapis.com/v4';

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
      const filePath = path.join(__dirname, '..', '..', 'uploads', videoFile);
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
      const filePath = path.join(__dirname, '..', '..', 'uploads', mediaFiles[0]);
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
        const filePath = path.join(__dirname, '..', '..', 'uploads', file);
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
      const filePath = path.join(__dirname, '..', '..', 'uploads', file);

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

  const resp = await axios.post(`${META_API}/${pageId}/photos`, form, {
    headers: form.getHeaders(),
  });

  const photoResp = await axios.get(`${META_API}/${resp.data.id}`, {
    params: { fields: 'images', access_token: accessToken },
  });

  return photoResp.data.images[0].source;
}

// Poll until an Instagram media container is ready to publish
async function waitForIgContainer(containerId, accessToken) {
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const resp = await axios.get(`${META_API}/${containerId}`, {
        params: { fields: 'status_code', access_token: accessToken },
      });
      console.log(`[publisher] IG container ${containerId} status: ${resp.data.status_code}`);
      if (resp.data.status_code === 'FINISHED') return;
      if (resp.data.status_code === 'ERROR') {
        throw new Error('Instagram media processing failed');
      }
    } catch (err) {
      if (err.message === 'Instagram media processing failed') throw err;
    }
  }
  throw new Error('Instagram media processing timed out');
}

async function publishToInstagram({ igUserId, accessToken, caption, mediaFiles, videoFile, fbPageId, fbImageUrls }) {
  if (!igUserId || !accessToken) throw new Error('Instagram credentials not configured');

  return withRetry(async () => {
    // Video post — publish as Instagram Reel using resumable upload
    if (videoFile) {
      const filePath = path.join(__dirname, '..', '..', 'uploads', videoFile);
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

      // Step 3: Poll until video is processed
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        try {
          const statusResp = await axios.get(`${META_API}/${containerId}`, {
            params: { fields: 'status_code', access_token: accessToken },
          });
          console.log(`[publisher] Instagram Reel status: ${statusResp.data.status_code}`);
          if (statusResp.data.status_code === 'FINISHED') break;
          if (statusResp.data.status_code === 'ERROR') {
            throw new Error('Instagram video processing failed');
          }
        } catch (err) {
          if (err.message === 'Instagram video processing failed') throw err;
        }
      }

      // Step 4: Publish
      const publishResp = await axios.post(`${META_API}/${igUserId}/media_publish`, {
        creation_id: containerId,
        access_token: accessToken,
      });
      console.log(`[publisher] Instagram Reel published: ${publishResp.data.id}`);
      return { postId: publishResp.data.id };
    }

    if (!mediaFiles || mediaFiles.length === 0) {
      throw new Error('Instagram requires at least one image or video');
    }

    if (mediaFiles.length === 1) {
      // Reuse Facebook CDN URL if available, otherwise upload temporarily
      const imageUrl = (fbImageUrls && fbImageUrls[0])
        ? fbImageUrls[0]
        : await getPublicImageUrl(fbPageId, accessToken, path.join(__dirname, '..', '..', 'uploads', mediaFiles[0]));

      const createResp = await axios.post(`${META_API}/${igUserId}/media`, {
        image_url: imageUrl,
        caption,
        access_token: accessToken,
      });

      await waitForIgContainer(createResp.data.id, accessToken);

      const publishResp = await axios.post(`${META_API}/${igUserId}/media_publish`, {
        creation_id: createResp.data.id,
        access_token: accessToken,
      });
      return { postId: publishResp.data.id };
    }

    // Carousel - reuse Facebook CDN URLs if available, otherwise upload temporarily
    let imageUrls;
    if (fbImageUrls && fbImageUrls.length >= mediaFiles.length) {
      imageUrls = fbImageUrls;
    } else {
      imageUrls = await Promise.all(mediaFiles.slice(0, 10).map(async (file) => {
        const filePath = path.join(__dirname, '..', '..', 'uploads', file);
        return getPublicImageUrl(fbPageId, accessToken, filePath);
      }));
    }

    // Create carousel items sequentially — Meta API rejects concurrent container creation
    const childIds = [];
    for (const imageUrl of imageUrls) {
      const resp = await axios.post(`${META_API}/${igUserId}/media`, {
        image_url: imageUrl,
        is_carousel_item: true,
        access_token: accessToken,
      });
      childIds.push(resp.data.id);
    }

    // Wait for all carousel items to finish processing
    for (const childId of childIds) {
      await waitForIgContainer(childId, accessToken);
    }

    const carouselResp = await axios.post(`${META_API}/${igUserId}/media`, {
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: accessToken,
    });

    await waitForIgContainer(carouselResp.data.id, accessToken);

    const publishResp = await axios.post(`${META_API}/${igUserId}/media_publish`, {
      creation_id: carouselResp.data.id,
      access_token: accessToken,
    });
    return { postId: publishResp.data.id };
  });
}

async function publishToGoogle({ accessToken, locationId, caption, mediaFiles }) {
  if (!accessToken || !locationId) throw new Error('Google Business credentials not configured');

  return withRetry(async () => {
    const body = {
      languageCode: 'en',
      summary: caption,
      topicType: 'STANDARD',
    };

    if (mediaFiles && mediaFiles.length > 0) {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
      body.media = {
        mediaFormat: 'PHOTO',
        sourceUrl: `${baseUrl}/uploads/${mediaFiles[0]}`,
      };
    }

    const resp = await axios.post(
      `${GOOGLE_API}/${locationId}/localPosts`,
      body,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    return { postId: resp.data.name };
  });
}

module.exports = { publishToFacebook, publishToInstagram, publishToGoogle };
