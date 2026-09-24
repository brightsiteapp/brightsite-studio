import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;

async function registerWithCloudflare(domain) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/registrar/domains/${encodeURIComponent(domain)}/register`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ auto_renew: true }),
    }
  );
  const json = await res.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors));
  return json.result;
}

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
  if (session.metadata?.type !== 'domain_registration') return res.status(200).json({ received: true });

  const domain = session.metadata.domain;
  const slug   = session.metadata.slug;

  try {
    await registerWithCloudflare(domain);

    // Update business record in Supabase with the new domain
    if (slug) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      await supabase
        .from('businesses')
        .update({ custom_domain: domain })
        .eq('slug', slug);
    }

    console.log(`Domain registered: ${domain} for slug: ${slug}`);
    return res.status(200).json({ received: true, domain });
  } catch (err) {
    console.error('Domain registration error:', err.message);
    // Return 200 so Stripe doesn't retry — log and investigate separately
    return res.status(200).json({ received: true, error: err.message });
  }
}

export const config = { api: { bodyParser: false } };
