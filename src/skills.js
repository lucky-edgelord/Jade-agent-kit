// Steering and skills, in files (pi style):
//   <root>/SOUL.md       persona: voice, values (added to every prompt)
//   /AGENTS.md, <root>/AGENTS.md   standing instructions (added to every prompt)
//   <root>/SYSTEM.md     optional: replaces the agent's base system prompt
//   <root>/skills/<name>/SKILL.md  skills: frontmatter name + description, listed in the prompt, loaded on demand with
//                        the skill tool (or "/skill:name …" in a message, see expand())
// With many skills (more than allMax), each prompt lists only the ones that best fit the message, and the agent gets a
// find_skill tool for the rest (BM25 on name + description; with { embed } also by meaning).
// HTML comments (<!-- -->) in these files are notes for people and never reach the model.
import { BM25 } from './bm25.js';

const STOP = new Set('a an and are as at be by can do does for from has have how i in into is it its me my of on or our so than that the their then there these they this to up us was we what when where which who why will with would you your please help want need make get'.split(' '));
const strip = t => String(t).replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
export function parseFront(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text || ''); const meta = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
  return { meta, body: m ? text.slice(m[0].length) : (text || '') };
}
export const SKILL_CREATOR = `---
name: skill-creator
description: Create or improve a skill. Use when the user asks for a new skill, workflow, routine or recipe the agent should follow, or wants to change an existing one.
---
# Skill creator
A skill is a folder {skills}/<kebab-case-name>/ with SKILL.md, plus optional files (templates, examples) that SKILL.md refers to by relative path.
1. Ask what the skill should do and when it should trigger, unless the user already said.
2. List {skills} so you do not duplicate a skill; edit a close one instead.
3. Write {skills}/<name>/SKILL.md:
   ---
   name: <name>
   description: <what it does>. Use when <the situations or phrases that should trigger it>.
   ---
   # <Title>
   Numbered, concrete steps using your real tools. Name exact paths and formats.
4. The description decides when the skill is used, so make it specific.
`;

