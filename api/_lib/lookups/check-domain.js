const ALLOWED_ORIGINS = ['https://brightsite.app'];
import { quoteDomainInGbp } from '../domain-pricing.js';
import { supabaseAdmin } from '../supabase-admin.js';
import { connectAnyDomain } from '../activate.js';

const ACCOUNTS_URL = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const ACCOUNTS_ANON = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';

// Lets a paying customer's dashboard finish connecting their domain as soon as Cloudflare is ready.
async function finishDomain(req, res) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const userRes = await fetch(`${ACCOUNTS_URL}/auth/v1/user`, { headers: { apikey: ACCOUNTS_ANON, Authorization: `Bearer ${token}` } });
  const user = userRes.ok ? await userRes.json() : null;
  if (!user?.id) return res.status(401).json({ error: 'Authentication required' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const slug = String(body.slug || '');
  const supabase = supabaseAdmin();
  const { data: row } = await supabase.from('businesses').select('user_id,data').eq('id', slug).single();
  if (!row || row.user_id !== user.id) return res.status(403).json({ error: 'Not your business' });
  const data = row.data || {};
  const domain = data.customDomain || data.domain;
  if (!data.planActive || !domain) return res.status(200).json({ connected: false, reason: 'no paid domain' });
  if (data.domainConnected) return res.status(200).json({ connected: true, liveUrl: data.liveUrl || '' });

  try {
    const result = await connectAnyDomain(slug, domain, !!data.published);
    if (result.connected) {
      Object.assign(data, { domainConnected: true, domainError: '', ...(result.liveUrl ? { liveUrl: result.liveUrl } : {}) });
      await supabase.from('businesses').update({ data }).eq('id', slug);
    }
    return res.status(200).json({ connected: result.connected, status: result.status, liveUrl: result.liveUrl || '' });
  } catch (err) {
    return res.status(200).json({ connected: false, error: err.message });
  }
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') return finishDomain(req, res);
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
