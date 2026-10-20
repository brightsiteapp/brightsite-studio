import { supabaseAdmin } from './supabase-admin.js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;

export async function registerWithCloudflare(domain) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/registrar/registrations`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain_name: domain, auto_renew: true }),
    }
  );
  const json = await res.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors));
  return json.result;
}

const SITE_WORKER = 'https://brightsite-upload.notify-lead-worker.workers.dev';

async function cf(path, init = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const json = await res.json().catch(() => ({}));
  if (!json.success) throw new Error(JSON.stringify(json.errors || res.status));
  return json.result;
}

// Points a domain registered through Cloudflare (and its www) at the site worker.
export async function connectDomainToSite(domain) {
  const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`);
  if (!zones?.length) throw new Error(`No Cloudflare zone for ${domain} yet`);
  for (const hostname of [domain, `www.${domain}`]) {
    await cf(`/accounts/${CF_ACCOUNT_ID}/workers/domains`, {
      method: 'PUT',
      body: JSON.stringify({ environment: 'production', hostname, service: 'brightsite-upload', zone_id: zones[0].id }),
    });
  }
}

export function normaliseDomain(input) {
  return String(input || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[/?#].*$/, '').replace(/\.$/, '');
}

// Connects any domain to a client's site. Domains not yet in our Cloudflare account are added,
// and the client must switch their registrar's nameservers before the zone goes active.
export async function connectAnyDomain(slug, domain, published) {
  let zones = await cf(`/zones?name=${encodeURIComponent(domain)}`);
  let zone = zones && zones[0];
  if (!zone) {
    zone = await cf('/zones', {
      method: 'POST',
      body: JSON.stringify({ name: domain, account: { id: CF_ACCOUNT_ID }, type: 'full' }),
    });
  }
  const result = { status: zone.status, nameservers: zone.name_servers || [], connected: false, liveUrl: '' };
  if (zone.status !== 'active') return result;
  await connectDomainToSite(domain);
  result.connected = true;
  if (published) {
    const live = await setSiteLive(slug, true, domain);
    if (live.error) throw new Error(live.error);
    result.liveUrl = live.url;
  }
  return result;
}

// Switches the uploaded site on (or off) in the site worker. Returns { live, url } or { error }.
export async function setSiteLive(slug, live, domain) {
  const res = await fetch(`${SITE_WORKER}/publish`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SITE_PUBLISH_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, live, domain: domain || '' }),
  });
  const json = await res.json().catch(() => ({}));
  return res.ok ? json : { error: json.error || `publish failed (${res.status})`, status: res.status };
}

// After payment: the plan is active, the domain is connected, and the uploaded site is switched on.
// Only a site the worker really serves is marked published; if no site has been uploaded yet it
// waits (needsPublish) and admin.html publishes it on upload.
export async function markBusinessLive(slug, domain, publishOnPayment) {
  if (!slug) return;
  const supabase = supabaseAdmin();
  const { data: row, error: readError } = await supabase
    .from('businesses').select('name,data').eq('id', slug).single();
  if (readError) throw readError;
  const previous = row?.data || {};

  let domainConnected = false;
  let domainError = '';
  if (domain) {
    // A just-registered domain's zone can take a few seconds to appear, so try a few times.
    for (let attempt = 0; attempt < 4 && !domainConnected; attempt++) {
      if (attempt) await new Promise(r => setTimeout(r, 2000));
      try { await connectDomainToSite(domain); domainConnected = true; domainError = ''; }
      catch (err) { domainError = err.message; }
    }
    if (!domainConnected) console.error(`Connecting ${domain} failed:`, domainError);
  }

  let published = !!previous.published;
  let liveUrl = previous.liveUrl || '';
  let publishError = '';
  if (publishOnPayment) {
    const result = await setSiteLive(slug, true, domainConnected ? domain : '');
    if (result.error) publishError = result.error;
    else { published = true; liveUrl = result.url; }
  }

  const nextData = {
    ...previous,
    planActive: true,
    ...(domain ? { customDomain: domain, domain, domainRegistered: true, domainConnected, domainError } : {}),
    ...(publishOnPayment ? { published, liveUrl, needsPublish: !published, manuallyOffline: false, publishError } : {}),
  };
  const { error: updateError } = await supabase
    .from('businesses')
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq('id', slug);
  if (updateError) throw updateError;

  if (publishOnPayment && published) {
    const businessName = row?.name || previous?.raw?.name || '';
    await notifyClientLive(supabase, slug, previous.pushToken, businessName, liveUrl);
  }
}

async function notifyClientLive(supabase, slug, pushToken, businessName, siteUrl) {
  const message = `🎉 Your website is live${siteUrl ? ` at ${siteUrl}` : ''}! Share it with everyone.`;
  await supabase.from('messages').insert({ business_id: slug, sender: 'admin', body: message }).catch(() => {});
  if (!pushToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify({
      to: pushToken,
      title: businessName ? `${businessName} is live! 🎉` : 'Your website is live! 🎉',
      body: siteUrl ? `Tap to open ${siteUrl}` : 'Your website is now live and ready to share.',
      sound: 'default',
      data: { screen: 'dashboard' },
    }),
  }).catch(() => {});
}

