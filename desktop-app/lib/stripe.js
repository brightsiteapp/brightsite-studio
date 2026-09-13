// Stripe payment links for customers on the Live tab. The secret key is
// saved in Settings and lives on this computer only (not synced), in
// ~/BrightSiteProjects/stripe-settings.json. STRIPE_SECRET_KEY in the
// environment overrides it for development.
const fs = require('fs');
const path = require('path');
const storage = require('./site-storage');

const SETTINGS_FILE = path.join(storage.ROOT, 'stripe-settings.json');

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}

function getKey() {
  return process.env.STRIPE_SECRET_KEY || readSettings().apiKey || '';
}

function setKey(apiKey, account = '') {
  storage.ensureRoot();
  if (apiKey) fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ apiKey, account }, null, 2));
  else fs.rmSync(SETTINGS_FILE, { force: true });
}

// Same shape as the CLI connections in lib/connections.js, for Settings.
function status() {
  const key = getKey();
  if (!key) return { installed: true, signedIn: false };
  return { installed: true, signedIn: true, account: `${readSettings().account || 'Stripe'}${key.includes('_test_') ? ' (test mode)' : ''}` };
}

async function call(endpoint, params, key = getKey()) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: params ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error?.message || `Stripe error ${res.status}`);
  return body;
}

// Proves the key can see payment links, and finds the account's name to
// show in Settings (restricted keys may not be allowed to read it).
async function testKey(key) {
  await call('payment_links?limit=1', null, key);
  const account = await call('account', null, key).catch(() => null);
  return account?.settings?.dashboard?.display_name || account?.business_profile?.name || account?.email || 'Stripe account';
}

// One link per plan: the recurring hosting price plus, if there is one,
// the one-off setup fee (charged with the first payment).
async function createPaymentLink({ business, slug, planName, setup, amount, interval }) {
  if (!getKey()) throw new Error('Add your Stripe secret key in Settings first.');
  const pence = n => String(Math.round(n * 100));
  const prices = [];
  if (amount > 0) {
    prices.push(await call('prices', {
      currency: 'gbp', unit_amount: pence(amount), 'recurring[interval]': interval,
      'product_data[name]': `${planName} website — ${business}`
    }));
  }
  if (setup > 0) {
    prices.push(await call('prices', {
      currency: 'gbp', unit_amount: pence(setup), 'product_data[name]': `${planName} website setup — ${business}`
    }));
  }
  if (!prices.length) throw new Error('This plan has nothing to charge.');
  const params = { 'metadata[brightsite_slug]': slug };
  if (amount > 0) params['subscription_data[metadata][brightsite_slug]'] = slug;
  prices.forEach((price, i) => {
    params[`line_items[${i}][price]`] = price.id;
    params[`line_items[${i}][quantity]`] = '1';
  });
  return (await call('payment_links', params)).url;
}

// Where each customer's payments stand, keyed by business slug: 'active',
// 'cancelling' (cancelled, runs until `until`), 'failed' (payment failing),
// 'cancelled', or 'paid' — a one-off payment with no subscription (a
// setup-only plan). Found through the payment links Studio made (tagged
// with brightsite_slug) and the checkouts completed on them, or — for a
// payment taken some other way in Stripe — the customer's email.
// Any subscription outranks a one-off payment, and an active one outranks
// a lapsed one (a customer who re-subscribed has both).
const BILLING_RANK = { active: 4, cancelling: 3, failed: 2, cancelled: 1, paid: 0 };
const better = (current, next) => (!current || BILLING_RANK[next.status] > BILLING_RANK[current.status] ? next : current);

function billingOf(sub) {
  const until = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : '';
  if (['active', 'trialing'].includes(sub.status)) return sub.cancel_at_period_end || sub.cancel_at ? { status: 'cancelling', until } : { status: 'active', until: '' };
  if (['past_due', 'unpaid', 'incomplete'].includes(sub.status)) return { status: 'failed', until: '' };
  return { status: 'cancelled', until: sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : '' };
}

async function billingBySlug() {
  if (!getKey()) return {};
  const out = {};
  const links = (await call('payment_links?limit=100')).data.filter(l => l.metadata?.brightsite_slug);
  for (const link of links) {
    const slug = link.metadata.brightsite_slug;
    const sessions = (await call(`checkout/sessions?payment_link=${link.id}&status=complete&limit=20&expand[]=data.subscription`)).data;
    for (const session of sessions) {
      if (session.subscription && typeof session.subscription === 'object') out[slug] = better(out[slug], billingOf(session.subscription));
      else if (session.payment_status === 'paid') out[slug] = better(out[slug], { status: 'paid', until: '' });
    }
  }
  return out;
}

// The same answer for a customer who paid without one of Studio's links,
// matched on their email. Checkouts that were never paid don't count.
async function billingForEmail(email) {
  if (!getKey() || !email) return null;
  let found = null;
  const customers = (await call(`customers?email=${encodeURIComponent(email)}&limit=5`)).data;
  for (const customer of customers) {
    const subs = (await call(`subscriptions?customer=${customer.id}&status=all&limit=10`)).data
      .filter(sub => !['incomplete', 'incomplete_expired'].includes(sub.status));
    subs.forEach(sub => { found = better(found, billingOf(sub)); });
    if (subs.length) continue;
    const charges = (await call(`charges?customer=${customer.id}&limit=10`)).data;
    if (charges.some(c => c.paid && !c.refunded)) found = better(found, { status: 'paid', until: '' });
  }
  return found;
}

module.exports = { getKey, setKey, status, testKey, createPaymentLink, billingBySlug, billingForEmail, billingOf, better };
