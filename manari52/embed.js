// Embed code + how-to, shared by the owner Embed tab and the guest Share sheet.
// The iframe shows the tour; the plain link under it is what carries search credit back to YachtWay.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const css = document.createElement('style');
css.textContent = `
.ye{--group:#fff;--fill:rgba(118,118,128,.12);--label:#121216;--label2:#727279;--tint:#4b0ea3;--tintFill:#f3edfb;color:var(--label);font:15px/20px Figtree,sans-serif}
.ye h3{font:600 17px/22px Figtree,sans-serif;margin:0 0 4px}
.ye p{margin:0 0 12px;color:var(--label2);font-size:13px;line-height:18px}
.ye section{margin:0 0 24px}
.ye p.ye-hint{margin:8px 0 0}.ye-hint a{color:var(--tint);font-weight:600;text-decoration:none;white-space:nowrap}
.ye textarea{width:100%;height:132px;margin:12px 0;box-sizing:border-box;border:0;border-radius:12px;padding:12px;background:var(--group);color:var(--label);font:12px/1.5 ui-monospace,Menlo,monospace;resize:none}
.ye-row{display:flex;gap:8px}
.ye-btn{flex:1;min-height:44px;border:0;border-radius:12px;font:600 15px Figtree,sans-serif;cursor:pointer;background:var(--tintFill);color:var(--tint)}
.ye-btn.f{background:var(--tint);color:#fff}
.ye-card{background:var(--group);border-radius:16px;padding:4px 16px}
.ye details{border-bottom:1px solid rgba(60,60,67,.12);padding:12px 0}
.ye details:last-child{border:0}
.ye summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between}
.ye summary::after{content:'+';color:var(--label2)}.ye details[open] summary::after{content:'\\2212'}
.ye ol{margin:8px 0 0;padding-left:20px;color:var(--label2);font-size:14px;line-height:20px}
.ye-prev{position:relative;width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000}
.ye-prev iframe{position:absolute;inset:0;width:100%;height:100%;border:0}`;
document.head.appendChild(css);

const HOWTO = [
  ['WordPress', ['Open the page in the editor.', 'Click + and add a Custom HTML block.', 'Paste the code and click Update.']],
  ['Wix', ['Click Add Elements (+), then Embed Code, then Embed HTML.', 'Choose Code, paste the code and click Update.', 'Drag the box to the size you want, then Publish.']],
  ['Squarespace', ['Edit the page and click Add Block.', 'Choose Code, paste the code and click outside the block.', 'Click Save.']],
  ['Webflow', ['Drag a Code Embed element onto the page.', 'Paste the code and click Save & Close.', 'Publish the site.']],
  ['Shopify', ['Go to Online Store, then Pages, and open the page.', 'Click the Show HTML button (<>) in the editor.', 'Paste the code where the tour should go and click Save.']],
  ['Any other site', ['Open the page HTML where the tour should show.', 'Paste the code there and publish.', 'Or send the code to whoever runs your website.']],
];

export function embedPanel(el, { name, url, preview, guest }) {
  // phones always get a tall box: the 360 view reads better portrait than as a 16:9 strip
  const code = () => `<style>.yw-tour{position:relative;width:100%;aspect-ratio:16/9}@media (max-width:700px){.yw-tour{aspect-ratio:auto;height:80vh}}</style>
<div class="yw-tour"><iframe src="${url}?embed=1" title="${esc(name)} 360 virtual tour" style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:12px" loading="lazy" allow="fullscreen; autoplay; xr-spatial-tracking" allowfullscreen></iframe></div>
<p style="font:14px/1.4 sans-serif;margin:8px 0 0"><a href="${url}">${esc(name)} 360 virtual tour</a> by <a href="https://www.yachtway.com">YachtWay</a></p>`;
  const render = () => {
    el.innerHTML = `<div class="ye">
      <section><h3>Put this tour on your website</h3>
        <p>Copy the code and paste it into any page. The tour plays right on your page, fills a tall screen on phones, and the link under it opens the full tour on YachtWay.</p>
        <p class="ye-hint"><a href="embed-preview.html?name=${encodeURIComponent(name)}" target="_blank" rel="noopener">See how it looks on a website</a></p>
        <textarea readonly spellcheck="false">${esc(code())}</textarea>
        <div class="ye-row"><button class="ye-btn f" data-c="code">Copy code</button><button class="ye-btn" data-c="link">Copy link</button></div></section>
      <section><h3>How to add it</h3><p>Pick your website builder.</p>
        <div class="ye-card">${HOWTO.map(([n, steps]) => `<details><summary>${n}</summary><ol>${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>`).join('')}</div></section>
      ${preview ? `<section><h3>Preview</h3><div class="ye-prev"><iframe src="${preview}?embed=1" title="Preview" loading="lazy"></iframe></div></section>` : ''}
      <section><p>Do not modify the code or the link for the tour to work.</p></section></div>`;
    el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      const label = b.textContent;
      navigator.clipboard.writeText(b.dataset.c === 'code' ? code() : url).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = label, 1500); });
    });
  };
  render();
}
