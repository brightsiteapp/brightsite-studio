// Cloudflare Worker that emails brightsiteapp@gmail.com whenever a
// lead is captured on the site. Handles two shapes of request:
//  - application/json: a quick text-only lead ping (business_name, details)
//  - multipart/form-data: the full WhatsApp handoff — business details plus
//    any uploaded photos and the generated site preview, sent as one email
//    with real attachments via Resend (replaces the old formsubmit.co path,
//    which needed a manual "activate this form" step per recipient and
//    still couldn't include the business details or preview).
// Leads are also logged to Supabase (see homepage-builder.js), but that
// table isn't checked automatically — this runs regardless of whether the
// customer presses the WhatsApp handoff.

const ALLOWED_ORIGINS = new Set([
  'https://brightsite.app',
  'https://www.brightsite.app',
]);

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://brightsite.app';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function bufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function handleJsonLead(body, env, cors) {
  const { business_name, details } = body || {};
  if (!business_name) {
    return Response.json({ error: 'business_name required' }, { status: 400, headers: cors });
  }
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'BrightSite Leads <leads@brightsite.app>',
      to: ['brightsiteapp@gmail.com'],
      subject: `New lead: ${business_name}`,
      text: details || '(no further details)',
    }),
  });
  if (!emailRes.ok) {
    throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
  }
}

const TEXT_FIELDS = [
  'Business', 'Customer', 'Customer email', 'Industry', 'Location',
  'Template', 'Font', 'Colour scheme', 'Interested in',
  'Current website', 'Social media', 'Media notes',
];

async function handleFormLead(form, env, cors) {
  const business = form.get('Business') || 'Unknown business';
  const lines = TEXT_FIELDS
    .map(name => [name, form.get(name)])
    .filter(([, value]) => value)
    .map(([name, value]) => `${name}: ${value}`);

  const attachments = [];
  for (const [name, value] of form.entries()) {
    if (value instanceof File && value.size > 0) {
      attachments.push({
        filename: value.name || `${name}.dat`,
        content: bufferToBase64(await value.arrayBuffer()),
      });
    }
  }

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'BrightSite Leads <leads@brightsite.app>',
      to: ['brightsiteapp@gmail.com'],
      subject: `New BrightSite customer handoff — ${business}`,
      text: lines.join('\n') || '(no further details)',
      attachments,
    }),
  });
  if (!emailRes.ok) {
    throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
  }
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
    }

    if (!env.RESEND_API_KEY) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500, headers: cors });
    }

    const contentType = req.headers.get('Content-Type') || '';

    try {
      if (contentType.includes('multipart/form-data')) {
        await handleFormLead(await req.formData(), env, cors);
      } else {
        let body;
        try {
          body = await req.json();
        } catch {
          body = {};
        }
        const result = await handleJsonLead(body, env, cors);
        if (result) return result;
      }
      return Response.json({ ok: true }, { headers: cors });
    } catch (error) {
      console.error('notify-lead failed:', error);
      return Response.json({ error: 'Failed to send notification' }, { status: 502, headers: cors });
    }
  },
};
