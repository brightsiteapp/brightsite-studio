import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { registerWithCloudflare, markBusinessLive } from './lib/activate.js';

// Called by the mobile app after PaymentSheet succeeds. Trusts nothing from the
// client except the subscription id: everything else is read back from Stripe.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { subscriptionId } = req.body || {};
  if (!subscriptionId) return res.status(400).json({ error: 'Missing subscription' });

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
    if (sub.metadata?.source !== 'mobile_app') return res.status(400).json({ error: 'Unknown subscription' });
    if (!['active', 'trialing'].includes(sub.status) || sub.latest_invoice?.status !== 'paid') {
      return res.status(409).json({ error: 'Payment has not completed yet.' });
    }
    const { slug, domain, billing } = sub.metadata;

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data: row } = await supabase.from('businesses').select('data').eq('id', slug).single();
    const alreadyRegistered = row?.data?.domainRegistered && row?.data?.domain === domain;
    if (domain && !alreadyRegistered) await registerWithCloudflare(domain);
    await markBusinessLive(slug, domain || null, true);
    if (row) {
      const { data: fresh } = await supabase.from('businesses').select('data').eq('id', slug).single();
      const raw = { ...(fresh?.data?.raw || {}), chosenPlan: 'essential', chosenAnnual: billing === 'annual' };
      await supabase.from('businesses').update({ data: { ...fresh.data, raw, stripeSubscriptionId: sub.id } }).eq('id', slug);
    }
    res.status(200).json({ live: true });
  } catch (err) {
    console.error('Confirm app payment error:', err.message);
    res.status(500).json({ error: 'Payment received but activation is delayed. We’ll sort it shortly.' });
  }
}
