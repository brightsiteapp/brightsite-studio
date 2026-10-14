const SUPABASE_URL = 'https://vlisyfshmxdsjuybirxe.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_gYdn5HCo63B0qZj3tG-7ow_myAMHeEB';

function bearerToken(request) {
  const authorization = String(request.headers.authorization || '');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

async function currentUser(token) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

function userHeaders(token, extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'private, no-store');

  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return response.status(204).end();
  }

  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed' });

  const token = bearerToken(request);
  if (!token) return response.status(401).json({ error: 'Unauthorized' });

  const user = await currentUser(token);
  if (!user?.id) return response.status(401).json({ error: 'Unauthorized' });

  const { slug, fullName, buildChoice, pushToken } = request.body || {};
  if (!slug) return response.status(400).json({ error: 'Missing slug' });

  // Read business using user's own token (RLS enforces ownership)
  const ownerRes = await fetch(
    `${SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(slug)}&select=id,data`,
    { headers: userHeaders(token) }
  );
  const rows = await ownerRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return response.status(403).json({ error: 'Forbidden' });

  const existingData = rows[0].data || {};
  const firstName = (fullName || existingData.fullName || '').trim().split(' ')[0] || 'there';
  const isDesigner = buildChoice === 'designer' || existingData.buildChoice === 'designer';
  const welcomeBody = isDesigner
    ? `Hey ${firstName}, welcome to BrightSite! My name is Tom and I'll be your designer and support. I'm working on your preview now, so let me know if you have any requests or questions. When you're ready, just hit Make Live to put your website online!`
    : `Hey ${firstName}, welcome to BrightSite! My name is Tom and I'll be your support. Love your design! Let me know if you have any requests or questions. When you're ready, just hit Make Live to put your website online!`;

  // Check if welcome already sent (idempotency) — using user's token, RLS allows reading own messages
  const existCheck = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?business_id=eq.${encodeURIComponent(slug)}&sender=eq.admin&select=id&limit=1`,
    { headers: userHeaders(token) }
  );
  const existing = await existCheck.json();
  if (Array.isArray(existing) && existing.length > 0) {
    return response.status(200).json({ ok: true, skipped: true });
  }

  // Insert welcome message — RLS allows authenticated users to insert for their own business
  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: userHeaders(token, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ business_id: slug, sender: 'admin', body: welcomeBody }),
  });
  if (!insertRes.ok) {
    const err = await insertRes.text();
    return response.status(500).json({ error: 'Insert failed', detail: err });
  }

  // Save push token alongside existing data using user's token
  const resolvedPushToken = pushToken || existingData.pushToken;
  if (pushToken && pushToken !== existingData.pushToken) {
    await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: userHeaders(token, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ data: { ...existingData, pushToken } }),
    }).catch(() => {});
  }

  // Send push notification via Expo — no secret needed
  if (resolvedPushToken) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
      body: JSON.stringify({
        to: resolvedPushToken,
        title: 'Welcome to BrightSite! 👋',
        body: `Hey ${firstName}, your preview is being prepared. Tap to open your messages.`,
        sound: 'default',
        data: { screen: 'messages' },
      }),
    }).catch(() => {});
  }

  return response.status(200).json({ ok: true });
}
