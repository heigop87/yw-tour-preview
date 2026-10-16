// Share sheet body: copy the tour link, optionally at the current spot; embed code folded away below.
// tour = the viewer URL (what dealers paste and iframe); page = the canonical page that gets the credit link.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const css = document.createElement('style');
css.textContent = `
.ye{--group:#fff;--label:#121216;--label2:#6e6e76;--sep:rgba(60,60,67,.12);--tint:#4b0ea3;color:var(--label);font:15px/20px Figtree,sans-serif}
.ye-group{background:var(--group);border-radius:14px;overflow:hidden}
.ye-url{display:block;padding:14px 16px;font-size:15px;color:var(--label2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:all}
.ye-btn{display:block;width:100%;min-height:48px;border:0;border-radius:14px;font:600 16px Figtree,sans-serif;cursor:pointer;background:var(--tint);color:#fff;margin:12px 0 0}
.ye-btn.s{background:var(--group);color:var(--tint);box-shadow:inset 0 0 0 1px var(--sep)}
.ye-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;cursor:pointer}
.ye-row + .ye-row,.ye-row + details,details + details{border-top:1px solid var(--sep)}
.ye-sw{appearance:none;flex:none;width:44px;height:26px;border-radius:999px;background:#e3e3e8;position:relative;cursor:pointer;margin:0;transition:background .2s}
.ye-sw::after{content:'';position:absolute;top:2px;left:2px;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s}
.ye-sw:checked{background:var(--tint)}.ye-sw:checked::after{transform:translateX(18px)}
.ye-sub{display:block;color:var(--label2);font-size:13px;line-height:18px}
.ye-gap{height:20px}
.ye details summary{list-style:none;cursor:pointer;display:flex;justify-content:space-between;padding:12px 16px;font-weight:500}
.ye details summary::-webkit-details-marker{display:none}
.ye details summary::after{content:'';width:8px;height:8px;margin:6px 4px 0 0;border:solid var(--label2);border-width:0 2px 2px 0;transform:rotate(45deg);transition:transform .2s}
.ye details[open] > summary::after{transform:rotate(-135deg);margin-top:10px}
.ye-in{padding:0 16px 16px}
.ye-in p{margin:0;color:var(--label2);font-size:14px;line-height:20px}
.ye-in a{color:var(--tint);font-weight:600;text-decoration:none}
.ye-in .ye-btn{margin-top:12px}
.ye-in details{border-top:1px solid var(--sep);margin:0 -16px}
.ye-in details:first-of-type{margin-top:12px}
.ye-in ol{margin:0;padding:0 16px 12px 36px;color:var(--label2);font-size:14px;line-height:20px}`;
document.head.appendChild(css);

const HOWTO = [
  ['WordPress', ['Open the page in the editor.', 'Click + and add a Custom HTML block.', 'Paste the code and click Update.']],
  ['Wix', ['Click Add Elements (+), then Embed Code, then Embed HTML.', 'Choose Code, paste the code and click Update.', 'Drag the box to the size you want, then Publish.']],
  ['Squarespace', ['Edit the page and click Add Block.', 'Choose Code, paste the code and click outside the block.', 'Click Save.']],
  ['Webflow', ['Drag a Code Embed element onto the page.', 'Paste the code and click Save & Close.', 'Publish the site.']],
  ['Shopify', ['Go to Online Store, then Pages, and open the page.', 'Click the Show HTML button (<>) in the editor.', 'Paste the code where the tour should go and click Save.']],
  ['Any other site', ['Paste the code into the page HTML where the tour should show.', 'Or send the code to whoever runs your website.']],
];

export function embedPanel(el, { name, tour, page, spot, spotName }) {
  page = page || tour;
  // phones always get a tall box: the 360 view reads better portrait than as a 16:9 strip
  const code = `<style>.yw-tour{position:relative;width:100%;aspect-ratio:16/9}@media (max-width:700px){.yw-tour{aspect-ratio:auto;height:80vh}}</style>
<div class="yw-tour"><iframe src="${tour}?embed=1" title="${esc(name)} 3D tour" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px" loading="lazy" allow="fullscreen; autoplay; xr-spatial-tracking" allowfullscreen></iframe></div>
<p style="font:14px/1.4 sans-serif;margin:8px 0 0"><a href="${page}">${esc(name)} 3D tour</a> on <a href="https://www.yachtway.com">YachtWay</a></p>`;
  const short = u => u.replace(/^https?:\/\//, '');
  el.innerHTML = `<div class="ye">
    <div class="ye-group"><span class="ye-url" id="yeUrl">${esc(short(tour))}</span></div>
    <button class="ye-btn" data-c="link">Copy link</button>
    ${spot ? `<div class="ye-gap"></div><div class="ye-group"><label class="ye-row"><span>Start at this spot<span class="ye-sub">${esc(spotName)}, facing where you look now</span></span><input type="checkbox" class="ye-sw" id="yeSpot"></label></div>` : ''}
    <div class="ye-gap"></div>
    <div class="ye-group"><details><summary>Add to your website</summary><div class="ye-in">
      <p>Paste the code into any page. The tour plays on your page with a link to the full tour on YachtWay. <a href="embed-preview.html?name=${encodeURIComponent(name)}" target="_blank" rel="noopener">See an example</a></p>
      <button class="ye-btn s" data-c="code">Copy embed code</button>
      ${HOWTO.map(([n, steps]) => `<details><summary>${n}</summary><ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>`).join('')}
    </div></details></div></div>`;
  const sw = el.querySelector('#yeSpot');
  const link = () => sw?.checked ? spot : tour;
  sw?.addEventListener('change', () => el.querySelector('#yeUrl').textContent = short(link()));
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
    const label = b.textContent;
    navigator.clipboard.writeText(b.dataset.c === 'code' ? code : link()).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = label, 1500); });
  });
}
