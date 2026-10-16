// Plans as shown on pricing.html. "essential" is the Free plan (website built free, pay hosting);
// Pro adds a one-off £199 build fee for sites over 3 pages. Both use the same hosting prices.
const HOSTING = {
  monthly: 'price_1UGhbEGqCP7G2YApAOKm8Goo', // £19/mo
  annual: 'price_1UGpjvGqCP7G2YAptYGCKsFl',  // £204/yr (£17/mo)
};
const PRO_BUILD_FEE = 'price_1UGplTGqCP7G2YApGrrTagi9'; // £199 one-off

const FREE_DOMAIN_ALLOWANCE_PENCE = 1200; // "Free domain included — worth up to £12/yr"

export function planPrices(plan, billing) {
  const recurring = HOSTING[billing];
  if (!recurring || !['essential', 'pro'].includes(plan)) return null;
  return { recurring, setup: plan === 'pro' ? PRO_BUILD_FEE : null };
}

// Annual plans and Pro include a domain worth up to £12; anything above that is charged.
export function domainChargePence(plan, billing, quotePence) {
  const included = plan === 'pro' || billing === 'annual';
  return included ? Math.max(0, quotePence - FREE_DOMAIN_ALLOWANCE_PENCE) : quotePence;
}
