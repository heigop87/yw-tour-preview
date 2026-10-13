// Names view: the photographer names spots from the yachting room list, one by one or in bulk.
// Same EasySign look as owner.js. Saves through serve.py (/names/<tour>); on a static host it downloads a file instead.
const { T } = window.tour;
const TOUR = location.pathname.split('/').filter(s => s && !s.endsWith('.html')).at(-1);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const deckLabel = id => T.decks.find(d => d.id === T.scenes[id].deck)?.label || '';

// room names used across the yachting industry; never "master", the primary cabin is "Primary"
const ROOMS = [
  ['Exterior', ['Bow', 'Foredeck', 'Bow lounge', 'Sunpad', 'Side deck', 'Cockpit', 'Aft deck', 'Main deck aft', 'Swim platform', 'Beach club', 'Transom',
    'Flybridge', 'Sundeck', 'Upper deck', 'Bridge deck', 'Bridge deck aft', 'Hardtop', 'Upper helm', 'Helm', 'Outdoor dining', 'Wet bar', 'Spa pool', 'Tender garage']],
  ['Interior', ['Main deck', 'Bridge', 'Main saloon', 'Sky lounge', 'Lower lounge', 'Dining area', 'Galley', 'Lower helm', 'Wheelhouse', 'Pilothouse', 'Foyer',
    'Companionway', 'Stairway', 'Office', 'Cinema', 'Gym', 'Wine cellar', 'Day head', 'Pantry', 'Laundry']],
  ['Accommodation', ['Primary bedroom', 'Primary en-suite', 'Primary walk-in wardrobe', 'VIP cabin', 'VIP en-suite', 'Guest cabin', 'Double cabin',
    'Twin cabin', 'Bunk cabin', 'Guest en-suite', 'Guest head']],
  ['Crew and technical', ['Crew mess', 'Crew cabin', "Captain's cabin", 'Crew galley', 'Crew head', 'Crew quarters', 'Engine room', 'Control room',
    'Lazarette', 'Utility room', "Bosun's locker"]],
];
const ALL = ROOMS.flatMap(([, r]) => r);
const ALIAS = { master: 'primary', owner: 'primary', bedroom: 'cabin stateroom', stateroom: 'cabin', kitchen: 'galley', salon: 'saloon', living: 'saloon lounge',
  bathroom: 'en-suite head', toilet: 'head', wc: 'head', shower: 'en-suite head', closet: 'wardrobe', stairs: 'stairway companionway', garage: 'tender',
  fly: 'flybridge', bridge: 'bridge flybridge helm wheelhouse', back: 'aft cockpit', front: 'bow foredeck', roof: 'hardtop sundeck', terrace: 'aft deck' };
const SIDES = ['Port', 'Starboard', 'Forward', 'Aft'];
const clean = s => s.replace(/\bmaster\b/gi, 'Primary').replace(/\s+/g, ' ').trim();
const inList = n => { const b = n.replace(/ \d+$/, ''); return ALL.includes(b) || ALL.includes(b.replace(/^(Port|Starboard|Forward|Aft) /, '').replace(/^./, c => c.toUpperCase())); };
const withSide = (side, base) => side ? `${side} ${/^[A-Z][a-z]/.test(base) ? base[0].toLowerCase() + base.slice(1) : base}` : base;

// ---------- state ----------
const ids = Object.keys(T.scenes).sort((a, b) => (+T.decks.findIndex(d => d.id === T.scenes[a].deck)) - (+T.decks.findIndex(d => d.id === T.scenes[b].deck)) || a.localeCompare(b));
const saved = Object.fromEntries(ids.map(id => [id, T.scenes[id].name]));
let sel = new Set(), deckF = 'all', anchor = null, side = '', numbered = true, undo = null;
const savedMap = Object.fromEntries(ids.map(id => [id, T.scenes[id].map.join()]));
const moved = () => ids.filter(id => T.scenes[id].map.join() !== savedMap[id]);
const linkKey = id => JSON.stringify(T.scenes[id].links.map(l => [l.yaw, l.pitch]));
const savedLinks = Object.fromEntries(ids.map(id => [id, linkKey(id)]));
const hopsMoved = () => ids.filter(id => linkKey(id) !== savedLinks[id]);
const dirty = () => [...new Set([...ids.filter(id => T.scenes[id].name !== saved[id]), ...moved(), ...hopsMoved()])];

