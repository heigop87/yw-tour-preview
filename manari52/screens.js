// Screens view: the photographer pins a looping video to a TV by setting the four corners of the picture.
// Corners are dragged with a magnifier and nudged 1 px with the arrow keys. Saves through serve.py (/screens/<tour>);
// on a static host it downloads screens.json instead.
const { T, viewer } = window.tour;
const markers = viewer.getPlugin('markers');
const TOUR = location.pathname.split('/').filter(s => s && !s.endsWith('.html')).at(-1) || '';
const SRC = 'media/tv-loop.mp4';
const CORNER = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const screens = window.tour.SCREENS;  // shared with the tour, so edits show in Guest view too
let on = false, dirty = false, sel = 0, adding = null, pano = null, panoId = null;
const list = () => screens[window.tour.cur] ||= [];

const css = document.createElement('style');
css.textContent = `
#screens{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:30;width:min(560px,calc(100vw - 32px));background:#fff;color:#111;border-radius:16px;
  box-shadow:0 10px 40px rgba(0,0,0,.28);font:400 14px Figtree,system-ui,sans-serif;padding:16px 18px;display:none}
body.screens #screens{display:block}
body.screens #map{display:none}
#screens h2{font:600 16px Poppins,sans-serif;margin:0}
#screens .s-row{display:flex;align-items:center;gap:10px}
#screens .s-msg{color:#555;margin:6px 0 12px;line-height:1.4}
#screens .s-msg b{color:#111;font-weight:600}
#screens button{font:500 14px Figtree,sans-serif;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;background:#f2f2f5;color:#111}
#screens button.f{background:#4b0ea3;color:#fff}
#screens button:disabled{opacity:.4;cursor:default}
#screens .s-sp{margin-left:auto}
#screens .s-tabs{display:flex;gap:6px}
#screens .s-tabs button{padding:6px 10px;font-size:13px}
#screens .s-tabs button[aria-pressed=true]{background:#111;color:#fff}
.s-h{width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:rgba(75,14,163,.35);box-shadow:0 0 0 1px rgba(0,0,0,.5);cursor:grab;touch-action:none}
.s-h.on{background:#4b0ea3;box-shadow:0 0 0 4px rgba(255,255,255,.5)}
.s-h::after{content:'';position:absolute;left:50%;top:50%;width:2px;height:2px;margin:-1px;background:#fff}
#loupe{position:fixed;top:84px;left:24px;z-index:30;width:200px;height:200px;border-radius:50%;border:3px solid #fff;box-shadow:0 8px 30px rgba(0,0,0,.4);display:none;background:#000}
body.screens #loupe.show{display:block}
body.screens.picking .psv-container{cursor:crosshair}
`;
document.head.appendChild(css);

const el = document.createElement('div'); el.id = 'screens';
document.body.appendChild(el);
const loupe = document.createElement('canvas'); loupe.id = 'loupe'; loupe.width = loupe.height = 400;
document.body.appendChild(loupe);

function msg() {
  if (adding) return `Tap the <b>${CORNER[adding.length]}</b> corner of the TV picture (${adding.length + 1} of 4). Zoom in for a precise tap.`;
  if (!list().length) return 'No TV in this spot. Turn to face the TV, then add a screen.';
  return `Drag the <b>${CORNER[sel]}</b> corner onto the edge of the picture, inside the frame. Arrow keys move it 1 px, Shift + arrow 10 px. Tab picks the next corner.`;
}
function render() {
  const s = T.scenes[window.tour.cur], n = list().length;
  el.innerHTML = `<div class="s-row"><h2>TV screens · ${esc(s.name)}</h2>
    <span class="s-sp"></span><button class="f" id="sSave" ${dirty ? '' : 'disabled'}>Save</button></div>
    <p class="s-msg">${msg()}</p>
    <div class="s-row">${adding ? '<button id="sCancel">Cancel</button>' : `<button id="sAdd">Add screen</button>${n ? `<button id="sClip">${list().at(-1).src === SRC ? 'Upload clip' : 'Replace clip'}</button><button id="sRot" title="Turn the clip 90 degrees">Rotate clip</button><button id="sDel">Remove screen</button>` : ''}`}
    ${n && !adding ? `<span class="s-sp"></span><div class="s-tabs">${['↖', '↗', '↘', '↙'].map((c, i) => `<button data-c="${i}" aria-pressed="${i === sel}" title="${CORNER[i]} corner">${c}</button>`).join('')}</div>` : ''}</div>`;
  el.querySelector('#sAdd')?.addEventListener('click', () => { adding = []; document.body.classList.add('picking'); draw(); });
  el.querySelector('#sCancel')?.addEventListener('click', () => { adding = null; document.body.classList.remove('picking'); draw(); });
  el.querySelector('#sDel')?.addEventListener('click', () => { list().pop(); dirty = true; draw(); });
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { sel = +b.dataset.c; draw(); });
  el.querySelector('#sSave')?.addEventListener('click', save);
  el.querySelector('#sClip')?.addEventListener('click', () => file.click());
  el.querySelector('#sRot')?.addEventListener('click', () => { const sc = list().at(-1); sc.rot = ((sc.rot || 0) + 1) % 4; dirty = true; draw(); });
}

