import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  const relativePath = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    .replace(/^[/\\]+/, '');
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

async function revealBuilder(page) {
  await page.route('https://brightsite.app/img/**', async route => {
    const asset = new URL(route.request().url()).pathname;
    await route.fulfill({path:join(root,asset)});
  });
  await page.route('**/rest/v1/**', route => route.fulfill({status:201,body:''}));
  await page.route('**/brightsite-notify-lead.**', route => route.fulfill({status:200,body:'{}'}));
  await page.goto(baseUrl, { waitUntil: 'load' });
  await page.evaluate(() => {
    document.getElementById('bizName').value = 'Hull Hair';
    document.getElementById('bizTagline').value = 'Hair & Beauty';
    document.getElementById('bizLocation').value = 'Hull';
  });
  await page.locator('#builderOverlay').evaluate((overlay) => {
    overlay.hidden = false;
    window.dispatchEvent(new Event('resize'));
  });
}

try {
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const desktop = await desktopContext.newPage();
  await revealBuilder(desktop);
  const layouts=await desktop.evaluate(()=>DEMO_LAYOUTS.map(layout=>layout.id));
  const sampled=await desktop.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=80;canvas.height=45;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#528269';ctx.fillRect(0,0,80,45);ctx.fillStyle='#000';ctx.fillRect(0,0,12,45);ctx.fillStyle='#fff';ctx.fillRect(68,0,12,45);
    return HeroPalette.fromImage(canvas.toDataURL());
  });
  assert.equal(sampled.base,'#528269','hero matching should select the dominant surface rather than lettering or highlights');
  const contentChecks = await desktop.evaluate(() => {
    const parser=new DOMParser();
    return BUSINESS_TYPES.map(info=>{
      const variants=DEMO_LAYOUTS.map(layout=>{
        const doc=parser.parseFromString(buildDemoHTML({name:'Sample Business',tagline:info.label,location:'Hull',layout:layout.id}),'text/html');
        return doc.querySelector('main').textContent.replace(/\s+/g,' ').trim();
      });
      const firstService=info.groups[0].items[0][0];
      return {category:info.label,accurate:variants.every(text=>text.includes(firstService))};
    });
  });
  contentChecks.forEach(result=>assert.equal(result.accurate,true,`${result.category} services must remain accurate in every template`));
  const enrichedMarkup = await desktop.evaluate(() => buildDemoHTML({
    name:'Real Salon', tagline:'Hair & Beauty', location:'Hull',
    businessProfile:{
      address:'10 Market Place, Hull', phone:'01482 123456', website:'https://example.com',
      mapsUrl:'https://maps.google.com/example', rating:4.8, reviewCount:126,
      hours:['Monday: 09:00–17:00','Tuesday: 09:00–17:00'],
      about:'A real description imported from Facebook.',
      reviews:[{text:'The best haircut I have had.',rating:5,author:'Real Customer'}],
      heroPhoto:{url:'https://example.com/hero.jpg'},
      photos:[{url:'https://example.com/gallery.jpg',attribution:'Real Salon'}]
    }
  }));
  assert.match(enrichedMarkup,/10 Market Place, Hull/,'real address should replace the location placeholder');
  assert.match(enrichedMarkup,/01482 123456/,'real phone should replace the preview placeholder');
  assert.match(enrichedMarkup,/The best haircut I have had/,'Google reviews should appear in the preview');
  assert.match(enrichedMarkup,/4\.8 Google rating/,'Google rating should appear in the review summary');
  assert.match(enrichedMarkup,/09:00–17:00/,'real opening hours should appear in the preview');
  assert.match(enrichedMarkup,/https:\/\/example\.com\/hero\.jpg/,'the highest-ranked real image should become the hero');

  assert.equal(
    await desktop.locator('.builder-bar-wrap').evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgba(0, 0, 0, 0)',
    'desktop controls should float without a dock'
  );
  assert.equal(await desktop.locator('#builderOpenHtml').count(), 0, 'fullscreen removed');

  await desktop.locator('#builderDeviceMobile').click();
  assert.equal(await desktop.locator('#builderPreview').evaluate((element) => element.classList.contains('mobile-view')), true);
  assert.equal(await desktop.locator('#builderDeviceMobile').getAttribute('aria-pressed'), 'true');
  for (const height of [900,700]) {
    await desktop.setViewportSize({width:1440,height});
    await desktop.locator('.builder-phone-frame').evaluate(element => Promise.all(element.parentElement.getAnimations().map(animation=>animation.finished)));
    const phone = await desktop.locator('.builder-phone-frame').boundingBox();
    const tools = await desktop.locator('.builder-glass-tools').boundingBox();
    assert.ok(Math.abs(phone.height/phone.width - 2) < .02,'phone preview keeps a compact 2:1 ratio');
    assert.ok(phone.y+phone.height <= tools.y-12,'phone stays above the floating tools');
  }
  await desktop.setViewportSize({width:1440,height:900});

  await desktop.locator('#builderDeviceDesktop').click();
  assert.equal(await desktop.locator('#builderPreview').evaluate((element) => element.classList.contains('mobile-view')), false);
  assert.equal(await desktop.locator('#builderDeviceDesktop').getAttribute('aria-pressed'), 'true');

  await desktop.locator('[data-tool="colour"]').click();
  await desktop.locator('[data-family="Bold"]').click();
  await desktop.locator('[data-colour]').first().click();
  const surfaceColours = async () => desktop.frameLocator('#previewFrame').locator('body').evaluate(() =>
    ['body','.site-header','.service-card','.closing'].map(selector => getComputedStyle(document.querySelector(selector)).backgroundColor));
  await desktop.frameLocator('#previewFrame').locator('.service-card').first().waitFor();
  const firstPalette = await surfaceColours();
  assert.equal(await desktop.locator('#builderOptions').isVisible(),false);
  await desktop.locator('[data-tool="colour"]').click();
  assert.equal(await desktop.locator('[data-family="Bold"]').getAttribute('aria-pressed'),'true','colour picker should reopen on the current palette family');
  await desktop.locator('[data-family="Bold"]').click();
  await desktop.locator('[data-colour="#245bb0"]').click();
  await desktop.frameLocator('#previewFrame').locator('body').evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  const secondPalette = await surfaceColours();
  firstPalette.forEach((colour,index) => assert.notEqual(secondPalette[index],colour,'palette must update every major surface'));
  await desktop.locator('[data-tool="colour"]').click();
  await desktop.locator('[data-family="Dark"]').click();
  await desktop.locator('[data-colour="#26313e"]').click();
  await desktop.frameLocator('#previewFrame').locator('body').waitFor();
  assert.equal(await desktop.frameLocator('#previewFrame').locator('html').evaluate(el=>getComputedStyle(el).colorScheme),'dark');
  await desktop.locator('[data-tool="font"]').click();
  await desktop.locator('[data-font="editorial"]').click();
  assert.equal(await desktop.locator('#builderOptions').isVisible(),false);
  assert.match(await desktop.frameLocator('#previewFrame').locator('.hero .button').first().evaluate(el=>getComputedStyle(el).fontFamily),/Fraunces/);
  await desktop.locator('[data-tool="layout"]').click();
  await desktop.locator('[data-layout-select]').selectOption('salon');
  await desktop.frameLocator('#previewFrame').locator('body.layout-salon').waitFor();
  await desktop.frameLocator('#previewFrame').locator('.nav [data-nav="services"]').click();
  await desktop.frameLocator('#previewFrame').locator('body').evaluate(()=>{window.__livePreviewToken='preserved';window.scrollTo({top:500,behavior:'instant'})});
  for(const tool of ['colour','font','layout']){
    await desktop.locator(`[data-tool="${tool}"]`).click();
    if(tool==='colour')await desktop.locator('[data-colour]').first().click();
    if(tool==='font')await desktop.locator('[data-font="modern"]').click();
    if(tool==='layout')await desktop.locator('[data-layout-select]').selectOption('electric');
    const live=desktop.frameLocator('#previewFrame');
    await live.locator('[data-page="services"]:not([hidden])').waitFor();
    await live.locator('body').evaluate(()=>document.fonts.ready);
    const state=await live.locator('body').evaluate(()=>({y:scrollY,token:window.__livePreviewToken}));
    assert.ok(Math.abs(state.y-500)<3,`${tool} should preserve the scroll position`);
    if(tool!=='layout')assert.equal(state.token,'preserved',`${tool} must update the existing document`);
  }
  await desktop.frameLocator('#previewFrame').locator('.nav [data-nav="home"]').click();
  await desktop.keyboard.press('Escape');
  assert.equal(await desktop.locator('#builderOptions').isVisible(), false);
  await desktop.locator('[data-tool="send"]').click();
  assert.equal(await desktop.getByRole('button', {name:'Send To Designer',exact:true}).isVisible(),true);
  await desktop.locator('[data-tool="send"]').click();
  assert.equal(await desktop.locator('#builderOptions').isVisible(),false);
  await desktop.frameLocator('#previewFrame').locator('.brand-scene').evaluate(async image => {await image.decode(); await Promise.all(image.getAnimations().map(animation => animation.finished));});
  const desktopHero = await desktop.frameLocator('#previewFrame').locator('.brand-scene').evaluate(image => {
    const photo = image.getBoundingClientRect();
    const copy = document.querySelector('.hero-copy').getBoundingClientRect();
    return {overlays:copy.top < photo.bottom, logoClear:copy.top >= photo.top + photo.height * .52, bottomAligned:Math.abs(copy.bottom-photo.bottom)<2};
  });
  // Local Trades places copy beneath the uncropped scene, protecting its logo.
  const safeHero = await desktop.frameLocator('#previewFrame').locator('.brand-scene').evaluate(image => {
    const a=image.getBoundingClientRect(),b=document.querySelector('.hero-copy').getBoundingClientRect();
    return b.right<=a.left+1||b.left>=a.right-1||b.top>=a.bottom-1||b.bottom<=a.top+1;
  });
  assert.equal(safeHero,true,'split hero copy must not overlap any part of the branded photograph');
  await desktop.screenshot({path:'/tmp/brightsite-builder-desktop.png'});
  // Render the real compositor output into the new renderer, then inspect the
  // body at desktop and phone widths. No lead or designer messages are sent.
  const brandedHero = await desktop.evaluate(() => HeroBrandCompositor.render({category:'Hair & Beauty',businessName:'Hull Hair',location:'Hull',output:'dataURL'}));
  assert.match(brandedHero,/^data:image\//);
  const site = await desktopContext.newPage();
  await site.emulateMedia({reducedMotion:'reduce'});
  const errors=[];
  site.on('pageerror',error=>errors.push(error.message));
  for(const layout of layouts) {
    const html = await desktop.evaluate(({layout,brandedHero}) => buildDemoHTML({name:'Hull Hair',tagline:'Hair & Beauty',location:'Hull',layout,heroImage:brandedHero}),{layout,brandedHero});
    await site.setContent(html,{waitUntil:'domcontentloaded'});
    assert.equal(await site.locator('.brand-scene').getAttribute('src'),brandedHero);
    await site.locator('.brand-scene').evaluate(async image=>{await image.decode();await document.fonts.ready});
    const logoSafe=await site.locator('.brand-scene').evaluate(image=>{
      const a=image.getBoundingClientRect(),b=document.querySelector('.hero-copy').getBoundingClientRect();
      const separate=b.right<=a.left+1||b.left>=a.right-1||b.top>=a.bottom-1||b.bottom<=a.top+1;
      return separate||b.top>=a.top+a.height*.54;
    });
    assert.equal(logoSafe,true,`${layout} must leave the 3D logo area clear`);
    await site.screenshot({path:`/tmp/brightsite-hero-${layout}.png`});
    await site.emulateMedia({reducedMotion:'reduce'});
    await site.locator('[data-page="home"] .section-heading').first().evaluate(el=>el.scrollIntoView({block:'start'}));
    await site.waitForFunction(()=>Array.from(document.querySelectorAll('[data-page="home"] .demo-photo')).filter(img=>img.getBoundingClientRect().top<innerHeight).every(img=>img.complete&&img.naturalWidth>0),{},{timeout:15000});
    await site.screenshot({path:`/tmp/brightsite-fresh-${layout}.png`});
    assert.equal(await site.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${layout} should fit desktop`);
    await site.setViewportSize({width:390,height:844});
    assert.equal(await site.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${layout} should fit mobile`);
    assert.ok(await site.locator('.header-action').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=14);
    assert.ok(await site.locator('.hero .button').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=15);
    await site.locator('[data-page="home"] .section-heading').first().evaluate(el=>el.scrollIntoView({block:'start'}));
    await site.screenshot({path:`/tmp/brightsite-fresh-${layout}-mobile.png`});
    for(const pageName of ['services','contact']){
      await site.locator('.menu-toggle').click();
      await site.locator(`#mobileNav [data-nav="${pageName}"]`).first().click();
      assert.equal(await site.locator(`[data-page="${pageName}"]`).isVisible(),true);
      assert.equal(await site.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${layout} ${pageName} must fit mobile`);
      await site.screenshot({path:`/tmp/brightsite-${pageName}-${layout}-mobile.png`});
    }
    await site.setViewportSize({width:1440,height:900});
  }
  assert.deepEqual(errors,[],'generated sites must have no script errors');
  await desktopContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobile = await mobileContext.newPage();
  await revealBuilder(mobile);

  assert.equal(
    await mobile.locator('.builder-bar-wrap').evaluate((element) => getComputedStyle(element).backgroundColor),
    'rgba(0, 0, 0, 0)',
    'mobile builder dock should stay transparent'
  );
  assert.equal(await mobile.locator('#builderOpenHtml').count(), 0);
  for (const layout of layouts) {
    await mobile.locator('[data-tool="layout"]').click();
    await mobile.locator('[data-layout-select]').selectOption(layout);
    assert.equal(await mobile.locator('#builderOptions').isVisible(),false);
    const frame = mobile.frameLocator('#previewFrame');
    await frame.locator(`body.layout-${layout}`).waitFor();
    const geometry = await frame.locator('.brand-scene').evaluate(image => {
      const photo = image.getBoundingClientRect();
      const copy = document.querySelector('.hero-copy').getBoundingClientRect();
      const header = document.querySelector('.site-header').getBoundingClientRect();
      return {separate:copy.top >= photo.bottom - 1, belowHeader:photo.top >= header.bottom - 1, fits:photo.right <= innerWidth + 1};
    });
    assert.equal(geometry.fits,true);
    assert.equal(geometry.belowHeader,true);
    if(layout !== 'garden') assert.equal(geometry.separate,true);
    assert.equal(await frame.locator('.gallery-demo').count(),6);
    assert.equal(await frame.locator('.review-card').count(),3);
    assert.match(await frame.locator('[data-page="services"]').textContent(),/Cuts & styling/);
    assert.doesNotMatch(await frame.locator('main').textContent(),/Reserve a table|Memberships|Book your vehicle/);
    assert.equal(await frame.locator('body').evaluate(el=>el.textContent.includes('↗')),false);
    assert.equal(await frame.locator('.header-action').isVisible(),true);
    await frame.locator('.header-action').click();
    assert.equal(await frame.locator('[data-page="contact"]').isVisible(),true);
    assert.equal(await frame.locator('[data-page="contact"] iframe').count(),1);
    await frame.locator('.menu-toggle').click();
    await frame.locator('#mobileNav [data-nav="home"]').click();
    assert.equal(await frame.locator('#mobileNav').isVisible(),false);
  }
  await mobile.locator('[data-tool="layout"]').click();
  await mobile.locator('[data-layout-select]').selectOption('electric');
  await mobile.locator('[data-tool="colour"]').click();
  await mobile.frameLocator('#previewFrame').locator('.brand-scene').evaluate(async image => {await image.decode(); await Promise.all(image.getAnimations().map(animation => animation.finished));});
  await mobile.screenshot({path:'/tmp/brightsite-builder-mobile.png'});
  await mobileContext.close();

  console.log('Builder controls passed desktop and mobile checks.');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
