/*! Jade Agent Kit 0.1.0 | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */

// src/util.js
var enc = new TextEncoder();
var dec = new TextDecoder();
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function b64enc(u8) {
  let s = "";
  for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768));
  return btoa(s);
}
var toBytes = (d) => d instanceof Uint8Array ? d : typeof d === "string" ? enc.encode(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : enc.encode(String(d ?? ""));
var sameBytes = (a, b) => {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
var isSqliteBytes = (b) => !!b && b.length >= 16 && String.fromCharCode(...b.subarray(0, 15)) === "SQLite format 3";
var isWasm = (u8) => !!u8 && u8.length >= 8 && u8[0] === 0 && u8[1] === 97 && u8[2] === 115 && u8[3] === 109;
var ASSETS = new URL("../assets/", import.meta.url).href;
var assetUrl = (name) => new URL(name, ASSETS).href;
var setAssetsBase = (base) => {
  if (base) ASSETS = new URL(base.endsWith("/") ? base : base + "/", location.href).href;
};
var getAssetsBase = () => ASSETS;
async function fetchBytes(url, what = url) {
  let r;
  try {
    r = await fetch(url);
  } catch (e) {
    throw new Error(`could not download ${what} (${e.message || e})`);
  }
  if (!r.ok) throw new Error(`could not download ${what}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
async function fetchText(url, what = url) {
  return dec.decode(await fetchBytes(url, what));
}
var scripts = /* @__PURE__ */ new Map();
function loadScript(url, global) {
  if (global && globalThis[global]) return Promise.resolve(globalThis[global]);
  if (!scripts.has(url)) scripts.set(url, new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = url;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.onload = () => res(global ? globalThis[global] : true);
    s.onerror = () => {
      scripts.delete(url);
      rej(new Error(`could not load ${url}`));
    };
    document.head.appendChild(s);
  }));
  return scripts.get(url);
}
function idbStore(dbName, store = "kv") {
  let dbp = null;
  const open = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store);
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      dbp = null;
      rej(r.error);
    };
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(store, mode);
      const q = fn(t.objectStore(store));
      t.oncomplete = () => res(q?.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: (k, v) => tx("readwrite", (s) => s.put(v, k)),
    del: (k) => tx("readwrite", (s) => s.delete(k)),
    keys: () => tx("readonly", (s) => s.getAllKeys()),
    close: async () => {
      if (dbp) (await dbp).close();
      dbp = null;
    }
  };
}
function workerRun(src, msg, { timeoutMs = 6e4, transfer = [], onMessage = null, signal = null, name = "worker" } = {}) {
  const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
  return new Promise((resolve) => {
    let w;
    try {
      w = new Worker(url, { name });
    } catch (e) {
      URL.revokeObjectURL(url);
      resolve({ error: `could not start a ${name} worker (${e.message})` });
      return;
    }
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      signal?.removeEventListener?.("abort", ab);
      w.terminate();
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const t = setTimeout(() => finish({ timeout: true, error: `${name}: stopped after ${timeoutMs / 1e3}s timeout` }), timeoutMs);
    const ab = () => finish({ aborted: true, error: `${name}: stopped` });
    signal?.addEventListener?.("abort", ab);
    w.onmessage = async (e) => {
      if (onMessage) {
        const handled = await onMessage(e.data, w);
        if (handled) return;
      }
      finish(e.data);
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      finish({ error: `${e.message || name + " error"}${e.lineno ? ` (line ${e.lineno})` : ""}`, lineno: e.lineno });
    };
    w.postMessage(msg, transfer);
  });
}

// src/vfs.js
var VFS = class {
  /** @param {{ persist?: string|false }} opts persist: an IndexedDB database name to keep files across reloads */
  constructor({ persist = false } = {}) {
    this.nodes = /* @__PURE__ */ new Map([["/", { dir: true, mtime: Date.now() }]]);
    this.listeners = /* @__PURE__ */ new Set();
    this.store = persist ? idbStore("jade-agent-kit:" + persist) : null;
    this._t = null;
    this._saving = null;
  }
  /** load saved files (when persist is set); resolves to true if anything was loaded */
  async load() {
    if (!this.store) return false;
    const e = await this.store.get("vfs");
    if (Array.isArray(e) && e.length) {
      this.nodes = new Map(e);
      if (!this.nodes.has("/")) this.nodes.set("/", { dir: true, mtime: Date.now() });
      return true;
    }
    return false;
  }
  /** write everything to IndexedDB now (otherwise it happens shortly after each change) */
  async flush() {
    clearTimeout(this._t);
    this._t = null;
    if (this.store) await (this._saving = this.store.set("vfs", [...this.nodes.entries()]));
  }
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed(path) {
    for (const f of this.listeners) {
      try {
        f(path);
      } catch {
      }
    }
    if (this.store) {
      clearTimeout(this._t);
      this._t = setTimeout(() => this.flush().catch(() => {
      }), 150);
    }
  }
  norm(p, cwd = "/") {
    if (p == null || p === "") p = ".";
    p = String(p);
    if (p === "~") p = "/";
    else if (p.startsWith("~/")) p = "/" + p.slice(2);
    const out = [];
    for (const s of (p.startsWith("/") ? p : cwd + "/" + p).split("/")) {
      if (!s || s === ".") continue;
      if (s === "..") out.pop();
      else out.push(s);
    }
    return "/" + out.join("/");
  }
  parent(p) {
    if (p === "/") return "/";
    const i = p.lastIndexOf("/");
    return i <= 0 ? "/" : p.slice(0, i);
  }
  base(p) {
    return p === "/" ? "/" : p.slice(p.lastIndexOf("/") + 1);
  }
  exists(p) {
    return this.nodes.has(this.norm(p));
  }
  isDir(p) {
    return this.nodes.get(this.norm(p))?.dir === true;
  }
  isFile(p) {
    const n = this.nodes.get(this.norm(p));
    return !!n && !n.dir;
  }
  stat(p) {
    p = this.norm(p);
    const n = this.nodes.get(p);
    if (!n) throw new Error(`${p}: No such file or directory`);
    return { dir: !!n.dir, size: n.dir ? 4096 : n.data.length, mtime: n.mtime };
  }
  mkdirp(p) {
    p = this.norm(p);
    if (p === "/") return;
    if (this.isFile(p)) throw new Error(`${p}: Not a directory`);
    if (this.isDir(p)) return;
    this.mkdirp(this.parent(p));
    this.nodes.set(p, { dir: true, mtime: Date.now() });
    this.changed(p);
  }
  mkdir(p) {
    p = this.norm(p);
    if (this.exists(p)) throw new Error(`${p}: File exists`);
    if (!this.isDir(this.parent(p))) throw new Error(`${this.parent(p)}: No such file or directory`);
    this.nodes.set(p, { dir: true, mtime: Date.now() });
    this.changed(p);
  }
  readBytes(p) {
    p = this.norm(p);
    const n = this.nodes.get(p);
    if (!n) throw new Error(`${p}: No such file or directory`);
    if (n.dir) throw new Error(`${p}: Is a directory`);
    return n.data;
  }
  read(p) {
    return dec.decode(this.readBytes(p));
  }
  write(p, data, { mkdirs = true } = {}) {
    p = this.norm(p);
    if (p === "/") throw new Error("/: Is a directory");
    const par = this.parent(p);
    if (mkdirs) this.mkdirp(par);
    else if (!this.isDir(par)) throw new Error(`${par}: No such file or directory`);
    if (this.isDir(p)) throw new Error(`${p}: Is a directory`);
    this.nodes.set(p, { data: toBytes(data), mtime: Date.now() });
    this.changed(p);
  }
  append(p, data) {
    p = this.norm(p);
    const prev = this.isFile(p) ? this.readBytes(p) : new Uint8Array();
    const add = toBytes(data);
    const m = new Uint8Array(prev.length + add.length);
    m.set(prev);
    m.set(add, prev.length);
    this.write(p, m);
  }
  touch(p) {
    p = this.norm(p);
    const n = this.nodes.get(p);
    if (n) {
      n.mtime = Date.now();
      this.changed(p);
    } else this.write(p, "");
  }
  list(p = "/") {
    p = this.norm(p);
    if (!this.exists(p)) throw new Error(`${p}: No such file or directory`);
    if (!this.isDir(p)) throw new Error(`${p}: Not a directory`);
    const pre = p === "/" ? "/" : p + "/";
    const out = [];
    for (const k of this.nodes.keys()) if (k !== p && k.startsWith(pre) && !k.slice(pre.length).includes("/")) out.push(k.slice(pre.length));
    return out.sort();
  }
  *walk(p = "/") {
    p = this.norm(p);
    const pre = p === "/" ? "/" : p + "/";
    for (const k of [...this.nodes.keys()].sort()) if (k === p || k.startsWith(pre)) yield k;
  }
  rm(p, recursive = false) {
    p = this.norm(p);
    if (p === "/") throw new Error("refusing to remove '/'");
    if (!this.exists(p)) throw new Error(`${p}: No such file or directory`);
    if (this.isDir(p)) {
      if (this.list(p).length && !recursive) throw new Error(`${p}: Directory not empty`);
      for (const k of [...this.nodes.keys()]) if (k.startsWith(p + "/")) this.nodes.delete(k);
    }
    this.nodes.delete(p);
    this.changed(p);
  }
  move(a, b) {
    a = this.norm(a);
    b = this.norm(b);
    if (!this.exists(a)) throw new Error(`${a}: No such file or directory`);
    if (this.isDir(b)) b = (b === "/" ? "" : b) + "/" + this.base(a);
    if (b === a) return;
    if (b.startsWith(a + "/")) throw new Error(`cannot move '${a}' into itself`);
    if (!this.isDir(this.parent(b))) throw new Error(`${this.parent(b)}: No such file or directory`);
    const moves = [...this.nodes.entries()].filter(([k]) => k === a || k.startsWith(a + "/"));
    for (const [k] of moves) this.nodes.delete(k);
    for (const [k, v] of moves) this.nodes.set(b + k.slice(a.length), v);
    this.changed(b);
  }
  copy(a, b, recursive = false) {
    a = this.norm(a);
    b = this.norm(b);
    if (!this.exists(a)) throw new Error(`${a}: No such file or directory`);
    if (this.isDir(b)) b = (b === "/" ? "" : b) + "/" + this.base(a);
    if (this.isDir(a)) {
      if (!recursive) throw new Error(`-r not specified; omitting directory '${a}'`);
      for (const k of [...this.walk(a)]) {
        const n = this.nodes.get(k);
        const t = b + k.slice(a.length);
        if (n.dir) this.mkdirp(t);
        else this.write(t, n.data.slice());
      }
    } else this.write(b, this.readBytes(a).slice());
  }
  entries() {
    return [...this.nodes.entries()];
  }
  replace(entries) {
    this.nodes = new Map(entries);
    if (!this.nodes.has("/")) this.nodes.set("/", { dir: true, mtime: Date.now() });
    this.changed("/");
  }
  /** plain object of every file (path -> Uint8Array), e.g. for export */
  snapshot() {
    const o = {};
    for (const [p, n] of this.nodes) if (!n.dir) o[p] = n.data;
    return o;
  }
  /** add files from an object (path -> string | bytes) */
  import(files, root = "/") {
    for (const [p, d] of Object.entries(files)) this.write(this.norm(p, root), d);
  }
  // the files a sandboxed run (Python, JS, BusyBox) changed: apply only what changed relative to `base`, so edits
  // made elsewhere while it ran are kept
  applyChanges({ writes = {}, deletes = [], mkdirs = [], rmdirs = [] }, onErr) {
    for (const p of deletes) if (this.isFile(p)) this.rm(p);
    for (const p of rmdirs) if (p !== "/" && this.isDir(p)) this.rm(p, true);
    for (const p of mkdirs) {
      try {
        this.mkdirp(p);
      } catch (e) {
        onErr?.(e);
      }
    }
    for (const [p, d] of Object.entries(writes)) {
      try {
        if (d === null) {
          if (this.isFile(p)) this.rm(p);
        } else this.write(p, d);
      } catch (e) {
        onErr?.(new Error(`could not save ${p}: ${e.message}`));
      }
    }
  }
};

// src/internal/busybox_core.js
var BB_CORE = `
async function __bbExec(BusyBoxModule, MOD, d) {
  const { args, stdin, entries, cwd } = d;
  const SYS = new Set(['/dev', '/proc']);
  const inp = new TextEncoder().encode(stdin || ''); let ip = 0; const out = [], err = [];
  const M = await BusyBoxModule({
    noInitialRun: true, thisProgram: 'busybox',
    instantiateWasm(imports, cb) { WebAssembly.instantiate(MOD, imports).then(i => cb(i, MOD)); return {}; },
    stdin: () => ip < inp.length ? inp[ip++] : null,
    stdout: c => { if (c != null) out.push(c); }, stderr: c => { if (c != null) err.push(c); },
    print: () => {}, printErr: () => {},
  });
  const FS = M.FS; const defaults = new Set();
  // stdio is already open, so Emscripten's /dev, /proc and /home can go: they would leak into
  // the agent's filesystem and make grep -r / find hang on /dev/urandom
  const nuke = (q) => { let st; try { st = FS.lstat(q); } catch { return; } if (FS.isDir(st.mode)) { let kids = []; try { kids = FS.readdir(q); } catch {} for (const n of kids) if (n !== '.' && n !== '..') nuke(q + '/' + n); try { FS.rmdir(q); } catch {} } else { try { FS.unlink(q); } catch {} } };
  if (!entries.some(([p]) => p === '/home' || p.startsWith('/home/'))) nuke('/home');
  for (const q of ['/proc/self/fd', '/proc/self', '/proc']) { try { FS.rmdir(q); } catch {} }
  nuke('/dev');
  if (!entries.some(([p]) => p === '/tmp' || p.startsWith('/tmp/'))) { try { FS.rmdir('/tmp'); } catch {} }
  const scan = (dir) => { for (const n of FS.readdir(dir)) { if (n === '.' || n === '..') continue; const q = (dir === '/' ? '' : dir) + '/' + n; if (SYS.has(q)) continue; defaults.add(q); if (FS.isDir(FS.stat(q).mode)) scan(q); } };
  scan('/');
  const orig = new Set();
  for (const [p, n] of entries) { if (p === '/') continue; orig.add(p); if (n.dir) { try { FS.mkdirTree(p); } catch {} } else { try { FS.mkdirTree(p.slice(0, p.lastIndexOf('/')) || '/'); } catch {} FS.writeFile(p, n.data); } }
  try { FS.mkdirTree(cwd); } catch {} FS.chdir(cwd);
  let code = 0;
  try { code = M.callMain(args) ?? 0; } catch (x) { code = typeof x?.status === 'number' ? x.status : 134; if (typeof x?.status !== 'number') err.push(...new TextEncoder().encode(String(x?.message || x) + '\\n')); }
  const res = [['/', { dir: true }]];
  const walk = (dir) => { for (const n of FS.readdir(dir)) { if (n === '.' || n === '..') continue; const q = (dir === '/' ? '' : dir) + '/' + n; if (SYS.has(q)) continue; let st; try { st = FS.lstat(q); } catch { continue; } if (FS.isDir(st.mode)) { res.push([q, { dir: true }]); walk(q); } else if (FS.isFile(st.mode)) res.push([q, { data: FS.readFile(q) }]); } };
  walk('/');
  // drop Emscripten's own empty default dirs unless the VFS had them or something was written inside
  const keep = res.filter(([p, n]) => !(n.dir && defaults.has(p) && !orig.has(p) && !res.some(([q]) => q.startsWith(p + '/') && !(defaults.has(q) && !orig.has(q)))));
  return { ok: true, out: new Uint8Array(out), err: new Uint8Array(err), code, entries: keep };
}`;
var BB_WORKER_TAIL = `
let __MOD = null;
self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try { __MOD = await WebAssembly.compile(d.wasm); self.postMessage({ type: 'ready' }); }
    catch (x) { self.postMessage({ type: 'fail', error: 'WebAssembly compile in worker: ' + (x?.message || x) }); }
    return;
  }
  try { const r = await __bbExec(BusyBoxModule, __MOD, d); r.id = d.id; self.postMessage(r); }
  catch (x) { self.postMessage({ id: d.id, ok: false, error: String(x?.message || x) }); }
};`;

// src/busybox.js
var BB_MAX = 16e6;
var BusyBox = class {
  constructor(vfs) {
    this.vfs = vfs;
    this.module = null;
    this.wasm = null;
    this.glue = "";
    this.applets = /* @__PURE__ */ new Set();
    this.host = "";
    this.worker = null;
    this.seq = 0;
    this.pending = /* @__PURE__ */ new Map();
    this.mainFns = null;
    this._p = null;
    this.error = "";
  }
  /** download and start BusyBox; resolves to true when it is ready, false (with .error) when it cannot run here */
  load() {
    return this._p ||= (async () => {
      try {
        const [wasm, glue] = await Promise.all([fetchBytes(assetUrl("busybox.wasm"), "BusyBox"), fetchText(assetUrl("busybox.glue.js"), "BusyBox glue")]);
        this.wasm = wasm;
        this.glue = glue;
        this.module = await WebAssembly.compile(wasm);
      } catch (e) {
        this.module = null;
        this.error = e.message;
        return false;
      }
      const fails = [];
      const list = async () => {
        const r = await this.run(["--list"], "", 2e4);
        if (!r.ok) throw new Error(r.error);
        this.applets = new Set(dec.decode(r.out).split(/\s+/).filter(Boolean));
        if (!this.applets.size) throw new Error("busybox --list returned nothing");
      };
      try {
        this.host = "worker";
        await list();
        return true;
      } catch (e) {
        fails.push("worker: " + e.message);
      }
      try {
        this.mainFns = this._mainHost();
        this.host = "main";
        await list();
        return true;
      } catch (e) {
        fails.push("main thread: " + e.message);
        this.module = null;
        this.host = "";
        this.error = "BusyBox could not start (" + fails.join("; ") + ")";
        return false;
      }
    })();
  }
  get ready() {
    return !!this.module && this.applets.size > 0;
  }
  _classicGlue() {
    return this.glue.replace(/export\s+default\s+BusyBoxModule\s*;?\s*$/, "").replace(/import\.meta\.url/g, '"about:blank"');
  }
  _mainHost() {
    return new Function(this._classicGlue() + "\n" + BB_CORE + "\nreturn { BusyBoxModule, __bbExec };")();
  }
  _spawn() {
    const url = URL.createObjectURL(new Blob([this._classicGlue() + "\n" + BB_CORE + "\n" + BB_WORKER_TAIL], { type: "text/javascript" }));
    let w;
    const ready = new Promise((res, rej) => {
      try {
        w = new Worker(url, { name: "busybox" });
      } catch (e) {
        return rej(new Error(`new Worker() refused: ${e.message}`));
      }
      const t = setTimeout(() => rej(new Error("worker did not answer within 10s")), 1e4);
      w.onmessage = (e) => {
        if (e.data.type === "ready") {
          clearTimeout(t);
          w.onmessage = (ev) => {
            const p = this.pending.get(ev.data.id);
            if (p) {
              this.pending.delete(ev.data.id);
              p(ev.data);
            }
          };
          res();
        } else if (e.data.type === "fail") {
          clearTimeout(t);
          rej(new Error(e.data.error));
        }
      };
      w.onerror = (e) => {
        clearTimeout(t);
        e.preventDefault?.();
        rej(new Error(e.message || "worker script was blocked or failed to load"));
      };
      w.postMessage({ type: "init", wasm: this.wasm });
    });
    this.worker = { w: () => w, ready, url };
  }
  _entries() {
    const out = [];
    for (const [p, n] of this.vfs.nodes) {
      if (n.dir) out.push([p, { dir: true }]);
      else if (n.data.length <= BB_MAX) out.push([p, { data: n.data }]);
    }
    return out;
  }
  /** low level: run busybox with argv; returns { ok, out, err, code, entries } (bytes) */
  async run(args, stdin = "", timeoutMs = 3e4, cwd = "/") {
    if (this.host === "main") {
      try {
        return await Promise.race([this.mainFns.__bbExec(this.mainFns.BusyBoxModule, this.module, { args, stdin, entries: this._entries(), cwd }), sleep(timeoutMs).then(() => ({ ok: false, timeout: true, error: `timed out after ${timeoutMs / 1e3}s` }))]);
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }
    if (!this.worker) this._spawn();
    try {
      await this.worker.ready;
    } catch (e) {
      this.worker = null;
      return { ok: false, error: e.message };
    }
    const id = ++this.seq;
    const w = this.worker.w();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        w.terminate();
        if (this.worker?.w() === w) this.worker = null;
        for (const [, r] of this.pending) r({ ok: false, error: "worker restarted" });
        this.pending.clear();
        resolve({ ok: false, timeout: true, error: `timed out after ${timeoutMs / 1e3}s` });
      }, timeoutMs);
      this.pending.set(id, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      w.postMessage({ id, args, stdin, entries: this._entries(), cwd });
    });
  }
  /** run one applet against the VFS and apply what it changed; returns { stdout, stderr, code } as text */
  async exec(name, args = [], { stdin = "", cwd = "/", timeoutMs = 3e4 } = {}) {
    if (!this.ready && !await this.load()) return { stdout: "", stderr: `busybox: ${this.error}
`, code: 127 };
    const base = new Map(this.vfs.nodes);
    const r = await this.run([name, ...args], stdin, timeoutMs, cwd);
    if (!r.ok) return { stdout: "", stderr: `busybox ${name}: ${r.error}
`, code: r.timeout ? 124 : 126 };
    this._apply(r.entries, base);
    return { stdout: dec.decode(r.out), stderr: dec.decode(r.err), code: r.code };
  }
  // merge a command's file system into the VFS: only paths the command itself changed are written or removed
  _apply(entries, base) {
    const vfs = this.vfs;
    const seen = /* @__PURE__ */ new Set();
    for (const [p, n] of entries) {
      seen.add(p);
      if (p === "/") continue;
      const b = base.get(p), cur = vfs.nodes.get(p);
      if (n.dir) {
        if (!cur) vfs.mkdirp(p);
        continue;
      }
      if (b && !b.dir && sameBytes(b.data, n.data)) continue;
      if (cur && !cur.dir && sameBytes(cur.data, n.data)) continue;
      vfs.write(p, n.data);
    }
    for (const [p, b] of base) {
      if (p === "/" || seen.has(p) || vfs.nodes.get(p) !== b) continue;
      if (!b.dir && b.data.length > BB_MAX) continue;
      if (vfs.exists(p)) vfs.rm(p, true);
    }
  }
  close() {
    try {
      this.worker?.w()?.terminate();
    } catch {
    }
    if (this.worker?.url) URL.revokeObjectURL(this.worker.url);
    this.worker = null;
  }
};

// src/internal/shell_core.js
function createShellEnv(env) {
  const vfs = env.vfs, bb = env.busybox;
  env.engine ||= "auto";
  env.commands ||= {};
  function tokenize2(s) {
    const toks = [];
    let i = 0, w = null;
    const lit = (v, q) => {
      w ??= [];
      const l = w[w.length - 1];
      if (l && l.t === "lit" && l.q === q) l.v += v;
      else w.push({ t: "lit", v, q });
    };
    const end = () => {
      if (w) {
        toks.push({ t: "w", segs: w });
        w = null;
      }
    };
    const readVar = (q) => {
      const n = s[i + 1];
      w ??= [];
      if (n === "(") {
        let d = 0, j = i + 1;
        for (; j < s.length; j++) {
          if (s[j] === "(") d++;
          else if (s[j] === ")") {
            d--;
            if (!d) break;
          }
        }
        if (j >= s.length) throw new Error("unterminated $(");
        w.push({ t: "sub", v: s.slice(i + 2, j), q });
        i = j + 1;
        return;
      }
      if (n === "{") {
        const j = s.indexOf("}", i);
        if (j < 0) throw new Error("bad substitution");
        w.push({ t: "var", v: s.slice(i + 2, j), q });
        i = j + 1;
        return;
      }
      const m = /^([A-Za-z_]\w*|[?$#0-9])/.exec(s.slice(i + 1));
      if (m) {
        w.push({ t: "var", v: m[1], q });
        i += 1 + m[1].length;
        return;
      }
      lit("$", q);
      i++;
    };
    while (i < s.length) {
      const c = s[i];
      if (c === "\\") {
        if (s[i + 1] === "\n") {
          i += 2;
          continue;
        }
        lit(s[i + 1] ?? "", true);
        i += 2;
        continue;
      }
      if (c === "'") {
        const j = s.indexOf("'", i + 1);
        if (j < 0) throw new Error("unterminated quote");
        w ??= [];
        lit(s.slice(i + 1, j), true);
        i = j + 1;
        continue;
      }
      if (c === '"') {
        i++;
        w ??= [];
        lit("", true);
        while (i < s.length && s[i] !== '"') {
          if (s[i] === "\\" && '"\\$`'.includes(s[i + 1])) {
            lit(s[i + 1], true);
            i += 2;
          } else if (s[i] === "$") readVar(true);
          else {
            lit(s[i], true);
            i++;
          }
        }
        if (s[i] !== '"') throw new Error("unterminated quote");
        i++;
        continue;
      }
      if (c === "$") {
        readVar(false);
        continue;
      }
      if (c === " " || c === "	" || c === "\r") {
        end();
        i++;
        continue;
      }
      if (c === "\n") {
        end();
        toks.push({ t: "op", v: ";" });
        i++;
        continue;
      }
      if (c === "#" && !w) {
        while (i < s.length && s[i] !== "\n") i++;
        continue;
      }
      const m = /^(2>&1|&>|2>>|2>|>>|>&2|1>|>|<|&&|\|\||\||;|&)/.exec(s.slice(i));
      if (m && !(w && m[1].startsWith("2"))) {
        end();
        toks.push({ t: "op", v: m[1] });
        i += m[1].length;
        continue;
      }
      lit(c, false);
      i++;
    }
    end();
    return toks;
  }
  function parse(toks) {
    const list = [];
    let pipeline = [], cmd = { words: [], redirs: [] };
    const endCmd = () => {
      if (cmd.words.length || cmd.redirs.length) pipeline.push(cmd);
      cmd = { words: [], redirs: [] };
    };
    const endPipe = (op) => {
      endCmd();
      if (pipeline.length) list.push({ pipeline, op });
      else if (op === "&&" || op === "||") throw new Error(`syntax error near '${op}'`);
      pipeline = [];
    };
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === "w") {
        cmd.words.push(t.segs);
        continue;
      }
      switch (t.v) {
        case "|":
          endCmd();
          break;
        case "&&":
        case "||":
        case ";":
        case "&":
          endPipe(t.v === "&" ? ";" : t.v);
          break;
        case "2>&1":
        case ">&2":
          cmd.redirs.push({ op: t.v });
          break;
        default: {
          const tgt = toks[++k];
          if (!tgt || tgt.t !== "w") throw new Error(`syntax error near '${t.v}'`);
          cmd.redirs.push({ op: t.v === "1>" ? ">" : t.v, target: tgt.segs });
        }
      }
    }
    endPipe(";");
    return list;
  }
  const GLOB_ESC = "";
  function globToRe(pat, { anchored = true } = {}) {
    let r = "";
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === GLOB_ESC) {
        r += pat[++i].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
        continue;
      }
      if (c === "*") r += "[^/]*";
      else if (c === "?") r += "[^/]";
      else if (c === "[") {
        const j = pat.indexOf("]", i + 1);
        if (j > i) {
          let cls = pat.slice(i + 1, j);
          if (cls[0] === "!") cls = "^" + cls.slice(1);
          r += "[" + cls.replace(/\\/g, "\\\\") + "]";
          i = j;
        } else r += "\\[";
      } else r += c.replace(/[.+^${}()|\\/\]]/g, "\\$&");
    }
    return new RegExp(anchored ? "^" + r + "$" : r);
  }
  class Shell {
    constructor({ cwd = "/", env: env2 = {}, onOutput = null } = {}) {
      this.cwd = cwd;
      this.env = { HOME: "/", USER: "agent", SHELL: "/bin/sh", PATH: "/bin", ...env2 };
      this.lastCode = 0;
      this.onOutput = onOutput;
      this.aborted = false;
      this.timeoutMs = 6e4;
    }
    getVar(n) {
      if (n === "?") return String(this.lastCode);
      if (n === "$") return "1337";
      if (n === "#") return "0";
      if (n === "0") return "sh";
      if (n === "PWD") return this.cwd;
      return this.env[n] ?? "";
    }
    async expandWord(segs) {
      let s = "", glob = false;
      const escG = (v) => v.replace(/[*?[\]]/g, (m) => GLOB_ESC + m);
      for (const g of segs) {
        if (g.t === "lit") {
          if (g.q) s += escG(g.v);
          else {
            s += g.v;
            if (/[*?[]/.test(g.v)) glob = true;
          }
        } else if (g.t === "var") s += escG(this.getVar(g.v));
        else if (g.t === "sub") {
          const r = await this.capture(g.v);
          s += escG(r.replace(/\n+$/, ""));
        }
      }
      if (glob) {
        const m = this.glob(s);
        if (m.length) return m;
      }
      return [s.replaceAll(GLOB_ESC, "")];
    }
    glob(pat) {
      const abs = pat.startsWith("/");
      const absPat = vfs.norm(pat.replaceAll(GLOB_ESC, ""), this.cwd).replaceAll("", GLOB_ESC);
      const re = globToRe(absPat);
      const showDot = /(^|\/)\./.test(pat.replaceAll(GLOB_ESC, ""));
      const out = [];
      for (const p of vfs.nodes.keys()) {
        if (p === "/" || !re.test(p)) continue;
        if (!showDot && /\/\.[^/]*$/.test(p)) continue;
        out.push(p);
      }
      out.sort();
      if (abs) return out;
      const pre = this.cwd === "/" ? "/" : this.cwd + "/";
      return out.map((p) => p.startsWith(pre) ? p.slice(pre.length) : p);
    }
    async capture(src) {
      const sub = new Shell({ cwd: this.cwd, env: { ...this.env } });
      sub.aborted = this.aborted;
      sub.timeoutMs = this.timeoutMs;
      const r = await sub.run(src);
      return r.chunks.filter((c) => !c.err).map((c) => c.s).join("");
    }
    /** run a script; returns {chunks:[{s,err}], code} */
    async run(src, { stdin = "" } = {}) {
      const chunks = [];
      const emit = (s, err = false) => {
        if (!s) return;
        chunks.push({ s, err });
        this.onOutput?.(s, err);
      };
      let list;
      try {
        list = parse(tokenize2(src));
      } catch (e) {
        emit(`sh: ${e.message}
`, true);
        this.lastCode = 2;
        return { chunks, code: 2 };
      }
      let prevOp = ";";
      for (const item of list) {
        if (this.aborted) {
          emit("^C\n", true);
          this.lastCode = 130;
          break;
        }
        if (prevOp === "&&" && this.lastCode !== 0 || prevOp === "||" && this.lastCode === 0) {
          prevOp = item.op;
          continue;
        }
        try {
          this.lastCode = await this.runPipeline(item.pipeline, stdin, emit);
        } catch (e) {
          if (e && e.__exit !== void 0) {
            this.lastCode = e.__exit;
            break;
          }
          emit(`sh: ${e.message}
`, true);
          this.lastCode = 1;
        }
        prevOp = item.op;
      }
      return { chunks, code: this.lastCode };
    }
    async runPipeline(pipeline, stdin, emit) {
      let input = stdin, code = 0;
      for (let k = 0; k < pipeline.length; k++) {
        const cmd = pipeline[k];
        const last = k === pipeline.length - 1;
        const argv = [];
        for (const w of cmd.words) argv.push(...await this.expandWord(w));
        let inp = k === 0 ? input : input;
        let outTo = null, errTo = null, mergeErr = false, outToErr = false;
        for (const r2 of cmd.redirs) {
          if (r2.op === "2>&1") {
            mergeErr = true;
            continue;
          }
          if (r2.op === ">&2") {
            outToErr = true;
            continue;
          }
          const t = (await this.expandWord(r2.target))[0];
          const p = t === "/dev/null" ? null : vfs.norm(t, this.cwd);
          if (r2.op === "<") {
            if (t === "/dev/null") inp = "";
            else inp = vfs.read(p);
          } else if (r2.op === ">" || r2.op === ">>") outTo = { p, append: r2.op === ">>", dn: t === "/dev/null" };
          else if (r2.op === "2>" || r2.op === "2>>") errTo = { p, append: r2.op === "2>>", dn: t === "/dev/null" };
          else if (r2.op === "&>") {
            outTo = { p, append: false, dn: t === "/dev/null" };
            mergeErr = true;
          }
        }
        if (outTo && !outTo.dn) {
          if (outTo.append) {
            if (!vfs.exists(outTo.p)) vfs.write(outTo.p, "", { mkdirs: false });
          } else vfs.write(outTo.p, "", { mkdirs: false });
        }
        const r = await this.exec(argv, inp ?? "");
        let out = r.out || "", err = r.err || "";
        if (mergeErr) {
          out += err;
          err = "";
        }
        if (outToErr) {
          err += out;
          out = "";
        }
        if (errTo) {
          if (!errTo.dn) errTo.append ? vfs.append(errTo.p, err) : vfs.write(errTo.p, err, { mkdirs: false });
          err = "";
        }
        if (outTo) {
          if (!outTo.dn) vfs.append(outTo.p, out);
          out = "";
        }
        if (err) emit(err, true);
        if (last) emit(out);
        else input = out;
        code = r.code;
      }
      return code;
    }
    async exec(argv, stdin) {
      while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) {
        const a = argv.shift();
        const i = a.indexOf("=");
        this.env[a.slice(0, i)] = a.slice(i + 1);
      }
      if (!argv.length) return { out: "", err: "", code: 0 };
      let [name, ...args] = argv;
      if (name === "busybox" && args.length && !args[0].startsWith("-")) {
        name = args.shift();
      }
      const ctx = { argv: args, stdin, sh: this, outS: "", errS: "", o(s) {
        this.outS += s;
      }, e(s) {
        this.errS += s;
      }, P: (p) => vfs.norm(p, this.cwd), name };
      const fin = (code) => ({ out: ctx.outS, err: ctx.errS, code: code ?? 0 });
      try {
        if (BUILTINS[name]) return fin(await BUILTINS[name](ctx));
        if (env.commands[name]) return fin(await env.commands[name](ctx));
        const engine = env.engine;
        const useWasm = bb.ready && bb.applets.has(name) && engine !== "js" && !JS_ONLY.has(name) && !env.commands[name];
        if (useWasm) {
          const r = await this.execWasm(name, args, stdin);
          if (r.code !== 0 && engine === "auto" && APPLETS[name] && /unrecognized|invalid option|unknown option|not implemented/i.test(r.err)) return fin(await APPLETS[name](ctx));
          return r;
        }
        if (engine === "wasm" && !JS_ONLY.has(name)) {
          if (!bb.ready) return { out: "", err: `sh: ${name}: BusyBox is not loaded${bb.error ? " (" + bb.error + ")" : ""}
`, code: 127 };
          return { out: "", err: `sh: ${name}: applet not found in this BusyBox build
`, code: 127 };
        }
        if (env.commands[name]) return fin(await env.commands[name](ctx));
        if (APPLETS[name]) return fin(await APPLETS[name](ctx));
        if (bb.ready && bb.applets.has(name)) return await this.execWasm(name, args, stdin);
        if (vfs.isFile(vfs.norm(name, this.cwd)) && /\.(sh)$/.test(name)) return fin(await BUILTINS.sh({ ...ctx, argv: [name, ...args] }));
        return { out: "", err: `sh: ${name}: not found
`, code: 127 };
      } catch (e) {
        if (e && e.__exit !== void 0) throw e;
        return { out: ctx.outS, err: ctx.errS + `${name}: ${e.message}
`, code: 1 };
      }
    }
    async execWasm(name, args, stdin) {
      const r = await bb.exec(name, args, { stdin, cwd: this.cwd, timeoutMs: this.timeoutMs });
      return { out: r.stdout, err: r.stderr, code: r.code };
    }
  }
  function opts(args, spec = "") {
    const takes = new Set([...spec.matchAll(/(\w):/g)].map((m) => m[1]));
    const f = {};
    const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--") {
        rest.push(...args.slice(i + 1));
        break;
      }
      if (/^-\d+$/.test(a) && takes.has("n")) {
        f.n = a.slice(1);
        continue;
      }
      if (a.startsWith("--") && a.length > 2) {
        const [k, v] = a.slice(2).split("=");
        f[k] = v ?? true;
        continue;
      }
      if (a.startsWith("-") && a.length > 1) {
        for (let j = 1; j < a.length; j++) {
          const ch = a[j];
          if (takes.has(ch)) {
            f[ch] = a.slice(j + 1) || args[++i];
            break;
          }
          f[ch] = true;
        }
        continue;
      }
      rest.push(a);
    }
    return { f, rest };
  }
  function inputs(c, files) {
    if (!files.length) return [{ name: "-", text: c.stdin }];
    return files.map((fn) => {
      if (fn === "-") return { name: "-", text: c.stdin };
      try {
        return { name: fn, text: vfs.read(c.P(fn)) };
      } catch (e) {
        c.e(`${c.name}: ${e.message}
`);
        return null;
      }
    }).filter(Boolean);
  }
  const splitLines = (t) => {
    if (!t) return [];
    const l = t.split("\n");
    if (l[l.length - 1] === "") l.pop();
    return l;
  };
  function breToJs(p) {
    let r = "";
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === "\\" && i + 1 < p.length) {
        const n = p[++i];
        if ("(){}|+?".includes(n)) r += n;
        else r += "\\" + n;
      } else if ("(){}|+?".includes(c)) r += "\\" + c;
      else r += c;
    }
    return r;
  }
  const fmtSize = (n) => n < 1024 ? n + "" : n < 1048576 ? (n / 1024).toFixed(1) + "K" : (n / 1048576).toFixed(1) + "M";
  const MON = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ");
  const fmtDate = (t) => {
    const d = new Date(t);
    return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const JS_ONLY = /* @__PURE__ */ new Set(["node", "js", "python", "python3", "sqlite3", "help", "sh", "bash", "xargs"]);
  const BUILTINS = {
    cd(c) {
      const t = c.P(c.argv[0] ?? "/");
      if (!vfs.isDir(t)) {
        c.e(`cd: ${c.argv[0]}: No such directory
`);
        return 1;
      }
      c.sh.cwd = t;
      return 0;
    },
    pwd(c) {
      c.o(c.sh.cwd + "\n");
      return 0;
    },
    export(c) {
      for (const a of c.argv) {
        const i = a.indexOf("=");
        if (i > 0) c.sh.env[a.slice(0, i)] = a.slice(i + 1);
      }
      return 0;
    },
    unset(c) {
      for (const a of c.argv) delete c.sh.env[a];
      return 0;
    },
    exit(c) {
      throw { __exit: parseInt(c.argv[0] ?? "0") || 0 };
    },
    true: () => 0,
    false: () => 1,
    ":": () => 0,
    async sh(c) {
      const { f, rest } = opts(c.argv, "c:");
      const sub = new Shell({ cwd: c.sh.cwd, env: { ...c.sh.env } });
      sub.timeoutMs = c.sh.timeoutMs;
      let src = f.c;
      if (src == null) {
        if (!rest.length) {
          src = c.stdin;
        } else src = vfs.read(c.P(rest[0]));
      }
      const r = await sub.run(src);
      for (const ch of r.chunks) ch.err ? c.e(ch.s) : c.o(ch.s);
      return r.code;
    },
    get bash() {
      return this.sh;
    },
    source(c) {
      return BUILTINS.sh(c);
    },
    which(c) {
      let code = 0;
      for (const a of c.argv) {
        if (BUILTINS[a] || APPLETS[a] || env.commands[a] || bb.applets.has(a)) c.o(`/bin/${a}
`);
        else code = 1;
      }
      return code;
    },
    type(c) {
      for (const a of c.argv) c.o(BUILTINS[a] ? `${a} is a shell builtin
` : bb.applets.has(a) && env.engine !== "js" ? `${a} is /bin/${a} (busybox.wasm)
` : APPLETS[a] ? `${a} is /bin/${a} (js applet)
` : `${a}: not found
`);
      return 0;
    },
    help(c) {
      const names = /* @__PURE__ */ new Set([...Object.keys(BUILTINS), ...Object.keys(APPLETS), ...Object.keys(env.commands), ...bb.applets]);
      c.o(`Jade Agent Kit shell \u2014 ${bb.ready ? `BusyBox WASM (${bb.applets.size} applets) + JS` : "JS applets"}
Supports: pipes |, redirects > >> < 2> 2>&1 &>, && || ;, $VAR, $(cmd), globs * ? [..]
No loops/if blocks: use node or python for scripting. Extra: ${Object.keys(env.commands).sort().join(", ")}, xargs.

` + [...names].sort().join("  ") + "\n");
      return 0;
    },
    async xargs(c) {
      const { f, rest } = opts(c.argv, "n:I:");
      const items = c.stdin.split(/\s+/).filter(Boolean);
      const cmd = rest.length ? rest : ["echo"];
      const runOne = async (argv) => {
        const r = await c.sh.exec([...argv], "");
        c.o(r.out);
        c.e(r.err);
        return r.code;
      };
      let code = 0;
      if (f.I) {
        for (const it of c.stdin.split("\n").filter(Boolean)) code = await runOne(cmd.map((a) => a.replaceAll(f.I, it))) || code;
      } else {
        const n = parseInt(f.n) || items.length || 1;
        for (let i = 0; i < Math.max(items.length, 1); i += n) code = await runOne([...cmd, ...items.slice(i, i + n)]) || code;
      }
      return code;
    }
  };
  const APPLETS = {
    echo(c) {
      let a = c.argv, nl = true, esc_ = false;
      while (a.length && /^-[neE]+$/.test(a[0])) {
        if (a[0].includes("n")) nl = false;
        if (a[0].includes("e")) esc_ = true;
        a = a.slice(1);
      }
      let s = a.join(" ");
      if (esc_) s = s.replace(/\\(n|t|\\|e|r)/g, (m, x) => ({ n: "\n", t: "	", "\\": "\\", e: "\x1B", r: "\r" })[x]);
      c.o(s + (nl ? "\n" : ""));
      return 0;
    },
    printf(c) {
      const [fmt = "", ...args] = c.argv;
      let i = 0;
      const s = fmt.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/%(-?\d*)([sdif%])/g, (m, w, t) => {
        if (t === "%") return "%";
        let v = args[i++] ?? "";
        if (t === "d" || t === "i") v = String(parseInt(v) || 0);
        else if (t === "f") v = String(parseFloat(v) || 0);
        const n = parseInt(w);
        return isNaN(n) ? v : n < 0 ? v.padEnd(-n) : v.padStart(n);
      });
      c.o(s);
      return 0;
    },
    cat(c) {
      const { f, rest } = opts(c.argv);
      let n = 1;
      for (const x of inputs(c, rest)) {
        if (f.n) c.o(splitLines(x.text).map((l) => `${String(n++).padStart(6)}	${l}`).join("\n") + "\n");
        else c.o(x.text);
      }
      return c.errS ? 1 : 0;
    },
    ls(c) {
      const { f, rest } = opts(c.argv);
      const targets = rest.length ? rest : ["."];
      let code = 0;
      const multi = targets.length > 1 || f.R;
      const line = (p, name) => {
        const st = vfs.stat(p);
        return f.l ? `${st.dir ? "drwxr-xr-x" : "-rw-r--r--"} 1 agent agent ${(f.h ? fmtSize(st.size) : String(st.size)).padStart(7)} ${fmtDate(st.mtime)} ${name}${st.dir && f.F !== false ? "/" : ""}` : name + (st.dir ? "/" : "");
      };
      const doDir = (p, label) => {
        let names = vfs.list(p);
        if (!f.a && !f.A) names = names.filter((n) => !n.startsWith("."));
        if (f.t) names.sort((a, b) => vfs.stat(vfs.norm(b, p)).mtime - vfs.stat(vfs.norm(a, p)).mtime);
        if (f.r) names.reverse();
        if (multi) c.o(`${label}:
`);
        if (f.l) c.o(`total ${names.length}
`);
        for (const n of names) c.o(line(vfs.norm(n, p), n) + "\n");
        if (f.R) for (const n of names) {
          const q = vfs.norm(n, p);
          if (vfs.isDir(q)) {
            c.o("\n");
            doDir(q, label === "." ? "./" + n : label.replace(/\/$/, "") + "/" + n);
          }
        }
      };
      for (const t of targets) {
        const p = c.P(t);
        if (!vfs.exists(p)) {
          c.e(`ls: ${t}: No such file or directory
`);
          code = 1;
          continue;
        }
        if (vfs.isDir(p) && !f.d) doDir(p, t);
        else c.o(line(p, t) + "\n");
        if (multi && !f.R) c.o("\n");
      }
      return code;
    },
    mkdir(c) {
      const { f, rest } = opts(c.argv);
      for (const d of rest) f.p ? vfs.mkdirp(c.P(d)) : vfs.mkdir(c.P(d));
      return 0;
    },
    rmdir(c) {
      for (const d of c.argv) vfs.rm(c.P(d), false);
      return 0;
    },
    rm(c) {
      const { f, rest } = opts(c.argv);
      let code = 0;
      for (const x of rest) {
        const p = c.P(x);
        if (!vfs.exists(p)) {
          if (!f.f) {
            c.e(`rm: ${x}: No such file or directory
`);
            code = 1;
          }
          continue;
        }
        if (vfs.isDir(p) && !(f.r || f.R)) {
          c.e(`rm: ${x}: is a directory
`);
          code = 1;
          continue;
        }
        vfs.rm(p, true);
      }
      return code;
    },
    touch(c) {
      for (const x of opts(c.argv).rest) {
        const p = c.P(x);
        if (vfs.isFile(p)) vfs.touch(p);
        else vfs.write(p, "", { mkdirs: false });
      }
      return 0;
    },
    mv(c) {
      const { rest } = opts(c.argv);
      const dst = c.P(rest.pop());
      if (rest.length > 1 && !vfs.isDir(dst)) throw new Error(`target '${dst}' is not a directory`);
      for (const s of rest) vfs.move(c.P(s), dst);
      return 0;
    },
    cp(c) {
      const { f, rest } = opts(c.argv);
      const dst = c.P(rest.pop());
      for (const s of rest) vfs.copy(c.P(s), dst, f.r || f.R || f.a);
      return 0;
    },
    head(c) {
      const { f, rest } = opts(c.argv, "n:c:");
      for (const x of inputs(c, rest)) {
        if (f.c) c.o(x.text.slice(0, +f.c));
        else {
          const n = +(f.n ?? 10);
          const L = splitLines(x.text);
          c.o((n < 0 ? L.slice(0, n) : L.slice(0, n)).map((l) => l + "\n").join(""));
        }
      }
      return 0;
    },
    tail(c) {
      const { f, rest } = opts(c.argv, "n:c:");
      for (const x of inputs(c, rest)) {
        if (f.c) c.o(x.text.slice(-f.c));
        else {
          const L = splitLines(x.text);
          const s = String(f.n ?? 10);
          c.o((s.startsWith("+") ? L.slice(+s.slice(1) - 1) : L.slice(-Math.abs(+s) || L.length)).map((l) => l + "\n").join(""));
        }
      }
      return 0;
    },
    wc(c) {
      const { f, rest } = opts(c.argv);
      const all = !f.l && !f.w && !f.c && !f.m;
      let T = [0, 0, 0];
      const ins = inputs(c, rest);
      const row = (a, n) => [f.l || all ? a[0] : null, f.w || all ? a[1] : null, f.c || f.m || all ? a[2] : null].filter((v) => v != null).map((v) => String(v).padStart(7)).join(" ") + (n !== "-" ? " " + n : "") + "\n";
      for (const x of ins) {
        const a = [(x.text.match(/\n/g) || []).length, (x.text.match(/\S+/g) || []).length, enc.encode(x.text).length];
        T = T.map((v, i) => v + a[i]);
        c.o(row(a, x.name));
      }
      if (ins.length > 1) c.o(row(T, "total"));
      return 0;
    },
    grep(c) {
      const { f, rest } = opts(c.argv, "e:m:A:B:C:");
      let pat = f.e ?? rest.shift();
      if (pat == null) {
        c.e("usage: grep [-inrvlcEFwoq] PATTERN [FILE...]\n");
        return 2;
      }
      let src = f.F ? pat.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : f.E || f.P ? pat : breToJs(pat);
      if (f.w) src = `\\b(?:${src})\\b`;
      if (f.x) src = `^(?:${src})$`;
      const re = new RegExp(src, f.i ? "i" : "");
      const reG = new RegExp(src, f.i ? "gi" : "g");
      let files = rest;
      const rec = f.r || f.R;
      if (rec && !files.length) files = ["."];
      let list = [];
      for (const fn of files) {
        const p = c.P(fn);
        if (vfs.isDir(p)) {
          if (!rec) {
            c.e(`grep: ${fn}: Is a directory
`);
            continue;
          }
          for (const q of vfs.walk(p)) if (vfs.isFile(q) && !/\/(node_modules|\.git)\//.test(q)) list.push({ name: fn === "." ? q.slice(c.sh.cwd === "/" ? 1 : c.sh.cwd.length + 1) : fn.replace(/\/$/, "") + q.slice(p.length), p: q });
        } else list.push({ name: fn, p });
      }
      const ins = files.length ? list.map((x) => {
        try {
          return { name: x.name, text: vfs.read(x.p) };
        } catch (e) {
          c.e(`grep: ${e.message}
`);
          return null;
        }
      }).filter(Boolean) : [{ name: "-", text: c.stdin }];
      const showName = (ins.length > 1 || rec) && !f.h;
      let any = false;
      const max = f.m ? +f.m : Infinity;
      for (const x of ins) {
        let cnt = 0;
        const L = splitLines(x.text);
        for (let i = 0; i < L.length && cnt < max; i++) {
          const hit = re.test(L[i]) !== !!f.v;
          if (!hit) continue;
          cnt++;
          any = true;
          if (f.q) return 0;
          if (f.l || f.c) continue;
          const pre = (showName ? x.name + ":" : "") + (f.n ? i + 1 + ":" : "");
          if (f.o) {
            for (const m of L[i].matchAll(reG)) c.o(pre + m[0] + "\n");
          } else c.o(pre + L[i] + "\n");
        }
        if (f.l && cnt) c.o(x.name + "\n");
        if (f.c) c.o((showName ? x.name + ":" : "") + cnt + "\n");
      }
      return any ? 0 : 1;
    },
    find(c) {
      const a = [...c.argv];
      const paths = [];
      while (a.length && !a[0].startsWith("-") && a[0] !== "(" && a[0] !== "!") paths.push(a.shift());
      if (!paths.length) paths.push(".");
      const tests = [];
      let maxd = Infinity, mind = 0, neg = false;
      while (a.length) {
        const t = a.shift();
        if (t === "!" || t === "-not") {
          neg = true;
          continue;
        }
        const push = (fn) => {
          const n = neg;
          tests.push(n ? (p, b) => !fn(p, b) : fn);
          neg = false;
        };
        if (t === "-name") {
          const r = globToRe(a.shift());
          push((p, b) => r.test(b));
        } else if (t === "-iname") {
          const r = new RegExp(globToRe(a.shift()).source, "i");
          push((p, b) => r.test(b));
        } else if (t === "-path" || t === "-wholename") {
          const g = a.shift();
          const r = new RegExp(globToRe(g).source.replace(/\[\^\/\]\*/g, ".*"));
          push((p, b, disp) => r.test(disp));
        } else if (t === "-type") {
          const ty = a.shift();
          push((p) => ty === "d" ? vfs.isDir(p) : vfs.isFile(p));
        } else if (t === "-maxdepth") maxd = +a.shift();
        else if (t === "-mindepth") mind = +a.shift();
        else if (t === "-size") {
          const s = a.shift();
          const m = /^([+-]?)(\d+)([ckM]?)$/.exec(s);
          const mul = { c: 1, k: 1024, M: 1048576, "": 512 }[m[3]];
          const n = +m[2] * mul;
          push((p) => {
            if (!vfs.isFile(p)) return false;
            const z = vfs.stat(p).size;
            return m[1] === "+" ? z > n : m[1] === "-" ? z < n : z === n;
          });
        } else if (t === "-empty") push((p) => vfs.isDir(p) ? vfs.list(p).length === 0 : vfs.stat(p).size === 0);
        else if (t === "-print" || t === "-o" || t === "-a") {
        } else {
          c.e(`find: unsupported option ${t} 
`);
          return 1;
        }
      }
      for (const root of paths) {
        const p0 = c.P(root);
        if (!vfs.exists(p0)) {
          c.e(`find: ${root}: No such file or directory
`);
          continue;
        }
        for (const p of vfs.walk(p0)) {
          const rel = p === p0 ? "" : p.slice(p0 === "/" ? 1 : p0.length + 1);
          const depth = rel ? rel.split("/").length : 0;
          if (depth > maxd || depth < mind) continue;
          if (/\/(node_modules|\.git)(\/|$)/.test(rel) && !root.includes("node_modules")) continue;
          const disp = rel ? root === "/" ? "/" + rel : root.replace(/\/$/, "") + "/" + rel : root;
          if (tests.every((fn) => fn(p, vfs.base(p), disp))) c.o(disp + "\n");
        }
      }
      return 0;
    },
    tree(c) {
      const { f, rest } = opts(c.argv, "L:");
      const root = c.P(rest[0] || ".");
      let nd = 0, nf = 0;
      const max = f.L ? +f.L : Infinity;
      c.o((rest[0] || ".") + "\n");
      const rec = (p, pre, d) => {
        if (d > max) return;
        const names = vfs.list(p).filter((n) => f.a || !n.startsWith("."));
        names.forEach((n, i) => {
          const q = vfs.norm(n, p);
          const lastOne = i === names.length - 1;
          const dir = vfs.isDir(q);
          dir ? nd++ : nf++;
          c.o(pre + (lastOne ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ") + n + (dir ? "/" : "") + "\n");
          if (dir) rec(q, pre + (lastOne ? "    " : "\u2502   "), d + 1);
        });
      };
      rec(root, "", 1);
      c.o(`
${nd} directories, ${nf} files
`);
      return 0;
    },
    sort(c) {
      const { f, rest } = opts(c.argv, "k:t:");
      let L = inputs(c, rest).flatMap((x) => splitLines(x.text));
      const key = (l) => {
        if (!f.k) return l;
        const fs = f.t ? l.split(f.t) : l.trim().split(/\s+/);
        return fs.slice(parseInt(f.k) - 1).join(" ");
      };
      L.sort((a, b) => f.n ? (parseFloat(key(a)) || 0) - (parseFloat(key(b)) || 0) : f.f ? key(a).toLowerCase().localeCompare(key(b).toLowerCase()) : key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
      if (f.r) L.reverse();
      if (f.u) L = L.filter((l, i) => i === 0 || l !== L[i - 1]);
      c.o(L.map((l) => l + "\n").join(""));
      return 0;
    },
    uniq(c) {
      const { f, rest } = opts(c.argv);
      const L = inputs(c, rest).flatMap((x) => splitLines(x.text));
      const g = [];
      for (const l of L) {
        if (g.length && g[g.length - 1][0] === l) g[g.length - 1][1]++;
        else g.push([l, 1]);
      }
      for (const [l, n] of g) {
        if (f.d && n < 2) continue;
        if (f.u && n > 1) continue;
        c.o((f.c ? String(n).padStart(7) + " " : "") + l + "\n");
      }
      return 0;
    },
    cut(c) {
      const { f, rest } = opts(c.argv, "d:f:c:");
      const rng = (s) => s.split(",").flatMap((r) => {
        const [a, b] = r.split("-");
        const lo = a ? +a : 1, hi = r.includes("-") ? b ? +b : 1e9 : lo;
        const o = [];
        for (let i = lo; i <= Math.min(hi, 1e3); i++) o.push(i);
        return o;
      });
      for (const l of inputs(c, rest).flatMap((x) => splitLines(x.text))) {
        if (f.c) {
          const ix = rng(f.c);
          c.o(ix.map((i) => l[i - 1] ?? "").join("") + "\n");
        } else {
          const d = f.d ?? "	";
          const parts = l.split(d);
          if (parts.length === 1 && !l.includes(d)) {
            c.o(l + "\n");
            continue;
          }
          c.o(rng(f.f || "1").filter((i) => i <= parts.length).map((i) => parts[i - 1]).join(d) + "\n");
        }
      }
      return 0;
    },
    tr(c) {
      const { f, rest } = opts(c.argv);
      const exp = (s) => {
        s = s.replace(/\[:upper:\]/g, "A-Z").replace(/\[:lower:\]/g, "a-z").replace(/\[:digit:\]/g, "0-9").replace(/\[:space:\]/g, " 	\n").replace(/\\n/g, "\n").replace(/\\t/g, "	");
        let o = "";
        for (let i = 0; i < s.length; i++) {
          if (s[i + 1] === "-" && s[i + 2]) {
            for (let k = s.charCodeAt(i); k <= s.charCodeAt(i + 2); k++) o += String.fromCharCode(k);
            i += 2;
          } else o += s[i];
        }
        return o;
      };
      const a = exp(rest[0] || ""), b = exp(rest[1] || "");
      let out = "";
      for (const ch of c.stdin) {
        const i = a.indexOf(ch);
        if (f.d) {
          if (i < 0) out += ch;
        } else if (i >= 0 && b) out += b[Math.min(i, b.length - 1)];
        else out += ch;
      }
      if (f.s) out = out.replace(new RegExp(`([${(b || a).replace(/[\]\\^-]/g, "\\$&")}])\\1+`, "g"), "$1");
      c.o(out);
      return 0;
    },
    sed(c) {
      const scripts2 = [];
      const files = [];
      let n = false, inplace = false, ere = false;
      const a = c.argv;
      for (let i2 = 0; i2 < a.length; i2++) {
        const x = a[i2];
        if (x === "-n") n = true;
        else if (x === "-i" || x.startsWith("-i")) inplace = true;
        else if (x === "-E" || x === "-r") ere = true;
        else if (x === "-e") scripts2.push(a[++i2]);
        else if (x.startsWith("-") && x.length > 1 && /^-[nEr]+$/.test(x)) {
          if (x.includes("n")) n = true;
          if (/[Er]/.test(x)) ere = true;
        } else if (!scripts2.length && !files.length && !a.slice(0, i2).includes("-e")) scripts2.push(x);
        else files.push(x);
      }
      const toRe = (p, fl = "") => new RegExp(ere ? p : breToJs(p), fl);
      const cmds = [];
      const src = scripts2.join("\n");
      let i = 0;
      const readDelim = (d) => {
        let o = "";
        while (i < src.length && src[i] !== d) {
          if (src[i] === "\\" && src[i + 1] === d) {
            o += d;
            i += 2;
            continue;
          }
          if (src[i] === "\\" && src[i + 1] === "n" && d !== "n") {
            o += "\\n";
            i += 2;
            continue;
          }
          o += src[i++];
        }
        i++;
        return o;
      };
      const readAddr = () => {
        if (src[i] === "/") {
          i++;
          return { re: toRe(readDelim("/")) };
        }
        if (src[i] === "$") {
          i++;
          return { last: true };
        }
        const m = /^\d+/.exec(src.slice(i));
        if (m) {
          i += m[0].length;
          return { n: +m[0] };
        }
        return null;
      };
      while (i < src.length) {
        while (/[\s;]/.test(src[i] || "")) i++;
        if (i >= src.length) break;
        const a1 = readAddr();
        let a2 = null;
        if (a1 && src[i] === ",") {
          i++;
          a2 = readAddr();
        }
        while (src[i] === " ") i++;
        let bang = false;
        if (src[i] === "!") {
          bang = true;
          i++;
        }
        const op = src[i++];
        const cmd = { a1, a2, bang, op, on: false };
        if (op === "s") {
          const d = src[i++];
          const re = readDelim(d);
          let rep = readDelim(d);
          let fl = "";
          while (/[gipI0-9]/.test(src[i] || "")) fl += src[i++];
          cmd.re = toRe(re, (fl.includes("g") ? "g" : "") + (/[iI]/.test(fl) ? "i" : ""));
          cmd.rep = rep.replace(/\$/g, "$$$$").replace(/\\(\d)/g, "$$$1").replace(/(^|[^\\])&/g, "$1$$&").replace(/\\&/g, "&").replace(/\\n/g, "\n");
          cmd.p = fl.includes("p");
        } else if (op === "a" || op === "i" || op === "c") {
          while (src[i] === " " || src[i] === "\\") i++;
          let t = "";
          while (i < src.length && src[i] !== "\n" && src[i] !== ";") t += src[i++];
          cmd.text = t;
        } else if (!"dpq=".includes(op)) {
          c.e(`sed: unsupported command '${op}' (BusyBox WASM sed supports it)
`);
          return 1;
        }
        cmds.push(cmd);
      }
      const run = (text) => {
        const L = splitLines(text);
        let out = "";
        for (let ln = 0; ln < L.length; ln++) {
          let line = L[ln];
          let del = false, quit = false;
          const isLast = ln === L.length - 1;
          let pre = "", post = "";
          for (const cm of cmds) {
            const m1 = (ad) => ad && (ad.n ? ad.n === ln + 1 : ad.last ? isLast : ad.re.test(line));
            let hit;
            if (!cm.a1) hit = true;
            else if (!cm.a2) hit = m1(cm.a1);
            else {
              if (!cm.on && m1(cm.a1)) {
                cm.on = true;
                hit = true;
                if (cm.a2.n && cm.a2.n <= ln + 1) cm.on = false;
              } else if (cm.on) {
                hit = true;
                if (m1(cm.a2)) cm.on = false;
              } else hit = false;
            }
            if (cm.bang) hit = !hit;
            if (!hit) continue;
            if (cm.op === "s") {
              cm.re.lastIndex = 0;
              const nl = line.replace(cm.re, cm.rep);
              if (nl !== line || cm.re.test(line)) {
                line = nl;
                if (cm.p) out += line + "\n";
              }
            } else if (cm.op === "d") {
              del = true;
              break;
            } else if (cm.op === "p") out += line + "\n";
            else if (cm.op === "q") {
              quit = true;
              break;
            } else if (cm.op === "=") out += ln + 1 + "\n";
            else if (cm.op === "a") post += cm.text + "\n";
            else if (cm.op === "i") pre += cm.text + "\n";
            else if (cm.op === "c") {
              line = cm.text;
            }
          }
          out += pre;
          if (!del && !n) out += line + "\n";
          out += post;
          if (quit) break;
        }
        return out;
      };
      if (inplace) {
        for (const fn of files) {
          const p = c.P(fn);
          vfs.write(p, run(vfs.read(p)));
        }
        return 0;
      }
      for (const x of inputs(c, files)) c.o(run(x.text));
      return 0;
    },
    awk(c) {
      const { f, rest } = opts(c.argv, "F:");
      const prog = rest.shift() || "";
      const m = /^\s*(?:\/(.*)\/)?\s*(?:\{\s*print\s*([^}]*)\})?\s*$/.exec(prog);
      if (!m) {
        c.e('awk: only "[/re/] { print ... }" is supported by the JS fallback; BusyBox WASM provides full awk\n');
        return 2;
      }
      const re = m[1] ? new RegExp(m[1]) : null;
      const exprs = (m[2] ?? "$0").split(",").map((s) => s.trim()).filter(Boolean);
      let NR = 0;
      for (const l of inputs(c, rest).flatMap((x) => splitLines(x.text))) {
        NR++;
        if (re && !re.test(l)) continue;
        const F = f.F ? l.split(f.F === "\\t" ? "	" : f.F) : l.trim().split(/\s+/);
        c.o((exprs.length ? exprs : ["$0"]).map((e) => e.split(/\s+/).map((t) => t === "$0" ? l : /^\$\d+$/.test(t) ? F[+t.slice(1) - 1] ?? "" : t === "NR" ? NR : t === "NF" ? F.length : t === "$NF" ? F[F.length - 1] : t.replace(/^"|"$/g, "")).join("")).join(" ") + "\n");
      }
      return 0;
    },
    tee(c) {
      const { f, rest } = opts(c.argv);
      for (const fn of rest) f.a ? vfs.append(c.P(fn), c.stdin) : vfs.write(c.P(fn), c.stdin);
      c.o(c.stdin);
      return 0;
    },
    seq(c) {
      const n = c.argv.map(Number);
      const [a, s, b] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n;
      for (let i = a; s > 0 ? i <= b : i >= b; i += s) c.o(i + "\n");
      return 0;
    },
    async sleep(c) {
      await sleep(Math.min(parseFloat(c.argv[0]) * 1e3 || 0, 3e4));
      return 0;
    },
    date(c) {
      const d = /* @__PURE__ */ new Date();
      c.o(c.argv[0] === "-I" || c.argv[0] === "--iso-8601" ? d.toISOString().slice(0, 10) + "\n" : c.argv[0] === "+%s" ? Math.floor(d / 1e3) + "\n" : d.toString() + "\n");
      return 0;
    },
    env(c) {
      for (const [k, v] of Object.entries(c.sh.env)) c.o(`${k}=${v}
`);
      return 0;
    },
    basename(c) {
      let b = vfs.base(vfs.norm(c.argv[0] || ""));
      if (c.argv[1] && b.endsWith(c.argv[1])) b = b.slice(0, -c.argv[1].length);
      c.o(b + "\n");
      return 0;
    },
    dirname(c) {
      const p = c.argv[0] || ".";
      const i = p.replace(/\/$/, "").lastIndexOf("/");
      c.o((i < 0 ? "." : i === 0 ? "/" : p.slice(0, i)) + "\n");
      return 0;
    },
    realpath(c) {
      for (const a of c.argv) c.o(c.P(a) + "\n");
      return 0;
    },
    stat(c) {
      for (const a of c.argv) {
        const s = vfs.stat(c.P(a));
        c.o(`  File: ${a}
  Size: ${s.size}	Type: ${s.dir ? "directory" : "regular file"}
Modify: ${new Date(s.mtime).toISOString()}
`);
      }
      return 0;
    },
    du(c) {
      const { f, rest } = opts(c.argv);
      for (const a of rest.length ? rest : ["."]) {
        let t = 0;
        for (const q of vfs.walk(c.P(a))) if (vfs.isFile(q)) t += vfs.stat(q).size;
        c.o(`${f.h ? fmtSize(t) : Math.ceil(t / 1024)}	${a}
`);
      }
      return 0;
    },
    base64(c) {
      const { f, rest } = opts(c.argv);
      const t = inputs(c, rest)[0]?.text ?? "";
      if (f.d) c.o(dec.decode(Uint8Array.from(atob(t.replace(/\s/g, "")), (ch) => ch.charCodeAt(0))));
      else {
        let b = "";
        for (const x of enc.encode(t)) b += String.fromCharCode(x);
        c.o(btoa(b).replace(/.{76}/g, "$&\n") + "\n");
      }
      return 0;
    },
    rev(c) {
      for (const l of inputs(c, c.argv).flatMap((x) => splitLines(x.text))) c.o([...l].reverse().join("") + "\n");
      return 0;
    },
    nl(c) {
      let n = 1;
      for (const l of inputs(c, c.argv).flatMap((x) => splitLines(x.text))) c.o(l.trim() ? `${String(n++).padStart(6)}	${l}
` : "\n");
      return 0;
    },
    test(c) {
      let a = [...c.argv];
      if (c.name === "[") {
        if (a.pop() !== "]") {
          c.e("[: missing ]\n");
          return 2;
        }
      }
      let neg = false;
      if (a[0] === "!") {
        neg = true;
        a.shift();
      }
      let r;
      const [x, y, z] = a;
      if (a.length === 0) r = false;
      else if (a.length === 1) r = x !== "";
      else if (a.length === 2) {
        const p = c.P(y);
        r = { "-f": vfs.isFile(p), "-d": vfs.isDir(p), "-e": vfs.exists(p), "-s": vfs.isFile(p) && vfs.stat(p).size > 0, "-z": y === "", "-n": y !== "", "-r": vfs.exists(p), "-w": vfs.exists(p), "-x": false }[x] ?? false;
      } else r = { "=": x === z, "==": x === z, "!=": x !== z, "-eq": +x === +z, "-ne": +x !== +z, "-lt": +x < +z, "-le": +x <= +z, "-gt": +x > +z, "-ge": +x >= +z }[y] ?? false;
      return (neg ? !r : r) ? 0 : 1;
    },
    get "["() {
      return this.test;
    },
    yes(c) {
      c.o(((c.argv[0] ?? "y") + "\n").repeat(100));
      return 0;
    },
    whoami(c) {
      c.o((c.sh.env.USER || "agent") + "\n");
      return 0;
    },
    uname(c) {
      c.o(c.argv.includes("-a") ? `JadeAgentKit browser 1.0 ${navigator.platform || "web"} wasm32
` : "JadeAgentKit\n");
      return 0;
    },
    async sha256sum(c) {
      for (const x of inputs(c, c.argv)) {
        const h = await crypto.subtle.digest("SHA-256", enc.encode(x.text));
        c.o([...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("") + "  " + x.name + "\n");
      }
      return 0;
    },
    diff(c) {
      const { f, rest } = opts(c.argv);
      if (rest.length < 2) {
        c.e("usage: diff [-u] FILE1 FILE2\n");
        return 2;
      }
      const A = splitLines(vfs.read(c.P(rest[0]))), B = splitLines(vfs.read(c.P(rest[1])));
      if (A.join("\n") === B.join("\n")) return 0;
      if (A.length * B.length > 4e6) {
        c.o(`Files ${rest[0]} and ${rest[1]} differ
`);
        return 1;
      }
      c.o(`--- ${rest[0]}
+++ ${rest[1]}
` + unifiedDiff(A, B));
      return 1;
    }
  };
  function unifiedDiff(A, B, ctx = 3) {
    const n = A.length, m = B.length;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i2 = n - 1; i2 >= 0; i2--) for (let j2 = m - 1; j2 >= 0; j2--) dp[i2][j2] = A[i2] === B[j2] ? dp[i2 + 1][j2 + 1] + 1 : Math.max(dp[i2 + 1][j2], dp[i2][j2 + 1]);
    const ops = [];
    let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) {
        ops.push([" ", A[i], i, j]);
        i++;
        j++;
      } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) {
        ops.push(["-", A[i], i, j]);
        i++;
      } else {
        ops.push(["+", B[j], i, j]);
        j++;
      }
    }
    let out = "";
    let k = 0;
    while (k < ops.length) {
      if (ops[k][0] === " ") {
        k++;
        continue;
      }
      let s = Math.max(0, k - ctx), e = k;
      while (e < ops.length) {
        if (ops[e][0] !== " ") {
          e++;
          continue;
        }
        let run = 0;
        while (e + run < ops.length && ops[e + run][0] === " ") run++;
        if (run > ctx * 2 || e + run >= ops.length) {
          e = Math.min(ops.length, e + ctx);
          break;
        }
        e += run;
      }
      const h = ops.slice(s, e);
      const a0 = h[0][2] + 1, b0 = h[0][3] + 1;
      out += `@@ -${a0},${h.filter((o) => o[0] !== "+").length} +${b0},${h.filter((o) => o[0] !== "-").length} @@
` + h.map((o) => o[0] + o[1] + "\n").join("");
      k = e;
    }
    return out;
  }
  return { Shell, BUILTINS, APPLETS, opts, inputs, splitLines, tokenize: tokenize2, parse, globToRe };
}

