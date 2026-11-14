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
export function addonPrice() {
  return ADDON.monthly;
}
const PRO_BUILD_FEE = 'price_1UGplTGqCP7G2YApGrrTagi9'; // £199 one-off

const FREE_DOMAIN_ALLOWANCE_PENCE = 1200; // "Free domain included — worth up to £12/yr"

export function planPrices(plan, billing) {
  const recurring = HOSTING[billing];
  if (!recurring || !['essential', 'pro'].includes(plan)) return null;
  return { recurring, setup: plan === 'pro' ? PRO_BUILD_FEE : null };
}

// Annual plans and Pro include a domain worth up to £12; anything above that is charged.
export function domainChargePence(plan, billing, quotePence) {
  // No free domain on the pricing page any more (partner referral codes will add it later).
  return quotePence;
}
