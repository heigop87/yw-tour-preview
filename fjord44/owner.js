// Owner view: tour analytics as plain-language actions, leads with talking points, heat on the 360.
// Prototype reads mock-analytics.json; production reads the listing's sessions and leads from the API.
const { T, viewer } = window.tour;
const D = await (await fetch('mock-analytics.json')).json();
const NAME = id => T.scenes[id].name;
const fmt = s => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;
const ago = t => { const h = (D.now - t) / 3600000; return h < 1 ? 'just now' : h < 24 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`; };
const pct = x => Math.round(x * 100) + '%';

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
  const ids = Object.keys(T.scenes);
  return { total, sessions: sessions.length, ids,
    time: id => time[id] || 0, share: id => (time[id] || 0) / Math.max(1, total),
    reach: id => (reach[id] || 0) / Math.max(1, sessions.length), exit: id => (exit[id] || 0) / Math.max(1, sessions.length),
    byTime: ids.slice().sort((a, b) => (time[b] || 0) - (time[a] || 0)) };
}
const ALL = stats(D.sessions);
const byVid = {};
for (const s of D.sessions) (byVid[s.vid] ||= []).push(s);
const viewers = Object.keys(byVid).length;
const leadVids = new Set(D.leads.map(l => l.vid));
const returning = Object.entries(byVid).filter(([v, ss]) => ss.length > 1 && !leadVids.has(v));

function leadInfo(L) {
  const ss = byVid[L.vid] || [], st = stats(ss);
  const score = ss.length >= 3 || st.total >= 300 ? 'Hot' : st.total >= 120 ? 'Warm' : 'Cool';
  return { ...L, ss, st, score, last: Math.max(...ss.map(s => s.t)) };
}
const LEADS = D.leads.map(leadInfo).sort((a, b) => ({ Hot: 0, Warm: 1, Cool: 2 }[a.score] - { Hot: 0, Warm: 1, Cool: 2 }[b.score]) || b.last - a.last);

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
let heatOn = false, filter = null;  // filter: lead vid, or null for everyone
const heatCache = {};
const RAMP = [[0, [84, 13, 163, 0]], [.12, [84, 13, 163, 0]], [.3, [84, 13, 163, 100]], [.5, [181, 23, 158, 150]], [.7, [247, 127, 0, 170]], [1, [253, 224, 71, 190]]];
const color = v => { for (let i = 1; i < RAMP.length; i++) if (v <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (v - a) / (b - a); return ca.map((c, k) => c + (cb[k] - c) * t); } return RAMP.at(-1)[1]; };
function samples(id) {
  const out = [];
  for (const s of filter ? byVid[filter] : D.sessions) for (const r of s.s) if (r[0] === id) out.push(r);
  return out;
}
async function heatUrl(id) {
  const key = id + '|' + (filter || '*');
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
  document.getElementById('heatT').classList.toggle('on', on);
  window.tour.setPanoFor(id => heatOn ? heatUrl(id) : 'pano/' + T.scenes[id].file);
  await window.tour.reload();
}

// ---------- deck overlay: time share labels and a lead's path ----------
function overlay() {
  const plan = document.getElementById('plan');
  plan.querySelectorAll('.o-lbl,.o-path').forEach(e => e.remove());
  if (!document.body.classList.contains('owner')) return;
  const deckId = window.tour.deck, d = T.decks.find(d => d.id === deckId);
  const st = filter ? stats(byVid[filter]) : ALL;
  for (const s of Object.values(T.scenes)) {
    if (s.deck !== deckId) continue;
    const l = document.createElement('span'); l.className = 'o-lbl';
    l.style.left = s.map[0] / d.w * 100 + '%'; l.style.top = s.map[1] / d.h * 100 + '%';
    l.textContent = pct(st.share(s.id));
    plan.appendChild(l);
  }
  if (!filter) return;
  const pts = [];
  for (const sess of byVid[filter].slice().sort((a, b) => a.t - b.t)) for (const [id] of sess.s) if (pts.at(-1) !== id) pts.push(id);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'o-path'); svg.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`); svg.setAttribute('preserveAspectRatio', 'none');
  let path = '';
  for (let i = 1; i < pts.length; i++) {
    const a = T.scenes[pts[i - 1]], b = T.scenes[pts[i]];
    if (a.deck === deckId && b.deck === deckId) path += `M${a.map[0]} ${a.map[1]}L${b.map[0]} ${b.map[1]}`;
  }
  svg.innerHTML = `<path d="${path}" fill="none" stroke="#fde047" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 10" vector-effect="non-scaling-stroke" opacity=".9"/>`;
  plan.insertBefore(svg, plan.querySelector('.pin'));
}
addEventListener('tour:deck', () => setTimeout(overlay));