// src/shell.js
var ShellSession = class {
  /** @param {object} env from createShellEnv; @param {{ cwd?: string, env?: object, timeoutMs?: number }} opts */
  constructor(core, { cwd = "/", env = {}, timeoutMs = 6e4 } = {}, busybox = null, engine = () => "auto") {
    this.core = core;
    this.bb = busybox;
    this.engine = engine;
    this.sh = new core.Shell({ cwd, env });
    this.sh.timeoutMs = timeoutMs;
  }
  get cwd() {
    return this.sh.cwd;
  }
  set cwd(v) {
    this.sh.cwd = v;
  }
  get env() {
    return this.sh.env;
  }
  /**
   * Run a command line. Returns { stdout, stderr, code, output } (output is stdout and stderr interleaved).
   * @param {string} command @param {{ stdin?: string, timeoutMs?: number, onOutput?: (text: string, isErr: boolean) => void, signal?: AbortSignal }} [o]
   */
  async run(command, { stdin = "", timeoutMs, onOutput, signal } = {}) {
    if (this.bb && !this.bb.ready && this.engine() !== "js") await this.bb.load();
    const sh = this.sh;
    if (timeoutMs) sh.timeoutMs = timeoutMs;
    sh.onOutput = onOutput || null;
    sh.aborted = false;
    const ab = () => {
      sh.aborted = true;
    };
    signal?.addEventListener?.("abort", ab);
    try {
      const r = await sh.run(String(command ?? ""), { stdin });
      const stdout = r.chunks.filter((c) => !c.err).map((c) => c.s).join(""), stderr = r.chunks.filter((c) => c.err).map((c) => c.s).join("");
      return { stdout, stderr, code: r.code, output: r.chunks.map((c) => c.s).join("") };
    } finally {
      signal?.removeEventListener?.("abort", ab);
      sh.onOutput = null;
    }
  }
};
function createShell({ vfs, busybox, engine = "auto", commands = {} }) {
  const env = { vfs, busybox, engine, commands };
  const core = createShellEnv(env);
  return {
    core,
    commands,
    /** a shell with its own working directory and variables */
    session: (o) => new ShellSession(core, o, busybox, () => env.engine),
    /** 'auto' (BusyBox when loaded, else JS), 'wasm' (BusyBox only) or 'js' (JS applets only) */
    get engine() {
      return env.engine;
    },
    set engine(e) {
      env.engine = e;
    }
  };
}

