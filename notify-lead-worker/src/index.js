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
  'Current website', 'Social media', 'Media notes', 'Account setup url',
];

// Fired alongside the internal notification whenever the handoff carried a
// customer email address, so the customer isn't left wondering whether their
// WhatsApp/email button-press actually did anything while they wait to hear
// back. Best-effort: a failure here shouldn't fail the whole lead capture.
async function sendCustomerWelcomeEmail(env, email, business, accountUrl) {
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'BrightSite <leads@brightsite.app>',
        to: [email],
        subject: 'Welcome to BrightSite — we’ve got your design idea',
        text: `Welcome to BrightSite!\n\nWe've received your website info${business ? ` for ${business}` : ''} and will be in touch today.\n\nIn the meantime, set up your account so you can manage your own site:\n${accountUrl || 'https://brightsite.app'}\n\nSpeak soon,\nThe BrightSite team`,
      }),
    });
    if (!emailRes.ok) {
      console.error(`Resend welcome email ${emailRes.status}: ${await emailRes.text()}`);
    }
  } catch (error) {
    console.error('Customer welcome email failed', error);
  }
}

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

  const customerEmail = form.get('Customer email');
  if (customerEmail) {
    await sendCustomerWelcomeEmail(env, customerEmail, business, form.get('Account setup url'));
  }
}

// account/dashboard.html's "Manage billing" button — Studio itself runs on
// the admin's Mac, not the public internet, so the one call that needs a
// live Stripe secret key from a page the *customer's* browser can reach has
// to happen here instead. Verifies the caller is actually signed in (via
// their own Supabase access token — this worker only holds the anon key,
// never a customer's password) before ever touching Stripe, then hands
// back a Billing Portal URL for the browser to redirect to.
async function handlePortalSession(body, env, cors) {
  const { access_token } = body || {};
  if (!access_token) return Response.json({ error: 'Not signed in.' }, { status: 401, headers: cors });

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return Response.json({ error: 'Your session has expired — log in again.' }, { status: 401, headers: cors });
  const user = await userRes.json();
  if (!user.email) return Response.json({ error: 'No email on this account.' }, { status: 400, headers: cors });

  const customers = await stripeCall(env, `customers?email=${encodeURIComponent(user.email)}&limit=1`);
  const customerId = customers.data?.[0]?.id;
  if (!customerId) {
    return Response.json({ error: 'We don’t have a billing record for this email yet — contact us to sort out your plan.' }, { status: 404, headers: cors });
  }

  const session = await stripeCall(env, 'billing_portal/sessions', {
    customer: customerId,
    return_url: env.PORTAL_RETURN_URL || 'https://brightsite.app/account/dashboard.html',
  });
  return Response.json({ url: session.url }, { headers: cors });
}

// Our own cancellation reasons, since Stripe's Billing Portal survey only
// offers its fixed enum (see BrightSite Studio's ensureCancellationSurvey).
// Each maps to the closest Stripe `cancellation_details[feedback]` value —
// the full label plus the customer's own comment goes in `comment` instead,
// which is free text, so nothing customer-facing is actually lost.
const CANCEL_REASONS = {
  too_expensive: { label: 'Too expensive', feedback: 'too_expensive' },
  missing_features: { label: 'Missing a feature I need', feedback: 'missing_features' },
  closing_business: { label: 'Closing my business', feedback: 'other' },
  changing_developer: { label: 'Changing developer / moving my site elsewhere', feedback: 'switched_service' },
  unused: { label: 'Not using it enough', feedback: 'unused' },
  customer_service: { label: 'Poor support experience', feedback: 'customer_service' },
  too_complex: { label: 'Too complicated to manage', feedback: 'too_complex' },
  other: { label: 'Other', feedback: 'other' },
};

