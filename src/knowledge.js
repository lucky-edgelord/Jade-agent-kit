// A knowledge graph: facts like works_at(alice, acme), rules and constraints, and a reasoner that proves answers
// (✓ proven with the facts and rules it rests on, ✗ contradicted, ? unknown). The reasoner is Jade's Rust engine
// (assets/jade_kg.wasm, ~400 KB, fetched on first use). Files, plain text:
//   <root>/facts.jsonl   one fact per line: {"id","fact","status","by","source","ts"}; status confirmed | proposed | rejected
//   <root>/rules.dl      rules and constraints
// Facts an agent adds are "proposed" until your app (or its user) confirms them; answers name unconfirmed facts they rest on.
import { assetUrl, fetchBytes } from './util.js';

const RULES_SEED = `% Rules and constraints. Facts live in facts.jsonl.
%   rule:        head :- condition, condition.        (variables start with a capital letter)
%   constraint:  ! name: condition, condition.         (any match is a contradiction)
%   conditions:  relation(a, X)   not relation(a, X)   X = Y   X != Y   X < Y   X <= Y   X > Y   X >= Y
% Examples (delete the % to use one):
% above(X, Y) :- reports_to(X, Y).
% above(X, Z) :- reports_to(X, Y), above(Y, Z).
% ! one_birthday: born_on(P, A), born_on(P, B), A != B.
`;
export const ACTIONS = ['verify', 'query', 'why', 'check', 'add', 'facts', 'rules', 'add_rule', 'remove', 'stats'];
const enc = new TextEncoder(), dec = new TextDecoder();
let ENGINE = null;   // one WebAssembly instance per page

/** the raw engine: await kgEngine() → call({ op, … }) → JSON (throws on { ok: false }) */
export async function kgEngine(url = assetUrl('jade_kg.wasm')) {
  ENGINE ||= (async () => {
    const { instance } = await WebAssembly.instantiate(await fetchBytes(url, 'the knowledge engine'), {});
    return instance.exports;
  })().catch(e => { ENGINE = null; throw new Error('the knowledge engine could not start: ' + (e?.message || e)); });
  const x = await ENGINE;
  return function call(req) {
    const inp = enc.encode(JSON.stringify(req)); const p = x.kg_alloc(inp.length); let out;
    try { new Uint8Array(x.memory.buffer, p, inp.length).set(inp); const q = x.kg_call(p, inp.length); out = JSON.parse(dec.decode(new Uint8Array(x.memory.buffer, q, x.kg_out_len()))); }
    catch (e) { ENGINE = null; throw new Error('the knowledge engine stopped: ' + (e?.message || e)); }
    finally { try { x.kg_free(p, inp.length); } catch {} }
    if (!out.ok) { const e = new Error(out.error); e.code = out.code; throw e; }
    return out;
  };
}

