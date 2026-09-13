// V2's server is V1's with V2's page in front and the tasks API added — and
// V1 on its own still serves V1 exactly as before. Run with: npm test
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Point project storage at a throwaway folder before anything loads it.
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-v2-test-'));
process.env.HOME = tmpHome;

const { createV2App, V1_DIR } = require('../server');
const { createApp: createV1App } = require(path.join(V1_DIR, 'server'));

const listen = app => new Promise(resolve => {
  const server = app.listen(0, () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` }));
});
let v2;
let v1;
before(async () => { v2 = await listen(createV2App()); v1 = await listen(createV1App()); });
after(() => { v2.server.close(); v1.server.close(); fs.rmSync(tmpHome, { recursive: true, force: true }); });

test('V2 serves its own page, and V1’s scripts and page underneath', async () => {
  const page = await (await fetch(`${v2.url}/`)).text();
  assert.match(page, /<script src="v2\.js"><\/script>/);
  assert.strictEqual((await fetch(`${v2.url}/app.js`)).status, 200);
  assert.strictEqual((await fetch(`${v2.url}/style.css`)).status, 200);
  assert.strictEqual((await fetch(`${v2.url}/launch-gate.js`)).status, 200);
  const v1Page = await (await fetch(`${v2.url}/v1/index.html`)).text();
  assert.match(v1Page, /id="settingsDialog"/);
  assert.match(v1Page, /id="builderView"/);
  assert.deepStrictEqual(await (await fetch(`${v2.url}/api/app-info`)).json(), { version: require('../package.json').version });
});

test('V1 on its own is unchanged', async () => {
  const page = await (await fetch(`${v1.url}/`)).text();
  assert.match(page, /<script src="app\.js"><\/script>/);
  assert.doesNotMatch(page, /v2\.js/);
  assert.deepStrictEqual(await (await fetch(`${v1.url}/api/app-info`)).json(), { version: require(path.join(V1_DIR, 'package.json')).version });
  assert.strictEqual((await fetch(`${v1.url}/api/v2/tasks`)).status, 404);
});

test('unlinked tasks save to this computer and come back cleaned', async () => {
  assert.deepStrictEqual(await (await fetch(`${v2.url}/api/v2/tasks`)).json(), []);
  const put = await fetch(`${v2.url}/api/v2/tasks`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: 't1', text: 'Connect domain', due: '2026-09-20', type: 'Domain' }, { id: 't2', text: '   ' }, { text: 'no id' }])
  });
  assert.strictEqual(put.status, 200);
  const saved = await (await fetch(`${v2.url}/api/v2/tasks`)).json();
  assert.deepStrictEqual(saved.map(t => [t.id, t.text, t.due, t.type, t.done]), [['t1', 'Connect domain', '2026-09-20', 'Domain', false]]);
  assert.ok(fs.existsSync(path.join(tmpHome, 'BrightSiteProjects', 'studio-v2-tasks.json')));
  const bad = await fetch(`${v2.url}/api/v2/tasks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"not":"a list"}' });
  assert.strictEqual(bad.status, 400);
});
