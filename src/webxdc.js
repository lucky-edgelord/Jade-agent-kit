// A webxdc host (https://webxdc.org): run .xdc apps in a sandboxed iframe with window.webxdc. Updates are kept per app
// (in memory, and in IndexedDB when the kit persists). The page (you) and the agent are two peers: the user's actions
// in the frame arrive as updates, and the agent can send its own with session.send().
import { unzip, parseToml, xmime, xdcPage, zipStore } from './internal/xdc_core.js';
import { dec, b64enc, fetchBytes, idbStore } from './util.js';

export class Webxdc {
  constructor({ vfs, persist = false }) { this.vfs = vfs; this.store = persist ? idbStore('jade-agent-kit-xdc:' + persist) : null; this.apps = new Map(); this.sessions = new Set(); this.listeners = new Set(); this._q = new Map(); }

  /** install an app from a .xdc file (VFS path, URL or bytes), a VFS folder, or an object of files */
  async load(src, { name: fallback = 'App' } = {}) {
    let files;
    if (src instanceof Uint8Array || src instanceof ArrayBuffer) files = await unzip(src);
    else if (src && typeof src === 'object') files = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, typeof v === 'string' ? new TextEncoder().encode(v) : v]));
    else {
      const s = String(src);
      if (/^(https?:|blob:|data:)/i.test(s)) files = await unzip(await fetchBytes(s));
      else if (this.vfs.isDir(s)) { const pre = this.vfs.norm(s).replace(/\/$/, '') + '/'; files = {}; for (const [p, n] of this.vfs.nodes) if (!n.dir && p.startsWith(pre)) files[p.slice(pre.length)] = n.data; fallback = this.vfs.base(this.vfs.norm(s)); }
      else if (this.vfs.isFile(s)) { files = await unzip(this.vfs.readBytes(s)); fallback = this.vfs.base(this.vfs.norm(s)).replace(/\.xdc$/i, ''); }
      else throw new Error(`${s}: not a file, folder or URL`);
    }
    if (!files['index.html']) { const roots = new Set(Object.keys(files).map(k => k.split('/')[0])); if (roots.size === 1) { const r = [...roots][0] + '/'; if (files[r + 'index.html']) files = Object.fromEntries(Object.entries(files).map(([k, v]) => [k.slice(r.length), v])); } }
    if (!files['index.html']) throw new Error('this is not a webxdc app: index.html is missing');
    const manifest = files['manifest.toml'] ? parseToml(dec.decode(files['manifest.toml'])) : {};
    let name = String(manifest.name || '').trim();
    if (!name) { const m = /<title>([^<]{1,60})<\/title>/i.exec(dec.decode(files['index.html'])); name = (m && m[1].trim()) || fallback; }
    const iconP = ['icon.png', 'icon.jpg', 'icon.jpeg', 'icon.svg', 'icon.webp'].find(k => files[k]);
    const id = 'xdc-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const saved = this.store ? await this.store.get(id) : null;
    const app = { id, name, manifest, files, icon: iconP ? `data:${xmime(iconP)};base64,${b64enc(files[iconP])}` : null, size: Object.values(files).reduce((a, b) => a + b.length, 0), updates: saved?.updates || [], ls: saved?.ls || {}, summary: saved?.summary || '', document: saved?.document || '' };
    this.apps.set(id, app); return app;
  }
  get(idOrName) { if (typeof idOrName === 'object') return idOrName; const s = String(idOrName).toLowerCase(); return this.apps.get(idOrName) || [...this.apps.values()].find(a => a.name.toLowerCase() === s) || null; }
  list() { return [...this.apps.values()].map(({ id, name, size, summary, document, updates }) => ({ id, name, size, summary, document, updates: updates.length })); }
  /** every update an app has, as the app sees them */
  updates(app, after = 0) { app = this.get(app); return app.updates.filter(u => u.serial > after).map(u => this._public(u, app.updates.length)); }
  /** watch every update of every app: fn(app, update) */
  onUpdate(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _public(u, max) { const o = { payload: u.payload, serial: u.serial, max_serial: max, sender: u.sender, timestamp: u.ts }; for (const k of ['info', 'document', 'summary', 'href']) if (u[k] != null) o[k] = u[k]; return o; }
  async _save(app) { if (this.store) await this.store.set(app.id, { updates: app.updates, ls: app.ls, summary: app.summary, document: app.document }); }
  /** send an update to an app as `who` ({ addr, name }); every open frame of the app receives it */
  send(app, update, who = { addr: 'agent@kit', name: 'Agent' }) {
    app = this.get(app); if (!app) return Promise.reject(new Error('no such app'));
    const run = (this._q.get(app.id) || Promise.resolve()).then(async () => {
      if (!update || typeof update !== 'object' || !('payload' in update)) throw new Error('an update needs a payload');
      const json = JSON.stringify(update.payload); if (json === undefined) throw new Error('payload must be JSON'); if (json.length > 128000) throw new Error('update payload is over 128 KB');
      const u = { serial: app.updates.length + 1, payload: JSON.parse(json), sender: who.addr, senderName: who.name, ts: Date.now() };
      for (const k of ['info', 'document', 'summary', 'href', 'notify']) if (update[k] != null) u[k] = update[k];
      app.updates.push(u); if (u.summary != null) app.summary = String(u.summary); if (u.document != null) app.document = String(u.document);
      await this._save(app);
      for (const s of this.sessions) if (s.app === app) s._deliver([u]);
      for (const f of this.listeners) { try { f(app, this._public(u, app.updates.length)); } catch {} }
      return this._public(u, app.updates.length);
    });
    this._q.set(app.id, run.catch(() => {})); return run;
  }
  /**
   * Open an app in an iframe inside `container`.
   * @param {{ container: HTMLElement, self?: { addr: string, name: string }, onSendToChat?: (msg) => void, onOpen?: (url) => void }} o
   */
  open(appRef, { container, self = { addr: 'user@kit', name: 'You' }, onSendToChat = null, onOpen = null } = {}) {
    const app = this.get(appRef); if (!app) throw new Error('no such app'); if (!container) throw new Error('container is required');
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-downloads');
    frame.setAttribute('allow', 'autoplay; fullscreen'); frame.title = app.name; frame.style.cssText = 'border:0;width:100%;height:100%;display:block;background:#fff';
    const host = this;
    const sess = {
      app, frame, listening: false, lastSent: 0,
      post: m => frame.contentWindow?.postMessage(Object.assign({ __xdc: 1 }, m), '*'),
      _deliver(ups) { if (!this.listening) return; const max = app.updates.length; for (const u of ups) if (u.serial > this.lastSent) { this.post({ t: 'update', update: host._public(u, max) }); this.lastSent = u.serial; } },
      /** send an update into the app as another peer (the agent by default) */
      send: (update, who) => host.send(app, update, who),
      reload: () => { sess.listening = false; sess.lastSent = 0; frame.srcdoc = xdcPage(app, self); },
      close: () => { window.removeEventListener('message', onMsg); frame.remove(); host.sessions.delete(sess); },
    };
    const onMsg = async (e) => {
      if (e.source !== frame.contentWindow || !e.data?.__xdc) return; const m = e.data;
      const reply = (data, error) => sess.post({ t: 'reply', id: m.id, data, error });
      try {
        if (m.t === 'listen') { sess.listening = true; sess.lastSent = +m.serial || 0; sess._deliver(app.updates); sess.post({ t: 'listen-done' }); }
        else if (m.t === 'send') await host.send(app, m.update, self);
        else if (m.t === 'all') reply(app.updates.map(u => host._public(u, app.updates.length)));
        else if (m.t === 'ls') { app.ls = m.data || {}; await host._save(app); }
        else if (m.t === 'file') { const d = app.files[m.data]; if (!d) reply(null, 'not found: ' + m.data); else reply({ bytes: d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength), type: xmime(m.data) }); }
        else if (m.t === 'chat') { onSendToChat?.(m.data); reply(null); }
        else if (m.t === 'open') { if (onOpen) onOpen(m.url); else if (/^https?:/i.test(m.url)) window.open(m.url, '_blank', 'noopener'); }
      } catch (err) { if (m.id) reply(null, String(err.message || err)); }
    };
    window.addEventListener('message', onMsg);
    container.appendChild(frame); this.sessions.add(sess); sess.reload();
    return sess;
  }
  /** the app's files as a .xdc (zip) */
  pack(app) { return zipStore(this.get(app).files); }
  /** forget an app's updates and storage */
  async reset(app) { app = this.get(app); app.updates = []; app.ls = {}; app.summary = ''; app.document = ''; await this._save(app); }
}
export { unzip, zipStore };
