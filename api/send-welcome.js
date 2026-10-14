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

function serviceHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
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

  // Verify user owns this business
  const ownerRes = await fetch(
    `${SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(slug)}&user_id=eq.${user.id}&select=id,data`,
    { headers: serviceHeaders() }
  );
  const rows = await ownerRes.json();
  if (!Array.isArray(rows) || rows.length === 0) return response.status(403).json({ error: 'Forbidden' });

  const existingData = rows[0].data || {};
  const firstName = (fullName || existingData.fullName || '').trim().split(' ')[0] || 'there';
  const isDesigner = buildChoice === 'designer' || existingData.buildChoice === 'designer';
  const welcomeBody = isDesigner
    ? `Hey ${firstName}, welcome to BrightSite! My name is Tom and I'll be your designer and support. I'm working on your preview now, so let me know if you have any requests or questions. When you're ready, just hit Make Live to put your website online!`
    : `Hey ${firstName}, welcome to BrightSite! My name is Tom and I'll be your support. Love your design! Let me know if you have any requests or questions. When you're ready, just hit Make Live to put your website online!`;

  // Check if welcome already sent (idempotency)
  const existCheck = await fetch(
    `${SUPABASE_URL}/rest/v1/messages?business_id=eq.${encodeURIComponent(slug)}&sender=eq.admin&select=id&limit=1`,
    { headers: serviceHeaders() }
  );
  const existing = await existCheck.json();
  if (Array.isArray(existing) && existing.length > 0) {
    return response.status(200).json({ ok: true, skipped: true });
  }

  // Insert welcome message
  await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ business_id: slug, sender: 'admin', body: welcomeBody }),
  });

  // Save push token if provided and not already stored
  const resolvedPushToken = pushToken || existingData.pushToken;
  if (pushToken && pushToken !== existingData.pushToken) {
    await fetch(`${SUPABASE_URL}/rest/v1/businesses?id=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: serviceHeaders({ Prefer: 'return=minimal' }),
      body: JSON.stringify({ data: { ...existingData, pushToken } }),
    }).catch(() => {});
  }

  // Send push notification
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
