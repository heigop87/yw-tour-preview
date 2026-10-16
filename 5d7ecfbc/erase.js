// Erase view: the photographer paints over something in the 360 photo (a flag, a cable, a stitch ghost) and Gemini
// fills it in. Painting holds the view still; the paint maps to the photo through the current yaw, pitch and zoom.
// Works through serve.py (/erase/<tour>, runs erase.py). Undo last and Back to original restore the backups.
const { T, viewer } = window.tour;
const TOUR = location.pathname.split('/').filter(s => s && !s.endsWith('.html')).at(-1) || '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const css = document.createElement('style');
css.textContent = `
#erase{position:fixed;left:50%;bottom:24px;user-select:none;transform:translateX(-50%);z-index:30;width:min(560px,calc(100vw - 32px));background:#fff;color:#111;border-radius:16px;
  box-shadow:0 10px 40px rgba(0,0,0,.28);font:400 14px Figtree,system-ui,sans-serif;padding:16px 18px;display:none}
body.erase #erase{display:block}
body.erase #map{display:none}
#erase h2{font:600 16px Poppins,sans-serif;margin:0}
#erase .e-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#erase .e-row+.e-row{margin-top:10px}
#erase .e-msg{color:#555;margin:6px 0 12px;line-height:1.4}
#erase button{font:500 14px Figtree,sans-serif;border:0;border-radius:10px;padding:9px 14px;cursor:pointer;background:#f2f2f5;color:#111}
#erase button.f{background:#4b0ea3;color:#fff}
#erase button.on{background:#f3edfb;color:#4b0ea3}
#erase button:disabled{opacity:.4;cursor:default}
#erase .e-sp{margin-left:auto}
#erase label{color:#555}
#erase input[type=text]{flex:1;min-width:160px;font:400 14px Figtree,sans-serif;border:1px solid rgba(60,60,67,.2);border-radius:8px;padding:8px 10px}
#erase input[type=range]{accent-color:#4b0ea3;width:140px}
#epaint{position:fixed;z-index:20;display:none;opacity:.5;touch-action:none;cursor:none}
body.erase.epaint #epaint{display:block}
#ebrush{position:fixed;z-index:21;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.6);pointer-events:none;display:none;transform:translate(-50%,-50%)}
body.erase.epaint #ebrush.show{display:block}
body.erase.ebusy #epaint{cursor:progress}
`;
document.head.appendChild(css);

const el = document.createElement('div'); el.id = 'erase';
const cv = document.createElement('canvas'); cv.id = 'epaint';
const brush = document.createElement('div'); brush.id = 'ebrush';
document.body.append(el, cv, brush);
const g = cv.getContext('2d');

let on = false, painting = true, busy = false, painted = false, size = 40, what = '', st = { undo: false, orig: false }, note = '';
const V = {};  // pano versions after an erase, so the viewer loads the new photo
const panoFor = id => 'pano/' + T.scenes[id].file + (V[id] ? '?v=' + V[id] : '');

