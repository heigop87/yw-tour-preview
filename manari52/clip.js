// Make a clip: a short video of chosen spots for Reels, TikTok, Shorts or a post, made in the browser.
// A second, hidden viewer turns slowly through each spot; its frames are drawn onto a canvas with the room name, the logo
// and an end card with the tour link, and the canvas is recorded in real time. Nothing is uploaded.
import { Viewer } from '@photo-sphere-viewer/core';

const FORMATS = { tall: { size: [1080, 1920], label: 'Vertical 9:16', note: 'Reels, TikTok, Shorts, Stories', fov: [92, 74], planet: 128, top: 170, bottom: 300 },
                  wide: { size: [1920, 1080], label: 'Wide 16:9', note: 'YouTube, Facebook, X, LinkedIn', fov: [70, 56], planet: 130, top: 44, bottom: 62 } };
// intro: tiny planet that unrolls into the first room; then fast cuts joined by whip pans; outro: back out to the planet
const INTRO = 2100, CUT = 1300, WHIP = 170, OUTRO = 3000, MAX = 8, MINF = 30, MAXF = 160;
const HOOKS = ['Rate this boat from 1 to 10', 'POV: your weekend on a {boat}', 'Which room would you take?', 'Walk through a {boat} in 10 seconds'];
const css = document.createElement('style');
css.textContent = `
.yc-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.yc-chip{min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--fill);color:var(--label);font:500 14px Figtree,sans-serif;cursor:pointer}
.yc-chip.on,.yc-fmt .ye-btn.on{background:var(--label);color:#fff}
.yc-fmt{display:flex;gap:8px;margin:0 0 12px}.yc-fmt .ye-btn{background:var(--fill);color:var(--label);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px}
.yc-fmt small{font:400 12px Figtree,sans-serif;opacity:.8}
.yc-stage{display:flex;justify-content:center;background:#000;border-radius:12px;overflow:hidden;margin:0 0 12px}
.yc-stage canvas,.yc-stage video{display:block;max-width:100%;max-height:60vh}
.yc-lbl{display:block;font:600 13px Figtree,sans-serif;color:var(--label2);margin:0 0 6px}
.yc-hook{width:100%;box-sizing:border-box;min-height:44px;padding:0 14px;border:0;border-radius:10px;font:500 16px Figtree,sans-serif;margin:0 0 8px;background:var(--fill);color:var(--label)}
.yc-bar{height:4px;border-radius:2px;background:var(--fill);margin:0 0 12px;overflow:hidden}.yc-bar i{display:block;height:100%;width:0;background:var(--tint)}`;
document.head.appendChild(css);

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const img = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
const frame = () => new Promise(r => requestAnimationFrame(r));
const ease = t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
const mimeType = () => ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m));
export const clipSupported = () => !!(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && mimeType());

// top and bottom keep the logo and room name clear of the app buttons and captions (in 720 px units)
// one spot per room name, in tour order
function defaultSpots(T) {
  const seen = new Set(), out = [];
  for (const s of Object.values(T.scenes)) if (!seen.has(s.name)) { seen.add(s.name); out.push(s.id); }
  return out.slice(0, 6);
}

// where to point the camera: along the boat toward its middle, so the shot shows the boat and not the dock.
// Below deck it looks the other way, toward the hull ends where the berths are.
// Plan bearing 0 is the bow; a spot near the middle looks forward. Same conversion as arrivalYaw in index.html.
function aimYaw(T, s) {
  const d = T.decks.find(d => d.id === s.deck);
  if (!d || !s.map) return (s.links[0]?.yaw ?? 0) * Math.PI / 180;
  const dx = d.w / 2 - s.map[0], dy = d.h / 2 - s.map[1];
  const below = +s.deck < 0, deg = Math.hypot(dx, dy) < d.h * .15 ? 0 : Math.atan2(below ? -dx : dx, below ? dy : -dy) * 180 / Math.PI;
  return (deg + s.rot - (d.mapYaw ?? 97)) * Math.PI / 180;
}

