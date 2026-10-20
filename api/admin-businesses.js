import { supabaseAdmin } from './_lib/supabase-admin.js';
import { connectAnyDomain, normaliseDomain, setSiteLive } from './_lib/activate.js';
import Stripe from 'stripe';
const ACCOUNTS_SUPABASE_URL = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const ACCOUNTS_SUPABASE_ANON_KEY = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'brightsiteapp@gmail.com,tommeofficial1@gmail.com')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function json(response, status, payload) {
  response.setHeader('Cache-Control', 'private, no-store');
  return response.status(status).json(payload);
}

function bearerToken(request) {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function currentUser(supabaseUrl, anonKey, token) {
  const result = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` }
  });
  if (!result.ok) return null;
  return result.json();
}

export default async function handler(request, response) {
  const origin = request.headers.origin;
  if (origin === 'https://brightsite.app' || origin === 'https://www.brightsite.app') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return response.status(204).end();

  if (request.method === 'POST') {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    if (body.action === 'delete-account') return deleteAccount(request, response, body);
    if (body.action === 'list-logins' || body.action === 'delete-logins') return manageLogins(request, response, body);
    return connectDomain(request, response);
  }
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, POST');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = ACCOUNTS_SUPABASE_URL;
  const anonKey = ACCOUNTS_SUPABASE_ANON_KEY;
  const token = bearerToken(request);

  if (!token) return json(response, 401, { error: 'Authentication required' });

  try {
    const user = await currentUser(supabaseUrl, anonKey, token);
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) {
      return json(response, 403, { error: 'Administrator access required' });
    }

    const businesses = await fetch(
      `${supabaseUrl}/rest/v1/rpc/admin_get_all_businesses`,
      {
        method: 'POST',
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
    if (!businesses.ok) {
      const errBody = await businesses.text();
      console.error('Admin businesses query failed', businesses.status, errBody);
      return json(response, 502, { error: 'Could not load accounts' });
    }

    return json(response, 200, await businesses.json());
  } catch (error) {
    console.error('Admin businesses error', error);
    return json(response, 502, { error: 'Could not load accounts' });
  }
}

async function connectDomain(request, response) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email)) return json(response, 403, { error: 'Administrator access required' });

  const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
  const slug = String(body.slug || '');
  const domain = normaliseDomain(body.domain);
  if (!slug || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return json(response, 400, { error: 'Enter a valid domain, like example.co.uk' });

  const supabase = supabaseAdmin();
  const { data: row, error } = await supabase.from('businesses').select('data').eq('id', slug).single();
  if (error || !row) return json(response, 404, { error: 'Client not found' });
  const data = row.data || {};

  let result;
  try {
    result = await connectAnyDomain(slug, domain, !!data.published);
  } catch (err) {
    console.error('Connect domain failed', domain, err.message);
    Object.assign(data, { customDomain: domain, domain, domainConnected: false, domainError: err.message });
    await supabase.from('businesses').update({ data }).eq('id', slug);
    return json(response, 502, { error: 'Cloudflare could not connect this domain: ' + err.message });
  }

  Object.assign(data, {
    customDomain: domain,
    domain,
    domainConnected: result.connected,
    domainNameservers: result.nameservers,
    domainError: '',
    ...(data.domainRegistered ? {} : { domainExternal: true }),
    ...(result.liveUrl ? { liveUrl: result.liveUrl } : {}),
  });
  await supabase.from('businesses').update({ data }).eq('id', slug);
  return json(response, 200, result);
}

async function deleteAccount(request, response, body) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  const email = String(user?.email || '').trim().toLowerCase();
  if (!email || !ADMIN_EMAILS.has(email)) return json(response, 403, { error: 'Administrator access required' });

  const slug = String(body.slug || '');
  if (!slug) return json(response, 400, { error: 'Missing client' });
  const supabase = supabaseAdmin();
  const { data: row, error } = await supabase.from('businesses').select('user_id,data').eq('id', slug).maybeSingle();
  if (error) return json(response, 502, { error: error.message });
  if (!row) return json(response, 404, { error: 'Client not found' });
  const data = row.data || {};
  const done = [];

  if (data.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
      await stripe.subscriptions.cancel(data.stripeSubscriptionId);
      done.push('subscription cancelled');
    } catch (err) {
      if (!/No such subscription|canceled/i.test(err.message)) {
        return json(response, 502, { error: 'Could not cancel their Stripe subscription, so nothing was deleted: ' + err.message });
      }
    }
  }

  if (data.published) {
    const off = await setSiteLive(slug, false);
    if (!off.error) done.push('site taken offline');
  }

  const { error: msgErr } = await supabase.from('messages').delete().eq('business_id', slug);
  if (msgErr) return json(response, 502, { error: 'Could not delete messages: ' + msgErr.message });
  done.push('messages deleted');

  const { error: bizErr, count } = await supabase.from('businesses').delete({ count: 'exact' }).eq('id', slug);
  if (bizErr || !count) return json(response, 502, { error: 'Could not delete the business' + (bizErr ? ': ' + bizErr.message : '') });
  done.push('business deleted');

  if (row.user_id) {
    const { count: others } = await supabase.from('businesses').select('id', { count: 'exact', head: true }).eq('user_id', row.user_id);
    if (!others) {
      const { error: userErr } = await supabase.auth.admin.deleteUser(row.user_id);
      done.push(userErr ? 'login could not be removed: ' + userErr.message : 'login deleted');
    } else {
      done.push('login kept (owns another business)');
    }
  }
  return json(response, 200, { ok: true, done });
}

// Logins left behind by deletes made before the account delete removed them too.
async function manageLogins(request, response, body) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const admin = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  const adminEmail = String(admin?.email || '').trim().toLowerCase();
  if (!adminEmail || !ADMIN_EMAILS.has(adminEmail)) return json(response, 403, { error: 'Administrator access required' });

  const supabase = supabaseAdmin();
  const users = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return json(response, 502, { error: error.message });
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const { data: businesses, error: bizErr } = await supabase.from('businesses').select('id,name,user_id,updated_at');
  if (bizErr) return json(response, 502, { error: bizErr.message });
  const owners = new Set(businesses.map(b => b.user_id).filter(Boolean));
  const isAdmin = u => ADMIN_EMAILS.has(String(u.email || '').toLowerCase());
  const orphans = users.filter(u => !owners.has(u.id) && !isAdmin(u));

  if (body.action === 'list-logins') {
    return json(response, 200, {
      logins: users.map(u => ({ id: u.id, email: u.email, created: u.created_at, lastSignIn: u.last_sign_in_at, hasBusiness: owners.has(u.id), admin: isAdmin(u) })),
      businesses: businesses.map(b => ({ id: b.id, name: b.name, owner: b.user_id, updated: b.updated_at })),
      orphanIds: orphans.map(u => u.id),
    });
  }

  const requested = new Set(Array.isArray(body.ids) ? body.ids : []);
  const removed = [];
  const skipped = [];
  for (const u of orphans) {
    if (!requested.has(u.id)) continue;
    const { error } = await supabase.auth.admin.deleteUser(u.id);
    (error ? skipped : removed).push(u.email + (error ? ': ' + error.message : ''));
  }
  for (const id of requested) if (!orphans.some(u => u.id === id)) skipped.push(id + ': still owns a business or is an admin');
  return json(response, 200, { removed, skipped });
}
