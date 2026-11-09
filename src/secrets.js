// Secrets: API keys, tokens and passwords your app gives the kit, for playbooks ({{ secrets.NAME }}) and HTTP requests.
// They are kept out of the file system (scripts and the agent's tools cannot read them) and out of logs: every value is
// redacted from playbook logs and HTTP results. With createKit({ persist }) they are kept in IndexedDB; otherwise in memory.
import { idbStore } from './util.js';

export class Secrets {
  /** @param {{ persist?: string|false, values?: Record<string, string> }} o */
  constructor({ persist = false, values = null } = {}) { this.store = persist ? idbStore('jade-agent-kit-secrets:' + persist) : null; this.v = new Map(); this.ready = this._load(values); }
  async _load(values) { if (this.store) { try { for (const [k, v] of Object.entries((await this.store.get('secrets')) || {})) this.v.set(k, v); } catch {} } for (const [k, v] of Object.entries(values || {})) this.v.set(k, String(v)); }
  async _save() { if (this.store) await this.store.set('secrets', Object.fromEntries(this.v)); }
  static check(name) { name = String(name || '').trim(); if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw new Error('a secret name is letters, digits and _ (like OPENWEATHER_KEY)'); return name; }
  async set(name, value) { await this.ready; this.v.set(Secrets.check(name), String(value ?? '')); await this._save(); }
  async remove(name) { await this.ready; const had = this.v.delete(String(name)); await this._save(); return had; }
  /** the names only (what an agent may know) */
  names() { return [...this.v.keys()].sort(); }
  has(name) { return this.v.has(String(name)); }
  get(name) { return this.v.get(String(name)); }
  /** name → value, for templates */
  map() { return Object.fromEntries(this.v); }
  /** replace every secret value in text with {{NAME}} */
  redact(text) { let s = String(text ?? ''); for (const [k, v] of this.v) if (v && v.length >= 4) s = s.split(v).join(`{{${k}}}`); return s; }
  get toolDefs() {
    return { secrets: {
      description: 'The names of the secrets (API keys, tokens) the app has given you. You never see their values: use them as {{ secrets.NAME }} in playbooks and http requests.',
      parameters: { type: 'object', properties: {} },
      run: async () => { await this.ready; const n = this.names(); return n.length ? 'Secrets you can use: ' + n.join(', ') : 'No secrets have been set.'; },
    } };
  }
}
