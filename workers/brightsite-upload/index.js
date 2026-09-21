// Cloudflare Worker — media upload/delete proxy for brightsite-media R2.
// R2 credentials never reach the browser; this Worker holds the binding.
//
// Routes (all require a valid Supabase JWT in Authorization header):
//   PUT  /upload/:slug/*    — store a file, return { url }
//   DELETE /delete/:slug/*  — delete a file
//   GET  /list/:slug/*      — list objects under a prefix, return [{ name, size }]
//
// CORS is open to brightsite.app and localhost (dev).

const ALLOWED_ORIGINS = [
  'https://brightsite.app',
  'https://www.brightsite.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

const R2_PUBLIC_URL = 'https://pub-38c2019362f64b6780e0b217ba84be8c.r2.dev';
const SUPABASE_URL  = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const SUPABASE_ANON = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-slug',
    'Access-Control-Max-Age': '86400'
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) }
  });
}

// Verify the Supabase JWT belongs to the right user for this slug.
// Returns the user object on success, throws on failure.
async function verifyAuth(request, slug) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('Missing token');

  // Ask Supabase to validate the JWT and return the user
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Unauthorized');
  const user = await res.json();
  if (!user || !user.id) throw new Error('Unauthorized');

  // Confirm this user owns this slug
  const bizRes = await fetch(
    `${SUPABASE_URL}/rest/v1/businesses?select=id&id=eq.${encodeURIComponent(slug)}&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` } }
  );
  if (!bizRes.ok) throw new Error('Unauthorized');
  const rows = await bizRes.json();
  if (!rows || !rows.length) throw new Error('Forbidden');

  return user;
}

// Admin check: header bs-admin-secret set by admin.html from localStorage
// We trust the Supabase JWT instead — admin.html signs in with Google OAuth
// and gets a Supabase session. For admin uploads (site zips), slug ownership
// check is skipped because the admin may upload for any customer.
async function verifyAdminAuth(request) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('Missing token');
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error('Unauthorized');
  const user = await res.json();
  if (!user || !user.email) throw new Error('Unauthorized');
  if (user.email !== 'brightsiteapp@gmail.com') throw new Error('Forbidden');
  return user;
}

function contentTypeFor(key) {
  const ext = (key.split('.').pop() || '').toLowerCase();
  const map = {
    html: 'text/html; charset=utf-8',
    css:  'text/css',
    js:   'application/javascript',
    json: 'application/json',
    xml:  'application/xml',
    txt:  'text/plain',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif:  'image/gif',
    svg:  'image/svg+xml',
    ico:  'image/x-icon',
    zip:  'application/zip'
  };
  return map[ext] || 'application/octet-stream';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname; // e.g. /upload/my-slug/img/logo.png

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // PUT /upload/:slug/* — customer image upload
      const uploadMatch = path.match(/^\/upload\/([^/]+)\/(.+)$/);
      if (request.method === 'PUT' && uploadMatch) {
        const [, slug, relPath] = uploadMatch;
        const isAdmin = request.headers.get('x-admin') === '1';
        if (isAdmin) {
          await verifyAdminAuth(request);
        } else {
          await verifyAuth(request, slug);
        }
        const body = await request.arrayBuffer();
        const key = `${slug}/${relPath}`;
        await env.MEDIA.put(key, body, { httpMetadata: { contentType: contentTypeFor(key) } });
        return json({ url: `${R2_PUBLIC_URL}/${key}`, path: relPath }, 200, origin);
      }

      // DELETE /delete/:slug/* — remove a file
      const deleteMatch = path.match(/^\/delete\/([^/]+)\/(.+)$/);
      if (request.method === 'DELETE' && deleteMatch) {
        const [, slug, relPath] = deleteMatch;
        const isAdmin = request.headers.get('x-admin') === '1';
        if (isAdmin) {
          await verifyAdminAuth(request);
        } else {
          await verifyAuth(request, slug);
        }
        await env.MEDIA.delete(`${slug}/${relPath}`);
        return json({ ok: true }, 200, origin);
      }

      // GET /list/:slug/* — list objects (admin only, used by Vercel deploy)
      const listMatch = path.match(/^\/list\/([^/]+)(?:\/(.*))?$/);
      if (request.method === 'GET' && listMatch) {
        await verifyAdminAuth(request);
        const [, slug, prefix] = listMatch;
        const r2prefix = prefix ? `${slug}/${prefix}` : `${slug}/`;
        const listed = await env.MEDIA.list({ prefix: r2prefix });
        const items = listed.objects.map(o => ({
          name: o.key.replace(r2prefix, ''),
          size: o.size,
          url: `${R2_PUBLIC_URL}/${o.key}`
        }));
        return json(items, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (err) {
      const status = err.message === 'Unauthorized' || err.message === 'Missing token' ? 401
        : err.message === 'Forbidden' ? 403 : 500;
      return json({ error: err.message }, status, origin);
    }
  }
};
