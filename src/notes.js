// Notes: an Obsidian-style knowledge base on the kit's file system. Notes are .md files anywhere (under `root`). [[wiki
// links]] (with |alias and #heading) and markdown links to .md files, backlinks, unresolved links, #tags and frontmatter
// tags, ranked search, daily notes, templates ({{title}}, {{date:YYYY-MM-DD}}, {{time}}, your own {{vars}}) and renames
// that update every link. The index rebuilds lazily when files change. Ported from Jade Vault (app/modules/vault_core.js).
import { jvDate } from './internal/date.js';

export const isNote = p => /\.(md|markdown)$/i.test(p);
export const noteName = p => String(p).slice(String(p).lastIndexOf('/') + 1).replace(/\.(md|markdown)$/i, '');
const WIKI_RE = /\[\[([^[\]\n|#]+)(#[^[\]\n|]*)?(?:\|([^[\]\n]+))?\]\]/g;
const TAG_RE = /(^|[\s(\[,;])#([A-Za-z][\w/-]*)/g;
const stripCode = md => String(md).replace(/^(```|~~~)[\s\S]*?^\1/gm, ' ').replace(/`[^`\n]*`/g, ' ').replace(/\$\$[\s\S]*?\$\$/g, ' ');
const nameKey = s => noteName(s).toLowerCase().replace(/[\s_-]+/g, ' ').trim();
/** frontmatter: { data: { key: value | [values] }, body } (simple YAML: scalars, [a, b] and - item lists) */
export function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text || ''); const data = {}; if (!m) return { data, body: text || '' };
  let key = null;
  for (const l of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(l); if (item && key) { (Array.isArray(data[key]) ? data[key] : (data[key] = [])).push(item[1].trim().replace(/^["']|["']$/g, '')); continue; }
    const kv = /^([\w-]+):\s*(.*)$/.exec(l); if (!kv) continue; key = kv[1]; const v = kv[2].trim();
    data[key] = v === '' ? [] : /^\[.*\]$/.test(v) ? v.slice(1, -1).split(',').map(x => x.trim().replace(/^["']|["']$/g, '')).filter(Boolean) : v.replace(/^["']|["']$/g, '');
  }
  return { data, body: text.slice(m[0].length) };
}

export class Notes {
  /** @param {{ kit: object, root?: string, daily?: string, templates?: string, exclude?: RegExp, onOpen?: (path: string) => void }} o daily / templates: folders */
  constructor({ kit, root = '/', daily = '/daily', templates = '/templates', exclude = /^\/\.kit\/|\/(node_modules|\.git|\.trash)\//, onOpen = null } = {}) {
    Object.assign(this, { kit, vfs: kit.vfs, root: kit.vfs.norm(root), dailyDir: kit.vfs.norm(daily), tplDir: kit.vfs.norm(templates), exclude, onOpen });
    this.idx = null; this.parsed = new Map(); this._off = kit.vfs.on(() => { this.idx = null; });
  }
  /** every note path, sorted */
  all() { const pre = this.root === '/' ? '/' : this.root + '/'; const out = []; for (const [p, n] of this.vfs.nodes) if (!n.dir && isNote(p) && (p.startsWith(pre)) && !this.exclude.test(p)) out.push(p); return out.sort(); }
  /** a link target ("Note", "folder/Note", "Note.md") → the note's path, or null */
  resolve(target, from = null) {
    let t = String(target ?? '').trim().replace(/\\/g, '/'); if (!t) return null; if (!isNote(t)) t += '.md';
    const dir = from ? this.vfs.parent(from) : this.root;
    for (const c of [this.vfs.norm(t, dir), this.vfs.norm(t, this.root)]) if (this.vfs.isFile(c)) return c;
    const notes = this.idx?.notes || this.all(), lc = t.toLowerCase(), base = lc.split('/').pop();
    let hits = notes.filter(p => p.toLowerCase().endsWith('/' + base));
    if (lc.includes('/')) { const deep = hits.filter(p => p.toLowerCase().endsWith('/' + lc.replace(/^\/+/, ''))); if (deep.length) hits = deep; }
    if (!hits.length) { const k = nameKey(base); hits = notes.filter(p => nameKey(p) === k); }
    if (!hits.length) return null;
    return hits.sort((a, b) => (this.vfs.parent(b) === dir) - (this.vfs.parent(a) === dir) || a.length - b.length || a.localeCompare(b))[0];
  }
  _parse(p) {
    const n = this.vfs.nodes.get(p); let e = this.parsed.get(p); if (e && e.node === n) return e;
    let text = ''; try { text = this.vfs.read(p); } catch {}
    const fm = frontmatter(text), body = stripCode(fm.body), wiki = [], md = [], tags = new Set();
    for (const m of body.matchAll(WIKI_RE)) { if (body[m.index - 1] === '!' && /\.\w{2,5}$/.test(m[1].trim()) && !isNote(m[1].trim())) continue; wiki.push(m[1]); }
    for (const m of body.matchAll(/\]\(([^)\s]+\.(?:md|markdown))(?:#[^)]*)?\)/gi)) { if (/^[a-z][a-z0-9+.-]*:/i.test(m[1])) continue; let x; try { x = decodeURIComponent(m[1]); } catch { x = m[1]; } md.push(x); }
    for (const m of body.matchAll(TAG_RE)) { const tg = m[2].replace(/[/-]+$/, '').toLowerCase(); if (tg) tags.add(tg); }
    for (const tg of [].concat(fm.data.tags || fm.data.tag || [])) { const x = String(tg).replace(/^#/, '').toLowerCase().trim(); if (x) tags.add(x); }
    e = { node: n, wiki, md, tags, words: (fm.body.match(/\S+/g) || []).length, meta: fm.data }; this.parsed.set(p, e); return e;
  }
  /** the index: { notes, out: Map<path, Set>, back: Map<path, Set>, missing: Map<path, Set>, tags: Map<tag, Set>, words } */
  index() {
    if (this.idx) return this.idx;
    const notes = this.all(); const idx = this.idx = { notes, out: new Map(), back: new Map(), missing: new Map(), tags: new Map(), words: 0 };
    for (const p of notes) idx.back.set(p, new Set());
    for (const p of notes) {
      const e = this._parse(p), out = new Set(), miss = new Set();
      for (const t of e.wiki) { const r = this.resolve(t, p); if (r) { if (r !== p) out.add(r); } else miss.add(t.trim()); }
      for (const t of e.md) { const r = this.resolve(t, p); if (r && r !== p) out.add(r); }
      for (const r of out) idx.back.get(r)?.add(p);
      idx.out.set(p, out); idx.missing.set(p, miss); idx.words += e.words;
      for (const tg of e.tags) { let s = idx.tags.get(tg); if (!s) idx.tags.set(tg, s = new Set()); s.add(p); }
    }
    for (const k of this.parsed.keys()) if (!idx.back.has(k)) this.parsed.delete(k);
    return idx;
  }
  /** the shortest name that links to a note unambiguously */
  linkName(p) { const n = noteName(p); return this.index().notes.filter(q => noteName(q).toLowerCase() === n.toLowerCase()).length > 1 ? p.replace(/^\//, '').replace(/\.(md|markdown)$/i, '') : n; }
  tagsOf(p) { return [...this._parse(p).tags].sort(); }
  meta(p) { return this._parse(p).meta; }
  /** ranked search: words (all must match; name matches count most, then text, then backlinks), or "#tag" → [{ path, score, snippet }] */
  search(query, limit = 20) {
    const q = String(query ?? '').trim(); if (!q) return [];
    const idx = this.index(), cand = [];
    const tagQ = /^#[\w/-]+$/.test(q) ? q.slice(1).toLowerCase() : null, terms = tagQ ? [] : q.toLowerCase().split(/\s+/).filter(Boolean);
    let tagHit = null; if (tagQ) { tagHit = new Set(); for (const [t, s] of idx.tags) if (t === tagQ || t.startsWith(tagQ + '/')) for (const p of s) tagHit.add(p); }
    for (const p of idx.notes) {
      if (tagQ && !tagHit.has(p)) continue;
      let lc; try { lc = this.vfs.read(p).toLowerCase(); } catch { continue; }
      const name = noteName(p).toLowerCase(), pl = p.toLowerCase();
      if (!tagQ && !terms.every(t => lc.includes(t) || pl.includes(t))) continue;
      let score = 0, first = -1;
      for (const t of terms) { if (name === t) score += 30; else if (name.includes(t)) score += 12; let i = -1, c = 0; while ((i = lc.indexOf(t, i + 1)) >= 0 && c < 60) { if (first < 0 || i < first) first = i; c++; } score += c; }
      if (tagQ) { first = lc.indexOf('#' + tagQ); score = 1; }
      score += Math.min(5, idx.back.get(p)?.size || 0) * 0.5; cand.push({ path: p, score, first });
    }
    cand.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
    return cand.slice(0, limit).map(c => { const text = this.vfs.read(c.path); const s = Math.max(0, (c.first < 0 ? 0 : c.first) - 50); return { path: c.path, score: c.score, snippet: (s ? '…' : '') + text.slice(s, s + 190).replace(/\s+/g, ' ').trim() + (text.length > s + 190 ? '…' : '') }; });
  }
  /** a summary of the vault */
  overview() {
    const idx = this.index(), folders = {}; for (const p of idx.notes) { const d = this.vfs.parent(p); folders[d] = (folders[d] || 0) + 1; }
    let links = 0; for (const s of idx.out.values()) links += s.size;
    const top = [...idx.back].sort((a, b) => b[1].size - a[1].size).filter(x => x[1].size).slice(0, 8).map(([p, s]) => `${noteName(p)} (${s.size})`);
    const orphans = idx.notes.filter(p => !idx.back.get(p).size && !idx.out.get(p).size);
    return { notes: idx.notes.length, links, words: idx.words, folders, tags: Object.fromEntries([...idx.tags].map(([t, s]) => [t, s.size])), mostLinked: top, orphans: orphans.length, unresolved: [...idx.missing.values()].reduce((a, s) => a + s.size, 0) };
  }
  /** a note's link graph: { path, backlinks: [{ path, line }], outgoing, unresolved, tags } */
  links(ref) {
    const p = this.vfs.isFile(this.vfs.norm(String(ref))) ? this.vfs.norm(String(ref)) : this.resolve(ref); if (!p) throw new Error(`No note named "${ref}".`);
    const idx = this.index(), name = noteName(p).toLowerCase();
    const line = q => (this.vfs.read(q).split('\n').find(l => { const L = l.toLowerCase(); return L.includes('[[' + name) || L.includes('/' + name) || L.includes('(' + noteName(p).toLowerCase().replace(/ /g, '%20')); }) || '').trim();
    return { path: p, backlinks: [...idx.back.get(p) || []].map(q => ({ path: q, line: line(q).slice(0, 200) })), outgoing: [...idx.out.get(p) || []], unresolved: [...idx.missing.get(p) || []], tags: this.tagsOf(p) };
  }
  /**
   * Rename or move a note and update every link to it ([[Old]] → [[New]], aliases and headings kept; markdown links too).
   * @returns {{ from, to, updated: string[] }}
   */
  rename(ref, to) {
    const from = this.vfs.isFile(this.vfs.norm(String(ref))) ? this.vfs.norm(String(ref)) : this.resolve(ref); if (!from) throw new Error(`No note named "${ref}".`);
    let dest = this.vfs.norm(String(to).includes('/') ? String(to) : this.vfs.parent(from) + '/' + to); if (!isNote(dest)) dest += '.md';
    if (this.vfs.exists(dest)) throw new Error(`${dest} already exists`);
    const backs = [...(this.index().back.get(from) || [])], oldName = noteName(from), oldLink = this.linkName(from);
    this.vfs.write(dest, this.vfs.readBytes(from)); this.vfs.rm(from); this.idx = null;
    const newLink = this.linkName(dest), updated = [];
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const q0 of backs) {
      const q = q0 === from ? dest : q0; const text = this.vfs.read(q);
      let out = text.replace(new RegExp(`\\[\\[(?:${esc(oldLink)}|${esc(oldName)}|${esc(from.replace(/^\//, '').replace(/\.md$/i, ''))})(\\.md)?(#[^\\]|]*)?(\\|[^\\]]*)?\\]\\]`, 'gi'), (m, ext, h, alias) => this.resolve(m.slice(2, -2).split(/[|#]/)[0], q) ? m : `[[${newLink}${h || ''}${alias || ''}]]`);
      out = out.replace(/\]\(([^)\s]+\.(?:md|markdown))(#[^)]*)?\)/gi, (m, target, h) => { let t; try { t = decodeURIComponent(target); } catch { t = target; } if (this.vfs.norm(t, this.vfs.parent(q)) !== from) return m; return `](${encodeURI(this._rel(this.vfs.parent(q), dest))}${h || ''})`; });
      if (out !== text) { this.vfs.write(q, out); updated.push(q); }
    }
    this.idx = null; return { from, to: dest, updated };
  }
  _rel(dir, p) { const A = dir.split('/').filter(Boolean), B = p.split('/').filter(Boolean); let i = 0; while (i < A.length && A[i] === B[i]) i++; return [...A.slice(i).map(() => '..'), ...B.slice(i)].join('/') || '.'; }
  /** fill a template: {{title}}, {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}}, {{yesterday}}, {{tomorrow}}, and vars */
  fill(text, { title = '', date = new Date(), vars = {} } = {}) {
    return String(text).replace(/\{\{\s*([\w.-]+)(?::([^}]*))?\s*\}\}/g, (m, k, fmt) => {
      if (k === 'title') return title; if (k === 'date') return jvDate(fmt || 'YYYY-MM-DD', date); if (k === 'time') return jvDate(fmt || 'HH:mm', date);
      if (k === 'yesterday') return jvDate(fmt || 'YYYY-MM-DD', date, -1); if (k === 'tomorrow') return jvDate(fmt || 'YYYY-MM-DD', date, 1);
      return Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m;
    });
  }
  templates() { return [...this.vfs.walk(this.tplDir)].filter(p => isNote(p) && this.vfs.isFile(p)); }
  /** make a note from a template (a name in the templates folder, or a path) → its path */
  create(path, { template = null, content = '', vars = {}, date = new Date(), overwrite = false } = {}) {
    let p = this.vfs.norm(String(path).startsWith('/') ? String(path) : this.root + '/' + path); if (!isNote(p)) p += '.md';
    if (this.vfs.exists(p) && !overwrite) throw new Error(`${p} already exists`);
    let text = content;
    if (template) { const tp = this.vfs.isFile(this.vfs.norm(template)) ? this.vfs.norm(template) : this.resolve(template, this.tplDir + '/x.md') || this.vfs.norm(this.tplDir + '/' + (isNote(template) ? template : template + '.md')); if (!this.vfs.isFile(tp)) throw new Error(`no template "${template}" (templates: ${this.templates().map(noteName).join(', ') || 'none'} in ${this.tplDir})`); text = this.vfs.read(tp) + (content ? '\n' + content : ''); }
    this.vfs.write(p, this.fill(text, { title: noteName(p), date, vars })); return p;
  }
  /** today's (or a date's) daily note, made from templates/Daily.md when there is one → its path */
  daily(date = new Date()) {
    const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date; const p = `${this.dailyDir}/${jvDate('YYYY-MM-DD', d)}.md`;
    if (this.vfs.isFile(p)) return p;
    const tpl = this.templates().find(x => /^daily$/i.test(noteName(x)));
    return this.create(p, tpl ? { template: tpl, date: d } : { content: `# {{date:dddd D MMMM YYYY}}\n\n## Notes\n\n## Tasks\n`, date: d });
  }
  /** open tasks (- [ ] …) across the notes: [{ path, line, text }] */
  tasks({ done = false } = {}) {
    const out = []; for (const p of this.index().notes) this.vfs.read(p).split('\n').forEach((l, i) => { const m = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(l); if (m && (m[1] !== ' ') === done) out.push({ path: p, line: i + 1, text: m[2].trim() }); });
    return out;
  }
  get toolDefs() {
    const resolveArg = a => String(a.note || a.path || '');
    return {
      notes_search: { description: 'Search the notes (markdown files) by words, ranked by name and text matches; "#tag" lists notes with that tag; an empty query gives an overview (counts, folders, tags, most-linked notes). Search before creating a note, to avoid duplicates.',
        parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer' } } },
        run: a => { const q = String(a.query || '').trim(); if (!q) { const o = this.overview(); return `${o.notes} notes, ${o.links} links, ${o.words} words, ${o.orphans} orphans, ${o.unresolved} unresolved links.\nFolders: ${Object.entries(o.folders).map(([d, n]) => `${d} (${n})`).join(', ') || 'none'}\nTags: ${Object.entries(o.tags).map(([t, n]) => `#${t} (${n})`).join(', ') || 'none'}\nMost linked: ${o.mostLinked.join(', ') || 'none'}\nNotes:\n${this.index().notes.slice(0, 200).join('\n')}`; } const r = this.search(q, Math.min(+a.limit || 10, 30)); return r.length ? r.map(x => `${x.path}  →  [[${this.linkName(x.path)}]]\n  ${x.snippet}`).join('\n') : `No notes match "${q}".`; } },
      note_links: { description: 'The link graph around one note: backlinks (with the line that links), outgoing links, unresolved [[links]] to notes that do not exist yet, and tags.',
        parameters: { type: 'object', properties: { note: { type: 'string', description: 'a name or path' } }, required: ['note'] },
        run: a => { const l = this.links(resolveArg(a)); return `${l.path}  ([[${this.linkName(l.path)}]])\nBacklinks (${l.backlinks.length}):\n${l.backlinks.map(b => `- ${b.path}: ${b.line}`).join('\n') || '- none'}\nOutgoing (${l.outgoing.length}):\n${l.outgoing.map(q => '- ' + q).join('\n') || '- none'}\nUnresolved (${l.unresolved.length}):\n${l.unresolved.map(m => `- [[${m}]]`).join('\n') || '- none'}\nTags: ${l.tags.map(t => '#' + t).join(' ') || 'none'}`; } },
      note: { description: 'Work with notes: daily (today\'s daily note, or date YYYY-MM-DD; made from the Daily template if there is one), create (path, template?, content?, vars?), rename (note, to: a new name or path; every link is updated), templates (list), tasks (open "- [ ]" tasks across notes), open (show a note to the user).',
        parameters: { type: 'object', properties: { action: { type: 'string', enum: ['daily', 'create', 'rename', 'templates', 'tasks', 'open'] }, note: { type: 'string' }, path: { type: 'string' }, to: { type: 'string' }, template: { type: 'string' }, content: { type: 'string' }, vars: { type: 'object' }, date: { type: 'string' } }, required: ['action'] },
        run: a => {
          if (a.action === 'daily') { const p = this.daily(a.date || new Date()); return `${p}\n\n${this.vfs.read(p)}`; }
          if (a.action === 'create') { const p = this.create(a.path || a.note, { template: a.template, content: a.content || '', vars: a.vars || {} }); return `Created ${p}`; }
          if (a.action === 'rename') { const r = this.rename(resolveArg(a), a.to); return `Renamed ${r.from} → ${r.to}; updated links in ${r.updated.length} note${r.updated.length === 1 ? '' : 's'}${r.updated.length ? ': ' + r.updated.join(', ') : ''}.`; }
          if (a.action === 'templates') { const t = this.templates(); return t.length ? t.join('\n') : `No templates in ${this.tplDir}.`; }
          if (a.action === 'tasks') { const t = this.tasks(); return t.length ? t.slice(0, 200).map(x => `${x.path}:${x.line}  - [ ] ${x.text}`).join('\n') : 'No open tasks.'; }
          if (a.action === 'open') { const p = this.resolve(resolveArg(a)) || this.vfs.norm(resolveArg(a)); if (!this.vfs.isFile(p)) throw new Error(`No note named "${resolveArg(a)}".`); if (!this.onOpen) return `${p} (this app does not show notes; here is the text)\n\n${this.vfs.read(p)}`; this.onOpen(p); return `Opened ${p} for the user.`; }
          throw new Error('unknown action ' + a.action);
        } },
    };
  }
  plugin() {
    return { name: 'notes', tools: ['notes_search', 'note_links', 'note'],
      system: () => { const o = this.overview(); return o.notes ? `\n\nThe user's notes: ${o.notes} markdown notes${this.root === '/' ? '' : ' under ' + this.root} with [[wiki links]] and #tags. Search them (notes_search) before writing a new one; link related notes with [[Note Name]].` : ''; } };
  }
}
