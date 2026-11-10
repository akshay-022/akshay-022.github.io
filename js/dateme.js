// The reach-out form on /dateme. Photos can be dropped or picked, show as
// thumbnails, and are shrunk in the browser before upload so a few phone photos
// stay well under the server's size limit.
const MAX_PHOTOS = 3;
const MAX_EDGE = 1600;

const form = document.querySelector('.reach-form');
const dropzone = form.querySelector('.dropzone');
const photoInput = form.querySelector('input[name="photos"]');
const previews = form.querySelector('.photo-previews');
const photoNote = form.querySelector('.photo-note');
let photos = [];

// iPhone photos are often HEIC, which only Safari can draw. Anywhere else they are
// converted to JPEG with heic2any, loaded the first time one shows up.
const isHeic = (f) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

const canDraw = (file) =>
  new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img.width > 0); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });

let heicLib;
function loadHeicLib() {
  heicLib ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'js/vendor/heic2any.min.js';
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => reject(new Error('Could not load the HEIC converter.'));
    document.head.append(s);
  });
  return heicLib;
}

async function toDrawable(file) {
  if (!isHeic(file) || (await canDraw(file))) return file;
  const heic2any = await loadHeicLib();
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  const blob = Array.isArray(out) ? out[0] : out;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

async function addPhotos(files) {
  const picked = [...files].filter((f) => f.type.startsWith('image/') || isHeic(f));
  const room = MAX_PHOTOS - photos.length;
  if (!picked.length || room <= 0) return;

  photoNote.textContent = picked.some(isHeic) ? 'Converting your photos…' : '';
  const ready = [];
  for (const file of picked.slice(0, room)) {
    try {
      ready.push(await toDrawable(file));
    } catch {
      photoNote.textContent = `Could not read ${file.name}. Try a JPG or PNG?`;
      continue;
    }
  }
  if (ready.length === Math.min(picked.length, room)) photoNote.textContent = '';
  photos = photos.concat(ready).slice(0, MAX_PHOTOS);
  renderPreviews();
}

function renderPreviews() {
  previews.replaceChildren(
    ...photos.map((file, i) => {
      const item = document.createElement('div');
      item.className = 'photo-preview';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = file.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        photos.splice(i, 1);
        renderPreviews();
      });
      item.append(img, remove);
      return item;
    })
  );
  dropzone.hidden = photos.length >= MAX_PHOTOS;
}

photoInput.addEventListener('change', () => {
  addPhotos(photoInput.files);
  photoInput.value = '';
});

['dragenter', 'dragover'].forEach((type) =>
  dropzone.addEventListener(type, (event) => {
    event.preventDefault();
    dropzone.classList.add('is-over');
  })
);
['dragleave', 'drop'].forEach((type) =>
  dropzone.addEventListener(type, () => dropzone.classList.remove('is-over'))
);
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  addPhotos(event.dataTransfer.files);
});

function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const data = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      resolve({ name: file.name.replace(/\.\w+$/, '') + '.jpg', type: 'image/jpeg', data });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name}. Try a JPG or PNG?`));
    };
    img.src = url;
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const button = form.querySelector('button[type="submit"]');
  const message = form.querySelector('.reach-msg');
  const field = (name) => form.querySelector(`[name="${name}"]`).value.trim();

  message.textContent = '';
  message.classList.remove('is-error');
  button.disabled = true;
  const label = button.textContent;
  button.textContent = 'Sending';

  try {
    const response = await fetch('/api/dateme', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: field('name'),
        email: field('email'),
        link: field('link'),
        message: field('message'),
        website: field('website'),
        photos: await Promise.all(photos.map(shrink)),
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      form.querySelector('.reach-fields').hidden = true;
      message.textContent = 'Sent! Thank you for reaching out, I’ll get back to you soon :))';
    } else {
      message.textContent = data.error || 'Something went wrong. Try again?';
      message.classList.add('is-error');
    }
  } catch (err) {
    message.textContent = err.message.startsWith('Could not read') ? err.message : 'Could not reach the server. Try again?';
    message.classList.add('is-error');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
});