// ---------- look ----------
const css = document.createElement('style');
css.textContent = `
#names{--bg:#f2f2f5;--group:#fff;--fill:rgba(118,118,128,.12);--fillP:rgba(118,118,128,.2);--label:#121216;--label2:#727279;--label3:#8c8c92;--sep:rgba(60,60,67,.16);
--tint:#4b0ea3;--tintFill:#f3edfb;--orange:#b54708;--orangeFill:#fef0c7;--green:#027a48;--greenFill:#d1fadf;
position:fixed;top:0;right:0;bottom:0;width:440px;z-index:15;display:none;flex-direction:column;background:var(--bg);color:var(--label);
font:400 15px/20px Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased;box-shadow:-12px 0 40px rgba(0,0,0,.25)}
#names *{box-sizing:border-box}
body.names #names{display:flex}
#names h2,#names h3,#names p{margin:0}
.n-t2{font:500 22px/28px Poppins,sans-serif;letter-spacing:-.01em}
.n-fn{font-size:13px;line-height:18px}.n-cap{font-size:12px;line-height:16px}.n-l2{color:var(--label2)}.n-l3{color:var(--label3)}
.n-head{padding:20px 20px 12px;display:flex;flex-direction:column;gap:12px}
.n-row1{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.n-seg{display:flex;padding:2px;gap:2px;border-radius:9px;background:var(--fill)}
.n-seg button{flex:1 1 0;min-height:32px;border:0;border-radius:7px;background:none;color:var(--label);font:500 13px Figtree,sans-serif;cursor:pointer}
.n-seg button[aria-pressed=true]{background:#fff;font-weight:600;box-shadow:0 1px 3px rgba(16,24,40,.12)}
.n-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border:0;border-radius:12px;font:600 15px Figtree,sans-serif;cursor:pointer;white-space:nowrap;transition:transform 120ms,opacity 120ms}
.n-btn:active{transform:scale(.97)}.n-btn:disabled{opacity:.4;cursor:default;transform:none}
.n-filled{background:var(--tint);color:#fff}.n-tinted{background:var(--tintFill);color:var(--tint)}.n-gray{background:var(--fill);color:var(--label)}
.n-small{min-height:32px;padding:0 14px;font-size:13px;border-radius:999px}
.n-plain{background:none;color:var(--tint);min-height:32px;padding:0 4px;font-size:15px;font-weight:500}
.n-bar{display:flex;align-items:center;justify-content:space-between;margin:0 4px 8px}
#nbody{flex:1;overflow:auto;padding:0 20px 20px;overscroll-behavior:contain}
.n-group{list-style:none;margin:0 0 16px;padding:0;background:var(--group);border-radius:16px;overflow:hidden}
.n-dh{margin:16px 4px 8px;font-size:13px;font-weight:600;color:var(--label2);text-transform:uppercase;letter-spacing:.04em}
.n-dh:first-child{margin-top:0}
.n-item{position:relative;display:flex;align-items:center;gap:12px;min-height:60px;padding:8px 16px;cursor:pointer;user-select:none}
.n-item:hover{background:var(--fill)}
.n-item[aria-selected=true]{background:var(--tintFill)}
.n-group>li+li .n-item::before{content:"";position:absolute;top:0;right:0;left:52px;border-top:.5px solid var(--sep)}
.n-item.cur::after{content:"";position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--tint)}
.n-check{display:flex;flex:none;align-items:center;justify-content:center;width:22px;height:22px;border:0;padding:0;border-radius:11px;background:none;box-shadow:inset 0 0 0 1.5px var(--label3);color:#fff;cursor:pointer}
[aria-selected=true] .n-check{background:var(--tint);box-shadow:none}
.n-thumb{width:72px;height:40px;flex:none;border-radius:8px;background:#ddd center/cover}
.n-main{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.n-name{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.n-was{text-decoration:line-through}
.n-badge{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;font-size:11px;font-weight:600;white-space:nowrap}
.b-orange{background:var(--orangeFill);color:var(--orange)}.b-green{background:var(--greenFill);color:var(--green)}.b-gray{background:var(--fill);color:var(--label2)}.b-tint{background:var(--tintFill);color:var(--tint)}
#names footer{padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:rgba(249,249,251,.9);backdrop-filter:blur(20px) saturate(180%);border-top:.5px solid var(--sep);display:flex;gap:8px;align-items:center}
#names footer .n-btn{flex:1}
.n-pick{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:var(--bg);animation:n-up 320ms cubic-bezier(.16,1,.3,1) both}
.n-pick header{padding:16px 20px 12px;display:flex;flex-direction:column;gap:12px;border-bottom:.5px solid var(--sep)}
.n-search{display:flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:12px;background:var(--fill)}
.n-search input{flex:1;border:0;background:none;outline:0;font:400 17px Figtree,sans-serif;color:var(--label)}
.n-chips{display:flex;gap:6px;flex-wrap:wrap}
.n-chip{height:32px;padding:0 14px;border:0;border-radius:16px;background:var(--fill);color:var(--label);font:inherit;cursor:pointer}
.n-chip[aria-pressed=true]{background:var(--tint);color:#fff;font-weight:600}
.n-opts{flex:1;overflow:auto;padding:12px 20px 20px}
.n-opts .n-group{display:grid;grid-template-columns:1fr 1fr;gap:.5px;background:var(--sep)}
.n-opt{display:flex;align-items:center;justify-content:space-between;gap:6px;min-height:44px;padding:0 14px;border:0;background:var(--group);color:var(--label);font:inherit;text-align:left;cursor:pointer}
.n-opt:hover{background:#f7f5fb}.n-opt:active{background:var(--tintFill)}
.n-opt.custom{grid-column:1/-1;color:var(--tint);font-weight:600}
.n-sw{position:relative;width:51px;height:31px;border:0;border-radius:999px;background:rgba(120,120,128,.16);cursor:pointer;flex:none;transition:background 200ms}
.n-sw::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.15);transition:transform 200ms cubic-bezier(.16,1,.3,1)}
.n-sw[aria-checked=true]{background:var(--tint)}.n-sw[aria-checked=true]::after{transform:translateX(20px)}
.n-preview{font-size:13px;color:var(--label2);min-height:18px}
.n-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:14px;padding:10px 10px 10px 16px;border-radius:14px;background:rgba(18,18,22,.92);color:#fff;font:500 15px Figtree,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.3);animation:n-up 300ms cubic-bezier(.16,1,.3,1) both}
.n-toast button{border:0;background:rgba(255,255,255,.16);color:#fff;font:600 14px Figtree,sans-serif;padding:6px 12px;border-radius:9px;cursor:pointer}
@keyframes n-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.n-toast{animation-name:n-toastup}@keyframes n-toastup{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
@media (hover:none){.n-hint{display:none}}
@media (max-width:640px){#names{top:auto;width:100%;height:62vh;border-radius:20px 20px 0 0;overflow:hidden}body.names #map,body.names .brand{display:none}body.names .top{right:12px}}
@media (prefers-reduced-motion:reduce){#names *,.n-toast{animation:none!important;transition:none!important}}
`;
document.head.appendChild(css);
const tick = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';