// ---------- panel ----------
const css = document.createElement('style');
css.textContent = `
#owner{position:fixed;top:0;right:0;bottom:0;width:420px;z-index:15;background:rgba(14,14,17,.9);backdrop-filter:blur(18px);border-left:1px solid rgba(255,255,255,.08);display:none;flex-direction:column;font-family:Figtree,sans-serif;color:#fff}
body.owner #owner{display:flex}
#owner header{padding:20px 20px 0}
#owner h2{font:600 17px Poppins,sans-serif;margin:0}
#owner .sub{display:flex;gap:6px;margin-top:8px}
.chip{font:500 11px Figtree,sans-serif;padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.1);color:#d4d4d8}
.chip.mock{background:rgba(251,191,36,.15);color:#fbbf24}
.chip.Hot{background:rgba(247,127,0,.2);color:#fdba74}.chip.Warm{background:rgba(253,224,71,.15);color:#fde047}.chip.Cool{background:rgba(255,255,255,.08);color:#a1a1aa}
.otabs{display:flex;gap:18px;padding:0 20px;margin-top:16px;border-bottom:1px solid rgba(255,255,255,.08)}
.otabs button{background:none;border:0;color:#a1a1aa;font:500 14px Figtree,sans-serif;padding:10px 0;cursor:pointer;border-bottom:2px solid transparent}
.otabs button.on{color:#fff;border-color:#fff}
#obody{flex:1;overflow:auto;padding:16px 20px 20px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
.kpi{background:rgba(255,255,255,.05);border-radius:10px;padding:10px}
.kpi b{display:block;font:600 18px Poppins,sans-serif}.kpi span{font-size:11px;color:#a1a1aa}
.ins{background:rgba(255,255,255,.05);border-radius:12px;padding:14px;margin-bottom:10px}
.ins h3{font:600 14px Figtree,sans-serif;margin:0 0 4px}
.ins p{font-size:13px;color:#a1a1aa;margin:0 0 10px;line-height:1.45}
.ins .tag{font-size:11px;color:#a1a1aa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.btn{font:500 13px Figtree,sans-serif;border:0;border-radius:8px;padding:7px 12px;cursor:pointer;background:#fff;color:#111}
.btn.ghost{background:rgba(255,255,255,.08);color:#fff}
.row{display:flex;gap:8px;flex-wrap:wrap}
.lead{display:block;width:100%;text-align:left;background:rgba(255,255,255,.05);border:0;border-radius:12px;padding:12px 14px;margin-bottom:8px;color:#fff;cursor:pointer;font-family:Figtree,sans-serif}
.lead:hover{background:rgba(255,255,255,.09)}
.lead .top1{display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:14px}
.lead .meta{font-size:12px;color:#a1a1aa;margin-top:4px}
.bar{display:grid;grid-template-columns:110px 1fr 44px;align-items:center;gap:10px;font-size:13px;margin:7px 0}
.bar i{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,.08)}.bar i b{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#b5179e,#f77f00)}
.bar span:last-child{text-align:right;color:#a1a1aa}
.spotrow{display:grid;grid-template-columns:1fr 54px 54px 54px;gap:6px;font-size:13px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer}
.spotrow.h{color:#a1a1aa;font-size:11px;cursor:default;text-transform:uppercase;letter-spacing:.05em}
.spotrow span:not(:first-child){text-align:right}
.quote{font-size:13px;color:#d4d4d8;background:rgba(255,255,255,.05);border-left:2px solid #fde047;padding:8px 10px;border-radius:0 8px 8px 0;margin:8px 0 14px}
.sec{font:600 12px Figtree,sans-serif;color:#a1a1aa;text-transform:uppercase;letter-spacing:.06em;margin:18px 0 6px}
ul.tp{margin:0;padding-left:18px;font-size:13px;line-height:1.7}
.back{background:none;border:0;color:#a1a1aa;font:500 13px Figtree,sans-serif;cursor:pointer;padding:0;margin-bottom:12px}
#owner footer{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-top:1px solid rgba(255,255,255,.08);font-size:13px}
.sw{width:38px;height:22px;border-radius:999px;background:rgba(255,255,255,.15);border:0;position:relative;cursor:pointer}
.sw::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}
.sw.on{background:var(--primary)}.sw.on::after{left:19px}
.legend{display:flex;align-items:center;gap:6px;color:#a1a1aa;font-size:11px}.legend i{width:60px;height:6px;border-radius:3px;background:linear-gradient(90deg,rgba(84,13,163,.6),#b5179e,#f77f00,#fde047)}
.o-lbl{position:absolute;z-index:3;transform:translate(10px,-50%);font:600 10px Figtree,sans-serif;background:#111;color:#fde047;padding:1px 5px;border-radius:4px;pointer-events:none}
.o-path{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1}
.toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:30;background:#fff;color:#111;font:500 13px Figtree,sans-serif;padding:10px 14px;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.4)}
.modal{position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.6);display:grid;place-items:center}
.modal .card{width:min(520px,92vw);max-height:86vh;overflow:auto;background:#fff;color:#111;border-radius:16px;padding:24px;font-family:Figtree,sans-serif}
.modal h2{font:600 18px Poppins,sans-serif;margin:0 0 4px}.modal p{font-size:14px;line-height:1.55;color:#3f3f46}
.modal .big{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0}.modal .big div{background:#f4f4f5;border-radius:10px;padding:12px}
.modal .big b{display:block;font:600 22px Poppins,sans-serif}.modal .big span{font-size:12px;color:#71717a}
.modal .btn{background:var(--primary);color:#fff}.modal .btn.ghost{background:#f4f4f5;color:#111}
@media (max-width:640px){#owner{top:auto;width:100%;height:56vh;border-left:0;border-top:1px solid rgba(255,255,255,.08);border-radius:16px 16px 0 0}body.owner .top{right:12px}body.owner #map{display:none}body.owner .brand{display:none}.kpis{grid-template-columns:repeat(2,1fr)}}
`;
document.head.appendChild(css);
const el = document.createElement('aside'); el.id = 'owner';
el.innerHTML = `<header><h2>Tour insights</h2><div class="sub"><span class="chip">${D.range}</span><span class="chip mock">Mock data</span></div></header>
<nav class="otabs"><button data-t="ins" class="on">Insights</button><button data-t="leads">Leads <span class="chip">${LEADS.length}</span></button><button data-t="spots">Spots</button></nav>
<div id="obody"></div>
<footer><span class="legend">Heat on 360 <i></i></span><button class="sw" id="heatT" aria-label="Heat on 360"></button></footer>`;
document.body.appendChild(el);
const body = el.querySelector('#obody');
el.querySelectorAll('.otabs button').forEach(b => b.onclick = () => tab(b.dataset.t));
el.querySelector('#heatT').onclick = () => setHeat(!heatOn);

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function tab(t, arg) {
  el.querySelectorAll('.otabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  if (t !== 'lead' && filter) { filter = null; overlay(); if (heatOn) window.tour.reload(); }
  ({ ins: insights, leads, spots, lead })[t](arg);
  body.scrollTop = 0;
}

// ---------- insights ----------
function insights() {
  const top = ALL.byTime[0], first = T.first;
  const exitFirst = ALL.exit(first);
  const low = ALL.ids.filter(id => id !== first).sort((a, b) => ALL.reach(a) - ALL.reach(b))[0];
  const hot = LEADS.filter(l => l.score === 'Hot' && l.status === 'New');
  const retTop = stats(returning.flatMap(([, ss]) => ss)).byTime[0];
  const cards = [];
  if (hot.length) cards.push({ tag: 'Leads', h: `${hot.length} hot leads are waiting for a call`,
    p: `${hot[0].name} toured ${hot[0].ss.length} times and spent most time at the ${NAME(hot[0].st.byTime[0])}.`,
    a: [['Open leads', () => tab('leads')]] });
  cards.push({ tag: 'Tour', h: `${pct(exitFirst)} of viewers leave at the ${NAME(first)}`,
    p: `It is the first spot. Only ${pct(ALL.reach(top))} reach the ${NAME(top)}, where buyers spend the most time.`,
    a: [[`Start the tour at the ${NAME(top)}`, () => toast(`Mock: new visitors would start at the ${NAME(top)}.`)]] });
  cards.push({ tag: 'Tour', h: `Only ${pct(ALL.reach(low))} of viewers reach the ${NAME(low)}`,
    p: `Buyers may not know it is there. Add a link to it from a busier spot, or mention it in the listing.`,
    a: [['Show me', () => window.tour.go(low)]] });
  if (returning.length) cards.push({ tag: 'Visitors', h: `${returning.length} people came back 2 or more times but did not enquire`,
    p: `They spent most time at the ${NAME(retTop)}. A prompt on their next visit can turn them into leads.`,
    a: [['Show "Book a viewing" on return visits', () => toast('Mock: return visitors would see a "Book a viewing" prompt.')]] });
  cards.push({ tag: 'Listing', h: `The ${NAME(top)} holds attention longest`,
    p: `${pct(ALL.share(top))} of all viewing time. Use it as the cover photo and lead the description with it.`,
    a: [['Show heat', async () => { await window.tour.go(top); setHeat(true); }]] });
  cards.push({ tag: 'Seller', h: `${viewers} people toured this boat`,
    p: `Send the seller a short report on interest and what you are changing.`,
    a: [['Preview seller report', report]] });
  body.innerHTML = `<div class="kpis">
    <div class="kpi"><b>${viewers}</b><span>Viewers</span></div>
    <div class="kpi"><b>${fmt(Math.round(ALL.total / ALL.sessions))}</b><span>Avg visit</span></div>
    <div class="kpi"><b>${returning.length + LEADS.filter(l => l.ss.length > 1).length}</b><span>Came back</span></div>
    <div class="kpi"><b>${LEADS.length}</b><span>Enquiries</span></div></div>`;
  for (const c of cards) {
    const d = document.createElement('div'); d.className = 'ins';
    d.innerHTML = `<div class="tag">${c.tag}</div><h3>${c.h}</h3><p>${c.p}</p><div class="row"></div>`;
    c.a.forEach(([label, fn], i) => { const b = document.createElement('button'); b.className = 'btn' + (i ? ' ghost' : ''); b.textContent = label; b.onclick = fn; d.querySelector('.row').appendChild(b); });
    body.appendChild(d);
  }
}

// ---------- leads ----------
function leads() {
  body.innerHTML = '';
  for (const L of LEADS) {
    const b = document.createElement('button'); b.className = 'lead';
    b.innerHTML = `<div class="top1"><span>${L.name}</span><span class="chip ${L.score}">${L.score}</span></div>
      <div class="meta">${L.ss.length} ${L.ss.length > 1 ? 'visits' : 'visit'} · ${fmt(L.st.total)} in tour · ${L.status}</div>
      <div class="meta">Most time: ${L.st.byTime.slice(0, 2).map(NAME).join(', ')} · last seen ${ago(L.last)}</div>`;
    b.onclick = () => tab('lead', L);
    body.appendChild(b);
  }
}
function lead(L) {
  el.querySelectorAll('.otabs button').forEach(b => b.classList.toggle('on', b.dataset.t === 'leads'));
  const top = L.st.byTime.filter(id => L.st.time(id)).slice(0, 5);
  const points = [...new Set(L.st.byTime.slice(0, 3).flatMap(talk))].slice(0, 5);
  body.innerHTML = `<button class="back">← All leads</button>
    <div class="lead" style="cursor:default"><div class="top1"><span>${L.name}</span><span class="chip ${L.score}">${L.score}</span></div>
    <div class="meta">${L.email} · ${L.status} · enquired ${ago(L.enquired)}</div></div>
    <div class="quote">"${L.message}"</div>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr)"><div class="kpi"><b>${L.ss.length}</b><span>Visits</span></div><div class="kpi"><b>${fmt(L.st.total)}</b><span>In tour</span></div><div class="kpi"><b>${ago(L.last).replace(' ago', '')}</b><span>Last visit</span></div></div>
    <div class="sec">Where they spent time</div>
    ${top.map(id => `<div class="bar"><span>${NAME(id)}</span><i><b style="width:${pct(L.st.share(id) / L.st.share(top[0]))}"></b></i><span>${fmt(L.st.time(id))}</span></div>`).join('')}
    <div class="sec">Talking points for the call</div>
    <ul class="tp">${points.map(p => `<li>${p}</li>`).join('')}</ul>
    <div class="sec">Next step</div>
    <div class="row"><button class="btn" id="path">Show their path</button><a class="btn ghost" style="text-decoration:none" href="mailto:${L.email}?subject=${encodeURIComponent(T.title)}">Email</a><button class="btn ghost" id="done">Mark contacted</button></div>
    <p style="font-size:12px;color:#71717a;margin-top:14px">Based on tour visits from the browser they enquired from.</p>`;
  body.querySelector('.back').onclick = () => tab('leads');
  body.querySelector('#done').onclick = () => { L.status = 'Contacted'; toast(`Mock: ${L.name} marked as contacted.`); };
  body.querySelector('#path').onclick = async () => {
    filter = L.vid;
    await window.tour.go(top[0]);
    overlay();
    if (!heatOn) await setHeat(true); else await window.tour.reload();
    toast(`Showing ${L.name.split(' ')[0]}'s path and heat.`);
  };
}

// ---------- spots ----------
function spots() {
  body.innerHTML = `<div class="spotrow h"><span>Spot</span><span>Time</span><span>Reach</span><span>Leave</span></div>` +
    ALL.byTime.map(id => `<div class="spotrow" data-id="${id}"><span>${NAME(id)}</span><span>${pct(ALL.share(id))}</span><span>${pct(ALL.reach(id))}</span><span>${pct(ALL.exit(id))}</span></div>`).join('') +
    `<p style="font-size:12px;color:#71717a;margin-top:12px">Time: share of all viewing time. Reach: share of visits that got there. Leave: share of visits that ended there.</p>`;
  body.querySelectorAll('.spotrow[data-id]').forEach(r => r.onclick = () => window.tour.go(r.dataset.id));
}

// ---------- seller report ----------
function report() {
  const top3 = ALL.byTime.slice(0, 3).map(NAME);
  const booked = LEADS.filter(l => l.status === 'Viewing booked').length;
  const m = document.createElement('div'); m.className = 'modal';
  const text = `${T.title}: your virtual tour, ${D.range.toLowerCase()}\n\n${viewers} people toured your boat, ${fmt(Math.round(ALL.total / ALL.sessions))} on average. ${LEADS.length} sent an enquiry and ${booked} booked a viewing.\n\nBuyers spent the most time at the ${top3.slice(0, 2).join(', ')} and ${top3[2]}.\n\nWhat we are doing next: starting the tour at the ${top3[0]}, using it as the cover photo, and following up with every buyer who came back more than once.`;
  m.innerHTML = `<div class="card"><h2>${T.title}: your virtual tour</h2><p style="margin:0;color:#71717a">${D.range}</p>
    <div class="big"><div><b>${viewers}</b><span>People toured</span></div><div><b>${LEADS.length}</b><span>Enquiries</span></div><div><b>${booked}</b><span>Viewings booked</span></div></div>
    <p>Buyers spent the most time at the <b>${top3.slice(0, 2).join('</b>, <b>')}</b> and <b>${top3[2]}</b>, ${fmt(Math.round(ALL.total / ALL.sessions))} per visit on average.</p>
    <p><b>What we are doing next:</b> starting the tour at the ${top3[0]}, using it as the cover photo, and following up with every buyer who came back more than once.</p>
    <div class="row" style="margin-top:18px"><button class="btn" id="cp">Copy text</button><button class="btn ghost" id="cl">Close</button></div></div>`;
  document.body.appendChild(m);
  m.onclick = e => e.target === m && m.remove();
  m.querySelector('#cl').onclick = () => m.remove();
  m.querySelector('#cp').onclick = async () => { await navigator.clipboard.writeText(text); toast('Copied. Paste it into your email to the seller.'); };
}

tab('ins');
export async function toggle(on) {
  if (!on) { filter = null; if (heatOn) await setHeat(false); }
  overlay();
}
