import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { chromium } from 'playwright';

// Fast, offline layout checks. Photography is mocked here; the builder smoke
// test separately renders the real 3D compositor and real gallery photographs.
const context=vm.createContext({});
for(const file of ['template-designs.js','fresh-templates.js','demo-generator.js']){
  vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
}
const layouts=vm.runInContext('DEMO_LAYOUTS',context);
const categories=vm.runInContext('BUSINESS_TYPES',context);
assert.equal(layouts.length,8);
assert.equal(new Set(layouts.map(item=>item.name)).size,8);
assert.equal(layouts.some(item=>item.id==='lume'||item.name==='Legacy'),false);
const picture='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#b7a799"/></svg>';
const hero='data:image/svg+xml;base64,'+Buffer.from(picture).toString('base64');
const browser=await chromium.launch({headless:true});
try{
  const browserContext=await browser.newContext({reducedMotion:'reduce'});
  await browserContext.route('https://**/*',route=>route.request().resourceType()==='image'
    ?route.fulfill({contentType:'image/svg+xml',body:picture})
    :route.abort());
  for(const layout of layouts){
    for(const info of categories){
      const page=await browserContext.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      const html=context.buildDemoHTML({name:'Sample Business',tagline:info.label,location:'Hull',layout:layout.id,heroImage:hero});
      await page.setContent(html,{waitUntil:'load'});
      assert.equal(await page.locator('.page').count(),3);
      assert.equal(await page.locator('.gallery-demo').count(),6);
      assert.equal(await page.locator('.review-card').count(),3);
      assert.equal(await page.locator('[data-page="contact"] .map iframe').count(),1);
      const directory=await page.locator('[data-page="services"]').textContent();
      for(const group of info.groups||[]){
        for(const [service,price] of group.items){
          assert.ok(directory.includes(service),`${layout.name}/${info.label}: missing ${service}`);
          assert.ok(directory.includes(price),`${layout.name}/${info.label}: missing ${price}`);
        }
      }
      for(const width of [1440,390]){
        await page.setViewportSize({width,height:900});
        for(const name of ['home','services','contact']){
          await page.evaluate(name=>document.querySelector('.site-header .nav [data-nav="'+name+'"]').click(),name);
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
          assert.ok(overflow<=1,`${layout.name}/${info.label}/${name}/${width}: ${overflow}px overflow`);
          if(name==='home'){
            const safe=await page.locator('.brand-scene').evaluate(image=>{
              const a=image.getBoundingClientRect(),b=document.querySelector('.hero-copy').getBoundingClientRect();
              return getComputedStyle(image).objectFit==='contain'&&(b.right<=a.left+1||b.left>=a.right-1||b.bottom<=a.top+1||b.top>=a.bottom-1||b.top>=a.top+a.height*.54);
            });
            assert.ok(safe,`${layout.name}/${info.label}/${width}: logo protection`);
          }
        }
      }
      assert.deepEqual(errors,[],`${layout.name}/${info.label}: script errors`);
      await page.close();
    }
    console.log(`${layout.name}: all ${categories.length} categories, three pages, desktop and mobile passed.`);
  }
}finally{await browser.close()}
