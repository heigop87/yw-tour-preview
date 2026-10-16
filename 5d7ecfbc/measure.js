// Measure view: the photographer measures a room from the 360 photo. The camera stands level at a known height, so a tap
// on the floor gives its distance (height / tan of the angle down). Two floor taps = a length; a floor tap and a tap
// straight above it = a height. One tape check per boat (two taps on something measured with a tape) corrects the height.
// Guests see the saved measurements as thin lines with a label. Saves through serve.py (/measures/<tour>); on a static
// host it downloads measures.json instead.
const { T, viewer } = window.tour;
const markers = viewer.getPlugin('markers');
const TOUR = location.pathname.split('/').filter(s => s && !s.endsWith('.html')).at(-1) || '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const r4 = v => Math.round(v * 1e4) / 1e4;

// { height: m, scenes: { id: [{ k: 'len' | 'ht' | 'tape', label, a: [yaw, pitch], b: [yaw, pitch], w? }] } }
const M = await fetch('measures.json').then(r => r.ok ? r.json() : null).catch(() => null) || { height: 1.5, scenes: {} };
M.scenes ||= {};
let on = false, dirty = false, adding = null, sel = null;
const list = () => M.scenes[window.tour.cur] ||= [];

// what to measure, from the room name
const CHECK = [
  [/cabin|primary|owner|vip|guest|bunk|crew|stateroom/i, ['Berth length', 'Berth width', 'Headroom', 'Length', 'Width']],
  [/head|bath|shower/i, ['Headroom', 'Shower width', 'Length', 'Width']],
  [/garage|tender/i, ['Opening width', 'Opening height', 'Depth']],
  [/engine/i, ['Headroom', 'Hatch width', 'Length']],
  [/cockpit|flybridge|bow|aft|deck|sun/i, ['Sunpad length', 'Sunpad width', 'Length', 'Width']],
  [/salon|saloon|galley|dinette|lounge|helm/i, ['Headroom', 'Length', 'Width']],
];
const checklist = name => (CHECK.find(([re]) => re.test(name)) || [, ['Length', 'Width', 'Headroom']])[1];
const kindOf = label => /headroom|height/i.test(label) ? 'ht' : 'len';
const HOW = {
  len: ['Tap where it meets the floor at one end.', 'Now tap where it meets the floor at the other end.'],
  ht: ['Tap the floor right under it.', 'Now tap the top, straight above that point.'],
  tape: ['Measure a door opening with a tape. Tap where one side meets the floor.', 'Now tap where the other side meets the floor.'],
};

// geometry: floor point in metres, x right / z ahead of the camera
const floorXZ = ([yaw, pitch], H) => { const d = H / Math.tan(-pitch); return [d * Math.sin(yaw), d * Math.cos(yaw)]; };
const lenAt = (it, H) => { const [x1, z1] = floorXZ(it.a, H), [x2, z2] = floorXZ(it.b, H); return Math.hypot(x2 - x1, z2 - z1); };
const htAt = (it, H) => H + Math.hypot(...floorXZ(it.a, H)) * Math.tan(it.b[1]);
// the tape check scales the camera height for this spot: every distance grows in step with it
function heightFor(id) {
  const t = (M.scenes[id] || []).filter(it => it.k === 'tape' && it.w > 0 && it.b);
  if (!t.length) return M.height;
  return t.reduce((s, it) => s + M.height * it.w / lenAt(it, M.height), 0) / t.length;
}
const valueOf = (it, H) => it.k === 'ht' ? htAt(it, H) : lenAt(it, H);
function fmt(m) {
  const inch = Math.round(m / .0254), ft = Math.floor(inch / 12);
  return `${m.toFixed(2)} m · ${ft ? `${ft} ft ` : ''}${inch % 12} in`;
}

