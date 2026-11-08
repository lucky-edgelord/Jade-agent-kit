// Pieces of Jade Vault's webxdc host: zip reading/writing, the page a frame runs, and the window.webxdc shim.
import { dec, b64enc } from '../util.js';
const fmtKB = n => n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
export async function unzip(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes); const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file (.xdc files are zip archives)');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const out = {}; const td = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('broken zip directory');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nlen)); p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const ds = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true); const raw = u8.subarray(ds, ds + csize);
    let data; if (method === 0) data = raw.slice(); else if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); else throw new Error(`unsupported zip compression (${method}) for ${name}`);
    out[name.replace(/^\.?\//, '')] = data;
  }
  return out;
}
export function parseToml(t) { const o = {}; for (const line of String(t || '').split(/\r?\n/)) { const m = /^\s*([\w.-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'([^']*)'|([\w.+-]+))\s*(?:#.*)?$/.exec(line); if (m) o[m[1]] = m[2] != null ? m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\') : m[3] != null ? m[3] : (/^-?\d+(\.\d+)?$/.test(m[4]) ? +m[4] : m[4] === 'true' ? true : m[4] === 'false' ? false : m[4]); else if (/^\s*\[/.test(line)) break; } return o; }
export const XMIME = { html: 'text/html', htm: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', wasm: 'application/wasm', txt: 'text/plain', md: 'text/markdown', xml: 'application/xml', csv: 'text/csv', toml: 'text/plain' };
export const xmime = p => XMIME[(p.split('.').pop() || '').toLowerCase()] || 'application/octet-stream';
export function xdcResolve(base, ref) {
  let r = String(ref || '').trim(); if (!r || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(r)) return null;
  r = r.split('#')[0].split('?')[0]; try { r = decodeURIComponent(r); } catch {}
  const parts = (r.startsWith('/') ? [] : base.split('/').slice(0, -1)); for (const s of r.split('/')) { if (!s || s === '.') continue; if (s === '..') parts.pop(); else parts.push(s); }
  return parts.join('/');
}
export function xdcPage(app, self) {
  const F = app.files; const dataUrl = p => `data:${xmime(p)};base64,${b64enc(F[p])}`; const memo = new Map();
  const css = (text, from) => text.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?/g, (m, q, ref) => { const p = xdcResolve(from, ref); return p && F[p] ? `@import url("data:text/css;base64,${b64enc(new TextEncoder().encode(css(dec.decode(F[p]), p)))}")` : m; })
    .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, ref) => { const p = xdcResolve(from, ref); return p && F[p] ? `url("${dataUrl(p)}")` : m; });
  const modUrl = (p, stack = []) => {
    if (memo.has(p)) return memo.get(p); if (stack.includes(p)) return null;
    const src = js(dec.decode(F[p]), p, [...stack, p]); const u = `data:text/javascript;base64,${b64enc(new TextEncoder().encode(src))}`; memo.set(p, u); return u;
  };
  const js = (text, from, stack = []) => text
    .replace(/(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g, (m, pre, q, ref) => { const p = xdcResolve(from, ref); if (!p || !F[p]) return m; if (/\.(js|mjs)$/i.test(p)) { const u = modUrl(p, stack); return u ? pre + q + u + q : m; } return pre + q + dataUrl(p) + q; })
    .replace(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g, (m, q, ref) => { const p = xdcResolve(from, ref); if (!p || !F[p]) return m; const u = /\.(js|mjs)$/i.test(p) ? modUrl(p, stack) : dataUrl(p); return u ? `import(${q}${u}${q})` : m; })
    .replace(/new\s+URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g, (m, q, ref) => { const p = xdcResolve(from, ref); return p && F[p] ? `new URL(${q}${dataUrl(p)}${q})` : m; });
  const doc = new DOMParser().parseFromString(dec.decode(F['index.html']), 'text/html');
  for (const s of [...doc.querySelectorAll('script')]) {
    const isMod = (s.getAttribute('type') || '').toLowerCase() === 'module'; const ref = s.getAttribute('src');
    if (ref) { const p = xdcResolve('index.html', ref); if (!p || !F[p]) { if (/webxdc\.js$/.test(ref)) s.remove(); continue; } s.removeAttribute('src'); s.textContent = isMod ? js(dec.decode(F[p]), p, [p]) : dec.decode(F[p]); }
    else if (isMod) s.textContent = js(s.textContent, 'index.html');
  }
  for (const l of [...doc.querySelectorAll('link[href]')]) {
    const rel = (l.getAttribute('rel') || '').toLowerCase(); const p = xdcResolve('index.html', l.getAttribute('href'));
    if (!p || !F[p]) continue;
    if (rel.includes('stylesheet')) { const st = doc.createElement('style'); st.textContent = css(dec.decode(F[p]), p); l.replaceWith(st); }
    else if (rel === 'modulepreload') l.remove(); else l.setAttribute('href', dataUrl(p));
  }
  for (const st of doc.querySelectorAll('style')) st.textContent = css(st.textContent, 'index.html');
  for (const el of doc.querySelectorAll('[style]')) el.setAttribute('style', css(el.getAttribute('style'), 'index.html'));
  for (const el of doc.querySelectorAll('img[src],audio[src],video[src],source[src],input[src],embed[src],track[src],image[href],use[href]')) { const a = el.hasAttribute('src') ? 'src' : 'href'; const p = xdcResolve('index.html', el.getAttribute(a)); if (p && F[p]) el.setAttribute(a, dataUrl(p)); }
  // files a script may ask for at runtime (fetch, XHR, img.src = …): small ones ride along as data URLs
  const assets = {}; let budget = 12 * 1048576;
  for (const [p, d] of Object.entries(F)) { if (p === 'index.html') continue; if (d.length > budget) continue; budget -= d.length; assets[p] = dataUrl(p); }
  const boot = doc.createElement('script'); boot.textContent = xdcBootSrc({ app, assets, files: Object.keys(F), self });
  const meta = doc.createElement('meta'); meta.setAttribute('http-equiv', 'Content-Security-Policy'); meta.setAttribute('content', "default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:");
  const head = doc.head || doc.documentElement.insertBefore(doc.createElement('head'), doc.body);
  head.prepend(meta, boot);
  return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
}
export function xdcBootSrc({ app, assets, files, self }) {
  const cfg = { addr: self.addr, name: self.name, ls: app.ls || {}, assets, files, android: !!self.android };
  return `(() => {
const CFG = ${JSON.stringify(cfg).replace(/<\//g, '<\\/')};
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
export function zipStore(files) {
  const enc_ = new TextEncoder(); const parts = [], cd = []; let off = 0;
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = u => { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = crcT[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  for (const [name, data] of Object.entries(files)) {
    const nb = enc_.encode(name), c = crc(data); const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x800, true); lh.setUint32(14, c, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(lh.buffer), nb, data);
    const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x800, true); ch.setUint32(16, c, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    cd.push(new Uint8Array(ch.buffer), nb); off += 30 + nb.length + data.length;
  }
  const cdLen = cd.reduce((a, b) => a + b.length, 0); const e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, Object.keys(files).length, true); e.setUint16(10, Object.keys(files).length, true); e.setUint32(12, cdLen, true); e.setUint32(16, off, true);
  const all = [...parts, ...cd, new Uint8Array(e.buffer)]; const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let o = 0; for (const p of all) { out.set(p, o); o += p.length; } return out;
}
