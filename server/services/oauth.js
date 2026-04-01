const axios = require('axios');
const { google } = require('googleapis');
const { getDb } = require('./db');

const META_AUTH_URL = 'https://www.facebook.com/v21.0/dialog/oauth';
const META_TOKEN_URL = 'https://graph.facebook.com/v21.0/oauth/access_token';
const META_API = 'https://graph.facebook.com/v21.0';

function updateMerchant(mid, updates) {
  const db = getDb();
  const fieldMap = {
    fbPageId: 'fb_page_id', fbToken: 'fb_token', fbPageName: 'fb_page_name',
    fbTokenCreatedAt: 'fb_token_created_at',
    igUserId: 'ig_user_id', igToken: 'ig_token', igUsername: 'ig_username',
    googleToken: 'google_token', googleLocationId: 'google_location_id', googleLocationName: 'google_location_name',
    googleTokenCreatedAt: 'google_token_created_at',
  };

  const fields = [];
  const values = [];
  for (const [key, col] of Object.entries(fieldMap)) {
    if (updates[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(updates[key]);
    }
  }
  if (fields.length > 0) {
    fields.push("updated_at = datetime('now')");
    values.push(mid);
    db.prepare(`UPDATE merchants SET ${fields.join(', ')} WHERE mid = ?`).run(...values);
  }
}

function getMetaAuthorizeUrl(mid) {
  const redirectUri = `${process.env.BASE_URL || 'http://localhost:3001'}/api/oauth/meta/callback`;
  const params = new URLSearchParams({
    client_id: process.env.META_APP_ID,
    redirect_uri: redirectUri,
    state: mid,
    response_type: 'code',
    config_id: process.env.META_CONFIG_ID,
    override_default_response_type: true,
  });
  return `${META_AUTH_URL}?${params}`;
}

async function handleMetaCallback(code, mid) {
  const redirectUri = `${process.env.BASE_URL || 'http://localhost:3001'}/api/oauth/meta/callback`;

  // Exchange code for short-lived user token
  console.log('[oauth] Step 1: Exchanging code for token...');
  let tokenResp;
  try {
    tokenResp = await axios.get(META_TOKEN_URL, {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        redirect_uri: redirectUri,
        code,
      },
    });
  } catch (err) {
    console.error('[oauth] Step 1 FAILED - Token exchange error:', err.response?.data || err.message);
    throw err;
  }
  const shortToken = tokenResp.data.access_token;
  console.log('[oauth] Step 1 OK. Exchanging for long-lived token...');

  // Exchange for long-lived user token (60 days)
  let longResp;
  try {
    longResp = await axios.get(`${META_API}/oauth/access_token`, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });
  } catch (err) {
    console.error('[oauth] Step 2 FAILED - Long-lived token error:', err.response?.data || err.message);
    throw err;
  }
  const longToken = longResp.data.access_token;
  console.log('[oauth] Step 2 OK. Fetching pages...');

  // Step 3a: Get user's businesses
  console.log('[oauth] Step 3: Fetching businesses...');
  let businesses = [];
  try {
    const bizResp = await axios.get(`${META_API}/me/businesses`, {
      params: { access_token: longToken, fields: 'id,name', limit: 10 },
    });
    businesses = bizResp.data.data || [];
    console.log('[oauth] Found businesses:', businesses.map(b => `${b.name} (${b.id})`).join(', '));
  } catch (err) {
    console.error('[oauth] Businesses fetch error:', err.response?.data || err.message);
  }

  // Step 3b: Fetch pages from business portfolios (owned + client pages)
  const pages = [];
  const seenIds = new Set();

  for (const biz of businesses) {
    // Fetch owned pages
    for (const edge of ['owned_pages', 'client_pages']) {
      let nextUrl = `${META_API}/${biz.id}/${edge}?access_token=${encodeURIComponent(longToken)}&fields=id,name,access_token,instagram_business_account&limit=25`;
      try {
        while (nextUrl) {
          const resp = await axios.get(nextUrl);
          for (const p of (resp.data.data || [])) {
            if (!seenIds.has(p.id)) {
              seenIds.add(p.id);
              pages.push({ ...p, business: biz.name });
            }
          }
          console.log(`[oauth] ${biz.name}/${edge}: fetched batch (total unique: ${pages.length})`);
          nextUrl = resp.data.paging?.next || null;
        }
      } catch (err) {
        console.error(`[oauth] ${biz.name}/${edge} error:`, err.response?.data?.error?.message || err.message);
      }
    }
  }

  // Also fetch personal /me/accounts as fallback
  let nextUrl = `${META_API}/me/accounts?access_token=${encodeURIComponent(longToken)}&fields=id,name,access_token,instagram_business_account&limit=25`;
  try {
    while (nextUrl) {
      const resp = await axios.get(nextUrl);
      for (const p of (resp.data.data || [])) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          pages.push(p);
        }
      }
      nextUrl = resp.data.paging?.next || null;
    }
  } catch (err) {
    console.error('[oauth] /me/accounts error:', err.response?.data?.error?.message || err.message);
  }

  console.log('[oauth] Step 3 OK. Found', pages.length, 'total unique pages');
  if (pages.length === 0) {
    throw new Error('No Facebook Pages found. Make sure your account has access to pages through a Business Portfolio.');
  }

  // Return pages list and user token so frontend can let user pick
  return {
    pages: pages.map(p => ({
      id: p.id,
      name: p.name,
      accessToken: p.access_token,
      business: p.business || null,
      hasInstagram: !!p.instagram_business_account,
      igUserId: p.instagram_business_account?.id || null,
    })),
    userToken: longToken,
    mid,
  };
}

