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
//   GET  /stats/:slug?days= — page views + visitors per day for the analytics tab (owner or admin JWT)
//   GET  /site/:slug/*      — serve a live site (sites.brightsite.app/<slug> rewrites here)
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


const SITE_BASE = 'https://sites.brightsite.app/';
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


// ---- Analytics: one small JSON object per site per day at stats/<slug>/<YYYY-MM-DD> ----
const BOT_RE = /bot|crawl|spider|slurp|preview|fetch|monitor|curl|wget|python|headless|lighthouse|facebookexternalhit|whatsapp|telegram|discord/i;

function dayKey(d) { return d.toISOString().slice(0, 10); }

async function sha1Short(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('');
}

function normPath(p) {
  let x = '/' + String(p || '').split(/[?#]/)[0].replace(/^\/+/, '');
  x = x.replace(/\/index\.html$/i, '/').replace(/\.html$/i, '');
  if (x.length > 1) x = x.replace(/\/+$/, '');
  return (x || '/').slice(0, 120);
}

// Adds to today's record for a site: mutate(stats) edits the day's object in place.
async function bumpStats(env, slug, mutate) {
  const key = `stats/${slug}/${dayKey(new Date())}`;
  const existing = await env.MEDIA.get(key);
  const rec = existing ? await existing.json().catch(() => null) : null;
  const stats = rec && typeof rec === 'object' ? rec : { views: 0, visitors: [] };
  stats.pages = stats.pages || {}; stats.clicks = stats.clicks || {};
  await mutate(stats);
  await env.MEDIA.put(key, JSON.stringify(stats), { httpMetadata: { contentType: 'application/json' } });
}

// Counts one page view (HTML only, no bots). Visitors are anonymous: a daily hash of IP + browser,
// never stored beyond that day's list. Approximate by design (concurrent hits can occasionally merge).
async function recordHit(env, slug, request, rel) {
  try {
    const ua = request.headers.get('User-Agent') || '';
    if (!ua || BOT_RE.test(ua)) return;
    const day = dayKey(new Date());
    const ip = request.headers.get('CF-Connecting-IP') || '';
    const visitor = await sha1Short(`${day}|${ip}|${ua}`);
    const page = normPath(rel);
    await bumpStats(env, slug, stats => {
      stats.views = (stats.views || 0) + 1;
      stats.visitors = stats.visitors || [];
      if (stats.visitors.length < 20000 && !stats.visitors.includes(visitor)) stats.visitors.push(visitor);
      const pg = stats.pages[page] || (stats.pages[page] = { views: 0, seconds: 0, timed: 0 });
      pg.views += 1;
    });
  } catch (e) { console.error('recordHit failed', e && e.message); }
}

// Events sent by the tracking script (time on page, contact clicks, form sends).
const CLICK_KINDS = ['phone', 'email', 'whatsapp', 'directions', 'social'];
async function recordEvent(env, slug, request) {
  const ua = request.headers.get('User-Agent') || '';
  if (!ua || BOT_RE.test(ua)) return;
  let e; try { e = JSON.parse(await request.text()); } catch { return; }
  if (!e || typeof e !== 'object') return;
  const page = normPath(e.p);
  await bumpStats(env, slug, stats => {
    if (e.t === 'time') {
      const sec = Math.min(1800, Math.max(0, Math.round(Number(e.s) || 0)));
      if (!sec) return;
      const pg = stats.pages[page] || (stats.pages[page] = { views: 0, seconds: 0, timed: 0 });
      pg.seconds = (pg.seconds || 0) + sec; pg.timed = (pg.timed || 0) + 1;
    } else if (e.t === 'click' && CLICK_KINDS.includes(e.k)) {
      stats.clicks[e.k] = (stats.clicks[e.k] || 0) + 1;
    } else if (e.t === 'form') {
      stats.forms = (stats.forms || 0) + 1;
    }
  });
}

// Small script added to every served page: time on page, contact clicks and form sends.
function trackerScript(slug, basePath) {
  return `<script>(function(){var u='https://${WORKER_HOST}/track/${slug}',b=${JSON.stringify(basePath || '')},act=0,last=Date.now(),vis=!document.hidden;`
  + `function pth(){var p=location.pathname;if(b&&p.indexOf(b)===0)p=p.slice(b.length)||'/';return p}`
  + `function tick(){if(vis)act+=Date.now()-last;last=Date.now()}`
  + `function send(t,k){tick();var d=JSON.stringify({t:t,p:pth(),s:t==='time'?Math.round(act/1000):0,k:k});try{navigator.sendBeacon(u,new Blob([d],{type:'text/plain'}))}catch(e){}if(t==='time')act=0}`
  + `document.addEventListener('visibilitychange',function(){tick();vis=!document.hidden;last=Date.now();if(document.hidden)send('time')});`
  + `addEventListener('pagehide',function(){send('time')});`
  + `document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'',k=/^tel:/i.test(h)?'phone':/^mailto:/i.test(h)?'email':/wa[.]me|whatsapp/i.test(h)?'whatsapp':/maps[.]|goo[.]gl[/]maps|google[.][a-z.]+[/]maps|maps[.]apple/i.test(h)?'directions':/instagram|facebook|tiktok|twitter|x[.]com|linkedin|youtube/i.test(h)?'social':'';if(k)send('click',k)},true);`
  + `document.addEventListener('submit',function(){send('form')},true)})();</script>`;
}

function dayRow(date, rec) {
  return { date, views: rec ? rec.views || 0 : 0, visitors: rec && rec.visitors ? rec.visitors.length : 0, pages: rec ? rec.pages || {} : {}, clicks: rec ? rec.clicks || {} : {}, forms: rec ? rec.forms || 0 : 0 };
}

async function readStats(env, slug, days) {
  const out = [];
  const today = new Date();
  const dates = [];
  for (let i = days - 1; i >= 0; i--) dates.push(dayKey(new Date(today.getTime() - i * 86400000)));
  const recs = await Promise.all(dates.map(async d => {
    const o = await env.MEDIA.get(`stats/${slug}/${d}`);
    return o ? o.json().catch(() => null) : null;
  }));
  dates.forEach((d, i) => out.push(dayRow(d, recs[i])));
  return out;
}

// All-time stats: every recorded day for the site (capped at 2000 days), oldest first.
async function readAllStats(env, slug) {
  const keys = [];
  let cursor;
  do {
    const page = await env.MEDIA.list({ prefix: `stats/${slug}/`, cursor, limit: 1000 });
    page.objects.forEach(o => keys.push(o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && keys.length < 2000);
  keys.sort();
  const recs = await Promise.all(keys.slice(-2000).map(async k => {
    const o = await env.MEDIA.get(k);
    return o ? o.json().catch(() => null) : null;
  }));
  return keys.slice(-2000).map((k, i) => dayRow(k.split('/').pop(), recs[i]));
}

// Serves <slug>/site/<path>, trying path, path/index.html and path.html. basePath is set when
// served under sites.brightsite.app/<slug>/ so the site's relative links resolve there.
async function serveSite(env, slug, path, basePath, ctx, request) {
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
    if (ctx && request && type.startsWith('text/html')) ctx.waitUntil(recordHit(env, slug, request, c));
    const headers = { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') ? 'public, max-age=60' : 'public, max-age=3600' };
    if (type.startsWith('text/html')) {
      let html = await obj.text();
      if (basePath && !/<base\s/i.test(html)) html = html.replace(/<head([^>]*)>/i, `<head$1><base href="${basePath}">`);
      const tracker = trackerScript(slug, basePath);
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, tracker + '</body>') : html + tracker;
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
  async fetch(request, env, ctx) {
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
        return serveSite(env, mapped ? (await mapped.text()).trim() : '', path, '', ctx, request);
      }

      const siteMatch = path.match(/^\/site\/([a-z0-9-]+)(\/.*)?$/);
      if (request.method === 'GET' && siteMatch) {
        return serveSite(env, siteMatch[1], siteMatch[2] || '/', `/${siteMatch[1]}/`, ctx, request);
      }

      const trackMatch = path.match(/^\/track\/([a-z0-9-]+)$/);
      if (request.method === 'POST' && trackMatch) {
        ctx.waitUntil(recordEvent(env, trackMatch[1], request).catch(() => {}));
        return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      const statsMatch = path.match(/^\/stats\/([a-z0-9-]+)$/);
      if (request.method === 'GET' && statsMatch) {
        const slug = statsMatch[1];
        try { await verifyAdminAuth(request); } catch { await verifyAuth(request, slug); }
        if (url.searchParams.get('days') === 'all') return json({ days: await readAllStats(env, slug) }, 200, origin);
        const days = Math.min(90, Math.max(1, parseInt(url.searchParams.get('days'), 10) || 30));
        return json({ days: await readStats(env, slug, days) }, 200, origin);
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
        await env.MEDIA.put(key, body, { httpMetadata: { contentType: contentTypeFor(key), cacheControl: contentTypeFor(key).startsWith('text/html') ? 'public, max-age=60' : 'public, max-age=86400' } });
        return json({ url: `${R2_PUBLIC_URL}/${key}`, path: relPath }, 200, origin);
      }

      // POST /upload — key comes from x-file-name as "slug/file"
      if (request.method === 'POST' && path === '/upload') {
        const key = (request.headers.get('x-file-name') || '').replace(/^\/+/, '');
        const [slug, ...rest] = key.split('/');
        if (!slug || !rest.length || key.includes('..')) return json({ error: 'Bad file name' }, 400, origin);
        await verifyAuth(request, slug);
        await env.MEDIA.put(key, await request.arrayBuffer(), { httpMetadata: { contentType: contentTypeFor(key), cacheControl: 'public, max-age=86400' } });
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
