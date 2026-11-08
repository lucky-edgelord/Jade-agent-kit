// BusyBox 1.37 compiled to WebAssembly (Emscripten). Each command runs in a fresh instance (milliseconds) inside a
// Web Worker, seeded from the VFS; what the command changed is copied back. Falls back to the main thread when the
// page cannot start workers.
import { BB_CORE, BB_WORKER_TAIL } from './internal/busybox_core.js';
import { dec, assetUrl, fetchBytes, fetchText, sameBytes, sleep } from './util.js';

const BB_MAX = 16e6;   // files bigger than this are not copied into a command (they stay in the VFS untouched)

export class BusyBox {
  constructor(vfs) { this.vfs = vfs; this.module = null; this.wasm = null; this.glue = ''; this.applets = new Set(); this.host = ''; this.worker = null; this.seq = 0; this.pending = new Map(); this.mainFns = null; this._p = null; this.error = ''; }
  /** download and start BusyBox; resolves to true when it is ready, false (with .error) when it cannot run here */
  load() {
    return this._p ||= (async () => {
      try {
        const [wasm, glue] = await Promise.all([fetchBytes(assetUrl('busybox.wasm'), 'BusyBox'), fetchText(assetUrl('busybox.glue.js'), 'BusyBox glue')]);
        this.wasm = wasm; this.glue = glue; this.module = await WebAssembly.compile(wasm);
      } catch (e) { this.module = null; this.error = e.message; return false; }
      const fails = [];
      const list = async () => { const r = await this.run(['--list'], '', 20000); if (!r.ok) throw new Error(r.error); this.applets = new Set(dec.decode(r.out).split(/\s+/).filter(Boolean)); if (!this.applets.size) throw new Error('busybox --list returned nothing'); };
      try { this.host = 'worker'; await list(); return true; } catch (e) { fails.push('worker: ' + e.message); }
      try { this.mainFns = this._mainHost(); this.host = 'main'; await list(); return true; }
      catch (e) { fails.push('main thread: ' + e.message); this.module = null; this.host = ''; this.error = 'BusyBox could not start (' + fails.join('; ') + ')'; return false; }
    })();
  }
  get ready() { return !!this.module && this.applets.size > 0; }
  _classicGlue() { return this.glue.replace(/export\s+default\s+BusyBoxModule\s*;?\s*$/, '').replace(/import\.meta\.url/g, '"about:blank"'); }
  _mainHost() { return new Function(this._classicGlue() + '\n' + BB_CORE + '\nreturn { BusyBoxModule, __bbExec };')(); }
  _spawn() {
    const url = URL.createObjectURL(new Blob([this._classicGlue() + '\n' + BB_CORE + '\n' + BB_WORKER_TAIL], { type: 'text/javascript' }));
    let w;
    const ready = new Promise((res, rej) => {
      try { w = new Worker(url, { name: 'busybox' }); } catch (e) { return rej(new Error(`new Worker() refused: ${e.message}`)); }
      const t = setTimeout(() => rej(new Error('worker did not answer within 10s')), 10000);
      w.onmessage = e => { if (e.data.type === 'ready') { clearTimeout(t); w.onmessage = ev => { const p = this.pending.get(ev.data.id); if (p) { this.pending.delete(ev.data.id); p(ev.data); } }; res(); } else if (e.data.type === 'fail') { clearTimeout(t); rej(new Error(e.data.error)); } };
      w.onerror = e => { clearTimeout(t); e.preventDefault?.(); rej(new Error(e.message || 'worker script was blocked or failed to load')); };
      w.postMessage({ type: 'init', wasm: this.wasm });
    });
    this.worker = { w: () => w, ready, url };
  }
  _entries() { const out = []; for (const [p, n] of this.vfs.nodes) { if (n.dir) out.push([p, { dir: true }]); else if (n.data.length <= BB_MAX) out.push([p, { data: n.data }]); } return out; }
  /** low level: run busybox with argv; returns { ok, out, err, code, entries } (bytes) */
  async run(args, stdin = '', timeoutMs = 30000, cwd = '/') {
    if (this.host === 'main') {
      try { return await Promise.race([this.mainFns.__bbExec(this.mainFns.BusyBoxModule, this.module, { args, stdin, entries: this._entries(), cwd }), sleep(timeoutMs).then(() => ({ ok: false, timeout: true, error: `timed out after ${timeoutMs / 1000}s` }))]); }
      catch (e) { return { ok: false, error: String(e?.message || e) }; }
    }
    if (!this.worker) this._spawn();
    try { await this.worker.ready; } catch (e) { this.worker = null; return { ok: false, error: e.message }; }
    const id = ++this.seq; const w = this.worker.w();
    return new Promise(resolve => {
      const t = setTimeout(() => {
        this.pending.delete(id); w.terminate(); if (this.worker?.w() === w) this.worker = null;
        for (const [, r] of this.pending) r({ ok: false, error: 'worker restarted' }); this.pending.clear();
        resolve({ ok: false, timeout: true, error: `timed out after ${timeoutMs / 1000}s` });
      }, timeoutMs);
      this.pending.set(id, r => { clearTimeout(t); resolve(r); });
      w.postMessage({ id, args, stdin, entries: this._entries(), cwd });
    });
  }
  /** run one applet against the VFS and apply what it changed; returns { stdout, stderr, code } as text */
  async exec(name, args = [], { stdin = '', cwd = '/', timeoutMs = 30000 } = {}) {
    if (!this.ready && !(await this.load())) return { stdout: '', stderr: `busybox: ${this.error}\n`, code: 127 };
    const base = new Map(this.vfs.nodes);
    const r = await this.run([name, ...args], stdin, timeoutMs, cwd);
    if (!r.ok) return { stdout: '', stderr: `busybox ${name}: ${r.error}\n`, code: r.timeout ? 124 : 126 };
    this._apply(r.entries, base);
    return { stdout: dec.decode(r.out), stderr: dec.decode(r.err), code: r.code };
  }
  // merge a command's file system into the VFS: only paths the command itself changed are written or removed
  _apply(entries, base) {
    const vfs = this.vfs; const seen = new Set();
    for (const [p, n] of entries) {
      seen.add(p); if (p === '/') continue;
      const b = base.get(p), cur = vfs.nodes.get(p);
      if (n.dir) { if (!cur) vfs.mkdirp(p); continue; }
      if (b && !b.dir && sameBytes(b.data, n.data)) continue;          // untouched by the command: keep what is there now
      if (cur && !cur.dir && sameBytes(cur.data, n.data)) continue;
      vfs.write(p, n.data);
    }
    for (const [p, b] of base) {
      if (p === '/' || seen.has(p) || vfs.nodes.get(p) !== b) continue;
      if (!b.dir && b.data.length > BB_MAX) continue;                  // never sent, so not deleted
      if (vfs.exists(p)) vfs.rm(p, true);
    }
  }
  close() { try { this.worker?.w()?.terminate(); } catch {} if (this.worker?.url) URL.revokeObjectURL(this.worker.url); this.worker = null; }
}
