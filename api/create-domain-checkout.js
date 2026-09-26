import Stripe from 'stripe';

const ALLOWED_ORIGINS = ['https://brightsite.app'];
const CF_MARKUP_PENCE = 0; // at-cost, no markup

async function getCloudflareDomainPrice(domain) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token     = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) return null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/registrar/domains/${encodeURIComponent(domain)}/available`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.success || !json.result?.price) return null;
    const EXCHANGE_RATE = 0.79;
    const costPence = Math.round(json.result.price * EXCHANGE_RATE * 100);
    return costPence + CF_MARKUP_PENCE;
  } catch (err) {
    console.warn('CF price lookup failed:', err.message);
    return null;
  }
}

// Fallback prices (pence) if Cloudflare API is unavailable
const FALLBACK_PRICES = {
  'com': 800, 'co.uk': 500, 'uk': 500, 'net': 800,
  'org': 800, 'io': 3200, 'app': 1200,
};

function getFallbackPrice(domain) {
  const parts = domain.split('.');
  if (parts.length >= 3) {
    const twoPartTld = parts.slice(-2).join('.');
    if (FALLBACK_PRICES[twoPartTld] !== undefined) return FALLBACK_PRICES[twoPartTld];
  }
  const tld = parts[parts.length - 1];
  return FALLBACK_PRICES[tld] ?? 800;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { domain, email, slug, return_url } = req.body || {};
  if (!domain) return res.status(400).json({ error: 'Missing domain' });

  const clean = domain.toLowerCase().trim();

  // Fetch real price from Cloudflare; fall back to approximate at-cost prices
  const cfPrice = await getCloudflareDomainPrice(clean);
  const priceInPence = cfPrice ?? getFallbackPrice(clean);

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const returnUrl = return_url || `https://brightsite.app/checkout?domain_success=1&domain=${encodeURIComponent(clean)}`;

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'gbp',
          product_data: {
            name: `Domain: ${clean}`,
            description: `1-year registration for ${clean}`,
          },
          unit_amount: priceInPence,
        },
        quantity: 1,
      }],
      return_url: returnUrl,
      customer_email: email || undefined,
      metadata: {
        type: 'domain_registration',
        domain: clean,
        slug: slug || '',
      },
      payment_intent_data: {
        metadata: { type: 'domain_registration', domain: clean, slug: slug || '' },
      },
    });

    res.status(200).json({ clientSecret: session.client_secret, priceInPence });
  } catch (err) {
    console.error('Stripe domain checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
