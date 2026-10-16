import Stripe from 'stripe';
import { quoteDomainInGbp } from './_lib/domain-pricing.js';
import { planPrices, domainChargePence } from './_lib/plans.js';

// Native in-app payment (Stripe PaymentSheet) for the mobile app. Same plans as
// create-checkout-session.js; activation happens in confirm-app-payment.js once the
// first invoice is paid, because the existing webhook only handles Checkout sessions.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { plan = 'essential', billing, email, slug, domain } = req.body || {};
  const prices = planPrices(plan, billing);
  if (!prices) return res.status(400).json({ error: 'Unknown plan' });
  if (!slug || !email) return res.status(400).json({ error: 'Missing account details' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const existing = await stripe.customers.list({ email, limit: 1 });
    const customer = existing.data[0] || await stripe.customers.create({ email, metadata: { slug } });

    // Pending invoice items are pulled into the subscription's first invoice.
    if (prices.setup) await stripe.invoiceItems.create({ customer: customer.id, price: prices.setup });
    if (domain) {
      const quote = await quoteDomainInGbp(domain);
      const amount = domainChargePence(plan, billing, quote.amountPence);
      if (amount > 0) await stripe.invoiceItems.create({ customer: customer.id, currency: 'gbp', amount, description: `Domain: ${domain} (1-year registration)` });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: prices.recurring }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
      metadata: { plan, billing, slug, domain: domain || '', source: 'mobile_app' },
    });
    const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customer.id }, { apiVersion: '2024-06-20' });

    res.status(200).json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      ephemeralKey: ephemeralKey.secret,
      paymentIntentClientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (err) {
    console.error('Payment sheet error:', err.message);
    res.status(500).json({ error: 'Payment could not be set up. Please try again.' });
  }
}
