// Build the documentation site into docs/ (served by GitHub Pages: Settings → Pages → Deploy from a branch → main, /docs).
//   node scripts/docs.mjs        needs dist/ (npm run build) and Playwright's Chromium, like the tests
// Sources, so the docs cannot drift from the code:
//   README.md      → the guides (each "## API" subsection is a page) and the changelog
//   dist/meta.json → the modules and what each costs to load
//   the kit itself → every LLM tool (name, description, parameters) and the feature that adds it, read in headless Chromium
//   src/*.js       → each module's header comment and its documented public methods
// CI runs this and fails if docs/ differs from what is committed.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { marked } from 'marked';
import { start } from '../tests/_harness.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(ROOT, 'docs');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = 'https://github.com/lucky-edgelord/Jade-agent-kit';
const CDN = `https://cdn.jsdelivr.net/gh/lucky-edgelord/Jade-agent-kit@v${pkg.version}/dist/`;
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const strip = h => unesc(h.replace(/<[^>]+>/g, ''));
const slug = s => strip(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const paras = s => String(s).split(/\n\s*\n/).filter(p => p.trim()).map(p => `<p>${inline(p.replace(/\s*\n\s*/g, ' ').trim())}</p>`).join('\n');
const kb = n => (n / 1024).toFixed(1) + ' KB';

// ---------- what the kit says about itself: tools and the feature behind each ----------
async function probe() {
  const t = await start({ use: ['tools'] });
  const data = await t.ev(async () => {
    const kit = window.kit; const owner = {}, errors = [];
    const names = () => Object.keys(kit.tools.defs); let seen = new Set(names());
    for (const n of names()) owner[n] = 'tools';
    for (const f of kit.features) {
      if (f === 'tools') continue;
      try { await kit.use(f); } catch (e) { errors.push(f + ': ' + (e?.message || e)); }
      for (const k of names()) if (!seen.has(k)) { seen.add(k); owner[k] = f; }
    }
    const tools = {}; for (const [k, d] of Object.entries(kit.tools.defs)) tools[k] = { description: d.description, parameters: d.parameters };
    return { features: kit.features, tools, owner, errors };
  });
  await t.ctx.browser().close();
  if (data.errors.length) console.warn('warning: could not load', data.errors.join('; '));
  return data;
}

// ---------- modules: sizes from the build, docs from the source ----------
function modules() {
  const meta = JSON.parse(read('dist/meta.json')); const outs = meta.outputs;
  const gz = f => zlib.gzipSync(fs.readFileSync(path.join(ROOT, f))).length;
  const closure = (f, seen = new Set()) => { if (seen.has(f)) return seen; seen.add(f); for (const i of outs[f]?.imports || []) if (i.kind === 'import-statement') closure(i.path, seen); return seen; };
  const mods = [];
  for (const [file, o] of Object.entries(outs)) {
    if (!o.entryPoint || file.endsWith('.map') || path.basename(file).startsWith('chunk-')) continue;
    const name = path.basename(file, '.js'); const files = [...closure(file)];
    mods.push({ name, src: o.entryPoint, file, raw: files.reduce((a, f) => a + fs.statSync(path.join(ROOT, f)).size, 0), gzip: files.reduce((a, f) => a + gz(f), 0) });
  }
  return mods.sort((a, b) => (a.name === 'jade-agent-kit' ? -1 : b.name === 'jade-agent-kit' ? 1 : a.name.localeCompare(b.name)));
}

// the leading // comment of a file, and the /** */ comments above public class members and exported functions
function parseSource(file) {
  const lines = read(file).split('\n'); const head = [];
  for (const l of lines) { if (/^\/\//.test(l)) head.push(l.replace(/^\/\/ ?/, '')); else break; }
  const members = []; let cls = '', doc = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]; const c = /^(?:export\s+)?(?:default\s+)?class\s+(\w+)/.exec(l); if (c) cls = c[1];
    if (/^\s*\/\*\*/.test(l)) {
      const buf = [l]; while (!/\*\//.test(buf[buf.length - 1]) && i + 1 < lines.length) buf.push(lines[++i]);
      doc = buf.join('\n').replace(/^\s*\/\*\*+\s?/, '').replace(/\s*\*\/\s*$/, '').split('\n').map(x => x.replace(/^\s*\* ?/, '')).join('\n').trim(); continue;
    }
    if (doc === null) continue;
    if (!l.trim()) continue;
    const fn = /^export\s+(async\s+)?function\s+(\w+)\s*\(([^)]*)/.exec(l);
    const m = /^ {2}(static\s+)?(async\s+)?(get\s+|set\s+)?(\*\s*)?([A-Za-z_$][\w$]*)\s*\(([^)]*)/.exec(l);
    if (fn) members.push({ owner: '', name: fn[2], sig: `${fn[1] ? 'async ' : ''}${fn[2]}(${fn[3].trim()})`, doc });
    else if (m && !/^(if|for|while|switch|catch|return|function)$/.test(m[5]) && !m[5].startsWith('_')) {
      const open = l.slice(l.indexOf('(')).includes(')') ? m[6].trim() : '…';
      members.push({ owner: cls, name: m[5], sig: `${m[1] || ''}${m[2] || ''}${m[3] || ''}${m[5]}(${open.length > 110 ? open.slice(0, 107) + '…' : open})`.replace(/\s+/g, ' '), doc });
    }
    doc = null;
  }
  return { head, members };
}
// header lines → paragraphs and preformatted blocks (indented lines)
function headerHtml(head) {
  const out = []; let para = [], pre = [];
  const flush = () => { if (para.length) out.push(paras(para.join(' '))); if (pre.length) out.push(`<pre><code>${esc(pre.join('\n'))}</code></pre>`); para = []; pre = []; };
  for (const l of head) {
    if (!l.trim()) { flush(); continue; }
    if (/^\s{2,}/.test(l)) { if (para.length) flush(); pre.push(l.replace(/^ {2}/, '')); } else { if (pre.length) flush(); para.push(l.trim()); }
  }
  flush(); return out.join('\n');
}
const firstSentence = head => {
  const t = head.filter(l => l.trim() && !/^\s{2,}/.test(l)).join(' ').replace(/\s+/g, ' ').trim(); const m = /^(.{20,260}?\.)(\s|$)/.exec(t);
  if (m) return m[1]; const cut = t.length > 200 ? t.slice(0, 200).replace(/\s+\S*$/, '') + '…' : t; return cut.replace(/:$/, '.');
};
function docHtml(doc) {
  const out = []; let list = [];
  const flush = () => { if (list.length) out.push('<ul>' + list.join('') + '</ul>'); list = []; };
  const blocks = doc.split(/\n\s*\n/);
  for (const b of blocks) {
    const ls = b.split('\n'); const text = [];
    for (const l of ls) {
      const p = /^@param\s+(?:\{(.+?)\}\s+)?(\[?[\w.$]+\]?)\s*-?\s*(.*)/.exec(l);
      if (p) { list.push(`<li><code>${esc(p[2])}</code>${p[1] ? ` <span class="ty">${esc(p[1])}</span>` : ''} ${inline(p[3])}</li>`); continue; }
      const r = /^@returns?\s+(?:\{(.+?)\}\s*)?(.*)/.exec(l);
      if (r) { list.push(`<li><strong>returns</strong>${r[1] ? ` <span class="ty">${esc(r[1])}</span>` : ''} ${inline(r[2])}</li>`); continue; }
      if (/^@/.test(l)) continue;
      text.push(l);
    }
    flush(); if (text.join('').trim()) out.push(`<p>${text.map((l, i) => (i ? (/^\s/.test(l) ? '<br>' : ' ') : '') + inline(l.trim())).join('')}</p>`);
  }
  flush(); return out.join('\n');
}

// ---------- the README, split into pages ----------
function splitReadme(md) {
  let fence = false; const secs = []; let cur = { level: 0, title: '', lines: [] }; secs.push(cur);
  for (const line of md.split('\n')) {
    if (/^```/.test(line)) { fence = !fence; cur.lines.push(line); continue; }
    const h = !fence && /^(#{1,3}) (.+)/.exec(line);
    if (h) { cur = { level: h[1].length, title: h[2].trim(), lines: [] }; secs.push(cur); } else cur.lines.push(line);
  }
  return secs;
}
function demote(lines, n) { let fence = false; return lines.map(l => { if (/^```/.test(l)) fence = !fence; const h = !fence && /^(#+) /.exec(l); return h ? '#'.repeat(Math.max(2, h[1].length - n)) + l.slice(h[1].length) : l; }); }
const plain = t => t.replace(/`/g, '');

function readmePages() {
  const secs = splitReadme(read('README.md')); const pages = []; const changes = []; let page = null, api = false;
  for (const s of secs) {
    if (s.level === 1) { pages.push({ slug: 'index', title: 'Jade Agent Kit', group: 'Start', md: s.lines.join('\n') }); continue; }
    if (s.level === 2) {
      api = s.title === 'API';
      page = api ? { slug: 'create-kit', title: 'createKit options', group: 'Guides', md: s.lines.join('\n') }
        : { slug: slug(s.title), title: s.title, group: ['Quick start', 'Lean loading'].includes(s.title) ? 'Start' : 'More', md: s.lines.join('\n') };
      pages.push(page); continue;
    }
    if (s.level === 3) {
      if (/^Changes in/.test(s.title)) { changes.push(`## ${s.title.replace(/^Changes in /, '')}\n${s.lines.join('\n')}`); continue; }
      if (api) { page = { slug: slug(plain(s.title).split(':')[0]), title: plain(s.title), group: 'Guides', md: demote(s.lines, 2).join('\n') }; pages.push(page); }
      else page.md += `\n## ${plain(s.title)}\n${s.lines.join('\n')}`;
    }
  }
  const order = ['index', 'quick-start', 'lean-loading', 'create-kit'];
  pages.push({ slug: 'changelog', title: 'Changelog', group: 'More', md: changes.join('\n') });
  const rank = p => { const g = ['Start', 'Guides', 'Reference', 'More'].indexOf(p.group); return g; };
  return pages.map((p, i) => ({ ...p, i })).sort((a, b) => rank(a) - rank(b) || a.i - b.i);
}

// ---------- HTML ----------
const KW = /\b(?:const|let|var|function|async|await|return|if|else|for|of|in|while|new|import|from|export|default|class|throw|try|catch|true|false|null|undefined|typeof)\b/;
function highlight(code, lang) {
  const re = lang === 'sh' ? /(#.*$)|("(?:[^"\\\n]|\\.)*"|'[^'\n]*')/gm
    : /(\/\/.*$|\/\*[\s\S]*?\*\/)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d[\d_.]*\b)|(\b(?:const|let|var|function|async|await|return|if|else|for|of|in|while|new|import|from|export|default|class|throw|try|catch|true|false|null|undefined|typeof)\b)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index)); const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'n' : 'k';
    out += `<span class="${cls}">${esc(m[0])}</span>`; last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}
function render(md) {
  let html = marked.parse(md);
  html = html.replace(/<pre><code(?: class="language-([\w-]+)")?>([\s\S]*?)<\/code><\/pre>/g, (_, lang, body) => {
    const code = unesc(body); const l = { js: 'js', javascript: 'js', mjs: 'js', json: 'js', sh: 'sh', bash: 'sh', shell: 'sh' }[lang];
    return `<pre><code${lang ? ` class="language-${lang}"` : ''}>${l ? highlight(code, l) : esc(code)}</code></pre>`;
  });
  const used = new Set();
  html = html.replace(/<h([1-4])>([\s\S]*?)<\/h\1>/g, (_, n, inner) => {
    let id = slug(inner) || 'section'; const base = id; for (let k = 2; used.has(id); k++) id = `${base}-${k}`; used.add(id);
    return `<h${n} id="${id}">${inner}<a class="anchor" href="#${id}" aria-label="Link to this section">#</a></h${n}>`;
  });
  return html.replace(/<table>/g, '<div class="table"><table>').replace(/<\/table>/g, '</table></div>');
}

const GROUPS = ['Start', 'Guides', 'Reference', 'More'];
function layout(page, pages, mods) {
  const nav = GROUPS.map(g => {
    const items = pages.filter(p => p.group === g);
    const links = items.map(p => `<li><a href="${p.slug}.html"${p.slug === page.slug ? ' aria-current="page"' : ''}>${esc(p.nav || p.title)}</a></li>`).join('');
    const sub = g === 'Reference' ? `<li class="mods"><details${page.module ? ' open' : ''}><summary>Modules</summary><ul>${mods.map(m => `<li><a href="module-${m.name}.html"${page.module === m.name ? ' aria-current="page"' : ''}>${esc(m.name)}</a></li>`).join('')}</ul></details></li>` : '';
    return `<div class="grp"><h2>${g}</h2><ul>${links}${sub}</ul></div>`;
  }).join('\n');
  const flow = pages.filter(p => !p.module); const at = flow.findIndex(p => p.slug === page.slug);
  const pn = (p, cls, label) => p ? `<a class="${cls}" href="${p.slug}.html"><span>${label}</span>${esc(p.title)}</a>` : '<span></span>';
  const pager = at < 0 ? '' : `<nav class="pager" aria-label="Pages">${pn(flow[at - 1], 'prev', 'Previous')}${pn(flow[at + 1], 'next', 'Next')}</nav>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.slug === 'index' ? 'Jade Agent Kit documentation' : esc(page.title) + ' · Jade Agent Kit'}</title>
<meta name="description" content="${esc(page.description || 'A lean, CDN-delivered browser workspace for AI agents: shell, files, Python, JavaScript, SQLite, search, memory, automation and a pi-style agent.')}">
<link rel="stylesheet" href="assets/docs.css">
<script>try{var t=localStorage.getItem('jak-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
</head>
<body>
<header class="top">
  <button class="menu-btn" aria-label="Menu" aria-expanded="false" aria-controls="side">☰</button>
  <a class="brand" href="index.html">Jade Agent Kit</a><span class="ver">v${pkg.version}</span>
  <div class="search"><input id="q" type="search" placeholder="Search the docs  ( / )" autocomplete="off" aria-label="Search the docs"><div id="results" role="listbox" hidden></div></div>
  <button class="theme" aria-label="Toggle light and dark">Theme</button>
  <a class="gh" href="${REPO}">GitHub</a>
</header>
<div class="wrap">
<aside id="side">${nav}</aside>
<main>
<article>
${page.html}
</article>
${pager}
<footer>Jade Agent Kit v${pkg.version} · MIT · <a href="${REPO}/blob/main/${page.source || 'README.md'}">Edit the source</a> · generated by <code>scripts/docs.mjs</code></footer>
</main>
</div>
<script src="assets/docs.js" defer></script>
</body>
</html>
`;
}

// ---------- generated pages ----------
const GH_SRC = f => `${REPO}/blob/main/${f}`;
function featuresPage(probe_, mods, aliases) {
  const byName = Object.fromEntries(mods.map(m => [m.name, m])); const alt = { decisions: 'decide', cron: 'schedule', models: 'router' };
  const toolsBy = {}; for (const [t, f] of Object.entries(probe_.owner)) (toolsBy[f] ||= []).push(t);
  const rows = probe_.features.map(f => {
    const mod = byName[alt[f] || f]; const al = Object.entries(aliases).filter(([, v]) => v === f).map(([k]) => `<code>${k}</code>`).join(', ');
    const tl = (toolsBy[f] || []).map(t => `<a href="tools.html#${slug(t)}"><code>${t}</code></a>`).join(' ');
    const desc = mod ? firstSentence(parseSource(mod.src).head) : '';
    return `<tr><td><code>kit.use('${f}')</code>${al ? `<br><small>also ${al}</small>` : ''}</td><td>${mod ? `<a href="module-${mod.name}.html">${mod.name}.js</a>` : ''}</td><td class="num">${mod ? kb(mod.gzip) : ''}</td><td>${tl}</td><td>${inline(desc)}</td></tr>`;
  }).join('\n');
  const core = byName['jade-agent-kit'];
  return `<h1>Features and sizes</h1>
<p>Every feature is its own module, downloaded the first time <code>kit.use(name)</code> (or a helper such as <code>kit.run()</code>) needs it. Sizes are gzipped and include the shared chunks a module imports; runtimes that load from a CDN afterwards (MicroPython, SQLite's WebAssembly, TensorFlow.js, …) are extra. The core, <code>createKit</code> and the file system, is <strong>${kb(core.gzip)}</strong>.</p>
<div class="table"><table class="feat"><thead><tr><th>Feature</th><th>Module</th><th>Size</th><th>Adds tools</th><th>What it is</th></tr></thead><tbody>
${rows}
</tbody></table></div>
<p>The sizes come from the build, so they are always those of v${pkg.version}. For loading only what you need, see <a href="lean-loading.html">Lean loading</a>.</p>`;
}
function toolsPage(probe_) {
  const by = {}; for (const [t, f] of Object.entries(probe_.owner)) (by[f] ||= []).push(t);
  const typ = s => !s ? '' : s.enum ? s.enum.map(e => `<code>${esc(e)}</code>`).join(' | ') : s.type === 'array' ? `array of ${esc(s.items?.type || 'any')}` : esc(Array.isArray(s.type) ? s.type.join(' | ') : s.type || '');
  const parts = [`<h1>Tools for LLMs</h1>
<p>Every tool an agent can call, as the kit defines it. Get them in your model's format with <code>kit.tools.openai(names?)</code> or <code>kit.tools.anthropic(names?)</code>, and run one with <code>await kit.tool(name, args)</code>. Tools from a feature appear once the feature is loaded; calling one loads it. These definitions are read from the running kit, so they match v${pkg.version}.</p>`];
  for (const f of probe_.features) {
    const names = by[f]; if (!names) continue;
    parts.push(`<h2 id="${slug('from-' + f)}">${f === 'tools' ? 'Built in' : `From <code>${f}</code>`}</h2>`);
    for (const n of names) {
      const t = probe_.tools[n]; const props = t.parameters?.properties || {}; const req = new Set(t.parameters?.required || []);
      const rows = Object.entries(props).map(([k, v]) => `<tr><td><code>${esc(k)}</code>${req.has(k) ? ' <small>required</small>' : ''}</td><td>${typ(v)}</td><td>${inline(v.description || '')}</td></tr>`).join('');
      parts.push(`<h3 id="${slug(n)}"><code>${esc(n)}</code><a class="anchor" href="#${slug(n)}" aria-label="Link to this tool">#</a></h3>\n${paras(t.description || '')}\n${rows ? `<div class="table"><table><thead><tr><th>Argument</th><th>Type</th><th>Description</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p><small>No arguments.</small></p>'}`);
    }
  }
  return parts.join('\n');
}
function modulePage(m, probe_, features) {
  const s = parseSource(m.src); const loadedBy = features.filter(f => (({ decisions: 'decide', cron: 'schedule', models: 'router' })[f] || f) === m.name);
  const tools = Object.entries(probe_.owner).filter(([, f]) => loadedBy.includes(f)).map(([t]) => `<a href="tools.html#${slug(t)}"><code>${t}</code></a>`);
  const byOwner = new Map(); for (const x of s.members) { const k = x.owner || 'Functions'; if (!byOwner.has(k)) byOwner.set(k, []); byOwner.get(k).push(x); }
  const api = [...byOwner].map(([o, ms]) => `<h2 id="${slug(o)}">${o === 'Functions' ? 'Functions' : `<code>${esc(o)}</code>`}</h2>\n` + ms.map(x => `<h3 id="${slug(o + '-' + x.name)}"><code>${esc(x.sig)}</code><a class="anchor" href="#${slug(o + '-' + x.name)}" aria-label="Link to this member">#</a></h3>\n${docHtml(x.doc)}`).join('\n')).join('\n');
  return `<h1><code>${m.name}.js</code></h1>
<dl class="facts"><dt>Source</dt><dd><a href="${GH_SRC(m.src)}"><code>${m.src}</code></a></dd><dt>Size</dt><dd>${kb(m.gzip)} gzipped (${kb(m.raw)} raw), with the chunks it imports</dd>${loadedBy.length ? `<dt>Load</dt><dd>${loadedBy.map(f => `<code>kit.use('${f}')</code>`).join(', ')}</dd>` : ''}${tools.length ? `<dt>Tools</dt><dd>${tools.join(' ')}</dd>` : ''}</dl>
${headerHtml(s.head)}
<p>On its own, without <code>createKit</code>:</p>
<pre><code>${highlight(`import * as m from '${CDN}${m.name}.js';`, 'js')}</code></pre>
${api ? `<h2 id="api-reference" class="plain">Documented API</h2>\n<p>Methods with a doc comment in the source. The <a href="${GH_SRC(m.src)}">source</a> has the rest.</p>\n${api}` : ''}`;
}

// ---------- build ----------
function sectionsOf(html) {
  const parts = html.split(/(?=<h[23] id=)/); const out = [];
  for (const p of parts) { const h = /^<h[23] id="([^"]+)">([\s\S]*?)<a class="anchor"/.exec(p); out.push({ id: h?.[1] || '', title: h ? strip(h[2]) : '', text: unesc(p.replace(/<(pre|table)[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/#\s/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700) }); }
  return out;
}
async function main() {
  if (!fs.existsSync(path.join(ROOT, 'dist/meta.json'))) throw new Error('dist/ is missing: run npm run build first');
  const [pr, mods] = [await probe(), modules()];
  const aliases = Function('return ' + /const ALIASES = (\{[^}]*\})/.exec(read('src/index.js'))[1])();
  const pages = readmePages();
  for (const p of pages) { p.html = render(p.md); if (p.slug === 'index') p.html = `<h1>Jade Agent Kit</h1>\n` + p.html.replace(/^<p>/, '<p class="lead">'); }
  const idx = pages.find(p => p.slug === 'index');
  idx.html += `\n<h2 id="start-here">Start here</h2>\n<div class="cards">
<a href="quick-start.html"><strong>Quick start</strong><span>One import from a CDN, then a shell in a few lines.</span></a>
<a href="lean-loading.html"><strong>Lean loading</strong><span>Load only what you use; the core is ${kb(mods.find(m => m.name === 'jade-agent-kit').gzip)}.</span></a>
<a href="the-agent.html"><strong>The agent</strong><span>A pi-style agent on Ollama Cloud or on your machine.</span></a>
<a href="tools.html"><strong>Tools</strong><span>Every tool an LLM can call, with its arguments.</span></a>
<a href="features.html"><strong>Features and sizes</strong><span>What each module costs to load.</span></a>
<a href="changelog.html"><strong>Changelog</strong><span>What changed in v${pkg.version}.</span></a>
</div>`;
  const generated = [
    { slug: 'features', title: 'Features and sizes', group: 'Reference', html: featuresPage(pr, mods, aliases), source: 'scripts/docs.mjs' },
    { slug: 'tools', title: 'Tools for LLMs', nav: 'Tools', group: 'Reference', html: toolsPage(pr), source: 'scripts/docs.mjs' },
  ];
  const modulePages = mods.map(m => ({ slug: 'module-' + m.name, title: m.name + '.js', group: 'Reference', module: m.name, html: modulePage(m, pr, pr.features), source: m.src }));
  const all = [...pages, ...generated.map(g => ({ ...g, html: g.html.startsWith('<h1') ? g.html : g.html })), ...modulePages];
  // order the nav: README pages by group, generated Reference pages inserted in the Reference group
  const nav = [...pages.filter(p => p.group !== 'More'), ...generated, ...pages.filter(p => p.group === 'More')];
  const navAll = [...nav, ...modulePages];
  // internal links: anchors that live on another page, and README links to repository files
  const where = {}; for (const p of navAll) for (const m of p.html.matchAll(/<h[1-4] id="([^"]+)"/g)) where[m[1]] ??= p.slug;
  const broken = [];
  for (const p of navAll) {
    p.html = p.html.replace(/href="([^"]+)"/g, (full, h) => {
      if (/^(https?:|mailto:)/.test(h) || h.startsWith('assets/')) return full;
      if (h.startsWith('#')) { const id = h.slice(1); if (new RegExp(`id="${id}"`).test(p.html)) return full; if (where[id]) return `href="${where[id]}.html#${id}"`; broken.push(`${p.slug}: ${h}`); return full; }
      if (/^[\w-]+\.html(#.*)?$/.test(h)) { const [f, a] = h.split('#'); if (!navAll.some(x => x.slug + '.html' === f)) broken.push(`${p.slug}: ${h}`); return full; }
      return `href="${REPO}/blob/main/${h.replace(/^\.\//, '')}"`;
    });
  }
  if (broken.length) { console.error('broken links:\n  ' + broken.join('\n  ')); process.exit(1); }

  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
  for (const f of ['docs.css', 'docs.js']) fs.copyFileSync(path.join(ROOT, 'docs-src', f), path.join(OUT, 'assets', f));
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  const search = [];
  for (const p of navAll) {
    fs.writeFileSync(path.join(OUT, p.slug + '.html'), layout(p, nav, mods));
    for (const s of sectionsOf(p.html)) if (s.id || !p.module) search.push({ t: s.title || p.title, p: p.title, u: `${p.slug}.html${s.id ? '#' + s.id : ''}`, x: s.text });
  }
  fs.writeFileSync(path.join(OUT, '404.html'), layout({ slug: '404', title: 'Not found', html: '<h1>Page not found</h1><p>That page is not in the docs. Try the search box, or go back to the <a href="index.html">overview</a>.</p>' }, nav, mods).replace(/(href|src)="(assets\/|[\w-]+\.html)/g, '$1="/Jade-agent-kit/$2'));
  fs.writeFileSync(path.join(OUT, 'search.json'), JSON.stringify(search));
  console.log(`docs/: ${navAll.length} pages, ${search.length} search entries, ${Object.keys(pr.tools).length} tools, ${mods.length} modules`);
}
await main();
