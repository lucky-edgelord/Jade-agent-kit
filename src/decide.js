// Decisions: decision models judge a state against a question with calibrated probabilities (System One API,
// POST /v1/systemone). Three servers:
//   'ollaya'  Ollaya (default http://localhost:11435): options as a list, the answer names the chosen option
//   'ollama'  Ollama 0.35+ on a machine: options as an object { key: description }, the answer names the key,
//             and a yes/no answer is the probability of true
//   'cloud'   Ollama Cloud (https://ollama.com, API key, model clef): Ollama's format, models named without ":cloud"
// Requests and answers are translated so kit.decide() returns the same shape whichever server answers.
import { OLLAMA_CLOUD, OLLAMA_LOCAL } from './ollama.js';

export const OLLAYA_LOCAL = 'http://localhost:11435';
const DECIDERS = /^(clef|clef-flash|laya|jev|nimble|tev1|kev|winnow|largha|decider)(?=$|[:\-])/i;
const NAMES = { ollaya: 'Ollaya', ollama: 'Ollama', cloud: 'Ollama Cloud' };

// Ollama keys: the option itself when short and unique, else option_N
const keyOf = (opts, i) => { const o = String(opts[i]).trim(); const k = o.length && o.length <= 100 ? o : `option_${i + 1}`; return opts.findIndex(x => String(x).trim() === o) === i ? k : `option_${i + 1}`; };
/** Ollaya-shaped request → Ollama's (and the key ↔ option maps for the answers) */
export function toOllama(body, cloud) {
  const maps = {}, questions = {};
  for (const [name, q] of Object.entries(body.questions || {})) {
    const nq = { ...q };
    if ((q.type || 'choice') === 'choice' && Array.isArray(q.criteria)) {
      const keys = q.criteria.map((_, i) => keyOf(q.criteria, i));
      nq.criteria = Object.fromEntries(keys.map((k, i) => [k, String(q.criteria[i])]));
      maps[name] = { keys, opts: q.criteria.map(String) };
    }
    questions[name] = nq;
  }
  let model = String(body.model || ''); if (cloud) model = model.replace(/[:\-]cloud$/i, '');
  return { req: { ...body, model, questions }, maps };
}
/** Ollama's answer → Ollaya's shape: the chosen option's text, probabilities keyed by option, noul as yes/no */
export function fromOllama(a, m) {
  if (!a || typeof a !== 'object') return a;
  const out = { ...a };
  if ('choice' in a && m) {
    const i = typeof a.choice === 'number' ? a.choice : m.keys.indexOf(String(a.choice));
    if (i >= 0 && i < m.opts.length) out.choice = m.opts[i];
    if (a.probabilities && !Array.isArray(a.probabilities)) out.probabilities = Object.fromEntries(m.keys.map((k, j) => [m.opts[j], +(a.probabilities[k] ?? 0)]));
  }
  if (typeof a.noul === 'number') {
    const p = Math.max(0, Math.min(1, a.noul));
    out.noul = p >= 0.5; out.p_true = p;
    out.probabilities = { no: +(1 - p).toFixed(6), yes: +p.toFixed(6) };
    if (out.confidence == null) out.confidence = +Math.max(p, 1 - p).toFixed(6);
  }
  return out;
}