// src/internal/node_prelude.js
var NODE_PRELUDE = `
const __out = []; let __files = {}; let __dirs = new Set(['/']); const __writes = {}; const __mk = new Set(); const __rmd = new Set(); let __cwd = '/';
const __norm = (p) => { p = String(p); if (p.startsWith('file://')) p = p.slice(7); const parts = (p.startsWith('/') ? p : __cwd + '/' + p).split('/'); const o = []; for (const s of parts) { if (!s || s === '.') continue; if (s === '..') o.pop(); else o.push(s); } return '/' + o.join('/'); };
const __fmt = (a) => a.map(x => typeof x === 'string' ? x : (() => { try { return x instanceof Error ? (x.stack || String(x)) : x === undefined ? 'undefined' : typeof x === 'function' ? '[Function]' : JSON.stringify(x, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : typeof v === 'bigint' ? String(v) : v, 2) ?? String(x); } catch { return String(x); } })()).join(' ');
const __log = (k) => (...a) => { __out.push([k, __fmt(a) + '\\n']); };
const console = { log: __log('o'), info: __log('o'), debug: __log('o'), dir: __log('o'), table: __log('o'), warn: __log('e'), error: __log('e'), time() {}, timeEnd() {}, group() {}, groupEnd() {} };
const __isFile = p => (p in __writes) ? __writes[p] !== null : (p in __files);
const __isDir = p => __dirs.has(p);
const __parent = p => p === '/' ? '/' : (p.slice(0, p.lastIndexOf('/')) || '/');
const __err = (code, op, p) => { const e = new Error(\`\${code}: \${{ ENOENT: 'no such file or directory', EISDIR: 'illegal operation on a directory', ENOTDIR: 'not a directory', EEXIST: 'file already exists', ENOTEMPTY: 'directory not empty' }[code] || code}, \${op} '\${p}'\`); e.code = code; e.syscall = op; e.path = p; return e; };
const __mkp = p => { const chain = []; while (p !== '/' && !__dirs.has(p)) { if (__isFile(p)) throw __err('ENOTDIR', 'mkdir', p); chain.push(p); p = __parent(p); } for (const d of chain) { __dirs.add(d); __mk.add(d); __rmd.delete(d); } };
const __kids = p => { const pre = p === '/' ? '/' : p + '/'; const s = new Set(); const add = k => { if (k.startsWith(pre) && k !== p) s.add(k.slice(pre.length).split('/')[0]); }; for (const k of Object.keys(__files)) if (__isFile(k)) add(k); for (const k of Object.keys(__writes)) if (__writes[k] !== null) add(k); for (const d of __dirs) add(d); return [...s].sort(); };
const __enc = (o) => typeof o === 'string' ? o : o && o.encoding;
class Dirent { constructor(name, dir) { this.name = name; this._d = dir; } isFile() { return !this._d; } isDirectory() { return this._d; } isSymbolicLink() { return false; } }
const fs = {
  readFileSync(p, o) { p = __norm(p); if (__isDir(p)) throw __err('EISDIR', 'read', p); if (!__isFile(p)) throw __err('ENOENT', 'open', p); const t = (p in __writes) ? __writes[p] : __files[p]; if (t instanceof Uint8Array && (o === 'utf8' || o === 'utf-8' || (o && o.encoding))) return new TextDecoder().decode(t); return t; },
  writeFileSync(p, d) { p = __norm(p); if (__isDir(p)) throw __err('EISDIR', 'open', p); __mkp(__parent(p)); __writes[p] = typeof d === 'string' ? d : d == null ? '' : (d instanceof Uint8Array ? new TextDecoder().decode(d) : String(d)); },
  appendFileSync(p, d) { let prev = ''; try { prev = fs.readFileSync(p); } catch (e) { if (e.code !== 'ENOENT') throw e; } fs.writeFileSync(p, prev + String(d)); },
  existsSync(p) { p = __norm(p); return __isFile(p) || __isDir(p); },
  accessSync(p) { if (!fs.existsSync(p)) throw __err('ENOENT', 'access', __norm(p)); },
  readdirSync(p, o) { p = __norm(p); if (__isFile(p)) throw __err('ENOTDIR', 'scandir', p); if (!__isDir(p)) throw __err('ENOENT', 'scandir', p); const names = __kids(p); if (o && o.recursive) { const out = []; const rec = (d, pre) => { for (const n of __kids(d)) { const q = d === '/' ? '/' + n : d + '/' + n; out.push(o.withFileTypes ? new Dirent(pre + n, __isDir(q)) : pre + n); if (__isDir(q)) rec(q, pre + n + '/'); } }; rec(p, ''); return out; } return o && o.withFileTypes ? names.map(n => new Dirent(n, __isDir(p === '/' ? '/' + n : p + '/' + n))) : names; },
  statSync(p, o) { p = __norm(p); const d = __isDir(p); if (!d && !__isFile(p)) { if (o && o.throwIfNoEntry === false) return undefined; throw __err('ENOENT', 'stat', p); } const size = d ? 4096 : (x => typeof x === 'string' ? new TextEncoder().encode(x).length : x.length)(fs.readFileSync(p)); const t = new Date(); return { size, isFile: () => !d, isDirectory: () => d, isSymbolicLink: () => false, mtime: t, ctime: t, birthtime: t, mtimeMs: +t }; },
  mkdirSync(p, o) { p = __norm(p); const rec = o === true || (o && o.recursive); if (__isDir(p)) { if (rec) return undefined; throw __err('EEXIST', 'mkdir', p); } if (__isFile(p)) throw __err('EEXIST', 'mkdir', p); if (!rec && !__isDir(__parent(p))) throw __err('ENOENT', 'mkdir', p); __mkp(p); return rec ? p : undefined; },
  unlinkSync(p) { p = __norm(p); if (__isDir(p)) throw __err('EISDIR', 'unlink', p); if (!__isFile(p)) throw __err('ENOENT', 'unlink', p); __writes[p] = null; },
  rmdirSync(p, o) { p = __norm(p); if (!__isDir(p)) throw __err(__isFile(p) ? 'ENOTDIR' : 'ENOENT', 'rmdir', p); if (__kids(p).length && !(o && o.recursive)) throw __err('ENOTEMPTY', 'rmdir', p); fs.rmSync(p, { recursive: true }); },
  rmSync(p, o = {}) { p = __norm(p); if (__isFile(p)) { __writes[p] = null; return; } if (!__isDir(p)) { if (o.force) return; throw __err('ENOENT', 'rm', p); } if (p === '/') throw new Error('refusing to remove /'); if (!o.recursive && __kids(p).length) throw __err('ENOTEMPTY', 'rm', p); const pre = p + '/'; for (const k of [...Object.keys(__files), ...Object.keys(__writes)]) if (k.startsWith(pre) && __isFile(k)) __writes[k] = null; for (const d of [...__dirs]) if (d === p || d.startsWith(pre)) { __dirs.delete(d); __mk.delete(d); } __rmd.add(p); },
  renameSync(a, b) { a = __norm(a); b = __norm(b); if (__isFile(a)) { const t = fs.readFileSync(a); fs.writeFileSync(b, t); __writes[a] = null; return; } if (!__isDir(a)) throw __err('ENOENT', 'rename', a); const pre = a + '/'; __mkp(b); for (const k of [...Object.keys(__files), ...Object.keys(__writes)]) if (k.startsWith(pre) && __isFile(k)) { fs.writeFileSync(b + k.slice(a.length), fs.readFileSync(k)); __writes[k] = null; } for (const d of [...__dirs]) if (d.startsWith(pre)) __mkp(b + d.slice(a.length)); fs.rmSync(a, { recursive: true }); },
  copyFileSync(a, b) { fs.writeFileSync(b, fs.readFileSync(a)); },
  cpSync(a, b, o) { a = __norm(a); if (__isFile(a)) return fs.copyFileSync(a, b); for (const n of fs.readdirSync(a, { recursive: true })) { const q = a + '/' + n; if (__isFile(q)) fs.writeFileSync(__norm(b) + '/' + n, fs.readFileSync(q)); } },
  lstatSync(p, o) { return fs.statSync(p, o); }, realpathSync(p) { return __norm(p); }, constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
};
fs.promises = {}; for (const k of ['readFile', 'writeFile', 'appendFile', 'readdir', 'stat', 'lstat', 'mkdir', 'unlink', 'rm', 'rmdir', 'rename', 'copyFile', 'access', 'cp', 'realpath']) {
  const sync = fs[k + 'Sync'];
  fs.promises[k] = async (...a) => sync(...a);
  fs[k] = (...a) => { const cb = typeof a[a.length - 1] === 'function' ? a.pop() : null; let r, e = null; try { r = sync(...a); } catch (x) { e = x; } if (cb) queueMicrotask(() => cb(e, r)); };
}
fs.exists = (p, cb) => queueMicrotask(() => cb(fs.existsSync(p)));
const path = {
  sep: '/', delimiter: ':',
  normalize: p => { const abs = String(p).startsWith('/'); const o = []; for (const s of String(p).split('/')) { if (!s || s === '.') continue; if (s === '..') { if (o.length && o[o.length - 1] !== '..') o.pop(); else if (!abs) o.push('..'); } else o.push(s); } return (abs ? '/' : '') + o.join('/') || (abs ? '/' : '.'); },
  join: (...a) => path.normalize(a.filter(x => x !== '').join('/')),
  resolve: (...a) => { let r = ''; for (const x of a) r = String(x).startsWith('/') ? x : (r ? r + '/' + x : x); return __norm(r || '.'); },
  isAbsolute: p => String(p).startsWith('/'),
  basename: (p, ext) => { let b = String(p).replace(/\\/+$/, '').split('/').pop(); return ext && b.endsWith(ext) && b !== ext ? b.slice(0, -ext.length) : b; },
  dirname: p => { p = String(p).replace(/\\/+$/, ''); const i = p.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i); },
  extname: p => { const b = path.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
  relative: (a, b) => { const A = __norm(a).split('/').filter(Boolean), B = __norm(b).split('/').filter(Boolean); let i = 0; while (i < A.length && A[i] === B[i]) i++; return [...A.slice(i).map(() => '..'), ...B.slice(i)].join('/'); },
  parse: p => { const base = path.basename(p), ext = path.extname(p); return { root: String(p).startsWith('/') ? '/' : '', dir: path.dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base }; },
  format: o => (o.dir ? o.dir + '/' : '') + (o.base || (o.name || '') + (o.ext || '')),
};
path.posix = path;
class __Exit { constructor(c) { this.code = c; } }
const process = { argv: [], env: { HOME: '/', USER: 'jade', PWD: '/' }, cwd: () => __cwd, chdir: d => { __cwd = __norm(d); }, exit: (c = 0) => { throw new __Exit(c); }, exitCode: 0, platform: 'linux', version: 'v20.0.0-browser', versions: { node: '20.0.0' }, stdout: { write: s => { __out.push(['o', String(s)]); return true; }, isTTY: false, columns: 80 }, stderr: { write: s => { __out.push(['e', String(s)]); return true; } }, nextTick: (f, ...a) => queueMicrotask(() => f(...a)), hrtime: Object.assign((t) => { const n = performance.now(); return [Math.floor(n / 1000), Math.round((n % 1000) * 1e6)]; }, { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }), memoryUsage: () => ({ heapUsed: 0 }), on() {} };
const __mods = {};

// ---- SQLite: require('node:sqlite') (DatabaseSync) and require('better-sqlite3'), on the embedded SQLite build ----
let __bins = {}, __sqMod = null, __sqApi = null; const __sqOpen = new Set();
function __sqliteApi() {
  if (__sqApi) return __sqApi;
  if (typeof __jvSqlite !== 'function' || !__sqMod) throw new Error('SQLite is not available in this script');
  return (__sqApi = __jvSqlite(__sqMod));
}
function __sqliteModule(flavor) {
  const S = __sqliteApi();
  const toObj = (cols, r) => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; };
  class StatementSync {
    constructor(db, sql) { this._db = db; this._st = db._d.prepare(sql); this.sourceSQL = sql; this.reader = this._st.columns().length > 0; this._raw = false; this._pluck = false; }
    _p(a) { if (a.length === 1 && a[0] && typeof a[0] === 'object' && !(a[0] instanceof Uint8Array)) return Array.isArray(a[0]) ? a[0] : a[0]; return a.length ? a : null; }
    _shape(cols, r) { return this._pluck ? r[0] : this._raw ? r : toObj(cols, r); }
    all(...a) { const cols = this._st.columns(); return this._st.rows(this._p(a)).map(r => this._shape(cols, r)); }
    get(...a) { const cols = this._st.columns(); for (const r of this._st.iterate(this._p(a))) { const v = this._shape(cols, r); this._st.bind(null); return v; } return undefined; }
    run(...a) { this._st.bind(this._p(a)); while (this._st.step()) {} return { changes: this._db._d.changes(), lastInsertRowid: this._db._d.lastInsertRowid() }; }
    *iterate(...a) { const cols = this._st.columns(); for (const r of this._st.iterate(this._p(a))) yield this._shape(cols, r); }
    columns() { return this._st.columns().map(name => ({ name, column: name })); }
    raw(on = true) { this._raw = on; return this; } pluck(on = true) { this._pluck = on; return this; }
    expandedSQL() { return this.sourceSQL; } finalize() { this._st.finalize(); }
  }
  class DatabaseSync {
    constructor(path = ':memory:', opts = {}) { this._path = !path || path === ':memory:' ? null : __norm(path); this._ro = !!(opts.readOnly || opts.readonly); this._d = null; if (opts.open !== false) this.open(); }
    open() {
      if (this._d) throw new Error('database is already open');
      let bytes = null;
      if (this._path) { if (this._path in __writes) { if (__writes[this._path] instanceof Uint8Array) bytes = __writes[this._path]; else if (__writes[this._path] && __writes[this._path].length) throw new Error(\`file is not a database: \${this._path}\`); } else if (__bins[this._path]) bytes = __bins[this._path]; else if (__isFile(this._path)) { const t = fs.readFileSync(this._path); if (t.length) throw new Error(\`file is not a database: \${this._path}\`); } else if (this._ro) throw new Error(\`unable to open database file: \${this._path}\`); }
      this._d = new S.Database(bytes); __sqOpen.add(this);
    }
    get isOpen() { return !!this._d; } get open_() { return !!this._d; } get name() { return this._path || ':memory:'; } get inTransaction() { return !!this._d && this._d.inTransaction(); }
    exec(sql) { if (this._ro && !/^\\s*(select|pragma|with|explain)\\b/i.test(sql)) throw new Error('attempt to write a readonly database'); this._d.exec(sql); return this; }
    prepare(sql) { return new StatementSync(this, sql); }
    pragma(s, o = {}) { const r = this._d.exec('PRAGMA ' + s)[0]; if (!r) return []; const rows = r.values.map(v => toObj(r.columns, v)); return o.simple ? (r.values[0] ? r.values[0][0] : undefined) : rows; }
    transaction(fn) { const self = this; return function (...a) { self._d.exec('BEGIN'); try { const r = fn.apply(this, a); self._d.exec('COMMIT'); return r; } catch (e) { try { self._d.exec('ROLLBACK'); } catch {} throw e; } }; }
    _flush() { if (this._path && this._d && this._d.dirty && !this._ro) { const b = this._d.export(); __writes[this._path] = b; __bins[this._path] = b; __mkp(__parent(this._path)); this._d.dirty = false; } }
    close() { if (this._d) { this._flush(); this._d.close(); this._d = null; __sqOpen.delete(this); } return this; }
  }
  if (flavor === 'better-sqlite3') { function Database(path, opts) { return new DatabaseSync(path, opts); } Database.prototype = DatabaseSync.prototype; return Database; }
  return { DatabaseSync, StatementSync, constants: {} };
}

// ---- network: global fetch (tracked so the script waits for it), Buffer, and http/https on top of fetch ----
let __inflight = 0; const __fetch0 = self.fetch ? self.fetch.bind(self) : null;
const __track = p => { __inflight++; p.then(() => { __inflight--; }, () => { __inflight--; }); return p; };
if (__fetch0) { self.fetch = (...a) => __track(__fetch0(...a)); for (const k of ['text', 'json', 'arrayBuffer', 'blob', 'formData']) { const f = Response.prototype[k]; if (f) Response.prototype[k] = function () { return __track(f.call(this)); }; } }
class Buffer extends Uint8Array {
  static from(x, enc) {
    if (typeof x === 'string') { if (enc === 'base64') return new Buffer(Uint8Array.from(atob(x.replace(/[^A-Za-z0-9+/=]/g, '')), c => c.charCodeAt(0))); if (enc === 'hex') return new Buffer((x.match(/../g) || []).map(h => parseInt(h, 16))); return new Buffer(new TextEncoder().encode(x)); }
    if (x instanceof ArrayBuffer) return new Buffer(new Uint8Array(x)); return new Buffer(Uint8Array.from(x || []));
  }
  static alloc(n, fill = 0) { const b = new Buffer(n); b.fill(fill); return b; }
  static concat(list) { const n = list.reduce((a, b) => a + b.length, 0); const out = new Buffer(n); let o = 0; for (const b of list) { out.set(b, o); o += b.length; } return out; }
  static isBuffer(x) { return x instanceof Uint8Array; }
  static byteLength(s) { return typeof s === 'string' ? new TextEncoder().encode(s).length : s.length; }
  toString(enc) { if (enc === 'base64') { let s = ''; for (let i = 0; i < this.length; i += 0x8000) s += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000)); return btoa(s); } if (enc === 'hex') return [...this].map(b => b.toString(16).padStart(2, '0')).join(''); return new TextDecoder().decode(this); }
  toJSON() { return { type: 'Buffer', data: [...this] }; }
}
const __mkHttp = (proto) => {
  function request(url, opts, cb) {
    if (url && typeof url === 'object' && !(url instanceof URL)) { cb = opts; opts = url; url = null; }
    if (typeof opts === 'function') { cb = opts; opts = {}; } opts = opts || {};
    const u = url ? new URL(String(url)) : new URL(\`\${opts.protocol || proto}//\${opts.hostname || opts.host || 'localhost'}\${opts.port ? ':' + opts.port : ''}\${opts.path || '/'}\`);
    const L = {}, chunks = []; const emit = (ev, ...a) => (L[ev] || []).forEach(f => f(...a));
    const req = {
      on(ev, f) { (L[ev] ||= []).push(f); return req; }, once(ev, f) { return req.on(ev, f); },
      write(d) { chunks.push(typeof d === 'string' ? new TextEncoder().encode(d) : d); return true; },
      setHeader(k, v) { (opts.headers ||= {})[k] = v; }, getHeader(k) { return (opts.headers || {})[k]; },
      setTimeout(ms, f) { req._to = ms; if (f) req.on('timeout', f); return req; },
      destroy(e) { try { req._ab && req._ab.abort(); } catch (x) {} if (e) emit('error', e); }, abort() { req.destroy(); },
      end(d) {
        if (d) req.write(d); if (cb) req.on('response', cb);
        const ab = new AbortController(); req._ab = ab; const to = req._to || opts.timeout;
        const timer = to ? self.setTimeout(() => { emit('timeout'); ab.abort(); }, to) : null;
        self.fetch(u.toString(), { method: String(opts.method || 'GET').toUpperCase(), headers: opts.headers || {}, body: chunks.length ? new Blob(chunks) : undefined, signal: ab.signal })
          .then(async r => {
            const buf = Buffer.from(await r.arrayBuffer()); if (timer) self.clearTimeout(timer);
            const RL = {}; const headers = {}; r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
            const res = { statusCode: r.status, statusMessage: r.statusText, headers, _enc: null,
              on(ev, f) { (RL[ev] ||= []).push(f); return res; }, once(ev, f) { return res.on(ev, f); }, setEncoding(e) { res._enc = e; return res; }, resume() { return res; },
              pipe(dst) { res.on('data', c => dst.write(c)); res.on('end', () => dst.end && dst.end()); return dst; } };
            emit('response', res);
            self.setTimeout(() => { if (buf.length) (RL.data || []).forEach(f => f(res._enc ? buf.toString() : buf)); (RL.end || []).forEach(f => f()); (RL.close || []).forEach(f => f()); }, 0);
          }, e => { if (timer) self.clearTimeout(timer); emit('error', e); });
        return req;
      },
    };
    return req;
  }
  return { request, get: (u, o, c) => { const r = request(u, o, c); r.end(); return r; }, Agent: function Agent() {}, globalAgent: {}, METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], STATUS_CODES: { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 500: 'Internal Server Error' } };
};
const __core = (m) => { m = String(m).replace(/^node:/, ''); if (/^@tensorflow\\/tfjs(-core|-layers|-backend-cpu|-backend-webgl)?$/.test(m)) { if (self.tf) return self.tf; throw new Error("TensorFlow.js was not loaded for this script"); } if (m === 'fs') return fs; if (m === 'https') return __mkHttp('https:'); if (m === 'http') return __mkHttp('http:'); if (m === 'buffer') return { Buffer }; if (m === 'fs/promises') return fs.promises; if (m === 'path' || m === 'path/posix') return path; if (m === 'util') return { inspect: x => __fmt([x]), format: (...a) => __fmt(a), promisify: f => (...a) => new Promise((res, rej) => f(...a, (e, r) => e ? rej(e) : res(r))) }; if (m === 'os') return { EOL: '\\n', platform: () => 'linux', homedir: () => '/', tmpdir: () => '/tmp', cpus: () => [{}], hostname: () => 'jade' }; if (m === 'readline') return { createInterface: () => ({ on() {}, question(q, cb) { cb(''); }, close() {} }) }; if (m === 'sqlite') return __sqliteModule('node'); if (m === 'better-sqlite3') return __sqliteModule('better-sqlite3'); if (m === 'sqlite3') throw new Error("the callback-based 'sqlite3' npm package is not available; use require('node:sqlite') (DatabaseSync) or require('better-sqlite3'), both synchronous"); if (m === 'child_process') throw new Error("child_process is not available in the browser sandbox; use the bash tool for shell commands"); return null; };
const __mkRequire = (dir) => (m) => {
  const c = __core(m); if (c) return c;
  m = String(m);
  if (!/^(\\.{1,2}\\/|\\/)/.test(m)) throw new Error("Cannot find module '" + m + "' (browser sandbox: fs, path, util, os and local files like ./lib.js; no npm packages)");
  const base = __norm(m.startsWith('/') ? m : dir + '/' + m);
  const cand = [base, base + '.js', base + '.cjs', base + '.json', base + '/index.js'].find(p => __isFile(p));
  if (!cand) throw new Error("Cannot find module '" + m + "' (looked for " + base + "[.js|.json|/index.js])");
  if (__mods[cand]) return __mods[cand].exports;
  if (cand.endsWith('.json')) return (__mods[cand] = { exports: JSON.parse(fs.readFileSync(cand)) }).exports;
  const mod = __mods[cand] = { exports: {} };
  let src = fs.readFileSync(cand).replace(/^#!.*\\n/, '');
  src = src.replace(/^\\s*import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");').replace(/^\\s*import\\s+(\\w+)\\s+from\\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");').replace(/^\\s*import\\s+\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"];?/gm, (s, a, b) => 'const {' + a.replace(/\\s+as\\s+/g, ': ') + '} = require("' + b + '");').replace(/^\\s*export\\s+default\\s+/gm, 'module.exports = ').replace(/^\\s*export\\s+(?=(const|let|var|function|class|async)\\b)/gm, '');
  new Function('module', 'exports', 'require', '__filename', '__dirname', 'console', 'process', src)(mod, mod.exports, __mkRequire(__parent(cand)), cand, __parent(cand), console, process);
  return mod.exports;
};
// ---- jade: call Jade's tools, decisions, model, shell and flows from a script ----
// Each call goes to the app over postMessage. Files the script wrote are handed over first, and files the
// call changed come back, so fs and Jade's tools see the same vault.
let __globals = {}; let __jseq = 0; const __jpend = new Map(); let __jbridge = true; let __jwhy = '';
function __takeSync() {
  const w = {}; let n = 0;
  for (const p of Object.keys(__writes)) { const d = __writes[p]; w[p] = d; n++; if (d === null) delete __files[p]; else __files[p] = d; delete __writes[p]; }
  const mk = [...__mk], rm = [...__rmd]; __mk.clear(); __rmd.clear();
  return n || mk.length || rm.length ? { writes: w, mkdirs: mk, rmdirs: rm } : null;
}
function __applySync(s) {
  if (!s) return;
  for (const p of s.deleted || []) { delete __files[p]; delete __writes[p]; }
  for (const d of s.rmdirs || []) __dirs.delete(d);
  for (const d of s.dirs || []) __dirs.add(d);
  for (const [p, d] of Object.entries(s.files || {})) { __files[p] = d; delete __writes[p]; let q = __parent(p); while (q !== '/' && !__dirs.has(q)) { __dirs.add(q); q = __parent(q); } }
}
const __jcall = (op, a) => {
  if (!__jbridge) return Promise.reject(new Error(\`jade.\${op} is not available here\${__jwhy ? ': ' + __jwhy : ''}\`));
  let args; try { args = a == null ? {} : JSON.parse(JSON.stringify(a)); } catch (e) { return Promise.reject(new Error(\`jade.\${op}: arguments must be plain JSON data (\${e.message})\`)); }
  return new Promise((res, rej) => { const id = ++__jseq; __inflight++; __jpend.set(id, { res, rej }); self.postMessage({ t: 'jade', id, op, a: args, sync: __takeSync() }); });
};
self.addEventListener('message', ev => {
  const m = ev.data; if (!m || m.t !== 'jret') return;
  const p = __jpend.get(m.id); if (!p) return; __jpend.delete(m.id); __inflight--;
  __applySync(m.sync); m.ok ? p.res(m.value) : p.rej(new Error(m.error));
});
const jade = Object.freeze({
  tool: (name, args) => __jcall('tool', { name: String(name), args: args || {} }),
  tools: new Proxy({}, { get: (_, n) => typeof n === 'string' && n !== 'then' && n !== 'toJSON' ? (args) => __jcall('tool', { name: n, args: args || {} }) : undefined }),
  list: () => __jcall('list', {}),
  decide: (o) => __jcall('decide', o || {}),
  ask: (prompt, o) => __jcall('ask', { ...(o || {}), prompt: String(prompt ?? '') }),
  agent: (message, o) => __jcall('agent', { ...(o || {}), message: String(message ?? '') }),
  flow: (name, input) => __jcall('flow', { name: String(name), input: input === undefined ? null : input }),
  flows: () => __jcall('flows', {}),
  shell: (command) => __jcall('shell', { command: String(command ?? '') }),
  notify: (title, body) => __jcall('notify', { title: String(title ?? ''), body: String(body ?? '') }),
  search: (query, limit) => __jcall('tool', { name: 'notes_search', args: { query: String(query ?? ''), ...(limit ? { limit } : {}) } }),
  kv: Object.freeze({ get: (k) => __jcall('kv', { op: 'get', k: String(k) }), set: (k, v) => __jcall('kv', { op: 'set', k: String(k), v: v === undefined ? null : v }), all: () => __jcall('kv', { op: 'all' }) }),
  prompt: (message, def) => __jcall('ui.prompt', { message: String(message ?? ''), def: def == null ? '' : String(def) }),
  suggest: (items, values, placeholder) => __jcall('ui.suggest', { items, values, placeholder }),
  sleep: (ms) => new Promise(r => setTimeout(r, Math.max(0, +ms || 0))),
});
let require = __mkRequire('/');
const module = { exports: {} }; const exports = module.exports; let __filename = '/[eval]', __dirname = '/';
let __pending = 0; const __st = self.setTimeout.bind(self), __ct = self.clearTimeout.bind(self); const __live = new Set();
self.setTimeout = (f, ms, ...a) => { const id = __st(() => { __live.delete(id); try { typeof f === 'function' && f(...a); } catch (e) { __out.push(['e', (e && e.stack || e) + '\\n']); } }, ms); __live.add(id); return id; };
self.clearTimeout = (id) => { __live.delete(id); __ct(id); };
let __code = 0;
let __ret;
self.onmessage = async (ev) => {
  if (ev.data && ev.data.t === 'jret') return;
  __globals = ev.data.globals || {}; __jbridge = ev.data.bridge !== false; __jwhy = ev.data.bridgeWhy || '';
  if (ev.data.noNet) { self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.EventSource = undefined; }
  __files = ev.data.files; __bins = ev.data.bins || {}; __sqMod = ev.data.sqliteModule || null; __dirs = new Set(ev.data.dirs); __cwd = ev.data.cwd; process.env.PWD = __cwd; Object.assign(process.env, ev.data.env || {}); process.argv = ['node', ...ev.data.argv];
  if (ev.data.argv[0] && ev.data.argv[0].startsWith('/')) { __filename = ev.data.argv[0]; __dirname = __parent(__filename); require = __mkRequire(__dirname); } else require = __mkRequire(__cwd);
  try { if (self.__tfInit) await self.__tfInit(); __ret = await __main(); await new Promise(r => __st(r, 5)); while (__live.size || __inflight) await new Promise(r => __st(r, 10)); for (const d of __sqOpen) d._flush(); } catch (err) { if (err instanceof __Exit) __code = err.code; else { __out.push(['e', (err && (err.code ? err.message : err.stack)) || String(err)]); __out.push(['e', '\\n']); __code = 1; } }
  if (!__code && process.exitCode) __code = process.exitCode;
  let ret; if (__ret !== undefined) { try { ret = JSON.parse(JSON.stringify(__ret)); } catch (e) { ret = String(__ret); } }
  self.postMessage({ out: __out, writes: __writes, mkdirs: [...__mk], rmdirs: [...__rmd], code: __code, ret });
};
self.addEventListener('unhandledrejection', e => { __out.push(['e', 'Unhandled promise rejection: ' + ((e.reason && e.reason.stack) || e.reason) + '\\n']); });
`;

