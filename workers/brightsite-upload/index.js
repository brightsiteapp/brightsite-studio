// Cloudflare Worker — media upload/delete proxy for brightsite-media R2.
// R2 credentials never reach the browser; this Worker holds the binding.
//
// Routes (all require a valid Supabase JWT in Authorization header):
//   PUT  /upload/:slug/*    — store a file, return { url }
//   POST /upload            — same, with the key ("slug/file") in the x-file-name header (app + dashboard)
//   DELETE /delete/:slug/*  — delete a file
//   GET  /list/:slug/*      — list objects under a prefix, return [{ name, size }]
//   POST /publish           — { slug, live, domain? } turn a site on/off (Bearer PUBLISH_KEY, admin JWT,
//                             or the owner's JWT when their plan is active)
//   GET  /status/:slug      — { live, url } — whether the site is really being served
//   GET  /site/:slug/*      — serve a live site (brightsite.app/s/<slug> rewrites here)
//   any GET on a customer's own domain — serve the site mapped to that host
//
// Sites are the zips uploaded on admin.html, stored at <slug>/site/. A site is served only
// while live/<slug> exists; domains/<host> maps a customer's domain to its slug.
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
    'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-slug, x-admin, x-file-name',
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


const SITE_BASE = 'https://brightsite.app/s/';
const WORKER_HOST = 'brightsite-upload.notify-lead-worker.workers.dev';

function cleanHost(h) { return String(h || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, ''); }

async function siteIndexExists(env, slug) {
  return !!(await env.MEDIA.head(`${slug}/site/index.html`));
}

async function isLive(env, slug) {
  return !!(await env.MEDIA.head(`live/${slug}`));
}

async function siteUrlFor(env, slug) {
  const marker = await env.MEDIA.get(`live/${slug}`);
  const domain = marker ? ((await marker.json().catch(() => ({}))).domain || '') : '';
  return domain ? `https://${domain}` : `${SITE_BASE}${slug}`;
}

const NOT_LIVE_PAGE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Coming soon</title><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#F4EDE6;font-family:Avenir Next,-apple-system,sans-serif;color:#1C2832;text-align:center"><div><h1 style="font-size:24px;margin:0 0 8px">Coming soon</h1><p style="color:#69747B;margin:0">This website isn’t live yet.</p></div>';

