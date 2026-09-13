// Stripe decides which Clients section a customer is in (lib/stripe.js):
// active → Live, cancelling/failing/cancelled → Urgent, nothing → Pending.

const { test } = require('node:test');
const assert = require('node:assert');
const { billingOf, better } = require('../lib/stripe');

test('Stripe: subscription states map to Live or Urgent', () => {
  assert.deepEqual(billingOf({ status: 'active' }), { status: 'active', until: '' });
  assert.equal(billingOf({ status: 'trialing' }).status, 'active');
  const ending = billingOf({ status: 'active', cancel_at_period_end: true, cancel_at: 1767225600 });
  assert.equal(ending.status, 'cancelling');
  assert.equal(ending.until, new Date(1767225600 * 1000).toISOString());
  assert.equal(billingOf({ status: 'past_due' }).status, 'failed');
  assert.equal(billingOf({ status: 'canceled', ended_at: 1767225600 }).status, 'cancelled');
});

test('Stripe: re-subscribing counts as active, and a one-off payment never hides a subscription', () => {
  const paid = { status: 'paid', until: '' };
  const cancelled = { status: 'cancelled', until: '' };
  const active = { status: 'active', until: '' };
  assert.equal(better(null, paid), paid);
  assert.equal(better(paid, cancelled), cancelled);
  assert.equal(better(cancelled, paid), cancelled);
  assert.equal(better(cancelled, active), active);
  assert.equal(better(active, cancelled), active);
});
