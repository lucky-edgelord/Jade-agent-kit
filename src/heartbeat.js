// Heartbeat: every N minutes inside active hours, an agent reads <path> (HEARTBEAT.md, a short checklist) and acts on it.
// If nothing needs attention it answers HEARTBEAT_OK and the run is silent; anything else is an alert (onAlert, and
// kit.notify). A HEARTBEAT.md with only comments, headings, blank lines or empty checkboxes skips the run without calling
// the model. Ported from Jade Vault (app/modules/heartbeat.js).
export const DEFAULT_PROMPT = 'Read HEARTBEAT.md (below). Follow it strictly. Do not infer or repeat old tasks from prior chats. Use your tools to check what it asks. If nothing needs attention, reply HEARTBEAT_OK.';
export const SEED = `# HEARTBEAT
<!-- Read on every heartbeat. Keep it short: a checklist of things to look at. If nothing needs attention the agent
     replies HEARTBEAT_OK and nobody hears about it. While this file has only comments, headings and empty boxes,
     heartbeats are skipped for free. Example:
     - If /inbox.md has more than 5 items, remind me to sort it. -->
## Check
- [ ]
`;
const strip = t => String(t).replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
const hm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
/** is a reply an acknowledgement (HEARTBEAT_OK or NO_REPLY, with at most a short remark)? */
export function isAck(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const m = /^\**(HEARTBEAT_OK|NO_REPLY)\**[\s.!:]*|[\s.!:]*\**(HEARTBEAT_OK|NO_REPLY)\**[.!]?$/i.exec(t);
  if (!t) return true; if (!m) return false; return t.replace(m[0], '').trim().length <= 300;
}

export class Heartbeat {
  /**
   * @param {{ kit: object, path?: string, every?: number, from?: string, to?: string, prompt?: string, brain?: any, model?: string, onAlert?: (text: string) => void }} o
   *   every: minutes (default 30); from / to: active hours "08:00" / "22:00" (default always)
   */
  constructor({ kit, path = '/.kit/HEARTBEAT.md', every = 30, from = '', to = '', prompt = DEFAULT_PROMPT, brain = null, model = null, onAlert = null } = {}) {
    Object.assign(this, { kit, vfs: kit.vfs, path: kit.vfs.norm(path), every, from, to, prompt, brain, model, onAlert }); this.last = 0; this.status = ''; this.running = false; this.history = [];
  }
  seed() { if (!this.vfs.exists(this.path)) this.vfs.write(this.path, SEED); return this.path; }
  /** the checklist, or '' when it has nothing to check */
  body() {
    if (!this.vfs.isFile(this.path)) return '';
    const t = strip(this.vfs.read(this.path));
    return t.split('\n').some(l => { const x = l.trim(); return x && !/^#{1,6}(\s|$)/.test(x) && !/^(```|~~~)/.test(x) && !/^[-*+]\s*(\[[ xX]?\])?\s*$/.test(x) && !/^---+$/.test(x); }) ? t : '';
  }
  active(d = new Date()) { const a = hm(this.from), b = hm(this.to); if (a == null || b == null) return true; if (a === b) return false; const n = d.getHours() * 60 + d.getMinutes(); return a < b ? n >= a && n < b : n >= a || n < b; }
  /** run one heartbeat now → { status: 'skipped'|'ok'|'alert'|'error', text? } */
  async run() {
    if (this.running) return { status: 'busy' };
    const body = this.body(); this.last = Date.now();
    if (!body) { this.status = `skipped (${this.path} is empty)`; return { status: 'skipped' }; }
    this.running = true; this.status = 'running';
    try {
      const a = await this.kit.agent({ brain: this.brain || undefined, model: this.model || undefined });
      const text = await a.prompt(`[Heartbeat · ${new Date().toLocaleString()}]\n${this.prompt}\n\nHEARTBEAT.md:\n${body}`);
      const out = isAck(text) ? { status: 'ok' } : { status: 'alert', text };
      this.status = out.status === 'ok' ? 'ok' : 'alert'; this.history.unshift({ at: this.last, ...out }); this.history.length = Math.min(this.history.length, 50);
      if (out.status === 'alert') { try { this.onAlert?.(text); } catch {} await this.kit.notify('Heartbeat', String(text).slice(0, 200)); }
      return out;
    } catch (e) { this.status = 'error: ' + e.message; return { status: 'error', text: e.message }; }
    finally { this.running = false; }
  }
  /** check every minute whether a heartbeat is due */
  start() { clearInterval(this._t); this._t = setInterval(() => { if (Date.now() - this.last >= this.every * 60000 && this.active()) this.run(); }, 60000); return this; }
  stop() { clearInterval(this._t); }
  get toolDefs() {
    return { heartbeat: {
      description: `The heartbeat checklist (${this.path}): every ${this.every} minutes an agent checks it and answers HEARTBEAT_OK unless something needs the user. Actions: show, set (content: the whole checklist), status.`,
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['show', 'set', 'status'] }, content: { type: 'string' } }, required: ['action'] },
      run: a => { if (a.action === 'set') { this.vfs.write(this.path, String(a.content || '')); return `Saved ${this.path}${this.body() ? '' : ' (it has nothing to check, so heartbeats will skip)'}.`; } if (a.action === 'status') return `Last: ${this.last ? new Date(this.last).toLocaleString() + ' · ' + this.status : 'never'} · every ${this.every} min${this.from ? ` · ${this.from}-${this.to}` : ''}`; return this.vfs.isFile(this.path) ? this.vfs.read(this.path) : '(no checklist yet)'; },
    } };
  }
  plugin() { return { name: 'heartbeat', tools: ['heartbeat'] }; }
}