// Select a specific page after OAuth (called from frontend page picker)
async function selectMetaPage(mid, pageId, pageAccessToken, pageName, userToken) {
  console.log(`[oauth] selectMetaPage: pageId=${pageId}, hasPageToken=${!!pageAccessToken}, hasUserToken=${!!userToken}, name=${pageName}`);

  // Use page token if available, otherwise fall back to user token
  const token = pageAccessToken || userToken;

  const updates = {
    fbPageId: pageId,
    fbToken: token,
    fbPageName: pageName || '',
    fbTokenCreatedAt: new Date().toISOString(),
  };

  // Check for linked Instagram Business account using both tokens
  const tokensToTry = [pageAccessToken, userToken].filter(Boolean);
  for (const tryToken of tokensToTry) {
    try {
      console.log(`[oauth] Checking Instagram for page ${pageId} with ${tryToken === pageAccessToken ? 'page' : 'user'} token...`);
      const igResp = await axios.get(`${META_API}/${pageId}`, {
        params: { fields: 'instagram_business_account', access_token: tryToken },
      });
      console.log('[oauth] IG response:', JSON.stringify(igResp.data));
      if (igResp.data.instagram_business_account) {
        const igId = igResp.data.instagram_business_account.id;
        updates.igUserId = igId;
        updates.igToken = token;
        console.log(`[oauth] Found Instagram account: ${igId}`);

        // Fetch IG username
        try {
          const igUserResp = await axios.get(`${META_API}/${igId}`, {
            params: { fields: 'username', access_token: tryToken },
          });
          updates.igUsername = igUserResp.data.username || '';
          console.log(`[oauth] Instagram username: ${updates.igUsername}`);
        } catch (err) {
          console.error('[oauth] Failed to fetch IG username:', err.response?.data || err.message);
        }
        break; // Found Instagram, no need to try other token
      } else {
        console.log(`[oauth] No Instagram found with ${tryToken === pageAccessToken ? 'page' : 'user'} token`);
      }
    } catch (err) {
      console.error(`[oauth] Instagram check failed with ${tryToken === pageAccessToken ? 'page' : 'user'} token:`, err.response?.data || err.message);
    }
  }

  updateMerchant(mid, updates);
  return updates;
}

// List all Facebook pages for a user token (used by page-selection UI)
async function listMetaPages(userToken) {
  const pagesResp = await axios.get(`${META_API}/me/accounts`, {
    params: {
      access_token: userToken,
      fields: 'id,name',
      limit: 25,
    },
  });
  return (pagesResp.data.data || []).map(p => ({
    id: p.id,
    name: p.name,
  }));
}

// Test Facebook connection
async function testFacebookConnection(pageId, accessToken) {
  const resp = await axios.get(`${META_API}/${pageId}`, {
    params: { fields: 'id,name,fan_count', access_token: accessToken },
  });
  return {
    connected: true,
    details: `Connected to "${resp.data.name}" (${resp.data.fan_count || 0} followers)`,
    pageName: resp.data.name,
  };
}

