// Jade Agent Base (https://github.com/lucky-edgelord/jade-agent-base): connect the kit to a server an agent runs.
//   const base = await kit.use('base');
//   await base.connect({ url: 'https://shop.example.com', token: '<agent token from `jab agent create`>' });
//   // the server's tools (collections, records, hooks, site, settings, …) are now the agent's: mcp__base__<tool>
//   await base.call('records_list', { collection: 'orders', filter: "status = 'open'" });
//   await base.collection('products').list({ filter: 'price < 20', sort: '-created' });   // the PocketBase records API
// The token is kept with the kit's secrets (BASE_TOKEN), so agents and scripts never see it.
export class Base {
  /** @param {{ kit: object, url?: string, token?: string, name?: string, exposure?: 'direct'|'mcp' }} o  (createKit({ base: { url, token } }) connects on use) */
  constructor({ kit, url = '', token = '', name = 'base', exposure = 'direct' } = {}) {
    Object.assign(this, { kit, url: url.replace(/\/+$/, ''), name, exposure, secret: name.toUpperCase().replace(/[^A-Z0-9]/g, '_') + '_TOKEN' });
    this.ready = url ? this.connect({ url, token }) : Promise.resolve();
  }
  async _token() { const s = await this.kit.use('secrets'); await s.ready; return s.get(this.secret) || ''; }
  /** connect: remember the server and token, and add its tools for agents (over MCP) → the server's info */
  async connect({ url = this.url, token } = {}) {
    if (!/^https?:\/\//.test(url || '')) throw new Error('base.connect needs { url: "https://…" }');
    this.url = url.replace(/\/+$/, '');
    if (token) await (await this.kit.use('secrets')).set(this.secret, token);
    const mcp = await this.kit.use('mcp');
    await mcp.add(this.name, { url: this.url + '/api/agent/mcp', headers: { Authorization: '${' + this.secret + '}' }, exposure: this.exposure, description: 'Jade Agent Base: data, server-side code, the website and settings' });
    return this.call('server_info');
  }
  async _fetch(path, { method = 'GET', body, auth = true, query } = {}) {
    if (!this.url) throw new Error('not connected: call base.connect({ url, token }) first');
    const u = new URL(this.url + path); for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') u.searchParams.set(k, String(v));
    const headers = { 'Content-Type': 'application/json' }; if (auth) { const t = await this._token(); if (t) headers.Authorization = t; }
    const r = await fetch(u, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!r.ok) { const m = data?.error || data?.message || text || r.statusText; const e = new Error(`${r.status}: ${m}${data?.data && Object.keys(data.data).length ? ' ' + JSON.stringify(data.data) : ''}`); e.status = r.status; e.data = data; throw e; }
    return data;
  }
  /** the tools this token may use: [{ name, description, scope, parameters }] */
  tools() { return this._fetch('/api/agent/tools'); }
  /** run a server tool → its result (throws with the server's message) */
  async call(name, args = {}) { return (await this._fetch('/api/agent/tools/' + encodeURIComponent(name), { method: 'POST', body: args })).result; }
  /** is the server up? */
  async health() { try { return (await this._fetch('/api/health', { auth: false }))?.code === 200; } catch { return false; } }
  /** a collection through the PocketBase records API (its API rules apply to the token) */
  collection(name) {
    const p = '/api/collections/' + encodeURIComponent(name) + '/records';
    return {
      list: ({ page, perPage, filter, sort, expand, fields } = {}) => this._fetch(p, { query: { page, perPage, filter, sort, expand, fields } }),
      get: (id, { expand } = {}) => this._fetch(`${p}/${encodeURIComponent(id)}`, { query: { expand } }),
      create: data => this._fetch(p, { method: 'POST', body: data }),
      update: (id, data) => this._fetch(`${p}/${encodeURIComponent(id)}`, { method: 'PATCH', body: data }),
      delete: id => this._fetch(`${p}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    };
  }
  /** sign in as a user of an auth collection (e.g. users) and use that token from now on → the user record */
  async signIn(email, password, { collection = 'users' } = {}) {
    const r = await this._fetch(`/api/collections/${encodeURIComponent(collection)}/auth-with-password`, { method: 'POST', body: { identity: email, password }, auth: false });
    await (await this.kit.use('secrets')).set(this.secret, r.token); return r.record;
  }
  /** forget the token and remove the server's tools */
  async disconnect() { const s = await this.kit.use('secrets'); await s.remove(this.secret); try { await (await this.kit.use('mcp')).remove?.(this.name); } catch {} }
}
