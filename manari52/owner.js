// Owner view: tour analytics in the EasySign look (HIG tokens from easy-sign-v2/hig, motion from its Insights kit).
// Prototype reads mock-analytics.json; production reads the listing's sessions and leads from the API.
const { T } = window.tour;
const D = await (await fetch('mock-analytics.json')).json();
const DAY = 86400000;
const NAME = id => T.scenes[id].name;
const fmt = s => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
const ago = t => { const h = (D.now - t) / 3600000; return h < 1 ? 'Just now' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`; };
const pct = x => Math.round(x * 100) + '%';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- numbers ----------
function stats(sessions) {
  const time = {}, reach = {}, exit = {};
  let total = 0;
  for (const s of sessions) {
    const seen = new Set();
    for (const [id] of s.s) { time[id] = (time[id] || 0) + 1; seen.add(id); total++; }
    seen.forEach(id => reach[id] = (reach[id] || 0) + 1);
    if (s.s.length) { const last = s.s.at(-1)[0]; exit[last] = (exit[last] || 0) + 1; }
  }
  const ids = Object.keys(T.scenes), n = Math.max(1, sessions.length);
  return { total, sessions: sessions.length, ids,
    time: id => time[id] || 0, share: id => (time[id] || 0) / Math.max(1, total),
    reach: id => (reach[id] || 0) / n, exit: id => (exit[id] || 0) / n,
    byTime: ids.slice().sort((a, b) => (time[b] || 0) - (time[a] || 0)) };
}
const allByVid = {};
for (const s of D.sessions) (allByVid[s.vid] ||= []).push(s);
for (const ss of Object.values(allByVid)) ss.sort((a, b) => a.t - b.t);
const firstSeen = Object.fromEntries(Object.entries(allByVid).map(([v, ss]) => [v, ss[0].t]));

const SCORE = { Hot: 0, Warm: 1, Cool: 2 };
const LEADS_ALL = D.leads.map(L => {
  const ss = allByVid[L.vid] || [], st = stats(ss);
  const score = ss.length >= 3 || st.total >= 300 ? 'Hot' : st.total >= 120 ? 'Warm' : 'Cool';
  return { ...L, ss, st, score, last: Math.max(...ss.map(s => s.t)), checked: new Set() };
}).sort((a, b) => SCORE[a.score] - SCORE[b.score] || b.last - a.last);

// everything the panel shows for one window of days
function period(days, offset = 0) {
  const hi = D.now - offset * days * DAY, lo = hi - days * DAY;
  const sessions = D.sessions.filter(s => s.t > lo && s.t <= hi);
  const byVid = {};
  for (const s of sessions) (byVid[s.vid] ||= []).push(s);
  const leads = LEADS_ALL.filter(L => L.enquired > lo && L.enquired <= hi);
  const leadVids = new Set(LEADS_ALL.map(l => l.vid));
  const st = stats(sessions);
  return { days, lo, hi, sessions, byVid, leads, st,
    returning: Object.entries(byVid).filter(([v, ss]) => ss.length > 1 && !leadVids.has(v)),
    kpi: {
      viewers: Object.keys(byVid).length,
      avg: Math.round(st.total / Math.max(1, sessions.length)),
      back: Object.values(byVid).filter(ss => ss.length > 1).length,
      enq: leads.length } };
}
let R = 7, P = period(R), PREV = period(R, 1);

// one value per day for the chart
function daily(metric) {
  const out = [];
  for (let i = R - 1; i >= 0; i--) {
    const hi = D.now - i * DAY, lo = hi - DAY;
    const ss = P.sessions.filter(s => s.t > lo && s.t <= hi);
    const v = metric === 'viewers' ? new Set(ss.map(s => s.vid)).size
      : metric === 'avg' ? Math.round(ss.reduce((a, s) => a + s.s.length, 0) / Math.max(1, ss.length))
      : metric === 'back' ? new Set(ss.filter(s => firstSeen[s.vid] < lo).map(s => s.vid)).size
      : LEADS_ALL.filter(L => L.enquired > lo && L.enquired <= hi).length;
    out.push({ v, d: new Date(hi) });
  }
  return out;
}

const TALK = [
  [/helm/i, ['Electronics package and screen sizes', 'Engine hours and last service date', 'Cruising speed and fuel burn']],
  [/below|engine/i, ['Survey report and engine service log', 'Generator and air conditioning', 'Bilge and maintenance access']],
  [/cabin/i, ['Berth sizes and headroom', 'Air conditioning in the cabins', 'Storage and hanging lockers']],
  [/galley/i, ['Fridge, cooktop and watermaker', 'Fresh water capacity']],
  [/head/i, ['Holding tank and fresh water capacity', 'Shower and hot water']],
  [/dining|aft/i, ['Seating for guests and table setup', 'Swim platform and tender options', 'Shade: hardtop or bimini']],
  [/bow/i, ['Sunpad and bow seating', 'Anchor and windlass']],
];
const talk = id => (TALK.find(([re]) => re.test(NAME(id)))?.[1]) || [`What they liked about the ${NAME(id)}`];

// ---------- heat on the 360 ----------
let heatOn = false, filter = null;  // filter: lead vid, or null for everyone in the period
const heatCache = {};
const RAMP = [[0, [84, 13, 163, 0]], [.12, [84, 13, 163, 0]], [.3, [84, 13, 163, 100]], [.5, [181, 23, 158, 150]], [.7, [247, 127, 0, 170]], [1, [253, 224, 71, 190]]];
const color = v => { for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (v - a) / (b - a); return ca.map((c, k) => c + (cb[k] - c) * t); } return RAMP.at(-1)[1]; };
function samples(id) {
  const out = [];
  for (const s of filter ? allByVid[filter] : P.sessions) for (const r of s.s) if (r[0] === id) out.push(r);
  return out;
}
async function heatUrl(id) {
  const key = id + '|' + (filter || R);
  if (heatCache[key]) return heatCache[key];
  const img = new Image(); img.src = 'pano/' + T.scenes[id].file; await img.decode();
  const c = document.createElement('canvas'); c.width = 4096; c.height = 2048;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, c.width, c.height);
  const W = 360, H = 180, g = new Float32Array(W * H), sy = 9, sp = 7;
  for (const [, y, p] of samples(id)) {
    const cx = y + 180, cy = 90 - p;
    for (let dy = -3 * sp; dy <= 3 * sp; dy++) {
      const yy = Math.round(cy + dy); if (yy < 0 || yy >= H) continue;
      const wy = Math.exp(-(dy * dy) / (2 * sp * sp));
      for (let dx = -3 * sy; dx <= 3 * sy; dx++) g[yy * W + ((Math.round(cx + dx) % W) + W) % W] += wy * Math.exp(-(dx * dx) / (2 * sy * sy));
    }
  }
  let max = 0; for (const v of g) if (v > max) max = v;
  const h = document.createElement('canvas'); h.width = W; h.height = H;
  const hx = h.getContext('2d'), d = hx.createImageData(W, H);
  for (let i = 0; i < g.length; i++) d.data.set(max ? color(g[i] / max) : [0, 0, 0, 0], i * 4);
  hx.putImageData(d, 0, 0);
  x.imageSmoothingQuality = 'high'; x.drawImage(h, 0, 0, c.width, c.height);
  return heatCache[key] = c.toDataURL('image/jpeg', .88);
}
async function setHeat(on) {
  heatOn = on;
  document.getElementById('heatT').setAttribute('aria-checked', on);
  window.tour.setPanoFor(id => heatOn ? heatUrl(id) : 'pano/' + T.scenes[id].file);
  await window.tour.reload();
}

// ---------- deck overlay: time share labels, a lead's path, highlighted pins ----------
function overlay(path) {
  const plan = document.getElementById('plan');
  plan.querySelectorAll('.o-lbl,.o-path').forEach(e => e.remove());
  if (!document.body.classList.contains('owner')) return;
  const deckId = window.tour.deck, d = T.decks.find(d => d.id === deckId);
  const st = filter ? stats(allByVid[filter]) : P.st;
  for (const s of Object.values(T.scenes)) {
    if (s.deck !== deckId || !st.time(s.id)) continue;
    const l = document.createElement('span'); l.className = 'o-lbl';
    l.style.left = s.map[0] / d.w * 100 + '%'; l.style.top = s.map[1] / d.h * 100 + '%';
    l.textContent = pct(st.share(s.id));
    plan.appendChild(l);
  }
  const pts = path || (filter ? allByVid[filter].flatMap(s => s.s.map(r => r[0])) : null);
  if (!pts) return;
  let p = '', prev = null;
  for (const id of pts) {
    if (id === prev) continue;
    const a = prev && T.scenes[prev], b = T.scenes[id];
    if (a && a.deck === deckId && b.deck === deckId) p += `M${a.map[0]} ${a.map[1]}L${b.map[0]} ${b.map[1]}`;
    prev = id;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'o-path'); svg.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = `<path d="${p}" fill="none" stroke="#fde047" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9" vector-effect="non-scaling-stroke"/>`;
  plan.insertBefore(svg, plan.querySelector('.pin'));
}
addEventListener('tour:deck', () => setTimeout(overlay));
const hl = id => document.querySelectorAll('.pin').forEach(p => p.classList.toggle('hl', p.dataset.id === id));