export class Knowledge {
  /** @param {{ kit: object, root?: string, verifyMode?: boolean }} o verifyMode: ask the agent to check its factual claims */
  constructor({ kit, root = '/.kit/knowledge', verifyMode = false } = {}) {
    Object.assign(this, { kit, vfs: kit.vfs, root: kit.vfs.norm(root), verifyMode });
    this.factsPath = this.root + '/facts.jsonl'; this.rulesPath = this.root + '/rules.dl'; this.h = 0; this.sig = ''; this.stats = null;
  }
  async call(req) { this._call ||= await kgEngine(); try { return this._call(req); } catch (e) { if (/stopped/.test(e.message)) { this._call = null; this.h = 0; } throw e; } }
  ensure() { if (!this.vfs.isFile(this.rulesPath)) this.vfs.write(this.rulesPath, RULES_SEED); if (!this.vfs.isFile(this.factsPath)) this.vfs.write(this.factsPath, ''); }
  _read(p) { return this.vfs.isFile(p) ? this.vfs.read(p) : ''; }
  /** every fact: [{ id, fact, status, by, source, ts }] */
  facts() { return this._read(this.factsPath).split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => { try { return JSON.parse(l); } catch { return { id: 'bad' + i, fact: '', status: 'rejected', bad: l }; } }).filter(f => f.id); }
  _save(list) { this.vfs.write(this.factsPath, list.map(f => JSON.stringify({ id: f.id, fact: f.fact, status: f.status, by: f.by || '', source: f.source || '', ts: f.ts || new Date().toISOString() })).join('\n') + (list.length ? '\n' : '')); this.sig = ''; }
  rules() { this.ensure(); return this._read(this.rulesPath); }
  /** the loaded graph's handle (reloaded when the files change) */
  async load() {
    this.ensure();
    const rules = this._read(this.rulesPath), facts = this._read(this.factsPath), sig = rules + '\u0000' + facts;
    if (this.h && this.sig === sig) return this.h;
    if (this.h) { this.call({ op: 'free', handle: this.h }).catch(() => {}); this.h = 0; }
    try { const r = await this.call({ op: 'load', rules, facts: this.facts().filter(f => f.fact), rules_source: 'rules.dl' }); this.h = r.handle; this.sig = sig; this.stats = r.stats; return this.h; }
    catch (e) { this.sig = ''; throw new Error(`the knowledge graph has a problem: ${e.message}. Fix it in ${e.message.startsWith('fact ') ? this.factsPath : this.rulesPath}.`); }
  }
  async _factText(a) {
    if (a.fact) return (await this.call({ op: 'parse_fact', fact: String(a.fact) })).fact;
    if (a.subject == null || a.relation == null || a.object == null) throw new Error('add needs "fact", like works_at(alice, acme), or subject, relation and object');
    const v = x => (typeof x === 'number' ? x : String(x).trim());
    const rel = String(a.relation).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'r_$1') || 'related_to';
    const f = await this.call({ op: 'format', values: [v(a.subject), v(a.object)] });
    return (await this.call({ op: 'parse_fact', fact: `${rel}(${f.values[0]}, ${f.values[1]})` })).fact;
  }
  /**
   * Add a fact: by 'user' (confirmed) or 'agent' (proposed until confirmed). → { id, fact, status, note }
   * @param {{ fact?: string, subject?, relation?, object?, source?: string }} a
   */
  async add(a, by = 'user') {
    const fact = await this._factText(typeof a === 'string' ? { fact: a } : a); const list = this.facts(); const old = list.find(f => f.fact === fact);
    if (old) {
      if (by === 'user' && old.status !== 'confirmed') { old.status = 'confirmed'; old.by = 'user'; this._save(list); return { ...old, note: 'confirmed' }; }
      return { ...old, note: old.status === 'rejected' ? 'rejected before; it stays out' : 'already in the graph' };
    }
    const f = { id: 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), fact, status: by === 'user' ? 'confirmed' : 'proposed', by, source: String(a.source || (by === 'user' ? 'entered' : 'chat')).slice(0, 200), ts: new Date().toISOString() };
    list.push(f); this._save(list);
    try { await this.load(); } catch (e) { this._save(this.facts().filter(x => x.id !== f.id)); throw e; }
    return { ...f, note: 'added' };
  }
  /** confirm or reject proposed facts by id → how many changed */
  setStatus(ids, status) { const set = new Set([].concat(ids)); const list = this.facts(); let n = 0; for (const f of list) if (set.has(f.id) && f.status !== status) { f.status = status; n++; } if (n) this._save(list); return n; }
  confirm(ids) { return this.setStatus(ids, 'confirmed'); }
  reject(ids) { return this.setStatus(ids, 'rejected'); }
  remove(ids) { const set = new Set([].concat(ids)); const list = this.facts(); const keep = list.filter(f => !set.has(f.id)); if (keep.length !== list.length) this._save(keep); return list.length - keep.length; }
  /** append a rule or constraint (checked first) */
  async addRule(text, comment = '') {
    text = String(text || '').trim(); if (!text) throw new Error('add_rule needs a rule, like  above(X, Z) :- reports_to(X, Y), above(Y, Z).');
    const next = this.rules().replace(/\n*$/, '\n') + (comment ? `% ${String(comment).replace(/\n/g, ' ')}\n` : '') + (text.endsWith('.') ? text : text + '.') + '\n';
    const r = await this.call({ op: 'parse_rules', rules: next });
    this.vfs.write(this.rulesPath, next); this.sig = ''; await this.load();
    return r;
  }
  async verify(claim) { return this.call({ op: 'verify', handle: await this.load(), claim: String(claim) }); }
  async query(q, limit = 50) { return this.call({ op: 'query', handle: await this.load(), q: String(q), limit }); }
  async why(fact) { return this.call({ op: 'why', handle: await this.load(), fact: String(fact) }); }
  async check() { return this.call({ op: 'check', handle: await this.load() }); }
  async info() { return this.call({ op: 'stats', handle: await this.load() }); }
  /** the tool's handler */
  async tool(a) {
    const action = String(a.action || 'stats').toLowerCase();
    if (!ACTIONS.includes(action)) throw new Error(`unknown action ${action}: use ${ACTIONS.join(', ')}`);
    if (action === 'add') {
      const items = Array.isArray(a.facts) ? a.facts.slice(0, 50) : [a]; const out = [];
      for (const it of items) { try { const r = await this.add(typeof it === 'string' ? { fact: it, source: a.source } : { source: a.source, ...it }, 'agent'); out.push(`${r.fact}: ${r.note === 'added' ? `proposed (id ${r.id})` : r.note}`); } catch (e) { out.push(`${it.fact || it.subject || it}: not added (${e.message})`); } }
      return out.join('\n') + '\nYour facts are proposed until they are confirmed; answers say when they rest on unconfirmed facts.';
    }
    if (action === 'facts') {
      const q = String(a.match || '').toLowerCase(); const lim = Math.min(200, +a.limit || 60);
      const list = this.facts().filter(f => f.fact && (!a.status || f.status === a.status) && (!q || f.fact.toLowerCase().includes(q) || (f.source || '').toLowerCase().includes(q)));
      return list.length ? `${list.length} fact${list.length > 1 ? 's' : ''}${list.length > lim ? ` (first ${lim})` : ''}:\n` + list.slice(0, lim).map(f => `- [${f.id}] ${f.fact} (${f.status}${f.source ? ', ' + f.source : ''})`).join('\n') : 'No facts match.';
    }
    if (action === 'rules') return '```\n' + this.rules() + '\n```';
    if (action === 'add_rule') { const r = await this.addRule(a.rule || a.text, a.comment); return `Saved to ${this.rulesPath}. Now ${r.rules} rule${r.rules === 1 ? '' : 's'} and ${r.constraints} constraint${r.constraints === 1 ? '' : 's'}. Run check to see whether the facts break a constraint.`; }
    if (action === 'remove') {
      const ids = [].concat(a.id || a.ids || []).map(String); const list = this.facts();
      const mine = ids.filter(id => { const f = list.find(x => x.id === id); return f && f.by === 'agent' && f.status === 'proposed'; });
      const n = this.remove(mine); const refused = ids.filter(id => !mine.includes(id));
      return `Removed ${n}.` + (refused.length ? ` Not removed: ${refused.join(', ')} (only your own unconfirmed facts).` : '');
    }
    if (action === 'stats') { const s = await this.info(); return `${s.facts} facts (${s.confirmed} confirmed, ${s.proposed} proposed), ${s.derived} more follow from ${s.rules} rule${s.rules === 1 ? '' : 's'}; ${s.constraints} constraint${s.constraints === 1 ? '' : 's'}.` + (s.relations?.length ? `\nRelations: ${s.relations.map(r => `${r.name}/${r.arity} (${r.count})`).join(', ')}` : ''); }
    if (action === 'check') return (await this.check()).text;
    if (action === 'why') return (await this.why(a.fact || a.claim || '')).text;
    if (action === 'query') return (await this.query(a.q || a.query || '', +a.limit || 50)).text;
    const claims = Array.isArray(a.claims) ? a.claims.slice(0, 30).map(String) : [String(a.claim || a.fact || '')];
    const out = []; for (const c of claims) { try { out.push((await this.verify(c)).text); } catch (e) { out.push(`! ${c}: ${e.message}`); } }
    return out.join('\n\n');
  }
  get toolDefs() {
    return { knowledge: {
      description: 'Knowledge graph: facts (relation(a, b)), rules, constraints and a reasoner that proves answers. verify claim(s): ✓ PROVEN with what it rests on, ✗ CONTRADICTED, or ? UNKNOWN (never treat unknown as false). query: conditions with variables, e.g. above(bob, X). why: the proof of a fact. check: constraint violations. add facts (proposed until confirmed; snake_case relations, lowercase names, "quoted text"). facts, rules, add_rule, remove (your unconfirmed facts), stats (relations in use).',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ACTIONS }, claim: { type: 'string' }, claims: { type: 'array', items: { type: 'string' } }, q: { type: 'string' }, fact: { type: 'string' }, facts: { type: 'array', items: { type: 'string' } }, subject: { type: 'string' }, relation: { type: 'string' }, object: { type: 'string' }, source: { type: 'string' }, rule: { type: 'string' }, comment: { type: 'string' }, status: { type: 'string', enum: ['confirmed', 'proposed', 'rejected'] }, match: { type: 'string' }, id: { type: 'string' }, limit: { type: 'integer' } }, required: ['action'] },
      run: a => this.tool(a),
    } };
  }
  plugin({ verifyMode = this.verifyMode } = {}) {
    return { name: 'knowledge', tools: ['knowledge'],
      system: () => verifyMode ? '\n\nVerify mode is on: before stating facts the knowledge graph could cover, check them with knowledge verify and mark each such claim ✓ proven, ✗ contradicted or ? unknown; say when a proof rests on unconfirmed facts.' : '' };
  }
}
