// Sends US visitors to the USD pricing page. Everyone else gets the normal site.
// The country comes from Cloudflare (request.cf.country). The same country is also
// sent to /api/* as the cf-ipcountry header, which create-checkout-session.js reads.
const US_PAGES = { '/pricing': '/pricing-us.html', '/pricing.html': '/pricing-us.html' };

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const country = request.cf?.country || '';
    const headers = new Headers(request.headers);
    // Tell the origin which country this visitor is from (checkout uses it for USD prices).
    headers.set('cf-ipcountry', country);

    // Loop guard: the internal fetch below comes back through this Worker.
    if (request.headers.get('x-us-routed') === '1') {
      return fetch(request, { headers });
    }

    const usPath = US_PAGES[url.pathname];
    if (country === 'US' && usPath) {
      const target = new URL(usPath, url.origin);
      const usHeaders = new Headers(headers);
      usHeaders.set('x-us-routed', '1');
      const usRes = await fetch(new Request(target, { method: 'GET', headers: usHeaders }));
      // If the US page isn't deployed yet, fall back to the normal page rather than a 404.
      if (usRes.ok) return usRes;
    }

    return fetch(request, { headers });
  },
};
