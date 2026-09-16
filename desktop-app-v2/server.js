// BrightSite Studio V2's server: V1's server (../desktop-app/server.js) with
// V2's page served in front of V1's, plus the tasks API. Every other route —
// projects, sync, imports, media, AI edits, deploys, domains, Stripe — is
// V1's own code, unchanged.
const fs = require('fs');
const path = require('path');
const express = require('express');

// Next door in development; bundled into the packaged app as v1/ (see
// package.json build.files). When running from ASAR, fs.existsSync doesn't work
// on bundled paths, so check __dirname itself to detect packaged mode.
const isPackaged = __dirname.includes('.asar');
const V1_DIR = isPackaged ? path.join(__dirname, 'v1') : path.join(__dirname, '..', 'desktop-app');

// Its own port, so V1 (4173) and V2 can run side by side.
if (!process.env.PORT) process.env.PORT = '4174';

const { createApp, PORT } = require(path.join(V1_DIR, 'server'));
const storage = require(path.join(V1_DIR, 'lib', 'site-storage'));
const { spawnEnv } = require(path.join(V1_DIR, 'lib', 'shell-path'));
const customerRequests = require(path.join(V1_DIR, 'lib', 'customer-requests'));
const tasks = require('./lib/tasks');
const P = require('./public/pipeline');
const pricePhoto = require('./lib/price-photo');
const { version } = require('./package.json');

// V1 queues "Request an update"/domain-change submissions and cancellations
// with a reason (see lib/customer-requests.js there) but has no concept of
// a Task — that's V2-only. Turn any not yet converted into one here,
// business-linked when the request's slug still exists, otherwise a plain
// task in the global list, same as one typed in by hand.
const REQUEST_TASK_TYPE = { domain: 'Domain', update: 'Other', cancellation: 'Other' };
const REQUEST_LABEL = { domain: 'Domain change requested', update: 'Website update requested', cancellation: 'Cancelled' };
function processCustomerRequests() {
  const pending = customerRequests.pending(storage.ROOT);
  if (!pending.length) return;
  const byBusinessSlug = new Map();
  const globalAdds = [];
  for (const r of pending) {
    const text = `${REQUEST_LABEL[r.type] || 'Customer request'} — ${r.business || r.email || 'unknown business'}${r.message ? `: ${r.message}` : ''}`;
    const task = P.newTask({ text, type: REQUEST_TASK_TYPE[r.type] || 'Other' }, new Date(r.createdAt).getTime() || Date.now());
    const project = r.slug && storage.readProject(r.slug);
    if (project) {
      if (!byBusinessSlug.has(r.slug)) byBusinessSlug.set(r.slug, []);
      byBusinessSlug.get(r.slug).push(task);
    } else {
      globalAdds.push(task);
    }
  }
  for (const [slug, newTasks] of byBusinessSlug) {
    const project = storage.readProject(slug);
    storage.saveProject(slug, { tasks: [...(project.tasks || []), ...newTasks] });
  }
  if (globalAdds.length) tasks.write(storage.ROOT, [...tasks.read(storage.ROOT), ...globalAdds]);
  customerRequests.markConverted(pending.map(r => r.id), storage.ROOT);
}

function createV2App() {
  const app = createApp({ publicDir: path.join(__dirname, 'public'), appVersion: version });
  // V1's own page and scripts, which V2 loads for its settings, dialogs and builder.
  app.use('/v1', express.static(path.join(V1_DIR, 'public')));

  app.get('/api/v2/tasks', (req, res) => {
    try { processCustomerRequests(); } catch (err) { console.error('[customer-requests] convert failed:', err.message); }
    res.json(tasks.read(storage.ROOT));
  });
  app.put('/api/v2/tasks', (req, res) => {
    try {
      res.json(tasks.write(storage.ROOT, req.body));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  // A photo of a price list → sections for the business's price list (see
  // lib/price-photo.js). The photo is kept in the business's folder; the
  // list comes back to the page, which saves it on the record.
  app.post('/api/v2/projects/:slug/price-photo', express.raw({ type: 'image/*', limit: '15mb' }), async (req, res) => {
    const { slug } = req.params;
    if (!/^[\w-]+$/.test(slug) || !storage.readProject(slug)) return res.status(404).json({ error: 'That business wasn’t found.' });
    let file;
    try {
      file = pricePhoto.savePhoto(storage.projectDir(slug), req.body, req.get('content-type'));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    try {
      res.json({ photo: file, priceList: await pricePhoto.readPhoto(storage.projectDir(slug), file, { spawnEnv }) });
    } catch (err) {
      res.status(502).json({ error: err.message, photo: file });
    }
  });
  return app;
}

module.exports = { createV2App, PORT, V1_DIR };

if (require.main === module) {
  createV2App().listen(PORT, () => console.log(`BrightSite Studio V2 running on http://localhost:${PORT}`));
}