const el = document.createElement('aside'); el.id = 'names';
el.innerHTML = `<header class="n-head">
  <div class="n-row1"><div><h2 class="n-t2">Name spots</h2><p class="n-fn n-l2" id="nSum"></p></div><button class="n-btn n-filled n-small" id="nSave" disabled>Save</button></div>
  <div class="n-seg" id="nDeck"><button data-d="all" aria-pressed="true">All</button>${T.decks.map(d => `<button data-d="${d.id}" aria-pressed="false">${esc(d.label)}</button>`).join('')}</div>
</header>
<div class="n-bar" style="margin:0 24px 8px"><button class="n-btn n-plain" id="nAll"></button><span class="n-fn n-l2 n-hint">Shift-click to select a range · drag dots on the plan or rings in the view to move them</span></div>
<div id="nbody"></div>
<footer><button class="n-btn n-filled" id="nName" disabled>Choose a name</button></footer>`;
document.body.appendChild(el);
const body = el.querySelector('#nbody');

function toast(msg, act) {
  document.querySelector('.n-toast')?.remove();
  const t = document.createElement('div'); t.className = 'n-toast'; t.innerHTML = `<span>${esc(msg)}</span>`;
  if (act) { const b = document.createElement('button'); b.textContent = act[0]; b.onclick = () => { act[1](); t.remove(); }; t.appendChild(b); }
  document.body.appendChild(t); setTimeout(() => t.remove(), 5000);
}