// ---------- look ----------
const I = {
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  back: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  flame: '<path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6.5-4-8-.4 2-1.5 3.5-3 4 0-3-1.5-6-4-9 0 4-5 6.5-5 12 0 4.3 3 8 9 8Z"/>',
  door: '<path d="M14 4h5v16h-5"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  play: '<path d="M7 4v16l13-8L7 4Z" fill="currentColor"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  chevL: '<path d="m15 6-6 6 6 6"/>',
  tick: '<path d="m5 12 5 5 9-10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
};
const icon = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const EASE = 'cubic-bezier(.16,1,.3,1)';
const css = document.createElement('style');
css.textContent = `
#owner{--bg:#f2f2f5;--group:#fff;--fill:rgba(118,118,128,.12);--fillP:rgba(118,118,128,.2);--label:#121216;--label2:#727279;--label3:#8c8c92;
--sep:rgba(60,60,67,.16);--tint:#4b0ea3;--tintFill:#f3edfb;--red:#b42318;--redFill:#fee4e2;--orange:#b54708;--orangeFill:#fef0c7;
--green:#027a48;--greenFill:#d1fadf;--blue:#175cd3;--blueFill:#d1e9ff;--teal:#107569;--tealFill:#ccfbef;--pink:#c11574;--pinkFill:#fce7f6;
position:fixed;top:0;right:0;bottom:0;width:440px;z-index:15;display:none;flex-direction:column;background:var(--bg);color:var(--label);
font:400 15px/20px Figtree,system-ui,sans-serif;-webkit-font-smoothing:antialiased;box-shadow:-12px 0 40px rgba(0,0,0,.25)}
#owner *{box-sizing:border-box}
body.owner #owner{display:flex}
#owner h2,#owner h3,#owner p{margin:0}
.o-t2{font:500 22px/28px Poppins,sans-serif;letter-spacing:-.01em}
.o-hl{font-size:17px;line-height:22px;font-weight:600}
.o-sub{font-size:15px;line-height:20px}
.o-fn{font-size:13px;line-height:18px}
.o-cap{font-size:12px;line-height:16px;letter-spacing:.01em}
.o-l2{color:var(--label2)}.o-l3{color:var(--label3)}
.o-num{font-variant-numeric:tabular-nums}
.o-grab{display:none}
.o-head{padding:20px 20px 12px;display:flex;flex-direction:column;gap:12px;background:var(--bg)}
.o-head-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.o-badge{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap}
.b-orange{background:var(--orangeFill);color:var(--orange)}.b-red{background:var(--redFill);color:var(--red)}.b-green{background:var(--greenFill);color:var(--green)}
.b-gray{background:var(--fill);color:var(--label2)}.b-tint{background:var(--tintFill);color:var(--tint)}.b-blue{background:var(--blueFill);color:var(--blue)}
.o-seg{display:flex;padding:2px;gap:2px;border-radius:9px;background:var(--fill)}
.o-seg button{flex:1 1 0;min-height:32px;padding:0 10px;border:0;border-radius:7px;background:none;color:var(--label);font:500 13px Figtree,sans-serif;cursor:pointer;
display:flex;align-items:center;justify-content:center;gap:6px;transition:background 160ms,box-shadow 160ms}
.o-seg button[aria-pressed=true]{background:#fff;font-weight:600;box-shadow:0 1px 3px rgba(16,24,40,.12),0 0 0 .5px rgba(0,0,0,.04)}
.o-seg .n{font-size:12px;color:var(--label2);font-weight:500}
#obody{flex:1;overflow:auto;padding:4px 20px 24px;overscroll-behavior:contain}
.o-sec{margin:0 0 24px}
.o-sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 4px 8px}
.o-card{background:var(--group);border-radius:16px;padding:16px}
.o-kpis{position:relative;z-index:2;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;list-style:none;margin:0 0 12px;padding:0}
.o-kpi{position:relative;display:flex;flex-direction:column;gap:2px;padding:14px;border:0;border-radius:16px;background:var(--group);color:inherit;font:inherit;text-align:left;cursor:pointer;
transition:transform 200ms ${EASE},box-shadow 200ms ${EASE}}
.o-kpi:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(16,24,40,.08)}
.o-kpi[aria-pressed=true]{box-shadow:inset 0 0 0 2px var(--tint)}
.o-kpi[aria-pressed=true] .o-kv{color:var(--tint)}
.o-kpi-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.o-tile{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:var(--tintFill);color:var(--tint);flex:none}
.o-tile.t-red{background:#ff375f;color:#fff}.o-tile.t-orange{background:#ff9f0a;color:#fff}.o-tile.t-blue{background:#0a84ff;color:#fff}
.o-tile.t-green{background:#34c759;color:#fff}.o-tile.t-teal{background:#30b0c7;color:#fff}.o-tile.t-indigo{background:#5856d6;color:#fff}
.o-kv{font:500 28px/34px Poppins,sans-serif;letter-spacing:-.015em;font-variant-numeric:tabular-nums;transition:color 160ms}
.o-delta{font-size:12px;font-weight:600}.o-delta.up{color:var(--green)}.o-delta.dn{color:var(--red)}
.o-chart{position:relative;display:flex;align-items:flex-end;gap:3px;height:140px;margin-top:12px;padding-bottom:20px}
.o-chart .col{position:relative;flex:1 1 0;height:100%;display:flex;align-items:flex-end;cursor:pointer}
.o-chart .col i{display:block;width:100%;min-height:2px;border-radius:4px 4px 2px 2px;background:var(--tint);opacity:.35;transform-origin:bottom;
transition:height 500ms ${EASE},opacity 160ms;animation:o-growY 700ms ${EASE} both;animation-delay:calc(var(--i) * 18ms)}
.o-chart .col:last-child i{opacity:1}
.o-chart .col:hover i,.o-chart .col.on i{opacity:1}
.o-chart .col span{position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);font-size:11px;color:var(--label3);white-space:nowrap}
.o-chart .grid{position:absolute;left:0;right:0;border-top:.5px dashed var(--sep);pointer-events:none}
.o-tip{position:absolute;z-index:3;transform:translate(-50%,-100%);margin-top:-8px;padding:6px 10px;border-radius:10px;background:var(--label);color:#fff;
font-size:12px;line-height:16px;white-space:nowrap;pointer-events:none;box-shadow:0 8px 24px rgba(16,24,40,.2);animation:o-pop 140ms ${EASE} both}
.o-tip b{display:block;font-size:15px;line-height:20px;font-variant-numeric:tabular-nums}
.o-group{list-style:none;margin:0;padding:0;background:var(--group);border-radius:16px;overflow:hidden}
.o-row{position:relative;display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:11px 16px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;text-decoration:none}
button.o-row,a.o-row{cursor:pointer}
button.o-row:hover,a.o-row:hover{background:var(--fill)}
button.o-row:active{background:var(--fillP)}
.o-group>li+li>.o-row::before{content:"";position:absolute;top:0;right:0;left:var(--inset,58px);border-top:.5px solid var(--sep)}
.o-main{display:flex;flex:1 1 0;min-width:0;flex-direction:column;gap:2px}
.o-trail{display:flex;flex:none;align-items:center;gap:8px;color:var(--label2)}
.o-chev{color:var(--label3);display:flex}
.o-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border:0;border-radius:12px;font:600 15px Figtree,sans-serif;
white-space:nowrap;cursor:pointer;text-decoration:none;transition:transform 120ms ease-out,opacity 120ms ease-out}
.o-btn:active{transform:scale(.97);opacity:.85}
.o-filled{background:var(--tint);color:#fff}.o-tinted{background:var(--tintFill);color:var(--tint)}.o-gray{background:var(--fill);color:var(--label)}
.o-small{min-height:30px;padding:0 12px;font-size:13px;border-radius:999px}
.o-plain{background:none;color:var(--tint);padding:0 4px;min-height:32px;font-size:15px}
.o-bars{display:flex;flex-direction:column;gap:2px;list-style:none;margin:0;padding:0}
.o-bars button{display:flex;flex-direction:column;gap:6px;width:100%;padding:8px;margin:0 -8px;width:calc(100% + 16px);border:0;border-radius:10px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.o-bars button:hover{background:var(--fill)}
.o-bar-head{display:flex;align-items:center;gap:8px;min-width:0}
.o-bar-head .nm{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.o-track{display:block;height:8px;border-radius:4px;background:var(--fill);overflow:hidden}
.o-track>span{display:block;height:100%;border-radius:4px;background:var(--tint);transform-origin:left center;transition:width 600ms ${EASE};
animation:o-grow 800ms ${EASE} both;animation-delay:calc(120ms + var(--i,0) * 60ms)}
.o-bars li:not(:first-child) .o-track>span{opacity:.55}
.o-switch{display:flex;border-radius:12px;background:var(--fill);padding:2px;gap:2px;margin-bottom:12px}
.o-switch button{flex:1 1 0;display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:0;padding:8px 10px;border:0;border-radius:10px;background:none;
color:var(--label2);font:inherit;text-align:left;cursor:pointer;transition:background 160ms,color 160ms}
.o-switch button[aria-pressed=true]{background:#fff;color:var(--label);box-shadow:0 1px 3px rgba(16,24,40,.12)}
.o-switch strong{font-size:20px;line-height:25px;font-weight:600;font-variant-numeric:tabular-nums}
.o-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 12px}
.o-chip{flex:none;height:32px;padding:0 14px;border:0;border-radius:16px;background:var(--fill);color:var(--label);font:inherit;font-size:15px;cursor:pointer;white-space:nowrap}
.o-chip[aria-pressed=true]{background:var(--tint);color:#fff;font-weight:600}
.o-av{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;flex:none;font:600 13px Figtree,sans-serif;color:#fff}
.o-av.Hot{background:linear-gradient(135deg,#ff9f0a,#ff375f)}.o-av.Warm{background:linear-gradient(135deg,#ffd426,#ff9f0a)}.o-av.Cool{background:linear-gradient(135deg,#aeb4d6,#727279)}
.o-av.lg{width:56px;height:56px;font-size:19px}
.o-backbtn{display:inline-flex;align-items:center;gap:2px;min-height:44px;margin:0 0 4px -8px;padding:0 6px;border:0;background:none;font:inherit;font-size:17px;color:var(--tint);cursor:pointer}
.o-quote{position:relative;margin:12px 0 0;padding:12px 14px;border-radius:16px 16px 16px 4px;background:var(--fill);font-size:15px;line-height:21px}
.o-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.o-stats>div{display:flex;flex-direction:column;gap:2px}
.o-visit[data-playing] .o-tile{background:var(--tint);color:#fff}
.o-dots{display:flex;gap:3px;flex-wrap:wrap;margin-top:4px}
.o-dots i{width:8px;height:8px;border-radius:2px;background:var(--tintFill);box-shadow:inset 0 0 0 1px rgba(75,14,163,.25)}
.o-dots i.on{background:var(--tint)}
.o-check{display:flex;flex:none;align-items:center;justify-content:center;width:22px;height:22px;border-radius:11px;box-shadow:inset 0 0 0 1.5px var(--label3);color:#fff;transition:background 140ms}
[aria-checked=true] .o-check{background:var(--tint);box-shadow:none}
[aria-checked=true] .o-main{color:var(--label3);text-decoration:line-through}
.o-actions{position:sticky;bottom:-24px;display:flex;gap:8px;margin:16px -20px -24px;padding:12px 20px 20px;background:rgba(242,242,245,.86);backdrop-filter:blur(20px) saturate(180%);border-top:.5px solid var(--sep)}
.o-actions .o-btn{flex:1 1 0;padding:0 10px}
.o-info{position:relative;display:inline-flex;vertical-align:middle;margin-left:4px}
.o-info>button{display:flex;padding:0;border:0;background:none;color:var(--label3);cursor:pointer}
.o-info>button:hover{color:var(--label)}
.o-pop{position:absolute;z-index:20;top:calc(100% + 8px);right:-12px;width:240px;padding:12px;border-radius:12px;background:var(--label);color:#fff;font-size:13px;line-height:18px;
font-weight:400;text-align:left;box-shadow:0 12px 32px rgba(16,24,40,.18);animation:o-pop 160ms ${EASE} both}
#owner footer{display:flex;align-items:center;gap:12px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));background:rgba(249,249,251,.86);backdrop-filter:blur(20px) saturate(180%);border-top:.5px solid var(--sep)}
.o-legend{display:block;width:72px;height:6px;border-radius:3px;background:linear-gradient(90deg,rgba(84,13,163,.5),#b5179e,#f77f00,#fde047)}
.o-sw{position:relative;width:51px;height:31px;margin-left:auto;border:0;border-radius:999px;background:rgba(120,120,128,.16);cursor:pointer;transition:background 200ms;flex:none}
.o-sw::after{content:"";position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.15),0 1px 1px rgba(0,0,0,.16);transition:transform 200ms ${EASE}}
.o-sw[aria-checked=true]{background:var(--tint)}.o-sw[aria-checked=true]::after{transform:translateX(20px)}
.o-rise{animation:o-rise 520ms ${EASE} both;animation-delay:calc(var(--i,0) * 45ms)}
@keyframes o-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes o-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes o-growY{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes o-pop{from{opacity:0;transform:translate(-50%,-100%) scale(.96)}to{opacity:1;transform:translate(-50%,-100%)}}
.o-pop{animation-name:o-fade}@keyframes o-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.o-lbl{position:absolute;z-index:3;transform:translate(11px,-50%);font:600 11px Figtree,sans-serif;background:#fff;color:#4b0ea3;padding:2px 6px;border-radius:999px;
pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25);font-variant-numeric:tabular-nums}
.o-path{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.o-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:50;display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:14px;
background:rgba(18,18,22,.92);backdrop-filter:blur(20px);color:#fff;font:500 15px Figtree,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.3);animation:o-rise 300ms ${EASE} both}
.o-modal{position:fixed;inset:0;z-index:40;display:grid;place-items:center;background:rgba(0,0,0,.4);animation:o-fade 200ms both}
.o-sheet{width:min(520px,94vw);max-height:88vh;overflow:auto;padding:24px;border-radius:20px;background:#f2f2f5;color:#121216;font:400 15px/21px Figtree,sans-serif;animation:o-rise 360ms ${EASE} both}
.o-sheet .o-kpis{grid-template-columns:repeat(3,minmax(0,1fr));margin:16px 0}
.o-sheet .o-kpi{cursor:default}.o-sheet .o-kpi:hover{transform:none;box-shadow:none}
@media (max-width:640px){
 #owner{top:auto;width:100%;height:60vh;border-radius:20px 20px 0 0;box-shadow:0 -12px 40px rgba(0,0,0,.3);transition:height 300ms ${EASE}}
 #owner.tall{height:92vh}
 .o-grab{display:block;width:100%;height:20px;border:0;background:none;cursor:pointer;flex:none;position:relative}
 .o-grab::after{content:"";position:absolute;top:8px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:3px;background:rgba(60,60,67,.3)}
 .o-head{padding-top:4px}
 body.owner .top{right:12px}body.owner #map{display:none}body.owner .brand{display:none}
}
@media (prefers-reduced-motion:reduce){#owner *,.o-toast,.o-sheet{animation:none!important;transition:none!important}}
`;
document.head.appendChild(css);

