import { supabaseAdmin } from './supabase-admin.js';

// Sends an Expo push notification to the customer's phone (if they've used the app) and,
// when `message` is given, also posts it in their BrightSite chat so it's on the web dashboard too.
export async function notifyBusiness(slug, { title, body, message }) {
  if (!slug) return;
  const supabase = supabaseAdmin();
  const { data: row } = await supabase.from('businesses').select('data').eq('id', slug).single();
  const pushToken = row?.data?.pushToken;
  const jobs = [];
  if (pushToken) {
    jobs.push(fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: pushToken, title, body, sound: 'default' }),
    }).catch(err => console.error('Push failed:', err.message)));
  }
  if (message) {
    jobs.push(supabase.from('messages').insert({ business_id: slug, sender: 'admin', body: message })
      .then(({ error }) => { if (error) console.error('Message insert failed:', error.message); }));
  }
  await Promise.all(jobs);
}

// Push to BrightSite admins' phones. Admin phones register their token from the app (stored on
// the admin's login as user_metadata.pushTokens), so no extra table is needed.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'brightsiteapp@gmail.com,tommeofficial1@gmail.com')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

export async function adminPushTokens() {
  const supabase = supabaseAdmin();
  const tokens = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    data.users.forEach(u => {
      if (ADMIN_EMAILS.includes(String(u.email || '').toLowerCase())) (u.user_metadata?.pushTokens || []).forEach(t => tokens.push(t));
    });
    if (data.users.length < 200) break;
  }
  return [...new Set(tokens)];
}

export async function notifyAdmins(title, body, slug) {
  try {
    const tokens = await adminPushTokens();
    if (!tokens.length) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(to => ({ to, title, body, sound: 'default', data: { adminSlug: slug || '' } }))),
    });
  } catch (err) { console.error('Admin push failed:', err.message); }
}