const css = document.createElement('style');
css.textContent = `
#measure{position:fixed;left:50%;top:116px;transform:translateX(-50%);z-index:30;width:min(560px,calc(100vw - 32px));max-height:calc(50vh - 116px);overflow:auto;background:#fff;color:#111;border-radius:16px;
  box-shadow:0 10px 40px rgba(0,0,0,.28);font:400 14px Figtree,system-ui,sans-serif;padding:16px 18px;display:none}
body.measure #measure{display:block}
body.measure #map{display:none}
#measure h2{font:600 16px Poppins,sans-serif;margin:0}
#measure .m-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#measure .m-msg{color:#555;margin:6px 0 12px;line-height:1.4}
#measure button{font:500 14px Figtree,sans-serif;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;background:#f2f2f5;color:#111}
#measure button.f{background:#4b0ea3;color:#fff}
#measure button:disabled{opacity:.4;cursor:default}
#measure button.done{background:#f3edfb;color:#4b0ea3}
#measure .m-sp{margin-left:auto}
#measure label{color:#555}
#measure input{width:70px;font:500 14px Figtree,sans-serif;border:1px solid rgba(60,60,67,.2);border-radius:8px;padding:7px 8px}
#measure ul{list-style:none;margin:12px 0 0;padding:0;border-top:1px solid rgba(60,60,67,.12)}
#measure li{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(60,60,67,.12)}
#measure li b{font-weight:600}
#measure li span{color:#555}
#measure li button{margin-left:auto;padding:5px 10px;font-size:13px}
.m-h{width:20px;height:20px;border-radius:50%;border:2px solid #fff;background:rgba(75,14,163,.5);box-shadow:0 0 0 1px rgba(0,0,0,.5);cursor:grab;touch-action:none}
.m-h.on{background:#4b0ea3;box-shadow:0 0 0 4px rgba(255,255,255,.5)}
.psv-marker[id^="psv-marker-m-l"],.psv-marker[id^="psv-marker-m-t"]{pointer-events:none!important}
.m-tag{font:500 12px Figtree,sans-serif;color:#fff;background:rgba(17,17,20,.62);backdrop-filter:blur(8px);padding:3px 8px;border-radius:999px;white-space:nowrap;pointer-events:none}
body.owner .psv-marker[id^="psv-marker-m-"],body.names .psv-marker[id^="psv-marker-m-"],body.screens .psv-marker[id^="psv-marker-m-"]{display:none}
#mloupe{position:fixed;bottom:24px;left:24px;z-index:30;width:160px;height:160px;border-radius:50%;border:3px solid #fff;box-shadow:0 8px 30px rgba(0,0,0,.4);display:none;background:#000}
body.measure #mloupe.show{display:block}
body.measure.mpick .psv-container{cursor:crosshair}
body.mpick #measure .m-keep{display:none}
#measure .m-msg:last-child{margin-bottom:0}
`;
document.head.appendChild(css);

const el = document.createElement('div'); el.id = 'measure';
document.body.appendChild(el);
const loupe = document.createElement('canvas'); loupe.id = 'mloupe'; loupe.width = loupe.height = 320;
document.body.appendChild(loupe);