const el = document.createElement('aside'); el.id = 'owner';
el.innerHTML = `<button class="o-grab" aria-label="Expand"></button>
<header class="o-head">
  <div class="o-head-row"><div><h2 class="o-t2">Tour insights</h2><p class="o-fn o-l2">${esc(T.title)}</p></div><span class="o-badge b-orange">Mock data</span></div>
  <div class="o-seg" id="range"><button data-r="7" aria-pressed="true">Last 7 days</button><button data-r="30" aria-pressed="false">Last 30 days</button></div>
  <div class="o-seg" id="tabs"><button data-t="ins" aria-pressed="true">Overview</button><button data-t="leads" aria-pressed="false">Leads <span class="n" id="nLeads"></span></button><button data-t="spots" aria-pressed="false">Spots</button><button data-t="share" aria-pressed="false">Embed</button></div>
</header>
<div id="obody"></div>
<footer><span class="o-sub">Heat on 360</span><span class="o-legend"></span><button class="o-sw" id="heatT" role="switch" aria-checked="false" aria-label="Heat on 360"></button></footer>`;
document.body.appendChild(el);
const body = el.querySelector('#obody');
el.querySelector('.o-grab').onclick = () => el.classList.toggle('tall');
el.querySelectorAll('#tabs button').forEach(b => b.onclick = () => tab(b.dataset.t));
el.querySelectorAll('#range button').forEach(b => b.onclick = () => setRange(+b.dataset.r));
el.querySelector('#heatT').onclick = () => setHeat(!heatOn);

