const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const storage = require('./lib/site-storage');
const { scrapeFacebook, parseGoogleMapsUrl } = require('./lib/scrape');
const { runClaudeEdit } = require('./lib/ai-edit');
const { runClaudeLookup, runClaudeExtract, runClaudeSearch } = require('./lib/ai-import');
const browserFetch = require('./lib/browser-fetch');
const businessSearch = require('./lib/business-search');
const places = require('./lib/places');
const sync = require('./lib/supabase-sync');
const { deployToVercel, canDeploy, resetCanDeploy, takeOffline, addDomain, removeDomain } = require('./lib/deploy');
const siteImport = require('./lib/site-import');
const connections = require('./lib/connections');
const stripe = require('./lib/stripe');
const { version: APP_VERSION } = require('./package.json');

const PORT = process.env.PORT || 4173;
const GENERATOR_DIR = fs.existsSync(path.join(__dirname, '..', 'demo-generator.js'))
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath || __dirname, 'generator');

// Options are for BrightSite Studio V2 (../desktop-app-v2), which runs this
// same server with its own page on top: `publicDir` is served before this
// app's public/ (so its index.html wins, everything else falls through to
// ours) and `appVersion` is what /api/app-info reports. Without options
// this app behaves exactly as it always has.
function createApp(options = {}) {
  const appVersion = options.appVersion || APP_VERSION;
  const app = express();
  app.use(express.json({ limit: '2mb' }));
  // Scripts on a copied website sometimes load files by root path
  // ("/assets/app.js"), which in the preview would hit Studio itself —
  // when the request comes from a copied site, serve that site's file.
  app.use((req, res, next) => {
    const m = /\/projects\/([\w-]+)\/site\//.exec(req.get('referer') || '');
    if (!m || req.path.startsWith('/projects/') || req.path.startsWith('/api/')) return next();
    const siteDir = path.join(storage.projectDir(m[1]), 'site');
    let file;
    try { file = path.join(siteDir, decodeURIComponent(req.path)); } catch { return next(); }
    if (!file.startsWith(siteDir + path.sep)) return next();
    fs.stat(file, (err, stat) => (err || !stat.isFile() ? next() : res.sendFile(file)));
  });
  if (options.publicDir) app.use(express.static(options.publicDir));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/generator', express.static(GENERATOR_DIR));
  app.use('/projects', express.static(storage.ROOT));

  const upload = multer({ limits: { fileSize: 15 * 1024 * 1024 } });

  // If Supabase sync is configured (see lib/supabase-sync.js), merge in
  // any remote records newer than what's on disk — e.g. another install
  // of the app — before listing, download any media those records
  // reference that isn't on this machine yet, and retry any pushes that
  // failed earlier while offline. Purely additive: local-only stays
  // fully functional when sync isn't configured (pullAll resolves to []).
  app.get('/api/projects', async (req, res) => {
    if (sync.enabled()) {
      const remote = await sync.pullAll();
      for (const row of remote) {
        const local = storage.readProject(row.id);
        if (!local || new Date(row.updated_at) > new Date(local.updatedAt || 0)) {
          storage.upsertProject(row.id, row.data);
        }
        await sync.syncMediaForProject(storage.projectDir(row.id), row.data);
      }
      sync.flushPending(storage.readProject);
    }
    res.json(storage.listProjects());
  });

  app.get('/api/sync-status', (req, res) => res.json(sync.getStatus()));
  app.get('/api/demo-views', async (req, res) => res.json(await sync.pullDemoViews()));
  app.get('/api/can-deploy', async (req, res) => res.json({ canDeploy: await canDeploy() }));
  app.get('/api/app-info', (req, res) => res.json({ version: appVersion }));

  app.post('/api/projects', (req, res) => {
    const project = storage.createProject(req.body?.name || '', { pipelineStage: req.body?.pipelineStage });
    sync.pushOne(project);
    res.json(project);
  });

  app.get('/api/projects/:slug', (req, res) => {
    const project = storage.readProject(req.params.slug);
    if (!project) return res.status(404).json({ error: 'Not found' });
    res.json(project);
  });

  // A logo/hero/gallery path that's no longer referenced after this save
  // (removed, or replaced by a same-slot re-upload with a different file
  // extension — gallery uploads always get a fresh filename, so removing
  // one only ever drops it from this list) is genuinely orphaned: nothing
  // in the app will ever read it again. Clean it up both locally and from
  // the shared bucket instead of leaking it forever.
  function mediaPaths(raw) {
    return [raw?.logoImage, raw?.heroImage, ...(raw?.gallery || [])].filter(Boolean);
  }
  function cleanupRemovedMedia(slug, beforeRaw, afterRaw) {
    const kept = new Set(mediaPaths(afterRaw));
    for (const relPath of mediaPaths(beforeRaw)) {
      if (kept.has(relPath)) continue;
      sync.deleteMedia(slug, relPath);
      try { fs.unlinkSync(path.join(storage.projectDir(slug), relPath)); } catch { /* already gone */ }
    }
  }

  app.put('/api/projects/:slug', (req, res) => {
    try {
      const before = storage.readProject(req.params.slug);
      const project = storage.saveProject(req.params.slug, req.body || {});
      sync.pushOne(project);
      cleanupRemovedMedia(req.params.slug, before?.raw, project.raw);
      res.json(project);
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:slug', (req, res) => {
    try {
      const project = storage.readProject(req.params.slug);
      storage.deleteProject(req.params.slug);
      sync.deleteOne(req.params.slug);
      mediaPaths(project?.raw).forEach(relPath => sync.deleteMedia(req.params.slug, relPath));
      res.json({ ok: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });

  // Natural-language edit, run through the user's local Claude Code CLI —
  // see lib/ai-edit.js for why (their own subscription, no API key, one
  // focused single-shot call, never invents facts).
  app.post('/api/projects/:slug/ai-edit', async (req, res) => {
    const instruction = String(req.body?.instruction || '').trim();
    if (!instruction) return res.status(400).json({ error: 'Instruction is required' });
    const project = storage.readProject(req.params.slug);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    try {
      const { fieldPatch, profilePatch } = await runClaudeEdit(project, instruction);
      // Capture the exact previous values for every touched field so an
      // undo can restore them precisely, not just clear them.
      const beforeFields = {};
      Object.keys(fieldPatch).forEach(k => (beforeFields[k] = project.raw[k]));
      const beforeProfile = {};
      Object.keys(profilePatch).forEach(k => (beforeProfile[k] = project.raw.businessProfile?.[k]));

      const nextRaw = { ...project.raw, ...fieldPatch };
      if (Object.keys(profilePatch).length) {
        nextRaw.businessProfile = { ...(project.raw.businessProfile || {}), ...profilePatch };
      }
      const editLog = [...(project.editLog || []), { instruction, fieldPatch, profilePatch, beforeFields, beforeProfile, at: new Date().toISOString() }].slice(-20);
      const saved = storage.saveProject(req.params.slug, { raw: nextRaw, editLog });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // A Google link (Maps place, share.google, goo.gl) is read directly as a
  // Maps listing — see lib/business-search.js's readGooglePlace — which is
  // fast and structured. Only the other link (Facebook) needs the slower
  // render-and-extract pipeline below, and Google's data wins where both
  // have a field.
  async function lookupBusiness(url, url2) {
    const urls = [url, url2].filter(Boolean);
    const gUrl = urls.find(businessSearch.isGoogleLink);
    let google = null;
    if (gUrl && browserFetch.isElectronMain()) {
      google = await businessSearch.readGooglePlace(gUrl).catch(err => {
        console.error('[import] Google link read failed:', err.message);
        return null;
      });
    }
    if (!google?.name) return lookupPages(urls);
    const rest = urls.filter(u => u !== gUrl);
    if (!rest.length) return { ...google, method: 'google' };
    const data = await lookupPages(rest).catch(() => ({}));
    const found = Object.fromEntries(Object.entries(google).filter(([, v]) => Array.isArray(v) ? v.length : v));
    return {
      ...data,
      ...found,
      about: data.about,
      images: [...google.images, ...(data.images || [])].slice(0, 8),
      method: `google+${data.method || 'none'}`
    };
  }

  // "Paste a link, get a website" — three layers, each falling back to
  // the next:
  //  1. Render the page in a real (hidden) Electron browser window (see
  //     lib/browser-fetch.js) — this is what actually gets past
  //     Facebook's bot-blocking, unlike a bare fetch() or even Claude
  //     Code's own WebFetch tool (both confirmed blocked in testing).
  //     Feed the rendered text to Claude Code to structure into JSON —
  //     no WebFetch tool needed here since the content's already in hand.
  //  2. If Electron isn't running (e.g. `npm run server` standalone) or
  //     step 1's render came back empty, fall back to Claude Code
  //     fetching the URL itself (lib/ai-import.js's runClaudeLookup).
  //  3. If Claude Code isn't installed/signed in at all, fall back to a
  //     plain no-API HTTP fetch + Open Graph/JSON-LD parse (lib/scrape.js).
  async function lookupPages(urls) {
    const [url, url2] = urls;

    if (browserFetch.isElectronMain() && urls.length) {
      try {
        const rendered = await Promise.all(urls.map(u => browserFetch.renderPage(u).catch(e => {
          console.error('[browser-fetch] render failed for', u, e.message);
          return null;
        })));
        const ok = rendered.filter(Boolean);
        const combinedText = ok.map((r, i) => `--- ${urls[i]} (${r.title}) ---\n${r.text}`).join('\n\n');
        const images = ok.flatMap(r => r.images);
        if (combinedText.trim().length > 40) {
          try {
            const data = await runClaudeExtract(combinedText, urls);
            return { ...data, images: data.images?.length ? data.images : images, method: 'browser+claude' };
          } catch (err) {
            if (err.message !== 'claude-not-found') console.error('[ai-import] extract-from-render failed:', err.message);
            // Claude unavailable, but we still rendered real content —
            // hand it straight back with no structuring, better than
            // nothing, UI can still show the images at least.
            if (images.length) return { method: 'browser-only', images };
          }
        }
      } catch (err) {
        console.error('[browser-fetch] pipeline failed, falling back:', err.message);
      }
    }

    try {
      const data = await runClaudeLookup(url, url2);
      return { ...data, method: 'claude' };
    } catch (err) {
      if (err.message !== 'claude-not-found') console.error('[ai-import] Claude lookup failed, falling back:', err.message);
      const fbUrl = urls.find(u => !businessSearch.isGoogleLink(u));
      const gUrl = urls.find(businessSearch.isGoogleLink);
      const [fb, g] = await Promise.all([
        fbUrl ? scrapeFacebook(fbUrl).catch(e => ({ error: e.message })) : null,
        gUrl ? Promise.resolve(parseGoogleMapsUrl(gUrl)) : null
      ]);
      return {
        method: 'fallback',
        name: fb?.name || g?.name,
        about: fb?.about,
        phone: fb?.phone,
        address: fb?.address,
        hours: fb?.hours,
        images: fb?.images,
        mapsUrl: g?.mapsUrl,
        fallbackError: fb?.error
      };
    }
  }

  // Opens a real, visible sign-in window (Facebook or Google) so future
  // imports benefit from being logged in — dramatically more data is
  // visible to a logged-in visitor than a logged-out one. The session
  // persists across app restarts (see lib/browser-fetch.js).
  app.post('/api/sign-in', (req, res) => {
    if (!browserFetch.isElectronMain()) return res.status(400).json({ error: 'Sign-in windows only work inside the app, not browser mode' });
    browserFetch.openSignInWindow(req.body?.target === 'google' ? 'google' : 'facebook');
    res.json({ ok: true });
  });

  app.post('/api/sign-out', async (req, res) => {
    if (!browserFetch.isElectronMain()) return res.status(400).json({ error: 'Signing out only works inside the app, not browser mode' });
    await browserFetch.signOut(req.body?.target === 'google' ? 'google' : 'facebook');
    res.json(await browserFetch.signInStatus());
  });

  app.get('/api/sign-in-status', async (req, res) => {
    if (!browserFetch.isElectronMain()) return res.json({ facebook: false, google: false });
    res.json(await browserFetch.signInStatus());
  });

  // Optional Google Places API key (see lib/places.js). The key itself is
  // never sent back to the page — only whether one is saved.
  app.get('/api/places-key', (req, res) => {
    res.json({ set: Boolean(places.getKey()) });
  });

  app.post('/api/places-key', async (req, res) => {
    const apiKey = String(req.body?.apiKey || '').trim();
    if (apiKey) {
      try {
        await places.testKey(apiKey);
      } catch (err) {
        return res.status(400).json({ error: `Google rejected that key: ${err.message}` });
      }
    }
    places.setKey(apiKey);
    res.json({ set: Boolean(apiKey) });
  });

  // Everything else Settings lists as connected: the Claude and Vercel
  // CLIs, the Stripe key and shared sync (read-only — it's built in).
  app.get('/api/connections', async (req, res) => {
    const [claude, vercel] = await Promise.all([connections.status('claude'), connections.status('vercel')]);
    const syncStatus = sync.getStatus();
    res.json({
      claude, vercel, stripe: stripe.status(),
      sync: { installed: true, signedIn: sync.enabled() && syncStatus.state !== 'offline', account: syncStatus.projectUrl ? new URL(syncStatus.projectUrl).host : '', state: syncStatus.state }
    });
  });

  app.post('/api/connections/:target/sign-in', (req, res) => {
    try {
      connections.signIn(req.params.target);
      resetCanDeploy();
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/connections/:target/sign-out', async (req, res) => {
    try {
      const result = await connections.signOut(req.params.target);
      resetCanDeploy();
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // The Stripe key itself is never sent back to the page.
  app.post('/api/stripe-key', async (req, res) => {
    const apiKey = String(req.body?.apiKey || '').trim();
    let account = '';
    if (apiKey) {
      try {
        account = await stripe.testKey(apiKey);
      } catch (err) {
        return res.status(400).json({ error: `Stripe rejected that key: ${err.message}` });
      }
    }
    stripe.setKey(apiKey, account);
    res.json(stripe.status());
  });

  // Checks Stripe for each customer's subscription and saves it on their
  // record (so teammates without the Stripe key see it through sync). An
  // active subscription always puts the customer on the Live tab as paying.
  // Stripe decides who's paying: an active subscription or a completed
  // one-off payment makes a business paid (Live), a lapsed subscription
  // shows as urgent (liveSection in app.js), no payment leaves it pending.
  function billingPatch(project, billing) {
    const patch = {};
    if (project.billing?.status !== billing.status || (project.billing?.until || '') !== billing.until) patch.billing = billing;
    if (['active', 'paid'].includes(billing.status) && project.paymentStatus !== 'paid') patch.paymentStatus = 'paid';
    if (project.paidOutsideStripe) patch.paidOutsideStripe = false;
    return patch;
  }

  // "Mark paid" asks Stripe first. Found → saved the way a refresh would;
  // not found → billing: null, and the app offers "mark paid anyway".
  app.post('/api/projects/:slug/check-payment', async (req, res) => {
    const project = /^[\w-]+$/.test(req.params.slug) ? storage.readProject(req.params.slug) : null;
    if (!project) return res.status(404).json({ error: 'Business not found' });
    if (!stripe.getKey()) return res.json({ noStripe: true, billing: null, project });
    try {
      const billing = (await stripe.billingBySlug())[project.slug] || await stripe.billingForEmail(project.contact?.email);
      if (!billing) return res.json({ billing: null, project });
      const patch = billingPatch(project, billing);
      if (!Object.keys(patch).length) return res.json({ billing, project });
      const saved = storage.saveProject(project.slug, patch);
      sync.pushOne(saved);
      res.json({ billing, project: saved });
    } catch (err) {
      res.status(502).json({ error: `Couldn’t check Stripe: ${err.message}` });
    }
  });

  app.post('/api/billing/refresh', async (req, res) => {
    if (!stripe.getKey()) return res.json({ skipped: true, changed: [] });
    try {
      const bySlug = await stripe.billingBySlug();
      // Pending customers who paid without one of Studio's links: by email.
      for (const p of storage.listProjects()) {
        if (bySlug[p.slug] || p.paymentStatus !== 'pending' || !p.contact?.email) continue;
        const billing = await stripe.billingForEmail(p.contact.email).catch(() => null);
        if (billing) bySlug[p.slug] = billing;
      }
      const changed = [];
      for (const [slug, billing] of Object.entries(bySlug)) {
        const project = storage.readProject(slug);
        if (!project) continue;
        const patch = billingPatch(project, billing);
        if (!Object.keys(patch).length) continue;
        sync.pushOne(storage.saveProject(slug, patch));
        changed.push(slug);
      }
      res.json({ changed });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.post('/api/projects/:slug/payment-link', async (req, res) => {
    if (!stripe.getKey()) return res.status(400).json({ error: 'Add your Stripe secret key in Settings (⚙) first.' });
    const project = storage.readProject(req.params.slug);
    if (!project) return res.status(404).json({ error: 'Not found' });
    const { planName, setup, amount, interval, key } = req.body || {};
    try {
      const url = await stripe.createPaymentLink({
        business: project.raw?.name || project.name || project.slug, slug: project.slug,
        planName: String(planName || 'Website'), setup: Number(setup) || 0, amount: Number(amount) || 0,
        interval: interval === 'year' ? 'year' : 'month'
      });
      const saved = storage.saveProject(project.slug, { paymentLink: { url, key: String(key || ''), createdAt: new Date().toISOString() } });
      sync.pushOne(saved);
      res.json({ url, project: saved });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // A customer's own domain on their site (see lib/deploy.js addDomain).
  app.post('/api/projects/:slug/domain', async (req, res) => {
    const domain = String(req.body?.domain || '').trim().toLowerCase();
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return res.status(400).json({ error: 'That doesn’t look like a domain.' });
    try {
      const before = storage.readProject(req.params.slug);
      if (!before) return res.status(404).json({ error: 'Not found' });
      if (before.customDomain && before.customDomain !== domain) await removeDomain(before.customDomain);
      await addDomain(req.params.slug, domain, Boolean(req.body?.www));
      const saved = storage.saveProject(req.params.slug, { customDomain: domain });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      res.status(502).json({ error: err.message === 'vercel-not-found' ? 'Vercel isn’t installed on this computer — see Settings.' : err.message });
    }
  });

  app.delete('/api/projects/:slug/domain', async (req, res) => {
    try {
      const before = storage.readProject(req.params.slug);
      if (before?.customDomain) await removeDomain(before.customDomain);
      const saved = storage.saveProject(req.params.slug, { customDomain: '' });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Asks public DNS (not this Mac's cache) whether the domain points at Vercel yet.
  app.get('/api/projects/:slug/domain-check', async (req, res) => {
    const domain = storage.readProject(req.params.slug)?.customDomain;
    if (!domain) return res.status(400).json({ error: 'No domain connected yet.' });
    const resolver = new (require('dns').promises.Resolver)();
    resolver.setServers(['1.1.1.1', '8.8.8.8']);
    const [a, cname] = await Promise.all([resolver.resolve4(domain).catch(() => []), resolver.resolveCname(domain).catch(() => [])]);
    const ok = a.some(ip => /^(76\.76\.21\.|216\.198\.79\.)/.test(ip)) || cname.some(c => /vercel-dns/i.test(c));
    res.json({ domain, ok, found: [...cname, ...a].join(', ') });
  });

  // Renderer-side window.open() is blocked by default in Electron (no
  // window-open handler configured), so links like a WhatsApp click-to-chat
  // URL are opened via the main process's shell.openExternal instead —
  // opens in the user's real default browser, same as clicking a link
  // normally would.
  app.post('/api/open-external', (req, res) => {
    const url = String(req.body?.url || '');
    if (!/^(https:\/\/|mailto:|sms:|tel:)/.test(url)) return res.status(400).json({ error: 'Only https://, mailto:, sms: or tel: links can be opened' });
    if (browserFetch.isElectronMain()) require('electron').shell.openExternal(url);
    res.json({ ok: true });
  });

  app.post('/api/import', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    const url2 = String(req.body?.url2 || '').trim();
    if (!url && !url2) return res.status(400).json({ error: 'A Facebook or Google Maps link is required' });
    try {
      res.json(await lookupBusiness(url || undefined, url2 || undefined));
    } catch (err) {
      res.status(502).json({ error: `Could not read that page: ${err.message}` });
    }
  });

  // Create a site and import into it in one step — the primary "paste a
  // link, get a website" action.
  app.post('/api/quick-import', async (req, res) => {
    const url = String(req.body?.url || '').trim();
    const url2 = String(req.body?.url2 || '').trim();
    if (!url && !url2) return res.status(400).json({ error: 'A Facebook or Google Maps link is required' });
    try {
      const data = await lookupBusiness(url || undefined, url2 || undefined);
      const project = storage.createProject(data.name || 'New site');
      storage.saveImportSnapshot(project.slug, [url, url2].filter(Boolean), data);
      const businessProfile = {};
      if (data.address) businessProfile.address = data.address;
      if (data.phone) businessProfile.phone = data.phone;
      if (data.about) businessProfile.about = data.about;
      if (data.mapsUrl) businessProfile.mapsUrl = data.mapsUrl;
      if (data.hours?.length) businessProfile.hours = data.hours;
      const raw = { name: data.name || project.name, tagline: data.category, location: data.location, businessProfile };
      const aiFilled = data.about ? [] : ['about'];
      const saved = storage.saveProject(project.slug, { raw, aiFilled, lastImportUrl: url || url2, importImages: data.images || [] });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      res.status(502).json({ error: `Could not read that page: ${err.message}` });
    }
  });

  // Import an existing website as it is — no templates. "link" points the
  // preview (and Clients) at a site hosted elsewhere; "copy" downloads its
  // pages and files into the project's site/ folder (lib/site-import.js)
  // so Studio can preview and publish it unchanged.
  app.post('/api/import-site', async (req, res) => {
    const url = siteImport.normalizeUrl(req.body?.url);
    const mode = req.body?.mode === 'copy' ? 'copy' : 'link';
    if (!url) return res.status(400).json({ error: 'A website link is required' });
    let project;
    try {
      const name = await siteImport.siteName(url);
      project = storage.createProject(name);
      const importedSite = { mode, url, importedAt: new Date().toISOString() };
      if (mode === 'copy') {
        const result = await siteImport.importSite(url, path.join(storage.projectDir(project.slug), 'site'));
        Object.assign(importedSite, result);
      }
      const saved = storage.saveProject(project.slug, {
        raw: { name },
        contact: { ...project.contact, existingWebsite: importedSite.url },
        paymentStatus: req.body?.paying ? 'paid' : project.paymentStatus,
        paidOutsideStripe: Boolean(req.body?.paying),
        importedSite
      });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      if (project) try { storage.deleteProject(project.slug); } catch { /* nothing to undo */ }
      res.status(502).json({ error: `Could not import that website: ${err.message}` });
    }
  });

  app.post('/api/projects/:slug/reimport-site', async (req, res) => {
    const slug = req.params.slug;
    const project = /^[\w-]+$/.test(slug) ? storage.readProject(slug) : null;
    const site = project?.importedSite;
    if (site?.mode !== 'copy') return res.status(400).json({ error: 'This isn’t a copied website' });
    try {
      const result = await siteImport.importSite(site.url, path.join(storage.projectDir(slug), 'site'));
      const saved = storage.saveProject(slug, { importedSite: { ...site, ...result, importedAt: new Date().toISOString() } });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      res.status(502).json({ error: `Could not re-import: ${err.message}` });
    }
  });

  // Bulk counterpart to quick-import: one free-text request ("hairdressers
  // in Beverley") becomes several new, uncontacted businesses. Google Maps
  // is the main source, websites/Facebook fill gaps, and Claude fills
  // what's still missing and adds anything Google didn't list (see
  // lib/business-search.js). Businesses already in the list are skipped.
  app.post('/api/ai-search', async (req, res) => {
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'A search query is required' });
    // Streamed as newline-delimited JSON: progress events as each source
    // works, then one final {type:'done'} or {type:'error'} line.
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    const send = obj => res.write(JSON.stringify(obj) + '\n');

    const existing = storage.listProjects();
    const skip = name => existing.some(p => businessSearch.sameBusiness(p.raw?.name || p.name, name));
    const location = businessSearch.locationOf(query);
    const saved = new Map();
    // Saved as soon as each layer finishes, so a slow or failed AI step
    // never loses what Google and Facebook already found.
    const save = biz => {
      const project = saved.get(biz) || storage.createProject(biz.name);
      const businessProfile = { ...(project.raw?.businessProfile || {}) };
      if (biz.address) businessProfile.address = biz.address;
      if (biz.phone) businessProfile.phone = biz.phone;
      if (biz.mapsUrl) businessProfile.mapsUrl = biz.mapsUrl;
      if (biz.hours?.length) businessProfile.hours = biz.hours;
      const raw = { ...(project.raw || {}), name: biz.name, tagline: biz.category, location: biz.location || location, businessProfile };
      const contact = {
        ...project.contact,
        phone: biz.phone || project.contact?.phone || '',
        email: biz.email || project.contact?.email || '',
        instagram: biz.instagram || project.contact?.instagram || '',
        facebookUrl: biz.facebookUrl || project.contact?.facebookUrl || '',
        googleUrl: biz.mapsUrl || project.contact?.googleUrl || '',
        existingWebsite: biz.website || project.contact?.existingWebsite || ''
      };
      const next = storage.saveProject(project.slug, {
        raw,
        contact,
        lastImportUrl: biz.facebookUrl || biz.mapsUrl || '',
        importImages: biz.images?.length ? biz.images : (project.importImages || []),
        foundVia: biz.sources
      });
      sync.pushOne(next);
      saved.set(biz, next);
    };

    try {
      let businesses = [];
      let skipped = 0;
      if (browserFetch.isElectronMain()) {
        try {
          ({ businesses, skipped } = await businessSearch.searchGoogleMaps(query, send, { skip }));
          await businessSearch.fillFromFacebook(businesses, send);
        } catch (err) {
          console.error('[business-search] Google/Facebook step failed:', err.message);
          send({ type: 'stage', stage: 'google', muted: true, text: 'Google Maps search failed — asking AI instead' });
        }
        businesses.forEach(save);
        if (businesses.length) send({ type: 'saved', count: businesses.length });
      }

      const gaps = businesses.filter(b => businessSearch.missingFields(b).length);
      const room = Math.max(0, businessSearch.RESULT_CAP - businesses.length);
      if (gaps.length || room > 0) {
        send({
          type: 'stage', stage: 'ai',
          text: businesses.length
            ? `Asking AI to fill ${gaps.length} gap${gaps.length === 1 ? '' : 's'}${room ? ' and find any others' : ''}`
            : 'Asking AI to search the web'
        });
        try {
          const known = businesses.map(b => ({ name: b.name, address: b.address, missing: businessSearch.missingFields(b) }));
          const aiResults = await runClaudeSearch(query, send, { known, room });
          const { updated, added } = businessSearch.mergeAiResults(businesses, aiResults, { skip, location });
          for (const { biz, fields } of updated) {
            save(biz);
            send({ type: 'filled', name: biz.name, fields, source: 'ai' });
          }
          for (const biz of added) {
            businesses.push(biz);
            save(biz);
          }
        } catch (err) {
          if (!businesses.length) throw err;
          send({
            type: 'stage', stage: 'ai', muted: true,
            text: err.message === 'claude-not-found'
              ? 'AI isn\'t set up — kept what Google & Facebook found'
              : 'AI step didn\'t finish — kept what Google & Facebook found'
          });
        }
      }
      send({ type: 'done', projects: [...saved.values()], query, skipped });
    } catch (err) {
      send({ type: 'error', error: err.message === 'claude-not-found' ? 'claude-not-found' : `Search failed: ${err.message}` });
    }
    res.end();
  });

  // Save an uploaded file (logo / hero / gallery) into the project folder,
  // and — if shared sync is configured — mirror it to the shared Storage
  // bucket in the background so other installs can download it too.
  app.post('/api/projects/:slug/media/:slot', upload.single('file'), (req, res) => {
    const { slug, slot } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
      const dir = storage.mediaDir(slug, slot);
      const ext = (path.extname(req.file.originalname) || '.jpg').toLowerCase();
      const filename = slot === 'gallery' ? `${Date.now()}${ext}` : `${slot}${ext}`;
      fs.writeFileSync(path.join(dir, filename), req.file.buffer);
      const relPath = slot === 'gallery' ? `img/gallery/${filename}` : `img/${filename}`;
      sync.uploadMedia(slug, relPath, req.file.buffer);
      res.json({ path: relPath, url: `/projects/${slug}/${relPath}` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pull an image found during import (a remote URL) into the project
  // folder, so it becomes a normal local media file like any upload —
  // and mirror it to shared Storage the same way.
  app.post('/api/projects/:slug/media/:slot/fetch', async (req, res) => {
    const { slug, slot } = req.params;
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: 'URL is required' });
    try {
      const remote = await fetch(url);
      if (!remote.ok) throw new Error(`Image fetch failed: ${remote.status}`);
      const buffer = Buffer.from(await remote.arrayBuffer());
      const contentType = remote.headers.get('content-type') || '';
      const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
      const dir = storage.mediaDir(slug, slot);
      const filename = slot === 'gallery' ? `${Date.now()}${ext}` : `${slot}${ext}`;
      fs.writeFileSync(path.join(dir, filename), buffer);
      const relPath = slot === 'gallery' ? `img/gallery/${filename}` : `img/${filename}`;
      sync.uploadMedia(slug, relPath, buffer);
      res.json({ path: relPath, url: `/projects/${slug}/${relPath}` });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Write the generated HTML the browser already built (client-side,
  // via the same generator scripts used for the live preview) out to a
  // sendable static folder.
  function writeExport(slug, html) {
    const dir = storage.projectDir(slug);
    const outDir = path.join(dir, 'export');
    fs.mkdirSync(outDir, { recursive: true });
    // The preview points uploaded photos at this local server; the export
    // ships its own copy of img/, so make those links relative.
    const local = new RegExp(`https?://(?:localhost|127\\.0\\.0\\.1):\\d+/projects/${slug.replace(/[^\w-]/g, '\\$&')}/`, 'g');
    fs.writeFileSync(path.join(outDir, 'index.html'), withBeacon(html.replace(local, ''), slug));
    const srcImg = path.join(dir, 'img');
    const outImg = path.join(outDir, 'img');
    if (fs.existsSync(srcImg)) fs.cpSync(srcImg, outImg, { recursive: true });
    return outDir;
  }

  // The "Demo opened" counter (see lib/supabase-sync.js) goes just before
  // </body> on every published page.
  function withBeacon(html, slug) {
    const beacon = sync.viewBeaconScript(slug);
    const bodyEnd = html.toLowerCase().lastIndexOf('</body>');
    return bodyEnd === -1 ? html + beacon : html.slice(0, bodyEnd) + beacon + html.slice(bodyEnd);
  }

  // A copied website (lib/site-import.js) publishes its own files as they
  // are, with the view counter added to each page.
  function writeImportedExport(slug) {
    const dir = storage.projectDir(slug);
    const siteDir = path.join(dir, 'site');
    if (!fs.existsSync(path.join(siteDir, 'index.html'))) {
      throw new Error('The copied website isn’t on this computer yet — open it and click Re-import first');
    }
    const outDir = path.join(dir, 'export');
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.cpSync(siteDir, outDir, { recursive: true });
    for (const file of siteImport.htmlFiles(outDir)) {
      fs.writeFileSync(file, Buffer.from(withBeacon(fs.readFileSync(file, 'latin1'), slug), 'latin1'));
    }
    return outDir;
  }

  // A linked website is hosted elsewhere, so there's nothing to publish.
  function exportFor(slug, html) {
    const site = storage.readProject(slug)?.importedSite;
    if (site?.mode === 'link') {
      throw Object.assign(new Error('This website is hosted elsewhere — Studio only links to it'), { status: 400 });
    }
    if (site?.mode === 'copy') return writeImportedExport(slug);
    if (!html) throw Object.assign(new Error('html is required'), { status: 400 });
    return writeExport(slug, html);
  }

  app.post('/api/projects/:slug/export', (req, res) => {
    try {
      res.json({ path: exportFor(req.params.slug, req.body?.html) });
    } catch (err) {
      res.status(err.status || 500).json({ error: err.message });
    }
  });

  // Ships the exported site with the Vercel CLI already signed in on this
  // Mac (see lib/deploy.js) — no API token handled by the app itself.
  // Asks the live URL whether it's still up. Only a definite 404 (Vercel's
  // "deployment not found" once a site is removed) clears liveUrl — a
  // network error or timeout never marks a site offline.
  app.post('/api/projects/:slug/check-live', async (req, res) => {
    const project = storage.readProject(req.params.slug);
    if (!project) return res.status(404).json({ error: 'Not found' });
    if (!project.liveUrl) return res.json(project);
    try {
      const check = await fetch(project.liveUrl, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      if (check.status === 404) {
        const saved = storage.saveProject(req.params.slug, { liveUrl: '' });
        sync.pushOne(saved);
        return res.json(saved);
      }
    } catch { /* unreachable right now — leave it as it was */ }
    res.json(project);
  });

  app.post('/api/projects/:slug/offline', async (req, res) => {
    try {
      await takeOffline(req.params.slug);
      const saved = storage.saveProject(req.params.slug, { liveUrl: '', deployRequestedAt: '', offlineRequestedAt: '', deployError: '' });
      sync.pushOne(saved);
      res.json(saved);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.post('/api/projects/:slug/deploy', async (req, res) => {
    try {
      const outDir = exportFor(req.params.slug, req.body?.html);
      const url = await deployToVercel(outDir, req.params.slug);
      const saved = storage.saveProject(req.params.slug, { liveUrl: url, deployRequestedAt: '', offlineRequestedAt: '', deployError: '' });
      sync.pushOne(saved);
      res.json({ url });
    } catch (err) {
      const message = err.message === 'vercel-not-found'
        ? 'Vercel CLI not found — install it with `npm install -g vercel` and run `vercel login` once.'
        : err.message;
      res.status(err.status || 502).json({ error: message });
    }
  });

  return app;
}

if (require.main === module) {
  createApp().listen(PORT, () => console.log(`BrightSite Studio server on http://localhost:${PORT}`));
}

module.exports = { createApp, PORT };
