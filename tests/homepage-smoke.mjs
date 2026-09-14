import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const relativePath = normalize(requestedPath).replace(/^[/\\]+/, '');
  const filePath = join(root, relativePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error('Not a file');
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream'
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });

async function swipeUp(page, { x, startY, endY }) {
  const client = await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y: startY }]
  });

  const steps = 12;
  for (let step = 1; step <= steps; step++) {
    const y = startY + ((endY - startY) * step / steps);
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y }]
    });
    await page.waitForTimeout(18);
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: []
  });
  await client.detach();
  await page.waitForTimeout(450);
}

async function runHomepageFlow(label, contextOptions, mobile) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  const activate = (locator) => mobile ? locator.tap() : locator.click();

  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://*.vercel.app/**', (route) => route.abort());
  await page.route('https://klreehoegatehoubhhog.supabase.co/**', (route) => {
    route.fulfill({ status: 201, body: '' });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(baseUrl, { waitUntil: 'load' });

  if (mobile) {
    await page.locator('.hero-conv').evaluate((element) => element.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(100);
    const heroBox = await page.locator('.hero-conv').boundingBox();
    const viewport = page.viewportSize();
    const beforeSwipe = await page.evaluate(() => window.scrollY);
    const startY = Math.min(viewport.height - 70, heroBox.y + heroBox.height * 0.72);
    await swipeUp(page, {
      x: Math.round(viewport.width / 2),
      startY: Math.round(startY),
      endY: Math.round(Math.max(80, startY - 340))
    });
    const afterSwipe = await page.evaluate(() => window.scrollY);
    assert.ok(
      afterSwipe > beforeSwipe + 40,
      `${label}: a real finger swipe over the hero should scroll (${beforeSwipe} -> ${afterSwipe})`
    );
  } else {
    await page.evaluate(() => window.scrollTo(0, 700));
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => window.scrollY > 0), `${label}: document should scroll`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));

  const nameInput = page.locator('#bizName');
  await activate(nameInput);
  const focusedPlaceholderOpacity = await nameInput.evaluate((element) => (
    getComputedStyle(element, '::placeholder').opacity
  ));
  assert.equal(focusedPlaceholderOpacity, '0', `${label}: question text should clear on focus`);
  await nameInput.pressSequentially('BrightSite Test Studio', { delay: 20 });
  assert.equal(await nameInput.inputValue(), 'BrightSite Test Studio', `${label}: name should stay typed`);

  await activate(page.locator('#qaNameGo'));
  await page.locator('#qaSlideType.qa-active').waitFor();
  await page.locator('#qaSlideName[hidden]').waitFor({ state: 'attached' });
  assert.equal(await nameInput.inputValue(), 'BrightSite Test Studio', `${label}: intentional capitals should remain`);

  await page.locator('#bizTagline').selectOption({ label: 'Hair & Beauty' });
  await page.locator('#qaSlideLocation.qa-active').waitFor();
  await page.locator('#qaSlideType[hidden]').waitFor({ state: 'attached' });

  const locationInput = page.locator('#bizLocation');
  await activate(locationInput);
  await locationInput.pressSequentially('Beverley', { delay: 20 });
  assert.equal(await locationInput.inputValue(), 'Beverley', `${label}: location should stay typed`);

  await activate(page.locator('#qaLocationNext'));
  await page.locator('#builderOverlay:not([hidden])').waitFor({ timeout: 10000 });
  await page.locator('#previewFrame').waitFor();
  await page.waitForFunction(() => document.querySelector('#previewFrame').contentDocument?.body);

  const foodDemo = await page.evaluate(() => buildDemoHTML({
    name: 'The Sample Kitchen', tagline: 'Food & Drink', location: 'Beverley', services: [], prices: [], goal: 'Book now'
  }));
  assert.match(foodDemo, />Menu</, `${label}: food sites should use Menu navigation`);
  assert.match(foodDemo, /Reserve a table/, `${label}: food sites should use a relevant reservation CTA`);
  await page.waitForFunction(() => document.querySelector('#previewFrame').contentDocument?.querySelectorAll('.gallery-demo img').length === 6);
  const galleryNotice = await page.waitForFunction(() => (
    document.querySelector('#previewFrame').contentDocument?.body?.textContent.includes('Demo photography, ready for your own')
  )).then(() => true).catch(() => false);
  assert.equal(galleryNotice, true, `${label}: demo gallery should explain that customer photographs replace it`);

  const rootLocked = await page.evaluate(() => document.documentElement.classList.contains('builder-scroll-lock'));
  assert.equal(rootLocked, !mobile, `${label}: scroll lock should be desktop-only`);

  assert.equal(await page.locator('.builder-primary[data-tool="send"]').count(), 1, `${label}: builder should offer one personal handoff action`);
  assert.equal(await page.locator('.glass-circle[data-tool]').count(), 3, `${label}: builder should offer three compact design controls`);

  await activate(page.locator('[data-tool="layout"]'));
  await page.locator('[data-layout-select]').waitFor();
  assert.equal(await page.locator('[data-layout-select] option').count(), 3, `${label}: template picker should offer the three reference-led templates`);
  const previewBeforeLayout = await page.locator('#previewFrame').getAttribute('srcdoc');
  await page.locator('[data-layout-select]').selectOption('electric');
  await page.waitForFunction((before) => (
    document.querySelector('#previewFrame').getAttribute('srcdoc') !== before
  ), previewBeforeLayout);
  await activate(page.locator('[data-tool="layout"]'));
  assert.equal(await page.locator('[data-layout-select]').inputValue(), 'electric', `${label}: choosing a template should retain it`);
  await activate(page.locator('[data-tool="layout"]'));

  await activate(page.locator('[data-tool="colour"]'));
  const heroPaletteChoice = page.locator('[data-hero-palette="true"]');
  const rosePalette = page.locator('[data-colour="#b77988"]');
  assert.equal(await heroPaletteChoice.getAttribute('aria-pressed'), 'true', `${label}: colour should start matched to the hero photo`);
  const accentOf = () => page.evaluate(() => (
    getComputedStyle(document.querySelector('#previewFrame').contentDocument.documentElement).getPropertyValue('--accent').trim()
  ));
  const previewBeforeColour = await accentOf();
  await activate(rosePalette);
  await page.waitForFunction((before) => (
    getComputedStyle(document.querySelector('#previewFrame').contentDocument.documentElement).getPropertyValue('--accent').trim() !== before
  ), previewBeforeColour);
  await activate(page.locator('[data-tool="colour"]'));
  assert.equal(await heroPaletteChoice.getAttribute('aria-pressed'), 'false', `${label}: choosing a colour should leave the hero-matched default`);
  await activate(heroPaletteChoice);
  await activate(page.locator('[data-tool="colour"]'));
  assert.equal(await heroPaletteChoice.getAttribute('aria-pressed'), 'true', `${label}: reselecting the hero palette should mark it active again`);
  await activate(page.locator('[data-tool="colour"]'));

  if (mobile) {
    const previewFrame = page.locator('#previewFrame');
    const frameBox = await previewFrame.boundingBox();
    const beforePreviewSwipe = await previewFrame.evaluate((frame) => frame.contentWindow.scrollY);
    const startY = frameBox.y + frameBox.height * 0.55;
    await swipeUp(page, {
      x: Math.round(frameBox.x + frameBox.width / 2),
      startY: Math.round(startY),
      endY: Math.round(Math.max(frameBox.y + 80, startY - 360))
    });
    const afterPreviewSwipe = await previewFrame.evaluate((frame) => frame.contentWindow.scrollY);
    assert.ok(
      afterPreviewSwipe > beforePreviewSwipe + 40,
      `${label}: a real finger swipe should scroll the generated preview (${beforePreviewSwipe} -> ${afterPreviewSwipe})`
    );
  }

  assert.deepEqual(errors, [], `${label}: page should not throw runtime errors`);
  await context.close();
}

try {
  await runHomepageFlow('desktop', { viewport: { width: 1440, height: 900 } }, false);
  await runHomepageFlow('iPhone 13', { ...devices['iPhone 13'] }, true);
  console.log('Homepage smoke tests passed on desktop and iPhone 13.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
