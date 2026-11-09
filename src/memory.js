// Long-term memory, in plain files an app (or its user) can read and edit:
//   <root>/Memory.md                durable facts, one bullet per line, under ## sections
//   <root>/journal/YYYY-MM-DD.md    episodic memory: a short entry per finished chat, written by the model
// Search ranks lines with BM25; with { embed: 'embeddinggemma' } it also searches by meaning (Ollama + sqlite-vec).
import { BM25, tokenize } from './bm25.js';
import { complete, transcript, today, cap } from './internal/llm.js';

export const SECTIONS = { about: 'About the user', preferences: 'Preferences', projects: 'Projects & people', notes: 'Notes to self', learned: 'Learned from chats' };
const TEMPLATE = `# Memory\n\nThe agent reads this at the start of every chat. One fact per line; edit freely.\n\n${Object.values(SECTIONS).map(s => `## ${s}\n`).join('\n')}`;
const JOURNAL_SYS = `You keep an AI assistant's diary. Read the chat and reply in exactly this format:
SUMMARY:
- 2 to 5 short bullets: what the user wanted, what was done or decided, files created or changed, anything left open.
REMEMBER:
- 0 to 4 bullets of durable facts about the user worth knowing in future chats: who they are, preferences, ongoing projects, people, goals, standing instructions. Only facts the user stated or clearly implied. Never passwords, keys or other secrets. Write "- none" if there are none.
No other text.`;
const key = s => String(s).toLowerCase().replace(/\(\d{4}-\d{2}-\d{2}\)/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const SECRET = /\b(password|passwd|api[ _-]?key|secret|token|private key|seed phrase|ssn|credit card)\b\s*[:=]|\b(sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

export class Memory {
  /**
   * @param {{ kit: object, root?: string, rag?: number, budget?: number, embed?: string|false, journal?: boolean }} o
   *   rag: put only the N best-matching lines in the prompt (0: the newest lines up to budget characters)
   *   embed: an Ollama embedding model to also search by meaning; journal: write a journal entry after each prompt
   */
  constructor({ kit, root = '/.kit/memory', rag = 8, budget = 2600, embed = false, journal = false } = {}) {
    Object.assign(this, { kit, vfs: kit.vfs, root: kit.vfs.norm(root), rag, budget, embed, journalOn: journal });
    this.path = this.root + '/Memory.md'; this.jdir = this.root + '/journal'; this._idx = null; this._vec = null; this._marks = new Map();
  }
  ensure() { if (!this.vfs.isFile(this.path)) this.vfs.write(this.path, TEMPLATE); }
  /** the facts: [{ section, text, line }] */
  lines() {
    if (!this.vfs.isFile(this.path)) return [];
    let sec = ''; const out = [];
    for (const line of this.vfs.read(this.path).split('\n')) {
      const h = /^##\s+(.+)/.exec(line); if (h) { sec = h[1].trim(); continue; }
      const b = /^\s*[-*]\s+(.+)/.exec(line); if (b && b[1].trim()) out.push({ section: sec, text: b[1].trim(), line });
    }
    return out;
  }
  /** remember a fact (skips duplicates and anything that looks like a secret) → { added, message } */
  save(text, section = 'notes') {
    this.ensure();
    text = String(text || '').replace(/\s+/g, ' ').replace(/^[-*]\s+/, '').trim();
    if (!text) throw new Error('save needs text');
    if (SECRET.test(text)) return { added: false, message: 'Not saved: it looks like a password, key or other secret. Memory never keeps those.' };
    const k = key(text);
    const dup = this.lines().find(m => { const mk = key(m.text); return mk === k || (k.length > 12 && mk.length > 12 && (mk.includes(k) || k.includes(mk))); });
    if (dup) return { added: false, message: `Already remembered: "${dup.text}"` };
    const head = SECTIONS[String(section).toLowerCase()] || Object.values(SECTIONS).find(s => s.toLowerCase() === String(section).toLowerCase()) || String(section || '').trim() || SECTIONS.notes;
    const lines = this.vfs.read(this.path).split('\n');
    let i = lines.findIndex(l => /^##\s+/.test(l) && l.replace(/^##\s+/, '').trim().toLowerCase() === head.toLowerCase());
    if (i < 0) { while (lines.length && !lines.at(-1).trim()) lines.pop(); lines.push('', '## ' + head); i = lines.length - 1; }
    let j = i + 1; while (j < lines.length && !/^##\s/.test(lines[j])) j++;
    while (j > i + 1 && !lines[j - 1].trim()) j--;
    lines.splice(j, 0, `- ${text} (${today()})`);
    this.vfs.write(this.path, lines.join('\n').replace(/\n{3,}/g, '\n\n'));
    return { added: true, message: `Saved under "${head}": ${text}` };
  }
  /** forget the lines matching text (at most 3 at once) */
  forget(text) {
    const k = key(text); if (!k) throw new Error('forget needs the text (or part of it) to remove');
    const hits = this.lines().filter(m => key(m.text).includes(k));
    if (!hits.length) throw new Error(`Nothing in memory matches "${text}".`);
    if (hits.length > 3) throw new Error(`${hits.length} memories match "${text}"; be more specific:\n${hits.map(h => '- ' + h.text).join('\n')}`);
    const drop = new Set(hits.map(h => h.line));
    this.vfs.write(this.path, this.vfs.read(this.path).split('\n').filter(l => !drop.has(l)).join('\n'));
    return `Forgot ${hits.length}: ${hits.map(h => `"${h.text}"`).join(', ')}`;
  }
  /** every searchable line: the facts, then the journal (newest day first) */
  docs() {
    const out = this.lines().map((m, i) => ({ id: 'm' + i, src: 'memory', head: m.section, text: m.text }));
    const days = [...this.vfs.walk(this.jdir)].filter(p => /\.md$/.test(p) && this.vfs.isFile(p)).sort().reverse();
    for (const p of days) { let head = ''; for (const l of this.vfs.read(p).split('\n')) { if (/^#{1,3}\s/.test(l)) { head = l.replace(/^#+\s*/, ''); continue; } if (l.trim() && !/^#journal/.test(l)) out.push({ id: p + ':' + out.length, src: this.vfs.base(p).replace(/\.md$/, ''), head, text: l.trim().replace(/^[-*]\s+/, '') }); } }
    return out;
  }
  async _vectors() {
    if (!this.embed) return null;
    this._vec ||= (await this.kit.use('vectors')).open(this.root + '/memory.db', { model: this.embed, table: 'memory' });
    return this._vec;
  }
  /** bring the meaning index in step with the files (only new or changed lines are embedded) */
  async sync() {
    const store = await this._vectors(); if (!store) return 0;
    const docs = this.docs(); const want = new Map(docs.map(d => [d.src + '\u0000' + d.text, d]));
    const have = new Set(store.db.query(`select id from ${store.t}`).map(r => r.id));
    const add = [...want.keys()].filter(k => !have.has(k)).map(k => ({ id: k, text: want.get(k).text, meta: { src: want.get(k).src, head: want.get(k).head } }));
    const gone = [...have].filter(k => !want.has(k)); if (gone.length) store.remove(gone);
    if (add.length) await store.add(add);
    if (add.length || gone.length) store.save();
    return add.length;
  }
  /** search memory and the journal: [{ src, head, text, score }] (keywords, plus meaning when embed is set) */
  async search(query, { limit = 12 } = {}) {
    const docs = this.docs(); if (!docs.length) return [];
    const kw = new BM25(docs).match(query, { limit: limit * 3 }).map(d => ({ ...d, score: d.score + (d.src === 'memory' ? 0.25 : 0) })).sort((a, b) => b.score - a.score);
    if (!this.embed) return kw.slice(0, limit).map(({ src, head, text, score }) => ({ src, head, text, score: +score.toFixed(3) }));
    let near = [];
    try { await this.sync(); near = await (await this._vectors()).search(query, { limit: limit * 3 }); } catch (e) { this.lastError = e.message; }
    const fused = new Map(); const add = (list, f) => list.forEach((r, i) => { const d = f(r); const k = d.src + '\u0000' + d.text; const x = fused.get(k) || { ...d, score: 0 }; x.score += 1 / (60 + i + 1); fused.set(k, x); });
    add(kw, d => ({ src: d.src, head: d.head, text: d.text })); add(near.filter(n => n.distance < 0.75), n => ({ src: n.meta?.src, head: n.meta?.head, text: n.text }));
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit).map(d => ({ ...d, score: +d.score.toFixed(4) }));
  }
  /** the block for a system prompt: the lines that best match the query (or the newest), and the latest journal */
  async context(query = '') {
    const mem = this.lines(); let lines, note;
    if (this.rag) {
      const idx = this._idx?.n === mem.length && this._idx?.k === mem.map(m => m.text).join('\n') ? this._idx : (this._idx = { n: mem.length, k: mem.map(m => m.text).join('\n'), bm: new BM25(mem.map((m, i) => ({ id: i, text: m.text }))) });
      let hits = query.trim() && tokenize(query).length ? idx.bm.match(query, { limit: this.rag }).map(h => mem[h.id]) : [];
      if (this.embed && query.trim()) { try { const s = await this.search(query, { limit: this.rag }); const fromMem = s.filter(x => x.src === 'memory').map(x => mem.find(m => m.text === x.text)).filter(Boolean); if (fromMem.length) hits = [...new Set([...fromMem, ...hits])].slice(0, this.rag); } catch {} }
      if (hits.length) { lines = hits; note = `the ${hits.length} of ${mem.length} lines that best match the user's message`; }
      else { lines = mem.slice(-5); note = mem.length > lines.length ? `the newest ${lines.length} of ${mem.length} lines` : ''; }
    } else {
      let used = 0; lines = [];
      for (const m of mem.slice().reverse()) { if (used + m.text.length + 4 > this.budget) break; lines.unshift(m); used += m.text.length + 4; }
      note = lines.length < mem.length ? `the newest ${lines.length} of ${mem.length} lines` : '';
    }
    const days = [...this.vfs.walk(this.jdir)].filter(p => /\.md$/.test(p) && this.vfs.isFile(p)).sort().slice(-2);
    let jr = days.map(p => this.vfs.read(p).replace(/^#[^\n]*\n/, '').replace(/#journal/g, '').trim()).join('\n').trim();
    if (jr.length > 1400) jr = '…' + jr.slice(-1400);
    return `\n\nLong-term memory (${this.path}${note ? '; ' + note : ''}; use the memory tool to search for more, save new facts and forget wrong ones):\n${lines.map(m => `- ${m.text}${m.section ? ` [${m.section}]` : ''}`).join('\n') || '(empty so far)'}` +
      (jr ? `\n\nRecent journal (earlier chats; memory search finds older ones):\n${jr}` : '');
  }
  /**
   * Write a journal entry for a conversation and remember the durable facts it names.
   * @param {object[]} messages the chat (an agent's messages) @param {{ title?: string, id?: string, summary?: string, client?, model? }} [o]
   * @returns {Promise<{ path: string, learned: number } | null>}
   */
  async journal(messages, { title = 'Chat', id = null, summary = null, client = null, model = null } = {}) {
    const from = id ? this._marks.get(id) || 0 : 0; const fresh = messages.slice(from);
    if (!summary && (fresh.filter(m => m.role === 'user').length < 1 || fresh.length < 2)) return null;
    let out = summary;
    if (!out) { let text = transcript(fresh); if (text.length > 14000) text = '[…]\n' + text.slice(-14000); out = await complete(this.kit, { system: JOURNAL_SYS, prompt: `Chat title: ${title}\n\n${text}`, temperature: 0.2, client, model }); }
    if (String(out).trim().length < 10) throw new Error('the model wrote an empty journal entry');
    const m = /SUMMARY:\s*([\s\S]*?)(?:\n\s*REMEMBER:\s*([\s\S]*))?$/i.exec(out);
    const sum = (m ? m[1] : out).trim();
    const facts = m?.[2] ? m[2].split('\n').map(l => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(l => l && !/^none\.?$/i.test(l) && l.length < 300) : [];
    const day = today(), p = `${this.jdir}/${day}.md`, t = new Date();
    if (!this.vfs.isFile(p)) this.vfs.write(p, `# Journal ${day}\n\n#journal\n`);
    this.vfs.write(p, this.vfs.read(p) + `\n## ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} · ${cap(String(title).replace(/\n/g, ' '), 70)}\n${sum}\n`);
    let learned = 0; for (const f of facts) if (this.save(f, 'learned').added) learned++;
    if (id) this._marks.set(id, messages.length);
    return { path: p, learned };
  }
  /** the tool's handler */
  async tool(a) {
    const act = String(a.action || 'list').toLowerCase();
    if (['save', 'remember', 'add'].includes(act)) return this.save(a.text ?? a.fact, a.section || 'notes').message;
    if (['forget', 'remove', 'delete'].includes(act)) return this.forget(a.text ?? a.query);
    if (['search', 'recall'].includes(act)) {
      const r = await this.search(a.query ?? a.text ?? '', { limit: Math.min(30, +a.limit || 12) });
      return r.length ? r.map(x => `${x.src === 'memory' ? 'memory' : 'journal ' + x.src}${x.head ? ' · ' + x.head : ''}: ${cap(x.text, 300)}`).join('\n') : 'Nothing found in memory or the journal.';
    }
    if (act === 'list') { this.ensure(); return this.vfs.read(this.path); }
    throw new Error(`unknown action "${act}" (use save, search, forget or list)`);
  }
  get toolDefs() {
    return { memory: {
      description: `Long-term memory across chats (${this.path} and a journal of past chats). save: remember a durable fact about the user or the work (one short sentence; never secrets). search: recall facts and past chats. forget: remove a wrong or outdated fact. list: the whole memory file.`,
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['save', 'search', 'forget', 'list'] }, text: { type: 'string', description: 'save: the fact; forget: the text to remove' }, query: { type: 'string' }, section: { type: 'string', enum: Object.keys(SECTIONS) }, limit: { type: 'integer' } }, required: ['action'] },
      run: a => this.tool(a),
    } };
  }
  /** an agent plugin: memory in the system prompt, the memory tool, and (journal: true) a journal entry after each prompt */
  plugin({ journal = this.journalOn } = {}) {
    return { name: 'memory', tools: ['memory'],
      system: (agent, { query }) => this.context(query),
      after: async agent => { if (journal) await this.journal(agent.messages, { title: agent.title, id: agent.id, client: agent.client, model: agent.model }); } };
  }
}
