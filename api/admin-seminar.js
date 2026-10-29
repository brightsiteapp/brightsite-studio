import { supabaseAdmin } from './_lib/supabase-admin.js';

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

async function currentUser(token) {
  const result = await fetch(`${ACCOUNTS_SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ACCOUNTS_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
  });
  if (!result.ok) return null;
  return result.json();
}

// Lists every seminar sign-up for the admin app. Admin-only: the caller's
// Supabase token must belong to an address in ADMIN_EMAILS.
const ALLOWED_ORIGINS = ['https://brightsite.app', 'https://www.brightsite.app'];

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!ALLOWED_ORIGINS.includes(origin)) return;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Max-Age', '86400');
  response.setHeader('Vary', 'Origin');
}

// Lists every seminar sign-up for the admin app. Admin-only: the caller's
// Supabase token must belong to an address in ADMIN_EMAILS.
export default async function handler(request, response) {
  applyCors(request, response);

  // Answer the browser's preflight before any auth check.
  if (request.method === 'OPTIONS') return response.status(204).end();

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const token = bearerToken(request);
  if (!token) return json(response, 401, { error: 'Authentication required' });

  try {
    const user = await currentUser(token);
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) {
      return json(response, 403, { error: 'Administrator access required' });
    }

    const { data, error } = await supabaseAdmin()
      .from('seminar_signups')
      // '*' so preferred_time comes through once that column exists, without breaking before it does.
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return json(response, 500, { error: 'Could not load sign-ups' });

    return json(response, 200, data);
  } catch {
    return json(response, 500, { error: 'Could not load sign-ups' });
  }
}
