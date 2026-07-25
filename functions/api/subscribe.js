// POST /api/subscribe  { email, source?, website? }
// Stores a subscriber in D1. Runs as a Cloudflare Pages Function.
// If RESEND_API_KEY and RESEND_AUDIENCE_ID are set, the contact is mirrored
// into a Resend audience so broadcasts can go out from Resend directly.

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Deliberately conservative: one @, a dot in the domain, no spaces.
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Send me a JSON body.' }, 400);
  }

  // Honeypot. Real people never fill this in; bots usually do.
  if (payload.website) return json({ ok: true });

  const email = String(payload.email || '').trim().toLowerCase();
  if (!email || email.length > 254 || !looksLikeEmail(email)) {
    return json({ error: "That doesn't look like an email address." }, 400);
  }

  const source = String(payload.source || 'site').slice(0, 120);

  if (!env.SUBSCRIBERS_DB) {
    return json({ error: 'Subscriptions are not wired up yet.' }, 503);
  }

  const token = crypto.randomUUID();

  try {
    // Re-subscribing after an unsubscribe should reactivate, not error.
    await env.SUBSCRIBERS_DB.prepare(
      `INSERT INTO subscribers (email, created_at, source, status, unsub_token)
       VALUES (?1, ?2, ?3, 'active', ?4)
       ON CONFLICT(email) DO UPDATE SET status = 'active'`
    )
      .bind(email, new Date().toISOString(), source, token)
      .run();
  } catch (err) {
    return json({ error: 'Could not save that. Try again in a moment.' }, 500);
  }

  // Best effort. A Resend failure must not lose the subscriber we already stored.
  if (env.RESEND_API_KEY && env.RESEND_AUDIENCE_ID) {
    try {
      await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, unsubscribed: false }),
      });
    } catch {
      // swallow: the row in D1 is the source of truth
    }
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ error: 'POST an email here.' }, 405);
}
