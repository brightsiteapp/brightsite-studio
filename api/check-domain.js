const ALLOWED_ORIGINS = ['https://brightsite.app'];
import { quoteDomainInGbp } from './lib/domain-pricing.js';

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
    const quote = await quoteDomainInGbp(clean);
    return res.status(200).json({
      domain: quote.domain,
      available: true,
      pricePence: quote.amountPence,
      priceLabel: `£${(quote.amountPence / 100).toFixed(2)}/yr`,
      cloudflarePrice: { amount: quote.registrationCost, currency: quote.currency },
    });
  } catch (err) {
    const unavailable = /no longer available|cannot be registered/i.test(err.message);
    return res.status(unavailable ? 200 : 503).json({ domain: clean, available: false, error: err.message });
  }
}
