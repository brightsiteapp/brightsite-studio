const PLACES_ROOT = 'https://places.googleapis.com/v1';

// Resolves a Places photo resource name to its actual CDN image and
// redirects the browser there. The Google Maps API key never reaches the
// client — only the redirect target (a Google-hosted, keyless image URL) does.
export default async function handler(request, response) {
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return response.status(503).json({ error: 'Photo lookup is not configured' });

  const name = String(request.query.name || '').trim();
  // Only accept a real photo resource name, so the server key can't be pointed at other Places endpoints.
  if (!/^places\/[\w-]+\/photos\/[\w-]+$/.test(name)) return response.status(400).json({ error: 'Invalid photo reference' });
  const maxWidthPx = Math.min(Math.max(parseInt(request.query.w, 10) || 1600, 100), 1600);

  try {
    const url = `${PLACES_ROOT}/${name}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
    const mediaResponse = await fetch(url);
    if (!mediaResponse.ok) return response.status(502).json({ error: 'Photo lookup failed' });
    const data = await mediaResponse.json();
    if (!data.photoUri) return response.status(502).json({ error: 'Photo lookup failed' });
    response.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    response.setHeader('Location', data.photoUri);
    return response.status(302).end();
  } catch (error) {
    console.error('Place photo error', error);
    return response.status(502).json({ error: 'Photo lookup failed' });
  }
}
