// Make a clip: a short video of chosen spots for Reels, TikTok, Shorts or a post, made in the browser.
// A second, hidden viewer turns slowly through each spot; its frames are drawn onto a canvas with the room name, the logo
// and an end card with the tour link, and the canvas is recorded in real time. Nothing is uploaded.
import { Viewer } from '@photo-sphere-viewer/core';

const FORMATS = { tall: { size: [1080, 1920], label: 'Vertical 9:16', note: 'Reels, TikTok, Shorts, Stories', zoom: 0, top: 170, bottom: 300 },
                  wide: { size: [1920, 1080], label: 'Wide 16:9', note: 'YouTube, Facebook, X, LinkedIn', zoom: 40, top: 44, bottom: 62 } };
const PER = 3400, FADE = 500, END = 2800, MAX = 8;

const css = document.createElement('style');
css.textContent = `
.yc-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
.yc-chip{min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--fill);color:var(--label);font:500 14px Figtree,sans-serif;cursor:pointer}
.yc-chip.on,.yc-fmt .ye-btn.on{background:var(--label);color:#fff}
.yc-fmt{display:flex;gap:8px;margin:0 0 12px}.yc-fmt .ye-btn{background:var(--fill);color:var(--label);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6px}
.yc-fmt small{font:400 12px Figtree,sans-serif;opacity:.8}
.yc-stage{display:flex;justify-content:center;background:#000;border-radius:12px;overflow:hidden;margin:0 0 12px}
.yc-stage canvas,.yc-stage video{display:block;max-width:100%;max-height:60vh}
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

async function record({ T, ids, format, url, stage, onProgress }) {
  const F = FORMATS[format], [W, H] = F.size, dpr = devicePixelRatio || 1;
  const box = document.createElement('div');
  Object.assign(box.style, { position: 'fixed', left: '-20000px', top: '0', width: W / dpr + 'px', height: H / dpr + 'px' });
  document.body.appendChild(box);
  const [logo] = await Promise.all([img('logo.svg'), document.fonts.load('600 48px Poppins'), document.fonts.load('500 28px Figtree'),
    ...ids.map(id => fetch('pano/' + T.scenes[id].file).catch(() => {}))]);
  const v = new Viewer({ container: box, panorama: 'pano/' + T.scenes[ids[0]].file, navbar: false, loadingTxt: '',
    defaultZoomLvl: F.zoom, rendererParameters: { preserveDrawingBuffer: true, antialias: true } });
  await new Promise(r => v.addEventListener('ready', r, { once: true }));
  const src = box.querySelector('canvas');

  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const raw = document.createElement('canvas'); raw.width = W; raw.height = H;
  const prev = document.createElement('canvas'); prev.width = W; prev.height = H;
  const ctx = out.getContext('2d'), rc = raw.getContext('2d'), pc = prev.getContext('2d');
  stage.replaceChildren(out);

  const type = mimeType(), chunks = [];
  const rec = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 12e6 });
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(r => rec.onstop = r);

  const u = Math.min(W, H) / 720;  // type and spacing scale with the short side
  const host = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const shade = (y0, y1, a0, a1) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, `rgba(0,0,0,${a0})`); g.addColorStop(1, `rgba(0,0,0,${a1})`); ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0)); };
  const logoW = 150 * u, logoH = logoW * logo.height / logo.width;
  function overlay(name, t) {
    shade(0, (F.top + 160) * u, .45, 0); shade(H, H - (F.bottom + 260) * u, .65, 0);
    ctx.drawImage(logo, 40 * u, F.top * u, logoW, logoH);
    ctx.globalAlpha = Math.min(1, t * 4);
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
    ctx.font = `500 ${26 * u}px Figtree`; ctx.globalAlpha *= .85; ctx.fillText(T.title, 40 * u, H - (F.bottom + 58) * u);
    ctx.globalAlpha = Math.min(1, t * 4);
    ctx.font = `600 ${52 * u}px Poppins`; ctx.fillText(name, 40 * u, H - F.bottom * u);
    ctx.globalAlpha = 1;
  }

  const total = ids.length * PER + END;
  let elapsed = 0;
  for (const [i, id] of ids.entries()) {
    const s = T.scenes[id], yaw0 = (s.links[0]?.yaw ?? 0) * Math.PI / 180, dir = i % 2 ? -1 : 1, sweep = .42;
    if (i) {
      pc.drawImage(raw, 0, 0); rec.pause();
      await v.setPanorama('pano/' + s.file, { transition: false, showLoader: false, position: { yaw: yaw0 - dir * sweep / 2, pitch: -.05 } });
      await frame(); await frame(); rec.resume();
    } else { v.rotate({ yaw: yaw0 - dir * sweep / 2, pitch: -.05 }); await frame(); await frame(); rec.start(250); }
    const t0 = performance.now();
    for (let t = 0; t < PER; t = performance.now() - t0) {
      v.rotate({ yaw: yaw0 + dir * sweep * (ease(t / PER) - .5), pitch: -.05 });
      await frame();
      rc.drawImage(src, 0, 0, W, H);
      ctx.drawImage(raw, 0, 0);
      if (i && t < FADE) { ctx.globalAlpha = 1 - t / FADE; ctx.drawImage(prev, 0, 0); ctx.globalAlpha = 1; }
      overlay(s.name, t / PER);
      onProgress((elapsed + t) / total);
    }
    elapsed += PER;
  }

  // end card: the last view, blurred and dark, with the boat and where to take the tour
  const t0 = performance.now();
  for (let t = 0; t < END; t = performance.now() - t0) {
    const k = Math.min(1, t / 600);
    ctx.filter = `blur(${24 * k * u}px)`; ctx.drawImage(raw, 0, 0); ctx.filter = 'none';
    ctx.fillStyle = `rgba(16,16,20,${.25 + .5 * k})`; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = k; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    const lw = 260 * u, lh = lw * logo.height / logo.width;
    ctx.drawImage(logo, (W - lw) / 2, H / 2 - 150 * u - lh, lw, lh);
    ctx.font = `600 ${56 * u}px Poppins`; ctx.fillText(T.title, W / 2, H / 2);
    ctx.font = `500 ${30 * u}px Figtree`; ctx.fillText('Take the full 360 tour', W / 2, H / 2 + 60 * u);
    ctx.globalAlpha = k * .8; ctx.font = `400 ${22 * u}px Figtree`; ctx.fillText(host, W / 2, H / 2 + 104 * u);
    ctx.globalAlpha = 1; ctx.textAlign = 'start';
    onProgress((elapsed + t) / total);
    await frame();
  }
  rec.stop(); await done;
  v.destroy(); box.remove();
  return new Blob(chunks, { type: type.split(';')[0] });
}

export function clipPanel(el, { T, url }) {
  if (!clipSupported()) return;
  let format = 'tall', picked = defaultSpots(T), busy = false;
  const names = new Map(); for (const s of Object.values(T.scenes)) names.has(s.name) || names.set(s.name, s.id);
  const render = () => {
    el.innerHTML = `<div class="ye"><section><h3>Make a clip</h3>
      <p>A short video that moves through the rooms you pick, ready to post. It ends with a link to this tour.</p>
      <div class="yc-fmt">${Object.entries(FORMATS).map(([k, f]) => `<button class="ye-btn${k === format ? ' on' : ''}" data-f="${k}">${f.label}<small>${f.note}</small></button>`).join('')}</div>
      <div class="yc-chips">${[...names].map(([n, id]) => `<button class="yc-chip${picked.includes(id) ? ' on' : ''}" data-id="${id}">${esc(n)}</button>`).join('')}</div>
      <p class="yc-len">${picked.length} rooms, about ${Math.round((picked.length * PER + END) / 1000)} seconds. Up to ${MAX} rooms.</p>
      <div class="yc-stage" hidden></div><div class="yc-bar" hidden><i></i></div>
      <div class="ye-row yc-act"><button class="ye-btn f" data-go ${picked.length ? '' : 'disabled'}>Make clip</button></div></section></div>`;
    el.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { format = b.dataset.f; render(); });
    el.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      picked = picked.includes(id) ? picked.filter(x => x !== id) : picked.length < MAX ? [...picked, id] : picked;
      picked.sort((a, b) => Object.keys(T.scenes).indexOf(a) - Object.keys(T.scenes).indexOf(b));
      render();
    });
    el.querySelector('[data-go]').onclick = make;
  };
  async function make() {
    if (busy) return; busy = true;
    const stage = el.querySelector('.yc-stage'), bar = el.querySelector('.yc-bar'), act = el.querySelector('.yc-act');
    el.querySelectorAll('.yc-fmt button,.yc-chip').forEach(b => b.disabled = true);
    stage.hidden = bar.hidden = false;
    act.innerHTML = '<button class="ye-btn" disabled>Making your clip. Keep this page open.</button>';
    const blob = await record({ T, ids: picked, format, url, stage, onProgress: p => bar.firstChild.style.width = (p * 100).toFixed(1) + '%' });
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
