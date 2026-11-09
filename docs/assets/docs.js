// Docs behaviour: search, copy buttons, menu, theme. No dependencies.
const $ = (s, r = document) => r.querySelector(s);
const root = document.documentElement;
$('.menu-btn')?.addEventListener('click', e => { const o = document.body.classList.toggle('nav-open'); e.currentTarget.setAttribute('aria-expanded', o); });
$('#side')?.addEventListener('click', e => { if (e.target.closest('a')) document.body.classList.remove('nav-open'); });
$('.theme')?.addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('jak-theme', root.dataset.theme); } catch {}
});
for (const pre of document.querySelectorAll('pre')) {
  const b = document.createElement('button'); b.className = 'copy'; b.textContent = 'Copy'; b.type = 'button';
  b.onclick = async () => { try { await navigator.clipboard.writeText(pre.innerText.replace(/Copy$/, '').trimEnd()); b.textContent = 'Copied'; } catch { b.textContent = 'Press Ctrl+C'; } setTimeout(() => (b.textContent = 'Copy'), 1500); };
  pre.append(b);
}
document.querySelector('#side [aria-current]')?.scrollIntoView({ block: 'center' });

// search: words in the query must all appear; titles count more than text
const input = $('#q'), box = $('#results'); let index = null, sel = -1, hits = [];
const load = () => (index ||= fetch('search.json').then(r => r.json()).catch(() => []));
const words = s => s.toLowerCase().split(/[^\p{L}\p{N}_.]+/u).filter(Boolean);
function run() {
  const q = words(input.value); sel = -1;
  if (!q.length) { box.hidden = true; return; }
  load().then(all => {
    hits = all.map(e => {
      const t = e.t.toLowerCase(), x = e.x.toLowerCase(), p = e.p.toLowerCase(); let s = 0;
      for (const w of q) { const a = t.includes(w) ? (t === w ? 12 : 6) : 0, b = p.includes(w) ? 2 : 0, c = x.includes(w) ? 1 + Math.min(3, x.split(w).length - 2) * .3 : 0; if (!a && !b && !c) return null; s += a + b + c; }
      return { e, s };
    }).filter(Boolean).sort((a, b) => b.s - a.s).slice(0, 8);
    box.innerHTML = hits.length ? hits.map((h, i) => {
      const x = h.e.x, at = Math.max(0, x.toLowerCase().indexOf(q[0]) - 30), snip = (at ? '… ' : '') + x.slice(at, at + 110);
      const el = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
      return `<a href="${h.e.u}" role="option" data-i="${i}"><b>${el(h.e.t)} <i>${el(h.e.p)}</i></b><small>${el(snip)}</small></a>`;
    }).join('') : '<a><b>No results</b></a>';
    box.hidden = false;
  });
}
input?.addEventListener('input', run);
input?.addEventListener('focus', () => { load(); if (input.value) run(); });
input?.addEventListener('keydown', e => {
  const items = [...box.querySelectorAll('a[href]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((a, i) => a.setAttribute('aria-selected', i === sel)); }
  else if (e.key === 'Enter' && items[Math.max(sel, 0)]) location.href = items[Math.max(sel, 0)].getAttribute('href');
  else if (e.key === 'Escape') { box.hidden = true; input.blur(); }
});
document.addEventListener('click', e => { if (!e.target.closest('.search')) box.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); input?.focus(); } });
