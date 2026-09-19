const Stripe = require('stripe');

// Map of plan+billing to Stripe Price IDs
// Replace these with your actual Price IDs from Stripe dashboard → Products
const PRICE_IDS = {
  essential_monthly: process.env.STRIPE_PRICE_ESSENTIAL_MONTHLY,
  essential_annual:  process.env.STRIPE_PRICE_ESSENTIAL_ANNUAL,
  pro_monthly:       process.env.STRIPE_PRICE_PRO_MONTHLY,
  pro_annual:        process.env.STRIPE_PRICE_PRO_ANNUAL,
  prestige_monthly:  process.env.STRIPE_PRICE_PRESTIGE_MONTHLY,
  prestige_annual:   process.env.STRIPE_PRICE_PRESTIGE_ANNUAL,
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://brightsite.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, billing, email, slug } = req.body || {};

  if (!plan || !billing) return res.status(400).json({ error: 'Missing plan or billing' });

  const key = `${plan}_${billing}`;
  const priceId = PRICE_IDS[key];
  if (!priceId) return res.status(400).json({ error: 'Unknown plan: ' + key });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: `https://brightsite.app/account/dashboard?slug=${encodeURIComponent(slug || '')}&payment=success`,
      customer_email: email || undefined,
      metadata: { plan, billing, slug: slug || '' },
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
