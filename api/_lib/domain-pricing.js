const CF_API = 'https://api.cloudflare.com/client/v4';

function normaliseDomain(domain) {
  return String(domain || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
}

// Cloudflare's Check API goes to the registry, so it is the only quote we use
// for a purchase. Search and old availability endpoints are cached or retired.
export async function getLiveDomainQuote(domain) {
  const name = normaliseDomain(domain);
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!name || !accountId || !token) throw new Error('Live domain pricing is not configured.');

  const response = await fetch(`${CF_API}/accounts/${accountId}/registrar/domain-check`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ domains: [name] }),
    signal: AbortSignal.timeout(8000),
  });
  const json = await response.json().catch(() => ({}));
  const result = json?.result?.domains?.[0];
  if (!response.ok || !json.success || !result) throw new Error('Cloudflare could not verify this domain right now.');
  if (!result.registrable) throw new Error(result.reason === 'domain_unavailable' ? 'This domain is no longer available.' : 'This domain cannot be registered through Cloudflare.');

  const amount = Number(result.pricing?.registration_cost);
  const currency = String(result.pricing?.currency || '').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !currency) throw new Error('Cloudflare did not return a registration price.');
  return { domain: name, currency, amount, registrationCost: result.pricing.registration_cost, renewalCost: result.pricing?.renewal_cost || null };
}

// Stripe subscriptions in this project are GBP. Convert each verified
// Cloudflare quote immediately before checkout using a live FX reference.
export async function quoteDomainInGbp(domain) {
  const quote = await getLiveDomainQuote(domain);
  let gbp = quote.amount;
  if (quote.currency !== 'GBP') {
    const response = await fetch(`https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(quote.currency)}&symbols=GBP`, { signal: AbortSignal.timeout(5000) });
    const json = await response.json().catch(() => ({}));
    const rate = Number(json?.rates?.GBP);
    if (!response.ok || !Number.isFinite(rate) || rate <= 0) throw new Error('Could not convert the live domain quote to GBP.');
    gbp *= rate;
  }
  const amountPence = Math.round(gbp * 100);
  if (amountPence < 1) throw new Error('Invalid live domain price.');
  return { ...quote, amountPence };
}
