const Stripe = require('stripe');

// Stripe Price IDs for each plan+billing combination.
// Recurring prices are for hosting; one-time prices are setup fees added to the first invoice.
const PLAN_PRICES = {
  essential_monthly: {
    recurring: 'price_1UGhbEGqCP7G2YApAOKm8Goo', // £19/mo hosting
  },
  essential_annual: {
    recurring: 'price_1UGpjvGqCP7G2YAptYGCKsFl',  // £204/yr hosting
  },
  pro_monthly: {
    recurring: 'price_1UGhbEGqCP7G2YApAOKm8Goo', // £19/mo hosting
    setup:     'price_1UGplTGqCP7G2YApGrrTagi9',  // £199 setup (one-time)
  },
  pro_annual: {
    recurring: 'price_1UGpmWGqCP7G2YApUmEXNyCn',  // £228/yr hosting
    setup:     'price_1UGpqEGqCP7G2YApCSXelP2a',  // £99 setup (one-time)
  },
  prestige_monthly: {
    recurring: 'price_1UGhbEGqCP7G2YApAOKm8Goo', // £19/mo hosting
    setup:     'price_1UGpm2GqCP7G2YAp0fIS6NPb',  // £299 setup (one-time)
  },
  prestige_annual: {
    recurring: 'price_1UGpmWGqCP7G2YApUmEXNyCn',  // £228/yr hosting
    setup:     'price_1UGpqZGqCP7G2YAp4oDEhcoy',  // £149 setup (one-time)
  },
};

const ALLOWED_ORIGINS = ['https://brightsite.app', 'https://wellnessweb.co.uk'];

module.exports = async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, billing, email, slug } = req.body || {};

  if (!plan || !billing) return res.status(400).json({ error: 'Missing plan or billing' });

  const key = `${plan}_${billing}`;
  const prices = PLAN_PRICES[key];
  if (!prices) return res.status(400).json({ error: 'Unknown plan: ' + key });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const lineItems = [{ price: prices.recurring, quantity: 1 }];
    if (prices.setup) lineItems.push({ price: prices.setup, quantity: 1 });

    const returnUrl = `https://brightsite.app/account/dashboard?slug=${encodeURIComponent(slug || '')}&payment=success`;

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: lineItems,
      return_url: returnUrl,
      customer_email: email || undefined,
      metadata: { plan, billing, slug: slug || '' },
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