function fit() {
  const r = viewer.container.getBoundingClientRect();
  Object.assign(cv.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  if (cv.width !== Math.round(r.width) || cv.height !== Math.round(r.height)) { cv.width = Math.round(r.width); cv.height = Math.round(r.height); clear(); }
}
function clear() { g.clearRect(0, 0, cv.width, cv.height); painted = false; render(); }

function msg() {
  if (note) return note;
  if (busy) return 'Erasing. This takes about a minute.';
  if (!painting) return 'Turn and zoom so the thing to remove is in view, then press Paint.';
  return painted ? 'Paint a little past the edges, then press Erase. Moving the view clears the paint.' : 'Paint over what to remove. The view holds still while you paint.';
}
function render() {
  if (!on) return;
  const s = T.scenes[window.tour.cur];
  el.innerHTML = `<div class="e-row"><h2>Erase · ${esc(s?.name || '')}</h2><span class="e-sp"></span>
      <button id="eLook" class="${painting ? '' : 'on'}" ${busy ? 'disabled' : ''}>Look around</button><button id="ePaint" class="${painting ? 'on' : ''}" ${busy ? 'disabled' : ''}>Paint</button></div>
    <p class="e-msg">${esc(msg())}</p>
    <div class="e-row"><label for="eSize">Brush</label><input id="eSize" type="range" min="8" max="200" value="${size}">
      <input id="eWhat" type="text" placeholder="What is it? Optional, for example: flag" value="${esc(what)}" ${busy ? 'disabled' : ''}></div>
    <div class="e-row"><button id="eClear" ${painted && !busy ? '' : 'disabled'}>Clear</button>
      ${st.undo ? `<button id="eUndo" ${busy ? 'disabled' : ''}>Undo last</button>` : ''}
      ${st.orig ? `<button id="eOrig" ${busy ? 'disabled' : ''}>Back to original</button>` : ''}
      <span class="e-sp"></span><button class="f" id="eGo" ${painted && !busy ? '' : 'disabled'}>${busy ? 'Erasing' : 'Erase'}</button></div>`;
  el.querySelector('#eLook').onclick = () => { painting = false; note = ''; clear(); sync(); };
  el.querySelector('#ePaint').onclick = () => { painting = true; note = ''; fit(); sync(); };
  el.querySelector('#eSize').oninput = e => { size = +e.target.value; brush.style.width = brush.style.height = size + 'px'; };
  el.querySelector('#eWhat').oninput = e => { what = e.target.value; };
  el.querySelector('#eClear').onclick = clear;
  el.querySelector('#eGo').onclick = run;
  el.querySelector('#eUndo')?.addEventListener('click', () => call({ do: 'prev' }, 'Last erase undone.'));
  el.querySelector('#eOrig')?.addEventListener('click', () => confirm('Put back the photo as it was before any erase?') && call({ do: 'orig' }, 'Original photo is back.'));
}
function sync() { document.body.classList.toggle('epaint', on && painting); document.body.classList.toggle('ebusy', busy); render(); }

// brush
let down = false, last = null;
function dab(x, y) {
  g.fillStyle = g.strokeStyle = '#4b0ea3'; g.lineCap = 'round'; g.lineWidth = size;
  g.beginPath();
  if (last) { g.moveTo(last[0], last[1]); g.lineTo(x, y); g.stroke(); }
  g.arc(x, y, size / 2, 0, 2 * Math.PI); g.fill();
  last = [x, y];
  if (!painted) { painted = true; note = ''; render(); }
}
const at = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
cv.addEventListener('pointerdown', e => { if (busy) return; down = true; last = null; cv.setPointerCapture(e.pointerId); dab(...at(e)); });
cv.addEventListener('pointermove', e => {
  Object.assign(brush.style, { left: e.clientX + 'px', top: e.clientY + 'px', width: size + 'px', height: size + 'px' });
  brush.classList.add('show');
  if (down) dab(...at(e));
});
cv.addEventListener('pointerup', () => { down = false; last = null; });
cv.addEventListener('pointerleave', () => brush.classList.remove('show'));
cv.addEventListener('wheel', e => e.preventDefault(), { passive: false });

async function call(job, done) {
  busy = true; note = ''; sync();
  const id = window.tour.cur;
  try {
    const r = await fetch(`/erase/${TOUR || '_'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scene: id, ...job }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.reason || '');
    st = j;
    if (job.do !== 'state') {
      V[id] = Date.now();
      if (window.tour.cur === id) await window.tour.reload();
      note = done; g.clearRect(0, 0, cv.width, cv.height); painted = false;
    }
  } catch (e) {
    if (job.do !== 'state') note = (e.message.startsWith('ValueError: ') ? e.message.slice(12) + '. ' : 'Not erased yet. ') + 'Press Erase to try again, or paint a little wider.';
  }
  busy = false; sync();
}
function run() {
  const p = viewer.getPosition(), deg = r => r * 180 / Math.PI;
  // the mask goes up as the canvas alpha; the server maps it through the same camera
  call({ do: 'erase', yaw: deg(p.yaw), pitch: deg(p.pitch), vfov: viewer.state.vFov, w: cv.width, h: cv.height, mask: cv.toDataURL('image/png'), what },
       'Erased. Undo last puts it back.');
}

addEventListener('resize', () => on && fit());
addEventListener('tour:scene', () => { if (!on) return; note = ''; clear(); call({ do: 'state' }); });

export function toggle(v) {
  on = v;
  if (v) { window.tour.setPanoFor(panoFor); painting = true; fit(); call({ do: 'state' }); }
  else { clear(); brush.classList.remove('show'); }
  sync();
}
