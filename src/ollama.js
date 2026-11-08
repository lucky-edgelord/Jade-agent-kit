// Ollama Cloud (https://ollama.com): chat with tools (streamed), web search and web fetch, all with one API key.
export const OLLAMA_CLOUD = 'https://ollama.com';

export class OllamaCloud {
  /** @param {{ apiKey?: string, host?: string }} o */
  constructor({ apiKey = '', host = OLLAMA_CLOUD } = {}) { this.apiKey = apiKey; this.host = host.replace(/\/+$/, ''); }
  get headers() { const h = { 'Content-Type': 'application/json' }; if (this.apiKey) h.Authorization = 'Bearer ' + this.apiKey; return h; }
  async _err(r) {
    let m = `HTTP ${r.status}`; try { const j = await r.json(); m = j.error || m; } catch {}
    if (r.status === 401) m = 'the Ollama API key was rejected (401). Create one at https://ollama.com/settings/keys';
    else if (r.status === 402 || r.status === 429) m += ' (Ollama Cloud usage limit)';
    return new Error(m);
  }
  async _post(path, body, signal) {
    if (!this.apiKey) throw new Error('no Ollama API key: createKit({ ollamaKey }) or kit.ollama.apiKey = …');
    const r = await fetch(this.host + path, { method: 'POST', headers: this.headers, body: JSON.stringify(body), signal });
    if (!r.ok) throw await this._err(r);
    return r;
  }
  /** the models this key can use */
  async models() { const r = await fetch(this.host + '/api/tags', { headers: this.headers }); if (!r.ok) throw await this._err(r); return ((await r.json()).models || []).map(m => m.name || m.model).filter(Boolean); }
  /** POST /api/web_search → { results: [{ title, url, content }] } */
  async webSearch(query, { maxResults = 5, signal } = {}) { return (await this._post('/api/web_search', { query: String(query), max_results: Math.max(1, Math.min(10, +maxResults || 5)) }, signal)).json(); }
  /** POST /api/web_fetch → { title, content, links } */
  async webFetch(url, { signal } = {}) { return (await this._post('/api/web_fetch', { url: String(url) }, signal)).json(); }
  /**
   * Streamed chat: yields Ollama's chunks ({ message: { content, thinking, tool_calls }, done, … }).
   * @param {{ model: string, messages: object[], tools?: object[], think?: boolean|string, options?: object, signal?: AbortSignal }} req
   */
  async *chat({ signal, ...req }) {
    const r = await this._post('/api/chat', { stream: true, ...req }, signal);
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; const j = JSON.parse(line); if (j.error) throw new Error(j.error); yield j; }
    }
    if (buf.trim()) { const j = JSON.parse(buf); if (j.error) throw new Error(j.error); yield j; }
  }
}
