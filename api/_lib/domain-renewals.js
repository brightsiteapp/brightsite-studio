import Stripe from 'stripe';
import { supabaseAdmin } from './supabase-admin.js';
import { getLiveDomainQuote } from './domain-pricing.js';
import { connectDomainToSite, setSiteLive, connectAnyDomain } from './activate.js';

// Nightly (Vercel cron). Cloudflare auto-renews every domain on BrightSite's account, so:
//  - cancelled / unpaid customers: switch auto-renew off so we stop paying for their domain
//  - annual or Pro customers: nothing — the plan includes the domain
//  - monthly Free customers: within 30 days of expiry, add the renewal to their next invoice (once per expiry)
//  - domains that weren't ready to connect at payment time: connect them and move the site onto them
// Add ?dry=1 to report what would happen without changing anything.

const CF = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/registrar`;
const cfHeaders = () => ({ Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' });
const LIVE_STATUSES = ['active', 'trialing', 'past_due'];
const RENEWAL_WINDOW_DAYS = 30;

async function cloudflareDomain(domain) {
  for (const path of [`domains/${domain}`, `registrations/${domain}`]) {
    const res = await fetch(`${CF}/${path}`, { headers: cfHeaders() });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success && json.result) return { path, ...json.result };
  }
  throw new Error(`Cloudflare has no registration details for ${domain}`);
}

async function disableAutoRenew(domain, path) {
  const res = await fetch(`${CF}/${path}`, { method: path.startsWith('domains/') ? 'PUT' : 'PATCH', headers: cfHeaders(), body: JSON.stringify({ auto_renew: false }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.success) throw new Error(`Could not turn off auto-renew for ${domain}`);
}

// Cloudflare sells at cost, so a TLD's renewal price is the same for every name; quote it via an unregistered probe name.
async function renewalPence(domain) {
  const tld = domain.slice(domain.indexOf('.'));
  const quote = await getLiveDomainQuote(`brightsite-renewal-check-${Date.now().toString(36)}${tld}`);
  let amount = Number(quote.renewalCost || quote.amount);
  if (quote.currency !== 'GBP') {
    const fx = await (await fetch(`https://api.frankfurter.dev/v1/latest?base=${quote.currency}&symbols=GBP`)).json();
    amount *= Number(fx?.rates?.GBP);
  }
  const pence = Math.round(amount * 100);
  if (!Number.isFinite(pence) || pence < 1) throw new Error(`No renewal price for ${tld}`);
  return pence;
}

async function findSubscription(stripe, data) {
  if (data.stripeSubscriptionId) return stripe.subscriptions.retrieve(data.stripeSubscriptionId).catch(() => null);
  const email = data.raw?.email || data.raw?.ownerEmail;
  if (!email) return null;
  const customer = (await stripe.customers.list({ email, limit: 1 })).data[0];
  if (!customer) return null;
  const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 10 });
  return subs.data.find(s => LIVE_STATUSES.includes(s.status)) || subs.data[0] || null;
}

// Served through api/register-domain.js (GET) to stay within Vercel Hobby's 12-function limit.
export async function runDomainRenewals(req, res) {
  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const dry = req.query?.dry === '1';
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const supabase = supabaseAdmin();
  const { data: rows, error } = await supabase.from('businesses').select('id,data').eq('data->>domainRegistered', 'true');
  if (error) return res.status(500).json({ error: error.message });

  const report = [];
  const { data: external } = await supabase.from('businesses').select('id,data')
    .eq('data->>domainExternal', 'true').eq('data->>domainConnected', 'false');
  for (const row of external || []) {
    const data = row.data || {};
    const domain = data.customDomain || data.domain;
    const entry = { slug: row.id, domain, external: true };
    report.push(entry);
    try {
      const result = dry ? { status: 'dry-run' } : await connectAnyDomain(row.id, domain, !!data.published);
      entry.status = result.status;
      if (result.connected) {
        Object.assign(data, { domainConnected: true, domainError: '', ...(result.liveUrl ? { liveUrl: result.liveUrl } : {}) });
        await supabase.from('businesses').update({ data }).eq('id', row.id);
      }
    } catch (err) {
      entry.error = err.message;
    }
  }
  for (const row of rows) {
    const data = row.data || {};
    const domain = data.customDomain || data.domain;
    const entry = { slug: row.id, domain };
    report.push(entry);
    try {
      if (data.domainConnected === false && data.published) {
        entry.connect = 'connect domain to site';
        if (!dry) {
          await connectDomainToSite(domain);
          const result = await setSiteLive(row.id, true, domain);
          if (result.error) throw new Error(result.error);
          Object.assign(data, { domainConnected: true, domainError: '', liveUrl: result.url });
          await supabase.from('businesses').update({ data }).eq('id', row.id);
        }
      }
      const cf = await cloudflareDomain(domain);
      entry.expires = cf.expires_at;
      entry.autoRenew = cf.auto_renew;
      const sub = await findSubscription(stripe, data);
      const live = !!sub && LIVE_STATUSES.includes(sub.status);
      entry.subscription = sub ? sub.status : 'none';

      if (!live) {
        entry.action = cf.auto_renew ? 'turn off auto-renew' : 'already off';
        if (cf.auto_renew && !dry) await disableAutoRenew(domain, cf.path);
        continue;
      }
      const annual = sub.items.data.some(i => i.price?.recurring?.interval === 'year');
      const pro = (sub.metadata?.plan || data.raw?.chosenPlan) === 'pro';
      if (annual || pro) { entry.action = 'covered by plan'; continue; }

      const daysLeft = (new Date(cf.expires_at) - Date.now()) / 864e5;
      if (!(daysLeft <= RENEWAL_WINDOW_DAYS)) { entry.action = `renews in ${Math.round(daysLeft)} days`; continue; }
      if (data.domainRenewalBilledFor === cf.expires_at) { entry.action = 'renewal already billed'; continue; }

      const amount = await renewalPence(domain);
      entry.action = `bill £${(amount / 100).toFixed(2)} renewal`;
      if (dry) continue;
      await stripe.invoiceItems.create({ customer: sub.customer, subscription: sub.id, currency: 'gbp', amount, description: `Domain renewal: ${domain} (1 year)` });
      await supabase.from('businesses').update({ data: { ...data, domainRenewalBilledFor: cf.expires_at } }).eq('id', row.id);
    } catch (err) {
      entry.error = err.message;
    }
  }
  console.log('[domain-renewals]', JSON.stringify(report));
  res.status(200).json({ dry, checked: report.length, report });
}
