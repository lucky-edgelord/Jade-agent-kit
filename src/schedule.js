// A cron scheduler for the page: jobs run shell commands, JavaScript, Python, an agent prompt, or your own function,
// on a cron expression or plain English ("every weekday at 8:30", "in 20 minutes", "tomorrow at 7pm").
// Jobs (all but function jobs) are kept in the VFS at /.kit/schedule.json. Jobs only run while a page with the kit
// is open; a run missed while it was closed happens once when the scheduler starts again (catchUp).
import { Cron } from './internal/cron_core.js';

export { Cron };
const KINDS = ['shell', 'js', 'python', 'agent', 'fn'];

export class Scheduler {
  constructor(kit, { path = '/.kit/schedule.json', tickMs = 15000, catchUp = true } = {}) {
    this.kit = kit; this.path = path; this.tickMs = tickMs; this.catchUp = catchUp; this.jobs = []; this.fns = new Map(); this.listeners = new Set(); this.timer = null; this.running = new Set();
    try { this.jobs = JSON.parse(kit.vfs.read(path)).jobs || []; } catch {}
  }
  _save() { this.kit.vfs.write(this.path, JSON.stringify({ jobs: this.jobs.filter(j => j.kind !== 'fn') }, null, 1)); }
  /** fn(event): { type: 'run'|'error'|'change', job, result? } */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(e) { for (const f of this.listeners) { try { f(e); } catch {} } }
  find(idOrName) { const s = String(idOrName); const j = this.jobs.find(x => x.id === s) || this.jobs.find(x => x.name.toLowerCase() === s.toLowerCase()); if (!j) throw new Error(`no scheduled job "${s}"`); return j; }
  /**
   * Add a job. when: cron ("0 9 * * *", "@daily"), plain English, a Date or a timestamp (once).
   * Give one of: command (shell), js, python, prompt (agent; agent: { provider, model, tools }), or run (a function, not saved).
   * @returns the job ({ id, name, kind, cron | once, next, enabled, runs, last })
   */
  add({ name, when, command, js, python, prompt, run, agent = null, enabled = true, cwd = '/' } = {}) {
    let sched;
    if (when instanceof Date || typeof when === 'number') { const t = +new Date(when); if (!(t > Date.now())) throw new Error('that time is in the past'); sched = { once: t }; }
    else sched = Cron.fromText(when);
    const kind = run ? 'fn' : command != null ? 'shell' : js != null ? 'js' : python != null ? 'python' : prompt != null ? 'agent' : null;
    if (!kind) throw new Error('give what to run: command, js, python, prompt or run');
    const id = 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const job = { id, name: String(name || (command ?? prompt ?? 'job')).slice(0, 60), kind, ...sched, payload: command ?? js ?? python ?? prompt ?? null, agent, cwd, enabled: !!enabled, created: Date.now(), runs: 0, last: null };
    job.next = job.cron ? Cron.next(job.cron) : job.once;
    if (job.cron && !job.next) throw new Error(`"${job.cron}" never happens`);
    if (run) this.fns.set(id, run);
    this.jobs.push(job); this._save(); this._emit({ type: 'change', job }); return { ...job };
  }
  remove(idOrName) { const j = this.find(idOrName); this.jobs = this.jobs.filter(x => x !== j); this.fns.delete(j.id); this._save(); this._emit({ type: 'change', job: j }); }
  enable(idOrName, on = true) { const j = this.find(idOrName); j.enabled = !!on; if (on && j.cron) j.next = Cron.next(j.cron); this._save(); this._emit({ type: 'change', job: j }); return { ...j }; }
  disable(idOrName) { return this.enable(idOrName, false); }
  list() { return this.jobs.map(j => ({ ...j, when: j.cron ? Cron.describe(j.cron) : new Date(j.once).toLocaleString() })); }
  /** run a job now (its schedule is unchanged) */
  async runNow(idOrName) { return this._run(this.find(idOrName)); }
  async _run(job) {
    if (this.running.has(job.id)) return { skipped: 'still running' };
    this.running.add(job.id); const t0 = Date.now(); let result;
    try {
      const k = this.kit;
      if (job.kind === 'shell') { const r = await k.shell.session({ cwd: job.cwd }).run(job.payload); result = { code: r.code, output: r.output }; }
      else if (job.kind === 'js') { const r = await k.js.run(job.payload, { cwd: job.cwd }); result = { code: r.code, output: r.output, result: r.result }; }
      else if (job.kind === 'python') { const r = await k.python.run(job.payload, { cwd: job.cwd }); result = { code: r.code, output: r.output }; }
      else if (job.kind === 'agent') { const text = await k.agent({ ...(job.agent || {}) }).prompt(job.payload); result = { code: 0, output: text }; }
      else if (job.kind === 'fn') { const f = this.fns.get(job.id); if (!f) throw new Error('this function job was added on another page load; add it again'); const v = await f(job); result = { code: 0, output: v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v) }; }
      else throw new Error(`unknown job kind ${job.kind}`);
    } catch (e) { result = { code: 1, output: '', error: String(e?.message || e) }; }
    finally { this.running.delete(job.id); }
    result.at = t0; result.ms = Date.now() - t0; if (result.output?.length > 4000) result.output = result.output.slice(0, 4000) + '…';
    job.runs++; job.last = result; this._save();
    this._emit({ type: result.error || result.code ? 'error' : 'run', job: { ...job }, result });
    return result;
  }
  /** check for due jobs now (start() does this every tickMs) */
  async tick(now = Date.now()) {
    const due = this.jobs.filter(j => j.enabled && j.next && j.next <= now);
    for (const j of due) {
      if (j.cron) j.next = Cron.next(j.cron, now); else { j.enabled = false; j.next = null; }
    }
    if (due.length) this._save();
    await Promise.all(due.map(j => this._run(j)));
    return due.length;
  }
  /** start running jobs while the page is open */
  start() {
    if (this.timer) return this;
    if (!this.catchUp) { const now = Date.now(); for (const j of this.jobs) if (j.enabled && j.cron && j.next < now) j.next = Cron.next(j.cron, now); }
    this.tick().catch(() => {}); this.timer = setInterval(() => this.tick().catch(() => {}), this.tickMs); return this;
  }
  stop() { clearInterval(this.timer); this.timer = null; return this; }
  get started() { return !!this.timer; }
}
export { KINDS };
