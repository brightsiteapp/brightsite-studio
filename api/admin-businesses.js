import { supabaseAdmin } from './_lib/supabase-admin.js';
import { connectAnyDomain, normaliseDomain, setSiteLive } from './_lib/activate.js';
import Stripe from 'stripe';
import { notifyBusiness, notifyAdmins } from './_lib/push.js';
const ACCOUNTS_SUPABASE_URL = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const ACCOUNTS_SUPABASE_ANON_KEY = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'brightsiteapp@gmail.com,admin@brightsite.app')
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
  if (['https://brightsite.app', 'https://www.brightsite.app', 'https://us.brightsite.app'].includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return response.status(204).end();

  if (request.method === 'POST') {
    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    if (body.action === 'delete-account') return deleteAccount(request, response, body);
    if (body.action === 'delete-my-account') return deleteMyAccount(request, response);
    if (body.action === 'web-login-link') return webLoginLink(request, response);
    if (body.action === 'list-logins' || body.action === 'delete-logins') return manageLogins(request, response, body);
    if (body.action === 'notify-admin') return notifyAdminFromCustomer(request, response, body);
    if (body.action === 'my-subscription') return mySubscription(request, response, body);
    if (['account-info', 'update-login', 'send-reset', 'save-raw', 'cancel-plan', 'register-admin-push', 'push-customer'].includes(body.action)) return adminAction(request, response, body);
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

// Cancels billing, takes the site offline and deletes one business with its messages.
// Returns { done } on success or { error } (nothing further is touched after an error).
async function purgeBusiness(supabase, slug, data) {
  const done = [];
  if (data.stripeSubscriptionId && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
      await stripe.subscriptions.cancel(data.stripeSubscriptionId);
      done.push('subscription cancelled');
    } catch (err) {
      if (!/No such subscription|canceled/i.test(err.message)) return { error: 'Could not cancel the Stripe subscription, so nothing was deleted: ' + err.message };
    }
  }
  if (data.published) {
    const off = await setSiteLive(slug, false);
    if (!off.error) done.push('site taken offline');
  }
  const { error: msgErr } = await supabase.from('messages').delete().eq('business_id', slug);
  if (msgErr) return { error: 'Could not delete messages: ' + msgErr.message };
  done.push('messages deleted');
  const { error: bizErr, count } = await supabase.from('businesses').delete({ count: 'exact' }).eq('id', slug);
  if (bizErr || !count) return { error: 'Could not delete the business' + (bizErr ? ': ' + bizErr.message : '') };
  done.push('business deleted');
  return { done };
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

  const result = await purgeBusiness(supabase, slug, row.data || {});
  if (result.error) return json(response, 502, { error: result.error });
  const done = result.done;
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

// One-tap sign-in to the web dashboard from the app: a single-use link that expires quickly,
// made for the signed-in customer only. Nothing is typed and no token travels in our own URL.
async function webLoginLink(request, response) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  if (!user?.id || !user.email) return json(response, 401, { error: 'Authentication required' });
  const { data, error } = await supabaseAdmin().auth.admin.generateLink({
    type: 'magiclink', email: user.email, options: { redirectTo: 'https://brightsite.app/account/callback.html' },
  });
  if (error || !data?.properties?.action_link) return json(response, 502, { error: 'Could not open your dashboard right now' });
  return json(response, 200, { url: data.properties.action_link });
}

// A customer deletes their own account from the app or dashboard (App Store requirement):
// every business they own, then their login. Admin logins can't delete themselves this way.
async function deleteMyAccount(request, response) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  if (!user?.id) return json(response, 401, { error: 'Authentication required' });
  if (ADMIN_EMAILS.has(String(user.email || '').trim().toLowerCase())) return json(response, 403, { error: 'Admin accounts can\'t be deleted here' });
  const supabase = supabaseAdmin();
  const { data: rows, error } = await supabase.from('businesses').select('id,data').eq('user_id', user.id);
  if (error) return json(response, 502, { error: error.message });
  for (const row of rows || []) {
    const result = await purgeBusiness(supabase, row.id, row.data || {});
    if (result.error) return json(response, 502, { error: result.error });
  }
  const { error: userErr } = await supabase.auth.admin.deleteUser(user.id);
  if (userErr) return json(response, 502, { error: 'Your website was removed but your login could not be deleted: ' + userErr.message });
  return json(response, 200, { ok: true });
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

// ---- Admin client workspace actions ----
async function requireAdminUser(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  return user && ADMIN_EMAILS.has(String(user.email || '').trim().toLowerCase()) ? user : null;
}

async function adminAction(request, response, body) {
  const admin = await requireAdminUser(request);
  if (!admin) return json(response, 403, { error: 'Administrator access required' });
  const supabase = supabaseAdmin();

  if (body.action === 'register-admin-push') {
    const token = String(body.token || '');
    if (!/^ExponentPushToken\[/.test(token)) return json(response, 400, { error: 'Invalid push token' });
    const existing = admin.user_metadata?.pushTokens || [];
    const pushTokens = [token, ...existing.filter(t => t !== token)].slice(0, 5);
    const { error } = await supabase.auth.admin.updateUserById(admin.id, { user_metadata: { ...(admin.user_metadata || {}), pushTokens } });
    return error ? json(response, 502, { error: error.message }) : json(response, 200, { ok: true });
  }

  const slug = String(body.slug || '');
  if (!slug) return json(response, 400, { error: 'Missing client' });
  const { data: row, error } = await supabase.from('businesses').select('user_id,name,data').eq('id', slug).maybeSingle();
  if (error) return json(response, 502, { error: error.message });
  if (!row) return json(response, 404, { error: 'Client not found' });
  const data = row.data || {};
  const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' }) : null;

  if (body.action === 'account-info') {
    const out = { login: null, subscription: null };
    if (row.user_id) {
      const { data: u } = await supabase.auth.admin.getUserById(row.user_id);
      if (u?.user) out.login = { email: u.user.email, createdAt: u.user.created_at, lastSignIn: u.user.last_sign_in_at, providers: u.user.app_metadata?.providers || [] };
    }
    if (stripe && data.stripeSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(data.stripeSubscriptionId, { expand: ['default_payment_method'] });
        const item = sub.items?.data?.[0]?.price;
        const pm = sub.default_payment_method;
        out.subscription = { status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end, renews: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          amount: item?.unit_amount, interval: item?.recurring?.interval, card: pm?.card ? `${pm.card.brand} •••• ${pm.card.last4}` : null };
      } catch (err) { out.subscription = { error: err.message }; }
    }
    return json(response, 200, out);
  }

  if (body.action === 'update-login') {
    if (!row.user_id) return json(response, 400, { error: 'This client has no login yet' });
    const patch = {};
    if (body.email) patch.email = String(body.email).trim().toLowerCase(), patch.email_confirm = true;
    if (body.password) {
      if (String(body.password).length < 8) return json(response, 400, { error: 'Password must be at least 8 characters' });
      patch.password = String(body.password);
    }
    if (!Object.keys(patch).length) return json(response, 400, { error: 'Nothing to change' });
    const { error: upErr } = await supabase.auth.admin.updateUserById(row.user_id, patch);
    if (upErr) return json(response, 502, { error: upErr.message });
    if (patch.email) await supabase.from('businesses').update({ data: { ...data, raw: { ...(data.raw || {}), email: patch.email } } }).eq('id', slug);
    return json(response, 200, { ok: true });
  }

  if (body.action === 'save-raw') {
    // Admin edits the client's info through the same 7-card editor the client uses.
    const incoming = body.raw && typeof body.raw === 'object' ? body.raw : {};
    if (JSON.stringify(incoming).length > 200000) return json(response, 400, { error: 'Too much data' });
    const raw = { ...(data.raw || {}), ...incoming, draft: data.raw?.draft };
    const nextData = { ...data, raw };
    if (typeof raw.name === 'string' && raw.name.trim()) nextData.name = raw.name;
    const { error: upErr } = await supabase.from('businesses').update({ data: nextData, ...(nextData.name ? { name: nextData.name } : {}) }).eq('id', slug);
    if (upErr) return json(response, 502, { error: upErr.message });
    return json(response, 200, { ok: true, data: nextData });
  }

  if (body.action === 'send-reset') {
    if (!row.user_id) return json(response, 400, { error: 'This client has no login yet' });
    const { data: u } = await supabase.auth.admin.getUserById(row.user_id);
    const email = u?.user?.email;
    if (!email) return json(response, 400, { error: 'No email on this login' });
    const r = await fetch(`${ACCOUNTS_SUPABASE_URL}/auth/v1/recover`, { method: 'POST', headers: { apikey: ACCOUNTS_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirect_to: 'https://brightsite.app/account/reset-password' }) });
    return r.ok ? json(response, 200, { ok: true, email }) : json(response, 502, { error: 'Could not send the reset email' });
  }

  if (body.action === 'push-customer') {
    const text = String(body.text || '').slice(0, 140);
    await notifyBusiness(slug, { title: 'New message from Tom', body: text || 'Tap to read it.' });
    return json(response, 200, { ok: true });
  }

  if (body.action === 'cancel-plan') {
    if (!stripe || !data.stripeSubscriptionId) return json(response, 400, { error: 'No subscription to cancel' });
    try {
      if (body.now) await stripe.subscriptions.cancel(data.stripeSubscriptionId);
      else await stripe.subscriptions.update(data.stripeSubscriptionId, { cancel_at_period_end: !body.undo });
    } catch (err) { return json(response, 502, { error: err.message }); }
    return json(response, 200, { ok: true });
  }
  return json(response, 400, { error: 'Unknown action' });
}

