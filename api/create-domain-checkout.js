import Stripe from 'stripe';

const ALLOWED_ORIGINS = ['https://brightsite.app'];

// Domain pricing tiers by TLD (in pence)
const TLD_PRICES = {
  'com':   1500,  // £15
  'co.uk': 1000,  // £10
  'uk':    1000,  // £10
  'net':   1500,  // £15
  'org':   1500,  // £15
  'io':    4000,  // £40
  'app':   2000,  // £20
};
const DEFAULT_PRICE = 1500; // £15 fallback

function getTLDPrice(domain) {
  const parts = domain.split('.');
  if (parts.length >= 3) {
    const twoPartTld = parts.slice(-2).join('.');
    if (TLD_PRICES[twoPartTld] !== undefined) return TLD_PRICES[twoPartTld];
  }
  const tld = parts[parts.length - 1];
  return TLD_PRICES[tld] ?? DEFAULT_PRICE;
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
  const priceInPence = getTLDPrice(clean);

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
        metadata: {
          type: 'domain_registration',
          domain: clean,
          slug: slug || '',
        },
      },
    });

    res.status(200).json({ clientSecret: session.client_secret, priceInPence });
  } catch (err) {
    console.error('Stripe domain checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
