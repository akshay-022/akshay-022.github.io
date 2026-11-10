// POST /api/dateme  { name, email, message, link? (comma separated), photos?: [{ name, type, data }], website? }
// The reach-out form on /dateme. Runs as a Cloudflare Pages Function.
// Every message is stored in D1 first, then emailed to Akshay through Resend with
// the sender as reply-to and any photos attached. Photos travel only in the email.

const TO = 'akshaygiyer@gmail.com';
const FROM = 'Date me doc <dateme@akshayiyer.me>';
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

// Same check as /api/subscribe: one @, a dot in the domain, no spaces.
const looksLikeEmail = (s) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(s);

const escape = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const clean = (v, max) => String(v || '').trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Something went wrong sending that. Try again?' }, 400);
  }

  // Honeypot. Real people never fill this in; bots usually do.
  if (payload.website) return json({ ok: true });

  const name = clean(payload.name, 120);
  const email = clean(payload.email, 254).toLowerCase();
  const message = clean(payload.message, 8000);
  const link = clean(payload.link, 500);
  const links = link.split(',').map((l) => l.trim()).filter(Boolean);

  if (!name) return json({ error: 'Add your name.' }, 400);
  if (!email || !looksLikeEmail(email)) return json({ error: "That email doesn't look right." }, 400);
  if (!message) return json({ error: 'Tell me a bit about yourself first.' }, 400);

  const photos = (Array.isArray(payload.photos) ? payload.photos : [])
    .slice(0, MAX_PHOTOS)
    .filter((p) => p && typeof p.data === 'string' && /^image\//.test(String(p.type || '')))
    .filter((p) => p.data.length * 0.75 <= MAX_PHOTO_BYTES)
    .map((p, i) => ({
      filename: clean(p.name, 80).replace(/[^\w.\- ]/g, '') || `photo-${i + 1}.jpg`,
      content: p.data,
    }));

  if (!env.SUBSCRIBERS_DB) return json({ error: 'The form is not wired up yet. Email me instead!' }, 503);

  let row;
  try {
    await env.SUBSCRIBERS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS dateme_messages (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         created_at TEXT NOT NULL,
         name TEXT NOT NULL,
         email TEXT NOT NULL,
         message TEXT NOT NULL,
         link TEXT,
         photo_count INTEGER NOT NULL DEFAULT 0,
         emailed INTEGER NOT NULL DEFAULT 0
       )`
    ).run();
    row = await env.SUBSCRIBERS_DB.prepare(
      `INSERT INTO dateme_messages (created_at, name, email, message, link, photo_count)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6) RETURNING id`
    )
      .bind(new Date().toISOString(), name, email, message, link || null, photos.length)
      .first();
  } catch {
    return json({ error: 'Could not send that. Try again in a moment, or email me!' }, 500);
  }

  // Best effort: the message is already saved, so a Resend failure only skips the email.
  if (env.RESEND_API_KEY) {
    const html = [
      `<p><strong>${escape(name)}</strong> &lt;${escape(email)}&gt; reached out from your date me doc.</p>`,
      links.length
        ? `<p>Links: ${links.map((l) => `<a href="${escape(/^https?:\/\//i.test(l) ? l : 'https://' + l)}">${escape(l)}</a>`).join(', ')}</p>`
        : '',
      `<p style="white-space: pre-wrap">${escape(message)}</p>`,
      photos.length ? `<p>${photos.length} photo${photos.length > 1 ? 's' : ''} attached.</p>` : '',
      `<p style="color:#777">Hit reply to answer them directly.</p>`,
    ].join('\n');

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: FROM,
          to: [TO],
          reply_to: email,
          subject: `Date me doc: ${name}`,
          html,
          attachments: photos,
        }),
      });
      if (res.ok && row) {
        await env.SUBSCRIBERS_DB.prepare('UPDATE dateme_messages SET emailed = 1 WHERE id = ?1').bind(row.id).run();
      }
    } catch {
      // swallow: the row in D1 is the source of truth
    }
  }

  return json({ ok: true });
}

export function onRequestGet() {
  return json({ error: 'POST the form here.' }, 405);
}
