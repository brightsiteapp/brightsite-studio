import Stripe from 'stripe';
import { registerWithCloudflare, markBusinessLive } from './_lib/activate.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_DOMAIN_SECRET;

  let event;
  try {
    const rawBody = await new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  if (event.type !== 'checkout.session.completed') return res.status(200).json({ received: true });

  const session = event.data.object;
  const isDomainOnly = session.metadata?.type === 'domain_registration';
  const isCombined   = !isDomainOnly && !!session.metadata?.domain;
  if (!isDomainOnly && !isCombined) return res.status(200).json({ received: true });

  const domain = session.metadata.domain;
  const slug   = session.metadata.slug;

  try {
    await registerWithCloudflare(domain);

    await markBusinessLive(slug, domain, session.metadata?.publish_on_payment === 'true');

    console.log(`Domain registered: ${domain} for slug: ${slug}`);
    return res.status(200).json({ received: true, domain });
  } catch (err) {
    console.error('Domain registration error:', err.message);
    // A non-2xx response asks Stripe to retry. A paid domain must never be
    // silently abandoned because a downstream registration or publish failed.
    return res.status(500).json({ error: err.message });
  }
}

export const config = { api: { bodyParser: false } };
