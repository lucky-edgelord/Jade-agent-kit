// Flows: small n8n-style automations. A flow is a JSON file <root>/<name>.flow.json:
//   { "name", "description", "enabled", "trigger": {"type": "manual"|"schedule"|"file", "when", "path"},
//     "vars": {…}, "timeout": seconds, "steps": [ step, … ] }
// Steps run in order; each one's output is $json for the next. if / switch / each hold nested steps. Strings may hold
// {{ expressions }} (JavaScript in a sandboxed worker: no network, no files, no tools) over $json, $input, $node, $vars,
// $item, $index, $now, $today, $flow, $run and $date(fmt, date, days). Ported from Jade Vault (app/modules/flows.js).
import { Cron } from './internal/cron_core.js';
import { complete } from './internal/llm.js';
import { jvDate } from './internal/date.js';

const EXT = '.flow.json', MAX_STEPS = 5000, MAX_DEPTH = 5;
// field: [key, label, kind, placeholder, required]. kinds: tpl, area, code, expr, json, bool, num, sel:<a|b>, tool, flowsel, pbsel
export const TYPES = {
  tool: { help: 'Call one of the kit\'s tools. Output: what the tool returns (text, or JSON with "parse": true).', fields: [['tool', 'Tool', 'tool', '', true], ['args', 'Arguments', 'json'], ['parse', 'Parse JSON', 'bool']] },
  js: { help: 'JavaScript in the node sandbox (fs, path, fetch, kit.*). $json, $input, $node, $vars, $item are set. Output: the returned value (or what it printed).', fields: [['code', 'Code', 'code', '', true], ['timeout', 'Timeout (s)', 'num']] },
  shell: { help: 'A command line in the shell. Output: {code, stdout, stderr}. A non-zero exit fails the step unless allowFail.', fields: [['command', 'Command', 'tpl', '', true], ['cwd', 'Folder', 'tpl'], ['allowFail', 'Allow failure', 'bool'], ['timeout', 'Timeout (s)', 'num']] },
  decide: { help: 'A decision model: calibrated probabilities. Output: {result, choice|score|answer, confidence, probabilities}.', fields: [['state', 'Text to judge', 'area', '{{ $json }}', true], ['question', 'Question', 'tpl', '', true], ['kind', 'Kind', 'sel:choice|score|yesno'], ['options', 'Options (one per line)', 'lines']] },
  llm: { help: 'One answer from the model (no tools). Output: the text, or parsed JSON with "json": true.', fields: [['prompt', 'Prompt', 'area', '', true], ['system', 'System', 'area'], ['json', 'Expect JSON', 'bool']] },
  agent: { help: 'An agent run (tools and all) on a message. Output: {reply}.', fields: [['prompt', 'Message', 'area', '', true], ['brain', 'Brain (list)', 'json']] },
  file: { help: 'Read or write a file. read → its text; write / append / prepend → {path, bytes}.', fields: [['action', 'Action', 'sel:read|write|append|prepend'], ['path', 'Path', 'tpl', '', true], ['content', 'Content', 'area']] },
  set: { help: 'Build an object. Output: the fields (merged into the incoming object with "keep": true).', fields: [['fields', 'Fields', 'json', '', true], ['keep', 'Keep incoming', 'bool']] },
  if: { help: 'Runs "then" or "else". Output: the last output of the branch that ran.', fields: [['condition', 'Condition', 'expr', '', true]], branches: ['then', 'else'] },
  switch: { help: 'Runs the first case whose "match" equals the value (or one of a list), else "default".', fields: [['value', 'Value', 'expr', '', true]], cases: true },
  each: { help: 'Runs "steps" once per item ($item, $index; $json starts as the item). Output: the list of results.', fields: [['items', 'List', 'expr', '', true]], branches: ['steps'] },
  wait: { help: 'Pause (up to 300 s). Output: unchanged.', fields: [['seconds', 'Seconds', 'num', '', true]] },
  notify: { help: 'Tell the user (kit.notify). Output: unchanged.', fields: [['title', 'Title', 'tpl'], ['body', 'Message', 'area']] },
  playbook: { help: 'Run an approved playbook (no model). Output: its result {ok, recap, vars, log}; a failed playbook fails the step.', fields: [['playbook', 'Playbook', 'pbsel', '', true], ['vars', 'Vars', 'json']] },
  flow: { help: 'Run another flow. Output: its output.', fields: [['flow', 'Flow', 'flowsel', '', true], ['input', 'Input (default $json)', 'json']] },
  stop: { help: 'End the flow (successfully). Output: the value, or $json.', fields: [['value', 'Result', 'tpl']] },
};

export { jvDate };

