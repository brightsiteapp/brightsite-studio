import Stripe from 'stripe';
import { quoteDomainIn, regionFromRequest } from './_lib/domain-pricing.js';
import { planPrices, addonPrice } from './_lib/plans.js';
import { referralIsValid } from './_lib/referrals.js';

const ALLOWED_ORIGINS = ['https://brightsite.app', 'https://us.brightsite.app', 'https://uk.brightsite.app'];

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plan, billing, email, slug, domain, addon_domain: addonDomain, publish_on_payment: publishOnPayment, ui_mode: uiMode, addon_booking: addonBooking, addon_store: addonStore, referral } = req.body || {};
  const freeDomain = !!referral && referralIsValid(referral);
  // the website asks first whether a code is valid, before loading checkout
  if (req.body?.check_referral) return res.status(200).json({ valid: referralIsValid(referral) });
  const selectedDomain = domain || addonDomain || '';

  if (!plan || !billing) return res.status(400).json({ error: 'Missing plan or billing' });
  if (publishOnPayment && !process.env.STRIPE_WEBHOOK_DOMAIN_SECRET) {
    return res.status(503).json({ error: 'Automatic publishing is being set up. Please try again shortly.' });
  }

  // US visitors (Cloudflare country header) get USD prices; everyone else keeps GBP.
  const region = regionFromRequest(req);
  const prices = planPrices(plan, billing, region);
  if (!prices) return res.status(400).json({ error: `Unknown plan: ${plan}_${billing}` });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const lineItems = [{ price: prices.recurring, quantity: 1 }];
    if (prices.setup) lineItems.push({ price: prices.setup, quantity: 1 });
    // Booking form or online store add-on: £19/mo. On monthly plans it joins the same subscription;
    // on annual plans Stripe can't mix intervals, so it is started as its own monthly subscription after payment.
    const hasAddon = !!(addonBooking || addonStore);
    const addonSeparate = hasAddon && billing === 'annual';
    if (hasAddon && !addonSeparate) lineItems.push({ price: addonPrice(region), quantity: 1 });

    // Domain (one-off): listed at its real price; the part the plan covers comes off as a one-time
    // discount, so the customer sees the domain inside their total rather than as a £0 line.
    // Stripe Checkout allows only ONE discount, so the domain saving and the partner Pro build-fee
    // waiver are added together into a single coupon.
    const us = region === 'us';
    let discounts;
    let offMinor = 0;
    let domainOff = 0;
    if (selectedDomain) {
      const quote = await quoteDomainIn(selectedDomain, us ? 'USD' : 'GBP');
      // a valid referral code makes the whole domain free; otherwise the plan covers what it normally does
      // Pro includes a domain allowance: £10, or $12 for US visitors. Anything under it is free and not mentioned.
      const allowancePence = plan === 'pro' ? (us ? 1200 : 1000) : 0;
      domainOff = freeDomain ? quote.amountMinor : Math.min(quote.amountMinor, allowancePence);
      lineItems.push({
        price_data: {
          currency: us ? 'usd' : 'gbp',
          product_data: { name: 'Domain: ' + selectedDomain, description: '1-year registration' },
          unit_amount: quote.amountMinor,
        },
        quantity: 1,
      });
      offMinor += domainOff;
    }
    // A valid partner code also waives the one-off Pro build fee (£199 / $269), so Pro is free to start.
    const feeWaived = freeDomain && plan === 'pro' && !!prices.setup;
    if (feeWaived) offMinor += us ? 26900 : 19900;
    if (offMinor > 0) {
      let couponId, couponName;
      if (feeWaived) {
        couponId = `partner-${us ? 'usd-' : ''}${offMinor}`;
        couponName = domainOff > 0 ? 'Partner offer: free domain + Pro build' : 'Partner offer: Pro build fee waived'; // Stripe limits coupon names to 40 characters
      } else {
        // One reusable coupon per amount, so loading checkout doesn't create a new coupon each time.
        couponId = `domain-included-${us ? 'usd-' : ''}${offMinor}`;
        couponName = 'Domain included with your plan';
      }
      const coupon = await stripe.coupons.retrieve(couponId).catch(() =>
        stripe.coupons.create({ id: couponId, amount_off: offMinor, currency: us ? 'usd' : 'gbp', duration: 'once', name: couponName }));
      discounts = [{ coupon: coupon.id }];
    }

    // What the partner code took off, so the checkout page can say so in plain words.
    const offers = { currency: us ? 'usd' : 'gbp', domainMinor: freeDomain ? domainOff : 0, feeMinor: feeWaived ? (us ? 26900 : 19900) : 0 };

    const metadata = { plan, billing, slug: slug || '', domain: selectedDomain, publish_on_payment: publishOnPayment ? 'true' : 'false' };
    if (freeDomain) metadata.referral = String(referral).trim().toUpperCase();
    if (addonSeparate) metadata.addon_separate = 'true';
    metadata.region = region;

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
        allow_promotion_codes: discounts ? undefined : true,
      });
      return res.status(200).json({ url: session.url, offers });
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
      // Stripe allows either a fixed discount or a promo code box, not both.
      allow_promotion_codes: discounts ? undefined : true,
    });

    res.status(200).json({ clientSecret: session.client_secret, offers });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