// ---------- list ----------
const shown = () => ids.filter(id => deckF === 'all' || T.scenes[id].deck === deckF);
function render() {
  const fromList = ids.filter(id => inList(T.scenes[id].name)).length, d = dirty().length;
  el.querySelector('#nSum').textContent = `${ids.length} spots · ${fromList} named from the list${d ? ` · ${d} not saved yet` : ''}`;
  const save = el.querySelector('#nSave'); save.disabled = !d; save.textContent = 'Save';
  const vis = shown(), allOn = vis.length && vis.every(id => sel.has(id));
  el.querySelector('#nAll').textContent = allOn ? 'Clear selection' : `Select all ${vis.length}`;
  const btn = el.querySelector('#nName'); btn.disabled = !sel.size;
  btn.textContent = sel.size > 1 ? `Name ${sel.size} spots` : sel.size ? 'Choose a name' : 'Select spots to name';
  const decks = T.decks.filter(dk => vis.some(id => T.scenes[id].deck === dk.id));
  body.innerHTML = decks.map(dk => `<h3 class="n-dh">${esc(dk.label)}</h3><ul class="n-group">${vis.filter(id => T.scenes[id].deck === dk.id).map(id => {
    const n = T.scenes[id].name, changed = n !== saved[id];
    return `<li><div class="n-item${id === window.tour.cur ? ' cur' : ''}" data-id="${id}" aria-selected="${sel.has(id)}">
      <button class="n-check" role="checkbox" aria-checked="${sel.has(id)}" aria-label="Select">${tick}</button>
      <span class="n-thumb" style="background-image:url('thumb/${encodeURI(T.scenes[id].file)}')"></span>
      <span class="n-main"><span class="n-name">${esc(n)}</span>
      <span class="n-cap n-l2">${changed ? `<span class="n-was">${esc(saved[id])}</span> · ` : ''}${inList(n) ? '' : '<span class="n-badge b-orange">Not from the list</span>'}${changed ? ' <span class="n-badge b-tint">Edited</span>' : ''}${T.scenes[id].map.join() !== savedMap[id] || linkKey(id) !== savedLinks[id] ? ' <span class="n-badge b-tint">Moved</span>' : ''}</span></span>
    </div></li>`;
  }).join('')}</ul>`).join('');
}
function pick(id, e) {
  const vis = shown();
  if (e.shiftKey && anchor) {
    const [a, b] = [vis.indexOf(anchor), vis.indexOf(id)].sort((x, y) => x - y);
    vis.slice(a, b + 1).forEach(x => sel.add(x));
  } else sel.has(id) ? sel.delete(id) : sel.add(id);
  anchor = id; render();
}
body.addEventListener('click', e => {
  const row = e.target.closest('.n-item'); if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('.n-check') || e.shiftKey || e.metaKey || e.ctrlKey) return pick(id, e);
  // plain click: look at the spot and make it the only selection
  sel = new Set([id]); anchor = id; window.tour.go(id); render();
});
body.addEventListener('dblclick', e => { const row = e.target.closest('.n-item'); if (row) { sel = new Set([row.dataset.id]); openPicker(); } });
el.querySelectorAll('#nDeck button').forEach(b => b.onclick = () => {
  deckF = b.dataset.d; el.querySelectorAll('#nDeck button').forEach(x => x.setAttribute('aria-pressed', x === b)); render();
});
el.querySelector('#nAll').onclick = () => {
  const vis = shown(); vis.every(id => sel.has(id)) ? vis.forEach(id => sel.delete(id)) : vis.forEach(id => sel.add(id)); render();
};
el.querySelector('#nName').onclick = () => openPicker();
addEventListener('tour:scene', () => {
  if (!document.body.classList.contains('names')) return;
  render(); body.querySelector('.n-item.cur')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});

