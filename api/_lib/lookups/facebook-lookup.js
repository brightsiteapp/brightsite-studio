const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || 'v23.0';
const GRAPH_ROOT = `https://graph.facebook.com/${GRAPH_VERSION}`;

function normalise(value = '') {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function score(expected, actual) {
  const wanted = new Set(normalise(expected).split(' ').filter(Boolean));
  const found = new Set(normalise(actual).split(' ').filter(Boolean));
  if (!wanted.size || !found.size) return 0;
  return [...wanted].filter(token => found.has(token)).length / wanted.size;
}

function formatLocation(location = {}) {
  return [location.street, location.city, location.zip, location.country]
    .filter(Boolean).join(', ');
}

function formatHours(hours = {}) {
  const days = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];
  return days.map(([key, label]) => {
    const ranges = [];
    for (let index = 1; index <= 2; index += 1) {
      const open = hours[`${key}_${index}_open`];
      const close = hours[`${key}_${index}_close`];
      if (open && close) ranges.push(`${open}–${close}`);
    }
    return ranges.length ? `${label}: ${ranges.join(', ')}` : null;
  }).filter(Boolean);
}

async function graph(path, params, token) {
  const url = new URL(`${GRAPH_ROOT}/${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  url.searchParams.set('access_token', token);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Facebook Graph API returned ${response.status}`);
  return response.json();
}

export default async function handler(request, response) {
  const origin = request.headers.origin;
  if (origin === 'https://brightsite.app' || origin === 'https://www.brightsite.app') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const token = process.env.FACEBOOK_ACCESS_TOKEN;
  if (!token) return response.status(503).json({ error: 'Facebook lookup is not configured' });

  const name = String(request.query.name || '').trim().slice(0, 120);
  const location = String(request.query.location || '').trim().slice(0, 120);
  if (!name || !location) return response.status(400).json({ error: 'Business name and location are required' });

  try {
    const search = await graph('pages/search', {
      q: `${name} ${location}`,
      limit: '5',
      fields: 'id,name,location,phone,website,about,description,category,hours,link,cover,picture.type(large)'
    }, token);
    const ranked = (search.data || []).map(page => ({
      page,
      rank: score(name, page.name) * 0.8 + score(location, formatLocation(page.location)) * 0.2
    })).sort((a, b) => b.rank - a.rank);
    const best = ranked[0];
    if (!best || best.rank < 0.45) return response.status(200).json({ match: null });

    let uploadedPhotos = [];
    try {
      const photoData = await graph(`${best.page.id}/photos`, {
        type: 'uploaded', limit: '12', fields: 'id,created_time,images,picture,name'
      }, token);
      uploadedPhotos = photoData.data || [];
    } catch (error) {
      console.info('Facebook photos unavailable', error.message);
    }

    const page = best.page;
    const photos = uploadedPhotos.map(photo => {
      const largest = [...(photo.images || [])].sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
      return largest ? {
        id: `facebook:${photo.id}`,
        url: largest.source,
        width: largest.width,
        height: largest.height,
        createdAt: photo.created_time || '',
        attribution: page.name,
        source: 'facebook'
      } : null;
    }).filter(Boolean);
    if (page.cover?.source) photos.unshift({
      id: `facebook:cover:${page.id}`, url: page.cover.source,
      width: 1640, height: 624, createdAt: '', attribution: page.name, source: 'facebook'
    });

    response.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=43200');
    return response.status(200).json({ match: {
      source: 'facebook', id: page.id, name: page.name || '',
      address: formatLocation(page.location), phone: page.phone || '',
      website: page.website || '', facebookUrl: page.link || '',
      category: page.category || '', about: page.about || page.description || '',
      hours: formatHours(page.hours), photos
    }});
  } catch (error) {
    console.error('Facebook lookup error', error);
    return response.status(502).json({ error: 'Facebook lookup failed' });
  }
}