function msg() {
  if (adding) return `<b>${esc(adding.label)}.</b> ${HOW[adding.k][adding.b ? 1 : adding.a ? 1 : 0]} Zoom in for a precise tap.`;
  if (sel) return 'Drag the dot onto the exact spot. The loupe shows the photo under it.';
  return 'Pick what to measure. Distances come from the camera height, so keep the camera level on the monopod.';
}
function render() {
  const id = window.tour.cur, s = T.scenes[id], H = heightFor(id), done = new Set(list().map(it => it.label));
  const items = list().filter(it => it.b);
  el.innerHTML = `<div class="m-row"><h2>Measure · ${esc(s.name)}</h2><span class="m-sp"></span><button class="f" id="mSave" ${dirty ? '' : 'disabled'}>Save</button></div>
    <p class="m-msg">${msg()}</p>
    ${adding ? '<div class="m-row"><button id="mCancel">Cancel</button></div>' : `<div class="m-row">${checklist(s.name).map(l => `<button data-l="${esc(l)}" class="${done.has(l) ? 'done' : ''}">${esc(l)}</button>`).join('')}<button data-l="Other length">Other</button><button data-l="Tape check" data-k="tape">Tape check</button></div>`}
    <div class="m-keep"><div class="m-row" style="margin-top:12px"><label for="mH">Camera height</label><input id="mH" type="number" step="0.01" min="0.3" max="3" value="${M.height}"> <label>m</label>
      ${Math.abs(H - M.height) > .005 ? `<span class="m-sp"></span><label>Here ${H.toFixed(2)} m, from the tape check</label>` : ''}</div>
    ${items.length ? `<ul>${items.map(it => `<li><b>${esc(it.label)}</b><span>${it.k === 'tape' ? `tape ${fmt(it.w)}, photo ${fmt(lenAt(it, M.height))}` : fmt(valueOf(it, H))}</span><button data-x="${list().indexOf(it)}">Remove</button></li>`).join('')}</ul>` : ''}</div>`;
  el.querySelectorAll('[data-l]').forEach(b => b.onclick = () => {
    adding = { k: b.dataset.k || kindOf(b.dataset.l), label: b.dataset.l }; sel = null;
    document.body.classList.add('mpick'); draw();
  });
  el.querySelector('#mCancel')?.addEventListener('click', () => { adding = null; document.body.classList.remove('mpick'); draw(); });
  el.querySelector('#mSave')?.addEventListener('click', save);
  el.querySelector('#mH').onchange = e => { const v = +e.target.value; if (v >= .3 && v <= 3) { M.height = v; dirty = true; } draw(); };
  el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => { list().splice(+b.dataset.x, 1); sel = null; dirty = true; draw(); });
}