// Test Instagram connection
async function testInstagramConnection(igUserId, accessToken) {
  const resp = await axios.get(`${META_API}/${igUserId}`, {
    params: { fields: 'id,username,followers_count,media_count', access_token: accessToken },
  });
  return {
    connected: true,
    details: `Connected to @${resp.data.username} (${resp.data.followers_count || 0} followers, ${resp.data.media_count || 0} posts)`,
    username: resp.data.username,
  };
}

// Google OAuth
function getGoogleAuthorizeUrl(mid) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL || 'http://localhost:3001'}/api/oauth/google/callback`
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/business.manage',
    ],
    state: mid,
    prompt: 'consent',
  });
}

async function handleGoogleCallback(code, mid) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.BASE_URL || 'http://localhost:3001'}/api/oauth/google/callback`
  );

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const refreshToken = tokens.refresh_token || tokens.access_token;

  // Fetch all locations so the user can pick
  const locations = await listGoogleLocations(oauth2Client);

  // If only one location, auto-select it
  if (locations.length === 1) {
    const loc = locations[0];
    const updates = {
      googleToken: refreshToken,
      googleLocationId: loc.name,
      googleLocationName: loc.title || '',
      googleTokenCreatedAt: new Date().toISOString(),
    };
    updateMerchant(mid, updates);
    return { autoSelected: true, updates };
  }

  // Multiple (or zero) locations — return data for picker
  return { autoSelected: false, locations, refreshToken, mid };
}

// Fetch all Google Business locations across all accounts
async function listGoogleLocations(authClient) {
  const locations = [];
  const seenLocations = new Set();
  try {
    // Get access token for REST calls
    const { token } = await authClient.getAccessToken();

    // Step 1: List accounts via Account Management API
    const accountsResp = await axios.get('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const accountList = accountsResp.data.accounts || [];
    console.log('[oauth] Google accounts found:', accountList.map(a => a.accountName || a.name).join(', '));

    // Step 2: List locations for each account via Business Information API (with pagination)
    for (const account of accountList) {
      try {
        let nextPageToken = null;
        do {
          const params = { readMask: 'name,title,storefrontAddress', pageSize: 100 };
          if (nextPageToken) params.pageToken = nextPageToken;
          const locsResp = await axios.get(
            `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params,
            }
          );
          for (const loc of (locsResp.data.locations || [])) {
            const fullName = `${account.name}/${loc.name}`;
            if (seenLocations.has(loc.name)) continue;
            seenLocations.add(loc.name);
            const addr = loc.storefrontAddress;
            const addressStr = addr
              ? [addr.addressLines?.join(', '), addr.locality, addr.administrativeArea, addr.postalCode]
                  .filter(Boolean).join(', ')
              : '';
            locations.push({
              name: fullName,
              title: loc.title || '',
              address: addressStr,
              accountName: account.accountName || account.name,
            });
          }
          nextPageToken = locsResp.data.nextPageToken || null;
        } while (nextPageToken);
      } catch (err) {
        console.error(`[oauth] Failed to list locations for ${account.name}:`, err.response?.data?.error?.message || err.message);
      }
    }
  } catch (err) {
    console.error('[oauth] Google accounts list error:', err.response?.data?.error?.message || err.message);
  }
  return locations;
}

// Select a Google location for a merchant
function selectGoogleLocation(mid, refreshToken, locationName, locationTitle) {
  const updates = {
    googleToken: refreshToken,
    googleLocationId: locationName,
    googleLocationName: locationTitle || '',
    googleTokenCreatedAt: new Date().toISOString(),
  };
  updateMerchant(mid, updates);
  return updates;
}

// Test Google Business connection
async function testGoogleConnection(refreshToken, locationId) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  // Just test that we can get an access token
  const { token } = await oauth2Client.getAccessToken();
  if (!token) throw new Error('Failed to get access token from refresh token');

  let details = 'Google OAuth connection is valid';
  if (locationId) {
    details += ` (Location: ${locationId})`;
  }

  return { connected: true, details };
}

module.exports = {
  getMetaAuthorizeUrl,
  handleMetaCallback,
  selectMetaPage,
  listMetaPages,
  testFacebookConnection,
  testInstagramConnection,
  getGoogleAuthorizeUrl,
  handleGoogleCallback,
  selectGoogleLocation,
  testGoogleConnection,
};
