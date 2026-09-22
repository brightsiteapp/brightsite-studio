const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || 'brightsiteapp@gmail.com')
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
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return json(response, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = bearerToken(request);

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('Admin businesses is missing Supabase server configuration');
    return json(response, 503, { error: 'Account administration is not configured' });
  }
  if (!token) return json(response, 401, { error: 'Authentication required' });

  try {
    const user = await currentUser(supabaseUrl, anonKey, token);
    const email = String(user?.email || '').trim().toLowerCase();
    if (!email || !ADMIN_EMAILS.has(email)) {
      return json(response, 403, { error: 'Administrator access required' });
    }

    const businesses = await fetch(
      `${supabaseUrl}/rest/v1/businesses?select=*&order=updated_at.desc`,
      { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
    );
    if (!businesses.ok) {
      console.error('Admin businesses query failed', businesses.status);
      return json(response, 502, { error: 'Could not load accounts' });
    }

    return json(response, 200, await businesses.json());
  } catch (error) {
    console.error('Admin businesses error', error);
    return json(response, 502, { error: 'Could not load accounts' });
  }
}
