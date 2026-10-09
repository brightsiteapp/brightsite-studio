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
  const { data: row, error: readError } = await supabase
    .from('businesses').select('name,data').eq('id', slug).single();
  if (readError) throw readError;
  const previous = row?.data || {};
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

  if (publishOnPayment) {
    const businessName = row?.name || previous?.raw?.name || '';
    const siteUrl = domain ? `https://${domain}` : previous.liveUrl || '';
    await notifyClientLive(supabase, slug, previous.pushToken, businessName, siteUrl);
  }
}

async function notifyClientLive(supabase, slug, pushToken, businessName, siteUrl) {
  const message = `🎉 Your website is live${siteUrl ? ` at ${siteUrl}` : ''}! Share it with everyone.`;
  await supabase.from('messages').insert({ business_id: slug, sender: 'admin', body: message }).catch(() => {});
  if (!pushToken) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
    body: JSON.stringify({
      to: pushToken,
      title: businessName ? `${businessName} is live! 🎉` : 'Your website is live! 🎉',
      body: siteUrl ? `Tap to open ${siteUrl}` : 'Your website is now live and ready to share.',
      sound: 'default',
      data: { screen: 'dashboard' },
    }),
  }).catch(() => {});
}

