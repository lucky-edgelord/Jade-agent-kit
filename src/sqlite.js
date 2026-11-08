// SQLite 3.53 compiled to WebAssembly, with sqlite-vec (vector search: vec0 tables, vec_distance_cosine, …) and FTS5.
// Databases run in memory; a database opened from a VFS path is written back with db.save() (or on close()).
import { __jvSqlite, SQLITE_GLUE_SRC } from './internal/sqlite_glue.js';
import { SQLITE_CLI_WORKER } from './internal/sqlite_extras.js';
import { assetUrl, fetchBytes, isSqliteBytes, workerRun } from './util.js';

export class Database {
  constructor(api, vfs, path, { readOnly = false } = {}) {
    this.vfs = vfs; this.path = path ? vfs.norm(path) : null; this.readOnly = readOnly;
    let bytes = null;
    if (this.path && vfs.isFile(this.path)) { bytes = vfs.readBytes(this.path); if (bytes.length && !isSqliteBytes(bytes)) throw new Error(`file is not a database: ${this.path}`); }
    this.db = new api.Database(bytes);
  }
  /** run one or more statements; params bind to the first. Returns [{ columns, values }] per statement with results */
  exec(sql, params) { return this.db.exec(sql, params ?? null); }
  /** rows of one query as objects */
  query(sql, params) { const st = this.db.prepare(sql); try { const cols = st.columns(); return st.rows(params ?? null).map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]]))); } finally { st.finalize(); } }
  /** first row as an object (or undefined) */
  get(sql, params) { return this.query(sql, params)[0]; }
  /** a statement that changes data: { changes, lastInsertRowid } */
  run(sql, params) { const st = this.db.prepare(sql); try { st.bind(params ?? null); while (st.step()) {} } finally { st.finalize(); } return { changes: this.db.changes(), lastInsertRowid: this.db.lastInsertRowid() }; }
  /** run fn inside BEGIN/COMMIT (ROLLBACK on error) */
  transaction(fn) { this.db.exec('BEGIN'); try { const r = fn(this); this.db.exec('COMMIT'); return r; } catch (e) { try { this.db.exec('ROLLBACK'); } catch {} throw e; } }
  prepare(sql) { return this.db.prepare(sql); }
  /** the database file's bytes */
  export() { return this.db.export(); }
  /** write the database back to its VFS path */
  save(path = this.path) { if (!path) throw new Error('this database has no path: pass one to save(path)'); if (this.readOnly) throw new Error('the database is read-only'); this.vfs.write(path, this.db.export()); this.path = this.vfs.norm(path); return this.path; }
  close({ save = true } = {}) { if (!this.db) return; if (save && this.path && !this.readOnly) this.save(); this.db.close(); this.db = null; }
}

export class Sqlite {
  constructor(vfs) { this.vfs = vfs; this._mod = null; this._api = null; this.glueSource = SQLITE_GLUE_SRC; }
  /** the compiled WebAssembly module (downloaded once from the kit's assets) */
  module() { return this._mod ||= fetchBytes(assetUrl('sqlite3.wasm'), 'SQLite').then(b => WebAssembly.compile(b)).catch(e => { this._mod = null; throw e; }); }
  async api() { return this._api ||= __jvSqlite(await this.module()); }
  async version() { return (await this.api()).version; }
  /**
   * Open a database: a VFS path (created on save if missing) or ':memory:'.
   * @returns {Promise<Database>}
   */
  async open(path = ':memory:', opts = {}) { return new Database(await this.api(), this.vfs, path === ':memory:' ? null : path, opts); }
  /** the sqlite3 command-line shell in a worker: argv like the real one (sqlite3 FILE "SQL" | -json | .tables …) */
  async cli(argv, { stdin = '', cwd = '/', timeoutMs = 60000 } = {}) {
    const vfs = this.vfs; let dbArg = null;
    for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (['-separator', '--separator', '-nullvalue', '--nullvalue', '-cmd', '--cmd'].includes(a)) { i++; continue; } if (!a.startsWith('-')) { dbArg = a; break; } }
    const dbPath = dbArg && dbArg !== ':memory:' ? vfs.norm(dbArg, cwd) : null;
    if (dbPath && vfs.isDir(dbPath)) return { stdout: '', stderr: `Error: unable to open database "${dbArg}": it is a directory\n`, code: 1 };
    const dbBytes = dbPath && vfs.isFile(dbPath) ? vfs.readBytes(dbPath) : null;
    if (dbBytes && dbBytes.length && !isSqliteBytes(dbBytes)) return { stdout: '', stderr: `Error: file is not a database: ${dbArg}\n`, code: 1 };
    const files = {}; const src = [stdin, ...argv].join('\n');
    for (const m of src.matchAll(/^\s*\.(?:import|read)\s+(.+)$/gm)) for (const tok of m[1].match(/"[^"]*"|'[^']*'|\S+/g) || []) {
      const t = tok.replace(/^["']|["']$/g, ''); if (t.startsWith('--')) continue; const p = vfs.norm(t, cwd); if (vfs.isFile(p)) files[t] = vfs.read(p);
    }
    let module; try { module = await this.module(); } catch (e) { return { stdout: '', stderr: `sqlite3: could not load SQLite (${e.message})\n`, code: 1 }; }
    const r = await workerRun(SQLITE_GLUE_SRC + '\n' + SQLITE_CLI_WORKER, { module, argv, stdin, dbBytes, files }, { timeoutMs, name: 'sqlite3' });
    if (r.error) return { stdout: '', stderr: `sqlite3: ${r.error}\n`, code: r.timeout ? 124 : 1 };
    if (r.dbBytes && dbPath) vfs.write(dbPath, new Uint8Array(r.dbBytes));
    return { stdout: r.out || '', stderr: r.err || '', code: r.code ?? 1 };
  }
  command() { return async c => { const r = await this.cli(c.argv, { stdin: c.stdin, cwd: c.sh.cwd, timeoutMs: c.sh.timeoutMs }); c.o(r.stdout); c.e(r.stderr); return r.code; }; }
}
