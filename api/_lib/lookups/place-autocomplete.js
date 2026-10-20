const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

// Session tokens group an autocomplete session (keystrokes + the details
// fetch that follows) into a single Google billing unit. The frontend
// mints one per search and passes it straight through here.
export default async function handler(request, response) {
  const origin = request.headers.origin;
  if (origin === 'https://brightsite.app' || origin === 'https://www.brightsite.app') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  if (request.method !== 'GET') return response.status(405).json({ error: 'Method not allowed' });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return response.status(503).json({ error: 'Business search is not configured' });

  const input = String(request.query.input || '').trim().slice(0, 160);
  const sessionToken = String(request.query.sessionToken || '').trim().slice(0, 100);
  if (!input || input.length < 2) return response.status(200).json({ suggestions: [] });

  try {
    const body = {
      input,
      includedRegionCodes: ['gb'],
      languageCode: 'en-GB'
    };
    if (sessionToken) body.sessionToken = sessionToken;

    const googleResponse = await fetch(AUTOCOMPLETE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': [
          'suggestions.placePrediction.placeId',
          'suggestions.placePrediction.text',
          'suggestions.placePrediction.structuredFormat'
        ].join(',')
      },
      body: JSON.stringify(body)
    });
    if (!googleResponse.ok) {
      console.error('Autocomplete failed', googleResponse.status, await googleResponse.text());
      return response.status(502).json({ error: 'Business search failed' });
    }

    const data = await googleResponse.json();
    const suggestions = (data.suggestions || [])
      .map(s => s.placePrediction)
      .filter(Boolean)
      .map(prediction => ({
        placeId: prediction.placeId,
        text: prediction.text?.text || '',
        mainText: prediction.structuredFormat?.mainText?.text || '',
        secondaryText: prediction.structuredFormat?.secondaryText?.text || ''
      }));
    return response.status(200).json({ suggestions });
  } catch (error) {
    console.error('Autocomplete error', error);
    return response.status(502).json({ error: 'Business search failed' });
  }
}
