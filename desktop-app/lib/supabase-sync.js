// Shared, no-sign-in cross-device sync. Local JSON files (site-storage.js)
// are always the source of truth and always work offline — this module
// only mirrors project data and media to one shared Supabase project so
// every install of the app (this college's whole team) sees the same
// businesses and gets each other's edits automatically.
//
// Config comes from lib/shared-config.js (bundled into the packaged app —
// fill it in once before distributing, see README "Shared sync setup"),
// with SUPABASE_URL / SUPABASE_ANON_KEY env vars as a dev-time override.
// If neither is set, every function below is a safe no-op and the app is
// purely local, exactly as before this feature existed.
const fs = require('fs');
const path = require('path');
const bundled = require('./shared-config');
const storage = require('./site-storage');

const TABLE = 'businesses';
const BUCKET = 'business-media';

// The service role key, saved from Settings the same way the Stripe key
// is (see lib/stripe.js) — lives on this computer only, in
// ~/BrightSiteProjects/accounts-settings.json. SUPABASE_SERVICE_ROLE_KEY
// in the environment overrides it for development. Deliberately never
// bundled in shared-config.js: unlike the anon key, this key bypasses RLS
// entirely, so shipping it in the packaged app would hand every install
// full admin access to every customer's data.
const ACCOUNTS_SETTINGS_FILE = path.join(storage.ROOT, 'accounts-settings.json');

function readAccountsSettings() {
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_SETTINGS_FILE, 'utf8')); } catch { return {}; }
}

function accountsKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || readAccountsSettings().serviceRoleKey || '';
}

function setAccountsKey(serviceRoleKey) {
  storage.ensureRoot();
  if (serviceRoleKey) fs.writeFileSync(ACCOUNTS_SETTINGS_FILE, JSON.stringify({ serviceRoleKey }, null, 2));
  else fs.rmSync(ACCOUNTS_SETTINGS_FILE, { force: true });
}

function config() {
  return {
    url: process.env.SUPABASE_URL || bundled.SUPABASE_URL || '',
    key: process.env.SUPABASE_ANON_KEY || bundled.SUPABASE_ANON_KEY || ''
  };
}

function enabled() {
  const { url, key } = config();
  return !!(url && key);
}

// Service role key, for admin-only reads (listing customer accounts) that
// the anon key can't do — auth.users isn't exposed to it. Saved from
// Settings (see accountsKey/setAccountsKey above) or SUPABASE_SERVICE_ROLE_KEY
// in the environment for development.
function accountsEnabled() {
  const { url } = config();
  return !!(url && accountsKey());
}

// Proves the key can list auth users, for Settings to confirm before saving.
async function testAccountsKey(key) {
  const { url } = config();
  if (!url) throw new Error('Shared sync isn’t configured, so there’s no Supabase project to check this key against.');
  const res = await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  });
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Supabase rejected that key.' : `Supabase error ${res.status}`);
}

// One account per Supabase Auth user (account/login.html signups), with
// the business(es) they've designed via account/dashboard.html — [] if no
// service role key is configured (see accountsEnabled above) or the
// request fails.
async function fetchAccounts() {
  if (!accountsEnabled()) return [];
  const { url } = config();
  const key = accountsKey();
  const serviceHeaders = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const [usersRes, businessesRes] = await Promise.all([
      fetch(`${url}/auth/v1/admin/users?per_page=1000`, { headers: serviceHeaders }),
      fetch(`${url}/rest/v1/${TABLE}?select=id,name,user_id,updated_at&user_id=not.is.null`, { headers: serviceHeaders })
    ]);
    if (!usersRes.ok) throw new Error(`accounts fetch failed: ${usersRes.status}`);
    const { users } = await usersRes.json();
    const businesses = businessesRes.ok ? await businessesRes.json() : [];
    return users.map(u => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      sites: businesses.filter(b => b.user_id === u.id).map(b => ({ slug: b.id, name: b.name, updatedAt: b.updated_at }))
    }));
  } catch (err) {
    console.error('[supabase-sync] fetchAccounts failed:', err.message);
    return [];
  }
}

