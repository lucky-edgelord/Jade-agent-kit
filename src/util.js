// Small shared helpers.
export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function b64enc(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64dec(s) { return Uint8Array.from(atob(String(s).replace(/\s+/g, '')), c => c.charCodeAt(0)); }
export const toBytes = d => d instanceof Uint8Array ? d : typeof d === 'string' ? enc.encode(d) : d instanceof ArrayBuffer ? new Uint8Array(d) : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : enc.encode(String(d ?? ''));
export const sameBytes = (a, b) => { if (a === b) return true; if (!a || !b || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
export const isSqliteBytes = b => !!b && b.length >= 16 && String.fromCharCode(...b.subarray(0, 15)) === 'SQLite format 3';
export const isWasm = u8 => !!u8 && u8.length >= 8 && u8[0] === 0 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d;

// where the kit's own files (assets/) live: next to src/ and dist/, wherever the kit was loaded from
let ASSETS = new URL('../assets/', import.meta.url).href;
export const assetUrl = name => new URL(name, ASSETS).href;
export const setAssetsBase = base => { if (base) ASSETS = new URL(base.endsWith('/') ? base : base + '/', location.href).href; };
export const getAssetsBase = () => ASSETS;

export async function fetchBytes(url, what = url) {
  let r;
  try { r = await fetch(url); } catch (e) { throw new Error(`could not download ${what} (${e.message || e})`); }
  if (!r.ok) throw new Error(`could not download ${what}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
export async function fetchText(url, what = url) { return dec.decode(await fetchBytes(url, what)); }

// load a classic script once (for runtimes that set a global, like TensorFlow.js and ONNX Runtime)
const scripts = new Map();
export function loadScript(url, global) {
  if (global && globalThis[global]) return Promise.resolve(globalThis[global]);
  if (!scripts.has(url)) scripts.set(url, new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(global ? globalThis[global] : true);
    s.onerror = () => { scripts.delete(url); rej(new Error(`could not load ${url}`)); };
    document.head.appendChild(s);
  }));
  return scripts.get(url);
}

// a small IndexedDB key/value store
export function idbStore(dbName, store = 'kv') {
  let dbp = null;
  const open = () => dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(store);
    r.onsuccess = () => res(r.result); r.onerror = () => { dbp = null; rej(r.error); };
  });
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(store, mode); const q = fn(t.objectStore(store)); t.oncomplete = () => res(q?.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); };
  return {
    get: k => tx('readonly', s => s.get(k)),
    set: (k, v) => tx('readwrite', s => s.put(v, k)),
    del: k => tx('readwrite', s => s.delete(k)),
    keys: () => tx('readonly', s => s.getAllKeys()),
    close: async () => { if (dbp) (await dbp).close(); dbp = null; },
  };
}

// run code in a classic Web Worker made from source text; resolves with its first message (or an error/timeout)
export function workerRun(src, msg, { timeoutMs = 60000, transfer = [], onMessage = null, signal = null, name = 'worker' } = {}) {
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  return new Promise(resolve => {
    let w; try { w = new Worker(url, { name }); } catch (e) { URL.revokeObjectURL(url); resolve({ error: `could not start a ${name} worker (${e.message})` }); return; }
    let done = false;
    const finish = v => { if (done) return; done = true; clearTimeout(t); signal?.removeEventListener?.('abort', ab); w.terminate(); URL.revokeObjectURL(url); resolve(v); };
    const t = setTimeout(() => finish({ timeout: true, error: `${name}: stopped after ${timeoutMs / 1000}s timeout` }), timeoutMs);
    const ab = () => finish({ aborted: true, error: `${name}: stopped` }); signal?.addEventListener?.('abort', ab);
    w.onmessage = async e => { if (onMessage) { const handled = await onMessage(e.data, w); if (handled) return; } finish(e.data); };
    w.onerror = e => { e.preventDefault?.(); finish({ error: `${e.message || name + ' error'}${e.lineno ? ` (line ${e.lineno})` : ''}`, lineno: e.lineno }); };
    w.postMessage(msg, transfer);
  });
}
