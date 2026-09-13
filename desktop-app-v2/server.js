// BrightSite Studio V2's server: V1's server (../desktop-app/server.js) with
// V2's page served in front of V1's, plus the tasks API. Every other route —
// projects, sync, imports, media, AI edits, deploys, domains, Stripe — is
// V1's own code, unchanged.
const fs = require('fs');
const path = require('path');
const express = require('express');

// Next door in development; bundled into the packaged app as v1/ (see
// package.json build.files).
const V1_DIR = fs.existsSync(path.join(__dirname, 'v1', 'server.js'))
  ? path.join(__dirname, 'v1')
  : path.join(__dirname, '..', 'desktop-app');

// Its own port, so V1 (4173) and V2 can run side by side.
if (!process.env.PORT) process.env.PORT = '4174';

const { createApp, PORT } = require(path.join(V1_DIR, 'server'));
const storage = require(path.join(V1_DIR, 'lib', 'site-storage'));
const { spawnEnv } = require(path.join(V1_DIR, 'lib', 'shell-path'));
const tasks = require('./lib/tasks');
const pricePhoto = require('./lib/price-photo');
const { version } = require('./package.json');

function createV2App() {
  const app = createApp({ publicDir: path.join(__dirname, 'public'), appVersion: version });
  // V1's own page and scripts, which V2 loads for its settings, dialogs and builder.
  app.use('/v1', express.static(path.join(V1_DIR, 'public')));

  app.get('/api/v2/tasks', (req, res) => res.json(tasks.read(storage.ROOT)));
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
