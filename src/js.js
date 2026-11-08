// Run JavaScript in a Web Worker with a Node-style sandbox: require('fs' | 'path' | 'util' | 'os' | 'http' | 'https' |
// 'node:sqlite' | 'better-sqlite3'), local modules (./lib.js), Buffer, process, and `kit` (alias `jade`) to call the
// kit's tools from a script. Files the script writes go back to the VFS.
import { NODE_PRELUDE } from './internal/node_prelude.js';
import { dec, isSqliteBytes } from './util.js';

const TF_USE = /\btf\s*\.\s*[A-Za-z_$]|@tensorflow\/tfjs/;

export class JsRunner {
  /** @param {{ vfs, sqlite?: import('./sqlite.js').Sqlite, ml?: import('./ml.js').ML, bridge?: (op: string, args: object) => Promise<any> }} o */
  constructor({ vfs, sqlite = null, ml = null, bridge = null }) { this.vfs = vfs; this.sqlite = sqlite; this.ml = ml; this.bridge = bridge; }
  _changesSince(before) {
    const files = {}, deleted = [], dirs = [], rmdirs = [];
    for (const [p, n] of this.vfs.nodes) {
      const b = before.get(p);
      if (n.dir) { if (b !== 'd') dirs.push(p); continue; }
      if (b === n) continue;
      if (isSqliteBytes(n.data)) files[p] = n.data; else if (n.data.length < 2e6) files[p] = dec.decode(n.data);
    }
    for (const [p, b] of before) if (!this.vfs.nodes.has(p)) (b === 'd' ? rmdirs : deleted).push(p);
    return Object.keys(files).length || deleted.length || dirs.length || rmdirs.length ? { files, deleted, dirs, rmdirs } : null;
  }
  _apply(r, onErr) {
    if (!r) return;
    const W = Object.entries(r.writes || {});
    this.vfs.applyChanges({ deletes: W.filter(([, d]) => d === null).map(([p]) => p), rmdirs: r.rmdirs || [], mkdirs: r.mkdirs || [], writes: Object.fromEntries(W.filter(([, d]) => d !== null)) }, onErr);
  }
  /**
   * Run a script. Returns { stdout, stderr, code, result } (result: the value of a top-level `return`, as JSON).
   * @param {string} code
   * @param {{ argv?: string[], cwd?: string, globals?: object, timeoutMs?: number, readOnly?: boolean, network?: boolean, env?: object, signal?: AbortSignal, onOutput?: (text, isErr) => void }} [o]
   */
  async run(code, { argv = ['[eval]'], cwd = '/', globals = null, timeoutMs = 60000, readOnly = false, network = true, env = {}, signal = null } = {}) {
    const vfs = this.vfs;
    code = String(code ?? '').replace(/^#!.*\n/, '');
    if (/^\s*(import|export)\s/m.test(code)) code = code
      .replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");')
      .replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");')
      .replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm, (s, a, b) => 'const {' + a.replace(/\s+as\s+/g, ': ') + '} = require("' + b + '");')
      .replace(/^\s*export\s+(default\s+)?/gm, '');
    const files = {}, dirs = [], bins = {};
    for (const [p, n] of vfs.nodes) { if (n.dir) dirs.push(p); else if (isSqliteBytes(n.data)) { bins[p] = n.data; files[p] = n.data; } else if (n.data.length < 2e6) files[p] = dec.decode(n.data); }
    const mentions = re => re.test(code) || [...vfs.nodes].some(([p, n]) => !n.dir && /\.[cm]?js$/.test(p) && n.data.length < 2e6 && re.test(dec.decode(n.data)));
    let sqMod = null, sqSrc = '', tfSrc = '';
    if (this.sqlite && mentions(/sqlite/i)) { try { sqMod = await this.sqlite.module(); sqSrc = this.sqlite.glueSource; } catch (e) { return { stdout: '', stderr: `node: could not load SQLite (${e.message})\n`, code: 1 }; } }
    if (this.ml && network && mentions(TF_USE)) { try { tfSrc = await this.ml.tfjsSource(); } catch (e) { return { stdout: '', stderr: `node: could not load TensorFlow.js (${e.message})\n`, code: 1 }; } }
    const names = globals ? Object.keys(globals).filter(k => /^[$A-Za-z_][\w$]*$/.test(k)) : [];
    const head = names.length ? `const { ${names.join(', ')} } = __globals;\n` : '';
    const src = NODE_PRELUDE + '\nconst kit = jade;\n' + `\nasync function __main() {\n${head}${code}\n}\n` + (sqSrc ? '\n' + sqSrc + '\n' : '')
      + (tfSrc ? `\n(function () { var exports, module, define;\n${tfSrc}\n}).call(self);\nself.__tfInit = async () => { const tf = self.tf; try { tf.env().set('IS_NODE', false); } catch (e) {} const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { let gl = false; try { gl = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(2, 2).getContext('webgl2'); } catch (e) {} for (const b of ['webgpu', 'webgl']) { if (b === 'webgpu' && !(self.navigator && self.navigator.gpu)) continue; if (b === 'webgl' && !gl) continue; try { if (tf.findBackendFactory(b) && await tf.setBackend(b)) { await tf.ready(); const v = await tf.tensor([1, 2]).add(1).data(); if (v[0] === 2) return; } } catch (e) {} } for (const b of ['webgpu', 'webgl']) { try { tf.removeBackend(b); } catch (e) {} } await tf.setBackend('cpu'); await tf.ready(); } finally { Object.assign(console, keep); } };\n` : '');
    const off = NODE_PRELUDE.split('\n').length + 3 + (head ? 1 : 0);
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const bridge = this.bridge;
    const r = await new Promise(resolve => {
      let w; try { w = new Worker(url, { name: 'node' }); } catch (e) { resolve({ out: [['e', `node: could not start a worker (${e.message})\n`]], writes: {}, code: 1 }); return; }
      let done = false;
      const finish = v => { if (done) return; done = true; clearTimeout(t); signal?.removeEventListener?.('abort', ab); w.terminate(); resolve(v); };
      const t = setTimeout(() => finish({ out: [['e', `node: killed after ${timeoutMs / 1000}s timeout\n`]], writes: {}, code: 124 }), timeoutMs);
      const ab = () => finish({ out: [['e', 'node: stopped\n']], writes: {}, code: 130 }); signal?.addEventListener?.('abort', ab);
      w.onmessage = async e => {
        const m = e.data;
        if (m && m.t === 'jade') {
          let reply;
          try {
            if (!bridge) throw new Error('kit calls are not available here');
            if (m.sync && !readOnly) this._apply(m.sync);
            const before = new Map(); for (const [p, n] of vfs.nodes) before.set(p, n.dir ? 'd' : n);
            const value = await bridge(m.op, m.a || {});
            let v = value === undefined ? null : value; try { v = JSON.parse(JSON.stringify(v)); } catch { v = String(v); }
            reply = { t: 'jret', id: m.id, ok: true, value: v, sync: readOnly ? null : this._changesSince(before) };
          } catch (err) { reply = { t: 'jret', id: m.id, ok: false, error: String(err?.message || err) }; }
          if (!done) w.postMessage(reply);
          return;
        }
        finish(m);
      };
      w.onerror = e => { e.preventDefault?.(); finish({ out: [['e', `${e.message || 'SyntaxError'}${e.lineno ? ` (line ${Math.max(1, e.lineno - off)})` : ''}\n`]], writes: {}, code: 1 }); };
      w.postMessage({ files, dirs, bins, sqliteModule: sqMod, env, cwd, argv, globals: globals ? JSON.parse(JSON.stringify(globals)) : {}, bridge: !!bridge, bridgeWhy: bridge ? '' : 'no host bridge', noNet: !network });
    });
    URL.revokeObjectURL(url);
    const errs = [];
    if (!readOnly) this._apply(r, e => errs.push(e.message + '\n'));
    const out = r.out || [];
    return { stdout: out.filter(x => x[0] === 'o').map(x => x[1]).join(''), stderr: out.filter(x => x[0] === 'e').map(x => x[1]).join('') + errs.join(''), output: out.map(x => x[1]).join(''), code: r.code ?? 1, result: r.ret };
  }
  /** shell command: node file.js | node -e "code" | node -p "expr" | echo code | node */
  command() {
    return async (c) => {
      const a = c.argv; let code, argv;
      const i = a.findIndex(x => x === '-e' || x === '-p' || x === '--eval' || x === '--print');
      if (i >= 0) { code = /p/.test(a[i]) ? `console.log(${a[i + 1] ?? ''})` : (a[i + 1] ?? ''); argv = ['[eval]', ...a.slice(i + 2)]; }
      else if (a.length && a[0] !== '-') { const p = c.P(a[0]); if (!this.vfs.isFile(p)) { c.e(`node: cannot find module '${a[0]}'\n`); return 1; } code = this.vfs.read(p); argv = [p, ...a.slice(1)]; }
      else { code = c.stdin; argv = ['[stdin]']; }
      if (!String(code).trim()) { c.e('node: no script given. Use node file.js or node -e "code"\n'); return 1; }
      const r = await this.run(code, { argv, cwd: c.sh.cwd, timeoutMs: c.sh.timeoutMs, env: c.sh.env });
      c.o(r.stdout); c.e(r.stderr); return r.code;
    };
  }
}