// ---------- naming ----------
function apply(base) {
  base = clean(base); if (!base) return;
  const order = shown().concat(ids).filter((id, i, a) => sel.has(id) && a.indexOf(id) === i);
  const name = withSide(side, base);
  const before = Object.fromEntries(order.map(id => [id, T.scenes[id].name]));
  const num = order.length > 1 && numbered;
  order.forEach((id, i) => T.scenes[id].name = num ? `${name} ${i + 1}` : name);
  window.tour.relabel();
  undo = before;
  toast(order.length > 1 ? `${order.length} spots named ${num ? `${name} 1 to ${order.length}` : name}.` : `Named ${T.scenes[order[0]].name}.`,
    ['Undo', () => { for (const [id, n] of Object.entries(undo)) T.scenes[id].name = n; window.tour.relabel(); render(); }]);
  // one at a time: step to the next spot so the photographer can keep naming
  if (order.length === 1) {
    const vis = shown(), next = vis[vis.indexOf(order[0]) + 1];
    if (next) { sel = new Set([next]); anchor = next; window.tour.go(next); render(); return openPicker(); }
  }
  sel.clear(); render(); closePicker();
}
function closePicker() { el.querySelector('.n-pick')?.remove(); }
function openPicker() {
  closePicker();
  const n = sel.size, one = n === 1 ? [...sel][0] : null;
  const used = name => ids.filter(id => T.scenes[id].name.replace(/ \d+$/, '').toLowerCase() === name.toLowerCase()).length;
  const p = document.createElement('div'); p.className = 'n-pick';
  p.innerHTML = `<header>
    <div class="n-row1"><div><h2 class="n-t2" style="font-size:20px;line-height:25px">${one ? esc(T.scenes[one].name) : `Name ${n} spots`}</h2>
      <p class="n-fn n-l2">${one ? `${esc(deckLabel(one))} · spot ${shown().indexOf(one) + 1} of ${shown().length}` : 'Same name for every selected spot'}</p></div>
      <button class="n-btn n-plain" id="pDone">Done</button></div>
    <label class="n-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8c8c92" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="pQ" placeholder="Search rooms, or type your own" autocomplete="off"></label>
    <div class="n-chips" id="pSide"><button class="n-chip" data-s="" aria-pressed="${!side}">No side</button>${SIDES.map(s => `<button class="n-chip" data-s="${s}" aria-pressed="${side === s}">${s}</button>`).join('')}</div>
    ${n > 1 ? `<div class="n-row1" style="align-items:center"><div><span style="font-weight:600">Number them</span><p class="n-fn n-l2">In list order, for example Guest cabin 1, 2</p></div>
      <button class="n-sw" id="pNum" role="switch" aria-checked="${numbered}" aria-label="Number them"></button></div>` : ''}
    <p class="n-preview" id="pPrev"></p>
  </header><div class="n-opts" id="pOpts"></div>`;
  el.appendChild(p);
  const q = p.querySelector('#pQ');
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const terms = s ? [s, ...Object.entries(ALIAS).filter(([k]) => k.startsWith(s) || s.startsWith(k)).flatMap(([, v]) => v.split(' '))] : [];
    const hit = r => !s || terms.some(t => r.toLowerCase().includes(t));
    const exact = ALL.some(r => r.toLowerCase() === clean(q.value).toLowerCase());
    const lead = r => r.toLowerCase().split(' ').some(w => w.startsWith(s)) ? 0 : 1;
    const groups = ROOMS.map(([g, rs]) => [g, rs.filter(hit).sort((a, b) => s ? lead(a) - lead(b) : 0)]).filter(([, rs]) => rs.length);
    p.querySelector('#pOpts').innerHTML = (s && !exact ? `<ul class="n-group"><li style="display:contents"><button class="n-opt custom" data-n="${esc(clean(q.value))}">Use “${esc(clean(q.value))}”</button></li></ul>` : '')
      + groups.map(([g, rs]) => `<h3 class="n-dh">${g}</h3><ul class="n-group">${rs.map(r => { const u = used(withSide(side, r)); return `<li style="display:contents"><button class="n-opt" data-n="${esc(r)}"><span>${esc(r)}</span>${u ? `<span class="n-badge b-gray">${u} in use</span>` : ''}</button></li>`; }).join('')}${rs.length % 2 ? '<li style="display:contents"><span class="n-opt" style="cursor:default"></span></li>' : ''}</ul>`).join('')
      + (!groups.length && !s ? '' : '');
    const first = p.querySelector('.n-opt[data-n]:not(.custom)') || p.querySelector('.n-opt[data-n]');
    p.querySelector('#pPrev').textContent = first ? `Enter names it ${withSide(side, first.dataset.n)}${n > 1 && numbered ? ' 1, 2, 3 ...' : ''}` : '';
  };
  draw(); setTimeout(() => q.focus(), 50);
  q.oninput = draw;
  q.onkeydown = e => { if (e.key === 'Enter') { const f = p.querySelector('.n-opt[data-n]:not(.custom)') || p.querySelector('.n-opt[data-n]'); f && apply(f.dataset.n); } if (e.key === 'Escape') closePicker(); };
  p.querySelector('#pOpts').onclick = e => { const o = e.target.closest('.n-opt[data-n]'); o && apply(o.dataset.n); };
  p.querySelectorAll('#pSide button').forEach(b => b.onclick = () => { side = b.dataset.s; p.querySelectorAll('#pSide button').forEach(x => x.setAttribute('aria-pressed', x === b)); draw(); });
  const sw = p.querySelector('#pNum'); if (sw) sw.onclick = () => { numbered = !numbered; sw.setAttribute('aria-checked', numbered); draw(); };
  p.querySelector('#pDone').onclick = closePicker;
}

