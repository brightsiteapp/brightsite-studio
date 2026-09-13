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
const tasks = require('./lib/tasks');
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
  return app;
}

module.exports = { createV2App, PORT, V1_DIR };

if (require.main === module) {
  createV2App().listen(PORT, () => console.log(`BrightSite Studio V2 running on http://localhost:${PORT}`));
}