// Customers' apps and dashboards ping this after they send a message or switch their site off,
// so admins get a push. The caller must own the business.
// A customer's own subscription (plan, renewal / end date, card) for their Account page.
async function mySubscription(request, response, body) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  if (!user?.id) return json(response, 401, { error: 'Authentication required' });
  const { data: row } = await supabaseAdmin().from('businesses').select('user_id,data').eq('id', String(body.slug || '')).maybeSingle();
  if (!row || row.user_id !== user.id) return json(response, 403, { error: 'Forbidden' });
  const subId = row.data?.stripeSubscriptionId;
  if (!subId || !process.env.STRIPE_SECRET_KEY) return json(response, 200, { subscription: null });
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const sub = await stripe.subscriptions.retrieve(subId);
    const price = sub.items?.data?.[0]?.price;
    return json(response, 200, { subscription: { status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end,
      renews: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null, amount: price?.unit_amount, interval: price?.recurring?.interval } });
  } catch (err) { return json(response, 200, { subscription: null }); }
}

async function notifyAdminFromCustomer(request, response, body) {
  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });
  const user = await currentUser(ACCOUNTS_SUPABASE_URL, ACCOUNTS_SUPABASE_ANON_KEY, token).catch(() => null);
  if (!user?.id) return json(response, 401, { error: 'Authentication required' });
  const slug = String(body.slug || '');
  const supabase = supabaseAdmin();
  const { data: row } = await supabase.from('businesses').select('user_id,name,data').eq('id', slug).maybeSingle();
  if (!row || row.user_id !== user.id) return json(response, 403, { error: 'Forbidden' });
  const name = row.name || row.data?.raw?.name || slug;
  const text = String(body.text || '').slice(0, 140);
  if (body.kind === 'message') await notifyAdmins(`💬 ${name}`, text || 'Sent you a message', slug);
  else if (body.kind === 'offline') await notifyAdmins(`${name} went offline`, 'They took their website offline.', slug);
  else if (body.kind === 'online') await notifyAdmins(`${name} is back online`, 'They put their website back online.', slug);
  else return json(response, 400, { error: 'Unknown notification' });
  return json(response, 200, { ok: true });
}

