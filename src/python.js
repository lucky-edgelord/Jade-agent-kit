// MicroPython (the WebAssembly build PyScript uses) in a Web Worker. The VFS is its file system: open() and os see the
// same files as the shell and JS, and changes are written back. `import sqlite3` works (on the kit's SQLite).
// The runtime (~0.5 MB) is downloaded from jsDelivr the first time Python runs.
import { mpyClassic, MPY_COMPAT, MPY_WORKER } from './internal/mpy_worker.js';
import { SQLITE_PY_BRIDGE, SQLITE_PY_SHIM } from './internal/sqlite_py.js';
import { dec, b64enc, fetchBytes, fetchText, isWasm, workerRun } from './util.js';

export const MPY_VERSION = '1.27.0';

export class Python {
  /** @param {{ vfs, sqlite?: Sqlite | (() => Promise<Sqlite>), cdn?: string }} o  sqlite: for `import sqlite3` (loaded only when code mentions it) */
  constructor({ vfs, sqlite = null, cdn = 'https://cdn.jsdelivr.net/npm/' }) { this.vfs = vfs; this._sq = typeof sqlite === 'function' ? sqlite : sqlite ? async () => sqlite : null; this.base = `${cdn}@micropython/micropython-webassembly-pyscript@${MPY_VERSION}/`; this._p = null; }
  /** download the runtime (done automatically on first run) */
  load() {
    return this._p ||= (async () => {
      const [m, w] = await Promise.all([fetchText(this.base + 'micropython.mjs', 'MicroPython'), fetchBytes(this.base + 'micropython.wasm', 'MicroPython')]);
      if (!m || !isWasm(w)) throw new Error(`MicroPython ${MPY_VERSION} downloaded incomplete (${w.length} bytes of wasm)`);
      // a data: URL (not blob:) so the worker can fetch it on any page
      return { factory: mpyClassic(m, this.base), wasm: 'data:application/wasm;base64,' + b64enc(w) };
    })().catch(e => { this._p = null; throw e; });
  }
  /**
   * Run Python code. Returns { stdout, stderr, output, code }.
   * @param {string} code @param {{ argv?: string[], cwd?: string, stdin?: string, timeoutMs?: number, heapMB?: number, signal?: AbortSignal }} [o]
   */
  async run(code, { argv = [''], cwd = '/', stdin = '', timeoutMs = 60000, heapMB = 16, signal = null } = {}) {
    let assets; try { assets = await this.load(); } catch (e) { return { stdout: '', stderr: `python: ${e.message}\n`, output: `python: ${e.message}\n`, code: 1 }; }
    const vfs = this.vfs; const files = {}, dirs = [];
    for (const [p, n] of vfs.nodes) { if (n.dir) dirs.push(p); else if (n.data.length < 4e6) files[p] = n.data; }
    let sqMod = null, sq = null;
    if (this._sq && (/sqlite/i.test(code) || [...vfs.nodes].some(([p, n]) => !n.dir && p.endsWith('.py') && n.data.length < 2e6 && /sqlite/i.test(dec.decode(n.data))))) {
      try { sq = await this._sq(); sqMod = await sq.module(); } catch (e) { return { stdout: '', stderr: `python: could not load SQLite (${e.message})\n`, code: 1 }; }
    }
    const src = sqMod ? assets.factory + sq.glueSource + '\n' + SQLITE_PY_BRIDGE + '\n' + MPY_WORKER : assets.factory + MPY_WORKER;
    const r = await workerRun(src, { sqliteModule: sqMod, sqliteShim: SQLITE_PY_SHIM, compat: MPY_COMPAT, wasm: assets.wasm, files, dirs, cwd, argv, code: String(code), stdin, heap: heapMB * 1024 * 1024 }, { timeoutMs, signal, name: 'python' });
    if (r.error) return { stdout: '', stderr: `python: ${r.error}\n`, output: `python: ${r.error}\n`, code: r.timeout ? 124 : r.aborted ? 130 : 1 };
    const errs = [];
    vfs.applyChanges({ deletes: r.deletes || [], mkdirs: r.mkdirs || [], writes: r.writes || {} }, e => errs.push(`python: ${e.message}\n`));
    const out = r.out || [];
    return { stdout: out.filter(x => x[0] === 'o').map(x => x[1]).join(''), stderr: out.filter(x => x[0] === 'e').map(x => x[1]).join('') + errs.join(''), output: out.map(x => x[1]).join(''), code: r.code ?? 1 };
  }
  /** shell command: python file.py | python -c "code" | echo code | python */
  command() {
    return async (c) => {
      const a = c.argv; let code, argv;
      if (a[0] === '--version' || a[0] === '-V') { c.o(`MicroPython ${MPY_VERSION} (WebAssembly)\n`); return 0; }
      if (a[0] === '-m' && a[1] === 'pip') { c.e('pip is not available: MicroPython runs in the browser and has no package installer.\n'); return 1; }
      if (a[0] === '-c') { code = a[1] ?? ''; argv = ['-c', ...a.slice(2)]; }
      else if (a.length && a[0] !== '-') { const p = c.P(a[0]); if (!this.vfs.isFile(p)) { c.e(`python: can't open file '${a[0]}': No such file\n`); return 2; } code = this.vfs.read(p); argv = [p, ...a.slice(1)]; }
      else { code = c.stdin; argv = ['']; }
      if (!String(code).trim()) { c.e('python: no script given. Use python file.py or python -c "code"\n'); return 2; }
      const r = await this.run(code, { argv, cwd: c.sh.cwd, stdin: a[0] === '-c' || (a.length && a[0] !== '-') ? c.stdin : '', timeoutMs: c.sh.timeoutMs });
      c.o(r.stdout); c.e(r.stderr); return r.code;
    };
  }
}
