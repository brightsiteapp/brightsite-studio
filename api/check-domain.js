const ALLOWED_ORIGINS = ['https://brightsite.app'];
const CF_MARKUP_PENCE = 0;

// Authoritative RDAP servers per TLD — bypasses rdap.org which rate-limits server requests
const RDAP_SERVERS = {
  'com':   'https://rdap.verisign.com/com/v1/domain/',
  'net':   'https://rdap.verisign.com/net/v1/domain/',
  'org':   'https://rdap.publicinterestregistry.org/rdap/domain/',
  'uk':    'https://rdap.nominet.uk/uk/domain/',
  'co.uk': 'https://rdap.nominet.uk/uk/domain/',
  'io':    'https://rdap.nic.io/domain/',
  'app':   'https://rdap.nic.app/domain/',
  'co':    'https://rdap.nic.co/domain/',
};

function getRdapUrl(domain) {
  const parts = domain.split('.');
  if (parts.length >= 3) {
    const two = parts.slice(-2).join('.');
    if (RDAP_SERVERS[two]) return RDAP_SERVERS[two] + encodeURIComponent(domain);
  }
  const tld = parts[parts.length - 1];
  if (RDAP_SERVERS[tld]) return RDAP_SERVERS[tld] + encodeURIComponent(domain);
  // fallback to rdap.org for unsupported TLDs
  return 'https://rdap.org/domain/' + encodeURIComponent(domain);
}

async function getCloudflareDomainPrice(domain) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/${encodeURIComponent(domain)}/available`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.result?.price) return null;
    const EXCHANGE_RATE = 0.79; // USD → GBP (update periodically)
    const costPence = Math.round(json.result.price * EXCHANGE_RATE * 100);
    return costPence + CF_MARKUP_PENCE;
  } catch (err) {
    console.warn('CF price lookup failed:', err.message);
    return null;
  }
}

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
    const rdapUrl = getRdapUrl(clean);
    const rdapRes = await fetch(rdapUrl, {
      headers: { Accept: 'application/rdap+json' },
      signal: AbortSignal.timeout(6000),
    });

    if (rdapRes.ok) {
      return res.status(200).json({ domain: clean, available: false });
    }

    if (rdapRes.status === 404) {
      // Domain is available — fetch real price from Cloudflare
      const pricePence = await getCloudflareDomainPrice(clean);
      return res.status(200).json({
        domain: clean,
        available: true,
        pricePence: pricePence ?? null,
        // human-readable fallback label if Cloudflare price unavailable
        priceLabel: pricePence ? `£${(pricePence / 100).toFixed(0)}/yr` : null,
      });
    }

    return res.status(200).json({ domain: clean, available: false, rdapStatus: rdapRes.status });
  } catch (err) {
    console.error('Domain check error:', err.message);
    return res.status(500).json({ error: 'Domain check failed', detail: err.message });
  }
}
