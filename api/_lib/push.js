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
