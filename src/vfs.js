// VFS: an in-memory POSIX-style file system shared by the shell, Python and JS, optionally kept in IndexedDB.
import { enc, dec, toBytes, idbStore } from './util.js';

export class VFS {
  /** @param {{ persist?: string|false }} opts persist: an IndexedDB database name to keep files across reloads */
  constructor({ persist = false } = {}) {
    this.nodes = new Map([['/', { dir: true, mtime: Date.now() }]]);
    this.listeners = new Set();
    this.store = persist ? idbStore('jade-agent-kit:' + persist) : null;
    this._t = null; this._saving = null;
  }
  /** load saved files (when persist is set); resolves to true if anything was loaded */
  async load() {
    if (!this.store) return false;
    const e = await this.store.get('vfs');
    if (Array.isArray(e) && e.length) { this.nodes = new Map(e); if (!this.nodes.has('/')) this.nodes.set('/', { dir: true, mtime: Date.now() }); return true; }
    return false;
  }
  /** write everything to IndexedDB now (otherwise it happens shortly after each change) */
  async flush() { clearTimeout(this._t); this._t = null; if (this.store) await (this._saving = this.store.set('vfs', [...this.nodes.entries()])); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed(path) {
    for (const f of this.listeners) { try { f(path); } catch {} }
    if (this.store) { clearTimeout(this._t); this._t = setTimeout(() => this.flush().catch(() => {}), 150); }
  }

  norm(p, cwd = '/') {
    if (p == null || p === '') p = '.';
    p = String(p);
    if (p === '~') p = '/'; else if (p.startsWith('~/')) p = '/' + p.slice(2);
    const out = [];
    for (const s of (p.startsWith('/') ? p : cwd + '/' + p).split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
    return '/' + out.join('/');
  }
  parent(p) { if (p === '/') return '/'; const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
  base(p) { return p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1); }
  exists(p) { return this.nodes.has(this.norm(p)); }
  isDir(p) { return this.nodes.get(this.norm(p))?.dir === true; }
  isFile(p) { const n = this.nodes.get(this.norm(p)); return !!n && !n.dir; }
  stat(p) { p = this.norm(p); const n = this.nodes.get(p); if (!n) throw new Error(`${p}: No such file or directory`); return { dir: !!n.dir, size: n.dir ? 4096 : n.data.length, mtime: n.mtime }; }
  mkdirp(p) {
    p = this.norm(p); if (p === '/') return;
    if (this.isFile(p)) throw new Error(`${p}: Not a directory`); if (this.isDir(p)) return;
    this.mkdirp(this.parent(p)); this.nodes.set(p, { dir: true, mtime: Date.now() }); this.changed(p);
  }
  mkdir(p) {
    p = this.norm(p);
    if (this.exists(p)) throw new Error(`${p}: File exists`);
    if (!this.isDir(this.parent(p))) throw new Error(`${this.parent(p)}: No such file or directory`);
    this.nodes.set(p, { dir: true, mtime: Date.now() }); this.changed(p);
  }
  readBytes(p) { p = this.norm(p); const n = this.nodes.get(p); if (!n) throw new Error(`${p}: No such file or directory`); if (n.dir) throw new Error(`${p}: Is a directory`); return n.data; }
  read(p) { return dec.decode(this.readBytes(p)); }
  write(p, data, { mkdirs = true } = {}) {
    p = this.norm(p);
    if (p === '/') throw new Error('/: Is a directory');
    const par = this.parent(p);
    if (mkdirs) this.mkdirp(par); else if (!this.isDir(par)) throw new Error(`${par}: No such file or directory`);
    if (this.isDir(p)) throw new Error(`${p}: Is a directory`);
    this.nodes.set(p, { data: toBytes(data), mtime: Date.now() }); this.changed(p);
  }
  append(p, data) {
    p = this.norm(p);
    const prev = this.isFile(p) ? this.readBytes(p) : new Uint8Array(); const add = toBytes(data);
    const m = new Uint8Array(prev.length + add.length); m.set(prev); m.set(add, prev.length); this.write(p, m);
  }
  touch(p) { p = this.norm(p); const n = this.nodes.get(p); if (n) { n.mtime = Date.now(); this.changed(p); } else this.write(p, ''); }
  list(p = '/') {
    p = this.norm(p);
    if (!this.exists(p)) throw new Error(`${p}: No such file or directory`);
    if (!this.isDir(p)) throw new Error(`${p}: Not a directory`);
    const pre = p === '/' ? '/' : p + '/'; const out = [];
    for (const k of this.nodes.keys()) if (k !== p && k.startsWith(pre) && !k.slice(pre.length).includes('/')) out.push(k.slice(pre.length));
    return out.sort();
  }
  *walk(p = '/') { p = this.norm(p); const pre = p === '/' ? '/' : p + '/'; for (const k of [...this.nodes.keys()].sort()) if (k === p || k.startsWith(pre)) yield k; }
  rm(p, recursive = false) {
    p = this.norm(p);
    if (p === '/') throw new Error("refusing to remove '/'");
    if (!this.exists(p)) throw new Error(`${p}: No such file or directory`);
    if (this.isDir(p)) { if (this.list(p).length && !recursive) throw new Error(`${p}: Directory not empty`); for (const k of [...this.nodes.keys()]) if (k.startsWith(p + '/')) this.nodes.delete(k); }
    this.nodes.delete(p); this.changed(p);
  }
  move(a, b) {
    a = this.norm(a); b = this.norm(b);
    if (!this.exists(a)) throw new Error(`${a}: No such file or directory`);
    if (this.isDir(b)) b = (b === '/' ? '' : b) + '/' + this.base(a);
    if (b === a) return; if (b.startsWith(a + '/')) throw new Error(`cannot move '${a}' into itself`);
    if (!this.isDir(this.parent(b))) throw new Error(`${this.parent(b)}: No such file or directory`);
    const moves = [...this.nodes.entries()].filter(([k]) => k === a || k.startsWith(a + '/'));
    for (const [k] of moves) this.nodes.delete(k);
    for (const [k, v] of moves) this.nodes.set(b + k.slice(a.length), v);
    this.changed(b);
  }
  copy(a, b, recursive = false) {
    a = this.norm(a); b = this.norm(b);
    if (!this.exists(a)) throw new Error(`${a}: No such file or directory`);
    if (this.isDir(b)) b = (b === '/' ? '' : b) + '/' + this.base(a);
    if (this.isDir(a)) {
      if (!recursive) throw new Error(`-r not specified; omitting directory '${a}'`);
      for (const k of [...this.walk(a)]) { const n = this.nodes.get(k); const t = b + k.slice(a.length); if (n.dir) this.mkdirp(t); else this.write(t, n.data.slice()); }
    } else this.write(b, this.readBytes(a).slice());
  }
  entries() { return [...this.nodes.entries()]; }
  replace(entries) { this.nodes = new Map(entries); if (!this.nodes.has('/')) this.nodes.set('/', { dir: true, mtime: Date.now() }); this.changed('/'); }
  /** plain object of every file (path -> Uint8Array), e.g. for export */
  snapshot() { const o = {}; for (const [p, n] of this.nodes) if (!n.dir) o[p] = n.data; return o; }
  /** add files from an object (path -> string | bytes) */
  import(files, root = '/') { for (const [p, d] of Object.entries(files)) this.write(this.norm(p, root), d); }
  // the files a sandboxed run (Python, JS, BusyBox) changed: apply only what changed relative to `base`, so edits
  // made elsewhere while it ran are kept
  applyChanges({ writes = {}, deletes = [], mkdirs = [], rmdirs = [] }, onErr) {
    for (const p of deletes) if (this.isFile(p)) this.rm(p);
    for (const p of rmdirs) if (p !== '/' && this.isDir(p)) this.rm(p, true);
    for (const p of mkdirs) { try { this.mkdirp(p); } catch (e) { onErr?.(e); } }
    for (const [p, d] of Object.entries(writes)) { try { if (d === null) { if (this.isFile(p)) this.rm(p); } else this.write(p, d); } catch (e) { onErr?.(new Error(`could not save ${p}: ${e.message}`)); } }
  }
}
export { enc, dec };