// src/js.js
var TF_USE = /\btf\s*\.\s*[A-Za-z_$]|@tensorflow\/tfjs/;
var JsRunner = class {
  /** @param {{ vfs, sqlite?: import('./sqlite.js').Sqlite, ml?: import('./ml.js').ML, bridge?: (op: string, args: object) => Promise<any> }} o */
  constructor({ vfs, sqlite = null, ml = null, bridge = null }) {
    this.vfs = vfs;
    this.sqlite = sqlite;
    this.ml = ml;
    this.bridge = bridge;
  }
  _changesSince(before) {
    const files = {}, deleted = [], dirs = [], rmdirs = [];
    for (const [p, n] of this.vfs.nodes) {
      const b = before.get(p);
      if (n.dir) {
        if (b !== "d") dirs.push(p);
        continue;
      }
      if (b === n) continue;
      if (isSqliteBytes(n.data)) files[p] = n.data;
      else if (n.data.length < 2e6) files[p] = dec.decode(n.data);
    }
    for (const [p, b] of before) if (!this.vfs.nodes.has(p)) (b === "d" ? rmdirs : deleted).push(p);
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
  async run(code, { argv = ["[eval]"], cwd = "/", globals = null, timeoutMs = 6e4, readOnly = false, network = true, env = {}, signal = null } = {}) {
    const vfs = this.vfs;
    code = String(code ?? "").replace(/^#!.*\n/, "");
    if (/^\s*(import|export)\s/m.test(code)) code = code.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");').replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");').replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm, (s, a, b) => "const {" + a.replace(/\s+as\s+/g, ": ") + '} = require("' + b + '");').replace(/^\s*export\s+(default\s+)?/gm, "");
    const files = {}, dirs = [], bins = {};
    for (const [p, n] of vfs.nodes) {
      if (n.dir) dirs.push(p);
      else if (isSqliteBytes(n.data)) {
        bins[p] = n.data;
        files[p] = n.data;
      } else if (n.data.length < 2e6) files[p] = dec.decode(n.data);
    }
    const mentions = (re) => re.test(code) || [...vfs.nodes].some(([p, n]) => !n.dir && /\.[cm]?js$/.test(p) && n.data.length < 2e6 && re.test(dec.decode(n.data)));
    let sqMod = null, sqSrc = "", tfSrc = "";
    if (this.sqlite && mentions(/sqlite/i)) {
      try {
        sqMod = await this.sqlite.module();
        sqSrc = this.sqlite.glueSource;
      } catch (e) {
        return { stdout: "", stderr: `node: could not load SQLite (${e.message})
`, code: 1 };
      }
    }
    if (this.ml && network && mentions(TF_USE)) {
      try {
        tfSrc = await this.ml.tfjsSource();
      } catch (e) {
        return { stdout: "", stderr: `node: could not load TensorFlow.js (${e.message})
`, code: 1 };
      }
    }
    const names = globals ? Object.keys(globals).filter((k) => /^[$A-Za-z_][\w$]*$/.test(k)) : [];
    const head = names.length ? `const { ${names.join(", ")} } = __globals;
` : "";
    const src = NODE_PRELUDE + `
const kit = jade;

async function __main() {
${head}${code}
}
` + (sqSrc ? "\n" + sqSrc + "\n" : "") + (tfSrc ? `
(function () { var exports, module, define;
${tfSrc}
}).call(self);
self.__tfInit = async () => { const tf = self.tf; try { tf.env().set('IS_NODE', false); } catch (e) {} const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { let gl = false; try { gl = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(2, 2).getContext('webgl2'); } catch (e) {} for (const b of ['webgpu', 'webgl']) { if (b === 'webgpu' && !(self.navigator && self.navigator.gpu)) continue; if (b === 'webgl' && !gl) continue; try { if (tf.findBackendFactory(b) && await tf.setBackend(b)) { await tf.ready(); const v = await tf.tensor([1, 2]).add(1).data(); if (v[0] === 2) return; } } catch (e) {} } for (const b of ['webgpu', 'webgl']) { try { tf.removeBackend(b); } catch (e) {} } await tf.setBackend('cpu'); await tf.ready(); } finally { Object.assign(console, keep); } };
` : "");
    const off = NODE_PRELUDE.split("\n").length + 3 + (head ? 1 : 0);
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const bridge = this.bridge;
    const r = await new Promise((resolve) => {
      let w;
      try {
        w = new Worker(url, { name: "node" });
      } catch (e) {
        resolve({ out: [["e", `node: could not start a worker (${e.message})
`]], writes: {}, code: 1 });
        return;
      }
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        clearTimeout(t);
        signal?.removeEventListener?.("abort", ab);
        w.terminate();
        resolve(v);
      };
      const t = setTimeout(() => finish({ out: [["e", `node: killed after ${timeoutMs / 1e3}s timeout
`]], writes: {}, code: 124 }), timeoutMs);
      const ab = () => finish({ out: [["e", "node: stopped\n"]], writes: {}, code: 130 });
      signal?.addEventListener?.("abort", ab);
      w.onmessage = async (e) => {
        const m = e.data;
        if (m && m.t === "jade") {
          let reply;
          try {
            if (!bridge) throw new Error("kit calls are not available here");
            if (m.sync && !readOnly) this._apply(m.sync);
            const before = /* @__PURE__ */ new Map();
            for (const [p, n] of vfs.nodes) before.set(p, n.dir ? "d" : n);
            const value = await bridge(m.op, m.a || {});
            let v = value === void 0 ? null : value;
            try {
              v = JSON.parse(JSON.stringify(v));
            } catch {
              v = String(v);
            }
            reply = { t: "jret", id: m.id, ok: true, value: v, sync: readOnly ? null : this._changesSince(before) };
          } catch (err) {
            reply = { t: "jret", id: m.id, ok: false, error: String(err?.message || err) };
          }
          if (!done) w.postMessage(reply);
          return;
        }
        finish(m);
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        finish({ out: [["e", `${e.message || "SyntaxError"}${e.lineno ? ` (line ${Math.max(1, e.lineno - off)})` : ""}
`]], writes: {}, code: 1 });
      };
      w.postMessage({ files, dirs, bins, sqliteModule: sqMod, env, cwd, argv, globals: globals ? JSON.parse(JSON.stringify(globals)) : {}, bridge: !!bridge, bridgeWhy: bridge ? "" : "no host bridge", noNet: !network });
    });
    URL.revokeObjectURL(url);
    const errs = [];
    if (!readOnly) this._apply(r, (e) => errs.push(e.message + "\n"));
    const out = r.out || [];
    return { stdout: out.filter((x) => x[0] === "o").map((x) => x[1]).join(""), stderr: out.filter((x) => x[0] === "e").map((x) => x[1]).join("") + errs.join(""), output: out.map((x) => x[1]).join(""), code: r.code ?? 1, result: r.ret };
  }
  /** shell command: node file.js | node -e "code" | node -p "expr" | echo code | node */
  command() {
    return async (c) => {
      const a = c.argv;
      let code, argv;
      const i = a.findIndex((x) => x === "-e" || x === "-p" || x === "--eval" || x === "--print");
      if (i >= 0) {
        code = /p/.test(a[i]) ? `console.log(${a[i + 1] ?? ""})` : a[i + 1] ?? "";
        argv = ["[eval]", ...a.slice(i + 2)];
      } else if (a.length && a[0] !== "-") {
        const p = c.P(a[0]);
        if (!this.vfs.isFile(p)) {
          c.e(`node: cannot find module '${a[0]}'
`);
          return 1;
        }
        code = this.vfs.read(p);
        argv = [p, ...a.slice(1)];
      } else {
        code = c.stdin;
        argv = ["[stdin]"];
      }
      if (!String(code).trim()) {
        c.e('node: no script given. Use node file.js or node -e "code"\n');
        return 1;
      }
      const r = await this.run(code, { argv, cwd: c.sh.cwd, timeoutMs: c.sh.timeoutMs, env: c.sh.env });
      c.o(r.stdout);
      c.e(r.stderr);
      return r.code;
    };
  }
};

// src/internal/mpy_worker.js
function mpyClassic(src, MPY_BASE) {
  const meta = JSON.stringify(MPY_BASE + "micropython.mjs");
  const named = {};
  const body = String(src).replace(/import\.meta\.url/g, meta).replace(/import\.meta\b/g, `({ url: ${meta} })`).replace(/\bexport\s*\{([^}]*)\}\s*;?/g, (m, list) => {
    for (const part of list.split(",")) {
      const [local, as] = part.trim().split(/\s+as\s+/);
      if (local) named[(as || local).trim()] = local.trim();
    }
    return ";";
  }).replace(/\bexport\s+default\s+(?=[\w$])/g, "var __mpyDefault = ").replace(/\bexport\s+(?=(?:async\s+function|function\*?|const|let|var|class)\b)/g, "");
  const loader = named.loadMicroPython || "loadMicroPython";
  const nav = `const navigator = (() => { const n = globalThis.navigator; if (!n) return n; const ua = String(n.userAgent || '').replace(/\\s*Version\\/[\\d.]+/, '');
    return new Proxy(n, { get: (t, k) => k === 'userAgent' ? ua : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); })();
`;
  return `const __mpyFactory = async () => {
${nav}${body}
;return { loadMicroPython: typeof ${loader} === 'function' ? ${loader} : undefined };
};
`;
}
var MPY_COMPAT = "def __jv_compat():\n    import sys\n    import os as _os\n    if hasattr(_os, 'walk') and hasattr(_os, 'path'):\n        return\n    S_IFMT, S_IFDIR, S_IFREG = 0o170000, 0o040000, 0o100000\n    class _Path:\n        sep = '/'\n        curdir = '.'\n        def join(self, a, *p):\n            for b in p:\n                if b.startswith('/'):\n                    a = b\n                elif not a or a.endswith('/'):\n                    a = a + b\n                else:\n                    a = a + '/' + b\n            return a\n        def _mode(self, p):\n            try:\n                return _os.stat(p)[0]\n            except OSError:\n                return None\n        def exists(self, p):\n            return self._mode(p) is not None\n        def isdir(self, p):\n            m = self._mode(p)\n            return m is not None and (m & S_IFMT) == S_IFDIR\n        def isfile(self, p):\n            m = self._mode(p)\n            return m is not None and (m & S_IFMT) == S_IFREG\n        def getsize(self, p):\n            return _os.stat(p)[6]\n        def basename(self, p):\n            return p.rsplit('/', 1)[-1]\n        def dirname(self, p):\n            if '/' not in p:\n                return ''\n            d = p.rsplit('/', 1)[0]\n            return d if d else '/'\n        def split(self, p):\n            return (self.dirname(p), self.basename(p))\n        def splitext(self, p):\n            b = self.basename(p)\n            i = b.rfind('.')\n            if i <= 0:\n                return (p, '')\n            return (p[:len(p) - len(b) + i], b[i:])\n        def normpath(self, p):\n            absolute = p.startswith('/')\n            out = []\n            for s in p.split('/'):\n                if s in ('', '.'):\n                    continue\n                if s == '..':\n                    if out and out[-1] != '..':\n                        out.pop()\n                    elif not absolute:\n                        out.append(s)\n                else:\n                    out.append(s)\n            r = '/'.join(out)\n            return ('/' + r) if absolute else (r or '.')\n        def abspath(self, p):\n            return self.normpath(p if p.startswith('/') else self.join(_os.getcwd(), p))\n        def relpath(self, p, start='.'):\n            a = [x for x in self.abspath(p).split('/') if x]\n            b = [x for x in self.abspath(start).split('/') if x]\n            i = 0\n            while i < len(a) and i < len(b) and a[i] == b[i]:\n                i += 1\n            return '/'.join(['..'] * (len(b) - i) + a[i:]) or '.'\n        def expanduser(self, p):\n            return '/' + p[2:] if p.startswith('~/') else ('/' if p == '~' else p)\n    path = _Path()\n    def walk(top, topdown=True):\n        try:\n            names = _os.listdir(top)\n        except OSError:\n            return\n        dirs, files = [], []\n        for n in names:\n            (dirs if path.isdir(path.join(top, n)) else files).append(n)\n        if topdown:\n            yield top, dirs, files\n        for d in dirs:\n            yield from walk(path.join(top, d), topdown)\n        if not topdown:\n            yield top, dirs, files\n    def makedirs(p, exist_ok=False):\n        cur = '/' if p.startswith('/') else ''\n        for part in [x for x in p.split('/') if x]:\n            cur = path.join(cur, part) if cur else part\n            if not path.isdir(cur):\n                _os.mkdir(cur)\n            elif cur == p.rstrip('/') and not exist_ok:\n                raise OSError(17)\n    class _OS:\n        def __getattr__(self, k):\n            return getattr(_os, k)\n    m = _OS()\n    m.path = path\n    m.sep = '/'\n    if not hasattr(_os, 'walk'):\n        m.walk = walk\n    if not hasattr(_os, 'makedirs'):\n        m.makedirs = makedirs\n    sys.modules['os'] = m\n    sys.modules['os.path'] = path\ntry:\n    __jv_compat()\nexcept Exception:\n    pass\ndel __jv_compat\n";
var MPY_WORKER = `
const dec = new TextDecoder();
self.onmessage = async (ev) => {
  const { wasm, files, dirs, cwd, argv, code, stdin, heap, compat, sqliteModule, sqliteShim } = ev.data;
  const outB = [], errB = [], out = [];
  const flush = () => { if (outB.length) { out.push(['o', dec.decode(new Uint8Array(outB.splice(0)))]); } if (errB.length) { out.push(['e', dec.decode(new Uint8Array(errB.splice(0)))]); } };
  let exit = 0, FS = null, SQ = null; const orig = new Map(Object.entries(files));
  try {
    const { loadMicroPython } = await __mpyFactory();
    let si = 0; const sin = new TextEncoder().encode(stdin || '');
    const mp = await loadMicroPython({ url: wasm, heapsize: heap, linebuffer: false,
      stdout: b => { for (const x of b) outB.push(x); if (outB.length > 4096) flush(); },
      stderr: b => { for (const x of b) errB.push(x); if (errB.length > 4096) flush(); },
      stdin: () => si < sin.length ? sin[si++] : null });
    FS = mp.FS;
    const mk = p => { const parts = p.split('/').filter(Boolean); let cur = ''; for (const s of parts) { cur += '/' + s; try { FS.mkdir(cur); } catch {} } };
    for (const d of dirs) if (d !== '/') mk(d);
    for (const [p, data] of orig) { mk(p.slice(0, p.lastIndexOf('/')) || '/'); FS.writeFile(p, data); }
    try { FS.chdir(cwd); } catch {}
    const scriptDir = argv[0] && argv[0].startsWith('/') ? argv[0].slice(0, argv[0].lastIndexOf('/')) || '/' : cwd;
    try { mp.runPython(compat); } catch (e) {}
    if (sqliteModule && typeof __jvSqliteBridge === 'function') { SQ = __jvSqliteBridge(__jvSqlite(sqliteModule), FS); mp.registerJsModule('_jvsqlite', SQ); try { mp.runPython(sqliteShim); } catch (e) {} }
    mp.runPython('import sys\\nsys.argv[:] = ' + JSON.stringify(argv) + '\\nif ' + JSON.stringify(scriptDir) + ' not in sys.path: sys.path.insert(0, ' + JSON.stringify(scriptDir) + ')');
    await mp.runPythonAsync(code);
  } catch (e) {
    flush();
    const msg = String((e && e.message) || e);
    const m = /SystemExit(?::\\s*(-?\\d+))?\\s*$/.exec(msg.trim());
    if (m) exit = m[1] ? +m[1] : 0;
    else { out.push(['e', msg.endsWith('\\n') ? msg : msg + '\\n']); exit = 1; }
  }
  flush();
  try { SQ && SQ.flushAll(); } catch (e) {}
  const writes = {}, deletes = [], mkdirs = [];
  if (FS) {
    const seen = new Set();
    const walk = (dir) => {
      let names = []; try { names = FS.readdir(dir); } catch { return; }
      for (const n of names) {
        if (n === '.' || n === '..') continue;
        const p = (dir === '/' ? '' : dir) + '/' + n;
        if (/^\\/(dev|proc|home\\/web_user)(\\/|$)/.test(p) || p === '/home' && !dirs.includes('/home')) continue;
        let st; try { st = FS.stat(p); } catch { continue; }
        if (FS.isDir(st.mode)) { if (!dirs.includes(p) && p !== '/tmp') mkdirs.push(p); walk(p); }
        else { seen.add(p); const data = FS.readFile(p); const o = orig.get(p); if (!o || o.length !== data.length || o.some((x, i) => x !== data[i])) writes[p] = data; }
      }
    };
    walk('/');
    for (const p of orig.keys()) if (!seen.has(p)) deletes.push(p);
  }
  self.postMessage({ out, writes, deletes, mkdirs, code: exit });
};`;

