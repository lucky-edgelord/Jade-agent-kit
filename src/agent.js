// A small coding agent in the style of pi: a model on Ollama (Cloud, or on a machine), a loop, and six tools —
// read, write, edit, bash (the kit's shell, with node / python / sqlite3), search and fetch (Ollama web search/fetch).
export const DEFAULT_TOOLS = ['read', 'write', 'edit', 'bash', 'search', 'fetch'];

const SYSTEM = `You are a capable assistant working in a sandboxed browser workspace with a Unix-like file system.
Tools:
- read: read a file (numbered lines)
- write: create or overwrite a file
- edit: replace exact text in a file (read it first; oldText must match exactly)
- bash: run shell commands (ls, cat, grep, find, sed, awk, …), plus node, python and sqlite3
- search: search the web
- fetch: fetch a web page
Work step by step. Prefer edit over rewriting whole files. Check your work (run it, read it back). Be concise in your final answer.`;

export class Agent {
  /**
   * @param {{ kit: object, provider?: 'cloud'|'local', ollama?: object, model?: string, system?: string, tools?: string[], think?: boolean|'low'|'medium'|'high', maxSteps?: number,
   *           options?: object, plugins?: object[], id?: string, title?: string, onEvent?: (e: object) => void }} o
   * Events: { type: 'thinking'|'text', delta } · { type: 'tool_call', name, args } · { type: 'tool_result', name, result } ·
   *         { type: 'turn_end', message } · { type: 'done', text } · { type: 'error', error } · { type: 'route', model } · { type: 'context', … }
   *
   * Plugins (what kit.agent({ brain }) adds; write your own the same way). Every hook is optional and may be async:
   *   tools: ['memory']                                  tool names the plugin adds to the agent's list
   *   system(agent, { query }) → string                  text appended to the system prompt (once per prompt)
   *   route(agent, { query }) → { client?, model? }      the model for this prompt (first plugin that answers wins)
   *   select(agent, names, { query }) → names            the tools sent on this step
   *   prepare(agent, { messages, tools, client, model }) → messages   the request about to be sent (compaction, trimming)
   *   recover(agent, error, { messages, tools }) → true  retry the step once (e.g. after learning a context limit)
   *   after(agent, { text, prompt })                     when a prompt has finished (journal, save the chat)
   */
  constructor({ kit, provider = null, ollama = null, model = null, system = SYSTEM, tools = DEFAULT_TOOLS, think = undefined, maxSteps = 40, options = undefined, plugins = [], id = null, title = '', onEvent = null }) {
    // which Ollama: one you pass, or 'cloud' / 'local' (default: the kit's provider, else the cloud when there is a key)
    // kit.tools and kit.ollama / kit.local are loaded by kit.agent() before this runs
    provider ||= kit.config.provider || (kit.ollama.apiKey ? 'cloud' : 'local');
    this.client = ollama || (provider === 'cloud' ? kit.ollama : kit.local);
    model ||= kit.config.model || (this.client.cloud ? 'gpt-oss:120b' : 'qwen3:8b');
    Object.assign(this, { kit, model, system, toolNames: tools, think, maxSteps, options, plugins, onEvent, title });
    this.id = id || 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.messages = []; this.ctrl = null; this.state = {};   // state: room for plugins (sticky tools, compactions, …)
  }
  emit(e) { try { this.onEvent?.(e); } catch {} }
  reset() { this.messages = []; this.state = {}; }
  /** stop the current run */
  abort() { this.ctrl?.abort(); }
  /** the text the brain matches against: the user's last two messages */
  query() { return this.messages.filter(m => m.role === 'user').slice(-2).map(m => String(m.content || '')).join('\n').slice(-1500); }
  async _hooks(name, ...a) { const out = []; for (const p of this.plugins) if (typeof p[name] === 'function') { try { out.push(await p[name](this, ...a)); } catch (e) { this.emit({ type: 'plugin_error', plugin: p.name, hook: name, error: e }); } } return out; }
  /**
   * Send a message and run until the model answers without calling a tool.
   * @returns {Promise<string>} the final answer
   */
  async prompt(text, { images } = {}) {
    if (this.ctrl) throw new Error('the agent is already running');
    const ctrl = this.ctrl = new AbortController(); const signal = ctrl.signal;
    this.messages.push({ role: 'user', content: String(text), ...(images?.length ? { images } : {}) });
    if (!this.title) this.title = String(text).replace(/\s+/g, ' ').trim().slice(0, 60);
    const query = this.query();
    let client = this.client, model = this.model;
    try {
      for (const r of await this._hooks('route', { query })) if (r && (r.client || r.model)) { client = r.client || client; model = r.model || model; this.emit({ type: 'route', model, note: r.note, confidence: r.confidence }); break; }
      const extra = (await this._hooks('system', { query })).filter(Boolean).join(''); const system = this.system + extra;   // hooks first: a plugin may replace agent.system
      const base = [...new Set([...this.toolNames, ...this.plugins.flatMap(p => p.tools || [])])];
      for (let step = 0; step < this.maxSteps; step++) {
        let names = base; for (const p of this.plugins) if (p.select) { try { names = await p.select(this, names, { query }) || names; } catch {} }
        const tools = this.kit.tools.openai(names);
        const msg = { role: 'assistant', content: '' }; let thinking = ''; const calls = [];
        for (let attempt = 0; ; attempt++) {
          let messages = [{ role: 'system', content: system }, ...this.messages];
          for (const p of this.plugins) if (p.prepare) messages = await p.prepare(this, { messages, tools, client, model }) || messages;
          try {
            for await (const ch of client.chat({ model, messages, tools, ...(this.think !== undefined ? { think: this.think } : {}), ...(this.options ? { options: this.options } : {}), signal })) {
              const m = ch.message || {};
              if (m.thinking) { thinking += m.thinking; this.emit({ type: 'thinking', delta: m.thinking }); }
              if (m.content) { msg.content += m.content; this.emit({ type: 'text', delta: m.content }); }
              if (m.tool_calls?.length) calls.push(...m.tool_calls);
            }
            break;
          } catch (e) {
            if (e?.name === 'AbortError' || attempt > 0 || msg.content || calls.length || !(await this._hooks('recover', e, { messages, tools })).includes(true)) throw e;
          }
        }
        if (thinking) msg.thinking = thinking;
        if (calls.length) msg.tool_calls = calls;
        this.messages.push(msg); this.emit({ type: 'turn_end', message: msg });
        if (!calls.length) return await this._finish(msg.content, text);
        for (const c of calls) {
          const name = c.function?.name; let args = c.function?.arguments ?? {};
          if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
          this.emit({ type: 'tool_call', name, args });
          const result = await this.kit.tools.call(name, args, { signal, agent: this });
          this.emit({ type: 'tool_result', name, result });
          this.messages.push({ role: 'tool', tool_name: name, content: result });
          if (signal.aborted) throw new DOMException('stopped', 'AbortError');
        }
      }
      return await this._finish(`(stopped after ${this.maxSteps} steps)`, text);
    } catch (e) {
      if (e?.name === 'AbortError') { this.ctrl = null; return await this._finish('(stopped)', text); }
      this.emit({ type: 'error', error: e }); throw e;
    } finally { this.ctrl = null; }
  }
  async _finish(out, prompt) { this.ctrl = null; await this._hooks('after', { text: out, prompt }); this.emit({ type: 'done', text: out }); return out; }
}
