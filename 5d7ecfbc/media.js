// Media pins: extra photos and videos pinned to a spot in the 360. Guests tap a pin to open it in a lightbox.
// The photographer adds pins with ?view=media; saves through serve.py (/pins/<tour>) into media.json,
// on a static host it downloads media.json instead.
const { T, viewer } = window.tour;
const markers = viewer.getPlugin('markers');
const TOUR = location.pathname.split('/').filter(s => s && !s.endsWith('.html')).at(-1) || '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const isVideo = src => /\.(mp4|webm|mov)(\?|$)/i.test(src) || /youtube\.com|youtu\.be|vimeo\.com/i.test(src);
const ICON = {
  photo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="12" cy="12" r="3.2"/><path d="M8 5l1.2-2h5.6L16 5"/></svg>',
  video: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
};

// media.json: { sceneId: [{ yaw, pitch (deg), title, src, kind: "photo" | "video" }] }
const PINS = await fetch('media.json').then(r => r.ok ? r.json() : {}).catch(() => ({}));
let on = false, dirty = false, adding = false, sel = -1;
const list = () => PINS[window.tour.cur] ||= [];

const css = document.createElement('style');
css.textContent = `
.mp{position:relative;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;color:#121216;cursor:pointer;
  background:rgba(255,255,255,.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
  box-shadow:0 0 0 1px rgba(255,255,255,.6),0 4px 14px rgba(0,0,0,.35);transition:transform .15s}
.mp::before{content:'';position:absolute;inset:-6px;border-radius:50%;border:2px solid rgba(255,255,255,.7);animation:mpRing 2.4s ease-out infinite}
.mp:hover{transform:scale(1.08)}
.mp .mp-t{position:absolute;left:50px;top:50%;transform:translateY(-50%);white-space:nowrap;background:rgba(18,18,22,.72);color:#fff;
  font:500 13px/18px Figtree,sans-serif;padding:5px 10px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .15s}
.mp:hover .mp-t,body.media .mp .mp-t{opacity:1}
.mp.on{box-shadow:0 0 0 3px #4b0ea3,0 4px 14px rgba(0,0,0,.35)}
@keyframes mpRing{0%{transform:scale(.85);opacity:.9}100%{transform:scale(1.35);opacity:0}}
@media (prefers-reduced-motion:reduce){.mp::before{animation:none;opacity:.6}}
#mbox{position:fixed;inset:0;z-index:45;background:rgba(10,10,14,.86);display:grid;place-items:center;padding:24px}
#mbox[hidden]{display:none}
#mbox figure{margin:0;max-width:min(1100px,100%);display:flex;flex-direction:column;gap:12px}
#mbox img,#mbox video,#mbox iframe{display:block;max-width:100%;max-height:78vh;border-radius:14px;background:#000;margin:0 auto}
#mbox iframe{width:min(1100px,100%);aspect-ratio:16/9;height:auto;border:0}
#mbox figcaption{color:#fff;font:500 16px/22px Figtree,sans-serif;text-align:center}
#mbox .mb-x{position:absolute;top:16px;right:16px;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:22px;cursor:pointer}
#mbox .mb-n{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;font-size:22px;cursor:pointer}
#mbox .mb-n.p{left:16px}#mbox .mb-n.n{right:16px}
@media (max-width:700px){#mbox{padding:56px 12px 24px}#mbox .mb-n{top:auto;bottom:16px;transform:none}}
#media{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:30;width:min(560px,calc(100vw - 32px));background:#fff;color:#111;border-radius:16px;
  box-shadow:0 10px 40px rgba(0,0,0,.28);font:400 14px Figtree,system-ui,sans-serif;padding:16px 18px;display:none}
body.media #media{display:block}
body.media #map{display:none}
body.media.picking .psv-container{cursor:crosshair}
#media h2{font:600 16px Poppins,sans-serif;margin:0}
#media .m-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
#media .m-msg{color:#555;margin:6px 0 12px;line-height:1.4}
#media button{font:500 14px Figtree,sans-serif;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;background:#f2f2f5;color:#111}
#media button.f{background:#4b0ea3;color:#fff}
#media button:disabled{opacity:.4;cursor:default}
#media .m-sp{margin-left:auto}
#media input[type=text]{flex:1;min-width:0;font:400 14px Figtree,sans-serif;border:1px solid #d9d9e0;border-radius:10px;padding:9px 12px}
#media label{font-weight:500;width:100%}
`;
document.head.appendChild(css);

