// Tool definitions for LLM agents, with one dispatcher. Each tool returns text (what a model reads).
//   kit.tools.openai(names?)    → [{ type: 'function', function: { name, description, parameters } }]  (also Ollama's format)
//   kit.tools.anthropic(names?) → [{ name, description, input_schema }]
//   kit.tools.call(name, args)  → Promise<string>
import { Cron } from './internal/cron_core.js';

const MAX_OUT = 30000;          // characters of tool output handed back to a model
const READ_LINES = 2000;
const clip = (s, n = MAX_OUT) => { s = String(s ?? ''); return s.length <= n ? s : s.slice(0, n / 2) + `\n\n[… ${s.length - n} characters cut …]\n\n` + s.slice(-n / 2); };
const str = { type: 'string' }, int = { type: 'integer' };
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export function createTools(kit) {
  const vfs = kit.vfs;
  // the tools' shell session: started (and the shell loaded) only when a tool needs it
  let sh = null; const shell = async () => sh ||= (await kit.use('shell')).session({ cwd: '/' }); const cwd = () => sh?.cwd || '/';
  const T = {
    read: {
      description: 'Read a text file. Lines are numbered (cat -n style). Use offset (1-based line) and limit for long files.',
      parameters: obj({ path: { ...str, description: 'file path, e.g. /notes/todo.md' }, offset: { ...int, description: 'first line to read (1-based)' }, limit: { ...int, description: `number of lines (default ${READ_LINES})` } }, ['path']),
      run({ path, offset = 1, limit = READ_LINES }) {
        const p = vfs.norm(path, cwd()); if (vfs.isDir(p)) return `${p} is a directory:\n` + vfs.list(p).map(n => vfs.isDir(vfs.norm(n, p)) ? n + '/' : n).join('\n');
        const lines = vfs.read(p).split('\n'); const start = Math.max(1, +offset || 1); const end = Math.min(lines.length, start - 1 + (+limit || READ_LINES));
        const body = lines.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(6)}\t${l.length > 2000 ? l.slice(0, 2000) + '…' : l}`).join('\n');
        return clip(body + (end < lines.length ? `\n\n[${lines.length - end} more lines: read with offset ${end + 1}]` : ''));
      },
    },
    write: {
      description: 'Create or overwrite a file with the given content (folders are created as needed).',
      parameters: obj({ path: str, content: str }, ['path', 'content']),
      run({ path, content }) { const p = vfs.norm(path, cwd()); const existed = vfs.isFile(p); vfs.write(p, String(content ?? '')); return `${existed ? 'Overwrote' : 'Created'} ${p} (${new TextEncoder().encode(String(content ?? '')).length} bytes)`; },
    },
    edit: {
      description: 'Edit a file by replacing exact text. oldText must match the file exactly (whitespace included) and occur once, unless replaceAll is true. Read the file first.',
      parameters: obj({ path: str, oldText: { ...str, description: 'the exact text to replace' }, newText: { ...str, description: 'the replacement' }, replaceAll: { type: 'boolean' } }, ['path', 'oldText', 'newText']),
      run({ path, oldText, newText, replaceAll = false }) {
        const p = vfs.norm(path, cwd()); const text = vfs.read(p); const o = String(oldText ?? ''), n = String(newText ?? '');
        if (!o) throw new Error('oldText is empty');
        const count = text.split(o).length - 1;
        if (!count) throw new Error(`oldText was not found in ${p}. Read the file and copy the text exactly.`);
        if (count > 1 && !replaceAll) throw new Error(`oldText occurs ${count} times in ${p}. Include more surrounding text so it is unique, or set replaceAll.`);
        const out = replaceAll ? text.split(o).join(n) : text.replace(o, () => n); vfs.write(p, out);
        const line = text.slice(0, text.indexOf(o)).split('\n').length;
        return `Edited ${p}: ${replaceAll ? count : 1} replacement${(replaceAll ? count : 1) > 1 ? 's' : ''} at line ${line}`;
      },
    },
    bash: {
      description: 'Run a shell command line (BusyBox: ls, cat, grep, sed, awk, find, …; pipes, redirects, && ||, $(…)). Also node, python and sqlite3. The working directory persists between calls.',
      parameters: obj({ command: str, timeout: { ...int, description: 'seconds (default 60)' } }, ['command']),
      async run({ command, timeout = 60 }, { signal } = {}) {
        const r = await (await shell()).run(command, { timeoutMs: Math.min(600, +timeout || 60) * 1000, signal });
        const out = r.output.trimEnd(); return clip((out || '(no output)') + (r.code ? `\n[exit code ${r.code}]` : ''));
      },
    },
    python: {
      description: 'Run MicroPython code. The file system is shared with the other tools. print() output is returned.',
      parameters: obj({ code: str }, ['code']),
      async run({ code }) { const r = await (await kit.use('python')).run(code, { cwd: cwd() }); return clip((r.output.trimEnd() || '(no output)') + (r.code ? `\n[exit code ${r.code}]` : '')); },
    },
    javascript: {
      description: 'Run JavaScript in a Node-style sandbox (require fs, path, node:sqlite; fetch). console.log output is returned, and the value of a top-level return.',
      parameters: obj({ code: str }, ['code']),
      async run({ code }) { const r = await (await kit.use('js')).run(code, { cwd: cwd() }); return clip([r.output.trimEnd(), r.result !== undefined ? `=> ${JSON.stringify(r.result)}` : '', r.code ? `[exit code ${r.code}]` : ''].filter(Boolean).join('\n') || '(no output)'); },
    },
    sqlite: {
      description: 'Run SQL on a SQLite database file (created if missing; ":memory:" for a scratch one). sqlite-vec (vec0, vec_distance_cosine) and FTS5 are built in. Returns rows as JSON.',
      parameters: obj({ database: { ...str, description: 'file path, e.g. /data/app.db' }, sql: str, params: { type: 'array', items: {} } }, ['database', 'sql']),
      async run({ database, sql, params }) {
        const db = await (await kit.use('sqlite')).open(database === ':memory:' ? ':memory:' : vfs.norm(database, cwd()));
        try { const res = db.exec(sql, params ?? null); return clip(res.length ? JSON.stringify(res.map(r => r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])))).flat().slice(0, 500)) : `OK (${db.db.changes()} rows changed)`); }
        finally { db.close({ save: database !== ':memory:' }); }
      },
    },
    search_files: {
      description: 'Find files by meaning of words (BM25 ranking) under a folder. Returns paths, scores and a snippet.',
      parameters: obj({ query: str, path: { ...str, description: 'folder (default /)' }, limit: int }, ['query']),
      async run({ query, path = '/', limit = 10 }) { const { searchFiles } = await import('./bm25.js'); const r = searchFiles(vfs, query, { root: vfs.norm(path, cwd()), limit }); return r.length ? JSON.stringify(r, null, 1) : 'no matches'; },
    },
    search: {
      description: 'Search the web (Ollama web search). Returns titles, URLs and text snippets.',
      parameters: obj({ query: str, max_results: { ...int, description: '1-10 (default 5)' } }, ['query']),
      async run({ query, max_results = 5 }, ctx) { const r = await (await kit.use('ollama')).cloud.webSearch(query, { maxResults: max_results, signal: ctx?.signal }); return clip(r.results?.length ? r.results.map((x, i) => `[${i + 1}] ${x.title}\n${x.url}\n${String(x.content || '').trim()}`).join('\n\n') : 'no results'); },
    },
    fetch: {
      description: 'Fetch a web page by URL (Ollama web fetch). Returns its title, text content and links.',
      parameters: obj({ url: str }, ['url']),
      async run({ url }, ctx) { const r = await (await kit.use('ollama')).cloud.webFetch(url, { signal: ctx?.signal }); return clip(`# ${r.title || url}\n\n${r.content || ''}${r.links?.length ? '\n\nLinks:\n' + r.links.slice(0, 50).join('\n') : ''}`); },
    },
    decide: {
      description: 'Ask a decision model to judge something with calibrated probabilities: pick one option (choice), rate on levels (score), or answer yes/no (yesno). Fast and cheap; use it for triage, routing and checks.',
      parameters: obj({ state: { ...str, description: 'what to judge: a message, log, diff, error or JSON' }, question: { ...str, description: 'what to decide, as an instruction' }, type: { type: 'string', enum: ['choice', 'score', 'yesno'] }, options: { type: 'array', items: str, description: 'choice: the options; score: 2-10 levels, lowest first; yesno: none' } }, ['state', 'question']),
      async run(a, ctx) {
        const d = await kit.decide({ ...a, signal: ctx?.signal });
        const probs = Object.entries(d.probabilities).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(', ');
        const head = d.type === 'score' ? `score: ${d.score}${d.legend != null ? ` (${typeof d.legend === 'string' ? d.legend : JSON.stringify(d.legend).slice(0, 200)})` : ''}` : d.type === 'yesno' ? `answer: ${d.answer ? 'yes' : 'no'}` : `choice: ${d.choice}`;
        return `${head}${d.confidence != null ? ` | confidence ${d.confidence.toFixed(3)}` : ''}${probs ? `\nprobabilities: ${probs}` : ''}\nmodel: ${d.model} (${(await kit.use('decisions')).name})`;
      },
    },
    tasks: {
      description: 'Your task list for multi-step work: add tasks when you plan, mark one in_progress while you work on it and done when it is finished. Actions: add (title, or titles for several), update (id, status, title, notes), list, remove (id), clear (removes done tasks).',
      parameters: obj({ action: { type: 'string', enum: ['add', 'update', 'list', 'remove', 'clear'] }, title: str, titles: { type: 'array', items: str }, id: int, status: { type: 'string', enum: ['pending', 'in_progress', 'done'] }, notes: str }, ['action']),
      async run(a) {
        const t = await kit.use('tasks');
        if (a.action === 'add') { const r = t.add(a.titles?.length ? a.titles : { title: a.title, notes: a.notes }); return `Added ${[].concat(r).map(x => '#' + x.id).join(', ')}\n\n${t.text()}`; }
        if (a.action === 'update') { const r = t.update(a.id, { status: a.status, title: a.title, notes: a.notes }); return `#${r.id} is ${r.status}\n\n${t.text()}`; }
        if (a.action === 'remove') { t.remove(a.id); return `Removed #${a.id}\n\n${t.text()}`; }
        if (a.action === 'clear') { const n = t.clear(); return `Removed ${n} done task${n === 1 ? '' : 's'}\n\n${t.text()}`; }
        return t.text();
      },
    },
    schedule: {
      description: 'Schedule work to run later or repeatedly while the page is open: a shell command, JavaScript, Python, or a prompt for an agent. "when" is plain English ("every day at 9am", "weekdays at 8:30", "every 30 minutes", "in 20 minutes", "tomorrow at 7pm") or 5-field cron. Actions: add, list, remove, enable, disable, run (now).',
      parameters: obj({ action: { type: 'string', enum: ['add', 'list', 'remove', 'enable', 'disable', 'run'] }, name: str, when: str, command: { ...str, description: 'a shell command line' }, js: str, python: str, prompt: { ...str, description: 'a prompt for an agent' }, id: { ...str, description: 'job id or name' } }, ['action']),
      async run(a) {
        const s = await kit.use('schedule'); const fmt = j => `${j.id} ${j.name} · ${j.cron ? Cron.describe(j.cron) + ` (${j.cron})` : 'once'} · next ${j.next ? new Date(j.next).toLocaleString() : '—'}${j.enabled ? '' : ' · disabled'}${j.last ? ` · last ${j.last.error ? 'failed: ' + j.last.error : 'exit ' + j.last.code}` : ''}`;
        if (a.action === 'add') { const j = s.add({ name: a.name, when: a.when, command: a.command, js: a.js, python: a.python, prompt: a.prompt }); return 'Scheduled ' + fmt(j) + (s.started ? '' : '\n(the scheduler is stopped: kit.schedule.start())'); }
        if (a.action === 'remove') { s.remove(a.id ?? a.name); return 'Removed ' + (a.id ?? a.name); }
        if (a.action === 'enable' || a.action === 'disable') return fmt(s.enable(a.id ?? a.name, a.action === 'enable'));
        if (a.action === 'run') { const r = await s.runNow(a.id ?? a.name); return r.error ? `Error: ${r.error}` : (r.output?.trimEnd() || '(no output)') + (r.code ? `\n[exit code ${r.code}]` : ''); }
        const l = s.list(); return l.length ? l.map(fmt).join('\n') : 'Nothing is scheduled.';
      },
    },
    sentry: {
      description: 'Sentry: rules that watch the page and its sensors and act when something happens. Actions: systems (what can be watched), list, add (rule), remove (id), enable / disable (id), status (current readings and rules), emit (event name + data), set (key + value). A rule: { id, when: {src, op: lt|le|gt|ge|eq|ne|in, value} (or all/any/not, or {src:"geo", op:"inside"|"outside", lat, lon, radius_m}), on: {event, where}, for_s, cooldown_s, hours: "22:00-07:00", alert: {notify}, run: {command | js | python | prompt | tool} }.',
      parameters: obj({ action: { type: 'string', enum: ['systems', 'list', 'add', 'remove', 'enable', 'disable', 'status', 'emit', 'set'] }, rule: { type: 'object' }, id: str, event: str, data: { type: 'object' }, key: str, value: {} }, ['action']),
      async run(a) {
        const se = await kit.use('sentry'); const { SYSTEMS } = await import('./sentry.js');
        if (a.action === 'systems') return SYSTEMS.map(x => `${x.id}${x.sensitive ? ' (needs allow)' : ''}: ${x.gist}`).join('\n');
        if (a.action === 'add') { const r = se.add(a.rule); const st = se.status(); return `Added rule ${r.id}${st.warnings.length ? '\nwarnings: ' + st.warnings.join('; ') : ''}${se.started ? '' : '\n(Sentry is not started: kit.sentry.start())'}`; }
        if (a.action === 'remove') { se.remove(a.id); return 'Removed ' + a.id; }
        if (a.action === 'enable' || a.action === 'disable') { se.enable(a.id, a.action === 'enable'); return `${a.id} ${a.action}d`; }
        if (a.action === 'emit') { const f = se.emit(a.event, a.data || {}); return f.length ? 'fired: ' + f.map(x => x.id).join(', ') : 'no rule fired'; }
        if (a.action === 'set') { const f = se.set(a.key, a.value); return f.length ? 'fired: ' + f.map(x => x.id).join(', ') : 'set; no rule fired'; }
        if (a.action === 'status') return JSON.stringify(se.status(), null, 1).slice(0, 8000);
        const r = se.rules().triggers; return r.length ? r.map(t => JSON.stringify(t)).join('\n') : 'No rules.';
      },
    },
  };
  T.web_search = T.search; T.web_fetch = T.fetch;
  const BUILTIN = new Set(Object.keys(T));
  // tools that come with a feature: listed once the feature is loaded; a call loads it
  const LAZY = { memory: 'memory', knowledge: 'knowledge', think: 'think', delegate: 'delegate', skill: 'skills', find_skill: 'skills', chat_history: 'history', more_tools: 'router' };
  const names = n => (n || Object.keys(T).filter(k => !k.startsWith('web_'))).filter(k => T[k]);
  return {
    defs: T,
    names: () => names(),
    openai: n => names(n).map(name => ({ type: 'function', function: { name, description: T[name].description, parameters: T[name].parameters } })),
    anthropic: n => names(n).map(name => ({ name, description: T[name].description, input_schema: T[name].parameters })),
    /** run a tool; errors come back as text starting with "Error:" so a model can recover */
    async call(name, args = {}, ctx = {}) {
      if (!T[name] && LAZY[name]) { try { await kit.use(LAZY[name]); } catch (e) { return `Error: ${name}: ${e?.message || e}`; } }
      const t = T[name]; if (!t) return `Error: unknown tool "${name}". Tools: ${names().join(', ')}`;
      if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { return `Error: arguments for ${name} are not valid JSON`; } }
      try { return String(await t.run(args || {}, ctx)); } catch (e) { return `Error: ${e?.message || e}`; }
    },
    /** add your own tool: { description, parameters (JSON schema), run(args, ctx) } */
    add(name, def) { T[name] = def; return this; },
    /** add several: { name: def } (features add their tools this way when they load) */
    addAll(defs) { for (const [n, d] of Object.entries(defs || {})) if (!BUILTIN.has(n)) T[n] = d; return this; },
    /** the feature behind a tool that is not loaded yet, if any */
    lazy: name => T[name] ? null : LAZY[name] || null,
  };
}
