// http: requests for agents and scripts (GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS) with the kit's secrets. Write {{NAME}} in
// the url, query, headers or body: the agent never sees the values, and any echo of them in a response is redacted.
// Binary responses are saved to a file. allow: optional list of hosts the tool may reach. From Jade Vault (net.js).
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'application/pdf': 'pdf', 'application/zip': 'zip', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'application/octet-stream': 'bin' };
const isTextType = ct => /^text\/|json|xml|javascript|ecmascript|x-www-form-urlencoded|yaml|toml|csv|graphql/i.test(ct || '');
const looksText = b => { let bad = 0; for (const x of b) if (x === 0 || (x < 9) || (x > 13 && x < 32)) bad++; return bad < b.length * 0.02; };
const MAX = 30000;

export class Http {
  /** @param {{ kit: object, allow?: string[], saveDir?: string, timeout?: number }} o allow: hosts (and their subdomains) the tool may reach; default any */
  constructor({ kit, allow = null, saveDir = '/downloads', timeout = 30 } = {}) { Object.assign(this, { kit, vfs: kit.vfs, allow, saveDir: kit.vfs.norm(saveDir), timeout }); }
  async _secrets() { return this.kit.has('secrets') || this.kit.config.secrets ? (await this.kit.use('secrets')) : null; }
  hostOk(url) { if (!this.allow?.length) return true; const h = new URL(url).hostname.toLowerCase(); return this.allow.some(a => { a = String(a).toLowerCase().replace(/^\*\./, ''); return h === a || h.endsWith('.' + a); }); }
  /**
   * Make a request → { status, statusText, url, headers, ms, text?, json?, path?, bytes, secrets: string[] } (secrets redacted)
   * @param {{ url: string, method?: string, query?: object, headers?: object|string, json?: any, body?: any, form?: object, save_to?: string, timeout?: number, follow_redirects?: boolean, signal?: AbortSignal }} a
   */
  async request(a) {
    const S = await this._secrets(), map = S ? S.map() : {}, used = new Set();
    const fill = s => String(s).replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (m, k) => { const v = map[k]; if (v == null || v === '') return m; used.add(k); return v; });
    const red = s => S ? S.redact(s) : String(s);
    const method = String(a.method || 'GET').toUpperCase(); if (!/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(method)) throw new Error(`unsupported method ${method}`);
    let url = fill(String(a.url || '').trim()); if (!/^https?:\/\//i.test(url)) throw new Error('url must start with http:// or https://');
    if (a.query && typeof a.query === 'object') { const u = new URL(url); for (const [k, v] of Object.entries(a.query)) if (v != null) u.searchParams.set(k, fill(typeof v === 'object' ? JSON.stringify(v) : String(v))); url = u.toString(); }
    if (!this.hostOk(url)) throw new Error(`${new URL(url).hostname} is not in the allowed hosts (${this.allow.join(', ')})`);
    let hin = a.headers; if (typeof hin === 'string') { try { hin = JSON.parse(hin); } catch { hin = Object.fromEntries(hin.split('\n').map(l => l.split(/:(.*)/s)).filter(x => x[1]).map(([k, v]) => [k.trim(), v.trim()])); } }
    const headers = {}; for (const [k, v] of Object.entries(hin || {})) headers[k] = fill(String(v));
    const hasCT = Object.keys(headers).some(k => k.toLowerCase() === 'content-type'); let body;
    if (a.form && typeof a.form === 'object') { body = new URLSearchParams(Object.entries(a.form).map(([k, v]) => [k, fill(typeof v === 'object' ? JSON.stringify(v) : String(v))])).toString(); if (!hasCT) headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    else if (a.json !== undefined || (a.body !== undefined && typeof a.body === 'object' && a.body !== null)) { body = fill(JSON.stringify(a.json !== undefined ? a.json : a.body)); if (!hasCT) headers['Content-Type'] = 'application/json'; }
    else if (a.body !== undefined && a.body !== null && a.body !== '') { body = fill(String(a.body)); if (!hasCT) headers['Content-Type'] = /^[[{]/.test(String(a.body).trim()) ? 'application/json' : 'text/plain;charset=UTF-8'; }
    if (body !== undefined && (method === 'GET' || method === 'HEAD')) throw new Error(`${method} requests cannot have a body; use POST (or put the data in query)`);
    const ms0 = Math.min(Math.max(1, +a.timeout || this.timeout), 120) * 1000, ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms0);
    const stop = () => ctrl.abort(); a.signal?.addEventListener?.('abort', stop);
    const t0 = Date.now(); let r;
    try { r = await fetch(url, { method, headers, body, signal: ctrl.signal, redirect: a.follow_redirects === false ? 'manual' : 'follow', credentials: 'omit' }); }
    catch (e) { const why = ctrl.signal.aborted ? `timed out after ${ms0 / 1000}s` : (e.message || String(e)); throw new Error(red(`${method} ${url} failed: ${why}.${/fetch|network|load failed/i.test(why) ? ' In a browser this usually means the server does not allow cross-origin requests (CORS).' : ''}`)); }
    finally { clearTimeout(t); a.signal?.removeEventListener?.('abort', stop); }
    const out = { status: r.status, statusText: r.statusText, url: red(r.url || url), method, ms: Date.now() - t0, headers: {}, secrets: [...used] };
    r.headers.forEach((v, k) => { out.headers[k] = red(v); });
    if (method === 'HEAD') return out;
    const buf = new Uint8Array(await r.arrayBuffer()); out.bytes = buf.length;
    const mime = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(); out.type = mime;
    const binary = !isTextType(mime) && (mime || !looksText(buf.subarray(0, 4096)));
    let save = a.save_to ? this.vfs.norm(String(a.save_to)) : null;
    if (!save && binary && buf.length) { let name = (() => { try { return decodeURIComponent(new URL(r.url || url).pathname.split('/').pop() || ''); } catch { return ''; } })().replace(/[^\w.\- ]+/g, '_').slice(0, 80); if (!name.includes('.')) name = `download-${Date.now().toString(36)}.${MIME_EXT[mime] || 'bin'}`; save = `${this.saveDir}/${name}`; }
    if (save) { if (this.vfs.isDir(save)) save += `/download-${Date.now().toString(36)}.${MIME_EXT[mime] || 'bin'}`; if (save.startsWith('/.kit/')) throw new Error('downloads cannot go into /.kit/'); this.vfs.write(save, buf); out.path = save; return out; }
    out.text = red(new TextDecoder().decode(buf));
    if (/json/.test(mime) || (!mime && /^\s*[[{]/.test(out.text))) { try { out.json = JSON.parse(out.text); } catch {} }
    return out;
  }
  async tool(a, ctx = {}) {
    const r = await this.request({ ...a, signal: ctx.signal });
    const keep = ['content-type', 'content-length', 'location', 'retry-after', 'etag', 'last-modified', 'link'];
    const head = `HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''} · ${r.method} ${r.url} · ${r.ms}ms${r.secrets.length ? ` · secrets used: ${r.secrets.join(', ')}` : ''}\n` + Object.entries(r.headers).filter(([k]) => keep.includes(k) || /ratelimit|rate-limit/i.test(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
    if (r.path) return `${head}\n\nSaved ${r.bytes} bytes${r.type ? ` (${r.type})` : ''} to ${r.path}.`;
    let text = r.json !== undefined ? JSON.stringify(r.json, null, 2) : r.text ?? ''; if (text.length > MAX) text = text.slice(0, MAX) + `\n[… ${text.length - MAX} more characters; use save_to to keep the whole body]`;
    return `${head}\n\n${text || '(empty body)'}`;
  }
  get toolDefs() {
    return { http: {
      description: 'Make an HTTP request to an API (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS). Use secrets as {{NAME}} in url, query, headers or body (the secrets tool lists them); you never see their values. json: a body sent as JSON; form: a form body. Binary responses are saved to a file (save_to to choose where). Browsers only reach servers that allow cross-origin requests (CORS).',
      parameters: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] }, query: { type: 'object' }, headers: { type: 'object' }, json: {}, body: {}, form: { type: 'object' }, save_to: { type: 'string' }, timeout: { type: 'integer' }, follow_redirects: { type: 'boolean' } }, required: ['url'] },
      run: (a, ctx) => this.tool(a, ctx),
    } };
  }
  plugin() { return { name: 'http', tools: ['http', 'secrets'] }; }
}