// account/dashboard.html's own "Cancel my plan" flow — replaces sending the
// customer through Stripe's Billing Portal cancel survey so we can offer
// reasons that actually fit (closing the business, changing developer),
// plus an optional request for their website files. Cancels at the end of
// the current billing period (no refund questions), same as a customer
// cancelling any other way. The existing Stripe webhook already emails
// brightsiteapp@gmail.com and queues a Studio task off cancellation_details,
// so this handler just needs to set that field correctly.
async function handleCancelSubscription(body, env, cors) {
  const { access_token, reason, comment, wantsFiles } = body || {};
  if (!access_token) return Response.json({ error: 'Not signed in.' }, { status: 401, headers: cors });

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${access_token}` },
  });
  if (!userRes.ok) return Response.json({ error: 'Your session has expired — log in again.' }, { status: 401, headers: cors });
  const user = await userRes.json();
  if (!user.email) return Response.json({ error: 'No email on this account.' }, { status: 400, headers: cors });

  const customers = await stripeCall(env, `customers?email=${encodeURIComponent(user.email)}&limit=1`);
  const customerId = customers.data?.[0]?.id;
  if (!customerId) {
    return Response.json({ error: 'We don’t have a billing record for this email yet — contact us to sort out your plan.' }, { status: 404, headers: cors });
  }

  const subs = await stripeCall(env, `subscriptions?customer=${customerId}&status=active&limit=1`);
  const subscription = subs.data?.[0];
  if (!subscription) {
    return Response.json({ error: 'No active subscription found on this account.' }, { status: 404, headers: cors });
  }

  const known = CANCEL_REASONS[reason] || CANCEL_REASONS.other;
  const parts = [known.label];
  if (comment) parts.push(comment);
  if (wantsFiles) parts.push('Requested a copy of their website files.');

  await stripeCall(env, `subscriptions/${subscription.id}`, {
    cancel_at_period_end: 'true',
    'cancellation_details[feedback]': known.feedback,
    'cancellation_details[comment]': parts.join(' — '),
  });

  return Response.json({ ok: true }, { headers: cors });
}

async function stripeCall(env, endpoint, params) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Stripe error ${res.status}`);
  return data;
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameSignature(actual, expected) {
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actual.length; i += 1) mismatch |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

// Stripe signs the exact raw request body. Verify it before parsing so this
// public endpoint cannot be used to trigger cancellation emails.
async function verifyStripeSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const parts = signature.split(',').map(part => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const digest = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return signatures.some(candidate => sameSignature(candidate, digest));
}

async function sendCancellationEmail(env, subscription) {
  const customer = typeof subscription.customer === 'string'
    ? await stripeCall(env, `customers/${subscription.customer}`)
    : subscription.customer;
  const business = subscription.metadata?.brightsite_slug || 'a BrightSite customer';
  const details = subscription.cancellation_details || {};
  const ending = subscription.cancel_at_period_end
    ? `at the end of the current billing period${subscription.cancel_at ? ` (${new Date(subscription.cancel_at * 1000).toLocaleDateString('en-GB')})` : ''}`
    : 'immediately';
  const reason = details.reason ? details.reason.replace(/_/g, ' ') : 'No reason supplied';
  const text = [
    `${business} has cancelled their Stripe subscription ${ending}.`,
    `Customer: ${customer?.email || 'Unknown email'}`,
    `Reason: ${reason}`,
    details.comment ? `Comment: ${details.comment}` : '',
    '',
    'Studio will place this customer in the cancelled/payment-issue area on its next billing refresh.'
  ].filter(Boolean).join('\n');
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: 'BrightSite <leads@brightsite.app>',
      to: ['brightsiteapp@gmail.com'],
      subject: `Stripe cancellation: ${business}`,
      text
    })
  });
  if (!emailRes.ok) throw new Error(`Resend ${emailRes.status}: ${await emailRes.text()}`);
}

async function handleStripeWebhook(req, env) {
  const rawBody = await req.text();
  const valid = await verifyStripeSignature(rawBody, req.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
  if (!valid) return Response.json({ error: 'Invalid Stripe signature.' }, { status: 400 });
  const event = JSON.parse(rawBody);
  const subscription = event.data?.object;
  const cancelling = event.type === 'customer.subscription.deleted'
    || (event.type === 'customer.subscription.updated' && subscription?.cancel_at_period_end);
  if (cancelling && subscription) await sendCancellationEmail(env, subscription);
  return Response.json({ received: true });
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors });
    }

    if (url.pathname === '/stripe-webhook') {
      try {
        return await handleStripeWebhook(req, env);
      } catch (error) {
        console.error('stripe webhook failed:', error);
        return Response.json({ error: 'Could not process Stripe webhook.' }, { status: 500 });
      }
    }

    if (url.pathname === '/billing-portal') {
      try {
        let body;
        try {
          body = await req.json();
        } catch {
          body = {};
        }
        return await handlePortalSession(body, env, cors);
      } catch (error) {
        console.error('billing-portal failed:', error);
        return Response.json({ error: 'Couldn’t open billing — please try again.' }, { status: 502, headers: cors });
      }
    }

    if (url.pathname === '/cancel-subscription') {
      try {
        let body;
        try {
          body = await req.json();
        } catch {
          body = {};
        }
        return await handleCancelSubscription(body, env, cors);
      } catch (error) {
        console.error('cancel-subscription failed:', error);
        return Response.json({ error: error.message || 'Couldn’t cancel your plan — please try again.' }, { status: 502, headers: cors });
      }
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