// src/internal/sqlite_extras.js
var SQLITE_CLI_WORKER = `
self.onmessage = (ev) => {
  const { module, argv, stdin, dbBytes, files } = ev.data;
  try {
    const S = __jvSqlite(module);
    const r = S.cli({ argv, stdin, dbBytes, readFile: p => files[p] ?? null });
    self.postMessage(r, r.dbBytes ? [r.dbBytes.buffer] : []);
  } catch (e) { self.postMessage({ out: '', err: 'sqlite3: ' + ((e && e.message) || e) + '\\n', code: 1 }); }
};`;
var SQLITE_PY_BRIDGE = `
function __jvSqliteBridge(S, FS) {
  const H = new Map(); let hid = 0;
  const abs = p => p.startsWith('/') ? p : ((FS.cwd() === '/' ? '' : FS.cwd()) + '/' + p);
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const enc = v => v instanceof Uint8Array ? { $b: b64(v) } : typeof v === 'bigint' ? { $i: v.toString() } : v;
  const revive = (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? (typeof v.$b === 'string' ? Uint8Array.from(atob(v.$b), c => c.charCodeAt(0)) : typeof v.$i === 'string' ? BigInt(v.$i) : v) : v;
  const flush = (h) => { const x = H.get(h); if (x && x.fp && x.d.dirty) { FS.writeFile(x.fp, x.d.export()); x.d.dirty = false; } return 0; };
  return {
    version: () => S.version,
    open: (path) => { const p = String(path); let fp = null, bytes = null; if (p && p !== ':memory:') { fp = abs(p); try { bytes = FS.readFile(fp); } catch (e) {} } const d = new S.Database(bytes); H.set(++hid, { d, fp }); return hid; },
    execute: (h, sql, pj) => { const x = H.get(h); try { const params = pj ? JSON.parse(pj, revive) : null; let cols = [], rows = [], n = 0;
        x.d.each(String(sql), st => { if (n++) throw new Error('You can only execute one statement at a time.'); cols = st.columns(); rows = st.rows(params); });
        return JSON.stringify({ cols, rows: rows.map(r => r.map(enc)), changes: x.d.changes(), lastrowid: Number(x.d.lastInsertRowid()), total: x.d.totalChanges() });
      } catch (e) { return JSON.stringify({ error: String(e.message || e) }); } },
    script: (h, sql) => { try { H.get(h).d.exec(String(sql)); return '{}'; } catch (e) { return JSON.stringify({ error: String(e.message || e) }); } },
    flush,
    close: (h) => { flush(h); const x = H.get(h); if (x) { x.d.close(); H.delete(h); } return 0; },
    flushAll: () => { for (const h of H.keys()) flush(h); return 0; },
  };
}`;
var SQLITE_PY_SHIM = `
def __jv_sqlite():
    import sys, json, binascii
    import _jvsqlite as J
    class Error(Exception): pass
    class Warning(Exception): pass
    class InterfaceError(Error): pass
    class DatabaseError(Error): pass
    class OperationalError(DatabaseError): pass
    class IntegrityError(DatabaseError): pass
    class ProgrammingError(DatabaseError): pass
    def _enc(v):
        if isinstance(v, (bytes, bytearray)):
            return {'$b': binascii.b2a_base64(bytes(v)).decode().strip()}
        return v
    def _dec(v):
        if isinstance(v, dict):
            if '$b' in v:
                return binascii.a2b_base64(v['$b'])
            if '$i' in v:
                return int(v['$i'])
        return v
    def _raise(msg):
        low = msg.lower()
        if 'constraint' in low:
            raise IntegrityError(msg)
        if 'one statement' in low or 'parameter' in low or 'values for' in low:
            raise ProgrammingError(msg)
        raise OperationalError(msg)
    def _starts(s, words):
        for w in words:
            if s.startswith(w):
                return True
        return False
    class Row:
        def __init__(self, cols, vals):
            self._c = cols
            self._v = vals
        def keys(self):
            return list(self._c)
        def __getitem__(self, k):
            if isinstance(k, str):
                lk = k.lower()
                for i, c in enumerate(self._c):
                    if c.lower() == lk:
                        return self._v[i]
                raise IndexError('No item with that key')
            return self._v[k]
        def __len__(self):
            return len(self._v)
        def __iter__(self):
            return iter(self._v)
        def __eq__(self, o):
            return isinstance(o, Row) and o._c == self._c and o._v == self._v
        def __repr__(self):
            return '<Row %r>' % (tuple(self._v),)
    class Cursor:
        def __init__(self, conn):
            self.connection = conn
            self._rows = []
            self._i = 0
            self.description = None
            self.rowcount = -1
            self.lastrowid = None
            self.row_factory = None
            self.arraysize = 1
        def execute(self, sql, params=()):
            c = self.connection
            c._check()
            if isinstance(params, dict):
                p = {}
                for k in params:
                    p[k] = _enc(params[k])
            else:
                p = [_enc(v) for v in params]
            r = json.loads(J.execute(c._h, sql, json.dumps(p) if p else ''))
            if 'error' in r:
                _raise(r['error'])
            cols = r['cols']
            rf = self.row_factory or c.row_factory
            rows = [tuple([_dec(v) for v in row]) for row in r['rows']]
            if rf is Row:
                rows = [Row(cols, list(t)) for t in rows]
            elif rf:
                rows = [rf(self, t) for t in rows]
            self._rows = rows
            self._i = 0
            self.description = tuple([(n, None, None, None, None, None, None) for n in cols]) if cols else None
            u = sql.lstrip()[:7].upper()
            self.rowcount = r['changes'] if _starts(u, ('INSERT', 'UPDATE', 'DELETE', 'REPLACE')) else -1
            if _starts(u, ('INSERT', 'REPLACE')):
                self.lastrowid = r['lastrowid']
            c.total_changes = r.get('total', c.total_changes)
            return self
        def executemany(self, sql, seq):
            n = 0
            for p in seq:
                self.execute(sql, p)
                if self.rowcount > 0:
                    n += self.rowcount
            self.rowcount = n
            return self
        def executescript(self, script):
            self.connection.executescript(script)
            return self
        def fetchone(self):
            if self._i < len(self._rows):
                self._i += 1
                return self._rows[self._i - 1]
            return None
        def fetchmany(self, size=None):
            size = size or self.arraysize
            out = self._rows[self._i:self._i + size]
            self._i += len(out)
            return out
        def fetchall(self):
            out = self._rows[self._i:]
            self._i = len(self._rows)
            return out
        def __iter__(self):
            return self
        def __next__(self):
            r = self.fetchone()
            if r is None:
                raise StopIteration
            return r
        def close(self):
            pass
    class Connection:
        def __init__(self, path):
            self._h = J.open(str(path))
            self.row_factory = None
            self.total_changes = 0
            self.isolation_level = ''
        def _check(self):
            if self._h is None:
                raise ProgrammingError('Cannot operate on a closed database.')
        def cursor(self):
            self._check()
            return Cursor(self)
        def execute(self, sql, params=()):
            return self.cursor().execute(sql, params)
        def executemany(self, sql, seq):
            return self.cursor().executemany(sql, seq)
        def executescript(self, script):
            self._check()
            r = json.loads(J.script(self._h, script))
            if 'error' in r:
                _raise(r['error'])
            return self.cursor()
        def commit(self):
            self._check()
            J.flush(self._h)
        def rollback(self):
            pass
        def close(self):
            if self._h is not None:
                J.close(self._h)
                self._h = None
        def __enter__(self):
            return self
        def __exit__(self, t, v, tb):
            if t is None:
                self.commit()
            return False
    class _Mod:
        pass
    m = _Mod()
    m.Error = Error
    m.Warning = Warning
    m.InterfaceError = InterfaceError
    m.DatabaseError = DatabaseError
    m.OperationalError = OperationalError
    m.IntegrityError = IntegrityError
    m.ProgrammingError = ProgrammingError
    m.Row = Row
    m.Cursor = Cursor
    m.Connection = Connection
    def connect(database, *a, **k):
        return Connection(database)
    m.connect = connect
    m.sqlite_version = J.version()
    m.version = '2.6.0'
    m.PARSE_DECLTYPES = 1
    m.PARSE_COLNAMES = 2
    m.paramstyle = 'qmark'
    sys.modules['sqlite3'] = m
try:
    __jv_sqlite()
except Exception as e:
    print('sqlite3 module failed to load:', e)
del __jv_sqlite
`;

// src/python.js
var MPY_VERSION = "1.27.0";
var Python = class {
  constructor({ vfs, sqlite = null, cdn = "https://cdn.jsdelivr.net/npm/" }) {
    this.vfs = vfs;
    this.sqlite = sqlite;
    this.base = `${cdn}@micropython/micropython-webassembly-pyscript@${MPY_VERSION}/`;
    this._p = null;
  }
  /** download the runtime (done automatically on first run) */
  load() {
    return this._p ||= (async () => {
      const [m, w] = await Promise.all([fetchText(this.base + "micropython.mjs", "MicroPython"), fetchBytes(this.base + "micropython.wasm", "MicroPython")]);
      if (!m || !isWasm(w)) throw new Error(`MicroPython ${MPY_VERSION} downloaded incomplete (${w.length} bytes of wasm)`);
      return { factory: mpyClassic(m, this.base), wasm: "data:application/wasm;base64," + b64enc(w) };
    })().catch((e) => {
      this._p = null;
      throw e;
    });
  }
  /**
   * Run Python code. Returns { stdout, stderr, output, code }.
   * @param {string} code @param {{ argv?: string[], cwd?: string, stdin?: string, timeoutMs?: number, heapMB?: number, signal?: AbortSignal }} [o]
   */
  async run(code, { argv = [""], cwd = "/", stdin = "", timeoutMs = 6e4, heapMB = 16, signal = null } = {}) {
    let assets;
    try {
      assets = await this.load();
    } catch (e) {
      return { stdout: "", stderr: `python: ${e.message}
`, output: `python: ${e.message}
`, code: 1 };
    }
    const vfs = this.vfs;
    const files = {}, dirs = [];
    for (const [p, n] of vfs.nodes) {
      if (n.dir) dirs.push(p);
      else if (n.data.length < 4e6) files[p] = n.data;
    }
    let sqMod = null;
    if (this.sqlite && (/sqlite/i.test(code) || [...vfs.nodes].some(([p, n]) => !n.dir && p.endsWith(".py") && n.data.length < 2e6 && /sqlite/i.test(dec.decode(n.data))))) {
      try {
        sqMod = await this.sqlite.module();
      } catch (e) {
        return { stdout: "", stderr: `python: could not load SQLite (${e.message})
`, code: 1 };
      }
    }
    const src = sqMod ? assets.factory + this.sqlite.glueSource + "\n" + SQLITE_PY_BRIDGE + "\n" + MPY_WORKER : assets.factory + MPY_WORKER;
    const r = await workerRun(src, { sqliteModule: sqMod, sqliteShim: SQLITE_PY_SHIM, compat: MPY_COMPAT, wasm: assets.wasm, files, dirs, cwd, argv, code: String(code), stdin, heap: heapMB * 1024 * 1024 }, { timeoutMs, signal, name: "python" });
    if (r.error) return { stdout: "", stderr: `python: ${r.error}
`, output: `python: ${r.error}
`, code: r.timeout ? 124 : r.aborted ? 130 : 1 };
    const errs = [];
    vfs.applyChanges({ deletes: r.deletes || [], mkdirs: r.mkdirs || [], writes: r.writes || {} }, (e) => errs.push(`python: ${e.message}
`));
    const out = r.out || [];
    return { stdout: out.filter((x) => x[0] === "o").map((x) => x[1]).join(""), stderr: out.filter((x) => x[0] === "e").map((x) => x[1]).join("") + errs.join(""), output: out.map((x) => x[1]).join(""), code: r.code ?? 1 };
  }
  /** shell command: python file.py | python -c "code" | echo code | python */
  command() {
    return async (c) => {
      const a = c.argv;
      let code, argv;
      if (a[0] === "--version" || a[0] === "-V") {
        c.o(`MicroPython ${MPY_VERSION} (WebAssembly)
`);
        return 0;
      }
      if (a[0] === "-m" && a[1] === "pip") {
        c.e("pip is not available: MicroPython runs in the browser and has no package installer.\n");
        return 1;
      }
      if (a[0] === "-c") {
        code = a[1] ?? "";
        argv = ["-c", ...a.slice(2)];
      } else if (a.length && a[0] !== "-") {
        const p = c.P(a[0]);
        if (!this.vfs.isFile(p)) {
          c.e(`python: can't open file '${a[0]}': No such file
`);
          return 2;
        }
        code = this.vfs.read(p);
        argv = [p, ...a.slice(1)];
      } else {
        code = c.stdin;
        argv = [""];
      }
      if (!String(code).trim()) {
        c.e('python: no script given. Use python file.py or python -c "code"\n');
        return 2;
      }
      const r = await this.run(code, { argv, cwd: c.sh.cwd, stdin: a[0] === "-c" || a.length && a[0] !== "-" ? c.stdin : "", timeoutMs: c.sh.timeoutMs });
      c.o(r.stdout);
      c.e(r.stderr);
      return r.code;
    };
  }
};

// src/internal/sqlite_glue.js
function __jvSqlite(wasmModule) {
  let mem = null;
  const imports = { wasi_snapshot_preview1: {
    clock_time_get(id, prec, out) {
      new DataView(mem.buffer).setBigUint64(out, BigInt(Date.now()) * 1000000n, true);
      return 0;
    },
    // sqlite-vec pulls in a little of wasi-libc's stdio: no files, no preopened folders, nothing to write to
    fd_close() {
      return 8;
    },
    fd_seek() {
      return 8;
    },
    fd_write(fd, iov, n, out) {
      let t = 0;
      const d = new DataView(mem.buffer);
      for (let i = 0; i < n; i++) t += d.getUint32(iov + i * 8 + 4, true);
      d.setUint32(out, t, true);
      return 0;
    },
    fd_prestat_get() {
      return 8;
    },
    fd_prestat_dir_name() {
      return 8;
    },
    proc_exit(c) {
      throw new Error("sqlite exited (" + c + ")");
    },
    random_get(ptr, len) {
      const u = new Uint8Array(mem.buffer, ptr, len);
      for (let i = 0; i < len; i += 65536) crypto.getRandomValues(u.subarray(i, Math.min(len, i + 65536)));
      return 0;
    }
  } };
  const inst = new WebAssembly.Instance(wasmModule, imports);
  const X = inst.exports;
  mem = X.memory;
  X._initialize();
  X.sqlite3_initialize();
  const te = new TextEncoder(), td = new TextDecoder();
  const u8 = () => new Uint8Array(mem.buffer), dv = () => new DataView(mem.buffer);
  const cstr = (p) => {
    if (!p) return null;
    const m = u8();
    let e = p;
    while (m[e]) e++;
    return td.decode(m.subarray(p, e));
  };
  const alloc = (n) => {
    const p = X.jv_malloc(Math.max(1, n));
    if (!p) throw new Error("out of memory");
    return p;
  };
  const withStr = (s, fn) => {
    const b = te.encode(String(s));
    const p = alloc(b.length + 1);
    u8().set(b, p);
    u8()[p + b.length] = 0;
    try {
      return fn(p, b.length);
    } finally {
      X.jv_free(p);
    }
  };
  const SQLITE_OK = 0, SQLITE_ROW = 100, SQLITE_DONE = 101, TRANSIENT = -1;
  const version = cstr(X.sqlite3_libversion());
  class SqliteError extends Error {
    constructor(msg, code) {
      super(msg);
      this.code = code;
      this.name = "SqliteError";
    }
  }
  class Statement {
    constructor(db, p, sql) {
      this.db = db;
      this.p = p;
      this.sql = sql;
      this.readonly = !!X.sqlite3_stmt_readonly(p);
    }
    columns() {
      const n = X.sqlite3_column_count(this.p), out = [];
      for (let i = 0; i < n; i++) out.push(cstr(X.sqlite3_column_name(this.p, i)));
      return out;
    }
    bind(params) {
      X.sqlite3_reset(this.p);
      X.sqlite3_clear_bindings(this.p);
      if (params == null) return this;
      const n = X.sqlite3_bind_parameter_count(this.p);
      const set = (i, v) => {
        let rc;
        if (v === null || v === void 0) rc = X.sqlite3_bind_null(this.p, i);
        else if (typeof v === "bigint") rc = X.sqlite3_bind_int64(this.p, i, v);
        else if (typeof v === "boolean") rc = X.sqlite3_bind_int64(this.p, i, v ? 1n : 0n);
        else if (typeof v === "number") rc = Number.isSafeInteger(v) ? X.sqlite3_bind_int64(this.p, i, BigInt(v)) : X.sqlite3_bind_double(this.p, i, v);
        else if (v instanceof Uint8Array || v instanceof ArrayBuffer) {
          const b = v instanceof Uint8Array ? v : new Uint8Array(v);
          const q = alloc(b.length);
          u8().set(b, q);
          rc = X.sqlite3_bind_blob(this.p, i, q, b.length, TRANSIENT);
          X.jv_free(q);
        } else rc = withStr(typeof v === "object" ? JSON.stringify(v) : v, (q, len) => X.sqlite3_bind_text(this.p, i, q, len, TRANSIENT));
        if (rc !== SQLITE_OK) throw this.db.err(rc);
      };
      if (Array.isArray(params)) {
        if (params.length > n) throw new SqliteError(`${params.length} values for ${n} parameters`, 25);
        params.forEach((v, k) => set(k + 1, v));
      } else if (typeof params === "object" && !(params instanceof Uint8Array)) {
        for (const [k, v] of Object.entries(params)) {
          let idx = 0;
          for (const pre of /^[:@$?]/.test(k) ? [""] : [":", "@", "$"]) {
            idx = withStr(pre + k, (q) => X.sqlite3_bind_parameter_index(this.p, q));
            if (idx) break;
          }
          if (!idx) throw new SqliteError(`no parameter named ${k}`, 25);
          set(idx, v);
        }
      } else set(1, params);
      return this;
    }
    value(i) {
      switch (X.sqlite3_column_type(this.p, i)) {
        case 1: {
          const v = X.sqlite3_column_int64(this.p, i);
          return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
        }
        case 2:
          return X.sqlite3_column_double(this.p, i);
        case 3: {
          const q = X.sqlite3_column_text(this.p, i);
          const n = X.sqlite3_column_bytes(this.p, i);
          return td.decode(u8().subarray(q, q + n));
        }
        case 4: {
          const q = X.sqlite3_column_blob(this.p, i);
          const n = X.sqlite3_column_bytes(this.p, i);
          return u8().slice(q, q + n);
        }
        default:
          return null;
      }
    }
    step() {
      const rc = X.sqlite3_step(this.p);
      if (rc === SQLITE_ROW) return true;
      if (rc === SQLITE_DONE) {
        if (!this.readonly) this.db.dirty = true;
        return false;
      }
      throw this.db.err(rc);
    }
    row() {
      const n = X.sqlite3_data_count(this.p), r = [];
      for (let i = 0; i < n; i++) r.push(this.value(i));
      return r;
    }
    *iterate(params) {
      this.bind(params);
      while (this.step()) yield this.row();
    }
    rows(params) {
      return [...this.iterate(params)];
    }
    finalize() {
      if (this.p) {
        X.sqlite3_finalize(this.p);
        this.p = 0;
      }
    }
  }
  class Database2 {
    constructor(bytes) {
      this.p = withStr(":memory:", (q) => {
        const pp = alloc(4);
        try {
          const rc = X.sqlite3_open_v2(q, pp, 2 | 4, 0);
          const db = dv().getUint32(pp, true);
          if (rc !== SQLITE_OK) throw new SqliteError("cannot open database", rc);
          return db;
        } finally {
          X.jv_free(pp);
        }
      });
      this.dirty = false;
      if (bytes && bytes.length) {
        const n = bytes.length;
        const q = X.sqlite3_malloc64(BigInt(n));
        u8().set(bytes, q);
        const rc = withStr("main", (s) => X.sqlite3_deserialize(this.p, s, q, BigInt(n), BigInt(n), 1 | 2));
        if (rc !== SQLITE_OK) throw new SqliteError("file is not a database", 26);
        try {
          this.exec("SELECT count(*) FROM sqlite_schema");
        } catch (e) {
          throw new SqliteError("file is not a database", 26);
        }
      }
    }
    err(rc) {
      return new SqliteError(cstr(X.sqlite3_errmsg(this.p)) || `SQLite error ${rc}`, X.sqlite3_extended_errcode(this.p));
    }
    // prepare every statement in sql; calls fn(stmt) for each (stmt is finalized afterwards)
    each(sql, fn) {
      const b = te.encode(String(sql));
      const base = alloc(b.length + 1);
      u8().set(b, base);
      u8()[base + b.length] = 0;
      const pp = alloc(4), pt = alloc(4);
      let cur = base;
      const end = base + b.length;
      try {
        while (cur < end) {
          const rc = X.sqlite3_prepare_v2(this.p, cur, end - cur, pp, pt);
          if (rc !== SQLITE_OK) throw this.err(rc);
          const sp = dv().getUint32(pp, true);
          const next = dv().getUint32(pt, true);
          if (sp) {
            const st = new Statement(this, sp, td.decode(u8().subarray(cur, next)).trim());
            try {
              fn(st);
            } finally {
              st.finalize();
            }
          }
          if (next <= cur) break;
          cur = next;
        }
      } finally {
        X.jv_free(pp);
        X.jv_free(pt);
        X.jv_free(base);
      }
    }
    exec(sql, params) {
      const out = [];
      let first = true;
      this.each(sql, (st) => {
        const r = { columns: st.columns(), values: st.rows(first ? params : null) };
        first = false;
        if (r.columns.length) out.push(r);
      });
      return out;
    }
    prepare(sql) {
      const pp = alloc(4);
      try {
        const rc = withStr(sql, (q, n) => X.sqlite3_prepare_v2(this.p, q, n, pp, 0));
        if (rc !== SQLITE_OK) throw this.err(rc);
        const sp = dv().getUint32(pp, true);
        if (!sp) throw new SqliteError("empty statement", 21);
        return new Statement(this, sp, sql);
      } finally {
        X.jv_free(pp);
      }
    }
    changes() {
      return X.sqlite3_changes(this.p);
    }
    totalChanges() {
      return X.sqlite3_total_changes(this.p);
    }
    lastInsertRowid() {
      const v = X.sqlite3_last_insert_rowid(this.p);
      return v <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(v) : v;
    }
    inTransaction() {
      return !X.sqlite3_get_autocommit(this.p);
    }
    export() {
      const ps = alloc(8);
      try {
        const q = withStr("main", (s) => X.sqlite3_serialize(this.p, s, ps, 0));
        const n = Number(dv().getBigInt64(ps, true));
        if (!q) return new Uint8Array(0);
        const out = u8().slice(q, q + n);
        X.sqlite3_free(q);
        return out;
      } finally {
        X.jv_free(ps);
      }
    }
    close() {
      if (this.p) {
        X.sqlite3_close_v2(this.p);
        this.p = 0;
      }
    }
  }
  const complete = (sql) => withStr(sql, (q) => X.sqlite3_complete(q)) !== 0;
  function cli({ argv, stdin, readFile, dbBytes }) {
    let out = "", err = "", exit = 0, mode = "list", headers = false, sep = "|", nullv = "", bail = false, readonly = false, dbPath = null, cmds = [], sqls = [];
    const o = (s) => {
      out += s;
    }, e = (s) => {
      err += s;
    };
    const opts = { "-json": "json", "-csv": "csv", "-column": "column", "-box": "box", "-table": "table", "-markdown": "markdown", "-line": "line", "-list": "list", "-html": "html", "-tabs": "tabs", "-quote": "quote" };
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i].replace(/^--/, "-");
      if (opts[a]) {
        mode = opts[a];
        if (["csv", "tabs"].includes(mode)) sep = mode === "csv" ? "," : "	";
        if (["column", "box", "table", "markdown"].includes(mode)) headers = true;
      } else if (a === "-header" || a === "-headers") headers = true;
      else if (a === "-noheader") headers = false;
      else if (a === "-separator") sep = argv[++i] ?? "|";
      else if (a === "-nullvalue") nullv = argv[++i] ?? "";
      else if (a === "-cmd") cmds.push(argv[++i] ?? "");
      else if (a === "-bail") bail = true;
      else if (a === "-readonly") readonly = true;
      else if (a === "-version") {
        o(version + "\n");
        return { out, err, code: 0 };
      } else if (a === "-help") {
        o(HELP);
        return { out, err, code: 0 };
      } else if (a.startsWith("-") && a.length > 1) {
        e(`sqlite3: unknown option: ${argv[i]}
Use -help for a list of options.
`);
        return { out, err, code: 1 };
      } else if (dbPath === null) dbPath = argv[i];
      else sqls.push(argv[i]);
    }
    let db;
    try {
      db = new Database2(dbPath && dbPath !== ":memory:" ? dbBytes : null);
    } catch (x) {
      e(`Error: unable to open database "${dbPath}": ${x.message}
`);
      return { out, err, code: 1 };
    }
    let changesOn = false;
    let stop = false;
    const fmt = (v) => v === null ? nullv : v instanceof Uint8Array ? mode === "json" || mode === "quote" ? "X'" + [...v].map((b) => b.toString(16).padStart(2, "0")).join("") + "'" : td.decode(v) : typeof v === "bigint" ? v.toString() : String(v);
    const csvq = (s) => /[",\n\r]/.test(s) || s !== s.trim() ? '"' + s.replace(/"/g, '""') + '"' : s;
    const sqlq = (v) => v === null ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : v instanceof Uint8Array ? "X'" + [...v].map((b) => b.toString(16).padStart(2, "0")).join("") + "'" : "'" + String(v).replace(/'/g, "''") + "'";
    const show = (cols, rows) => {
      if (!cols.length) return;
      if (mode === "json") {
        if (!rows.length) return;
        o("[" + rows.map((r) => "{" + cols.map((c, i) => JSON.stringify(c) + ":" + (r[i] instanceof Uint8Array ? JSON.stringify(fmt(r[i])) : typeof r[i] === "bigint" ? r[i].toString() : JSON.stringify(r[i]))).join(",") + "}").join(",\n") + "]\n");
        return;
      }
      if (mode === "line") {
        const w = Math.max(...cols.map((c) => c.length));
        rows.forEach((r, k) => {
          if (k) o("\n");
          cols.forEach((c, i) => o(c.padStart(w) + " = " + fmt(r[i]) + "\n"));
        });
        return;
      }
      if (mode === "csv") {
        if (headers) o(cols.map(csvq).join(sep) + "\r\n");
        for (const r of rows) o(r.map((v) => v === null ? "" : csvq(fmt(v))).join(sep) + "\r\n");
        return;
      }
      if (mode === "quote") {
        if (headers) o(cols.map((c) => "'" + c + "'").join(",") + "\n");
        for (const r of rows) o(r.map(sqlq).join(",") + "\n");
        return;
      }
      if (mode === "html") {
        if (headers) o("<TR>" + cols.map((c) => `<TH>${c}</TH>`).join("") + "\n</TR>\n");
        for (const r of rows) o("<TR>" + r.map((v) => `<TD>${fmt(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</TD>`).join("") + "\n</TR>\n");
        return;
      }
      if (["column", "box", "table", "markdown"].includes(mode)) {
        const cells = rows.map((r) => r.map((v2) => fmt(v2).replace(/\n/g, " ")));
        const w = cols.map((c, i) => Math.max(c.length, ...cells.map((r) => (r[i] || "").length)));
        const num = cols.map((c, i) => rows.length && rows.every((r) => r[i] === null || typeof r[i] === "number" || typeof r[i] === "bigint"));
        const pad = (s, i) => num[i] ? s.padStart(w[i]) : s.padEnd(w[i]);
        if (mode === "column") {
          o(cols.map((c, i) => c.padEnd(w[i])).join("  ").trimEnd() + "\n" + w.map((n) => "-".repeat(n)).join("  ") + "\n");
          for (const r of cells) o(r.map(pad).join("  ").trimEnd() + "\n");
          return;
        }
        if (mode === "markdown") {
          o("| " + cols.map((c, i) => c.padEnd(w[i])).join(" | ") + " |\n|" + w.map((n, i) => num[i] ? "-".repeat(n + 1) + ":" : ":" + "-".repeat(n + 1)).join("|") + "|\n");
          for (const r of cells) o("| " + r.map(pad).join(" | ") + " |\n");
          return;
        }
        const [tl, tm, tr, ml, mm, mr, bl, bm, br, h, v] = mode === "box" ? ["\u250C", "\u252C", "\u2510", "\u251C", "\u253C", "\u2524", "\u2514", "\u2534", "\u2518", "\u2500", "\u2502"] : ["+", "+", "+", "+", "+", "+", "+", "+", "+", "-", "|"];
        const line = (a, b, c) => a + w.map((n) => h.repeat(n + 2)).join(b) + c + "\n";
        o(line(tl, tm, tr) + v + cols.map((c, i) => " " + c.padEnd(w[i]) + " ").join(v) + v + "\n" + line(ml, mm, mr));
        for (const r of cells) o(v + r.map((s, i) => " " + pad(s, i) + " ").join(v) + v + "\n");
        o(line(bl, bm, br));
        return;
      }
      if (headers) o(cols.join(sep) + "\n");
      for (const r of rows) o(r.map(fmt).join(mode === "tabs" ? "	" : sep) + "\n");
    };
    const runSql = (sql) => {
      try {
        db.each(sql, (st) => {
          if (readonly && !st.readonly) throw new SqliteError("attempt to write a readonly database", 8);
          const cols = st.columns();
          const rows = st.rows();
          show(cols, rows);
          if (changesOn && !st.readonly) o(`changes: ${db.changes()}   total_changes: ${db.totalChanges()}
`);
        });
      } catch (x) {
        e(`${/syntax error|incomplete input|unrecognized token/.test(x.message) ? "Parse error" : "Runtime error"}: ${x.message}
`);
        exit = 1;
        if (bail) stop = true;
      }
    };
    const tableList = (pat) => db.exec(`SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ${pat ? "AND name LIKE ?" : ""} ORDER BY 1`, pat ? [pat] : null)[0]?.values.map((r) => r[0]) || [];
    const dot = (line) => {
      const args = (line.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((s) => s.replace(/^["']|["']$/g, ""));
      const c = args[0].slice(1);
      if (c === "quit" || c === "exit") {
        stop = true;
        return;
      }
      if (c === "tables") {
        const t = tableList(args[1]);
        if (t.length) o(t.join("  ") + "\n");
        return;
      }
      if (c === "schema" || c === "fullschema") {
        const r = db.exec(`SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${args[1] ? "AND (name LIKE ?1 OR tbl_name LIKE ?1)" : ""} ORDER BY tbl_name, type DESC, name`, args[1] ? [args[1]] : null)[0];
        for (const [s] of r?.values || []) o(s + ";\n");
        return;
      }
      if (c === "indexes" || c === "indices") {
        const r = db.exec(`SELECT name FROM sqlite_schema WHERE type='index' ${args[1] ? "AND tbl_name LIKE ?" : ""} ORDER BY 1`, args[1] ? [args[1]] : null)[0];
        if (r) o(r.values.map((x) => x[0]).join("  ") + "\n");
        return;
      }
      if (c === "mode") {
        const m = args[1] || "list";
        if (!["list", "csv", "json", "line", "column", "box", "table", "markdown", "html", "tabs", "quote"].includes(m)) {
          e(`Error: mode should be one of: box column csv html json line list markdown quote table tabs
`);
          exit = 1;
          return;
        }
        mode = m;
        if (m === "csv") sep = ",";
        else if (m === "tabs") sep = "	";
        else if (m === "list") sep = "|";
        if (["column", "box", "table", "markdown"].includes(m)) headers = true;
        return;
      }
      if (c === "headers" || c === "header") {
        headers = /^(on|1|yes|true)$/i.test(args[1] || "");
        return;
      }
      if (c === "separator") {
        sep = (args[1] ?? "|").replace(/\\t/g, "	").replace(/\\n/g, "\n");
        return;
      }
      if (c === "nullvalue") {
        nullv = args[1] ?? "";
        return;
      }
      if (c === "changes") {
        changesOn = /^(on|1|yes|true)$/i.test(args[1] || "");
        return;
      }
      if (c === "bail") {
        bail = /^(on|1|yes|true)$/i.test(args[1] || "");
        return;
      }
      if (c === "databases") {
        o(`main: ${dbPath && dbPath !== ":memory:" ? dbPath : '""'} r${readonly ? "o" : "w"}
`);
        return;
      }
      if (c === "print") {
        o(args.slice(1).join(" ") + "\n");
        return;
      }
      if (c === "read") {
        const t = readFile(args[1]);
        if (t == null) {
          e(`Error: cannot open "${args[1]}"
`);
          exit = 1;
          return;
        }
        feed(t);
        return;
      }
      if (c === "import") {
        const flags = args.filter((a) => a.startsWith("--"));
        const rest = args.slice(1).filter((a) => !a.startsWith("--"));
        const [file, table] = rest;
        const text = readFile(file);
        if (text == null) {
          e(`Error: cannot open "${file}"
`);
          exit = 1;
          return;
        }
        const rows = parseCsv(text, mode === "tabs" || flags.includes("--tabs") ? "	" : ",");
        if (!rows.length) return;
        const skip = +(flags.find((f) => f.startsWith("--skip"))?.split("=")[1] || 0);
        const exists = tableList(table).includes(table);
        let data = rows.slice(skip);
        try {
          if (!exists) {
            const hdr = data.shift();
            db.exec(`CREATE TABLE "${table.replace(/"/g, '""')}"(${hdr.map((h) => '"' + String(h).replace(/"/g, '""') + '" TEXT').join(", ")})`);
            db.dirty = true;
          }
          const ncol = db.exec(`SELECT count(*) FROM pragma_table_info(?)`, [table])[0].values[0][0];
          const st = db.prepare(`INSERT INTO "${table.replace(/"/g, '""')}" VALUES(${Array(ncol).fill("?").join(",")})`);
          try {
            db.exec("BEGIN");
            for (const r of data) {
              const v = r.slice(0, ncol);
              while (v.length < ncol) v.push(null);
              st.bind(v);
              st.step();
            }
            db.exec("COMMIT");
          } finally {
            st.finalize();
          }
          db.dirty = true;
        } catch (x) {
          try {
            db.exec("ROLLBACK");
          } catch {
          }
          e(`Error: ${x.message}
`);
          exit = 1;
        }
        return;
      }
      if (c === "dump") {
        o("PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n");
        const objs = db.exec(`SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${args[1] ? "AND tbl_name LIKE ?" : ""} ORDER BY type='table' DESC, rowid`, args[1] ? [args[1]] : null)[0]?.values || [];
        for (const [type, name, s] of objs) {
          if (type !== "table") continue;
          o(s + ";\n");
          for (const r of db.exec(`SELECT * FROM "${name.replace(/"/g, '""')}"`)[0]?.values || []) o(`INSERT INTO ${/^[A-Za-z_]\w*$/.test(name) ? name : '"' + name + '"'} VALUES(${r.map(sqlq).join(",")});
`);
        }
        for (const [type, , s] of objs) if (type !== "table") o(s + ";\n");
        o("COMMIT;\n");
        return;
      }
      if (c === "help") {
        o(HELP);
        return;
      }
      e(`Error: unknown command or invalid arguments: "${c}". Enter ".help" for help
`);
      exit = 1;
    };
    let buf = "";
    function feed(text) {
      for (const line of String(text).split(/\r?\n/)) {
        if (stop) return;
        if (!buf.trim() && /^\s*\./.test(line)) {
          dot(line.trim());
          continue;
        }
        buf += line + "\n";
        if (complete(buf)) {
          runSql(buf);
          buf = "";
        }
      }
    }
    for (const c of cmds) {
      if (stop) break;
      /^\s*\./.test(c) ? dot(c.trim()) : runSql(c);
    }
    if (sqls.length) {
      for (const s of sqls) {
        if (stop) break;
        /^\s*\./.test(s) ? dot(s.trim()) : runSql(s);
      }
    } else if (stdin && stdin.trim()) {
      feed(stdin);
      if (buf.trim() && !stop) runSql(buf);
    } else if (!cmds.length) {
      e('sqlite3: no SQL given. Use: sqlite3 FILE "SQL" | sqlite3 FILE < script.sql | echo "SQL" | sqlite3 FILE\n');
      db.close();
      return { out, err, code: 1 };
    }
    const res = { out, err, code: exit };
    if (db.dirty && dbPath && dbPath !== ":memory:" && !readonly) res.dbBytes = db.export();
    db.close();
    return res;
  }
  function parseCsv(text, sep) {
    const rows = [];
    let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') {
            f += '"';
            i++;
          } else q = false;
        } else f += ch;
        continue;
      }
      if (ch === '"' && f === "") {
        q = true;
        continue;
      }
      if (ch === sep) {
        row.push(f);
        f = "";
        continue;
      }
      if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(f);
        f = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
        continue;
      }
      f += ch;
    }
    if (f !== "" || row.length) {
      row.push(f);
      rows.push(row);
    }
    return rows;
  }
  const HELP = `SQLite ${version} shell (batch mode)
usage: sqlite3 [OPTIONS] [FILE] ["SQL" ...]      (SQL can also come from stdin or < file.sql)
options: -json -csv -column -box -table -markdown -line -list -html -tabs -quote
         -header -noheader -separator SEP -nullvalue TEXT -cmd CMD -bail -readonly -version
dot commands: .tables [pat]  .schema [table]  .indexes [table]  .mode MODE  .headers on|off
              .separator SEP  .nullvalue TEXT  .import FILE TABLE [--skip=N]  .read FILE
              .dump [table]  .changes on|off  .bail on|off  .databases  .print TEXT  .quit
`;
  return { Database: Database2, Statement, SqliteError, version, complete, cli, parseCsv };
}
var SQLITE_GLUE_SRC = "var __jvSqlite = " + __jvSqlite.toString() + ";";

