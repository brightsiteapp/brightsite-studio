import Stripe from 'stripe';
import { supabaseAdmin } from './_lib/supabase-admin.js';
import { registerWithCloudflare, markBusinessLive, markDomainBought } from './_lib/activate.js';
import { runDomainRenewals } from './_lib/domain-renewals.js';
import { addonPrice } from './_lib/plans.js';
import { setSiteLive } from './_lib/activate.js';
import { notifyBusiness, notifyAdmins } from './_lib/push.js';

export default async function handler(req, res) {
  // GET is the nightly domain-renewals cron; POST is Stripe's checkout webhook
  if (req.method === 'GET') return runDomainRenewals(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_DOMAIN_SECRET;

  let event;
  try {
    const rawBody = await new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  // Subscription billing: warn on a failed payment, confirm when it recovers, and take the site
  // offline if the subscription ends (Stripe cancels it after its retries run out).
  if (['invoice.payment_failed', 'invoice.paid', 'customer.subscription.deleted'].includes(event.type)) {
    try { await handleBilling(event); }
    catch (err) { console.error('Billing event error:', err.message); return res.status(500).json({ error: err.message }); }
    return res.status(200).json({ received: true });
  }

  if (event.type !== 'checkout.session.completed') return res.status(200).json({ received: true });

  const session = event.data.object;
  const isDomainOnly = session.metadata?.type === 'domain_registration';
  // Plan checkouts (with or without a domain) carry the site's slug; anything else isn't ours.
  const isPlan = !isDomainOnly && !!session.metadata?.slug && !!session.metadata?.plan;
  if (!isDomainOnly && !isPlan) return res.status(200).json({ received: true });

  const domain = session.metadata.domain;
  const slug   = session.metadata.slug;

  try {
    if (domain) await registerWithCloudflare(domain);

    if (isDomainOnly) {
      await markDomainBought(slug, domain);
      await notifyAdmins(`🌐 ${slug} bought a domain`, `${domain} (no plan yet).`, slug);
      await notifyBusiness(slug, { title: 'Domain bought ✓', body: `${domain} is yours. It connects when your website goes live.` });
      return res.status(200).json({ received: true, domain });
    }

    await markBusinessLive(slug, domain || null, session.metadata?.publish_on_payment === 'true');

    // Annual plans: the £19/mo booking/store add-on is a separate monthly subscription.
    // The idempotency key stops a Stripe webhook retry from starting it twice.
    if (session.metadata?.addon_separate === 'true' && session.subscription) {
      const mainSub = await stripe.subscriptions.retrieve(session.subscription);
      await stripe.subscriptions.create({
        customer: session.customer,
        items: [{ price: addonPrice(), quantity: 1 }],
        default_payment_method: mainSub.default_payment_method || undefined,
        metadata: { slug, addon: 'monthly', parent_subscription: session.subscription },
      }, { idempotencyKey: `addon-${session.id}` });
    }
    // the nightly domain-renewals job needs to know which subscription (and plan) pays for this domain
    if (session.subscription && slug) {
      const supabase = supabaseAdmin();
      const { data: row } = await supabase.from('businesses').select('data').eq('id', slug).single();
      if (row) {
        const raw = { ...(row.data?.raw || {}), chosenPlan: session.metadata?.plan === 'pro' ? 'pro' : 'essential', chosenAnnual: session.metadata?.billing === 'annual' };
        await supabase.from('businesses').update({ data: { ...row.data, raw, stripeSubscriptionId: session.subscription } }).eq('id', slug);
      }
    }

    await notifyAdmins(`💷 ${slug} paid`, `${session.metadata?.plan === 'pro' ? 'Pro' : 'Free'} plan, ${session.metadata?.billing || 'monthly'}${domain ? ' + ' + domain : ''}.`, slug);
    console.log(`Checkout complete for slug: ${slug}${domain ? `, domain registered: ${domain}` : ''}`);
    return res.status(200).json({ received: true, domain });
  } catch (err) {
    console.error('Domain registration error:', err.message);
    // A non-2xx response asks Stripe to retry. A paid domain must never be
    // silently abandoned because a downstream registration or publish failed.
    return res.status(500).json({ error: err.message });
  }
}

async function handleBilling(event) {
  const obj = event.data.object;
  const slug = event.type === 'customer.subscription.deleted'
    ? obj.metadata?.slug
    : (obj.subscription_details?.metadata?.slug || obj.lines?.data?.[0]?.metadata?.slug);
  if (!slug) return;
  const supabase = supabaseAdmin();
  const { data: row } = await supabase.from('businesses').select('data').eq('id', slug).single();
  if (!row) return;
  const data = row.data || {};

  if (event.type === 'invoice.payment_failed') {
    await notifyAdmins(`⚠️ Payment failed: ${slug}`, 'Stripe will retry. They’ve been asked to update their card.', slug);
    await supabase.from('businesses').update({ data: { ...data, paymentFailed: true } }).eq('id', slug);
    await notifyBusiness(slug, {
      title: 'Payment failed',
      body: 'We couldn’t take your BrightSite payment. Update your card to keep your website online.',
      message: '⚠️ Your latest payment didn’t go through. Please update your card from the Account tab so your website stays online. We’ll try again automatically.',
    });
  } else if (event.type === 'invoice.paid') {
    if (!data.paymentFailed) return; // only after a failure, not every renewal
    await notifyAdmins(`✅ Payment recovered: ${slug}`, 'Their payment went through after failing.', slug);
    await supabase.from('businesses').update({ data: { ...data, paymentFailed: false } }).eq('id', slug);
    await notifyBusiness(slug, {
      title: 'Payment sorted ✓',
      body: 'Thanks! Your payment went through and your website stays online.',
      message: '✅ Thanks, your payment went through. Your website stays online.',
    });
  } else if (event.type === 'customer.subscription.deleted') {
    // An add-on subscription ending isn't the hosting plan; leave the site alone.
    if (obj.metadata?.addon) return;
    if (data.stripeSubscriptionId && data.stripeSubscriptionId !== obj.id) return;
    await notifyAdmins(`❌ Plan ended: ${slug}`, 'Their subscription ended and the website was taken offline.', slug);
    await setSiteLive(slug, false).catch(err => console.error('Taking site offline failed:', err.message));
    await supabase.from('businesses').update({ data: { ...data, published: false, planActive: false, paymentFailed: false } }).eq('id', slug);
    await notifyBusiness(slug, {
      title: 'Your website is offline',
      body: 'Your BrightSite plan has ended, so your website is now offline. Choose a plan to bring it back.',
      message: 'Your plan has ended, so your website is now offline. Tap Make Live and choose a plan whenever you want it back online.',
    });
  }
}

export const config = { api: { bodyParser: false } };
