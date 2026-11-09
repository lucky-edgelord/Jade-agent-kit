// Plans: Gantt charts for long-term projects. A project is <root>/<id>.json: { id, name, description, tasks: [{ id, name,
// start, end, deps, owner: 'agent'|'user', progress, milestone, notes }] }. Dates are YYYY-MM-DD; end is the task's last
// day. The agent may not change the user's tasks unless told to (confirm: true). Autonomy picks up the agent's ready tasks.
// Ported from Jade Vault (app/modules/gantt.js) unchanged but for the owner name.
export function createGantt(vfs, GANTT_DIR = '/.kit/projects') {
  const DAY = 86400000;
  const gDate = d => { const x = d instanceof Date ? d : new Date(String(d) + 'T00:00:00'); if (isNaN(x)) throw new Error(`not a date: ${d} (use YYYY-MM-DD)`); return x; };
  const gIso = d => { const x = gDate(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
  const gToday = () => gIso(new Date());
  const gAdd = (d, n) => { const x = gDate(d); x.setDate(x.getDate() + n); return gIso(x); };
  const gDiff = (a, b) => Math.round((gDate(b) - gDate(a)) / DAY);   // days from a to b
  const gDur = t => gDiff(t.start, t.end) + 1;
  const gDone = t => (+t.progress || 0) >= 100;
  const gSlug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'project';
  const gPath = id => `${GANTT_DIR}/${gSlug(id)}.json`;

  function ganttList() {
    if (!vfs.isDir(GANTT_DIR)) return [];
    const out = [];
    for (const n of vfs.list(GANTT_DIR)) { const name = typeof n === 'string' ? n : n.name; if (!/\.json$/.test(name)) continue; try { out.push(ganttLoad(name.replace(/\.json$/, ''))); } catch {} }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
  function ganttFind(ref) {
    const r = String(ref || '').trim(); if (!r) throw new Error('which project? Give project (its id or name). Projects: ' + (ganttList().map(p => p.id).join(', ') || 'none yet'));
    if (vfs.isFile(gPath(r))) return ganttLoad(r);
    const hit = ganttList().find(p => p.name.toLowerCase() === r.toLowerCase() || p.id === gSlug(r));
    if (!hit) throw new Error(`no project "${r}". Projects: ${ganttList().map(p => p.id).join(', ') || 'none yet'}`);
    return hit;
  }
  function ganttLoad(id) {
    const p = JSON.parse(vfs.read(gPath(id)));
    p.id = p.id || gSlug(id); p.name = p.name || p.id; p.tasks = Array.isArray(p.tasks) ? p.tasks : [];
    for (const t of p.tasks) { t.deps = Array.isArray(t.deps) ? t.deps.map(String) : []; t.owner = t.owner === 'user' ? 'user' : 'agent'; t.progress = Math.max(0, Math.min(100, +t.progress || 0)); t.end = t.end || t.start; }
    return p;
  }
  function ganttSave(p) { p.updated = new Date().toISOString(); vfs.write(gPath(p.id), JSON.stringify(p, null, 2), { mkdirs: true }); return p; }
  const gTask = (p, ref) => {
    const r = String(ref ?? '').trim();
    const t = p.tasks.find(x => x.id === r) || p.tasks.find(x => x.name.toLowerCase() === r.toLowerCase());
    if (!t) throw new Error(`no task "${r}" in ${p.name}. Tasks: ${p.tasks.map(x => `${x.id} ${x.name}`).join('; ') || 'none'}`);
    return t;
  };
  function gNewId(p) { let i = p.tasks.length + 1; while (p.tasks.some(t => t.id === 't' + i)) i++; return 't' + i; }
  function gCycle(p, from, to) {   // would from -> to (from depends on to) make a cycle?
    const seen = new Set(); const st = [to];
    while (st.length) { const x = st.pop(); if (x === from) return true; if (seen.has(x)) continue; seen.add(x); const t = p.tasks.find(y => y.id === x); if (t) st.push(...t.deps); }
    return false;
  }
  // order tasks so dependencies come first
  function gTopo(p) {
    const out = [], mark = new Map();
    const visit = t => { if (mark.get(t.id) === 2) return; if (mark.get(t.id) === 1) throw new Error(`dependency cycle at ${t.id}`); mark.set(t.id, 1); for (const d of t.deps) { const x = p.tasks.find(y => y.id === d); if (x) visit(x); } mark.set(t.id, 2); out.push(t); };
    for (const t of p.tasks) visit(t);
    return out;
  }
  // push tasks later so each starts after its dependencies end (durations kept); returns what moved
  function ganttPlan(p) {
    const moved = [];
    for (const t of gTopo(p)) {
      if (!t.deps.length) continue;
      const ends = t.deps.map(d => p.tasks.find(x => x.id === d)).filter(Boolean).map(x => x.end);
      const earliest = gAdd(ends.sort().at(-1), t.milestone ? 0 : 1);
      if (t.start < earliest) { const dur = gDur(t); const was = t.start; t.start = earliest; t.end = gAdd(earliest, dur - 1); moved.push(`${t.id} ${t.name}: ${was} -> ${t.start}`); }
    }
    return moved;
  }
  // critical path: tasks with no slack between the project start and its finish
  function ganttCritical(p) {
    if (!p.tasks.length) return { ids: [], end: null };
    const order = gTopo(p); const finish = order.map(t => t.end).sort().at(-1);
    const late = new Map();   // latest end without delaying the finish
    for (const t of [...order].reverse()) {
      const succ = p.tasks.filter(x => x.deps.includes(t.id));
      let le = finish; for (const s of succ) { const ls_ = gAdd(late.get(s.id), -(gDur(s) - 1)); const cand = gAdd(ls_, s.milestone ? 0 : -1); if (cand < le) le = cand; }
      late.set(t.id, le);
    }
    return { ids: order.filter(t => late.get(t.id) <= t.end).map(t => t.id), end: finish };
  }
  function gState(p, t, today = gToday()) {
    if (gDone(t)) return 'done';
    const open = t.deps.map(d => p.tasks.find(x => x.id === d)).filter(x => x && !gDone(x));
    if (t.end < today) return 'late';
    if (open.length) return t.start <= today ? 'blocked' : 'waiting';
    return t.start <= today ? 'ready' : 'planned';
  }
  function ganttReport(p, today = gToday()) {
    const by = {}; for (const t of p.tasks) (by[gState(p, t, today)] ||= []).push(t);
    const crit = ganttCritical(p);
    const done = p.tasks.length ? Math.round(p.tasks.reduce((s, t) => s + gDur(t) * t.progress, 0) / p.tasks.reduce((s, t) => s + gDur(t), 0)) : 0;
    const line = (t) => `  ${t.id} ${t.name} (${t.owner}, ${t.start}${t.end !== t.start ? ' → ' + t.end : ''}, ${t.progress}%)`;
    const soon = p.tasks.filter(t => !gDone(t) && t.end >= today && gDiff(today, t.end) <= 3);
    return [`${p.name}: ${p.tasks.length} tasks, ${done}% done, finishes ${crit.end || '(no tasks)'}.`,
      ...['late', 'blocked', 'ready', 'waiting'].filter(k => by[k]?.length).map(k => `${k[0].toUpperCase() + k.slice(1)}:\n` + by[k].map(line).join('\n')),
      soon.length ? 'Due within 3 days:\n' + soon.map(line).join('\n') : '',
      crit.ids.length ? 'Critical path: ' + crit.ids.join(' → ') : ''].filter(Boolean).join('\n');
  }
  // a text Gantt chart for the model and the shell
  function ganttText(p, today = gToday()) {
    if (!p.tasks.length) return `${p.name}: no tasks yet. Add some with action add.`;
    const start = p.tasks.map(t => t.start).sort()[0], end = p.tasks.map(t => t.end).sort().at(-1);
    const span = gDiff(start, end) + 1, unit = span > 120 ? 7 : span > 60 ? 2 : 1, cols = Math.ceil(span / unit);
    const W = Math.min(28, Math.max(...p.tasks.map(t => (t.id + ' ' + t.name).length)));
    const crit = new Set(ganttCritical(p).ids);
    const rows = gTopo(p).map(t => {
      const a = Math.floor(gDiff(start, t.start) / unit), b = Math.floor(gDiff(start, t.end) / unit);
      let bar = ''; for (let i = 0; i < cols; i++) bar += i < a || i > b ? '·' : t.milestone ? '◆' : (i - a) / Math.max(1, b - a + 1) < t.progress / 100 ? '█' : '░';
      const label = (t.id + ' ' + t.name).slice(0, W).padEnd(W);
      return `${label} |${bar}| ${t.owner === 'user' ? 'user ' : 'agent'} ${String(t.progress).padStart(3)}% ${gState(p, t, today)}${crit.has(t.id) ? ' *' : ''}${t.deps.length ? '  after ' + t.deps.join(',') : ''}`;
    });
    const ti = gDiff(start, today); const mark = ti >= 0 && ti < span ? ' '.repeat(W + 2 + Math.floor(ti / unit)) + '^ today' : '';
    return `${p.name}  ${start} → ${end}  (one column = ${unit} day${unit > 1 ? 's' : ''}; █ done ░ to do ◆ milestone; * critical)\n` + rows.join('\n') + (mark ? '\n' + mark : '');
  }
  // for the scheduler: Jade's tasks that can be worked on now
  function ganttReady(today = gToday()) {
    const out = [];
    for (const p of ganttList()) for (const t of p.tasks) if (t.owner !== 'user' && !t.milestone && gState(p, t, today) === 'ready') out.push({ project: p.id, projectName: p.name, task: t });
    return out;
  }
  function gFields(t, a, p) {
    if (a.name !== undefined) t.name = String(a.name).slice(0, 120);
    if (a.start !== undefined) t.start = gIso(a.start);
    if (a.end !== undefined) t.end = gIso(a.end);
    else if (a.days !== undefined) t.end = gAdd(t.start, Math.max(1, +a.days | 0) - 1);
    if (a.milestone !== undefined) t.milestone = a.milestone === true || a.milestone === 'true';
    if (t.milestone) t.end = t.start;
    if (t.end < t.start) throw new Error(`${t.name}: end ${t.end} is before start ${t.start}`);
    if (a.owner !== undefined) t.owner = a.owner === 'user' || a.owner === 'you' ? 'user' : 'agent';
    if (a.progress !== undefined) t.progress = Math.max(0, Math.min(100, Math.round(+a.progress || 0)));
    if (a.notes !== undefined) t.notes = String(a.notes).slice(0, 2000);
    if (a.deps !== undefined) { const ds = [].concat(a.deps).flatMap(x => String(x).split(',')).map(x => x.trim()).filter(Boolean).map(d => gTask(p, d).id); for (const d of ds) if (d === t.id || gCycle(p, t.id, d)) throw new Error(`${t.id} cannot depend on ${d}: that makes a cycle`); t.deps = [...new Set(ds)]; }
  }
  const GANTT_ACTIONS = ['projects', 'create', 'show', 'add', 'update', 'link', 'unlink', 'remove', 'plan', 'report', 'ready'];
  async function ganttTool(a, by = 'agent') {
    const action = String(a.action || 'projects').toLowerCase();
    if (!GANTT_ACTIONS.includes(action)) throw new Error(`unknown action ${action}: use ${GANTT_ACTIONS.join(', ')}`);
    if (action === 'projects') { const ps = ganttList(); return ps.length ? ps.map(p => `${p.id}: ${p.name} — ${p.tasks.length} tasks, ${p.tasks.filter(gDone).length} done` + (p.description ? `\n  ${p.description}` : '')).join('\n') : 'No projects yet. Make one with action create (name, description).'; }
    if (action === 'ready') { const r = ganttReady(); return r.length ? r.map(x => `${x.projectName} / ${x.task.id} ${x.task.name} (${x.task.progress}%, due ${x.task.end})`).join('\n') : 'No agent task is ready right now.'; }
    if (action === 'create') {
      const name = String(a.name || a.project || '').trim(); if (!name) throw new Error('create needs a name');
      const id = gSlug(name); if (vfs.isFile(gPath(id))) throw new Error(`a project ${id} already exists`);
      ganttSave({ id, name, description: String(a.description || ''), created: new Date().toISOString(), by, tasks: [] });
      return `Made project ${id}. Add tasks with action add (project=${id}, name, start, days or end, deps, owner).`;
    }
    if (action === 'report' && !a.project) { const ps = ganttList(); return ps.length ? ps.map(p => ganttReport(p)).join('\n\n') : 'No projects yet.'; }
    const p = ganttFind(a.project);
    const mine = t => { if (by === 'agent' && t.owner === 'user' && !(a.confirm === true || a.confirm === 'true')) throw new Error(`${t.id} ${t.name} is the user's task. Ask them first; pass confirm=true only after they agreed (or your app changes it).`); };
    if (action === 'show') return ganttText(p) + (p.description ? `\n\n${p.description}` : '') + '\n\n' + p.tasks.filter(t => t.notes).map(t => `${t.id} notes: ${t.notes}`).join('\n');
    if (action === 'report') return ganttReport(p);
    if (action === 'add') {
      const t = { id: gNewId(p), name: String(a.name || '').trim(), start: '', end: '', deps: [], owner: a.owner === 'user' || a.owner === 'you' ? 'user' : 'agent', progress: 0 };
      if (!t.name) throw new Error('add needs a name');
      const deps = a.deps !== undefined ? [].concat(a.deps).flatMap(x => String(x).split(',')).map(x => x.trim()).filter(Boolean) : [];
      t.start = a.start ? gIso(a.start) : deps.length ? gAdd(deps.map(d => gTask(p, d).end).sort().at(-1), 1) : gToday();
      t.end = t.start; p.tasks.push(t);
      try { gFields(t, { ...a, name: undefined, start: undefined, owner: undefined, days: a.days ?? (a.end ? undefined : 1) }, p); } catch (e) { p.tasks.pop(); throw e; }
      const moved = ganttPlan(p); ganttSave(p);
      return `Added ${t.id} ${t.name}: ${t.start}${t.end !== t.start ? ' → ' + t.end : ''} (${t.owner})${t.deps.length ? ', after ' + t.deps.join(', ') : ''}.` + (moved.length ? '\nMoved to keep dependencies: ' + moved.join('; ') : '');
    }
    if (action === 'update') {
      const t = gTask(p, a.task || a.id); const before = JSON.stringify(t);
      const touchesOwner = ['name', 'start', 'end', 'days', 'owner', 'progress', 'milestone', 'deps'].some(k => a[k] !== undefined);
      if (touchesOwner) mine(t);
      gFields(t, a, p); const moved = ganttPlan(p); ganttSave(p);
      return JSON.stringify(t) === before ? 'Nothing changed.' : `Updated ${t.id} ${t.name}: ${t.start}${t.end !== t.start ? ' → ' + t.end : ''}, ${t.progress}%, ${t.owner}.` + (moved.length ? '\nMoved to keep dependencies: ' + moved.join('; ') : '');
    }
    if (action === 'link' || action === 'unlink') {
      const t = gTask(p, a.task || a.id), d = gTask(p, a.dep || a.after); mine(t);
      if (action === 'link') { if (d.id === t.id || gCycle(p, t.id, d.id)) throw new Error(`${t.id} cannot depend on ${d.id}: that makes a cycle`); if (!t.deps.includes(d.id)) t.deps.push(d.id); }
      else t.deps = t.deps.filter(x => x !== d.id);
      const moved = ganttPlan(p); ganttSave(p);
      return `${t.id} ${action === 'link' ? 'now waits for' : 'no longer waits for'} ${d.id}.` + (moved.length ? '\nMoved: ' + moved.join('; ') : '');
    }
    if (action === 'remove') {
      const t = gTask(p, a.task || a.id); mine(t);
      p.tasks = p.tasks.filter(x => x !== t); for (const x of p.tasks) x.deps = x.deps.filter(d => d !== t.id);
      ganttSave(p); return `Removed ${t.id} ${t.name}.`;
    }
    const moved = ganttPlan(p); ganttSave(p);   // plan
    return (moved.length ? 'Rescheduled:\n' + moved.join('\n') : 'Every task already starts after its dependencies.') + '\n\n' + ganttText(p);
  }
  return { list: ganttList, find: ganttFind, load: ganttLoad, save: ganttSave, plan: ganttPlan, critical: ganttCritical, state: gState, report: ganttReport, text: ganttText, ready: ganttReady, tool: ganttTool, ACTIONS: GANTT_ACTIONS, dir: GANTT_DIR };
}

export class Gantt {
  /** @param {{ kit: object, root?: string }} o */
  constructor({ kit, root = '/.kit/projects' } = {}) { Object.assign(this, createGantt(kit.vfs, kit.vfs.norm(root))); this.kit = kit; }
  get toolDefs() {
    return { gantt: {
      description: 'Plans: Gantt charts for long-term projects. Actions: projects; create (name, description); show (project: text chart); add (project, name, start YYYY-MM-DD, days or end, deps: task ids, owner agent|user, milestone, notes); update (project, task, any field, progress 0-100); link / unlink (project, task, dep); remove (project, task); plan (push tasks after their dependencies); report (late, blocked, ready, due soon, critical path; all projects without project); ready (your tasks that can start now). The user\'s tasks are theirs: change them only when asked (confirm: true).',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: this.ACTIONS }, project: { type: 'string' }, task: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' }, days: { type: 'number' }, deps: { type: 'array', items: { type: 'string' } }, dep: { type: 'string' }, owner: { type: 'string', enum: ['agent', 'user'] }, progress: { type: 'number' }, milestone: { type: 'boolean' }, notes: { type: 'string' }, confirm: { type: 'boolean' } }, required: ['action'] },
      run: a => this.tool(a, 'agent'),
    } };
  }
  plugin() { return { name: 'gantt', tools: ['gantt'] }; }
}