// src/sqlite.js
var Database = class {
  constructor(api, vfs, path, { readOnly = false } = {}) {
    this.vfs = vfs;
    this.path = path ? vfs.norm(path) : null;
    this.readOnly = readOnly;
    let bytes = null;
    if (this.path && vfs.isFile(this.path)) {
      bytes = vfs.readBytes(this.path);
      if (bytes.length && !isSqliteBytes(bytes)) throw new Error(`file is not a database: ${this.path}`);
    }
    this.db = new api.Database(bytes);
  }
  /** run one or more statements; params bind to the first. Returns [{ columns, values }] per statement with results */
  exec(sql, params) {
    return this.db.exec(sql, params ?? null);
  }
  /** rows of one query as objects */
  query(sql, params) {
    const st = this.db.prepare(sql);
    try {
      const cols = st.columns();
      return st.rows(params ?? null).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]])));
    } finally {
      st.finalize();
    }
  }
  /** first row as an object (or undefined) */
  get(sql, params) {
    return this.query(sql, params)[0];
  }
  /** a statement that changes data: { changes, lastInsertRowid } */
  run(sql, params) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params ?? null);
      while (st.step()) {
      }
    } finally {
      st.finalize();
    }
    return { changes: this.db.changes(), lastInsertRowid: this.db.lastInsertRowid() };
  }
  /** run fn inside BEGIN/COMMIT (ROLLBACK on error) */
  transaction(fn) {
    this.db.exec("BEGIN");
    try {
      const r = fn(this);
      this.db.exec("COMMIT");
      return r;
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
      }
      throw e;
    }
  }
  prepare(sql) {
    return this.db.prepare(sql);
  }
  /** the database file's bytes */
  export() {
    return this.db.export();
  }
  /** write the database back to its VFS path */
  save(path = this.path) {
    if (!path) throw new Error("this database has no path: pass one to save(path)");
    if (this.readOnly) throw new Error("the database is read-only");
    this.vfs.write(path, this.db.export());
    this.path = this.vfs.norm(path);
    return this.path;
  }
  close({ save = true } = {}) {
    if (!this.db) return;
    if (save && this.path && !this.readOnly) this.save();
    this.db.close();
    this.db = null;
  }
};
var Sqlite = class {
  constructor(vfs) {
    this.vfs = vfs;
    this._mod = null;
    this._api = null;
    this.glueSource = SQLITE_GLUE_SRC;
  }
  /** the compiled WebAssembly module (downloaded once from the kit's assets) */
  module() {
    return this._mod ||= fetchBytes(assetUrl("sqlite3.wasm"), "SQLite").then((b) => WebAssembly.compile(b)).catch((e) => {
      this._mod = null;
      throw e;
    });
  }
  async api() {
    return this._api ||= __jvSqlite(await this.module());
  }
  async version() {
    return (await this.api()).version;
  }
  /**
   * Open a database: a VFS path (created on save if missing) or ':memory:'.
   * @returns {Promise<Database>}
   */
  async open(path = ":memory:", opts = {}) {
    return new Database(await this.api(), this.vfs, path === ":memory:" ? null : path, opts);
  }
  /** the sqlite3 command-line shell in a worker: argv like the real one (sqlite3 FILE "SQL" | -json | .tables …) */
  async cli(argv, { stdin = "", cwd = "/", timeoutMs = 6e4 } = {}) {
    const vfs = this.vfs;
    let dbArg = null;
    for (let i = 0; i < argv.length; i++) {
      const a = argv[i];
      if (["-separator", "--separator", "-nullvalue", "--nullvalue", "-cmd", "--cmd"].includes(a)) {
        i++;
        continue;
      }
      if (!a.startsWith("-")) {
        dbArg = a;
        break;
      }
    }
    const dbPath = dbArg && dbArg !== ":memory:" ? vfs.norm(dbArg, cwd) : null;
    if (dbPath && vfs.isDir(dbPath)) return { stdout: "", stderr: `Error: unable to open database "${dbArg}": it is a directory
`, code: 1 };
    const dbBytes = dbPath && vfs.isFile(dbPath) ? vfs.readBytes(dbPath) : null;
    if (dbBytes && dbBytes.length && !isSqliteBytes(dbBytes)) return { stdout: "", stderr: `Error: file is not a database: ${dbArg}
`, code: 1 };
    const files = {};
    const src = [stdin, ...argv].join("\n");
    for (const m of src.matchAll(/^\s*\.(?:import|read)\s+(.+)$/gm)) for (const tok of m[1].match(/"[^"]*"|'[^']*'|\S+/g) || []) {
      const t = tok.replace(/^["']|["']$/g, "");
      if (t.startsWith("--")) continue;
      const p = vfs.norm(t, cwd);
      if (vfs.isFile(p)) files[t] = vfs.read(p);
    }
    let module;
    try {
      module = await this.module();
    } catch (e) {
      return { stdout: "", stderr: `sqlite3: could not load SQLite (${e.message})
`, code: 1 };
    }
    const r = await workerRun(SQLITE_GLUE_SRC + "\n" + SQLITE_CLI_WORKER, { module, argv, stdin, dbBytes, files }, { timeoutMs, name: "sqlite3" });
    if (r.error) return { stdout: "", stderr: `sqlite3: ${r.error}
`, code: r.timeout ? 124 : 1 };
    if (r.dbBytes && dbPath) vfs.write(dbPath, new Uint8Array(r.dbBytes));
    return { stdout: r.out || "", stderr: r.err || "", code: r.code ?? 1 };
  }
  command() {
    return async (c) => {
      const r = await this.cli(c.argv, { stdin: c.stdin, cwd: c.sh.cwd, timeoutMs: c.sh.timeoutMs });
      c.o(r.stdout);
      c.e(r.stderr);
      return r.code;
    };
  }
};

// src/bm25.js
var STOP = new Set("a an and are as at be but by for from had has have he her his i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who will with you your do does did can could would should not no yes".split(" "));
function tokenize(text, { stopWords = STOP, stem = true } = {}) {
  const out = [];
  for (let w of String(text ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 2 || stopWords?.has(w)) continue;
    if (stem && w.length > 4 && /[a-z]$/.test(w)) w = w.replace(/(ing|ed|es|s)$/, "");
    out.push(w);
  }
  return out;
}
var BM25 = class {
  /**
   * @param {Array<string|{id?: any, text: string}>} docs
   * @param {{ k1?: number, b?: number, epsilon?: number, tokenize?: (text: string) => string[] }} [o]
   */
  constructor(docs = [], { k1 = 1.5, b = 0.75, epsilon = 0.25, tokenize: tok = tokenize } = {}) {
    this.k1 = k1;
    this.b = b;
    this.epsilon = epsilon;
    this.tok = tok;
    this.docs = [];
    this.add(docs);
  }
  /** add documents and rebuild the index */
  add(docs) {
    for (const d of docs) {
      const id = this.docs.length;
      this.docs.push(typeof d === "string" ? { id, text: d } : { ...d, id: d.id ?? id });
    }
    this._build();
    return this;
  }
  _build() {
    const corpus = this.docs.map((d) => this.tok(d.text ?? ""));
    this.N = corpus.length;
    this.tf = corpus.map((doc) => {
      const m = /* @__PURE__ */ new Map();
      for (const t of doc) m.set(t, (m.get(t) || 0) + 1);
      return m;
    });
    this.len = corpus.map((d) => d.length);
    this.avgdl = this.N ? this.len.reduce((a, c) => a + c, 0) / this.N : 0;
    const nd = /* @__PURE__ */ new Map();
    for (const m of this.tf) for (const t of m.keys()) nd.set(t, (nd.get(t) || 0) + 1);
    this.idf = /* @__PURE__ */ new Map();
    let sum = 0;
    const neg = [];
    for (const [t, n] of nd) {
      const v = Math.log((this.N - n + 0.5) / (n + 0.5));
      this.idf.set(t, v);
      sum += v;
      if (v < 0) neg.push(t);
    }
    const floor = Math.max(this.epsilon * (nd.size ? sum / nd.size : 0), 0.01);
    for (const t of neg) this.idf.set(t, floor);
  }
  /** a score per document, in insertion order */
  scores(query) {
    const q = Array.isArray(query) ? query : this.tok(query);
    const sc = new Array(this.N).fill(0);
    for (const t of new Set(q)) {
      const idf = this.idf.get(t);
      if (idf === void 0) continue;
      for (let i = 0; i < this.N; i++) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        sc[i] += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / (this.avgdl || 1)));
      }
    }
    return sc;
  }
  /** the best matches, highest score first: [{ id, text, score, ...yourFields }] */
  search(query, { limit = 10, minScore = 0 } = {}) {
    const sc = this.scores(query);
    return sc.map((s, i) => ({ ...this.docs[i], score: s })).filter((d) => d.score > minScore).sort((a, b) => b.score - a.score).slice(0, limit);
  }
};
var bm25Search = (docs, query, opts = {}) => new BM25(docs, opts).search(query, opts);
function searchFiles(vfs, query, { root = "/", limit = 10, maxBytes = 1e6, include = /\.(md|txt|js|mjs|ts|py|json|html|css|csv|toml|ya?ml|xml|sh|sql)$/i } = {}) {
  const docs = [];
  for (const p of vfs.walk(root)) {
    if (!vfs.isFile(p) || !include.test(p)) continue;
    const b = vfs.readBytes(p);
    if (b.length > maxBytes) continue;
    docs.push({ id: p, path: p, text: p + "\n" + new TextDecoder().decode(b) });
  }
  const terms = tokenize(query);
  return new BM25(docs).search(query, { limit }).map(({ path, text, score }) => {
    const lines = text.split("\n");
    const i = Math.max(0, lines.findIndex((l, k) => k > 0 && terms.some((t) => l.toLowerCase().includes(t))));
    return { path, score: +score.toFixed(4), line: i || null, snippet: lines.slice(i || 1, (i || 1) + 3).join("\n").slice(0, 300) };
  });
}

// src/ml.js
var VERSIONS = { tfjs: "4.22.0", onnxruntime: "1.31.1", litert: "2.5.3" };
function gpuShim(g = globalThis.navigator?.gpu) {
  if (!g || g.__jak || typeof g.requestAdapter !== "function") return;
  const req = g.requestAdapter.bind(g);
  g.requestAdapter = async (o) => {
    let a = null;
    try {
      a = await req(o);
    } catch {
    }
    if (!a && !(o && o.featureLevel)) {
      try {
        a = await req({ ...o || {}, featureLevel: "compatibility" });
      } catch {
      }
    }
    if (a && !a.__jak && a.features?.has?.("core-features-and-limits")) {
      const rd = a.requestDevice.bind(a);
      a.requestDevice = (d = {}) => rd({ ...d, requiredFeatures: [.../* @__PURE__ */ new Set([...d.requiredFeatures || [], "core-features-and-limits"])] });
      a.__jak = true;
    }
    return a;
  };
  g.__jak = true;
}
var TA = { float32: Float32Array, int32: Int32Array, uint8: Uint8Array, int8: Int8Array, float64: Float64Array, int16: Int16Array, uint16: Uint16Array };
var flat = (x, out = []) => {
  if (Array.isArray(x)) for (const v of x) flat(v, out);
  else out.push(+x);
  return out;
};
var shapeOf = (x) => {
  const s = [];
  while (Array.isArray(x)) {
    s.push(x.length);
    x = x[0];
  }
  return s;
};
var ML = class {
  constructor({ vfs, cdn = "https://cdn.jsdelivr.net/npm/" }) {
    this.vfs = vfs;
    this.cdn = cdn;
    this._tf = null;
    this._tfSrc = null;
    this._ort = null;
    this._lrt = null;
    try {
      gpuShim();
    } catch {
    }
  }
  url(pkg, ver, path) {
    return `${this.cdn}${pkg}@${ver}/${path}`;
  }
  // a model from a VFS path, a URL or bytes
  async bytes(src) {
    if (src instanceof Uint8Array) return src;
    if (src instanceof ArrayBuffer) return new Uint8Array(src);
    const s = String(src || "");
    if (/^(https?:|blob:|data:)/i.test(s)) return fetchBytes(s, s);
    if (!this.vfs.isFile(s)) throw new Error(`${s} is not a file`);
    return this.vfs.readBytes(s);
  }
  // { data, shape, dtype } | nested arrays | a typed array → [typedArray, shape, dtype]
  tensorInput(x, dtype = "float32") {
    if (x && !Array.isArray(x) && !ArrayBuffer.isView(x) && typeof x === "object") {
      dtype = x.dtype || dtype;
      const d = x.data;
      const arr = ArrayBuffer.isView(d) ? d : (TA[dtype] || Float32Array).from(flat(d));
      return [arr, x.shape || (Array.isArray(d) ? shapeOf(d) : [arr.length]), dtype];
    }
    if (ArrayBuffer.isView(x)) return [x, [x.length], dtype];
    return [(TA[dtype] || Float32Array).from(flat(x)), shapeOf(x), dtype];
  }
  /* ---------- TensorFlow.js ---------- */
  /** TensorFlow.js on this page (window.tf), with the fastest backend that works */
  async tf({ backend } = {}) {
    return this._tf ||= (async () => {
      const tf = await loadScript(this.url("@tensorflow/tfjs", VERSIONS.tfjs, "dist/tf.min.js"), "tf");
      try {
        await loadScript(this.url("@tensorflow/tfjs-backend-webgpu", VERSIONS.tfjs, "dist/tf-backend-webgpu.min.js"));
      } catch {
      }
      const works = async (b) => {
        try {
          if (!tf.findBackendFactory(b) || !await tf.setBackend(b)) return false;
          await tf.ready();
          const v = await tf.tensor([1, 2]).add(1).data();
          return v[0] === 2;
        } catch {
          return false;
        }
      };
      for (const b of backend ? [backend] : ["webgpu", "webgl", "cpu"]) if (await works(b)) break;
      return tf;
    })().catch((e) => {
      this._tf = null;
      throw e;
    });
  }
  /** TensorFlow.js as source text (for scripts in a worker) */
  tfjsSource() {
    return this._tfSrc ||= fetchText(this.url("@tensorflow/tfjs", VERSIONS.tfjs, "dist/tf.min.js"), "TensorFlow.js").catch((e) => {
      this._tfSrc = null;
      throw e;
    });
  }
  /* ---------- ONNX Runtime Web ---------- */
  ort() {
    return this._ort ||= (async () => {
      const base = this.url("onnxruntime-web", VERSIONS.onnxruntime, "dist/");
      const ort = await loadScript(base + "ort.webgpu.min.js", "ort");
      if (!ort?.InferenceSession) throw new Error("ONNX Runtime did not load");
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      ort.env.wasm.wasmPaths = base;
      ort.env.logLevel = "error";
      return ort;
    })().catch((e) => {
      this._ort = null;
      throw e;
    });
  }
  /**
   * Load an .onnx model (VFS path, URL or bytes).
   * @returns {Promise<{ accelerator: string, inputs: object[], outputs: object[], run: (inputs: object|any[]) => Promise<object>, release: () => Promise<void> }>}
   */
  async onnx(src, { accelerator } = {}) {
    const self = this;
    const ort = await this.ort();
    const bytes = await this.bytes(src);
    let acc = accelerator || (await this.webgpu() ? "webgpu" : "wasm"), note;
    const make = (ac) => ort.InferenceSession.create(bytes, { executionProviders: ac === "webgpu" ? ["webgpu", "wasm"] : ["wasm"], graphOptimizationLevel: "all" });
    let s;
    try {
      s = await make(acc);
    } catch (e) {
      if (acc === "wasm") throw e;
      note = `${acc} failed (${e.message}); using wasm`;
      acc = "wasm";
      s = await make("wasm");
    }
    const meta = (which) => s[which + "Names"].map((n, i) => {
      const md = s[which + "Metadata"];
      const m = Array.isArray(md) ? md[i] : md?.[n];
      return { name: n, shape: (m?.shape || []).map((d) => typeof d === "number" ? d : -1), dtype: m?.type || "float32" };
    });
    const inputs = meta("input"), outputs = meta("output");
    return {
      accelerator: acc,
      note,
      inputs,
      outputs,
      session: s,
      /** inputs: an object by input name, or an array in order; each { data, shape?, dtype? } or nested arrays. Returns { name: { data, shape, dtype } } */
      async run(given) {
        const list = Array.isArray(given) ? given : inputs.map((d) => given[d.name] ?? (inputs.length === 1 ? given : void 0));
        const feeds = {};
        inputs.forEach((d, i) => {
          if (list[i] == null) throw new Error(`no data for input ${d.name}`);
          let [arr, shape, dtype] = self.tensorInput(list[i], list[i]?.dtype || d.dtype);
          if (!list[i]?.shape && d.shape.length && shape.length !== d.shape.length && d.shape.filter((x) => x < 0).length === 1) {
            const fixed = d.shape.filter((x) => x > 0).reduce((p, q) => p * q, 1);
            if (arr.length % fixed) throw new Error(`input ${d.name} needs a multiple of ${fixed} values (shape ${JSON.stringify(d.shape)}), got ${arr.length}`);
            shape = d.shape.map((x) => x < 0 ? arr.length / fixed : x);
          }
          if (dtype === "int64") arr = BigInt64Array.from(arr, (x) => BigInt(Math.round(Number(x))));
          else if (dtype === "bool") arr = Uint8Array.from(arr, (x) => x ? 1 : 0);
          feeds[d.name] = new ort.Tensor(dtype, arr, list[i]?.shape || shape);
        });
        const outs = await s.run(feeds);
        const res = {};
        for (const n of s.outputNames) {
          const t = outs[n];
          const raw = t.location && t.location !== "cpu" ? await t.getData() : t.data;
          res[n] = { data: raw, shape: [...t.dims], dtype: t.type };
        }
        return res;
      },
      release: () => s.release()
    };
  }
  /* ---------- LiteRT.js (.tflite) ---------- */
  litert() {
    return this._lrt ||= (async () => {
      const L = await import(
        /* @vite-ignore */
        this.url("@litertjs/core", VERSIONS.litert, "+esm")
      );
      await L.loadLiteRt(this.url("@litertjs/core", VERSIONS.litert, "wasm/"));
      return L;
    })().catch((e) => {
      this._lrt = null;
      throw e;
    });
  }
  /**
   * Load a .tflite model (VFS path, URL or bytes).
   * @returns {Promise<{ accelerator: string, inputs: object[], outputs: object[], run: (inputs: any[]) => Promise<object[]>, delete: () => void }>}
   */
  async tflite(src, { accelerator } = {}) {
    const self = this;
    const L = await this.litert();
    const bytes = await this.bytes(src);
    let gpu = false;
    try {
      gpu = !!await L.isWebGPUSupported?.();
    } catch {
    }
    let acc = accelerator || (gpu ? "webgpu" : "wasm"), note, model;
    try {
      model = await L.loadAndCompile(bytes, { accelerator: acc });
    } catch (e) {
      if (acc === "wasm") throw e;
      note = `${acc} failed (${e.message}); using wasm`;
      acc = "wasm";
      model = await L.loadAndCompile(bytes, { accelerator: "wasm" });
    }
    const dims = (d) => [...d?.shape || d?.layout?.dimensions || d?.dimensions || []];
    const det = (ds) => [...ds].map((d, i) => ({ index: i, name: d.name, shape: dims(d), dtype: d.dtype || d.type?.dtype }));
    const inputs = det(model.getInputDetails()), outputs = det(model.getOutputDetails());
    return {
      accelerator: acc,
      note,
      inputs,
      outputs,
      model,
      /** inputs: one per model input ({ data, shape?, dtype? }, nested arrays or a typed array). Returns [{ data, shape }] */
      async run(given) {
        const list = Array.isArray(given) && inputs.length > 1 ? given : Array.isArray(given) && (Array.isArray(given[0]) || ArrayBuffer.isView(given[0]) || given[0]?.data) ? given : [given];
        const ts = inputs.map((d, i) => {
          const [arr, shape] = self.tensorInput(list[i], d.dtype || "float32");
          return new L.Tensor(arr, list[i]?.shape || (d.shape.length ? d.shape : shape));
        });
        let outs;
        try {
          outs = await model.run(ts);
        } finally {
          ts.forEach((t) => {
            try {
              t.delete();
            } catch {
            }
          });
        }
        const res = [];
        for (const [i, t0] of (Array.isArray(outs) ? outs : Object.values(outs)).entries()) {
          let t = t0;
          if (acc !== "wasm") {
            try {
              const c = await t.moveTo("wasm");
              if (c && c !== t) t = c;
            } catch {
            }
          }
          res.push({ name: outputs[i]?.name, data: t.toTypedArray(), shape: [...t.type?.layout?.dimensions || outputs[i]?.shape || []] });
          try {
            t.delete();
          } catch {
          }
        }
        return res;
      },
      delete: () => model.delete()
    };
  }
  async webgpu() {
    if (this._gpu == null) {
      try {
        this._gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter());
      } catch {
        this._gpu = false;
      }
    }
    return this._gpu;
  }
};