// Serves <slug>/site/<path>, trying path, path/index.html and path.html. basePath is set when
// served under brightsite.app/s/<slug>/ so the site's relative links resolve there.
async function serveSite(env, slug, path, basePath) {
  if (!slug || !(await isLive(env, slug))) {
    return new Response(NOT_LIVE_PAGE, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
  const rel = decodeURIComponent(path).replace(/^\/+/, '').replace(/\.\.+/g, '');
  const candidates = rel === '' || rel.endsWith('/')
    ? [`${rel}index.html`]
    : [rel, `${rel}/index.html`, `${rel}.html`];
  for (const c of candidates) {
    const obj = await env.MEDIA.get(`${slug}/site/${c}`);
    if (!obj) continue;
    const type = contentTypeFor(c);
    const headers = { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') ? 'public, max-age=60' : 'public, max-age=3600' };
    if (basePath && type.startsWith('text/html')) {
      let html = await obj.text();
      if (!/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${basePath}">`);
      return new Response(html, { headers });
    }
    return new Response(obj.body, { headers });
  }
  const notFound = await env.MEDIA.get(`${slug}/site/404.html`);
  return new Response(notFound ? notFound.body : 'Page not found', { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Who may switch a site on or off: the server (PUBLISH_KEY), the admin, or the owner —
// owners may only go live while their plan is paid.
async function authorisePublish(request, env, slug, live) {
  const auth = request.headers.get('Authorization') || '';
  if (env.PUBLISH_KEY && auth === `Bearer ${env.PUBLISH_KEY}`) return;
  try { await verifyAdminAuth(request); return; } catch {}
  await verifyAuth(request, slug);
  if (!live) return;
  const token = auth.slice(7);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/businesses?select=data&id=eq.${encodeURIComponent(slug)}&limit=1`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` }
  });
  const rows = res.ok ? await res.json() : [];
  if (!rows[0]?.data?.planActive) throw new Error('Forbidden');
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
      // Customer's own domain: everything on that host is their site.
      const host = url.hostname.toLowerCase();
      if (request.method === 'GET' && host !== WORKER_HOST && !host.endsWith('.workers.dev') && host !== 'localhost' && host !== '127.0.0.1') {
        const mapped = await env.MEDIA.get(`domains/${cleanHost(host)}`);
        return serveSite(env, mapped ? (await mapped.text()).trim() : '', path, '');
      }

      const siteMatch = path.match(/^\/site\/([a-z0-9-]+)(\/.*)?$/);
      if (request.method === 'GET' && siteMatch) {
        return serveSite(env, siteMatch[1], siteMatch[2] || '/', `/s/${siteMatch[1]}/`);
      }

      const statusMatch = path.match(/^\/status\/([a-z0-9-]+)$/);
      if (request.method === 'GET' && statusMatch) {
        const slug = statusMatch[1];
        const live = (await isLive(env, slug)) && (await siteIndexExists(env, slug));
        return json({ live, url: live ? await siteUrlFor(env, slug) : null, hasSite: await siteIndexExists(env, slug) }, 200, origin);
      }

      if (request.method === 'POST' && path === '/publish') {
        const { slug, live, domain } = await request.json();
        if (!/^[a-z0-9-]+$/.test(slug || '')) return json({ error: 'Bad slug' }, 400, origin);
        await authorisePublish(request, env, slug, !!live);
        const host = cleanHost(domain);
        if (live) {
          if (!(await siteIndexExists(env, slug))) return json({ error: 'No website uploaded yet' }, 409, origin);
          const previous = await env.MEDIA.get(`live/${slug}`);
          const keepDomain = previous ? ((await previous.json().catch(() => ({}))).domain || '') : '';
          const finalDomain = host || keepDomain;
          await env.MEDIA.put(`live/${slug}`, JSON.stringify({ domain: finalDomain, at: new Date().toISOString() }), { httpMetadata: { contentType: 'application/json' } });
          if (finalDomain) await env.MEDIA.put(`domains/${finalDomain}`, slug);
        } else {
          await env.MEDIA.delete(`live/${slug}`);
        }
        return json({ live: !!live, url: live ? await siteUrlFor(env, slug) : null }, 200, origin);
      }
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

      // POST /upload — key comes from x-file-name as "slug/file"
      if (request.method === 'POST' && path === '/upload') {
        const key = (request.headers.get('x-file-name') || '').replace(/^\/+/, '');
        const [slug, ...rest] = key.split('/');
        if (!slug || !rest.length || key.includes('..')) return json({ error: 'Bad file name' }, 400, origin);
        await verifyAuth(request, slug);
        await env.MEDIA.put(key, await request.arrayBuffer(), { httpMetadata: { contentType: contentTypeFor(key) } });
        return json({ key, url: `${R2_PUBLIC_URL}/${key}` }, 200, origin);
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
  },

  // Daily: delete photos from signups left as unsent drafts for 30+ days. The database clears
  // their photo links and returns their slugs; only top-level logo/hero/gallery files are removed.
  async scheduled(event, env) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/stale_draft_media`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_key: env.CLEANUP_KEY }),
    });
    if (!res.ok) { console.error('stale_draft_media failed', res.status, await res.text()); return; }
    const slugs = await res.json();
    for (const slug of slugs) {
      const listed = await env.MEDIA.list({ prefix: `${slug}/` });
      const photos = listed.objects.map(o => o.key).filter(k => /^[^/]+\/(logo|hero|gallery)[^/]*$/.test(k));
      if (photos.length) await env.MEDIA.delete(photos);
      console.log(`cleaned ${photos.length} photos for draft ${slug}`);
    }
  }
};
