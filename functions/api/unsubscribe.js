// GET /api/unsubscribe?token=...  — one click, no confirmation page to fight with.
// Every subscriber row carries its own token, so the link is unguessable.

const page = (message) =>
  new Response(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Unsubscribe</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..700&display=swap" rel="stylesheet">
<style>
  body { background:#fbfaf7; color:#141414; font-family:Newsreader,Georgia,serif;
         display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }
  div { max-width:420px; text-align:center; }
  p { font-size:19px; line-height:1.6; }
  a { color:#141414; }
</style></head>
<body><div><p>${message}</p><p><a href="https://akshayiyer.me">akshayiyer.me</a></p></div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );

export async function onRequestGet({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token || !env.SUBSCRIBERS_DB) {
    return page('That unsubscribe link is not valid.');
  }

  const res = await env.SUBSCRIBERS_DB.prepare(
    `UPDATE subscribers SET status = 'unsubscribed' WHERE unsub_token = ?1`
  )
    .bind(token)
    .run();

  return page(
    res.meta?.changes
      ? "You're unsubscribed. No more emails from me."
      : 'That unsubscribe link is not valid, or you already unsubscribed.'
  );
}
