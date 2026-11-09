// Backup: the whole file system (or a folder) as one file, gzip-compressed and optionally encrypted on this device
// (AES-GCM, key from a passphrase with PBKDF2), to download, keep, or send to a backup server (Jade Vault's
// server/jade-backup-server.py: PUT /backups/<name> with a bearer token and an X-Sha256 header). Restoring replaces or
// merges files. Secrets and approvals are never included (they are not in the file system). From Jade Vault (autobackup.js).
const enc = new TextEncoder(), dec = new TextDecoder(), ITER = 210000;
const hexs = u8 => [...new Uint8Array(u8)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async u8 => hexs(await crypto.subtle.digest('SHA-256', u8));
const gzip = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
const gunzip = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function key(pass, salt, iter) { const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
export async function encrypt(u8, pass) { const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(pass, salt, ITER), u8)); return enc.encode(JSON.stringify({ app: 'jade-agent-kit-encrypted', v: 1, kdf: 'PBKDF2-SHA256', iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(ct) })); }
export async function decrypt(env, pass) { if (!pass) throw new Error('this backup is encrypted: give the passphrase'); try { return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, await key(pass, unb64(env.salt), env.iter || ITER), unb64(env.data))); } catch { throw new Error('wrong passphrase, or the backup is damaged'); } }