const box = document.createElement('div'); box.id = 'mbox'; box.hidden = true;
document.body.appendChild(box);
const el = document.createElement('div'); el.id = 'media';
document.body.appendChild(el);
const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,video/*', hidden: true });
document.body.appendChild(file);

function embedSrc(src) {
  const yt = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`;
  const vm = src.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}?autoplay=1`;
  return null;
}
function open(i) {
  const all = list(), p = all[i];
  if (!p) return;
  const em = embedSrc(p.src);
  const media = em ? `<iframe src="${esc(em)}" allow="autoplay; fullscreen" allowfullscreen></iframe>`
    : p.kind === 'video' ? `<video src="${esc(p.src)}" controls autoplay playsinline></video>`
    : `<img src="${esc(p.src)}" alt="${esc(p.title)}">`;
  box.innerHTML = `<button class="mb-x" aria-label="Close">&times;</button>
    ${all.length > 1 ? '<button class="mb-n p" aria-label="Previous">&#8249;</button><button class="mb-n n" aria-label="Next">&#8250;</button>' : ''}
    <figure>${media}${p.title ? `<figcaption>${esc(p.title)}</figcaption>` : ''}</figure>`;
  box.hidden = false;
  box.querySelector('.mb-x').onclick = close;
  box.querySelector('.p')?.addEventListener('click', e => { e.stopPropagation(); open((i - 1 + all.length) % all.length); });
  box.querySelector('.n')?.addEventListener('click', e => { e.stopPropagation(); open((i + 1) % all.length); });
}
function close() { box.hidden = true; box.innerHTML = ''; }
box.onclick = e => { if (e.target === box) close(); };
addEventListener('keydown', e => { if (!box.hidden && e.key === 'Escape') close(); });

function draw() {
  markers.getMarkers().filter(m => m.id.startsWith('mp-')).forEach(m => markers.removeMarker(m.id, false));
  list().forEach((p, i) => markers.addMarker({
    id: 'mp-' + i, position: { yaw: p.yaw + 'deg', pitch: p.pitch + 'deg' }, size: { width: 40, height: 40 },
    html: `<div class="mp${on && i === sel ? ' on' : ''}" aria-label="${esc(p.title || (p.kind === 'video' ? 'Video' : 'Photo'))}">${ICON[p.kind] || ICON.photo}${p.title ? `<span class="mp-t">${esc(p.title)}</span>` : ''}</div>`,
    data: { media: i },
  }, false));
  markers.renderMarkers();
  if (on) panel();
}
markers.addEventListener('select-marker', e => {
  const i = e.marker.data?.media;
  if (i === undefined) return;
  if (on) { sel = i; draw(); } else open(i);
});
addEventListener('tour:scene', () => { sel = -1; adding = false; draw(); });

viewer.addEventListener('click', ({ data }) => {
  if (!on || !adding || data.rightclick) return;
  const deg = r => Math.round(r * 1800 / Math.PI) / 10;
  list().push({ yaw: deg(data.yaw), pitch: deg(data.pitch), title: '', src: '', kind: 'photo' });
  sel = list().length - 1; adding = false; dirty = true;
  document.body.classList.remove('picking');
  draw();
});

function panel() {
  const s = T.scenes[window.tour.cur], p = list()[sel];
  el.innerHTML = `<div class="m-row"><h2>Media pins · ${esc(s.name)}</h2><span class="m-sp"></span><button class="f" id="mSave" ${dirty ? '' : 'disabled'}>Save</button></div>
    <p class="m-msg">${adding ? 'Tap the spot in the 360 where the pin should go.'
      : p ? 'Add a photo or video to this pin. Paste a link (YouTube, Vimeo or a file) or upload a file.'
      : list().length ? 'Tap a pin to edit it, or add another one.' : 'No media pins in this spot yet. Turn to face the detail, then add a pin.'}</p>
    ${p && !adding ? `<div class="m-row" style="margin-bottom:10px"><label for="mTitle">Title</label><input type="text" id="mTitle" maxlength="60" placeholder="For example: Engine room" value="${esc(p.title)}"></div>
    <div class="m-row" style="margin-bottom:12px"><input type="text" id="mSrc" placeholder="Link to a photo or video" value="${esc(p.src.startsWith('media/') ? '' : p.src)}"><button id="mUp">${p.src.startsWith('media/') ? 'Replace file' : 'Upload file'}</button></div>` : ''}
    <div class="m-row">${adding ? '<button id="mCancel">Cancel</button>' : `<button id="mAdd">Add pin</button>${p ? `<button id="mView" ${p.src ? '' : 'disabled'}>Preview</button><button id="mDel">Remove pin</button>` : ''}`}</div>`;
  el.querySelector('#mSave')?.addEventListener('click', save);
  el.querySelector('#mAdd')?.addEventListener('click', () => { adding = true; sel = -1; document.body.classList.add('picking'); draw(); });
  el.querySelector('#mCancel')?.addEventListener('click', () => { adding = false; document.body.classList.remove('picking'); draw(); });
  el.querySelector('#mDel')?.addEventListener('click', () => { list().splice(sel, 1); sel = -1; dirty = true; draw(); });
  el.querySelector('#mView')?.addEventListener('click', () => open(sel));
  el.querySelector('#mUp')?.addEventListener('click', () => file.click());
  el.querySelector('#mTitle')?.addEventListener('change', e => { p.title = e.target.value.trim(); dirty = true; draw(); });
  el.querySelector('#mSrc')?.addEventListener('change', e => { p.src = e.target.value.trim(); p.kind = isVideo(p.src) ? 'video' : 'photo'; dirty = true; draw(); });
}

file.onchange = async () => {
  const f = file.files[0], p = list()[sel];
  file.value = '';
  if (!f || !p) return;
  el.querySelector('.m-msg').textContent = 'Uploading…';
  try {
    const r = await fetch(`/pins/${TOUR || '_'}/upload?name=${encodeURIComponent(f.name)}`, { method: 'POST', body: f });
    if (!r.ok) throw 0;
    p.src = (await r.json()).src;
    p.kind = f.type.startsWith('video/') ? 'video' : 'photo';
    dirty = true;
  } catch {
    p.src = URL.createObjectURL(f); p.kind = f.type.startsWith('video/') ? 'video' : 'photo';
  }
  draw();
};

async function save() {
  const clean = Object.fromEntries(Object.entries(PINS).map(([k, v]) => [k, v.filter(p => p.src && !p.src.startsWith('blob:'))]).filter(([, v]) => v.length));
  let ok = false;
  try { ok = (await fetch(`/pins/${TOUR || '_'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pins: clean }) })).ok; } catch {}
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' }));
    a.download = 'media.json'; a.click();
  }
  dirty = false; draw();
}

export function toggle(v) {
  on = v;
  if (!v) { adding = false; sel = -1; document.body.classList.remove('picking'); }
  draw();
}
draw();
