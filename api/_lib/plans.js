// Plans as shown on pricing.html. "essential" is the Free plan (website built free, pay hosting);
// Pro adds a one-off £199 build fee for sites over 5 pages. Both use the same hosting prices.
const HOSTING = {
  monthly: 'price_1UGhbEGqCP7G2YApAOKm8Goo', // £19/mo (matches pricing page)
  annual: 'price_1UbjtgGqCP7G2YAp7pkrd1fY',  // £192/yr (£16/mo, matches pricing page)
};
// Legacy £204/yr annual price, kept so existing annual subscribers are not changed.
const LEGACY_ANNUAL = 'price_1UGpjvGqCP7G2YAptYGCKsFl';
// The add-on is always £19/mo. Stripe can't mix billing periods in one subscription, so on
// annual plans it is charged as its own monthly subscription after checkout (see register-domain.js).
const ADDON = {
  monthly: 'price_1UGhhAGqCP7G2YApFCPg4MHw', // £19/mo
};
// US prices (USD), created in Stripe on the same products as the GBP prices.
const HOSTING_US = {
  monthly: 'price_1Udc9dGqCP7G2YApqTNpzRDR', // US$25/mo
  annual: 'price_1UdcAkGqCP7G2YApHHMfexGN',  // US$264/yr ($22/mo)
};
const ADDON_US = 'price_1UdcAIGqCP7G2YApB6fmuAg7'; // US$25/mo
const PRO_BUILD_FEE_US = 'price_1UdcB8GqCP7G2YApuVQ3PWZl'; // US$269 one-off

export function addonPrice(region = 'gbp') {
  return region === 'us' ? ADDON_US : ADDON.monthly;
}
const PRO_BUILD_FEE = 'price_1UGplTGqCP7G2YApGrrTagi9'; // £199 one-off

const FREE_DOMAIN_ALLOWANCE_PENCE = 1200; // "Free domain included — worth up to £12/yr"

export function planPrices(plan, billing, region = 'gbp') {
  const us = region === 'us';
  const hosting = us ? HOSTING_US : HOSTING;
  const recurring = hosting[billing];
  if (!recurring || !['essential', 'pro'].includes(plan)) return null;
  return { recurring, setup: plan === 'pro' ? (us ? PRO_BUILD_FEE_US : PRO_BUILD_FEE) : null, currency: us ? 'usd' : 'gbp' };
}

// Annual plans and Pro include a domain worth up to £12; anything above that is charged.
export function domainChargePence(plan, billing, quotePence) {
  // No free domain on the pricing page any more (partner referral codes will add it later).
  return quotePence;
}