export class Skills {
  /**
   * @param {{ kit: object, root?: string, agentsFiles?: string[], allMax?: number, top?: number, embed?: string|false, off?: string[] }} o
   *   allMax: list every skill up to this many (default 15); top: how many to list past that (default 6)
   *   embed: an Ollama embedding model to also match skills by meaning; off: skill names to ignore
   */
  constructor({ kit, root = '/.kit', agentsFiles = null, allMax = 15, top = 6, embed = false, off = [] } = {}) {
    const r = kit.vfs.norm(root);
    Object.assign(this, { kit, vfs: kit.vfs, root: r, allMax, top, embed, off: new Set(off) });
    this.paths = { soul: r + '/SOUL.md', system: r + '/SYSTEM.md', skills: r + '/skills', agents: agentsFiles || ['/AGENTS.md', r + '/AGENTS.md'] };
    this.stats = {}; this._vec = null;
  }
  _read(p, cap = 8000) { if (!this.vfs.isFile(p)) return ''; let t = strip(this.vfs.read(p)); if (t.length > cap) t = t.slice(0, cap) + '\n…(truncated)'; return t; }
  /** write the skill-creator skill (and nothing else) if it is missing */
  seed() { const p = `${this.paths.skills}/skill-creator/SKILL.md`; if (!this.vfs.isFile(p)) this.vfs.write(p, SKILL_CREATOR.replaceAll('{skills}', this.paths.skills)); return p; }
  /** [{ name, description, path, dir, off }] */
  list() {
    const out = [];
    for (const k of this.vfs.walk(this.paths.skills)) {
      if (!/\/skill\.md$/i.test(k) || !this.vfs.isFile(k) || this.vfs.parent(this.vfs.parent(k)) !== this.paths.skills) continue;
      const { meta, body } = parseFront(this.vfs.read(k)); const name = (meta.name || this.vfs.base(this.vfs.parent(k))).trim();
      out.push({ name, description: meta.description || (body.split('\n').find(l => l.trim() && !l.startsWith('#')) || '').trim().slice(0, 200), path: k, dir: this.vfs.parent(k), off: this.off.has(name) });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  active() { return this.list().filter(s => !s.off); }
  find(name) {
    const n = String(name || '').trim().replace(/^\/?skill:/i, '').toLowerCase(); if (!n) return null;
    const all = this.list(); const k = s => s.toLowerCase().replace(/[\s_-]+/g, '-');
    return all.find(s => s.name.toLowerCase() === n) || all.find(s => k(s.name) === k(n)) || all.find(s => this.vfs.base(s.dir).toLowerCase() === n) || null;
  }
  /** a skill's instructions, as the skill tool returns them */
  load(name, input = '') {
    const s = this.find(name);
    if (!s) throw new Error(`No skill named "${name}". Available: ${this.active().map(x => x.name).join(', ') || 'none'}`);
    if (s.off) throw new Error(`The skill "${s.name}" is turned off.`);
    (this.stats[s.name] ||= { offered: 0, used: 0, found: 0 }).used++;
    const extra = [...this.vfs.walk(s.dir)].filter(p => p !== s.path && this.vfs.isFile(p));
    return `Skill "${s.name}" loaded from ${s.path}. Follow these instructions now.${extra.length ? `\nOther files in this skill (read them when the steps refer to them): ${extra.join(', ')}` : ''}${input ? `\nInput: ${input}` : ''}\n\n${strip(parseFront(this.vfs.read(s.path)).body)}`;
  }
  /** "/skill:name rest of message" → { text, skill } with the skill's instructions in the text; null for other messages */
  expand(text) {
    const m = /^\/skill:([^\s]+)\s*([\s\S]*)$/i.exec(String(text).trim()); if (!m) return null;
    const s = this.find(m[1]); if (!s) throw new Error(`No skill called "${m[1]}". Skills: ${this.active().map(x => x.name).join(', ') || 'none'}`);
    return { skill: s.name, text: `${this.load(s.name)}\n\n---\nThe user's request: ${m[2] || '(run the skill)'}` };
  }
  /** persona, standing instructions, custom system prompt */
  steering() {
    return { system: this.vfs.isFile(this.paths.system) ? strip(parseFront(this.vfs.read(this.paths.system)).body) : '',
      soul: this._read(this.paths.soul, 6000).replace(/^---[\s\S]*?---\s*/, '').replace(/^# SOUL\s*/i, ''),
      agents: this.paths.agents.map(p => ({ path: p, text: this._read(p, 6000).replace(/^# AGENTS\s*/i, '') })).filter(a => a.text) };
  }
  routed() { return this.active().length > this.allMax; }
  /** skills that fit a request, best first → { skills, note } */
  async search(query, k = this.top, { strict = false } = {}) {
    const all = this.active(); const byName = new Map(all.map(s => [s.name, s]));
    const q = String(query || '').split(/\s+/).filter(w => w && !STOP.has(w.toLowerCase().replace(/[^a-z0-9]/g, ''))).join(' ') || String(query || '');
    const score = new Map(); const add = (names, w) => names.forEach((n, i) => score.set(n, (score.get(n) || 0) + w / (60 + i + 1)));
    add(new BM25(all.map(s => ({ id: s.name, text: `${s.name.replace(/[-_]/g, ' ')} ${s.description}` }))).match(q, { limit: k * 3 }).map(d => d.id), 1);
    let note = '';
    if (this.embed) {
      try {
        if (!this._vec) this._vec = (await this.kit.use('vectors')).open(':memory:', { model: this.embed, table: 'skills' });
        const store = await this._vec; const have = new Map(store.db.query(`select id, text from ${store.t}`).map(r => [r.id, r.text]));
        const want = all.map(s => ({ id: s.name, text: `${s.name}: ${s.description}`.slice(0, 600) })).filter(d => have.get(d.id) !== d.text);
        if (want.length) await store.add(want);
        const near = await store.search(q, { limit: k * 3 });
        add(near.filter(h => !strict || h.distance < 0.6 || score.has(h.id)).map(h => h.id).filter(n => byName.has(n)), 1.2);
      } catch (e) { note = `meaning search unavailable (${e.message}); word match only`; }
    }
    const names = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(e => e[0]);
    return { skills: names.map(n => byName.get(n)), note };
  }
  /** the block for a system prompt: persona, instructions, and the skills (all, or the ones that fit the query) */
  async context(query = '') {
    const st = this.steering(); let out = '';
    if (st.soul) out += `\n\nYour persona (from ${this.paths.soul}; this is who you are, keep this voice):\n${st.soul}`;
    for (const a of st.agents) out += `\n\nStanding instructions from the user (${a.path}; always follow them):\n${a.text}`;
    const all = this.active(); if (!all.length) return out;
    const line = s => `- ${s.name}: ${String(s.description).slice(0, 160)}`;
    let list;
    if (!this.routed()) list = all.map(line).join('\n');
    else {
      const hits = query.trim() ? (await this.search(query, this.top, { strict: true })).skills : [];
      for (const s of hits) (this.stats[s.name] ||= { offered: 0, used: 0, found: 0 }).offered++;
      list = (hits.map(line).join('\n') || '- (none matched this message)') + `\n(You have ${all.length} skills; these fit this message best. If none fits, call find_skill with a short description of the job.)`;
    }
    return out + `\n\nSkills (instruction packs in ${this.paths.skills}). When a request matches a skill's description, FIRST call the skill tool with its name, then follow the instructions it returns step by step:\n${list}`;
  }
  get toolDefs() {
    return {
      skill: { description: 'Load a skill (an instruction pack) by name and follow what it returns. Use it when a request matches a skill in your instructions.',
        parameters: { type: 'object', properties: { name: { type: 'string' }, input: { type: 'string', description: 'optional: what to run it on' } }, required: ['name'] },
        run: a => this.load(a.name || a.skill, a.input) },
      find_skill: { description: 'Search your skills by what you want to do, when the skills listed in your instructions do not show one that fits. Returns the best matching names and descriptions; then load one with the skill tool.',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'a short description of the job' }, limit: { type: 'integer' } }, required: ['query'] },
        run: async a => {
          const q = String(a.query || '').trim(); if (!q) throw new Error('find_skill needs a query');
          const r = await this.search(q, Math.max(1, Math.min(10, +a.limit || 6)));
          if (!r.skills.length) return `No skill matches "${q}". There are ${this.active().length} skills.`;
          for (const s of r.skills) (this.stats[s.name] ||= { offered: 0, used: 0, found: 0 }).found++;
          return `Skills that fit "${q}" (load one with the skill tool):\n` + r.skills.map(s => `- ${s.name}: ${String(s.description).slice(0, 220)}`).join('\n') + (r.note ? `\n(${r.note})` : '');
        } },
    };
  }
  /** an agent plugin: persona, instructions and skills in the prompt; SYSTEM.md replaces the base prompt; the skill tools */
  plugin() {
    const self = this;
    return { name: 'skills', get tools() { return self.active().length ? (self.routed() ? ['skill', 'find_skill'] : ['skill']) : []; },
      system: async (agent, { query }) => {
        agent.state.baseSystem ??= agent.system;
        const custom = self.steering().system; agent.system = custom || agent.state.baseSystem;
        return self.context(query);
      } };
  }
}
