// Routes by host and country.
//  - us.brightsite.app: the US site (USD pricing page at the front, everything else from brightsite.app).
//  - uk.brightsite.app: the UK site (same content as brightsite.app).
//  - brightsite.app: US visitors on /pricing get the USD page; everyone else gets the normal site.
// Cloudflare sets request.cf.country. The country is passed on to the origin as cf-ipcountry,
// which create-checkout-session.js reads to pick USD or GBP prices.
const ORIGIN = 'https://brightsite.app';
const US_PAGES = { '/pricing': '/pricing-us.html', '/pricing.html': '/pricing-us.html' };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const country = request.cf?.country || '';
    const headers = new Headers(request.headers);
    headers.set('cf-ipcountry', country);

    // Loop guard: internal fetches back to brightsite.app come through this Worker again.
    if (request.headers.get('x-us-routed') === '1') {
      return fetch(new Request(ORIGIN + url.pathname + url.search, { method: request.method, headers, body: request.body, redirect: 'manual' }));
    }

    const isUsHost = url.hostname === 'us.brightsite.app';
    const isUkHost = url.hostname === 'uk.brightsite.app';

    // The US host always shows US prices; the main domain only does so for US visitors.
    const wantUs = isUsHost || (!isUkHost && country === 'US');
    const usPath = wantUs ? US_PAGES[url.pathname] : undefined;

    const target = new URL(usPath || url.pathname, ORIGIN);
    target.search = url.search;
    const originHeaders = new Headers(headers);
    originHeaders.set('x-us-routed', '1');
    const res = await fetch(new Request(target, { method: request.method, headers: originHeaders, body: request.body, redirect: 'manual' }));
    // If the US page is missing, show the normal page rather than a 404.
    if (usPath && !res.ok) {
      return fetch(new Request(ORIGIN + url.pathname + url.search, { method: request.method, headers: originHeaders, redirect: 'manual' }));
    }
    // US home: the UK homepage with USD prices swapped in (elements tagged data-usd in index.html).
    if (wantUs && url.pathname === '/' && res.ok) {
      return new HTMLRewriter()
        .on('[data-usd]', { element(el) { el.setInnerContent(el.getAttribute('data-usd')); } })
        .transform(res);
    }
    return res;
  },
};
