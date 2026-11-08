// Ollama clients. One class for both places Ollama runs:
//   Ollama Cloud (https://ollama.com, API key): chat with tools, web search, web fetch
//   Ollama on a machine (default http://localhost:11434): chat with tools and embeddings
export const OLLAMA_CLOUD = 'https://ollama.com';
export const OLLAMA_LOCAL = 'http://localhost:11434';

export class Ollama {
  /** @param {{ host?: string, apiKey?: string }} o */
  constructor({ host = OLLAMA_LOCAL, apiKey = '' } = {}) { this.host = String(host).replace(/\/+$/, ''); this.apiKey = apiKey; }
  get cloud() { return /^https:\/\/(www\.)?ollama\.com$/i.test(this.host); }
  get name() { return this.cloud ? 'Ollama Cloud' : `Ollama at ${this.host}`; }
  get headers() { const h = { 'Content-Type': 'application/json' }; if (this.apiKey) h.Authorization = 'Bearer ' + this.apiKey; return h; }
  async _err(r) {
    let m = `HTTP ${r.status}`; try { const j = await r.json(); m = j.error || m; } catch {}
    if (r.status === 401) m = this.cloud ? 'the Ollama API key was rejected (401). Create one at https://ollama.com/settings/keys' : `${this.name} refused the request (401)`;
    else if (r.status === 404 && /model/i.test(m)) m += this.cloud ? '' : ' (pull it first: ollama pull <model>)';
    else if (r.status === 402 || r.status === 429) m += ' (usage limit)';
    return new Error(`${this.name}: ${m}`);
  }
  async _fetch(path, init = {}) {
    if (this.cloud && !this.apiKey) throw new Error('no Ollama Cloud API key: createKit({ ollamaKey }) or kit.ollama.apiKey = …');
    let r;
    try { r = await fetch(this.host + path, { ...init, headers: { ...this.headers, ...(init.headers || {}) } }); }
    catch (e) {
      if (e?.name === 'AbortError') throw e;
      throw new Error(this.cloud ? `could not reach Ollama Cloud (${e.message})` : `could not reach ${this.name}. Is "ollama serve" running? If it is, the browser blocked the request: start it with OLLAMA_ORIGINS set to this page's origin (or "*").`);
    }
    if (!r.ok) throw await this._err(r);
    return r;
  }
  _post(path, body, signal) { return this._fetch(path, { method: 'POST', body: JSON.stringify(body), signal }); }
  /** the models available here */
  async models() { const r = await this._fetch('/api/tags'); return ((await r.json()).models || []).map(m => m.name || m.model).filter(Boolean); }
  /**
   * Embeddings: POST /api/embed. Returns one vector per input (L2-normalized by Ollama).
   * @param {string|string[]} input @param {{ model?: string, dimensions?: number, truncate?: boolean, signal?: AbortSignal }} [o]
   */
  async embed(input, { model = 'embeddinggemma', dimensions, truncate = true, signal } = {}) {
    const one = !Array.isArray(input); const list = (one ? [input] : input).map(String);
    if (!list.length) return [];
    const out = [];
    for (let i = 0; i < list.length; i += 64) {
      const r = await this._post('/api/embed', { model, input: list.slice(i, i + 64), truncate, ...(dimensions ? { dimensions } : {}) }, signal);
      out.push(...((await r.json()).embeddings || []));
    }
    return one ? out[0] : out;
  }
  /** Ollama Cloud web search: { results: [{ title, url, content }] } */
  async webSearch(query, { maxResults = 5, signal } = {}) { return (await this._post('/api/web_search', { query: String(query), max_results: Math.max(1, Math.min(10, +maxResults || 5)) }, signal)).json(); }
  /** Ollama Cloud web fetch: { title, content, links } */
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
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue; const j = JSON.parse(line); if (j.error) throw new Error(`${this.name}: ${j.error}`); yield j; }
    }
    if (buf.trim()) { const j = JSON.parse(buf); if (j.error) throw new Error(`${this.name}: ${j.error}`); yield j; }
  }
}
/** Ollama Cloud: new OllamaCloud({ apiKey }) */
export class OllamaCloud extends Ollama { constructor({ apiKey = '', host = OLLAMA_CLOUD } = {}) { super({ host, apiKey }); } }