// src/internal/xdc_core.js
async function unzip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 101010256) {
    eocd = i;
    break;
  }
  if (eocd < 0) throw new Error("not a zip file (.xdc files are zip archives)");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = {};
  const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 33639248) throw new Error("broken zip directory");
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name.endsWith("/")) continue;
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u8.subarray(ds, ds + csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else throw new Error(`unsupported zip compression (${method}) for ${name}`);
    out[name.replace(/^\.?\//, "")] = data;
  }
  return out;
}
function parseToml(t) {
  const o = {};
  for (const line of String(t || "").split(/\r?\n/)) {
    const m = /^\s*([\w.-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'([^']*)'|([\w.+-]+))\s*(?:#.*)?$/.exec(line);
    if (m) o[m[1]] = m[2] != null ? m[2].replace(/\\"/g, '"').replace(/\\\\/g, "\\") : m[3] != null ? m[3] : /^-?\d+(\.\d+)?$/.test(m[4]) ? +m[4] : m[4] === "true" ? true : m[4] === "false" ? false : m[4];
    else if (/^\s*\[/.test(line)) break;
  }
  return o;
}
var XMIME = { html: "text/html", htm: "text/html", js: "text/javascript", mjs: "text/javascript", css: "text/css", json: "application/json", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", ico: "image/x-icon", mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", m4a: "audio/mp4", mp4: "video/mp4", webm: "video/webm", woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf", wasm: "application/wasm", txt: "text/plain", md: "text/markdown", xml: "application/xml", csv: "text/csv", toml: "text/plain" };
var xmime = (p) => XMIME[(p.split(".").pop() || "").toLowerCase()] || "application/octet-stream";
function xdcResolve(base, ref) {
  let r = String(ref || "").trim();
  if (!r || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(r)) return null;
  r = r.split("#")[0].split("?")[0];
  try {
    r = decodeURIComponent(r);
  } catch {
  }
  const parts = r.startsWith("/") ? [] : base.split("/").slice(0, -1);
  for (const s of r.split("/")) {
    if (!s || s === ".") continue;
    if (s === "..") parts.pop();
    else parts.push(s);
  }
  return parts.join("/");
}
function xdcPage(app, self) {
  const F = app.files;
  const dataUrl = (p) => `data:${xmime(p)};base64,${b64enc(F[p])}`;
  const memo = /* @__PURE__ */ new Map();
  const css = (text, from) => text.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?/g, (m, q, ref) => {
    const p = xdcResolve(from, ref);
    return p && F[p] ? `@import url("data:text/css;base64,${b64enc(new TextEncoder().encode(css(dec.decode(F[p]), p)))}")` : m;
  }).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => {
    const p = xdcResolve(from, ref);
    return p && F[p] ? `url("${dataUrl(p)}")` : m;
  });
  const modUrl = (p, stack = []) => {
    if (memo.has(p)) return memo.get(p);
    if (stack.includes(p)) return null;
    const src = js(dec.decode(F[p]), p, [...stack, p]);
    const u = `data:text/javascript;base64,${b64enc(new TextEncoder().encode(src))}`;
    memo.set(p, u);
    return u;
  };
  const js = (text, from, stack = []) => text.replace(/(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g, (m, pre, q, ref) => {
    const p = xdcResolve(from, ref);
    if (!p || !F[p]) return m;
    if (/\.(js|mjs)$/i.test(p)) {
      const u = modUrl(p, stack);
      return u ? pre + q + u + q : m;
    }
    return pre + q + dataUrl(p) + q;
  }).replace(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g, (m, q, ref) => {
    const p = xdcResolve(from, ref);
    if (!p || !F[p]) return m;
    const u = /\.(js|mjs)$/i.test(p) ? modUrl(p, stack) : dataUrl(p);
    return u ? `import(${q}${u}${q})` : m;
  }).replace(/new\s+URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g, (m, q, ref) => {
    const p = xdcResolve(from, ref);
    return p && F[p] ? `new URL(${q}${dataUrl(p)}${q})` : m;
  });
  const doc = new DOMParser().parseFromString(dec.decode(F["index.html"]), "text/html");
  for (const s of [...doc.querySelectorAll("script")]) {
    const isMod = (s.getAttribute("type") || "").toLowerCase() === "module";
    const ref = s.getAttribute("src");
    if (ref) {
      const p = xdcResolve("index.html", ref);
      if (!p || !F[p]) {
        if (/webxdc\.js$/.test(ref)) s.remove();
        continue;
      }
      s.removeAttribute("src");
      s.textContent = isMod ? js(dec.decode(F[p]), p, [p]) : dec.decode(F[p]);
    } else if (isMod) s.textContent = js(s.textContent, "index.html");
  }
  for (const l of [...doc.querySelectorAll("link[href]")]) {
    const rel = (l.getAttribute("rel") || "").toLowerCase();
    const p = xdcResolve("index.html", l.getAttribute("href"));
    if (!p || !F[p]) continue;
    if (rel.includes("stylesheet")) {
      const st = doc.createElement("style");
      st.textContent = css(dec.decode(F[p]), p);
      l.replaceWith(st);
    } else if (rel === "modulepreload") l.remove();
    else l.setAttribute("href", dataUrl(p));
  }
  for (const st of doc.querySelectorAll("style")) st.textContent = css(st.textContent, "index.html");
  for (const el of doc.querySelectorAll("[style]")) el.setAttribute("style", css(el.getAttribute("style"), "index.html"));
  for (const el of doc.querySelectorAll("img[src],audio[src],video[src],source[src],input[src],embed[src],track[src],image[href],use[href]")) {
    const a = el.hasAttribute("src") ? "src" : "href";
    const p = xdcResolve("index.html", el.getAttribute(a));
    if (p && F[p]) el.setAttribute(a, dataUrl(p));
  }
  const assets = {};
  let budget = 12 * 1048576;
  for (const [p, d] of Object.entries(F)) {
    if (p === "index.html") continue;
    if (d.length > budget) continue;
    budget -= d.length;
    assets[p] = dataUrl(p);
  }
  const boot = doc.createElement("script");
  boot.textContent = xdcBootSrc({ app, assets, files: Object.keys(F), self });
  const meta = doc.createElement("meta");
  meta.setAttribute("http-equiv", "Content-Security-Policy");
  meta.setAttribute("content", "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:");
  const head = doc.head || doc.documentElement.insertBefore(doc.createElement("head"), doc.body);
  head.prepend(meta, boot);
  return "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
}
function xdcBootSrc({ app, assets, files, self }) {
  const cfg = { addr: self.addr, name: self.name, ls: app.ls || {}, assets, files, android: !!self.android };
  return `(() => {
const CFG = ${JSON.stringify(cfg).replace(/<\//g, "<\\/")};
const P = window.parent; let seq = 0; const waits = new Map(); let listener = null; const ready = [];
const post = (m) => P.postMessage(Object.assign({ __xdc: 1 }, m), '*');
const call = (t, data) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); post({ t, id, data }); });
window.addEventListener('message', (e) => {
  if (e.source !== P || !e.data || !e.data.__xdc) return; const m = e.data;
  if (m.t === 'update') { try { listener && listener(m.update); } catch (err) { console.error(err); } }
  else if (m.t === 'listen-done') { ready.splice(0).forEach(r => r()); }
  else if (m.t === 'reply') { const w = waits.get(m.id); if (w) { waits.delete(m.id); m.error ? w.rej(new Error(m.error)) : w.res(m.data); } }
  else if (m.t === 'realtime') { rtL && rtL(new Uint8Array(m.data)); }
});
let rtL = null;
const local = (u) => { if (typeof u !== 'string') u = String(u && u.url || u); if (/^(data|blob|javascript):/i.test(u)) return null; let s = u.replace(/^about:srcdoc/, '').replace(/^https?:\\/\\/[^/]*\\.localhost\\//, '').split('#')[0].split('?')[0]; if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; s = s.replace(/^\\.?\\//, ''); try { s = decodeURIComponent(s); } catch (e) {} return CFG.files.includes(s) ? s : null; };
window.webxdc = {
  selfAddr: CFG.addr, selfName: CFG.name, sendUpdateInterval: 1000, sendUpdateMaxSize: 128000,
  setUpdateListener(cb, serial) { listener = cb; const p = new Promise(r => ready.push(r)); post({ t: 'listen', serial: serial || 0 }); return p; },
  sendUpdate(update, descr) { post({ t: 'send', update: JSON.parse(JSON.stringify(update)), descr }); },
  getAllUpdates() { return call('all'); },
  async sendToChat(msg) {
    const out = { text: msg && msg.text || '' };
    if (msg && msg.file) { const f = msg.file; let b64 = f.base64; if (!b64 && f.plainText != null) b64 = btoa(unescape(encodeURIComponent(f.plainText))); if (!b64 && f.blob) { const u = new Uint8Array(await f.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); b64 = btoa(s); } out.file = { name: f.name || 'file', base64: b64, type: f.type || (f.blob && f.blob.type) || '' }; }
    return call('chat', out);
  },
  importFiles(filter) { return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; const f = filter || {}; i.multiple = !!f.multiple; const acc = [...(f.mimeTypes || []), ...(f.extensions || [])]; if (acc.length && !(CFG.android && !(f.mimeTypes || []).length)) i.accept = acc.join(','); i.style.display = 'none'; i.onchange = () => { res([...i.files]); i.remove(); }; document.body.appendChild(i); i.click(); }); },
  joinRealtimeChannel() { post({ t: 'rt-join' }); return { setListener(f) { rtL = f; }, send(data) { post({ t: 'rt-send', data: Array.from(data || []) }); }, leave() { rtL = null; post({ t: 'rt-leave' }); } }; },
};
// storage: the frame has no origin of its own, so localStorage is kept by the app host
const mkStore = (init, persist) => { const d = Object.assign({}, init); let t = 0; const save = () => { if (!persist) return; clearTimeout(t); t = setTimeout(() => post({ t: 'ls', data: d }), 200); };
  const s = { getItem: k => Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null, setItem: (k, v) => { d[k] = String(v); save(); }, removeItem: k => { delete d[k]; save(); }, clear: () => { for (const k in d) delete d[k]; save(); }, key: i => Object.keys(d)[i] ?? null, get length() { return Object.keys(d).length; } };
  return new Proxy(s, { get: (o, k) => k in o ? o[k] : (typeof k === 'string' ? s.getItem(k) : undefined), set: (o, k, v) => { s.setItem(k, v); return true; }, deleteProperty: (o, k) => { s.removeItem(k); return true; }, ownKeys: () => Object.keys(d), getOwnPropertyDescriptor: (o, k) => Object.prototype.hasOwnProperty.call(d, k) ? { value: d[k], enumerable: true, configurable: true } : undefined }); };
try { Object.defineProperty(window, 'localStorage', { value: mkStore(CFG.ls, true), configurable: true }); } catch (e) {}
try { Object.defineProperty(window, 'sessionStorage', { value: mkStore({}, false), configurable: true }); } catch (e) {}
// local files for fetch / XHR / src setters
const asset = (u) => { const p = local(u); return p ? (CFG.assets[p] || null) : null; };
const f0 = window.fetch && window.fetch.bind(window);
window.fetch = async (input, init) => { const p = local(input); if (p) { if (CFG.assets[p]) return f0(CFG.assets[p]); const r = await call('file', p); return new Response(new Uint8Array(r.bytes), { status: 200, headers: { 'Content-Type': r.type } }); } const u = String(input && input.url || input); if (/^(data|blob):/i.test(u)) return f0(input, init); throw new TypeError('webxdc apps have no internet access'); };
const xo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...rest) { const a = asset(u); return xo.call(this, m, a || u, ...rest); };
for (const C of [HTMLImageElement, HTMLMediaElement, HTMLSourceElement, HTMLScriptElement]) { const d = Object.getOwnPropertyDescriptor(C.prototype, 'src'); if (d && d.set) Object.defineProperty(C.prototype, 'src', { get: d.get, set(v) { const a = asset(v); d.set.call(this, a || v); }, configurable: true }); }
const sa = Element.prototype.setAttribute; Element.prototype.setAttribute = function (k, v) { if ((k === 'src' || k === 'href') && typeof v === 'string') { const a = asset(v); if (a) v = a; } return sa.call(this, k, v); };
const A0 = window.Audio; if (A0) window.Audio = function (u) { return new A0(u ? (asset(u) || u) : u); };
window.open = (u) => { post({ t: 'open', url: String(u || '') }); return null; };
})();`;
}
function zipStore(files) {
  const enc_ = new TextEncoder();
  const parts = [], cd = [];
  let off = 0;
  const crcT = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  const crc = (u) => {
    let c = 4294967295;
    for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  };
  for (const [name, data] of Object.entries(files)) {
    const nb = enc_.encode(name), c = crc(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 67324752, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 2048, true);
    lh.setUint32(14, c, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 33639248, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 2048, true);
    ch.setUint32(16, c, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nb.length, true);
    ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cdLen = cd.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 101010256, true);
  e.setUint16(8, Object.keys(files).length, true);
  e.setUint16(10, Object.keys(files).length, true);
  e.setUint32(12, cdLen, true);
  e.setUint32(16, off, true);
  const all = [...parts, ...cd, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const p of all) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

// src/webxdc.js
var Webxdc = class {
  constructor({ vfs, persist = false }) {
    this.vfs = vfs;
    this.store = persist ? idbStore("jade-agent-kit-xdc:" + persist) : null;
    this.apps = /* @__PURE__ */ new Map();
    this.sessions = /* @__PURE__ */ new Set();
    this.listeners = /* @__PURE__ */ new Set();
    this._q = /* @__PURE__ */ new Map();
  }
  /** install an app from a .xdc file (VFS path, URL or bytes), a VFS folder, or an object of files */
  async load(src, { name: fallback = "App" } = {}) {
    let files;
    if (src instanceof Uint8Array || src instanceof ArrayBuffer) files = await unzip(src);
    else if (src && typeof src === "object") files = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, typeof v === "string" ? new TextEncoder().encode(v) : v]));
    else {
      const s = String(src);
      if (/^(https?:|blob:|data:)/i.test(s)) files = await unzip(await fetchBytes(s));
      else if (this.vfs.isDir(s)) {
        const pre = this.vfs.norm(s).replace(/\/$/, "") + "/";
        files = {};
        for (const [p, n] of this.vfs.nodes) if (!n.dir && p.startsWith(pre)) files[p.slice(pre.length)] = n.data;
        fallback = this.vfs.base(this.vfs.norm(s));
      } else if (this.vfs.isFile(s)) {
        files = await unzip(this.vfs.readBytes(s));
        fallback = this.vfs.base(this.vfs.norm(s)).replace(/\.xdc$/i, "");
      } else throw new Error(`${s}: not a file, folder or URL`);
    }
    if (!files["index.html"]) {
      const roots = new Set(Object.keys(files).map((k) => k.split("/")[0]));
      if (roots.size === 1) {
        const r = [...roots][0] + "/";
        if (files[r + "index.html"]) files = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.slice(r.length), v]));
      }
    }
    if (!files["index.html"]) throw new Error("this is not a webxdc app: index.html is missing");
    const manifest = files["manifest.toml"] ? parseToml(dec.decode(files["manifest.toml"])) : {};
    let name = String(manifest.name || "").trim();
    if (!name) {
      const m = /<title>([^<]{1,60})<\/title>/i.exec(dec.decode(files["index.html"]));
      name = m && m[1].trim() || fallback;
    }
    const iconP = ["icon.png", "icon.jpg", "icon.jpeg", "icon.svg", "icon.webp"].find((k) => files[k]);
    const id = "xdc-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
    const saved = this.store ? await this.store.get(id) : null;
    const app = { id, name, manifest, files, icon: iconP ? `data:${xmime(iconP)};base64,${b64enc(files[iconP])}` : null, size: Object.values(files).reduce((a, b) => a + b.length, 0), updates: saved?.updates || [], ls: saved?.ls || {}, summary: saved?.summary || "", document: saved?.document || "" };
    this.apps.set(id, app);
    return app;
  }
  get(idOrName) {
    if (typeof idOrName === "object") return idOrName;
    const s = String(idOrName).toLowerCase();
    return this.apps.get(idOrName) || [...this.apps.values()].find((a) => a.name.toLowerCase() === s) || null;
  }
  list() {
    return [...this.apps.values()].map(({ id, name, size, summary, document: document2, updates }) => ({ id, name, size, summary, document: document2, updates: updates.length }));
  }
  /** every update an app has, as the app sees them */
  updates(app, after = 0) {
    app = this.get(app);
    return app.updates.filter((u) => u.serial > after).map((u) => this._public(u, app.updates.length));
  }
  /** watch every update of every app: fn(app, update) */
  onUpdate(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  _public(u, max) {
    const o = { payload: u.payload, serial: u.serial, max_serial: max, sender: u.sender, timestamp: u.ts };
    for (const k of ["info", "document", "summary", "href"]) if (u[k] != null) o[k] = u[k];
    return o;
  }
  async _save(app) {
    if (this.store) await this.store.set(app.id, { updates: app.updates, ls: app.ls, summary: app.summary, document: app.document });
  }
  /** send an update to an app as `who` ({ addr, name }); every open frame of the app receives it */
  send(app, update, who = { addr: "agent@kit", name: "Agent" }) {
    app = this.get(app);
    if (!app) return Promise.reject(new Error("no such app"));
    const run = (this._q.get(app.id) || Promise.resolve()).then(async () => {
      if (!update || typeof update !== "object" || !("payload" in update)) throw new Error("an update needs a payload");
      const json = JSON.stringify(update.payload);
      if (json === void 0) throw new Error("payload must be JSON");
      if (json.length > 128e3) throw new Error("update payload is over 128 KB");
      const u = { serial: app.updates.length + 1, payload: JSON.parse(json), sender: who.addr, senderName: who.name, ts: Date.now() };
      for (const k of ["info", "document", "summary", "href", "notify"]) if (update[k] != null) u[k] = update[k];
      app.updates.push(u);
      if (u.summary != null) app.summary = String(u.summary);
      if (u.document != null) app.document = String(u.document);
      await this._save(app);
      for (const s of this.sessions) if (s.app === app) s._deliver([u]);
      for (const f of this.listeners) {
        try {
          f(app, this._public(u, app.updates.length));
        } catch {
        }
      }
      return this._public(u, app.updates.length);
    });
    this._q.set(app.id, run.catch(() => {
    }));
    return run;
  }
  /**
   * Open an app in an iframe inside `container`.
   * @param {{ container: HTMLElement, self?: { addr: string, name: string }, onSendToChat?: (msg) => void, onOpen?: (url) => void }} o
   */
  open(appRef, { container, self = { addr: "user@kit", name: "You" }, onSendToChat = null, onOpen = null } = {}) {
    const app = this.get(appRef);
    if (!app) throw new Error("no such app");
    if (!container) throw new Error("container is required");
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-modals allow-downloads");
    frame.setAttribute("allow", "autoplay; fullscreen");
    frame.title = app.name;
    frame.style.cssText = "border:0;width:100%;height:100%;display:block;background:#fff";
    const host = this;
    const sess = {
      app,
      frame,
      listening: false,
      lastSent: 0,
      post: (m) => frame.contentWindow?.postMessage(Object.assign({ __xdc: 1 }, m), "*"),
      _deliver(ups) {
        if (!this.listening) return;
        const max = app.updates.length;
        for (const u of ups) if (u.serial > this.lastSent) {
          this.post({ t: "update", update: host._public(u, max) });
          this.lastSent = u.serial;
        }
      },
      /** send an update into the app as another peer (the agent by default) */
      send: (update, who) => host.send(app, update, who),
      reload: () => {
        sess.listening = false;
        sess.lastSent = 0;
        frame.srcdoc = xdcPage(app, self);
      },
      close: () => {
        window.removeEventListener("message", onMsg);
        frame.remove();
        host.sessions.delete(sess);
      }
    };
    const onMsg = async (e) => {
      if (e.source !== frame.contentWindow || !e.data?.__xdc) return;
      const m = e.data;
      const reply = (data, error) => sess.post({ t: "reply", id: m.id, data, error });
      try {
        if (m.t === "listen") {
          sess.listening = true;
          sess.lastSent = +m.serial || 0;
          sess._deliver(app.updates);
          sess.post({ t: "listen-done" });
        } else if (m.t === "send") await host.send(app, m.update, self);
        else if (m.t === "all") reply(app.updates.map((u) => host._public(u, app.updates.length)));
        else if (m.t === "ls") {
          app.ls = m.data || {};
          await host._save(app);
        } else if (m.t === "file") {
          const d = app.files[m.data];
          if (!d) reply(null, "not found: " + m.data);
          else reply({ bytes: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), type: xmime(m.data) });
        } else if (m.t === "chat") {
          onSendToChat?.(m.data);
          reply(null);
        } else if (m.t === "open") {
          if (onOpen) onOpen(m.url);
          else if (/^https?:/i.test(m.url)) window.open(m.url, "_blank", "noopener");
        }
      } catch (err) {
        if (m.id) reply(null, String(err.message || err));
      }
    };
    window.addEventListener("message", onMsg);
    container.appendChild(frame);
    this.sessions.add(sess);
    sess.reload();
    return sess;
  }
  /** the app's files as a .xdc (zip) */
  pack(app) {
    return zipStore(this.get(app).files);
  }
  /** forget an app's updates and storage */
  async reset(app) {
    app = this.get(app);
    app.updates = [];
    app.ls = {};
    app.summary = "";
    app.document = "";
    await this._save(app);
  }
};

// src/ollama.js
var OLLAMA_CLOUD = "https://ollama.com";
var OLLAMA_LOCAL = "http://localhost:11434";
var Ollama = class {
  /** @param {{ host?: string, apiKey?: string }} o */
  constructor({ host = OLLAMA_LOCAL, apiKey = "" } = {}) {
    this.host = String(host).replace(/\/+$/, "");
    this.apiKey = apiKey;
  }
  get cloud() {
    return /^https:\/\/(www\.)?ollama\.com$/i.test(this.host);
  }
  get name() {
    return this.cloud ? "Ollama Cloud" : `Ollama at ${this.host}`;
  }
  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.apiKey) h.Authorization = "Bearer " + this.apiKey;
    return h;
  }
  async _err(r) {
    let m = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      m = j.error || m;
    } catch {
    }
    if (r.status === 401) m = this.cloud ? "the Ollama API key was rejected (401). Create one at https://ollama.com/settings/keys" : `${this.name} refused the request (401)`;
    else if (r.status === 404 && /model/i.test(m)) m += this.cloud ? "" : " (pull it first: ollama pull <model>)";
    else if (r.status === 402 || r.status === 429) m += " (usage limit)";
    return new Error(`${this.name}: ${m}`);
  }
  async _fetch(path, init = {}) {
    if (this.cloud && !this.apiKey) throw new Error("no Ollama Cloud API key: createKit({ ollamaKey }) or kit.ollama.apiKey = \u2026");
    let r;
    try {
      r = await fetch(this.host + path, { ...init, headers: { ...this.headers, ...init.headers || {} } });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      throw new Error(this.cloud ? `could not reach Ollama Cloud (${e.message})` : `could not reach ${this.name}. Is "ollama serve" running? If it is, the browser blocked the request: start it with OLLAMA_ORIGINS set to this page's origin (or "*").`);
    }
    if (!r.ok) throw await this._err(r);
    return r;
  }
  _post(path, body, signal) {
    return this._fetch(path, { method: "POST", body: JSON.stringify(body), signal });
  }
  /** the models available here */
  async models() {
    const r = await this._fetch("/api/tags");
    return ((await r.json()).models || []).map((m) => m.name || m.model).filter(Boolean);
  }
  /**
   * Embeddings: POST /api/embed. Returns one vector per input (L2-normalized by Ollama).
   * @param {string|string[]} input @param {{ model?: string, dimensions?: number, truncate?: boolean, signal?: AbortSignal }} [o]
   */
  async embed(input, { model = "embeddinggemma", dimensions, truncate = true, signal } = {}) {
    const one = !Array.isArray(input);
    const list = (one ? [input] : input).map(String);
    if (!list.length) return [];
    const out = [];
    for (let i = 0; i < list.length; i += 64) {
      const r = await this._post("/api/embed", { model, input: list.slice(i, i + 64), truncate, ...dimensions ? { dimensions } : {} }, signal);
      out.push(...(await r.json()).embeddings || []);
    }
    return one ? out[0] : out;
  }
  /** Ollama Cloud web search: { results: [{ title, url, content }] } */
  async webSearch(query, { maxResults = 5, signal } = {}) {
    return (await this._post("/api/web_search", { query: String(query), max_results: Math.max(1, Math.min(10, +maxResults || 5)) }, signal)).json();
  }
  /** Ollama Cloud web fetch: { title, content, links } */
  async webFetch(url, { signal } = {}) {
    return (await this._post("/api/web_fetch", { url: String(url) }, signal)).json();
  }
  /**
   * Streamed chat: yields Ollama's chunks ({ message: { content, thinking, tool_calls }, done, … }).
   * @param {{ model: string, messages: object[], tools?: object[], think?: boolean|string, options?: object, signal?: AbortSignal }} req
   */
  async *chat({ signal, ...req }) {
    const r = await this._post("/api/chat", { stream: true, ...req }, signal);
    const reader = r.body.getReader();
    const dec2 = new TextDecoder();
    let buf = "";
    for (; ; ) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec2.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        if (j.error) throw new Error(`${this.name}: ${j.error}`);
        yield j;
      }
    }
    if (buf.trim()) {
      const j = JSON.parse(buf);
      if (j.error) throw new Error(`${this.name}: ${j.error}`);
      yield j;
    }
  }
};
var OllamaCloud = class extends Ollama {
  constructor({ apiKey = "", host = OLLAMA_CLOUD } = {}) {
    super({ host, apiKey });
  }
};

