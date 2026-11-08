// A task list (a to-do list an agent plans with and a user can see), kept in the VFS at /.kit/tasks.json.
export const STATUSES = ['pending', 'in_progress', 'done'];

export class Tasks {
  constructor(vfs, path = '/.kit/tasks.json') {
    this.vfs = vfs; this.path = path; this.items = []; this.seq = 0; this.listeners = new Set();
    try { const j = JSON.parse(vfs.read(path)); this.items = j.items || []; this.seq = j.seq || Math.max(0, ...this.items.map(t => t.id)); } catch {}
  }
  _save() { this.vfs.write(this.path, JSON.stringify({ seq: this.seq, items: this.items }, null, 1)); for (const f of this.listeners) { try { f(this.items); } catch {} } }
  /** fn(items) after every change */
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  get(id) { const t = this.items.find(x => x.id === +id); if (!t) throw new Error(`no task #${id}`); return t; }
  /** add one task or several: add('Write tests') · add(['a', 'b']) · add({ title, notes, due }) */
  add(task) {
    const list = (Array.isArray(task) ? task : [task]).map(t => typeof t === 'string' ? { title: t } : t).filter(t => String(t?.title ?? '').trim());
    if (!list.length) throw new Error('a task needs a title');
    const now = Date.now();
    const added = list.map(t => ({ id: ++this.seq, title: String(t.title).trim(), status: STATUSES.includes(t.status) ? t.status : 'pending', ...(t.notes ? { notes: String(t.notes) } : {}), ...(t.due ? { due: String(t.due) } : {}), created: now, updated: now }));
    this.items.push(...added); this._save(); return Array.isArray(task) ? added : added[0];
  }
  /** change a task: update(3, { status: 'done' }) · update(3, { title, notes, due }) */
  update(id, fields = {}) {
    const t = this.get(id);
    if (fields.status != null) { if (!STATUSES.includes(fields.status)) throw new Error(`status must be ${STATUSES.join(', ')}`); t.status = fields.status; }
    for (const k of ['title', 'notes', 'due']) if (fields[k] != null) t[k] = String(fields[k]);
    t.updated = Date.now(); this._save(); return t;
  }
  start(id) { return this.update(id, { status: 'in_progress' }); }
  done(id) { return this.update(id, { status: 'done' }); }
  remove(id) { this.get(id); this.items = this.items.filter(x => x.id !== +id); this._save(); }
  /** remove finished tasks (or all with { all: true }) */
  clear({ all = false } = {}) { const n = this.items.length; this.items = all ? [] : this.items.filter(t => t.status !== 'done'); if (all) this.seq = 0; this._save(); return n - this.items.length; }
  list({ status } = {}) { return this.items.filter(t => !status || t.status === status).map(t => ({ ...t })); }
  /** the list as text, as an agent reads it: [ ] pending, [~] in progress, [x] done */
  text() {
    if (!this.items.length) return 'The task list is empty.';
    const mark = { pending: '[ ]', in_progress: '[~]', done: '[x]' };
    return this.items.map(t => `${mark[t.status]} #${t.id} ${t.title}${t.due ? ` (due ${t.due})` : ''}${t.notes ? ` — ${t.notes}` : ''}`).join('\n');
  }
}
