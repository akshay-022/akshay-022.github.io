// Progressive enhancement for the subscribe form. Without JS the form still
// posts, it just does a full page navigation instead of staying put.
document.addEventListener('submit', async (event) => {
  const form = event.target.closest('.subscribe');
  if (!form) return;

  event.preventDefault();

  const button = form.querySelector('button');
  const message = form.querySelector('.subscribe-msg');
  const email = form.querySelector('input[name="email"]').value.trim();
  const honeypot = form.querySelector('input[name="website"]').value;

  message.textContent = '';
  message.classList.remove('is-error');
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Sending';

  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        website: honeypot,
        source: location.pathname,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      form.querySelector('.subscribe-row').hidden = true;
      message.textContent = "You're on the list. Thanks for reading.";
    } else {
      message.textContent = data.error || 'Something went wrong. Try again?';
      message.classList.add('is-error');
    }
  } catch {
    message.textContent = 'Could not reach the server. Try again?';
    message.classList.add('is-error');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