// the photographer's clip: 10 s max, shrunk by serve.py to 720p H.264 with no sound so it stays a few MB
const MAX_S = 10;
const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'video/mp4,video/quicktime,video/*' });
file.onchange = async () => {
  const f = file.files[0]; file.value = ''; if (!f) return;
  const url = URL.createObjectURL(f);
  const meta = await new Promise(r => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => r(v); v.onerror = () => r({}); v.src = url; });
  const dur = meta.duration;
  if (!(dur > 0)) return note('This file cannot be read as a video. Export it as MP4 or MOV and try again.');
  if (dur > MAX_S + .5) return note(`This clip is ${Math.round(dur)} s. Trim it to ${MAX_S} s or less, then upload again.`);
  const sc = list().at(-1); note('Uploading and preparing the clip...');
  let src = null;
  try {
    const r = await fetch(`/media/${TOUR || '_'}?scene=${encodeURIComponent(window.tour.cur)}`, { method: 'POST', body: f });
    if (r.ok) src = (await r.json()).src;
  } catch {}
  // portrait clip on a landscape TV (or the other way): start turned so it fills the frame
  const [p0, p1, , p3] = sc.corners, d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const tvWide = d(p0, p1) > d(p0, p3), clipWide = meta.videoWidth >= meta.videoHeight;
  const turned = tvWide !== clipWide && !(sc.rot % 2);
  if (turned) sc.rot = 1;
  sc.src = src || url; dirty = true; draw();
  if (turned && src) return note('Clip added and turned to fit the TV. Use Rotate clip if it is upside down, then save.');
  note(src ? 'Clip added. Check it fills the TV, then save.' : 'Preview only on this link. Send the clip with the downloaded screens file.');
};
function note(t) { const m = el.querySelector('.s-msg'); if (m) m.textContent = t; }

// markers: the video, its outline and one handle per corner
function draw() {
  markers.getMarkers().filter(m => m.id.startsWith('s-')).forEach(m => markers.removeMarker(m.id, false));
  window.tour.showScreens(list());
  if (on) {
    list().forEach((sc, k) => {
      markers.addMarker({ id: 's-line' + k, polygonPixels: sc.corners, svgStyle: { fill: 'none', stroke: '#fff', strokeWidth: '1.5px' } }, false);
      if (k === list().length - 1) sc.corners.forEach(([x, y], i) => handle('s-h' + i, x, y, i === sel));
    });
    (adding || []).forEach(([x, y], i) => handle('s-a' + i, x, y, false));
  }
  markers.renderMarkers();
  if (on) { render(); showLoupe(); }
}
function handle(id, x, y, cur) {
  markers.addMarker({ id, position: { textureX: x, textureY: y }, html: `<div class="s-h${cur ? ' on' : ''}"></div>`, size: { width: 22, height: 22 } }, false);
}

