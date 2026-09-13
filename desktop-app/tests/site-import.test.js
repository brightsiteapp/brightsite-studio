// Website import (lib/site-import.js): a small multi-page site served
// locally is copied and every kind of link checked — pages, CSS (with
// @import and url()), srcset, inline styles, a <base> tag, and links that
// must keep pointing at the original (other hosts, failed pages, forms).

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { importSite, pagePathFor, assetPathFor, relativeRef, mapSrcset, htmlFiles } = require('../lib/site-import');

test('site import: page and file paths mirror the site, links become relative', () => {
  assert.equal(pagePathFor('https://x.com/'), 'index.html');
  assert.equal(pagePathFor('https://x.com/pricing'), 'pricing/index.html');
  assert.equal(pagePathFor('https://x.com/pricing/'), 'pricing/index.html');
  assert.equal(pagePathFor('https://x.com/blog/post.html'), 'blog/post.html');
  assert.equal(pagePathFor('https://x.com/about.php'), 'about.html');
  assert.equal(assetPathFor('https://x.com/css/site.css?v=3'), 'css/site.css');
  assert.match(assetPathFor('https://x.com/_next/image?url=a&w=640'), /^_next\/image-[0-9a-f]{8}$/);
  assert.equal(relativeRef('pricing/index.html', 'index.html', true), '../');
  assert.equal(relativeRef('index.html', 'index.html', true), './');
  assert.equal(relativeRef('index.html', 'pricing/index.html', true), 'pricing/');
  assert.equal(relativeRef('pricing/index.html', 'css/site.css', false), '../css/site.css');
});

test('site import: srcset keeps descriptors and commas inside URLs', () => {
  assert.equal(mapSrcset('a.jpg 1x, b.jpg 2x', u => `z/${u}`), 'z/a.jpg 1x, z/b.jpg 2x');
  const cdn = 'https://c.test/w_4,h_3/a.jpg 400w, https://c.test/w_8,h_6/a.jpg 800w';
  assert.equal(mapSrcset(cdn, () => null), cdn);
});

function serve(routes) {
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const route = routes[req.url.split('?')[0]];
      if (!route) {
        res.writeHead(404);
        return res.end('missing');
      }
      if (route.redirect) {
        res.writeHead(301, { Location: route.redirect });
        return res.end();
      }
      res.writeHead(200, { 'Content-Type': route.type || 'text/html; charset=utf-8' });
      res.end(route.body);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('site import: copies every page and file as-is, with links that work from any folder', async () => {
  const routes = {};
  const server = await serve(routes);
  const origin = `http://127.0.0.1:${server.address().port}`;
  Object.assign(routes, {
    '/': { body: `<!DOCTYPE html><html><head><base href="/"><link rel="stylesheet" href="/css/site.css?v=2"><link rel="canonical" href="https://example.com/"></head><body>
      <a href="/pricing">Pricing</a><a href="${origin}/contact#form">Contact</a><a href="/old-pricing">Old</a><a href="/missing">Gone</a><a href="https://elsewhere.test/x">Out</a>
      <img src="img/logo.png" srcset="/img/logo.png 1x, /img/logo@2x.png 2x"><div style="background:url('/img/bg.jpg')"></div>
      <form action="/send"></form><script src="https://cdn.example.com/lib.js"></script>
      <script src="/js/app.js"></script><script>var hero = "/img/hero.webp";</script></body></html>` },
    '/js/app.js': { type: 'text/javascript', body: 'const cards = [{ image: \'img/cards/a.webp?v=2\' }, { image: "img/nope.png" }, { image: `img/${x}.webp` }];' },
    '/img/cards/a.webp': { type: 'image/webp', body: Buffer.from([82, 73, 70, 70]) },
    '/img/hero.webp': { type: 'image/webp', body: Buffer.from([82, 73, 70, 70, 1]) },
    '/pricing': { body: '<html><head><link rel="stylesheet" href="/css/site.css"></head><body><a href="/">Home</a></body></html>' },
    '/old-pricing': { redirect: '/pricing' },
    '/contact': { body: '<html><body><a href="/">Home</a><p>Café – £5</p></body></html>' },
    '/css/site.css': { type: 'text/css', body: '@import "/css/extra.css"; body{background:url("../img/bg.jpg")}' },
    '/css/extra.css': { type: 'text/css', body: '@font-face{src:url(/fonts/a.woff2)}' },
    '/fonts/a.woff2': { type: 'font/woff2', body: Buffer.from([0, 1, 2, 3]) },
    '/img/logo.png': { type: 'image/png', body: Buffer.from([137, 80, 78, 71]) },
    '/img/logo@2x.png': { type: 'image/png', body: Buffer.from([137, 80, 78, 71, 2]) },
    '/img/bg.jpg': { type: 'image/jpeg', body: Buffer.from([255, 216, 255]) }
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-site-import-'));
  const dest = path.join(dir, 'site');
  try {
    const result = await importSite(`${origin}/`, dest);
    assert.equal(result.pages, 3);
    const read = f => fs.readFileSync(path.join(dest, f), 'utf8');
    const home = read('index.html');
    assert.match(home, /href="pricing\/">Pricing/);
    assert.match(home, /href="contact\/#form"/);
    assert.match(home, /href="pricing\/">Old/, 'a redirect reuses the page it lands on');
    assert.ok(home.includes(`href="${origin}/missing"`), 'a page that failed points back at the original');
    assert.match(home, /href="https:\/\/elsewhere\.test\/x"/);
    assert.match(home, /rel="canonical" href="https:\/\/example\.com\/"/);
    assert.match(home, /src="img\/logo\.png" srcset="img\/logo\.png 1x, img\/logo@2x\.png 2x"/);
    assert.match(home, /style="background:url\(img\/bg\.jpg\)"/);
    assert.ok(home.includes(`action="${origin}/send"`), 'forms still post to the original site');
    assert.match(home, /src="https:\/\/cdn\.example\.com\/lib\.js"/);
    assert.match(home, /href="css\/site\.css"/);
    assert.doesNotMatch(home, /<base/);
    assert.match(read('pricing/index.html'), /href="\.\.\/">Home/);
    assert.match(read('pricing/index.html'), /href="\.\.\/css\/site\.css"/);
    assert.match(read('contact/index.html'), /Café – £5/);
    assert.equal(read('css/site.css'), '@import "extra.css"; body{background:url("../img/bg.jpg")}');
    assert.equal(read('css/extra.css'), '@font-face{src:url(../fonts/a.woff2)}');
    assert.deepEqual([...fs.readFileSync(path.join(dest, 'img/logo@2x.png'))], [137, 80, 78, 71, 2]);
    assert.equal(htmlFiles(dest).length, 3);
    // Files only named inside scripts are copied too; a guessed path that
    // doesn't exist isn't counted as a failure, and scripts stay unchanged.
    assert.ok(fs.existsSync(path.join(dest, 'img/cards/a.webp')));
    assert.ok(fs.existsSync(path.join(dest, 'img/hero.webp')));
    assert.equal(result.skipped, 1, 'only the missing page counts as not copied');
    assert.match(read('js/app.js'), /img\/cards\/a\.webp\?v=2/);

    // Re-importing replaces the copy in place and leaves no temp folder behind.
    await importSite(`${origin}/`, dest);
    assert.deepEqual(fs.readdirSync(dir), ['site']);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
