// Tool definitions for LLM agents, with one dispatcher. Each tool returns text (what a model reads).
//   kit.tools.openai(names?)    → [{ type: 'function', function: { name, description, parameters } }]  (also Ollama's format)
//   kit.tools.anthropic(names?) → [{ name, description, input_schema }]
//   kit.tools.call(name, args)  → Promise<string>
import { searchFiles } from './bm25.js';

const MAX_OUT = 30000;          // characters of tool output handed back to a model
const READ_LINES = 2000;
const clip = (s, n = MAX_OUT) => { s = String(s ?? ''); return s.length <= n ? s : s.slice(0, n / 2) + `\n\n[… ${s.length - n} characters cut …]\n\n` + s.slice(-n / 2); };
const str = { type: 'string' }, int = { type: 'integer' };
const obj = (properties, required = []) => ({ type: 'object', properties, required });

export function createTools(kit) {
  const vfs = kit.vfs;
  let sh = null; const shell = () => sh ||= kit.shell.session({ cwd: '/' });
  const T = {
    read: {
      description: 'Read a text file. Lines are numbered (cat -n style). Use offset (1-based line) and limit for long files.',
      parameters: obj({ path: { ...str, description: 'file path, e.g. /notes/todo.md' }, offset: { ...int, description: 'first line to read (1-based)' }, limit: { ...int, description: `number of lines (default ${READ_LINES})` } }, ['path']),
      run({ path, offset = 1, limit = READ_LINES }) {
        const p = vfs.norm(path, shell().cwd); if (vfs.isDir(p)) return `${p} is a directory:\n` + vfs.list(p).map(n => vfs.isDir(vfs.norm(n, p)) ? n + '/' : n).join('\n');
        const lines = vfs.read(p).split('\n'); const start = Math.max(1, +offset || 1); const end = Math.min(lines.length, start - 1 + (+limit || READ_LINES));
        const body = lines.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(6)}\t${l.length > 2000 ? l.slice(0, 2000) + '…' : l}`).join('\n');
        return clip(body + (end < lines.length ? `\n\n[${lines.length - end} more lines: read with offset ${end + 1}]` : ''));
      },
    },
    write: {
      description: 'Create or overwrite a file with the given content (folders are created as needed).',
      parameters: obj({ path: str, content: str }, ['path', 'content']),
      run({ path, content }) { const p = vfs.norm(path, shell().cwd); const existed = vfs.isFile(p); vfs.write(p, String(content ?? '')); return `${existed ? 'Overwrote' : 'Created'} ${p} (${new TextEncoder().encode(String(content ?? '')).length} bytes)`; },
    },
    edit: {
      description: 'Edit a file by replacing exact text. oldText must match the file exactly (whitespace included) and occur once, unless replaceAll is true. Read the file first.',
      parameters: obj({ path: str, oldText: { ...str, description: 'the exact text to replace' }, newText: { ...str, description: 'the replacement' }, replaceAll: { type: 'boolean' } }, ['path', 'oldText', 'newText']),
      run({ path, oldText, newText, replaceAll = false }) {
        const p = vfs.norm(path, shell().cwd); const text = vfs.read(p); const o = String(oldText ?? ''), n = String(newText ?? '');
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
        const r = await shell().run(command, { timeoutMs: Math.min(600, +timeout || 60) * 1000, signal });
        const out = r.output.trimEnd(); return clip((out || '(no output)') + (r.code ? `\n[exit code ${r.code}]` : ''));
      },
    },
    python: {
      description: 'Run MicroPython code. The file system is shared with the other tools. print() output is returned.',
      parameters: obj({ code: str }, ['code']),
      async run({ code }) { const r = await kit.python.run(code, { cwd: shell().cwd }); return clip((r.output.trimEnd() || '(no output)') + (r.code ? `\n[exit code ${r.code}]` : '')); },
    },
    javascript: {
      description: 'Run JavaScript in a Node-style sandbox (require fs, path, node:sqlite; fetch). console.log output is returned, and the value of a top-level return.',
      parameters: obj({ code: str }, ['code']),
      async run({ code }) { const r = await kit.js.run(code, { cwd: shell().cwd }); return clip([r.output.trimEnd(), r.result !== undefined ? `=> ${JSON.stringify(r.result)}` : '', r.code ? `[exit code ${r.code}]` : ''].filter(Boolean).join('\n') || '(no output)'); },
    },
    sqlite: {
      description: 'Run SQL on a SQLite database file (created if missing; ":memory:" for a scratch one). sqlite-vec (vec0, vec_distance_cosine) and FTS5 are built in. Returns rows as JSON.',
      parameters: obj({ database: { ...str, description: 'file path, e.g. /data/app.db' }, sql: str, params: { type: 'array', items: {} } }, ['database', 'sql']),
      async run({ database, sql, params }) {
        const db = await kit.sqlite.open(database === ':memory:' ? ':memory:' : vfs.norm(database, shell().cwd));
        try { const res = db.exec(sql, params ?? null); return clip(res.length ? JSON.stringify(res.map(r => r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])))).flat().slice(0, 500)) : `OK (${db.db.changes()} rows changed)`); }
        finally { db.close({ save: database !== ':memory:' }); }
      },
    },
    search_files: {
      description: 'Find files by meaning of words (BM25 ranking) under a folder. Returns paths, scores and a snippet.',
      parameters: obj({ query: str, path: { ...str, description: 'folder (default /)' }, limit: int }, ['query']),
      run({ query, path = '/', limit = 10 }) { const r = searchFiles(vfs, query, { root: vfs.norm(path, shell().cwd), limit }); return r.length ? JSON.stringify(r, null, 1) : 'no matches'; },
    },
    search: {
      description: 'Search the web (Ollama web search). Returns titles, URLs and text snippets.',
      parameters: obj({ query: str, max_results: { ...int, description: '1-10 (default 5)' } }, ['query']),
      async run({ query, max_results = 5 }, ctx) { const r = await kit.ollama.webSearch(query, { maxResults: max_results, signal: ctx?.signal }); return clip(r.results?.length ? r.results.map((x, i) => `[${i + 1}] ${x.title}\n${x.url}\n${String(x.content || '').trim()}`).join('\n\n') : 'no results'); },
    },
    fetch: {
      description: 'Fetch a web page by URL (Ollama web fetch). Returns its title, text content and links.',
      parameters: obj({ url: str }, ['url']),
      async run({ url }, ctx) { const r = await kit.ollama.webFetch(url, { signal: ctx?.signal }); return clip(`# ${r.title || url}\n\n${r.content || ''}${r.links?.length ? '\n\nLinks:\n' + r.links.slice(0, 50).join('\n') : ''}`); },
    },
  };
  T.web_search = T.search; T.web_fetch = T.fetch;
  const names = n => (n || Object.keys(T).filter(k => !k.startsWith('web_'))).filter(k => T[k]);
  return {
    defs: T,
    names: () => names(),
    openai: n => names(n).map(name => ({ type: 'function', function: { name, description: T[name].description, parameters: T[name].parameters } })),
    anthropic: n => names(n).map(name => ({ name, description: T[name].description, input_schema: T[name].parameters })),
    /** run a tool; errors come back as text starting with "Error:" so a model can recover */
    async call(name, args = {}, ctx = {}) {
      const t = T[name]; if (!t) return `Error: unknown tool "${name}". Tools: ${names().join(', ')}`;
      if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { return `Error: arguments for ${name} are not valid JSON`; } }
      try { return String(await t.run(args || {}, ctx)); } catch (e) { return `Error: ${e?.message || e}`; }
    },
    /** add your own tool: { description, parameters (JSON schema), run(args, ctx) } */
    add(name, def) { T[name] = def; return this; },
    get shell() { return shell(); },
  };
}