async function record({ T, ids, format, url, hook, stage, onProgress }) {
  const F = FORMATS[format], [W, H] = F.size, dpr = devicePixelRatio || 1;
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-20000px', top: '0', width: W / dpr + 'px', height: H / dpr + 'px' });
  document.body.appendChild(box);
  const [logo] = await Promise.all([img('logo.svg'), document.fonts.load('700 64px Poppins'), document.fonts.load('600 48px Poppins'), document.fonts.load('500 28px Figtree'),
    ...ids.map(id => fetch('pano/' + T.scenes[id].file).catch(() => {}))]);
  const lvl = fov => (MAXF - fov) / (MAXF - MINF) * 100;
  const v = new Viewer({ container: box, panorama: 'pano/' + T.scenes[ids[0]].file, navbar: false, loadingTxt: '', minFov: MINF, maxFov: MAXF,
    defaultZoomLvl: lvl(F.planet), fisheye: 2, defaultPitch: -Math.PI / 2, rendererParameters: { preserveDrawingBuffer: true, antialias: true } });
  await new Promise(r => v.addEventListener('ready', r, { once: true }));
  const src = box.querySelector('canvas');
  // one camera state for every shot: pitch, field of view, fisheye (0 = normal, 2 = tiny planet)
  const cam = (yaw, pitch, fov, fish) => { v.setOption('fisheye', fish); v.zoom(lvl(fov)); v.rotate({ yaw, pitch }); };

  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const raw = document.createElement('canvas'); raw.width = W; raw.height = H;
  const ctx = out.getContext('2d'), rc = raw.getContext('2d');
  stage.replaceChildren(out);

  const type = mimeType(), chunks = [];
  const rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 14e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);

  const u = Math.min(W, H) / 720;
  const host = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shade = (y0, y1, a0, a1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(0,0,0,${a0})`); g.addColorStop(1, `rgba(0,0,0,${a1})`); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0)); };
  const logoW = 130 * u, logoH = logoW * logo.height / logo.width;
  const pop = t => t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;  // ease-out with a small overshoot

  // camera frame onto the canvas; blur > 0 smears it sideways like a fast pan
  function grab(blur = 0) {
    rc.drawImage(src, 0, 0, W, H);
    if (blur < .02) return ctx.drawImage(raw, 0, 0);
    ctx.drawImage(raw, 0, 0);
    const n = 6, d = blur * 90 * u;
    for (let k = 1; k <= n; k++) { ctx.globalAlpha = .5 / k * 1.6; ctx.drawImage(raw, d * k / n, 0); ctx.drawImage(raw, -d * k / n, 0); }
    ctx.globalAlpha = 1;
  }
  // the hook: big words in a white box, the way creators caption their own videos
  function hookCard(t, a) {
    if (!hook || a <= 0) return;
    const s = pop(t / 380), size = 64 * u, pad = 26 * u, maxW = W - 120 * u;
    ctx.font = `700 ${size}px Poppins`;
    const words = hook.split(/\s+/), lines = [];
    for (const w of words) { const l = lines.at(-1); l && ctx.measureText(l + ' ' + w).width <= maxW - pad * 2 ? lines[lines.length - 1] = l + ' ' + w : lines.push(w); }
    const lh = size * 1.18, bw = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2, bh = lines.length * lh + pad * 1.4;
    const cy = format === 'tall' ? H * .3 : H * .26;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, cy); ctx.scale(s, s); ctx.rotate(-.02);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 18 * u); ctx.fill();
    ctx.fillStyle = '#101014'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, 0, (i - (lines.length - 1) / 2) * lh));
    ctx.restore();
  }
  function label(name, t) {
    shade(H, H - (F.bottom + 220) * u, .6, 0); shade(0, (F.top + 120) * u, .35, 0);
    ctx.drawImage(logo, 40 * u, F.top * u, logoW, logoH);
    const k = pop(t / 260);
    ctx.save(); ctx.globalAlpha = Math.min(1, t / 160); ctx.translate(0, (1 - k) * 40 * u);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    ctx.font = `600 ${50 * u}px Poppins`; ctx.fillText(name, 40 * u, H - F.bottom * u);
    ctx.globalAlpha *= .8; ctx.font = `500 ${24 * u}px Figtree`; ctx.fillText(T.title, 40 * u, H - (F.bottom + 62) * u);
    ctx.restore();
  }
  async function play(ms, draw) {
    const t0 = performance.now();
    for (let t = 0; t < ms; t = performance.now() - t0) { draw(t, t / ms); onProgress((elapsed + t) / total); await frame(); }
    elapsed += ms;
  }

  const total = INTRO + ids.length * CUT + OUTRO, [f0, f1] = F.fov;
  let elapsed = 0;
  const yawOf = id => aimYaw(T, T.scenes[id]);

  // intro: the first room as a spinning tiny planet with the hook, then it unrolls into the room
  const y0 = yawOf(ids[0]);
  cam(y0 - 1.6, -Math.PI / 2, F.planet, 2); await frame(); await frame(); rec.start(250);
  await play(INTRO, (t, p) => {
    const un = ease(Math.max(0, (p - .38) / .62));
    cam(y0 - 1.6 * (1 - ease(p)), -Math.PI / 2 * (1 - un) - .14 * un, F.planet + (f0 - F.planet) * un, 2 * (1 - un) ** 1.5);
    grab();
    hookCard(t, 1);
  });

  // rooms: a slow push-in, then a whip pan out; the next room whips in from the same direction
  for (const [i, id] of ids.entries()) {
    const y = yawOf(id), drift = .22;
    if (i) {
      rec.pause();
      await v.setPanorama('pano/' + T.scenes[id].file, { transition: false, showLoader: false });
      cam(y - 1, -.14, f0, 0); await frame(); await frame(); rec.resume();
    }
    const last = i === ids.length - 1;
    await play(CUT, (t, p) => {
      const inn = i ? Math.max(0, 1 - t / WHIP) : 0, out = last ? 0 : Math.max(0, (t - (CUT - WHIP)) / WHIP);
      cam(y - drift / 2 + drift * p - inn ** 2 * 1 + out ** 2 * 1, -.14, f0 + (f1 - f0) * ease(p), 0);
      grab(Math.max(inn, out));
      label(T.scenes[id].name, i ? t : t + 400);
      if (!i) hookCard(t + INTRO, Math.max(0, 1 - t / 500));  // the hook stays up a beat into the first room, then fades
    });
  }

  // outro: pull back out to the planet and spin, with where to take the tour
  const yl = yawOf(ids.at(-1)) + .11;
  await play(OUTRO, (t, p) => {
    const k = ease(Math.min(1, p / .45));
    cam(yl + 2.2 * ease(p), -.14 * (1 - k) - Math.PI / 2 * k, f1 + (F.planet - f1) * k, 2 * k ** .7);
    grab();
    const c = Math.min(1, Math.max(0, (p - .35) / .25));
    if (c <= 0) return;
    ctx.fillStyle = `rgba(10,10,14,${.55 * c})`; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.globalAlpha = c; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    const s = pop((t - OUTRO * .35) / 380); ctx.translate(W / 2, H / 2); ctx.scale(s, s);
    const lw = 240 * u, lh = lw * logo.height / logo.width;
    ctx.drawImage(logo, -lw / 2, -150 * u - lh, lw, lh);
    ctx.font = `700 ${60 * u}px Poppins`; ctx.fillText(T.title, 0, 0);
    ctx.font = `500 ${30 * u}px Figtree`; ctx.fillText('Take the full 360 tour', 0, 60 * u);
    ctx.globalAlpha = c * .8; ctx.font = `400 ${24 * u}px Figtree`; ctx.fillText(host, 0, 104 * u);
    ctx.restore();
  });
  rec.stop(); await done;
  v.destroy(); box.remove();
  return new Blob(chunks, { type: type.split(';')[0] });
}

export function clipPanel(el, { T, url }) {
  if (!clipSupported()) return;
  let format = 'tall', picked = defaultSpots(T), busy = false;
  const hooks = HOOKS.map(h => h.replace('{boat}', T.title)); let hook = hooks[0];
  const names = new Map(); for (const s of Object.values(T.scenes)) names.has(s.name) || names.set(s.name, s.id);
  const render = () => {
    el.innerHTML = `<div class="ye"><section><h3>Make a clip</h3>
      <p>A 10 to 15 second video for Reels, TikTok or Shorts. Add trending audio in the app before you post.</p>
      <div class="yc-fmt">${Object.entries(FORMATS).map(([k, f]) => `<button class="ye-btn${k === format ? ' on' : ''}" data-f="${k}">${f.label}<small>${f.note}</small></button>`).join('')}</div>
      <label class="yc-lbl">Opening line</label>
      <input class="yc-hook" maxlength="60" value="${esc(hook)}">
      <div class="yc-chips">${hooks.map(h => `<button class="yc-chip${h === hook ? ' on' : ''}" data-h="${esc(h)}">${esc(h)}</button>`).join('')}</div>
      <label class="yc-lbl">Rooms</label>
      <div class="yc-chips">${[...names].map(([n, id]) => `<button class="yc-chip${picked.includes(id) ? ' on' : ''}" data-id="${id}">${esc(n)}</button>`).join('')}</div>
      <p class="yc-len">${picked.length} rooms, about ${Math.round((INTRO + picked.length * CUT + OUTRO) / 1000)} seconds. Up to ${MAX} rooms.</p>
      <div class="yc-stage" hidden></div><div class="yc-bar" hidden><i></i></div>
      <div class="ye-row yc-act"><button class="ye-btn f" data-go ${picked.length ? '' : 'disabled'}>Make clip</button></div></section></div>`;
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { format = b.dataset.f; render(); });
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      picked = picked.includes(id) ? picked.filter(x => x !== id) : picked.length < MAX ? [...picked, id] : picked;
      picked.sort((a, b) => Object.keys(T.scenes).indexOf(a) - Object.keys(T.scenes).indexOf(b));
      render();
    });
    el.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { hook = b.dataset.h; render(); });
    el.querySelector('.yc-hook').oninput = e => { hook = e.target.value; el.querySelectorAll('[data-h]').forEach(b => b.classList.toggle('on', b.dataset.h === hook)); };
    el.querySelector('[data-go]').onclick = make;
  };
  async function make() {
    if (busy) return; busy = true;
    const stage = el.querySelector('.yc-stage'), bar = el.querySelector('.yc-bar'), act = el.querySelector('.yc-act');
    el.querySelectorAll('.yc-fmt button,.yc-chip,.yc-hook').forEach(b => b.disabled = true);
    stage.hidden = bar.hidden = false;
    act.innerHTML = '<button class="ye-btn" disabled>Making your clip. Keep this page open.</button>';
    const blob = await record({ T, ids: picked, format, url, hook: hook.trim(), stage, onProgress: p => bar.firstChild.style.width = (p * 100).toFixed(1) + '%' });
    busy = false; bar.hidden = true;
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = `${T.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-360-tour.${ext}`;
    const file = new File([blob], name, { type: blob.type }), href = URL.createObjectURL(blob);
    const vid = document.createElement('video'); Object.assign(vid, { src: href, controls: true, loop: true, muted: true, playsInline: true, autoplay: true });
    stage.replaceChildren(vid);
    const canShare = navigator.canShare?.({ files: [file] });
    act.innerHTML = `${canShare ? '<button class="ye-btn f" data-s>Share</button>' : ''}<a class="ye-btn${canShare ? '' : ' f'}" style="display:flex;align-items:center;justify-content:center;text-decoration:none" href="${href}" download="${name}">Download</a><button class="ye-btn" data-again>Make another</button>`;
    act.querySelector('[data-s]')?.addEventListener('click', () => navigator.share({ files: [file], title: T.title, text: `${T.title} 360 tour: ${url}` }).catch(() => {}));
    act.querySelector('[data-again]').onclick = render;
  }
  render();
}
