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
    response.setHeader('Access-Control-Allow-Headers', 'Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return response.status(204).end();

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
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
