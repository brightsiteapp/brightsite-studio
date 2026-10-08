import { createClient } from '@supabase/supabase-js';

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;

export async function registerWithCloudflare(domain) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/registrar/registrations`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain_name: domain, auto_renew: true }),
    }
  );
  const json = await res.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors));
  return json.result;
}

export async function markBusinessLive(slug, domain, publishOnPayment) {
  if (!slug) return;
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: current, error: readError } = await supabase
    .from('businesses').select('data').eq('id', slug).single();
  if (readError) throw readError;
  const previous = current?.data || {};
  const nextData = {
    ...previous,
    ...(domain ? { customDomain: domain, domain, liveUrl: `https://${domain}`, domainRegistered: true } : {}),
    ...(publishOnPayment ? { published: true, planActive: true, needsPublish: false, manuallyOffline: false } : {}),
  };
  const { error: updateError } = await supabase
    .from('businesses')
    .update({ data: nextData, updated_at: new Date().toISOString() })
    .eq('id', slug);
  if (updateError) throw updateError;
}