function toast(msg) {
  document.querySelector('.o-toast')?.remove();
  const t = document.createElement('div'); t.className = 'o-toast'; t.textContent = msg; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
// counts a figure up from zero; only the number moves, so "48s" and "2m 5s" keep their units
function countUp(node, to, show, ms = 800) {
  if (reduce) { node.textContent = show(to); return; }
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3; node.textContent = show(Math.round(to * e)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function info(text) { return `<span class="o-info"><button type="button" aria-label="What this counts">${icon('info', 14)}</button><span class="o-pop" hidden>${text}</span></span>`; }
body.addEventListener('click', e => {
  const b = e.target.closest('.o-info>button');
  body.querySelectorAll('.o-pop').forEach(p => { if (!b || p !== b.nextElementSibling) p.hidden = true; });
  if (b) { e.stopPropagation(); b.nextElementSibling.hidden = !b.nextElementSibling.hidden; }
});

let curTab = 'ins', leadFilter = 'All', spotMetric = 'time', kpiSel = 'viewers', playing = null;
function setRange(r) {
  R = r; P = period(R); PREV = period(R, 1);
  el.querySelectorAll('#range button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.r === r));
  overlay(); if (heatOn && !filter) window.tour.reload();
  tab(curTab === 'lead' ? 'leads' : curTab);
}
function tab(t, arg) {
  stopReplay();
  curTab = t;
  el.querySelector('#nLeads').textContent = P.leads.length;
  el.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === (t === 'lead' ? 'leads' : t)));
  if (t !== 'lead' && filter) { filter = null; overlay(); if (heatOn) window.tour.reload(); }
  ({ ins: overview, leads, spots, lead, share })[t](arg);
  body.scrollTop = 0;
}

// ---------- overview ----------
const KPI = [
  ['viewers', 'Viewers', 'eye', n => `${n}`, 'People who opened the tour. One person on one browser counts once.'],
  ['avg', 'Avg visit', 'clock', fmt, 'Average time in the tour per visit.'],
  ['back', 'Came back', 'back', n => `${n}`, 'People who opened the tour on two or more days.'],
  ['enq', 'Enquiries', 'mail', n => `${n}`, 'Buyers who sent an enquiry from this listing.'],
];
function overview() {
  const top = P.st.byTime[0], first = T.first;
  const low = P.st.ids.filter(id => id !== first).sort((a, b) => P.st.reach(a) - P.st.reach(b))[0];
  const hot = P.leads.filter(l => l.score === 'Hot' && l.status === 'New');
  const delta = k => {
    const a = P.kpi[k], b = PREV.kpi[k];
    if (!b) return '';
    const d = Math.round((a - b) / b * 100);
    return d ? `<span class="o-delta ${d > 0 ? 'up' : 'dn'}">${d > 0 ? '↑' : '↓'} ${Math.abs(d)}%</span>` : '';
  };
  const todo = [];
  if (hot.length) todo.push(['flame', 't-red', `Call ${hot.length} hot ${hot.length > 1 ? 'leads' : 'lead'}`, `${hot[0].name} toured ${hot[0].ss.length} times`, 'go', () => { leadFilter = 'Hot'; tab('leads'); }]);
  todo.push(['door', 't-orange', `${pct(P.st.exit(first))} leave at the ${NAME(first)}`, `Start the tour at the ${NAME(top)} instead`, 'apply', () => toast(`Mock: new visitors start at the ${NAME(top)}.`)]);
  if (low) todo.push(['compass', 't-blue', `${pct(P.st.reach(low))} reach the ${NAME(low)}`, 'Link it from a busier spot', 'go', () => { window.tour.go(low); hl(low); }]);
  if (P.returning.length) todo.push(['back', 't-indigo', `${P.returning.length} came back without enquiring`, 'Ask them to book a viewing on their next visit', 'apply', () => toast('Mock: return visitors see "Book a viewing".')]);
  todo.push(['star', 't-green', `Use the ${NAME(top)} as the cover photo`, `${pct(P.st.share(top))} of all viewing time`, 'go', async () => { await window.tour.go(top); if (!heatOn) setHeat(true); }]);
  todo.push(['doc', 't-teal', 'Send the seller a report', `${P.kpi.viewers} people toured the boat`, 'go', report]);

  body.innerHTML = `
  <section class="o-sec">
    <ul class="o-kpis">${KPI.map(([k, label, ic, , hint], i) => `<li><div class="o-kpi o-rise" role="button" tabindex="0" style="--i:${i};height:100%" data-k="${k}" aria-pressed="${k === kpiSel}">
      <span class="o-kpi-top"><span class="o-tile">${icon(ic)}</span>${delta(k)}</span>
      <span class="o-kv" data-v="${k}">0</span><span class="o-sub" style="font-weight:500">${label} ${info(hint)}</span></div></li>`).join('')}</ul>
    <div class="o-card o-rise" style="--i:4"><div class="o-sec-head" style="margin:0"><h3 class="o-hl" id="chartT"></h3><span class="o-fn o-l2" id="chartS"></span></div><div class="o-chart" id="chart"></div></div>
  </section>
  <section class="o-sec"><div class="o-sec-head"><h3 class="o-hl">To do</h3><span class="o-fn o-l2">${todo.length} items</span></div>
    <ul class="o-group o-rise" style="--i:5">${todo.map(([ic, c, h, s, kind], i) => `<li>${kind === 'apply'
      ? `<div class="o-row"><span class="o-tile ${c}">${icon(ic)}</span><span class="o-main"><span class="o-sub" style="font-weight:600">${h}</span><span class="o-fn o-l2">${s}</span></span><button class="o-btn o-tinted o-small" data-a="${i}">Turn on</button></div>`
      : `<button class="o-row" data-a="${i}"><span class="o-tile ${c}">${icon(ic)}</span><span class="o-main"><span class="o-sub" style="font-weight:600">${h}</span><span class="o-fn o-l2">${s}</span></span><span class="o-chev">${icon('chev', 16)}</span></button>`}</li>`).join('')}</ul>
  </section>
  <section class="o-sec"><div class="o-sec-head"><h3 class="o-hl">Where people look</h3><button class="o-btn o-plain" id="allSpots">All spots</button></div>
    <div class="o-card o-rise" style="--i:6">${barList(P.st.byTime.slice(0, 5), id => pct(P.st.share(id)), id => `Reached by ${pct(P.st.reach(id))} of visits`, P.st.share)}</div>
  </section>`;

  for (const [k, , , show] of KPI) countUp(body.querySelector(`[data-v=${k}]`), P.kpi[k], show);
  body.querySelectorAll('.o-kpi').forEach(b => {
    b.onclick = e => {
      if (e.target.closest('.o-info')) return;
      kpiSel = b.dataset.k; body.querySelectorAll('.o-kpi').forEach(x => x.setAttribute('aria-pressed', x === b)); chart();
    };
    b.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), b.click());
  });
  body.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    todo[b.dataset.a][5]();
    if (b.classList.contains('o-small')) b.outerHTML = '<span class="o-badge b-green">On</span>';
  });
  body.querySelector('#allSpots').onclick = () => tab('spots');
  wireBars();
  chart();
}
function chart() {
  const [k, label, , show] = KPI.find(x => x[0] === kpiSel);
  const data = daily(k), max = Math.max(1, ...data.map(d => d.v));
  body.querySelector('#chartT').textContent = `${label} by day`;
  body.querySelector('#chartS').textContent = R === 7 ? 'Last 7 days' : 'Last 30 days';
  const c = body.querySelector('#chart');
  const every = R === 7 ? 1 : 6;
  c.innerHTML = `<div class="grid" style="bottom:calc(20px + 50% - 10px)"></div>` + data.map((d, i) => {
    const lbl = R === 7 ? d.d.toLocaleDateString('en-US', { weekday: 'short' }) : d.d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    return `<div class="col" data-i="${i}" style="--i:${i}"><i style="height:${d.v / max * 100}%"></i>${(R - 1 - i) % every === 0 ? `<span>${lbl}</span>` : ''}</div>`;
  }).join('');
  const tipAt = col => {
    c.querySelector('.o-tip')?.remove(); c.querySelectorAll('.col').forEach(x => x.classList.toggle('on', x === col));
    const d = data[col.dataset.i], t = document.createElement('div'); t.className = 'o-tip';
    t.innerHTML = `<b>${show(d.v)}</b>${d.d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}`;
    const bar = col.querySelector('i');
    t.style.left = col.offsetLeft + col.offsetWidth / 2 + 'px'; t.style.top = c.offsetHeight - 20 - bar.offsetHeight + 'px';
    const half = 60; t.style.left = Math.min(Math.max(parseFloat(t.style.left), half), c.offsetWidth - half) + 'px';
    c.appendChild(t);
  };
  c.querySelectorAll('.col').forEach(col => { col.onmouseenter = () => tipAt(col); col.onclick = () => tipAt(col); });
  c.onmouseleave = () => { c.querySelector('.o-tip')?.remove(); c.querySelectorAll('.col').forEach(x => x.classList.remove('on')); };
}