function headers(extra) {
  const { key } = config();
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// New rows in the public site's write-only `leads` table (account/dashboard.html's
// "Request an update" modal, see supabase/leads_schema.sql) since `afterId` —
// the anon key can insert but not read it, so this needs the same service
// role key as fetchAccounts. [] if accounts aren't connected or the request fails.
async function fetchNewLeads(afterId = 0) {
  if (!accountsEnabled()) return [];
  const { url } = config();
  try {
    const res = await fetch(`${url}/rest/v1/leads?id=gt.${Number(afterId) || 0}&order=id.asc&limit=200`, { headers: accountHeaders() });
    if (!res.ok) throw new Error(`leads fetch failed: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('[supabase-sync] fetchNewLeads failed:', err.message);
    return [];
  }
}

function accountHeaders(extra) {
  const key = accountsKey();
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

// Removes their Supabase login only — an account's associated business(es)
// (if any) are untouched, since a business is the customer's site/data,
// not their credentials.
async function deleteAccount(id) {
  if (!accountsEnabled()) throw new Error('Accounts aren’t connected — add the Supabase service role key in Settings first.');
  const { url } = config();
  const res = await fetch(`${url}/auth/v1/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE', headers: accountHeaders() });
  if (!res.ok) throw new Error(`Couldn’t delete that account (${res.status}).`);
}

// ---------------- status, for the UI's sync indicator ----------------
// 'disabled' — sync not configured, app is local-only (not shown as an
// error state, just doesn't render an indicator at all).
// 'synced' | 'syncing' | 'offline' (last attempt failed — network down,
// project unreachable, etc; local edits are still saved regardless).
const status = { state: enabled() ? 'synced' : 'disabled', lastError: null, lastSyncedAt: null };

function setStatus(state, err) {
  status.state = state;
  status.lastError = err ? err.message : null;
  if (state === 'synced') status.lastSyncedAt = new Date().toISOString();
}

function getStatus() {
  // projectUrl is safe to expose to the renderer (it's shown in a small
  // "what am I connected to" tooltip) — it's a public-facing hostname,
  // never the anon key itself.
  return { ...status, projectUrl: enabled() ? config().url : null };
}

// Projects whose last push failed while offline — retried the next time
// something proves connectivity is back (a successful pull, or the next
// app launch), per "retain local changes and retry" requirement.
const pendingPushes = new Set();
const pendingDeletes = new Set();

async function pullAll() {
  if (!enabled()) return [];
  setStatus('syncing');
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/${TABLE}?select=*`, { headers: headers() });
    if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);
    const rows = await res.json();
    setStatus('synced');
    return rows;
  } catch (err) {
    setStatus('offline', err);
    console.error('[supabase-sync] pull failed, continuing local-only:', err.message);
    return [];
  }
}

// Fetches just one remote row's updated_at, to guard against an older
// local copy (e.g. a laptop that's been offline for a while) overwriting
// a newer shared version on push — the safe direction is always to pull
// the newer remote version down instead, never push a stale one up.
async function remoteUpdatedAt(slug) {
  const { url } = config();
  const res = await fetch(`${url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(slug)}&select=updated_at`, { headers: headers() });
  if (!res.ok) throw new Error(`Sync check failed: ${res.status}`);
  const rows = await res.json();
  return rows[0]?.updated_at || null;
}

async function pushOne(project) {
  if (!enabled() || !project?.slug) return;
  setStatus('syncing');
  try {
    const remoteAt = await remoteUpdatedAt(project.slug).catch(() => null);
    if (remoteAt && project.updatedAt && new Date(remoteAt) > new Date(project.updatedAt)) {
      // Remote is newer than what we're about to push (this local copy is
      // stale) — skip the push; the next pullAll() will bring the newer
      // shared version down instead of us clobbering it.
      setStatus('synced');
      return;
    }
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' }),
      body: JSON.stringify({
        id: project.slug,
        name: project.raw?.name || project.name,
        data: project,
        updated_at: project.updatedAt || new Date().toISOString()
      })
    });
    if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);
    pendingPushes.delete(project.slug);
    setStatus('synced');
  } catch (err) {
    pendingPushes.add(project.slug);
    setStatus('offline', err);
    console.error('[supabase-sync] push failed, local copy is still saved:', err.message);
  }
}

async function deleteOne(slug) {
  if (!enabled() || !slug) return;
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/${TABLE}?id=eq.${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: headers()
    });
    if (!res.ok) throw new Error(`Sync delete failed: ${res.status}`);
    pendingDeletes.delete(slug);
  } catch (err) {
    pendingDeletes.add(slug);
    console.error('[supabase-sync] delete failed, will retry:', err.message);
  }
}

// Call after anything that proves connectivity is back (a successful
// pullAll, or on a timer) to retry pushes that failed while offline.
async function flushPending(readProjectFn) {
  if (!enabled()) return;
  if (pendingPushes.size) {
    for (const slug of [...pendingPushes]) {
      const project = readProjectFn(slug);
      if (project) await pushOne(project);
      else pendingPushes.delete(slug); // project was deleted locally in the meantime
    }
  }
  if (pendingDeletes.size) {
    for (const slug of [...pendingDeletes]) await deleteOne(slug);
  }
}

// ---------------- media (logo / hero / gallery) ----------------
// Uploaded/downloaded under the same relative path used locally
// (img/hero.jpg, img/gallery/169...jpg) inside a per-project folder in
// the shared bucket, so the local file layout and the bucket layout
// always match slug-for-slug, path-for-path.
function contentTypeFor(ext) {
  return { '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' }[ext.toLowerCase()] || 'application/octet-stream';
}

async function uploadMedia(slug, relPath, buffer) {
  if (!enabled()) return;
  try {
    const { url } = config();
    const objectPath = `${slug}/${relPath}`;
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': contentTypeFor(path.extname(relPath)), 'x-upsert': 'true' }),
      body: buffer
    });
    if (!res.ok && res.status !== 409) throw new Error(`Media upload failed: ${res.status}`);
  } catch (err) {
    console.error('[supabase-sync] media upload failed, local copy is still saved:', err.message);
  }
}

async function downloadMedia(slug, relPath) {
  if (!enabled()) return null;
  try {
    const { url } = config();
    const objectPath = `${slug}/${relPath}`;
    // The bucket is public (so a plain URL can be handed to a browser if
    // ever needed), but this app always downloads server-side with its
    // own key — use the authenticated object endpoint (no /public/
    // segment) rather than the public one, which sits behind a CDN cache
    // that can keep serving deleted content for a while after a real
    // delete has already succeeded (confirmed directly: the public URL
    // kept returning 200 with the old bytes after the object was gone;
    // this endpoint correctly 400s immediately).
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${objectPath}`, { headers: headers() });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error('[supabase-sync] media download failed:', err.message);
    return null;
  }
}

async function deleteMedia(slug, relPath) {
  if (!enabled()) return;
  try {
    const { url } = config();
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${slug}/${relPath}`, { method: 'DELETE', headers: headers() });
    if (!res.ok && res.status !== 404) throw new Error(`Media delete failed: ${res.status}`);
  } catch (err) {
    console.error('[supabase-sync] media delete failed:', err.message);
  }
}

// After pulling a project record that's new to this machine (or that
// references media this machine doesn't have on disk yet), download each
// referenced photo from the shared bucket so it displays here too.
async function syncMediaForProject(projectDir, data) {
  if (!enabled()) return;
  const raw = data.raw || {};
  const paths = [raw.logoImage, raw.heroImage, ...(raw.gallery || [])].filter(Boolean);
  for (const relPath of paths) {
    const localFile = path.join(projectDir, relPath);
    if (fs.existsSync(localFile)) continue;
    const buffer = await downloadMedia(data.slug, relPath);
    if (!buffer) continue;
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    fs.writeFileSync(localFile, buffer);
  }
}

// ---------------- "Demo opened" tracking (supabase/demo_views.sql) ----------------

// Added to every exported site: records one view per page open. Our own
// opens carry ?bs_owner=1 (see ownerUrl in public/app.js), which that
// browser remembers and skips from then on; local previews never count.
function viewBeaconScript(slug) {
  if (!enabled()) return '';
  const { url, key } = config();
  return `<script>(function(){try{var s=localStorage;if(/[?&]bs_owner=1/.test(location.search))s.setItem('bs_owner','1');` +
    `if(s.getItem('bs_owner')||location.protocol!=='https:'||/localhost|127\\.0\\.0\\.1/.test(location.hostname))return;` +
    `fetch(${JSON.stringify(`${url}/rest/v1/demo_views`)},{method:'POST',keepalive:true,headers:{apikey:${JSON.stringify(key)},` +
    `Authorization:${JSON.stringify(`Bearer ${key}`)},'Content-Type':'application/json',Prefer:'return=minimal'},` +
    `body:${JSON.stringify(JSON.stringify({ slug }))}})}catch(e){}})();</script>`;
}

// { slug: { count, last, opens } } (opens newest first, used by follow-up
// reminders) — {} if sync is off or the table isn't set up yet.
async function pullDemoViews() {
  if (!enabled()) return {};
  try {
    const { url } = config();
    const res = await fetch(`${url}/rest/v1/demo_views?select=slug,viewed_at&order=viewed_at.desc&limit=10000`, { headers: headers() });
    if (!res.ok) return {};
    const views = {};
    for (const row of await res.json()) {
      const v = views[row.slug] || (views[row.slug] = { count: 0, last: row.viewed_at, opens: [] });
      v.count += 1;
      v.opens.push(row.viewed_at);
    }
    return views;
  } catch {
    return {};
  }
}

module.exports = {
  viewBeaconScript,
  pullDemoViews,
  enabled, pullAll, pushOne, deleteOne, flushPending, getStatus,
  uploadMedia, downloadMedia, deleteMedia, syncMediaForProject,
  accountsEnabled, fetchAccounts, testAccountsKey, setAccountsKey, deleteAccount, fetchNewLeads
};