/* ---------- expressions: a small sandboxed worker (no network, no files, no tools) ---------- */
function exprMain() {
  self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.EventSource = undefined; self.importScripts = undefined;
  const cache = new Map();
  const fn = src => { let f = cache.get(src); if (!f) { f = new Function('$', '$date', 'with ($) { return (' + src + '\n); }'); cache.set(src, f); } return f; };
  const str = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  const tpl = (s, $) => { const one = /^\s*\{\{([\s\S]+?)\}\}\s*$/.exec(s); if (one && s.indexOf('{{') === s.lastIndexOf('{{')) return fn(one[1])($, $date); return s.replace(/\{\{([\s\S]+?)\}\}/g, (_, e) => str(fn(e)($, $date))); };
  self.onmessage = e => {
    const { id, jobs, ctx } = e.data; const out = []; let i = 0;
    try { for (; i < jobs.length; i++) out.push(jobs[i].mode === 'expr' ? fn(jobs[i].src)(ctx, $date) : tpl(jobs[i].src, ctx)); self.postMessage({ id, ok: true, out: JSON.parse(JSON.stringify(out, (k, v) => v === undefined ? null : v)) }); }
    catch (err) { self.postMessage({ id, ok: false, error: (err && err.message) || String(err), src: jobs[i] && jobs[i].src }); }
  };
}
const EX = { w: null, seq: 0, pend: new Map() };
function exprWorker() {
  if (EX.w) return EX.w;
  const w = new Worker(URL.createObjectURL(new Blob([`const $date = ${jvDate.toString()};\n(${exprMain.toString()})();`], { type: 'text/javascript' })), { name: 'flow expressions' });
  w.onmessage = e => { const p = EX.pend.get(e.data.id); if (!p) return; EX.pend.delete(e.data.id); clearTimeout(p.t); e.data.ok ? p.res(e.data.out) : p.rej(new Error(`${e.data.src ? `{{ ${String(e.data.src).trim().slice(0, 80)} }}: ` : ''}${e.data.error}`)); };
  w.onerror = e => { e.preventDefault?.(); const msg = 'expression error: ' + (e.message || 'syntax error'); for (const [id, p] of EX.pend) { clearTimeout(p.t); p.rej(new Error(msg)); EX.pend.delete(id); } };
  return (EX.w = w);
}
/** evaluate jobs [{ src, mode: 'expr'|'tpl' }] against a context, in the sandbox */
export function evalJobs(jobs, ctx) {
  if (!jobs.length) return Promise.resolve([]);
  let payload; try { payload = JSON.parse(JSON.stringify(ctx, (k, v) => v === undefined ? null : v)); } catch (e) { return Promise.reject(new Error('the data could not be passed to the expressions: ' + e.message)); }
  return new Promise((res, rej) => {
    const id = ++EX.seq; const w = exprWorker();
    const t = setTimeout(() => { try { w.terminate(); } catch {} EX.w = null; for (const [k, p] of EX.pend) { clearTimeout(p.t); if (k !== id) p.rej(new Error('expression worker restarted')); } EX.pend.clear(); rej(new Error('an expression ran longer than 5 s (an endless loop?)')); }, 5000);
    EX.pend.set(id, { res, rej, t }); w.postMessage({ id, jobs, ctx: payload });
  });
}

class FlowStop { constructor(v) { this.value = v; } }
class FlowStepError extends Error {}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clipV = (v, n = 2000) => { if (v === undefined) return null; let s; try { s = typeof v === 'string' ? v : JSON.stringify(v); } catch { s = String(v); } if (s == null) return null; return s.length <= n ? (typeof v === 'string' ? v : JSON.parse(s)) : s.slice(0, n) + `… [${s.length - n} more characters]`; };
const lines = v => (Array.isArray(v) ? v : typeof v === 'string' ? v.split('\n') : v == null ? [] : [v]).map(x => typeof x === 'string' ? x.trim() : JSON.stringify(x)).filter(Boolean);
const matchV = (m, v) => Array.isArray(m) ? m.some(x => matchV(x, v)) : m === v || String(m) === String(v) || (m && typeof m === 'object' && JSON.stringify(m) === JSON.stringify(v));
export function walkSteps(steps, fn, path = 'steps') {
  (Array.isArray(steps) ? steps : []).forEach((st, i) => {
    const p = `${path}.${i}`; fn(st, p); if (!st || typeof st !== 'object') return;
    for (const k of ['then', 'else', 'steps', 'default']) if (Array.isArray(st[k])) walkSteps(st[k], fn, `${p}.${k}`);
    if (Array.isArray(st.cases)) st.cases.forEach((c, j) => walkSteps(c?.steps, fn, `${p}.cases.${j}.steps`));
  });
}