// ranked bars; hover lights the pin on the deck plan, tap jumps there
function barList(ids, value, meta, share) {
  const top = Math.max(...ids.map(share)) || 1;
  return `<ol class="o-bars">${ids.map((id, i) => `<li style="--i:${i}"><button data-id="${id}">
    <span class="o-bar-head"><span class="o-sub nm">${NAME(id)}</span><span class="o-hl o-num">${value(id)}</span></span>
    <span class="o-track"><span style="width:${Math.max(share(id) / top * 100, .5)}%"></span></span>
    ${meta ? `<span class="o-fn o-l2">${meta(id)}</span>` : ''}</button></li>`).join('')}</ol>`;
}
function wireBars() {
  body.querySelectorAll('.o-bars button').forEach(b => {
    b.onmouseenter = () => hl(b.dataset.id); b.onmouseleave = () => hl(null);
    b.onclick = () => window.tour.go(b.dataset.id);
  });
}

// ---------- leads ----------
const initials = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
const statusBadge = s => `<span class="o-badge ${s === 'New' ? 'b-tint' : s === 'Viewing booked' ? 'b-green' : 'b-gray'}">${s}</span>`;
const scoreBadge = s => `<span class="o-badge ${s === 'Hot' ? 'b-red' : s === 'Warm' ? 'b-orange' : 'b-gray'}">${s}</span>`;
function leads() {
  const F = ['All', 'Hot', 'Warm', 'Cool', 'New'];
  const list = P.leads.filter(L => leadFilter === 'All' || L.score === leadFilter || L.status === leadFilter);
  const n = f => f === 'All' ? P.leads.length : P.leads.filter(L => L.score === f || L.status === f).length;
  body.innerHTML = `<div class="o-chips">${F.map(f => `<button class="o-chip" data-f="${f}" aria-pressed="${f === leadFilter}">${f} ${n(f)}</button>`).join('')}</div>
    ${list.length ? `<ul class="o-group" style="--inset:64px">${list.map((L, i) => `<li class="o-rise" style="--i:${i}"><button class="o-row" data-v="${L.vid}">
      <span class="o-av ${L.score}">${initials(L.name)}</span>
      <span class="o-main"><span class="o-sub" style="font-weight:600">${esc(L.name)}</span>
      <span class="o-fn o-l2">${L.ss.length} ${L.ss.length > 1 ? 'visits' : 'visit'} · ${fmt(L.st.total)} · ${NAME(L.st.byTime[0])}</span></span>
      <span class="o-trail" style="flex-direction:column;align-items:flex-end;gap:4px">${scoreBadge(L.score)}<span class="o-cap o-l3">${ago(L.last)}</span></span>
      <span class="o-chev">${icon('chev', 16)}</span></button></li>`).join('')}</ul>`
    : `<p class="o-sub o-l2" style="text-align:center;padding:32px 0">No leads in this group yet.</p>`}
    <p class="o-fn o-l3" style="margin:12px 4px 0">Hot: 3 or more visits, or 5 minutes in the tour. Warm: 2 minutes or more.</p>`;
  body.querySelectorAll('.o-chip').forEach(b => b.onclick = () => { leadFilter = b.dataset.f; leads(); });
  body.querySelectorAll('.o-row[data-v]').forEach(b => b.onclick = () => tab('lead', LEADS_ALL.find(L => L.vid === b.dataset.v)));
}
function lead(L) {
  const top = L.st.byTime.filter(id => L.st.time(id)).slice(0, 4);
  const points = [...new Set(L.st.byTime.slice(0, 3).flatMap(talk))].slice(0, 5);
  const when = t => new Date(t).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const stops = s => s.s.map(r => r[0]).filter((id, i, a) => id !== a[i - 1]);
  body.innerHTML = `<button class="o-backbtn">${icon('chevL', 20)}<span>Leads</span></button>
    <div class="o-card o-rise" style="--i:0">
      <div style="display:flex;gap:12px;align-items:center"><span class="o-av lg ${L.score}">${initials(L.name)}</span>
        <div class="o-main"><h3 class="o-t2" style="font-size:20px;line-height:25px">${esc(L.name)}</h3><span class="o-fn o-l2">${esc(L.email)}</span>
        <span style="display:flex;gap:6px;margin-top:4px">${scoreBadge(L.score)}<span id="st">${statusBadge(L.status)}</span></span></div></div>
      <p class="o-quote">${esc(L.message)}<span class="o-cap o-l3" style="display:block;margin-top:4px">Enquired ${ago(L.enquired).toLowerCase()}</span></p>
    </div>
    <div class="o-card o-stats o-rise" style="--i:1;margin-top:12px">
      <div><span class="o-fn o-l2">Visits</span><span class="o-hl o-num" data-c="${L.ss.length}">0</span></div>
      <div><span class="o-fn o-l2">In tour</span><span class="o-hl o-num" data-t="${L.st.total}">0s</span></div>
      <div><span class="o-fn o-l2">Last visit</span><span class="o-hl">${ago(L.last)}</span></div></div>
    <section class="o-sec" style="margin-top:24px"><div class="o-sec-head"><h3 class="o-hl">Visits</h3><span class="o-fn o-l2">Tap to replay</span></div>
      <ul class="o-group o-rise" style="--i:2">${L.ss.slice().reverse().map((s, i) => `<li><button class="o-row o-visit" data-s="${L.ss.length - 1 - i}">
        <span class="o-tile">${icon('play', 14)}</span>
        <span class="o-main"><span class="o-sub" style="font-weight:600">${when(s.t)}</span><span class="o-fn o-l2">${fmt(s.s.length)} · ${stops(s).length} spots</span>
        <span class="o-dots">${stops(s).map(() => '<i></i>').join('')}</span></span></button></li>`).join('')}</ul></section>
    <section class="o-sec"><div class="o-sec-head"><h3 class="o-hl">Where they spent time</h3></div>
      <div class="o-card o-rise" style="--i:3">${barList(top, id => fmt(L.st.time(id)), null, L.st.share)}</div></section>
    <section class="o-sec"><div class="o-sec-head"><h3 class="o-hl">Talking points</h3><span class="o-fn o-l2" id="tpN"></span></div>
      <ul class="o-group o-rise" style="--i:4;--inset:50px">${points.map((p, i) => `<li><button class="o-row" role="checkbox" data-p="${i}" aria-checked="${L.checked.has(i)}">
        <span class="o-check">${icon('tick', 12)}</span><span class="o-main o-sub">${p}</span></button></li>`).join('')}</ul>
      <p class="o-fn o-l3" style="margin:8px 4px 0">Based on tour visits from the browser they enquired from.</p></section>
    <div class="o-actions"><a class="o-btn o-filled" href="mailto:${L.email}?subject=${encodeURIComponent(T.title)}">Email</a>
      <button class="o-btn o-tinted" id="path">Path and heat</button><button class="o-btn o-gray" id="done"></button></div>`;
  countUp(body.querySelector('[data-c]'), L.ss.length, n => `${n}`);
  countUp(body.querySelector('[data-t]'), L.st.total, fmt);
  const tpN = () => body.querySelector('#tpN').textContent = `${L.checked.size} of ${points.length} covered`;
  tpN();
  body.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    const i = +b.dataset.p; L.checked.has(i) ? L.checked.delete(i) : L.checked.add(i);
    b.setAttribute('aria-checked', L.checked.has(i)); tpN();
  });
  const done = body.querySelector('#done');
  const setDone = () => { done.textContent = L.status === 'Contacted' ? 'Contacted' : 'Mark contacted'; body.querySelector('#st').innerHTML = statusBadge(L.status); };
  setDone();
  done.onclick = () => { L.prev ??= L.status; L.status = L.status === 'Contacted' ? L.prev : 'Contacted'; setDone(); toast(L.status === 'Contacted' ? `${L.name.split(' ')[0]} marked as contacted.` : 'Status restored.'); };
  body.querySelector('.o-backbtn').onclick = () => tab('leads');
  body.querySelector('#path').onclick = async () => {
    stopReplay(); filter = L.vid; await window.tour.go(top[0]); overlay();
    if (!heatOn) await setHeat(true); else await window.tour.reload();
    toast(`Showing ${L.name.split(' ')[0]}'s path and heat.`);
  };
  wireBars();
  body.querySelectorAll('.o-visit').forEach(b => b.onclick = () => playing?.btn === b ? stopReplay() : replay(L, L.ss[b.dataset.s], b));
}