// a line on the floor (or straight up) drawn as short pieces so it follows the photo, plus its label
function lineOf(it, H) {
  const [x1, z1] = floorXZ(it.a, H), pts = [];
  const end = it.k === 'ht' ? [x1, htAt(it, H) - H, z1] : (([x, z]) => [x, -H, z])(floorXZ(it.b, H));
  for (let i = 0; i <= 16; i++) {
    const t = i / 16, x = x1 + (end[0] - x1) * t, y = -H + (end[1] + H) * t, z = z1 + (end[2] - z1) * t;
    pts.push([Math.atan2(x, z), Math.atan2(y, Math.hypot(x, z))]);
  }
  return pts;
}
function draw() {
  markers.getMarkers().filter(m => m.id.startsWith('m-')).forEach(m => markers.removeMarker(m.id, false));
  const id = window.tour.cur, H = heightFor(id);
  list().forEach((it, k) => {
    if (!it.b || (it.k === 'tape' && !on)) return;
    const pts = lineOf(it, H);
    markers.addMarker({ id: 'm-l' + k, polyline: pts, svgStyle: { stroke: '#fff', strokeWidth: '2px', strokeLinecap: 'round', filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,.8))' } }, false);
    const [yaw, pitch] = pts[8];
    markers.addMarker({ id: 'm-t' + k, position: { yaw, pitch }, html: `<div class="m-tag">${esc(it.label)} ${it.k === 'tape' ? fmt(it.w) : fmt(valueOf(it, H))}</div>`, anchor: 'center center' }, false);
  });
  if (on) {
    const it = adding || (sel && sel.it);
    if (it) ['a', 'b'].forEach(p => it[p] && markers.addMarker({ id: 'm-h' + p, position: { yaw: it[p][0], pitch: it[p][1] }, html: `<div class="m-h${sel?.p === p ? ' on' : ''}"></div>`, size: { width: 20, height: 20 } }, false));
  }
  markers.renderMarkers();
  if (on) { render(); showLoupe(); }
}

// taps: first point, then second; a tape check then asks for the tape width
viewer.addEventListener('click', ({ data }) => {
  if (!on || !adding || data.rightclick) return;
  const pt = [r4(data.yaw), r4(data.pitch)];
  if (!adding.a) {
    if (pt[1] > -.05) return note('Tap lower, on the floor.');
    adding.a = pt; return draw();
  }
  if (adding.k !== 'ht' && pt[1] > -.05) return note('Tap lower, on the floor.');
  if (adding.k === 'ht') pt[0] = adding.a[0];  // straight above the floor point
  adding.b = pt;
  if (adding.k === 'tape') {
    const w = parseFloat(String(prompt('Door width from the tape, in metres (for example 0.62)') || '').replace(',', '.'));
    if (!(w > .1 && w < 5)) { adding = null; document.body.classList.remove('mpick'); draw(); return note('Tape check skipped. Enter the width in metres to use it.'); }
    adding.w = w;
  }
  list().push(adding); sel = { it: adding, p: 'b' }; adding = null; dirty = true;
  document.body.classList.remove('mpick'); draw();
});
function note(t) { const m = el.querySelector('.m-msg'); if (m) m.textContent = t; }

// drag a dot to fine-tune; the viewer must not pan meanwhile
let drag = false;
document.addEventListener('pointerdown', e => {
  const h = on && e.target.closest('.psv-marker[id^="psv-marker-m-h"]');
  if (!h) return;
  e.stopPropagation(); e.preventDefault();
  const p = h.id.slice(-1), it = adding || sel?.it;
  if (!it) return;
  sel = { it, p }; drag = true; draw();
}, true);
document.addEventListener('pointermove', e => {
  if (!drag || !sel) return;
  const r = viewer.container.getBoundingClientRect();
  const s = viewer.dataHelper.viewerCoordsToSphericalCoords({ x: e.clientX - r.left, y: e.clientY - r.top });
  const it = sel.it;
  it[sel.p] = [r4(it.k === 'ht' && sel.p === 'b' ? it.a[0] : s.yaw), r4(s.pitch)];
  if (it.k === 'ht' && sel.p === 'a' && it.b) it.b[0] = it.a[0];
  dirty = true; draw();
}, true);
document.addEventListener('pointerup', () => { drag = false; }, true);

// magnifier around the selected dot, from the full-size photo
let pano = null, panoId = null;
async function loadPano() {
  const id = window.tour.cur;
  if (panoId === id) return;
  panoId = id; pano = null;
  const img = new Image(); img.src = 'pano/' + T.scenes[id].file; await img.decode();
  if (panoId === id) { pano = img; showLoupe(); }
}
function showLoupe() {
  const it = sel?.it, pt = it && it[sel.p];
  loupe.classList.toggle('show', !!(pano && pt));
  if (!pano || !pt) return;
  const x = (((pt[0] / (2 * Math.PI) + .5) % 1 + 1) % 1) * pano.width, y = (.5 - pt[1] / Math.PI) * pano.height;
  const g = loupe.getContext('2d'), R = 60;
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, 320, 320);
  g.drawImage(pano, x - R / 2, y - R / 2, R, R, 0, 0, 320, 320);
  g.strokeStyle = '#ff2d55'; g.lineWidth = 2; g.beginPath(); g.moveTo(160, 130); g.lineTo(160, 190); g.moveTo(130, 160); g.lineTo(190, 160); g.stroke();
}

async function save() {
  const clean = { height: M.height, scenes: Object.fromEntries(Object.entries(M.scenes).map(([k, v]) => [k, v.filter(it => it.b)]).filter(([, v]) => v.length)) };
  let ok = false;
  try { ok = (await fetch(`/measures/${TOUR || '_'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean) })).ok; } catch {}
  if (!ok) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clean, null, 1)], { type: 'application/json' }));
    a.download = `${TOUR || 'tour'}-measures.json`; a.click();
  }
  dirty = false; render();
}

addEventListener('tour:scene', () => { adding = null; sel = null; document.body.classList.remove('mpick'); draw(); if (on) loadPano(); });
addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });
draw();

export function toggle(v) {
  on = v;
  if (!v) { adding = null; sel = null; document.body.classList.remove('mpick'); loupe.classList.remove('show'); }
  draw();
  if (v) loadPano();
}
