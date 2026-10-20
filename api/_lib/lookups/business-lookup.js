const PLACES_ROOT = 'https://places.googleapis.com/v1';
const DAILY_LIMIT = 25;
const MONTHLY_LIMIT = 850;

const DETAILS_FIELD_MASK = [
  'id', 'displayName', 'formattedAddress', 'addressComponents', 'location',
  'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri', 'googleMapsUri',
  'primaryTypeDisplayName', 'primaryType', 'types', 'businessStatus',
  'rating', 'userRatingCount', 'regularOpeningHours', 'priceLevel', 'photos', 'reviews',
  'delivery', 'dineIn', 'takeout', 'reservable', 'servesBreakfast', 'servesLunch', 'servesDinner'
].join(',');

const SEARCH_FIELD_MASK = [
  'places.id', 'places.displayName', 'places.formattedAddress',
  'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.primaryTypeDisplayName',
  'places.rating', 'places.userRatingCount', 'places.regularOpeningHours',
  'places.reviews'
].join(',');

function normalise(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cacheKey(name, location) {
  return `${normalise(name)}|${normalise(location)}`.slice(0, 240);
}

function supabaseHeaders(key) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function getCachedMatch(baseUrl, key, lookupKey) {
  const result = await fetch(`${baseUrl}/rest/v1/rpc/get_business_lookup_cache`, {
    method: 'POST', headers: supabaseHeaders(key), body: JSON.stringify({ requested_key: lookupKey })
  });
  if (!result.ok) throw new Error(`Cache read failed: ${result.status}`);
  return result.json();
}

async function claimLookup(baseUrl, key) {
  const result = await fetch(`${baseUrl}/rest/v1/rpc/claim_google_lookup`, {
    method: 'POST', headers: supabaseHeaders(key), body: '{}'
  });
  if (!result.ok) throw new Error(`Quota check failed: ${result.status}`);
  return result.json();
}

async function storeCachedMatch(baseUrl, key, lookupKey, payload) {
  const result = await fetch(`${baseUrl}/rest/v1/rpc/store_business_lookup_cache`, {
    method: 'POST',
    headers: supabaseHeaders(key),
    body: JSON.stringify({ requested_key: lookupKey, requested_payload: payload })
  });
  if (!result.ok) throw new Error(`Cache write failed: ${result.status}`);
}

function tokenScore(expected, actual) {
  const wanted = new Set(normalise(expected).split(' ').filter(Boolean));
  const found = new Set(normalise(actual).split(' ').filter(Boolean));
  if (!wanted.size || !found.size) return 0;
  let matches = 0;
  wanted.forEach(token => { if (found.has(token)) matches += 1; });
  return matches / wanted.size;
}

function addressPart(components, type) {
  const match = (components || []).find(c => (c.types || []).includes(type));
  return match?.longText || '';
}

// Photos are never linked to directly with our API key attached — the photo
// name is resolved through /api/place-photo, which fetches the actual CDN
// URL server-side and redirects the browser there.
function mapPhoto(photo, index) {
  if (!photo?.name) return null;
  return {
    id: `google:${photo.name}`,
    url: `/api/place-photo?name=${encodeURIComponent(photo.name)}&w=1600`,
    width: photo.widthPx || 1600,
    height: photo.heightPx || 900,
    createdAt: '',
    attribution: (photo.authorAttributions || [])[0]?.displayName || 'Google',
    source: 'google',
    rank: index
  };
}

function mapPlace(place) {
  const city = addressPart(place.addressComponents, 'postal_town') || addressPart(place.addressComponents, 'locality');
  const postcode = addressPart(place.addressComponents, 'postal_code');
  return {
    placeId: place.id,
    name: place.displayName?.text || '',
    address: place.formattedAddress || '',
    city,
    postcode,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    phone: place.nationalPhoneNumber || place.internationalPhoneNumber || '',
    website: place.websiteUri || '',
    mapsUrl: place.googleMapsUri || '',
    category: place.primaryTypeDisplayName?.text || '',
    types: place.types || [],
    businessStatus: place.businessStatus || '',
    rating: place.rating || null,
    reviewCount: place.userRatingCount || 0,
    hours: place.regularOpeningHours?.weekdayDescriptions || [],
    openNow: place.regularOpeningHours?.openNow,
    priceLevel: place.priceLevel || null,
    attributes: {
      delivery: place.delivery ?? null,
      dineIn: place.dineIn ?? null,
      takeout: place.takeout ?? null,
      reservable: place.reservable ?? null
    },
    reviews: (place.reviews || []).slice(0, 5).map(review => ({
      text: review.text?.text || review.originalText?.text || '',
      rating: review.rating || 5,
      author: review.authorAttribution?.displayName || 'Google reviewer',
      authorUrl: review.authorAttribution?.uri || '',
      relativeTime: review.relativePublishTimeDescription || ''
    })).filter(review => review.text),
    photos: (place.photos || []).slice(0, 10).map(mapPhoto).filter(Boolean)
  };
}

async function fetchByPlaceId(placeId, key) {
  const response = await fetch(`${PLACES_ROOT}/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': DETAILS_FIELD_MASK
    }
  });
  if (!response.ok) {
    console.error('Place details failed', response.status, await response.text());
    return null;
  }
  return response.json();
}

async function fetchByTextSearch(name, location, key) {
  const response = await fetch(`${PLACES_ROOT}/places:searchText`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': SEARCH_FIELD_MASK
    },
    body: JSON.stringify({ textQuery: `${name}, ${location}`, maxResultCount: 5, languageCode: 'en-GB' })
  });
  if (!response.ok) {
    console.error('Places lookup failed', response.status, await response.text());
    return null;
  }
  const data = await response.json();
  const ranked = (data.places || []).map(place => ({
    place,
    score: tokenScore(name, place.displayName?.text) * 0.75 + tokenScore(location, place.formattedAddress) * 0.25
  })).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return best && best.score >= 0.45 ? best.place : null;
}

export default async function handler(request, response) {
  const origin = request.headers.origin;
  if (origin === 'https://brightsite.app' || origin === 'https://www.brightsite.app') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return response.status(503).json({ error: 'Business lookup is not configured' });
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return response.status(503).json({ error: 'Safe lookup quota is not configured' });

  const placeId = String(request.query.placeId || '').trim().slice(0, 200);
  const name = String(request.query.name || '').trim().slice(0, 120);
  const location = String(request.query.location || '').trim().slice(0, 120);
  if (!placeId && (!name || !location)) {
    return response.status(400).json({ error: 'A placeId, or business name and location, are required' });
  }

  try {
    const lookupKey = placeId ? `place:${placeId}` : cacheKey(name, location);
    const cached = await getCachedMatch(supabaseUrl, supabaseKey, lookupKey);
    if (cached) return response.status(200).json({ match: cached, cached: true });
    const allowed = await claimLookup(supabaseUrl, supabaseKey);
    if (!allowed) return response.status(429).json({ error: 'Free Google lookup allowance reached' });

    const place = placeId ? await fetchByPlaceId(placeId, key) : await fetchByTextSearch(name, location, key);
    if (!place) return response.status(200).json({ match: null });

    const match = mapPlace(place);
    await storeCachedMatch(supabaseUrl, supabaseKey, lookupKey, match);
    response.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    return response.status(200).json({ match });
  } catch (error) {
    console.error('Places lookup error', error);
    return response.status(502).json({ error: 'Business lookup failed' });
  }
}