// walks the 360 through one visit, spot by spot, facing where they looked
async function replay(L, s, btn) {
  stopReplay();
  const run = playing = { btn, stop: false };
  btn.dataset.playing = ''; btn.querySelector('.o-tile').innerHTML = icon('stop', 14);
  filter = L.vid;
  const seq = [];
  for (const r of s.s) { if (seq.at(-1)?.id !== r[0]) seq.push({ id: r[0], rows: [] }); seq.at(-1).rows.push(r); }
  overlay(seq.map(x => x.id));
  const dots = btn.querySelectorAll('.o-dots i');
  for (let i = 0; i < seq.length && !run.stop; i++) {
    dots.forEach((d, k) => d.classList.toggle('on', k <= i));
    await window.tour.go(seq[i].id);
    const r = seq[i].rows[Math.floor(seq[i].rows.length / 2)];
    if (run.stop) break;
    try { await window.tour.viewer.animate({ yaw: `${r[1]}deg`, pitch: `${r[2]}deg`, speed: '8rpm' }); } catch {}
    await new Promise(res => setTimeout(res, 900));
  }
  if (playing === run) stopReplay(true);
}
function stopReplay(finished) {
  if (!playing) return;
  playing.stop = true;
  const b = playing.btn; delete b.dataset.playing; b.querySelector('.o-tile').innerHTML = icon('play', 14);
  if (!finished) b.querySelectorAll('.o-dots i').forEach(d => d.classList.remove('on'));
  playing = null;
}

