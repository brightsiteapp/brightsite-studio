import Stripe from 'stripe';
import { quoteDomainInGbp } from './_lib/domain-pricing.js';
import { planPrices, domainChargePence } from './_lib/plans.js';

const ALLOWED_ORIGINS = ['https://brightsite.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, billing, email, slug, domain, addon_domain: addonDomain, publish_on_payment: publishOnPayment, ui_mode: uiMode } = req.body || {};
  const selectedDomain = domain || addonDomain || '';

  if (!plan || !billing) return res.status(400).json({ error: 'Missing plan or billing' });
  if (publishOnPayment && !process.env.STRIPE_WEBHOOK_DOMAIN_SECRET) {
    return res.status(503).json({ error: 'Automatic publishing is being set up. Please try again shortly.' });
  }

  const prices = planPrices(plan, billing);
  if (!prices) return res.status(400).json({ error: `Unknown plan: ${plan}_${billing}` });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const lineItems = [{ price: prices.recurring, quantity: 1 }];
    if (prices.setup) lineItems.push({ price: prices.setup, quantity: 1 });

    // Domain (one-off): listed at its real price; the part the plan covers comes off as a one-time
    // discount, so the customer sees the domain inside their total rather than as a £0 line.
    let discounts;
    if (selectedDomain) {
      const quote = await quoteDomainInGbp(selectedDomain);
      const coveredPence = quote.amountPence - domainChargePence(plan, billing, quote.amountPence);
      lineItems.push({
        price_data: {
          currency: 'gbp',
          product_data: { name: 'Domain: ' + selectedDomain, description: '1-year registration' },
          unit_amount: quote.amountPence,
        },
        quantity: 1,
      });
      if (coveredPence > 0) {
        const coupon = await stripe.coupons.create({ amount_off: coveredPence, currency: 'gbp', duration: 'once', name: 'Domain included with your plan', max_redemptions: 1 });
        discounts = [{ coupon: coupon.id }];
      }
    }

    const metadata = { plan, billing, slug: slug || '', domain: selectedDomain, publish_on_payment: publishOnPayment ? 'true' : 'false' };

    // The mobile app opens Stripe's hosted Checkout page in the device browser
    // (there's no embeddable web view in Expo for ui_mode: 'embedded') — same
    // Stripe account, prices and webhook as the website's embedded checkout.
    if (uiMode === 'hosted') {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: lineItems,
        success_url: `https://brightsite.app/account/dashboard?slug=${encodeURIComponent(slug || '')}&payment=success`,
        cancel_url: `https://brightsite.app/account/dashboard?slug=${encodeURIComponent(slug || '')}&payment=cancelled`,
        customer_email: email || undefined,
        metadata,
        subscription_data: { metadata },
        discounts,
      });
      return res.status(200).json({ url: session.url });
    }

    const returnUrl = `https://brightsite.app/account/dashboard?slug=${encodeURIComponent(slug || '')}&payment=success`;

    const session = await stripe.checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      line_items: lineItems,
      return_url: returnUrl,
      // No customer_email: Stripe locks a pre-filled email, and customers may want
      // receipts at a personal or business address. Renewals use the saved subscription ID.
      metadata,
      subscription_data: { metadata },
      discounts,
    });

    res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
