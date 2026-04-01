/**
 * Maps US zip code prefixes (first 3 digits) to IANA timezones.
 * Covers all US states. Falls back to America/New_York if no match.
 */

// 3-digit zip prefix ranges → IANA timezone
// Source: USPS zip code prefix assignments by state
const ZIP_RANGES = [
  // Eastern Time
  { min: 0, max: 99, tz: 'America/New_York' },       // MA, CT, ME, NH, NJ, PR, RI, VT
  { min: 100, max: 149, tz: 'America/New_York' },     // NY
  { min: 150, max: 196, tz: 'America/New_York' },     // PA
  { min: 200, max: 219, tz: 'America/New_York' },     // DC, MD, VA
  { min: 220, max: 246, tz: 'America/New_York' },     // VA, WV
  { min: 247, max: 268, tz: 'America/New_York' },     // WV, NC
  { min: 270, max: 289, tz: 'America/New_York' },     // NC
  { min: 290, max: 299, tz: 'America/New_York' },     // SC
  { min: 300, max: 319, tz: 'America/New_York' },     // GA
  { min: 320, max: 349, tz: 'America/New_York' },     // FL
  // Central Time
  { min: 350, max: 369, tz: 'America/Chicago' },      // AL
  { min: 370, max: 385, tz: 'America/Chicago' },      // TN
  { min: 386, max: 397, tz: 'America/Chicago' },      // MS
  { min: 400, max: 427, tz: 'America/New_York' },     // KY (mostly Eastern)
  { min: 430, max: 458, tz: 'America/New_York' },     // OH
  { min: 460, max: 479, tz: 'America/New_York' },     // IN (mostly Eastern)
  { min: 480, max: 499, tz: 'America/New_York' },     // MI
  { min: 500, max: 528, tz: 'America/Chicago' },      // IA
  { min: 530, max: 549, tz: 'America/Chicago' },      // WI
  { min: 550, max: 567, tz: 'America/Chicago' },      // MN
  { min: 570, max: 577, tz: 'America/Chicago' },      // SD
  { min: 580, max: 588, tz: 'America/Chicago' },      // ND
  { min: 590, max: 599, tz: 'America/Denver' },       // MT
  { min: 600, max: 629, tz: 'America/Chicago' },      // IL
  { min: 630, max: 658, tz: 'America/Chicago' },      // MO
  { min: 660, max: 679, tz: 'America/Chicago' },      // KS
  { min: 680, max: 693, tz: 'America/Chicago' },      // NE
  { min: 700, max: 714, tz: 'America/Chicago' },      // LA
  { min: 716, max: 729, tz: 'America/Chicago' },      // AR
  { min: 730, max: 749, tz: 'America/Chicago' },      // OK
  { min: 750, max: 799, tz: 'America/Chicago' },      // TX
  // Mountain Time
  { min: 800, max: 816, tz: 'America/Denver' },       // CO
  { min: 820, max: 831, tz: 'America/Denver' },       // WY
  { min: 832, max: 838, tz: 'America/Denver' },       // ID (mostly Mountain)
  { min: 840, max: 847, tz: 'America/Denver' },       // UT
  { min: 850, max: 865, tz: 'America/Phoenix' },      // AZ (no DST)
  { min: 870, max: 884, tz: 'America/Denver' },       // NM
  { min: 885, max: 885, tz: 'America/Denver' },       // TX (west)
  { min: 889, max: 898, tz: 'America/Los_Angeles' },  // NV
  // Pacific Time
  { min: 900, max: 961, tz: 'America/Los_Angeles' },  // CA
  { min: 970, max: 979, tz: 'America/Los_Angeles' },  // OR
  { min: 980, max: 994, tz: 'America/Los_Angeles' },  // WA
  // Alaska & Hawaii
  { min: 995, max: 999, tz: 'America/Anchorage' },    // AK
  { min: 967, max: 968, tz: 'Pacific/Honolulu' },     // HI
];

// Hawaii and Alaska overrides
const STATE_TZ_OVERRIDES = {
  HI: 'Pacific/Honolulu',
  AK: 'America/Anchorage',
};

/**
 * Extract a 5-digit zip code from an address string.
 */
function extractZip(address) {
  if (!address) return null;
  const match = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

/**
 * Extract state abbreviation from address string.
 */
function extractState(address) {
  if (!address) return null;
  // Match 2-letter state code before zip or at end
  const match = address.match(/\b([A-Z]{2})\s+\d{5}/);
  return match ? match[1] : null;
}

/**
 * Get IANA timezone from a US zip code string.
 * Returns null if zip is not recognized.
 */
function timezoneFromZip(zip) {
  if (!zip || zip.length < 3) return null;
  const prefix = parseInt(zip.substring(0, 3), 10);
  if (isNaN(prefix)) return null;

  for (const range of ZIP_RANGES) {
    if (prefix >= range.min && prefix <= range.max) {
      return range.tz;
    }
  }
  return null;
}

/**
 * Get IANA timezone from a merchant address string.
 * Tries zip code first, then state abbreviation, falls back to null.
 */
function timezoneFromAddress(address) {
  if (!address) return null;

  // Check for state-level overrides (HI, AK)
  const state = extractState(address);
  if (state && STATE_TZ_OVERRIDES[state]) {
    return STATE_TZ_OVERRIDES[state];
  }

  const zip = extractZip(address);
  if (zip) {
    return timezoneFromZip(zip);
  }

  return null;
}

/**
 * Friendly timezone label for display.
 */
function timezoneLabel(tz) {
  const labels = {
    'America/New_York': 'Eastern',
    'America/Chicago': 'Central',
    'America/Denver': 'Mountain',
    'America/Phoenix': 'Arizona',
    'America/Los_Angeles': 'Pacific',
    'America/Anchorage': 'Alaska',
    'Pacific/Honolulu': 'Hawaii',
  };
  return labels[tz] || tz;
}

module.exports = { timezoneFromAddress, timezoneFromZip, extractZip, timezoneLabel };
