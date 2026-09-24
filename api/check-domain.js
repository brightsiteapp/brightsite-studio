const ALLOWED_ORIGINS = ['https://brightsite.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { domain } = req.query;
  if (!domain) return res.status(400).json({ error: 'Missing domain parameter' });

  const clean = domain.toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

  try {
    const rdapUrl = `https://rdap.org/domain/${encodeURIComponent(clean)}`;
    const rdapRes = await fetch(rdapUrl, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(5000),
    });

    if (rdapRes.status === 404) {
      return res.status(200).json({ domain: clean, available: true });
    }
    if (rdapRes.ok) {
      return res.status(200).json({ domain: clean, available: false });
    }
    // RDAP returned an unexpected status — treat as unavailable to be safe
    return res.status(200).json({ domain: clean, available: false, rdapStatus: rdapRes.status });
  } catch (err) {
    console.error('RDAP check error:', err.message);
    return res.status(500).json({ error: 'Domain check failed', detail: err.message });
  }
}