export class Flows {
  /** @param {{ kit: object, root?: string, tick?: number, watchDelay?: number }} o tick: how often schedules are checked (ms); watchDelay: quiet time before a file trigger fires */
  constructor({ kit, root = '/.kit/flows', tick = 15000, watchDelay = 1500 } = {}) {
    Object.assign(this, { kit, vfs: kit.vfs, root: kit.vfs.norm(root), tickMs: tick, watchDelay });
    this.active = new Map(); this.recent = []; this.next = new Map(); this.sig = new Map(); this.busy = new Set(); this.listeners = new Set(); this.started = false;
  }
  /* ---------- storage ---------- */
  safe(n) { return String(n || '').trim().replace(/[\\/:*?"<>|#^[\]]+/g, '-').replace(/\s+/g, ' ').slice(0, 80) || 'Flow'; }
  files() { return [...this.vfs.walk(this.root)].filter(p => p.endsWith(EXT) && this.vfs.isFile(p)).sort(); }
  read(p) { const base = this.vfs.base(p).slice(0, -EXT.length); try { const f = JSON.parse(this.vfs.read(p)); if (!f || typeof f !== 'object' || Array.isArray(f)) throw new Error('not a JSON object'); return { ...f, name: String(f.name || base), _path: p }; } catch (e) { return { name: base, _path: p, _bad: e.message, steps: [] }; } }
  list() { return this.files().map(p => this.read(p)); }
  get(name) { const k = String(name ?? '').trim().toLowerCase(); if (!k) return null; const all = this.list(); return all.find(f => f.name.toLowerCase() === k) || all.find(f => f._path.toLowerCase() === k || this.vfs.base(f._path).toLowerCase() === k + EXT) || null; }
  clean(f) {
    const strip = v => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, strip(x)])) : v;
    const out = strip(f); out.steps = Array.isArray(out.steps) ? out.steps : []; const used = new Set(); let n = 0;
    walkSteps(out.steps, st => { if (st && typeof st === 'object' && st.id) { if (used.has(st.id)) delete st.id; else used.add(String(st.id)); } });
    walkSteps(out.steps, st => { if (st && typeof st === 'object' && !st.id) { do n++; while (used.has('s' + n)); st.id = 's' + n; used.add(st.id); } });
    const order = ['name', 'description', 'enabled', 'trigger', 'vars', 'timeout', 'steps'];
    return Object.fromEntries([...order.filter(k => k in out).map(k => [k, out[k]]), ...Object.entries(out).filter(([k]) => !order.includes(k))]);
  }
  /** save a flow (validated) → the saved flow */
  save(f, oldPath = null) {
    const errs = this.validate(f); if (errs.length) throw new Error('the flow is not valid:\n- ' + errs.join('\n- '));
    const clean = this.clean(f); clean.name = String(clean.name || '').trim() || 'Flow';
    const p = `${this.root}/${this.safe(clean.name)}${EXT}`; this.vfs.write(p, JSON.stringify(clean, null, 2) + '\n');
    if (oldPath && oldPath !== p && this.vfs.isFile(oldPath)) this.vfs.rm(oldPath);
    this.next.delete(p); this.sig.delete(p); this._arm(); return { ...clean, _path: p };
  }
  remove(name) { const f = this.get(name); if (!f) throw new Error(`no flow named "${name}"`); this.vfs.rm(f._path); this.next.delete(f._path); this.sig.delete(f._path); return true; }
  /* ---------- validation ---------- */
  validate(f) {
    const errs = [];
    if (!f || typeof f !== 'object' || Array.isArray(f)) return ['the flow must be a JSON object'];
    if (f._bad) return [`the file is not valid JSON: ${f._bad}`];
    if (!String(f.name || '').trim()) errs.push('the flow needs a "name"');
    if (!Array.isArray(f.steps)) errs.push('"steps" must be a list of steps');
    const tr = f.trigger == null ? { type: 'manual' } : f.trigger;
    if (typeof tr !== 'object') errs.push('"trigger" must be an object like {"type": "manual"}');
    else {
      const t = tr.type || 'manual';
      if (!['manual', 'schedule', 'file'].includes(t)) errs.push('trigger.type must be manual, schedule or file');
      if (t === 'schedule') { try { const spec = Cron.fromText(String(tr.when || '')); if (spec.once) errs.push('trigger.when must repeat (like "every day at 9am" or a cron line), not one date'); } catch (e) { errs.push('trigger.when: ' + e.message); } }
      if (t === 'file' && !String(tr.path || '').trim()) errs.push('trigger.path: which file or folder to watch');
    }
    if (f.vars != null && (typeof f.vars !== 'object' || Array.isArray(f.vars))) errs.push('"vars" must be an object');
    const ids = new Set(), tools = this.kit.tools ? this.kit.tools.known() : null;
    walkSteps(f.steps, (st, p) => {
      if (!st || typeof st !== 'object' || Array.isArray(st)) { errs.push(`${p}: each step must be an object`); return; }
      const where = `${p} (${st.name || st.id || st.type || '?'})`;
      const T = TYPES[st.type]; if (!T) { errs.push(`${where}: unknown type "${st.type}". Types: ${Object.keys(TYPES).join(', ')}`); return; }
      if (st.id != null) { if (ids.has(String(st.id))) errs.push(`${where}: the id ${st.id} is used twice`); ids.add(String(st.id)); }
      for (const [k, , kind, , req] of T.fields) {
        const v = st[k];
        if (req && (v == null || (typeof v === 'string' && !v.trim()))) errs.push(`${where}: "${k}" is required`);
        if (kind === 'json' && v != null && typeof v === 'string' && !v.includes('{{')) errs.push(`${where}: "${k}" must be JSON (an object or list), or a {{ }} expression`);
        if (kind === 'num' && v != null && v !== '' && !Number.isFinite(+v)) errs.push(`${where}: "${k}" must be a number`);
        if (kind.startsWith('sel:') && v != null && v !== '' && !kind.slice(4).split('|').includes(v)) errs.push(`${where}: "${k}" must be one of ${kind.slice(4).split('|').join(', ')}`);
      }
      if (st.type === 'tool' && st.tool) { if (st.tool === 'flow') errs.push(`${where}: use a "flow" step to run another flow`); else if (tools && !tools.includes(st.tool)) errs.push(`${where}: no tool named "${st.tool}"`); }
      if (st.type === 'tool' && st.args != null && (typeof st.args !== 'object' || Array.isArray(st.args))) errs.push(`${where}: "args" must be an object`);
      if (st.type === 'set' && st.fields != null && (typeof st.fields !== 'object' || Array.isArray(st.fields))) errs.push(`${where}: "fields" must be an object`);
      if (st.type === 'switch' && st.cases != null && (!Array.isArray(st.cases) || st.cases.some(c => !c || typeof c !== 'object'))) errs.push(`${where}: "cases" must be a list of {"match": value, "steps": [...]}`);
      for (const k of ['then', 'else', 'steps', 'default']) if (st[k] != null && !Array.isArray(st[k])) errs.push(`${where}: "${k}" must be a list of steps`);
      if (st.onError != null && !['stop', 'continue'].includes(st.onError)) errs.push(`${where}: onError must be "stop" or "continue"`);
      if (st.retries != null && !(Number.isInteger(+st.retries) && +st.retries >= 0 && +st.retries <= 3)) errs.push(`${where}: retries must be 0-3`);
    });
    return errs;
  }
  /* ---------- running ---------- */
  view(ctx) { const d = new Date(); return { ...ctx, $now: d.toISOString(), $today: jvDate('YYYY-MM-DD', d) }; }
  async resolve(st, ctx) {
    const T = TYPES[st.type]; const jobs = [], sets = [], out = {};
    const add = (src, mode, set) => { jobs.push({ src, mode }); sets.push(set); };
    const walk = (v, set) => {
      if (typeof v === 'string') { if (v.includes('{{')) add(v, 'tpl', set); else set(v); }
      else if (Array.isArray(v)) { const a = v.slice(); set(a); a.forEach((x, i) => walk(x, y => { a[i] = y; })); }
      else if (v && typeof v === 'object') { const o = { ...v }; set(o); for (const k of Object.keys(o)) walk(o[k], y => { o[k] = y; }); }
      else set(v);
    };
    for (const [k, , kind] of T.fields) {
      const v = st[k]; if (v === undefined || v === null) continue;
      if (kind === 'expr') { const src = String(v).trim().replace(/^\{\{([\s\S]*)\}\}$/, '$1').trim(); if (src) add(src, 'expr', x => { out[k] = x; }); }
      else if (['code', 'bool', 'num', 'tool', 'flowsel', 'pbsel'].includes(kind) || kind.startsWith('sel:')) out[k] = v;
      else walk(v, x => { out[k] = x; });
    }
    const vals = await evalJobs(jobs, this.view(ctx)); vals.forEach((x, i) => sets[i](x));
    return out;
  }
  _emit(run) { for (const f of this.listeners) { try { f(run); } catch {} } }
  /** listen to runs as they progress: kit.flows.on(run => …) */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  /**
   * Run a flow (by name, or a flow object) → the run: { id, flow, status: 'ok'|'error'|'stopped', output, error, steps: [...] }
   * @param {string|object} flow @param {any} [input] @param {{ via?: string, depth?: number }} [o]
   */
  async run(flow, input = null, o = {}) {
    if (typeof flow === 'string') { const f = this.get(flow); if (!f) throw new Error(`no flow named "${flow}"`); flow = f; }
    const run = { id: Math.random().toString(36).slice(2, 10), flow: flow.name, path: flow._path || null, via: o.via || 'manual', started: Date.now(), ended: 0, status: 'running', input: input ?? null, output: null, error: null, steps: [], stop: false };
    const errs = this.validate(flow);
    if (errs.length || (o.depth || 0) > MAX_DEPTH) { run.status = 'error'; run.error = errs.length ? 'the flow is not valid: ' + errs.join('; ') : 'flows call each other too deeply'; run.ended = Date.now(); this._record(run); return run; }
    this.active.set(run.id, run); this._emit(run);
    const ctx = { $input: input ?? null, $json: input ?? null, $node: {}, $vars: flow.vars && typeof flow.vars === 'object' ? flow.vars : {}, $flow: { name: flow.name }, $run: { id: run.id, via: run.via }, $item: null, $index: null };
    const st = { run, flow, depth: o.depth || 0, deadline: Date.now() + Math.min(3600, Math.max(5, +flow.timeout || 600)) * 1000, count: 0, ctrl: new AbortController() };
    run.abort = () => { run.stop = true; st.ctrl.abort(); };
    try { run.output = await this._seq(flow.steps || [], ctx, st); run.status = 'ok'; }
    catch (e) { if (e instanceof FlowStop) { run.output = e.value; run.status = 'ok'; run.stopped = true; } else { run.status = run.stop ? 'stopped' : 'error'; run.error = String(e?.message || e); } }
    finally { run.ended = Date.now(); this.active.delete(run.id); delete run.abort; this._record(run); }
    return run;
  }
  /** stop a running flow */
  stop(id) { const r = this.active.get(id); if (r) r.abort?.(); return !!r; }
  _record(run) { const copy = { ...run, input: clipV(run.input, 4000), output: clipV(run.output, 8000), steps: run.steps.slice(0, 300) }; delete copy.stop; this.recent = [copy, ...this.recent.filter(r => r.id !== run.id)].slice(0, 100); this._emit(run); }
  runs({ name = null, limit = 10 } = {}) { const f = name ? this.get(name) : null; return this.recent.filter(r => !f || r.path === f._path).slice(0, limit); }
  async _seqIn(steps, ctx, st) { st.level = (st.level || 0) + 1; try { return await this._seq(steps, ctx, st); } finally { st.level--; } }
  async _seq(steps, ctx, st) {
    let last = ctx.$json;
    for (const step of steps || []) {
      if (st.run.stop) throw new Error('stopped');
      if (Date.now() > st.deadline) throw new Error(`the flow ran past its time limit (${Math.round((st.deadline - st.run.started) / 1000)} s)`);
      if (++st.count > MAX_STEPS) throw new Error('too many steps ran (an endless loop?)');
      last = await this._step(step, ctx, st); ctx.$json = last;
    }
    return last;
  }
  async _step(step, ctx, st) {
    const label = String(step.name || step.id || step.type);
    const rec = { id: step.id || null, name: label, type: step.type, depth: st.level || 0, status: 'running', started: Date.now(), ms: 0, input: clipV(ctx.$json, 1500) };
    st.run.steps.push(rec); this._emit(st.run);
    const keep = out => { if (step.name) ctx.$node[step.name] = out; if (step.id) ctx.$node[step.id] = out; };
    if (step.disabled) { rec.status = 'skipped'; rec.output = rec.input; keep(ctx.$json); return ctx.$json; }
    const tries = ['if', 'switch', 'each'].includes(step.type) ? 1 : Math.min(3, Math.max(0, step.retries | 0)) + 1; let err;
    for (let a = 0; a < tries; a++) {
      try { const out = await this._exec(step, ctx, st, rec); rec.status = 'ok'; rec.ms = Date.now() - rec.started; rec.output = clipV(out, 1500); keep(out); this._emit(st.run); return out; }
      catch (e) {
        if (e instanceof FlowStop) { rec.status = 'ok'; rec.ms = Date.now() - rec.started; rec.output = clipV(e.value, 1500); rec.note = 'stopped the flow'; throw e; }
        err = e; if (e instanceof FlowStepError || st.run.stop) break;
        if (a < tries - 1) { rec.note = `retry ${a + 1}`; await sleep(800 * (a + 1)); }
      }
    }
    rec.ms = Date.now() - rec.started; rec.status = 'error';
    if (err instanceof FlowStepError) { rec.error = 'a step inside failed'; throw err; }
    rec.error = String(err?.message || err);
    if (step.onError === 'continue' && !st.run.stop) { rec.note = 'continued'; const out = { error: rec.error }; keep(out); return out; }
    throw new FlowStepError(`step "${label}" failed: ${rec.error}`);
  }
  async _exec(step, ctx, st, rec) {
    const p = await this.resolve(step, ctx); const k = this.kit;
    switch (step.type) {
      case 'tool': {
        const name = String(p.tool || ''); if (name === 'flow') throw new Error('use a "flow" step to run another flow');
        let r = await k.tool(name, p.args && typeof p.args === 'object' ? p.args : {}, { signal: st.ctrl.signal });
        if (/^Error: /.test(r)) throw new Error(r.slice(7));
        if (p.parse && typeof r === 'string') { try { r = JSON.parse(r); } catch { const m = /[[{][\s\S]*[\]}]/.exec(r); if (!m) throw new Error('the result is not JSON'); r = JSON.parse(m[0]); } }
        return r;
      }
      case 'js': {
        const r = await (await k.use('js')).run(String(p.code || ''), { argv: [`/flow/${st.flow.name}`], globals: this.view(ctx), timeoutMs: Math.min(600, Math.max(1, +p.timeout || 60)) * 1000, signal: st.ctrl.signal });
        if (r.stdout?.trim() || r.stderr?.trim()) rec.log = String(r.stdout + r.stderr).slice(-3000);
        if (r.code !== 0) throw new Error((String(r.stderr || '').split('\n').filter(l => !/^\s+at\s/.test(l)).join('\n').trim() || `exit code ${r.code}`).slice(-800));
        return r.result !== undefined ? r.result : r.stdout ? r.stdout.replace(/\n$/, '') : ctx.$json;
      }
      case 'shell': {
        const r = await (await k.use('shell')).session({ cwd: p.cwd || '/' }).run(String(p.command), { timeoutMs: Math.min(600, Math.max(1, +p.timeout || 60)) * 1000, signal: st.ctrl.signal });
        rec.log = String(r.stdout + r.stderr).slice(-3000);
        if (r.code !== 0 && !p.allowFail) throw new Error(`exit ${r.code}${(r.stderr || r.stdout).trim() ? ': ' + (r.stderr || r.stdout).trim().slice(-500) : ''}`);
        return { code: r.code, stdout: r.stdout, stderr: r.stderr };
      }
      case 'decide': return k.decide({ state: p.state, question: p.question, type: p.kind || 'choice', options: lines(p.options), signal: st.ctrl.signal });
      case 'llm': return complete(k, { prompt: typeof p.prompt === 'string' ? p.prompt : JSON.stringify(p.prompt), system: p.system, json: !!p.json, signal: st.ctrl.signal });
      case 'agent': { const a = await k.agent({ brain: Array.isArray(p.brain) ? p.brain : undefined }); const stopA = () => a.abort(); st.ctrl.signal.addEventListener('abort', stopA); try { return { reply: await a.prompt(typeof p.prompt === 'string' ? p.prompt : JSON.stringify(p.prompt)) }; } finally { st.ctrl.signal.removeEventListener('abort', stopA); } }
      case 'file': return this._file(p);
      case 'set': { const f = p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields) ? p.fields : {}; return p.keep && ctx.$json && typeof ctx.$json === 'object' && !Array.isArray(ctx.$json) ? { ...ctx.$json, ...f } : f; }
      case 'if': { const ok = !!p.condition; rec.note = ok ? 'then' : 'else'; const br = ok ? step.then : step.else; return Array.isArray(br) && br.length ? this._seqIn(br, ctx, st) : ctx.$json; }
      case 'switch': { const cases = Array.isArray(step.cases) ? step.cases : []; const i = cases.findIndex(c => matchV(c.match, p.value)); rec.note = i >= 0 ? `case ${JSON.stringify(cases[i].match)}` : 'default'; const br = i >= 0 ? cases[i].steps : step.default; return Array.isArray(br) && br.length ? this._seqIn(br, ctx, st) : ctx.$json; }
      case 'each': {
        let items = p.items;
        if (typeof items === 'string') items = items.split('\n').filter(s => s.trim());
        else if (items && typeof items === 'object' && !Array.isArray(items)) items = Object.entries(items).map(([key, value]) => ({ key, value }));
        if (!Array.isArray(items)) throw new Error('"items" must give a list');
        if (items.length > 1000) throw new Error(`too many items (${items.length}; at most 1000)`);
        const save = { $item: ctx.$item, $index: ctx.$index }, out = []; rec.note = `${items.length} item${items.length === 1 ? '' : 's'}`;
        try { for (let i = 0; i < items.length; i++) { ctx.$item = items[i]; ctx.$index = i; ctx.$json = items[i]; out.push(await this._seqIn(step.steps || [], ctx, st)); } } finally { Object.assign(ctx, save); }
        return out;
      }
      case 'wait': { const end = Date.now() + Math.min(300, Math.max(0, +p.seconds || 0)) * 1000; while (Date.now() < end) { if (st.run.stop) throw new Error('stopped'); await sleep(Math.min(250, end - Date.now())); } return ctx.$json; }
      case 'notify': { const t = String(p.title ?? '') || st.flow.name; const b = p.body == null ? '' : typeof p.body === 'string' ? p.body : JSON.stringify(p.body); await k.notify(t, b); return ctx.$json; }
      case 'flow': {
        const sub = this.get(p.flow); if (!sub) throw new Error(`no flow named "${p.flow}"`);
        if (st.depth + 1 > MAX_DEPTH) throw new Error('flows call each other too deeply');
        const r = await this.run(sub, p.input === undefined ? ctx.$json : p.input, { via: `flow:${st.flow.name}`, depth: st.depth + 1 });
        if (r.status !== 'ok') throw new Error(`flow "${sub.name}" ${r.status}: ${r.error}`); return r.output;
      }
      case 'playbook': { const r = await (await k.use('playbooks')).runUnattended(p.playbook, p.vars ?? {}, `flow:${st.flow.name}`); if (!r.ok) throw new Error(`playbook "${p.playbook}" failed at ${r.failed?.name || 'task ' + (r.failed?.task ?? '?')}: ${r.failed?.error || 'error'}`); return r; }
      case 'stop': throw new FlowStop(p.value === undefined || p.value === '' ? ctx.$json : p.value);
    }
    throw new Error(`unknown step type ${step.type}`);
  }
  _file(p) {
    const act = p.action || 'read'; const raw = String(p.path ?? '').trim(); if (!raw) throw new Error('"path" is empty');
    const full = this.vfs.norm(raw.startsWith('/') ? raw : '/' + raw);
    if (act === 'read') { if (!this.vfs.isFile(full)) throw new Error(`no file ${full}`); return this.vfs.read(full); }
    const text = p.content == null ? '' : typeof p.content === 'string' ? p.content : JSON.stringify(p.content, null, 2);
    const prev = this.vfs.isFile(full) ? this.vfs.read(full) : '';
    if (act === 'write') this.vfs.write(full, text);
    else if (act === 'append') this.vfs.write(full, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + text + (text.endsWith('\n') ? '' : '\n'));
    else if (act === 'prepend') { const fm = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(prev)?.[0] || ''; this.vfs.write(full, fm + text + (text.endsWith('\n') ? '' : '\n') + prev.slice(fm.length)); }
    else throw new Error('action must be read, write, append or prepend');
    return { path: full, bytes: this.vfs.readBytes(full).length };
  }
  /* ---------- triggers: schedule and file change ---------- */
  describeTrigger(f) {
    const tr = f.trigger || {}; const off = f.enabled === false ? ' · off' : '';
    if (tr.type === 'schedule') { let d = String(tr.when || ''); try { const sp = Cron.fromText(d); if (sp.cron) d = Cron.describe(sp.cron); } catch {} const n = this.next.get(f._path); return `schedule: ${d}${n && f.enabled !== false ? ' · next ' + new Date(n).toLocaleString() : ''}${off}`; }
    if (tr.type === 'file') return `when ${tr.path || '?'} changes${off}`;
    return 'manual' + off;
  }
  _watchSig(spec) {
    const p = this.vfs.norm(String(spec || '/')); if (this.vfs.isDir(p)) { const out = []; for (const k of this.vfs.walk(p)) { if (k.startsWith(this.root + '/') || k.startsWith('/.kit/')) continue; const n = this.vfs.nodes.get(k); if (n && !n.dir) out.push(k + '\u0001' + n.mtime); } return out.join('\u0002'); }
    const n = this.vfs.nodes.get(p); return n && !n.dir ? p + '\u0001' + n.mtime : '';
  }
  _arm() {
    const now = Date.now();
    for (const f of this.list()) {
      if (f._bad || f.enabled === false) continue; const tr = f.trigger || {};
      if (tr.type === 'schedule' && !this.next.has(f._path)) { try { const sp = Cron.fromText(String(tr.when || '')); this.next.set(f._path, sp.cron ? Cron.next(sp.cron, now) : null); } catch { this.next.set(f._path, null); } }
      if (tr.type === 'file' && !this.sig.has(f._path)) this.sig.set(f._path, this._watchSig(tr.path));
    }
  }
  _fire(f, input, via) {
    if (this.busy.has(f._path)) return null; this.busy.add(f._path);
    return this.run(f, input, { via }).then(run => { if (run.status !== 'ok') this.kit.notify(`Flow "${f.name}" failed`, String(run.error || '').slice(0, 180)); return run; })
      .finally(() => { this.busy.delete(f._path); if (f.trigger?.type === 'file') this.sig.set(f._path, this._watchSig(f.trigger.path)); });
  }
  /** check schedules now (also runs every `tick` ms once started) */
  tick(now = Date.now()) {
    const fired = [];
    for (const f of this.list()) {
      if (f._bad || f.enabled === false || f.trigger?.type !== 'schedule') continue;
      if (!this.next.has(f._path)) { this._arm(); continue; }
      const due = this.next.get(f._path); if (!due || now < due) continue;
      try { this.next.set(f._path, Cron.next(Cron.fromText(String(f.trigger.when)).cron, now)); } catch { this.next.set(f._path, null); }
      fired.push(this._fire(f, { trigger: 'schedule', at: new Date(due).toISOString() }, 'schedule'));
    }
    return Promise.all(fired.filter(Boolean));
  }
  _fileCheck() {
    const fired = [];
    for (const f of this.list()) {
      if (f._bad || f.enabled === false || f.trigger?.type !== 'file' || this.busy.has(f._path)) continue;
      const now = this._watchSig(f.trigger.path), old = this.sig.get(f._path);
      if (old === undefined) { this.sig.set(f._path, now); continue; } if (now === old) continue; this.sig.set(f._path, now);
      const m = s => new Map(String(s || '').split('\u0002').filter(Boolean).map(x => x.split('\u0001'))); const A = m(old), B = m(now);
      const changed = [...B].filter(([k, v]) => A.get(k) !== v).map(([k]) => k), removed = [...A.keys()].filter(k => !B.has(k)); if (!changed.length && !removed.length) continue;
      const path = this.vfs.norm(String(f.trigger.path)); const input = { trigger: 'file', path, changed, removed };
      if (this.vfs.isFile(path)) { try { input.content = this.vfs.read(path).slice(0, 50000); } catch {} }
      fired.push(this._fire(f, input, 'file'));
    }
    return Promise.all(fired.filter(Boolean));
  }
  /** start the schedule and file triggers (createKit({ flows: { start: false } }) leaves them off) */
  start() {
    if (this.started) return this; this.started = true; this._arm();
    this._timer = setInterval(() => this.tick(), this.tickMs);
    this._off = this.vfs.on(path => { if (path.startsWith('/.kit/') && !path.startsWith(this.root + '/')) return; if (path.startsWith(this.root + '/')) { this.next.clear(); this._arm(); } clearTimeout(this._ft); this._ft = setTimeout(() => this._fileCheck(), this.watchDelay); });
    return this;
  }
  stopTriggers() { clearInterval(this._timer); this._off?.(); clearTimeout(this._ft); this.started = false; }
  /* ---------- the tool ---------- */
  help() {
    const types = Object.entries(TYPES).map(([k, T]) => `- ${k}: ${T.help} Fields: ${T.fields.map(([f, , kind, , req]) => `${f}${req ? '*' : ''}${kind.startsWith('sel:') ? ' = ' + kind.slice(4) : kind === 'expr' ? ' (JS expression)' : ''}`).join(', ')}${T.branches ? `; nested: ${T.branches.join(', ')}` : ''}${T.cases ? '; cases: [{match, steps}], default: [steps]' : ''}`).join('\n');
    return `A flow is JSON: {"name", "description", "enabled": true, "trigger": {"type": "manual"} | {"type": "schedule", "when": "every weekday at 9am" or "0 9 * * 1-5"} | {"type": "file", "path": "/inbox.md" (a file or folder)}, "vars": {}, "timeout": 600, "steps": [{"type": "…", "name": "Short name", …fields, "onError": "stop"|"continue", "retries": 0-3, "disabled": false}, …]}
Steps run top to bottom; each step's output is $json for the next; the flow's output is the last step's.
Expressions: any text field may contain {{ JavaScript }} (a field that is one {{ }} keeps the value's type). Names: $json, $input, $node["Step name"] or $node.s1, $vars, $item, $index (in each), $now, $today, $flow.name, $run.via, $date(format, date, days). "condition", "value" and "items" are plain expressions (no braces). JavaScript steps get the same names, plus fs, path, fetch and kit.tool(name, args), kit.decide, kit.ask, kit.flow, kit.shell, kit.kv.
A file trigger starts the flow with {trigger, path, changed, removed, content}; a schedule with {trigger, at}.
Step types (* = required):
${types}`;
  }
  _runText(run) {
    const l = run.steps.map(s => `${s.status === 'ok' ? '✓' : s.status === 'skipped' ? '–' : s.status === 'error' ? '✗' : '…'} ${s.name} (${s.type}${s.note ? ', ' + s.note : ''}, ${s.ms} ms)${s.error ? ': ' + s.error : ''}`);
    let out = run.output; try { out = typeof out === 'string' ? out : JSON.stringify(out, null, 1); } catch {} out = String(out ?? 'null'); if (out.length > 4000) out = out.slice(0, 4000) + `… [${out.length - 4000} more characters]`;
    return `Flow "${run.flow}" ${run.status}${run.error ? ': ' + run.error : ''} in ${((run.ended - run.started) / 1000).toFixed(1)} s\n${l.join('\n')}\nOutput: ${out}`;
  }
  async tool(a = {}, ctx = {}) {
    const act = String(a.action || 'list'); await this.kit.use('tools');
    const get = () => { const f = this.get(a.name ?? a.flow?.name); if (!f) throw new Error(`no flow named "${a.name ?? ''}". Use action list.`); return f; };
    const parse = () => { let f = a.flow; if (typeof f === 'string') { try { f = JSON.parse(f); } catch (e) { throw new Error('"flow" is not valid JSON: ' + e.message); } } if (!f || typeof f !== 'object') throw new Error('give the whole flow in "flow" (see action help)'); return f; };
    if (act === 'help') return this.help();
    if (act === 'list') { const all = this.list(); return all.length ? all.map(f => { const last = this.recent.find(r => r.path === f._path); return `- ${f.name}: ${f._bad ? 'INVALID: ' + f._bad : this.describeTrigger(f)} · ${(f.steps || []).length} steps${f.description ? ' · ' + f.description : ''}${last ? ` · last run ${last.status}` : ''}`; }).join('\n') : 'No flows yet. Use action help, then create.'; }
    if (act === 'get') return JSON.stringify(this.clean(get()), null, 2);
    if (act === 'create') { const f = parse(); if (this.get(f.name)) throw new Error(`a flow named "${f.name}" already exists: use update`); const s = this.save(f); return `Created flow "${s.name}" (${s._path}). Trigger: ${this.describeTrigger(s)}.`; }
    if (act === 'update') { const old = get(); const f = parse(); if (!f.name) f.name = old.name; const clash = this.get(f.name); if (clash && clash._path !== old._path) throw new Error(`another flow is already named "${f.name}"`); const s = this.save(f, old._path); return `Updated flow "${s.name}". Trigger: ${this.describeTrigger(s)}.`; }
    if (act === 'delete') { const f = get(); this.remove(f.name); return `Deleted flow "${f.name}".`; }
    if (act === 'enable' || act === 'disable') { const f = get(); f.enabled = act === 'enable'; this.save(f, f._path); return `${f.name} is ${act}d.`; }
    if (act === 'run') { const f = get(); let has = false; walkSteps(f.steps, s => { if (s?.type === 'agent' && !s.disabled) has = true; }); if (has && ctx.agent) throw new Error('this flow has an agent step, which cannot run inside an agent\'s turn'); return this._runText(await this.run(f, a.input ?? null, { via: 'agent' })); }
    if (act === 'runs') { const l = this.runs({ name: a.name, limit: Math.min(50, +a.limit || 10) }); return l.length ? l.map(r => `${new Date(r.started).toLocaleString()} ${r.flow}: ${r.status}${r.error ? ' (' + r.error.slice(0, 160) + ')' : ''} via ${r.via}, ${((r.ended - r.started) / 1000).toFixed(1)} s`).join('\n') : 'No runs yet.'; }
    throw new Error(`unknown action ${act}`);
  }
  get toolDefs() {
    return { flow: {
      description: 'Automation flows (like n8n): steps that run in order — tools, JavaScript, shell, decisions, model answers, agent runs, files, if / switch / for-each, wait, notify, playbooks, other flows. A flow runs by hand, on a schedule or when a file changes. Actions: help (the format and every step type: read it first), list, get, create, update, delete, run, runs, enable, disable.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['help', 'list', 'get', 'create', 'update', 'delete', 'run', 'runs', 'enable', 'disable'] }, name: { type: 'string' }, flow: { type: 'object', description: 'create / update: the whole flow (see help)' }, input: { description: 'run: input ($input and the first $json)' }, limit: { type: 'integer' } }, required: ['action'] },
      run: (a, ctx) => this.tool(a, ctx),
    } };
  }
  plugin() { return { name: 'flows', tools: ['flow'] }; }
}
