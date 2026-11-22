// Routes by host and country.
//  - us.brightsite.app: the US site (USD pricing page at the front, everything else from brightsite.app).
//  - uk.brightsite.app: the UK site (same content as brightsite.app).
//  - brightsite.app: the public marketing pages (home, pricing, our work, contact, terms, cookies) send visitors to
//    us.brightsite.app (US) or uk.brightsite.app (everyone else), like a regional store switcher. A region the visitor
//    has used before (cookie bs_region) wins over their country. Search and link-preview bots are not redirected.
//  - Account, checkout and the partner landing page stay on brightsite.app: login sessions live in browser storage per
//    domain, so uk./us. send those paths back to the main domain.
// Cloudflare sets request.cf.country. The country is passed on to the origin as cf-ipcountry,
// which create-checkout-session.js reads to pick USD or GBP prices.
const ORIGIN = 'https://brightsite.app';
const MARKETING = new Set(['/', '/pricing', '/pricing.html', '/ourwork', '/ourwork.html', '/contact', '/contact.html', '/terms', '/terms.html', '/cookies', '/cookies.html']);
const APP_PREFIXES = ['/account', '/checkout', '/domain-checkout', '/preview', '/invoices', '/beverley'];
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|linkedin|twitter|discord|preview/i;
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

    const isNav = request.method === 'GET' || request.method === 'HEAD';
    const isApex = !isUsHost && !isUkHost;

    // Main domain: send people to their regional site. A saved choice beats their country.
    if (isNav && isApex && MARKETING.has(url.pathname) && !BOT.test(request.headers.get('user-agent') || '')) {
      const saved = (request.headers.get('cookie') || '').match(/(?:^|;\s*)bs_region=(uk|us)/);
      const region = saved ? saved[1] : (country === 'US' ? 'us' : 'uk');
      return Response.redirect(`https://${region}.brightsite.app${url.pathname}${url.search}`, 302);
    }
    // Regional sites only serve marketing pages: account, checkout etc. go back to the main domain.
    if (isNav && !isApex && APP_PREFIXES.some(p => url.pathname === p || url.pathname.startsWith(p + '/') || url.pathname.startsWith(p + '.'))) {
      return Response.redirect(`https://brightsite.app${url.pathname}${url.search}`, 302);
    }
    // Remember the region a visitor is on, so the main domain sends them back to it next time.
    const remember = (res) => {
      if (isApex) return res;
      const out = new Response(res.body, res);
      out.headers.append('set-cookie', `bs_region=${isUsHost ? 'us' : 'uk'}; Domain=.brightsite.app; Path=/; Max-Age=31536000; Secure; SameSite=Lax`);
      return out;
    };

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
      return remember(await fetch(new Request(ORIGIN + url.pathname + url.search, { method: request.method, headers: originHeaders, redirect: 'manual' })));
    }
    // US home: the UK homepage with USD prices swapped in (elements tagged data-usd in index.html).
    if (wantUs && url.pathname === '/' && res.ok) {
      return remember(new HTMLRewriter()
        .on('[data-usd]', { element(el) { el.setInnerContent(el.getAttribute('data-usd')); } })
        .transform(res));
    }
    return remember(res);
  },
};