// ---------- save ----------
el.querySelector('#nSave').onclick = async () => {
  const names = Object.fromEntries(dirty().filter(id => T.scenes[id].name !== saved[id]).map(id => [id, T.scenes[id].name]));
  const pins = Object.fromEntries(moved().map(id => [id, T.scenes[id].map]));
  const links = Object.fromEntries(hopsMoved().map(id => [id, T.scenes[id].links.map(({ id, yaw, pitch }) => ({ id, yaw, pitch }))]));
  let ok = false;
  try { ok = (await fetch(`/names/${TOUR}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ names, pins, links }) })).ok; } catch {}
  if (!ok) {  // static preview: hand the photographer a file to send in
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ tour: TOUR, names, pins, links }, null, 1)], { type: 'application/json' }));
    a.download = `${TOUR}-names.json`; a.click();
  }
  Object.assign(saved, names); for (const id in pins) savedMap[id] = pins[id].join(); for (const id in links) savedLinks[id] = linkKey(id); render();
  const n = Object.keys(names).length, m = Object.keys(pins).length, h = Object.keys(links).length;
  const what = [n && `${n} name${n > 1 ? 's' : ''}`, m && `${m} dot${m > 1 ? 's' : ''}`, h && `rings in ${h} spot${h > 1 ? 's' : ''}`].filter(Boolean).join(', ');
  toast(ok ? `${what} saved to the tour.` : 'Changes downloaded as a file. Send it to the YachtWay team to publish.');
};
// ---------- move dots: drag a pin on the deck plan (Names view only) ----------
const plan = document.getElementById('plan');
let drag = null;
plan.addEventListener('pointerdown', e => {
  const b = e.target.closest('.pin'); if (!b || !document.body.classList.contains('names')) return;
  e.preventDefault(); b.setPointerCapture(e.pointerId);
  drag = { b, id: b.dataset.id, x: e.clientX, y: e.clientY, moved: false };
});
plan.addEventListener('pointermove', e => {
  if (!drag) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
  drag.moved = true; drag.b.classList.add('dragging');
  const r = plan.getBoundingClientRect(), s = T.scenes[drag.id], d = T.decks.find(d => d.id === s.deck);
  const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  s.map = [Math.round(fx * d.w * 10) / 10, Math.round(fy * d.h * 10) / 10];
  drag.b.style.left = fx * 100 + '%'; drag.b.style.top = fy * 100 + '%';
  window.tour.updateCone();
});
plan.addEventListener('pointerup', () => {
  if (!drag) return;
  drag.b.classList.remove('dragging');
  if (drag.moved) { const b = drag.b; b.addEventListener('click', e => e.stopImmediatePropagation(), { capture: true, once: true }); render(); }
  drag = null;
});

// ---------- move rings: drag a hop ring in the 360 view (Names view only) ----------
const { viewer } = window.tour, mk = viewer.getPlugin('markers');
let hop = null;
const stop = e => { if (hop || (document.body.classList.contains('names') && e.target.closest?.('.hop'))) e.stopPropagation(); };
['mousedown', 'touchstart', 'pointerdown'].forEach(t => document.addEventListener(t, stop, true));
document.addEventListener('pointerdown', e => {
  const el = e.target.closest?.('.hop'); if (!el || !document.body.classList.contains('names')) return;
  const m = mk.getMarkers().find(m => m.domElement?.contains(el)); if (!m?.data?.go) return;
  e.preventDefault(); hop = { m, el, x: e.clientX, y: e.clientY, moved: false };
}, true);
addEventListener('pointermove', e => {
  if (!hop) return;
  if (!hop.moved && Math.hypot(e.clientX - hop.x, e.clientY - hop.y) < 4) return;
  hop.moved = true; hop.el.classList.add('dragging');
  const r = viewer.container.getBoundingClientRect();
  const p = viewer.dataHelper.viewerCoordsToSphericalCoords({ x: e.clientX - r.left, y: e.clientY - r.top });
  if (!p) return;
  mk.updateMarker({ id: hop.m.id, position: { yaw: p.yaw, pitch: p.pitch } });
  const l = T.scenes[window.tour.cur].links.find(l => l.id === hop.m.data.go);
  if (l) { l.yaw = Math.round(((p.yaw * 180 / Math.PI + 540) % 360 - 180) * 10) / 10; l.pitch = Math.round(p.pitch * 1800 / Math.PI) / 10; }
});
addEventListener('pointerup', () => {
  if (!hop) return;
  hop.el.classList.remove('dragging');
  if (hop.moved) { window.tour.hopDragged = true; setTimeout(() => window.tour.hopDragged = false, 300); render(); }
  hop = null;
});

addEventListener('beforeunload', e => { if (dirty().length) e.preventDefault(); });

render();
export function toggle(on) { if (!on) closePicker(); else render(); }