export class Backup {
  /** @param {{ kit: object, server?: { url: string, token: string }, passphrase?: string, exclude?: RegExp }} o */
  constructor({ kit, server = null, passphrase = '', exclude = /^\/\.kit\/(history|think)\// } = {}) { Object.assign(this, { kit, vfs: kit.vfs, server, passphrase, exclude }); }
  /** the backup object: { app, v, created, root, files: { path: text | { b64 } }, dirs } */
  snapshot(root = '/') {
    root = this.vfs.norm(root); const files = {}, dirs = [];
    for (const p of this.vfs.walk(root)) { const n = this.vfs.nodes.get(p); if (n.dir) { if (p !== '/') dirs.push(p); continue; } if (this.exclude?.test(p)) continue; const b = n.data; let t = null; try { t = new TextDecoder('utf-8', { fatal: true }).decode(b); } catch {} files[p] = t !== null && !t.includes('\0') ? t : { b64: b64(b) }; }
    return { app: 'jade-agent-kit', v: 1, created: new Date().toISOString(), root, files, dirs };
  }
  /** make a backup file → { name, bytes, files, encrypted } */
  async make({ root = '/', passphrase = this.passphrase, encrypt: doEnc = !!passphrase } = {}) {
    const data = this.snapshot(root); let bytes = await gzip(enc.encode(JSON.stringify(data))), ext = '.json.gz';
    if (doEnc) { if (!passphrase) throw new Error('encryption needs a passphrase'); bytes = await encrypt(bytes, passphrase); ext = '.enc.json'; }
    return { name: `jade-agent-kit-${new Date().toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}${ext}`, bytes, files: Object.keys(data.files).length, encrypted: doEnc };
  }
  /** read a backup file (gzip, plain JSON or encrypted) → the backup object */
  async read(u8, passphrase = this.passphrase) {
    u8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    if (u8[0] === 0x1f && u8[1] === 0x8b) u8 = await gunzip(u8);
    const data = JSON.parse(dec.decode(u8));
    if (data?.app === 'jade-agent-kit-encrypted' || data?.app === 'jade-vault-encrypted') { const inner = await decrypt(data, passphrase); return JSON.parse(dec.decode(inner[0] === 0x1f && inner[1] === 0x8b ? await gunzip(inner) : inner)); }
    return data;
  }
  /** restore: mode 'merge' (add and overwrite) or 'replace' (also delete what is not in the backup, under its root) → { written, removed } */
  async restore(u8, { passphrase = this.passphrase, mode = 'merge' } = {}) {
    const data = await this.read(u8, passphrase); const files = data.files || data.vault?.files; if (!files) throw new Error('this is not a backup made by the kit');
    let written = 0, removed = 0; const root = this.vfs.norm(data.root || '/');
    if (mode === 'replace') for (const p of [...this.vfs.walk(root)]) { if (this.vfs.isFile(p) && !(p in files) && !this.exclude?.test(p)) { this.vfs.rm(p); removed++; } }
    for (const d of data.dirs || []) this.vfs.mkdirp(d);
    for (const [p, v] of Object.entries(files)) { this.vfs.write(p, typeof v === 'string' ? v : unb64(v.b64)); written++; }
    await this.vfs.flush?.(); return { written, removed };
  }
  /** a backup as a download (call from a click) */
  async download(o) { const m = await this.make(o); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([m.bytes])); a.download = m.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return m; }
  async _call(method, path, { body, headers, ms = 120000 } = {}) {
    const s = this.server; if (!s?.url || !/^https?:\/\//i.test(s.url)) throw new Error('no backup server: createKit({ backup: { server: { url, token } } })'); if (!s.token) throw new Error('the backup server needs a token');
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms);
    try { const r = await fetch(s.url.replace(/\/+$/, '') + path, { method, body, headers: { Authorization: 'Bearer ' + s.token, ...(headers || {}) }, signal: ctrl.signal, credentials: 'omit' }); if (!r.ok) { let m = ''; try { m = (await r.json()).error || ''; } catch {} throw new Error(`the backup server said ${r.status}${m ? ': ' + m : ''}`); } return r; }
    catch (e) { throw new Error(ctrl.signal.aborted ? `no answer from the backup server in ${ms / 1000}s` : /server said/.test(e.message) ? e.message : `could not reach the backup server (${e.message})`); }
    finally { clearTimeout(t); }
  }
  /** upload a backup → { name, size, files, encrypted } */
  async upload(o) {
    const m = await this.make(o), sha = await sha256(m.bytes);
    const r = await this._call('PUT', '/backups/' + encodeURIComponent(m.name), { body: m.bytes, headers: { 'Content-Type': 'application/octet-stream', 'X-Sha256': sha } });
    const j = await r.json().catch(() => ({})); if (j.sha256 && j.sha256 !== sha) throw new Error('the server stored different bytes than were sent');
    this.last = { at: Date.now(), name: m.name }; return { name: m.name, size: m.bytes.length, files: m.files, encrypted: m.encrypted };
  }
  async list() { return (await (await this._call('GET', '/backups', { ms: 30000 })).json()).backups || []; }
  /** download a backup from the server, check its checksum and restore it */
  async restoreFrom(name, o = {}) { const r = await this._call('GET', '/backups/' + encodeURIComponent(name)); const u8 = new Uint8Array(await r.arrayBuffer()); const want = r.headers.get('X-Sha256'); if (want && want !== await sha256(u8)) throw new Error('the download was damaged (checksum mismatch); nothing was restored'); return this.restore(u8, o); }
  /** back up to the server every N hours while the page is open */
  every(hours = 24, o) { clearInterval(this._t); this._t = setInterval(() => this.upload(o).catch(e => { this.error = e.message; }), Math.max(1, hours) * 3600e3); return this; }
  stop() { clearInterval(this._t); }
  get toolDefs() {
    return { backup: {
      description: 'Back up the files to the app\'s backup server: upload (now), list (backups on the server), status. Restoring is the app\'s decision, not yours.',
      parameters: { type: 'object', properties: { action: { type: 'string', enum: ['upload', 'list', 'status'] } }, required: ['action'] },
      run: async a => { if (a.action === 'upload') { const r = await this.upload(); return `Uploaded ${r.name} (${r.files} files, ${r.size} bytes${r.encrypted ? ', encrypted' : ''}).`; } if (a.action === 'list') { const l = await this.list(); return l.length ? l.map(b => `${b.name} ${b.size ?? ''} ${b.modified ?? b.mtime ?? ''}`).join('\n') : 'No backups on the server.'; } return this.server ? `Server: ${this.server.url}. Last: ${this.last ? new Date(this.last.at).toLocaleString() + ' ' + this.last.name : 'none this session'}${this.error ? ' · last error: ' + this.error : ''}` : 'No backup server is set.'; },
    } };
  }
  plugin() { return { name: 'backup', tools: ['backup'] }; }
}