export class Decisions {
  /**
   * @param {{ server?: 'ollaya'|'ollama'|'cloud', host?: string, apiKey?: string, model?: string, kit?: object }} o
   * host: the server's address (Ollaya default http://localhost:11435; Ollama: the kit's local Ollama). apiKey: Ollaya's
   * key, or for the cloud a key other than the kit's Ollama Cloud key.
   */
  constructor({ server = 'ollaya', host = '', apiKey = '', model = '', kit = null } = {}) { Object.assign(this, { server, host, apiKey, model, kit }); }
  get name() { return NAMES[this.server] || this.server; }
  get base() {
    if (this.server === 'cloud') return OLLAMA_CLOUD;
    if (this.server === 'ollama') return String(this.host || this.kit?.local?.host || OLLAMA_LOCAL).replace(/\/+$/, '');
    return String(this.host || OLLAYA_LOCAL).replace(/\/+$/, '');
  }
  get key() { return this.server === 'cloud' ? (this.apiKey || this.kit?.ollama?.apiKey || '') : this.apiKey; }
  get headers() { const h = { 'Content-Type': 'application/json' }; if (this.key) h.Authorization = 'Bearer ' + this.key; return h; }
  async _fetch(path, init = {}) {
    if (!['ollaya', 'ollama', 'cloud'].includes(this.server)) throw new Error(`unknown decision server "${this.server}": use ollaya, ollama or cloud`);
    if (this.server === 'cloud' && !this.key) throw new Error('no Ollama Cloud API key for decisions: createKit({ ollamaKey }) or kit.decisions.apiKey = …');
    try { return await fetch(this.base + path, { ...init, headers: this.headers }); }
    catch (e) {
      if (e?.name === 'AbortError') throw e;
      if (this.server === 'cloud') throw new Error(`could not reach Ollama Cloud (${e.message})`);
      const n = this.server; throw new Error(`could not reach ${this.name} at ${this.base}. Is "${n} serve" running? If it is, the browser blocked the request: start it with ${n.toUpperCase()}_ORIGINS set to this page's origin (or "*").`);
    }
  }
  async _err(r, model) {
    let m = `HTTP ${r.status}`; try { const j = await r.json(); m = (j.error || m) + (j.detail ? ' — ' + JSON.stringify(j.detail).slice(0, 300) : ''); } catch {}
    if (r.status === 401) m += this.server === 'cloud' ? ' (the Ollama Cloud API key was rejected)' : this.server === 'ollaya' ? ' (the API key was rejected: OLLAYA_API_KEY)' : ' (the request was refused)';
    else if (r.status === 402) m += ' (cloud decision models need a paid Ollama plan or usage credits)';
    else if (r.status === 403) m += ` (${this.name} refused this page's origin: set ${this.server.toUpperCase()}_ORIGINS)`;
    else if (r.status === 404) m += this.server === 'cloud' ? ` (Ollama Cloud has no decision model "${model}"; try clef)` : this.server === 'ollama' ? ' (decision models need Ollama 0.35 or newer, and the model pulled: ollama pull clef-flash)' : ` (pull the model: ollaya pull ${model || '<model>'})`;
    return new Error(`${this.name} said ${r.status}: ${m}`);
  }
  /** the decision models the server offers (on Ollama and Ollama Cloud, only decision models, not chat models) */
  async models() {
    const r = await this._fetch('/api/tags'); if (!r.ok) throw await this._err(r);
    const ms = ((await r.json()).models || []).map(m => ({ name: m.name || m.model, caps: m.capabilities || m.details?.capabilities })).filter(m => m.name);
    if (this.server === 'ollaya') return ms.map(m => m.name);
    let names = ms.filter(m => (Array.isArray(m.caps) && m.caps.includes('decision')) || DECIDERS.test(m.name)).map(m => m.name);
    if (this.server === 'cloud') { names = names.map(n => n.replace(/[:\-]cloud$/i, '')); if (!names.includes('clef')) names.unshift('clef'); }
    return [...new Set(names)];
  }
  /** the raw System One call (Ollaya's request shape in, Ollaya's answer shape out) */
  async systemone(body, { signal } = {}) {
    const ollama = this.server !== 'ollaya';
    let req = body, maps = {};
    if (ollama) ({ req, maps } = toOllama(body, this.server === 'cloud'));
    const r = await this._fetch('/v1/systemone', { method: 'POST', body: JSON.stringify(req), signal });
    if (!r.ok) throw await this._err(r, req.model);
    const j = await r.json();
    if (!ollama) return j;
    return { ...j, answers: Object.fromEntries(Object.entries(j.answers || {}).map(([k, a]) => [k, fromOllama(a, maps[k])])) };
  }
  /**
   * Decide one question about a state.
   * @param {{ state: any, question: string, type?: 'choice'|'score'|'yesno', options?: string[]|string, model?: string, signal?: AbortSignal }} o
   *   choice: pick one of options (2-255) · score: options are 2-10 levels, lowest first · yesno: no options
   * @returns {Promise<{ type, result, choice?, score?, legend?, answer?, confidence: number|null, probabilities: object, model: string, server: string }>}
   */
  async decide({ state = '', question = '', type = 'choice', options, model, signal } = {}) {
    model ||= this.model || (this.server === 'cloud' ? 'clef' : '');
    if (!model) throw new Error(`no decision model: kit.decisions.model = '…' (list them with kit.decisions.models())`);
    const t = type === 'yesno' ? 'noul' : type;
    const q = { type: t, instructions: String(question || '') };
    const opts = (Array.isArray(options) ? options : typeof options === 'string' ? options.split('\n') : []).map(String).map(x => x.trim()).filter(Boolean);
    if (t === 'choice') { if (opts.length < 2) throw new Error('type "choice" needs at least 2 options'); q.criteria = opts.slice(0, 255); }
    else if (t === 'score') { if (opts.length < 2) throw new Error('type "score" needs 2-10 level descriptions, lowest first'); q.criteria = opts.slice(0, 10); }
    else if (t !== 'noul') throw new Error('type must be choice, score or yesno');
    const j = await this.systemone({ model, state: typeof state === 'string' ? state : JSON.stringify(state ?? ''), questions: { q } }, { signal });
    const a = j.answers?.q; if (!a) throw new Error(`${this.name} returned no answer`);
    const probabilities = Array.isArray(a.probabilities) ? Object.fromEntries(a.probabilities.map((v, i) => [String(i), +v])) : Object.fromEntries(Object.entries(a.probabilities || {}).map(([k, v]) => [k, +v]));
    const out = { type: type === 'yesno' ? 'yesno' : t, confidence: a.confidence != null ? +a.confidence : null, probabilities, model: j.model || model, server: this.server };
    if ('choice' in a) { out.choice = a.choice; out.result = a.choice; }
    if ('score' in a) { out.score = a.score; out.result = a.score; if (a.legend != null) out.legend = a.legend; }
    if ('noul' in a) { out.answer = a.noul; out.result = a.noul; }
    return out;
  }
}