// full-size pano for the magnifier
async function loadPano() {
  const id = window.tour.cur;
  if (panoId === id) return;
  panoId = id; pano = null;
  const img = new Image(); img.src = 'pano/' + T.scenes[id].file; await img.decode();
  if (panoId === id) { pano = img; showLoupe(); }
}
function showLoupe() {
  const sc = list().at(-1), pt = adding ? null : sc?.corners[sel];
  loupe.classList.toggle('show', !!(pano && pt));
  if (!pano || !pt) return;
  const g = loupe.getContext('2d'), Z = 8, R = loupe.width / Z;  // 50 pano px across
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 400, 400);
  g.drawImage(pano, pt[0] - R / 2, pt[1] - R / 2, R, R, 0, 0, 400, 400);
  const toL = ([x, y]) => [(x - pt[0]) * Z + 200, (y - pt[1]) * Z + 200];
  g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 2; g.beginPath();
  sc.corners.forEach((c, i) => { const [a, b] = toL(c); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); g.stroke();
  g.strokeStyle = '#ff2d55'; g.lineWidth = 2; g.beginPath(); g.moveTo(200, 170); g.lineTo(200, 230); g.moveTo(170, 200); g.lineTo(230, 200); g.stroke();
}

// taps while adding a screen
viewer.addEventListener('click', ({ data }) => {
  if (!on || !adding || data.rightclick) return;
  adding.push([Math.round(data.textureX), Math.round(data.textureY)]);
  if (adding.length === 4) {
    list().push({ src: SRC, corners: adding }); adding = null; sel = 0; dirty = true;
    document.body.classList.remove('picking');
  }
  draw();
});

// drag a handle; the viewer must not pan while a corner moves
let drag = null;
document.addEventListener('pointerdown', e => {
  const h = on && e.target.closest('.psv-marker[id^="psv-marker-s-h"]');
  if (!h) return;
  e.stopPropagation(); e.preventDefault();
  sel = +h.id.slice(-1); drag = true; draw();
}, true);
document.addEventListener('pointermove', e => {
  if (!drag) return;
  const r = viewer.container.getBoundingClientRect();
  const sph = viewer.dataHelper.viewerCoordsToSphericalCoords({ x: e.clientX - r.left, y: e.clientY - r.top });
  const t = viewer.dataHelper.sphericalCoordsToTextureCoords(sph);
  move([Math.round(t.textureX), Math.round(t.textureY)]);
}, true);
document.addEventListener('pointerup', () => { drag = null; }, true);

function move(pt) {
  const sc = list().at(-1); if (!sc) return;
  sc.corners[sel] = pt; dirty = true;
  markers.updateMarker({ id: 's-h' + sel, position: { textureX: pt[0], textureY: pt[1] } }, false);
  const k = list().length - 1;
  markers.updateMarker({ id: 'screen' + k, position: window.tour.screenPos(sc) }, false); window.tour.fixWrap(markers.getMarker('screen' + k));
  markers.updateMarker({ id: 's-line' + k, polygonPixels: sc.corners }, false);
  markers.renderMarkers(); showLoupe();
  el.querySelector('#sSave').disabled = false;
}
addEventListener('keydown', e => {
  if (!on || adding || !list().length || e.target.closest('input,textarea')) return;
  if (e.key === 'Tab') { e.preventDefault(); sel = (sel + (e.shiftKey ? 3 : 1)) % 4; draw(); return; }
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (!d) return;
  e.preventDefault(); e.stopPropagation();
  const [x, y] = list().at(-1).corners[sel], n = e.shiftKey ? 10 : 1;
  move([x + d[0] * n, y + d[1] * n]);
}, true);

async function save() {
  const clean = Object.fromEntries(Object.entries(screens).filter(([, v]) => v.length));
  let ok = false;
  try { ok = (await fetch(`/screens/${TOUR || "_"}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ screens: clean }) })).ok; } catch {}
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' }));
    a.download = `${TOUR || 'tour'}-screens.json`; a.click();
  }
  dirty = false; render();
}

addEventListener('tour:scene', () => { adding = null; sel = 0; document.body.classList.remove('picking'); if (on) { draw(); loadPano(); } });
addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

export function toggle(v) {
  on = v;
  if (!v) { adding = null; document.body.classList.remove('picking'); loupe.classList.remove('show'); }
  draw();
  if (v) loadPano();
}