// src/vectors.js
var VectorStore = class {
  constructor(db, embed, { model, table = "docs" }) {
    this.db = db;
    this.embedFn = embed;
    this.model = model;
    this.t = table.replace(/[^\w]/g, "_");
    this.dims = null;
  }
  async init() {
    const t = this.t, db = this.db;
    db.exec(`create table if not exists ${t}(id text primary key, text text not null, meta text, model text, dims integer)`);
    const row = db.get(`select dims, model from ${t} limit 1`);
    if (row) {
      this.dims = row.dims;
      if (row.model && row.model !== this.model) throw new Error(`${t} was embedded with ${row.model}, not ${this.model}: open it with { model: '${row.model}' }`);
    }
    return this;
  }
  _vecTable(dims) {
    if (this.dims && this.dims !== dims) throw new Error(`the embedding model returned ${dims} dimensions; this store has ${this.dims}`);
    if (!this.dims) {
      this.dims = dims;
      this.db.exec(`create virtual table if not exists ${this.t}_vec using vec0(embedding float[${dims}] distance_metric=cosine)`);
    }
  }
  /** add or replace documents: strings or { id?, text, meta? }; embeds the new texts */
  async add(docs, { signal } = {}) {
    docs = (Array.isArray(docs) ? docs : [docs]).map((d, i) => typeof d === "string" ? { text: d } : d).filter((d) => d && String(d.text ?? "").trim());
    if (!docs.length) return [];
    const vecs = await this.embedFn(docs.map((d) => String(d.text)), { model: this.model, signal });
    this._vecTable(vecs[0].length);
    const t = this.t;
    const ids = [];
    this.db.transaction((db) => {
      for (const [i, d] of docs.entries()) {
        const id = String(d.id ?? (crypto.randomUUID?.() || Date.now() + "-" + i));
        const old = db.get(`select rowid from ${t} where id = ?`, [id]);
        if (old) {
          db.run(`delete from ${t}_vec where rowid = ?`, [old.rowid]);
          db.run(`delete from ${t} where rowid = ?`, [old.rowid]);
        }
        const { lastInsertRowid } = db.run(`insert into ${t}(id, text, meta, model, dims) values (?, ?, ?, ?, ?)`, [id, String(d.text), d.meta == null ? null : JSON.stringify(d.meta), this.model, vecs[i].length]);
        db.run(`insert into ${t}_vec(rowid, embedding) values (?, ?)`, [lastInsertRowid, JSON.stringify(vecs[i])]);
        ids.push(id);
      }
    });
    return ids;
  }
  /**
   * Nearest documents to a query. hybrid: also rank by BM25 keywords and merge (reciprocal rank fusion).
   * @returns {Promise<Array<{ id, text, meta, distance, score }>>}
   */
  async search(query, { limit = 5, hybrid = false, signal } = {}) {
    if (!this.dims) return [];
    const [qv] = await this.embedFn([String(query)], { model: this.model, signal });
    const t = this.t;
    const k = hybrid ? Math.max(limit * 4, 20) : limit;
    const near = this.db.query(`select d.id, d.text, d.meta, v.distance from ${t}_vec v join ${t} d on d.rowid = v.rowid where v.embedding match ? and k = ? order by v.distance`, [JSON.stringify(qv), k]).map((r) => ({ id: r.id, text: r.text, meta: r.meta ? JSON.parse(r.meta) : null, distance: r.distance, score: 1 - r.distance }));
    if (!hybrid) return near.slice(0, limit);
    const all = this.db.query(`select id, text, meta from ${t}`);
    const kw = new BM25(all.map((r) => ({ id: r.id, text: r.text }))).search(query, { limit: k });
    const fused = /* @__PURE__ */ new Map();
    const add = (list, w) => list.forEach((r, i) => {
      const f = fused.get(r.id) || { ...r, score: 0 };
      f.score += w / (60 + i + 1);
      fused.set(r.id, f);
    });
    add(near, 1);
    add(kw.map((r) => {
      const n = near.find((x) => x.id === r.id);
      const row = all.find((x) => x.id === r.id);
      return n || { id: r.id, text: row.text, meta: row.meta ? JSON.parse(row.meta) : null, distance: null };
    }), 1);
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
  remove(ids) {
    const t = this.t;
    this.db.transaction((db) => {
      for (const id of [].concat(ids)) {
        const r = db.get(`select rowid from ${t} where id = ?`, [String(id)]);
        if (r) {
          db.run(`delete from ${t}_vec where rowid = ?`, [r.rowid]);
          db.run(`delete from ${t} where rowid = ?`, [r.rowid]);
        }
      }
    });
  }
  count() {
    return this.db.get(`select count(*) n from ${this.t}`).n;
  }
  save() {
    return this.db.save();
  }
  close() {
    this.db.close();
  }
};
function createVectors(kit) {
  return {
    /**
     * Open (or create) a vector store in a SQLite file.
     * @param {string} path a VFS path or ':memory:'
     * @param {{ model?: string, table?: string, ollama?: import('./ollama.js').Ollama }} [o] model: an Ollama embedding model (default embeddinggemma)
     */
    async open(path = ":memory:", { model = "embeddinggemma", table = "docs", ollama = null } = {}) {
      const db = await kit.sqlite.open(path);
      const client = ollama || kit.local;
      return new VectorStore(db, (texts, o) => client.embed(texts, o), { model, table }).init();
    }
  };
}

// src/decide.js
var OLLAYA_LOCAL = "http://localhost:11435";
var DECIDERS = /^(clef|clef-flash|laya|jev|nimble|tev1|kev|winnow|largha|decider)(?=$|[:\-])/i;
var NAMES = { ollaya: "Ollaya", ollama: "Ollama", cloud: "Ollama Cloud" };
var keyOf = (opts, i) => {
  const o = String(opts[i]).trim();
  const k = o.length && o.length <= 100 ? o : `option_${i + 1}`;
  return opts.findIndex((x) => String(x).trim() === o) === i ? k : `option_${i + 1}`;
};
function toOllama(body, cloud) {
  const maps = {}, questions = {};
  for (const [name, q] of Object.entries(body.questions || {})) {
    const nq = { ...q };
    if ((q.type || "choice") === "choice" && Array.isArray(q.criteria)) {
      const keys = q.criteria.map((_, i) => keyOf(q.criteria, i));
      nq.criteria = Object.fromEntries(keys.map((k, i) => [k, String(q.criteria[i])]));
      maps[name] = { keys, opts: q.criteria.map(String) };
    }
    questions[name] = nq;
  }
  let model = String(body.model || "");
  if (cloud) model = model.replace(/[:\-]cloud$/i, "");
  return { req: { ...body, model, questions }, maps };
}
function fromOllama(a, m) {
  if (!a || typeof a !== "object") return a;
  const out = { ...a };
  if ("choice" in a && m) {
    const i = typeof a.choice === "number" ? a.choice : m.keys.indexOf(String(a.choice));
    if (i >= 0 && i < m.opts.length) out.choice = m.opts[i];
    if (a.probabilities && !Array.isArray(a.probabilities)) out.probabilities = Object.fromEntries(m.keys.map((k, j) => [m.opts[j], +(a.probabilities[k] ?? 0)]));
  }
  if (typeof a.noul === "number") {
    const p = Math.max(0, Math.min(1, a.noul));
    out.noul = p >= 0.5;
    out.p_true = p;
    out.probabilities = { no: +(1 - p).toFixed(6), yes: +p.toFixed(6) };
    if (out.confidence == null) out.confidence = +Math.max(p, 1 - p).toFixed(6);
  }
  return out;
}
var Decisions = class {
  /**
   * @param {{ server?: 'ollaya'|'ollama'|'cloud', host?: string, apiKey?: string, model?: string, kit?: object }} o
   * host: the server's address (Ollaya default http://localhost:11435; Ollama: the kit's local Ollama). apiKey: Ollaya's
   * key, or for the cloud a key other than the kit's Ollama Cloud key.
   */
  constructor({ server = "ollaya", host = "", apiKey = "", model = "", kit = null } = {}) {
    Object.assign(this, { server, host, apiKey, model, kit });
  }
  get name() {
    return NAMES[this.server] || this.server;
  }
  get base() {
    if (this.server === "cloud") return OLLAMA_CLOUD;
    if (this.server === "ollama") return String(this.host || this.kit?.local?.host || OLLAMA_LOCAL).replace(/\/+$/, "");
    return String(this.host || OLLAYA_LOCAL).replace(/\/+$/, "");
  }
  get key() {
    return this.server === "cloud" ? this.apiKey || this.kit?.ollama?.apiKey || "" : this.apiKey;
  }
  get headers() {
    const h = { "Content-Type": "application/json" };
    if (this.key) h.Authorization = "Bearer " + this.key;
    return h;
  }
  async _fetch(path, init = {}) {
    if (!["ollaya", "ollama", "cloud"].includes(this.server)) throw new Error(`unknown decision server "${this.server}": use ollaya, ollama or cloud`);
    if (this.server === "cloud" && !this.key) throw new Error("no Ollama Cloud API key for decisions: createKit({ ollamaKey }) or kit.decisions.apiKey = \u2026");
    try {
      return await fetch(this.base + path, { ...init, headers: this.headers });
    } catch (e) {
      if (e?.name === "AbortError") throw e;
      if (this.server === "cloud") throw new Error(`could not reach Ollama Cloud (${e.message})`);
      const n = this.server;
      throw new Error(`could not reach ${this.name} at ${this.base}. Is "${n} serve" running? If it is, the browser blocked the request: start it with ${n.toUpperCase()}_ORIGINS set to this page's origin (or "*").`);
    }
  }
  async _err(r, model) {
    let m = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      m = (j.error || m) + (j.detail ? " \u2014 " + JSON.stringify(j.detail).slice(0, 300) : "");
    } catch {
    }
    if (r.status === 401) m += this.server === "cloud" ? " (the Ollama Cloud API key was rejected)" : this.server === "ollaya" ? " (the API key was rejected: OLLAYA_API_KEY)" : " (the request was refused)";
    else if (r.status === 402) m += " (cloud decision models need a paid Ollama plan or usage credits)";
    else if (r.status === 403) m += ` (${this.name} refused this page's origin: set ${this.server.toUpperCase()}_ORIGINS)`;
    else if (r.status === 404) m += this.server === "cloud" ? ` (Ollama Cloud has no decision model "${model}"; try clef)` : this.server === "ollama" ? " (decision models need Ollama 0.35 or newer, and the model pulled: ollama pull clef-flash)" : ` (pull the model: ollaya pull ${model || "<model>"})`;
    return new Error(`${this.name} said ${r.status}: ${m}`);
  }
  /** the decision models the server offers (on Ollama and Ollama Cloud, only decision models, not chat models) */
  async models() {
    const r = await this._fetch("/api/tags");
    if (!r.ok) throw await this._err(r);
    const ms = ((await r.json()).models || []).map((m) => ({ name: m.name || m.model, caps: m.capabilities || m.details?.capabilities })).filter((m) => m.name);
    if (this.server === "ollaya") return ms.map((m) => m.name);
    let names = ms.filter((m) => Array.isArray(m.caps) && m.caps.includes("decision") || DECIDERS.test(m.name)).map((m) => m.name);
    if (this.server === "cloud") {
      names = names.map((n) => n.replace(/[:\-]cloud$/i, ""));
      if (!names.includes("clef")) names.unshift("clef");
    }
    return [...new Set(names)];
  }
  /** the raw System One call (Ollaya's request shape in, Ollaya's answer shape out) */
  async systemone(body, { signal } = {}) {
    const ollama = this.server !== "ollaya";
    let req = body, maps = {};
    if (ollama) ({ req, maps } = toOllama(body, this.server === "cloud"));
    const r = await this._fetch("/v1/systemone", { method: "POST", body: JSON.stringify(req), signal });
    if (!r.ok) throw await this._err(r, req.model);
    const j = await r.json();
    if (!ollama) return j;
    return { ...j, answers: Object.fromEntries(Object.entries(j.answers || {}).map(([k, a]) => [k, fromOllama(a, maps[k])])) };
  }
  /**
   * Decide one question about a state.
   * @param {{ state: any, question: string, type?: 'choice'|'score'|'yesno', options?: string[]|string, model?: string, signal?: AbortSignal }} o
   *   choice: pick one of options (2-255) · score: options are 2-10 levels, lowest first · yesno: no options
   * @returns {Promise<{ type, result, choice?, score?, legend?, answer?, confidence: number|null, probabilities: object, model: string, server: string }>}
   */
  async decide({ state = "", question = "", type = "choice", options, model, signal } = {}) {
    model ||= this.model || (this.server === "cloud" ? "clef" : "");
    if (!model) throw new Error(`no decision model: kit.decisions.model = '\u2026' (list them with kit.decisions.models())`);
    const t = type === "yesno" ? "noul" : type;
    const q = { type: t, instructions: String(question || "") };
    const opts = (Array.isArray(options) ? options : typeof options === "string" ? options.split("\n") : []).map(String).map((x) => x.trim()).filter(Boolean);
    if (t === "choice") {
      if (opts.length < 2) throw new Error('type "choice" needs at least 2 options');
      q.criteria = opts.slice(0, 255);
    } else if (t === "score") {
      if (opts.length < 2) throw new Error('type "score" needs 2-10 level descriptions, lowest first');
      q.criteria = opts.slice(0, 10);
    } else if (t !== "noul") throw new Error("type must be choice, score or yesno");
    const j = await this.systemone({ model, state: typeof state === "string" ? state : JSON.stringify(state ?? ""), questions: { q } }, { signal });
    const a = j.answers?.q;
    if (!a) throw new Error(`${this.name} returned no answer`);
    const probabilities = Array.isArray(a.probabilities) ? Object.fromEntries(a.probabilities.map((v, i) => [String(i), +v])) : Object.fromEntries(Object.entries(a.probabilities || {}).map(([k, v]) => [k, +v]));
    const out = { type: type === "yesno" ? "yesno" : t, confidence: a.confidence != null ? +a.confidence : null, probabilities, model: j.model || model, server: this.server };
    if ("choice" in a) {
      out.choice = a.choice;
      out.result = a.choice;
    }
    if ("score" in a) {
      out.score = a.score;
      out.result = a.score;
      if (a.legend != null) out.legend = a.legend;
    }
    if ("noul" in a) {
      out.answer = a.noul;
      out.result = a.noul;
    }
    return out;
  }
};

// src/tools.js
var MAX_OUT = 3e4;
var READ_LINES = 2e3;
var clip = (s, n = MAX_OUT) => {
  s = String(s ?? "");
  return s.length <= n ? s : s.slice(0, n / 2) + `

[\u2026 ${s.length - n} characters cut \u2026]

` + s.slice(-n / 2);
};
var str = { type: "string" };
var int = { type: "integer" };
var obj = (properties, required = []) => ({ type: "object", properties, required });
function createTools(kit) {
  const vfs = kit.vfs;
  let sh = null;
  const shell = () => sh ||= kit.shell.session({ cwd: "/" });
  const T = {
    read: {
      description: "Read a text file. Lines are numbered (cat -n style). Use offset (1-based line) and limit for long files.",
      parameters: obj({ path: { ...str, description: "file path, e.g. /notes/todo.md" }, offset: { ...int, description: "first line to read (1-based)" }, limit: { ...int, description: `number of lines (default ${READ_LINES})` } }, ["path"]),
      run({ path, offset = 1, limit = READ_LINES }) {
        const p = vfs.norm(path, shell().cwd);
        if (vfs.isDir(p)) return `${p} is a directory:
` + vfs.list(p).map((n) => vfs.isDir(vfs.norm(n, p)) ? n + "/" : n).join("\n");
        const lines = vfs.read(p).split("\n");
        const start = Math.max(1, +offset || 1);
        const end = Math.min(lines.length, start - 1 + (+limit || READ_LINES));
        const body = lines.slice(start - 1, end).map((l, i) => `${String(start + i).padStart(6)}	${l.length > 2e3 ? l.slice(0, 2e3) + "\u2026" : l}`).join("\n");
        return clip(body + (end < lines.length ? `

[${lines.length - end} more lines: read with offset ${end + 1}]` : ""));
      }
    },
    write: {
      description: "Create or overwrite a file with the given content (folders are created as needed).",
      parameters: obj({ path: str, content: str }, ["path", "content"]),
      run({ path, content }) {
        const p = vfs.norm(path, shell().cwd);
        const existed = vfs.isFile(p);
        vfs.write(p, String(content ?? ""));
        return `${existed ? "Overwrote" : "Created"} ${p} (${new TextEncoder().encode(String(content ?? "")).length} bytes)`;
      }
    },
    edit: {
      description: "Edit a file by replacing exact text. oldText must match the file exactly (whitespace included) and occur once, unless replaceAll is true. Read the file first.",
      parameters: obj({ path: str, oldText: { ...str, description: "the exact text to replace" }, newText: { ...str, description: "the replacement" }, replaceAll: { type: "boolean" } }, ["path", "oldText", "newText"]),
      run({ path, oldText, newText, replaceAll = false }) {
        const p = vfs.norm(path, shell().cwd);
        const text = vfs.read(p);
        const o = String(oldText ?? ""), n = String(newText ?? "");
        if (!o) throw new Error("oldText is empty");
        const count = text.split(o).length - 1;
        if (!count) throw new Error(`oldText was not found in ${p}. Read the file and copy the text exactly.`);
        if (count > 1 && !replaceAll) throw new Error(`oldText occurs ${count} times in ${p}. Include more surrounding text so it is unique, or set replaceAll.`);
        const out = replaceAll ? text.split(o).join(n) : text.replace(o, () => n);
        vfs.write(p, out);
        const line = text.slice(0, text.indexOf(o)).split("\n").length;
        return `Edited ${p}: ${replaceAll ? count : 1} replacement${(replaceAll ? count : 1) > 1 ? "s" : ""} at line ${line}`;
      }
    },
    bash: {
      description: "Run a shell command line (BusyBox: ls, cat, grep, sed, awk, find, \u2026; pipes, redirects, && ||, $(\u2026)). Also node, python and sqlite3. The working directory persists between calls.",
      parameters: obj({ command: str, timeout: { ...int, description: "seconds (default 60)" } }, ["command"]),
      async run({ command, timeout = 60 }, { signal } = {}) {
        const r = await shell().run(command, { timeoutMs: Math.min(600, +timeout || 60) * 1e3, signal });
        const out = r.output.trimEnd();
        return clip((out || "(no output)") + (r.code ? `
[exit code ${r.code}]` : ""));
      }
    },
    python: {
      description: "Run MicroPython code. The file system is shared with the other tools. print() output is returned.",
      parameters: obj({ code: str }, ["code"]),
      async run({ code }) {
        const r = await kit.python.run(code, { cwd: shell().cwd });
        return clip((r.output.trimEnd() || "(no output)") + (r.code ? `
[exit code ${r.code}]` : ""));
      }
    },
    javascript: {
      description: "Run JavaScript in a Node-style sandbox (require fs, path, node:sqlite; fetch). console.log output is returned, and the value of a top-level return.",
      parameters: obj({ code: str }, ["code"]),
      async run({ code }) {
        const r = await kit.js.run(code, { cwd: shell().cwd });
        return clip([r.output.trimEnd(), r.result !== void 0 ? `=> ${JSON.stringify(r.result)}` : "", r.code ? `[exit code ${r.code}]` : ""].filter(Boolean).join("\n") || "(no output)");
      }
    },
    sqlite: {
      description: 'Run SQL on a SQLite database file (created if missing; ":memory:" for a scratch one). sqlite-vec (vec0, vec_distance_cosine) and FTS5 are built in. Returns rows as JSON.',
      parameters: obj({ database: { ...str, description: "file path, e.g. /data/app.db" }, sql: str, params: { type: "array", items: {} } }, ["database", "sql"]),
      async run({ database, sql, params }) {
        const db = await kit.sqlite.open(database === ":memory:" ? ":memory:" : vfs.norm(database, shell().cwd));
        try {
          const res = db.exec(sql, params ?? null);
          return clip(res.length ? JSON.stringify(res.map((r) => r.values.map((v) => Object.fromEntries(r.columns.map((c, i) => [c, v[i]])))).flat().slice(0, 500)) : `OK (${db.db.changes()} rows changed)`);
        } finally {
          db.close({ save: database !== ":memory:" });
        }
      }
    },
    search_files: {
      description: "Find files by meaning of words (BM25 ranking) under a folder. Returns paths, scores and a snippet.",
      parameters: obj({ query: str, path: { ...str, description: "folder (default /)" }, limit: int }, ["query"]),
      run({ query, path = "/", limit = 10 }) {
        const r = searchFiles(vfs, query, { root: vfs.norm(path, shell().cwd), limit });
        return r.length ? JSON.stringify(r, null, 1) : "no matches";
      }
    },
    search: {
      description: "Search the web (Ollama web search). Returns titles, URLs and text snippets.",
      parameters: obj({ query: str, max_results: { ...int, description: "1-10 (default 5)" } }, ["query"]),
      async run({ query, max_results = 5 }, ctx) {
        const r = await kit.ollama.webSearch(query, { maxResults: max_results, signal: ctx?.signal });
        return clip(r.results?.length ? r.results.map((x, i) => `[${i + 1}] ${x.title}
${x.url}
${String(x.content || "").trim()}`).join("\n\n") : "no results");
      }
    },
    fetch: {
      description: "Fetch a web page by URL (Ollama web fetch). Returns its title, text content and links.",
      parameters: obj({ url: str }, ["url"]),
      async run({ url }, ctx) {
        const r = await kit.ollama.webFetch(url, { signal: ctx?.signal });
        return clip(`# ${r.title || url}

${r.content || ""}${r.links?.length ? "\n\nLinks:\n" + r.links.slice(0, 50).join("\n") : ""}`);
      }
    },
    decide: {
      description: "Ask a decision model to judge something with calibrated probabilities: pick one option (choice), rate on levels (score), or answer yes/no (yesno). Fast and cheap; use it for triage, routing and checks.",
      parameters: obj({ state: { ...str, description: "what to judge: a message, log, diff, error or JSON" }, question: { ...str, description: "what to decide, as an instruction" }, type: { type: "string", enum: ["choice", "score", "yesno"] }, options: { type: "array", items: str, description: "choice: the options; score: 2-10 levels, lowest first; yesno: none" } }, ["state", "question"]),
      async run(a, ctx) {
        const d = await kit.decide({ ...a, signal: ctx?.signal });
        const probs = Object.entries(d.probabilities).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(", ");
        const head = d.type === "score" ? `score: ${d.score}${d.legend != null ? ` (${typeof d.legend === "string" ? d.legend : JSON.stringify(d.legend).slice(0, 200)})` : ""}` : d.type === "yesno" ? `answer: ${d.answer ? "yes" : "no"}` : `choice: ${d.choice}`;
        return `${head}${d.confidence != null ? ` | confidence ${d.confidence.toFixed(3)}` : ""}${probs ? `
probabilities: ${probs}` : ""}
model: ${d.model} (${kit.decisions.name})`;
      }
    }
  };
  T.web_search = T.search;
  T.web_fetch = T.fetch;
  const names = (n) => (n || Object.keys(T).filter((k) => !k.startsWith("web_"))).filter((k) => T[k]);
  return {
    defs: T,
    names: () => names(),
    openai: (n) => names(n).map((name) => ({ type: "function", function: { name, description: T[name].description, parameters: T[name].parameters } })),
    anthropic: (n) => names(n).map((name) => ({ name, description: T[name].description, input_schema: T[name].parameters })),
    /** run a tool; errors come back as text starting with "Error:" so a model can recover */
    async call(name, args = {}, ctx = {}) {
      const t = T[name];
      if (!t) return `Error: unknown tool "${name}". Tools: ${names().join(", ")}`;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args || "{}");
        } catch {
          return `Error: arguments for ${name} are not valid JSON`;
        }
      }
      try {
        return String(await t.run(args || {}, ctx));
      } catch (e) {
        return `Error: ${e?.message || e}`;
      }
    },
    /** add your own tool: { description, parameters (JSON schema), run(args, ctx) } */
    add(name, def) {
      T[name] = def;
      return this;
    },
    get shell() {
      return shell();
    }
  };
}

// src/agent.js
var DEFAULT_TOOLS = ["read", "write", "edit", "bash", "search", "fetch"];
var SYSTEM = `You are a capable assistant working in a sandboxed browser workspace with a Unix-like file system.
Tools:
- read: read a file (numbered lines)
- write: create or overwrite a file
- edit: replace exact text in a file (read it first; oldText must match exactly)
- bash: run shell commands (ls, cat, grep, find, sed, awk, \u2026), plus node, python and sqlite3
- search: search the web
- fetch: fetch a web page
Work step by step. Prefer edit over rewriting whole files. Check your work (run it, read it back). Be concise in your final answer.`;
var Agent = class {
  /**
   * @param {{ kit: object, provider?: 'cloud'|'local', ollama?: object, model?: string, system?: string, tools?: string[], think?: boolean|'low'|'medium'|'high', maxSteps?: number,
   *           options?: object, onEvent?: (e: object) => void }} o
   * Events: { type: 'thinking'|'text', delta } · { type: 'tool_call', name, args } · { type: 'tool_result', name, result } ·
   *         { type: 'turn_end', message } · { type: 'done', text } · { type: 'error', error }
   */
  constructor({ kit, provider = null, ollama = null, model = null, system = SYSTEM, tools = DEFAULT_TOOLS, think = void 0, maxSteps = 40, options = void 0, onEvent = null }) {
    provider ||= kit.ollama.apiKey ? "cloud" : "local";
    this.client = ollama || (provider === "cloud" ? kit.ollama : kit.local);
    model ||= this.client.cloud ? "gpt-oss:120b" : "qwen3:8b";
    Object.assign(this, { kit, model, system, toolNames: tools, think, maxSteps, options, onEvent });
    this.messages = [];
    this.ctrl = null;
  }
  emit(e) {
    try {
      this.onEvent?.(e);
    } catch {
    }
  }
  reset() {
    this.messages = [];
  }
  /** stop the current run */
  abort() {
    this.ctrl?.abort();
  }
  /**
   * Send a message and run until the model answers without calling a tool.
   * @returns {Promise<string>} the final answer
   */
  async prompt(text, { images } = {}) {
    if (this.ctrl) throw new Error("the agent is already running");
    const ctrl = this.ctrl = new AbortController();
    const signal = ctrl.signal;
    const tools = this.kit.tools.openai(this.toolNames);
    this.messages.push({ role: "user", content: String(text), ...images?.length ? { images } : {} });
    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const msg = { role: "assistant", content: "" };
        let thinking = "";
        const calls = [];
        for await (const ch of this.client.chat({ model: this.model, messages: [{ role: "system", content: this.system }, ...this.messages], tools, ...this.think !== void 0 ? { think: this.think } : {}, ...this.options ? { options: this.options } : {}, signal })) {
          const m = ch.message || {};
          if (m.thinking) {
            thinking += m.thinking;
            this.emit({ type: "thinking", delta: m.thinking });
          }
          if (m.content) {
            msg.content += m.content;
            this.emit({ type: "text", delta: m.content });
          }
          if (m.tool_calls?.length) calls.push(...m.tool_calls);
        }
        if (thinking) msg.thinking = thinking;
        if (calls.length) msg.tool_calls = calls;
        this.messages.push(msg);
        this.emit({ type: "turn_end", message: msg });
        if (!calls.length) {
          this.emit({ type: "done", text: msg.content });
          return msg.content;
        }
        for (const c of calls) {
          const name = c.function?.name;
          let args = c.function?.arguments ?? {};
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              args = {};
            }
          }
          this.emit({ type: "tool_call", name, args });
          const result = await this.kit.tools.call(name, args, { signal });
          this.emit({ type: "tool_result", name, result });
          this.messages.push({ role: "tool", tool_name: name, content: result });
          if (signal.aborted) throw new DOMException("stopped", "AbortError");
        }
      }
      const note = `(stopped after ${this.maxSteps} steps)`;
      this.emit({ type: "done", text: note });
      return note;
    } catch (e) {
      if (e?.name === "AbortError") {
        this.emit({ type: "done", text: "(stopped)" });
        return "(stopped)";
      }
      this.emit({ type: "error", error: e });
      throw e;
    } finally {
      this.ctrl = null;
    }
  }
};

// src/index.js
var VERSION = "0.1.0";
async function createKit({ persist = false, files = null, ollamaKey = "", ollamaHost = OLLAMA_LOCAL, decide = {}, assetsBase = null, cdn = "https://cdn.jsdelivr.net/npm/", engine = "auto", busybox: bbNow = true } = {}) {
  if (assetsBase) setAssetsBase(assetsBase);
  const vfs = new VFS({ persist });
  const loaded = await vfs.load().catch(() => false);
  if (!loaded && files) vfs.import(files);
  const busybox = new BusyBox(vfs);
  const sqlite = new Sqlite(vfs);
  const ml = new ML({ vfs, cdn });
  const python = new Python({ vfs, sqlite, cdn });
  const ollama = new Ollama({ host: OLLAMA_CLOUD, apiKey: ollamaKey });
  const local = new Ollama({ host: ollamaHost });
  const kit = { version: VERSION, vfs, busybox, sqlite, ml, python, ollama, local, bm25: { BM25, search: bm25Search, tokenize, searchFiles: (q, o) => searchFiles(vfs, q, o) } };
  kit.js = new JsRunner({ vfs, sqlite, ml, bridge: (op, a) => bridge(op, a) });
  const commands = { node: kit.js.command(), js: kit.js.command(), python: python.command(), python3: python.command(), sqlite3: sqlite.command() };
  kit.shell = createShell({ vfs, busybox, engine, commands });
  kit.sh = kit.shell.session();
  kit.run = (cmd, o) => kit.sh.run(cmd, o);
  kit.webxdc = new Webxdc({ vfs, persist });
  kit.embed = (input, o) => local.embed(input, o);
  kit.vectors = createVectors(kit);
  kit.decisions = new Decisions({ ...decide, kit });
  kit.decide = (o) => kit.decisions.decide(o);
  kit.tools = createTools(kit);
  kit.agent = (o = {}) => new Agent({ kit, ...o });
  async function bridge(op, a) {
    if (op === "tool") return kit.tools.call(a.name, a.args || {});
    if (op === "list") return kit.tools.names();
    if (op === "decide") return kit.decide(a);
    if (op === "shell") {
      const r = await kit.shell.session().run(a.command);
      return { stdout: r.stdout, stderr: r.stderr, code: r.code };
    }
    throw new Error(`kit.${op} is not available in Jade Agent Kit`);
  }
  if (bbNow) busybox.load();
  return kit;
}
export {
  Agent,
  BM25,
  BusyBox,
  DEFAULT_TOOLS,
  Database,
  Decisions,
  JsRunner,
  ML,
  OLLAMA_CLOUD,
  OLLAMA_LOCAL,
  OLLAYA_LOCAL,
  Ollama,
  OllamaCloud,
  Python,
  ShellSession,
  Sqlite,
  VERSION,
  VFS,
  VectorStore,
  Webxdc,
  bm25Search,
  createKit,
  createTools,
  getAssetsBase,
  gpuShim,
  searchFiles,
  setAssetsBase,
  tokenize
};