// ---------- spots ----------
// ---------- embed ----------
async function share() {
  const { embedPanel } = await import('./embed.js');
  const url = document.querySelector('link[rel=canonical]')?.href || location.origin + location.pathname;
  embedPanel(body, { name: T.title, url, preview: url.startsWith(location.origin) ? url : location.pathname });
}

function spots() {
  const M = {
    time: ['Time spent', id => pct(P.st.share(id)), P.st.share, 'Share of all viewing time.'],
    reach: ['Reached', id => pct(P.st.reach(id)), P.st.reach, 'Share of visits that got to the spot.'],
    exit: ['Left here', id => pct(P.st.exit(id)), P.st.exit, 'Share of visits that ended at the spot.'],
  };
  const [, val, get, hint] = M[spotMetric];
  const ids = P.st.ids.slice().sort((a, b) => get(b) - get(a));
  const deckName = id => T.decks.find(d => d.id === T.scenes[id].deck)?.label;
  body.innerHTML = `<div class="o-switch">${Object.entries(M).map(([k, [label, v, g]]) => {
      const best = P.st.ids.slice().sort((a, b) => g(b) - g(a))[0];
      return `<button data-m="${k}" aria-pressed="${k === spotMetric}"><span class="o-cap">${label}</span><strong>${v(best)}</strong><span class="o-cap" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">${NAME(best)}</span></button>`;
    }).join('')}</div>
    <div class="o-card o-rise">${barList(ids, val, id => `${deckName(id)} · ${spotMetric === 'time' ? `reached by ${pct(P.st.reach(id))}` : `${pct(P.st.share(id))} of time`}`, get)}</div>
    <p class="o-fn o-l3" style="margin:12px 4px 0">${hint} Hover a spot to find it on the plan, tap to go there.</p>`;
  body.querySelectorAll('.o-switch button').forEach(b => b.onclick = () => { spotMetric = b.dataset.m; spots(); });
  wireBars();
}

// ---------- seller report ----------
function report() {
  const top3 = P.st.byTime.slice(0, 3).map(NAME);
  const booked = P.leads.filter(l => l.status === 'Viewing booked').length;
  const range = R === 7 ? 'last 7 days' : 'last 30 days';
  const avg = fmt(P.kpi.avg);
  const text = `${T.title}: your virtual tour, ${range}\n\n${P.kpi.viewers} people toured your boat, ${avg} on average. ${P.leads.length} sent an enquiry and ${booked} booked a viewing.\n\nBuyers spent the most time at the ${top3.slice(0, 2).join(', ')} and ${top3[2]}.\n\nWhat we are doing next: starting the tour at the ${top3[0]}, using it as the cover photo, and following up with every buyer who came back more than once.`;
  const m = document.createElement('div'); m.className = 'o-modal';
  m.innerHTML = `<div class="o-sheet" role="dialog" aria-label="Seller report">
    <div class="o-head-row"><div><h2 class="o-t2">Your virtual tour</h2><p class="o-fn" style="color:#727279">${esc(T.title)} · ${range}</p></div><span class="o-badge b-orange" style="background:#fef0c7;color:#b54708">Mock data</span></div>
    <ul class="o-kpis">${[[P.kpi.viewers, 'People toured'], [P.leads.length, 'Enquiries'], [booked, 'Viewings booked']].map(([v, l]) => `<li class="o-kpi" style="background:#fff"><span class="o-kv">${v}</span><span class="o-fn" style="color:#727279">${l}</span></li>`).join('')}</ul>
    <p>Buyers spent the most time at the <b>${top3.slice(0, 2).join('</b>, <b>')}</b> and <b>${top3[2]}</b>, ${avg} per visit on average.</p>
    <p style="margin-top:12px"><b>What we are doing next:</b> starting the tour at the ${top3[0]}, using it as the cover photo, and following up with every buyer who came back more than once.</p>
    <div style="display:flex;gap:8px;margin-top:20px"><button class="o-btn o-filled" id="cp" style="flex:1;background:#4b0ea3;color:#fff">Copy text</button><button class="o-btn o-gray" id="cl" style="flex:1;background:rgba(118,118,128,.12)">Close</button></div></div>`;
  document.body.appendChild(m);
  m.onclick = e => e.target === m && m.remove();
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#cp').onclick = async () => { await navigator.clipboard.writeText(text); toast('Copied. Paste it into your email to the seller.'); };
}

tab('ins');
export async function toggle(on) {
  if (!on) { stopReplay(); filter = null; hl(null); if (heatOn) await setHeat(false); }
  overlay();
}
