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

  const origin = request.headers.origin;
  if (origin === 'https://brightsite.app' || origin === 'https://www.brightsite.app') {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') return response.status(204).end();

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
    ? `Hey ${firstName}, welcome to BrightSite! I'm Tom, your designer.\n\n• I'm building your website now\n• You'll get a notification when it's ready to review\n• If I need anything else to build it, I'll message you here\n• Got ideas or requests? Send them here as notes anytime`
    : `Hey ${firstName}, welcome to BrightSite! I'm Tom, your support.\n\n• Your design is saved and ready\n• Hit Make Live whenever you want it online\n• You'll get a notification if I need anything from you\n• Got ideas or requests? Send them here as notes anytime`;

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
    console.error('Welcome message insert failed', insertRes.status, await insertRes.text());
    return response.status(500).json({ error: 'Insert failed' });
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
        body: `Hey ${firstName}, Tom has sent you a message. Tap to read it.`,
        sound: 'default',
        data: { screen: 'messages' },
      }),
    }).catch(() => {});
  }

  return response.status(200).json({ ok: true });
}
