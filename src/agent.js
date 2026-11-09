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
   *           options?: object, onEvent?: (e: object) => void }} o
   * Events: { type: 'thinking'|'text', delta } · { type: 'tool_call', name, args } · { type: 'tool_result', name, result } ·
   *         { type: 'turn_end', message } · { type: 'done', text } · { type: 'error', error }
   */
  constructor({ kit, provider = null, ollama = null, model = null, system = SYSTEM, tools = DEFAULT_TOOLS, think = undefined, maxSteps = 40, options = undefined, onEvent = null }) {
    // which Ollama: one you pass, or 'cloud' / 'local' (default: the cloud when the kit has a key, else the local one)
    // kit.tools and kit.ollama / kit.local are loaded by kit.agent() before this runs
    provider ||= kit.ollama.apiKey ? 'cloud' : 'local';
    this.client = ollama || (provider === 'cloud' ? kit.ollama : kit.local);
    model ||= this.client.cloud ? 'gpt-oss:120b' : 'qwen3:8b';
    Object.assign(this, { kit, model, system, toolNames: tools, think, maxSteps, options, onEvent });
    this.messages = []; this.ctrl = null;
  }
  emit(e) { try { this.onEvent?.(e); } catch {} }
  reset() { this.messages = []; }
  /** stop the current run */
  abort() { this.ctrl?.abort(); }
  /**
   * Send a message and run until the model answers without calling a tool.
   * @returns {Promise<string>} the final answer
   */
  async prompt(text, { images } = {}) {
    if (this.ctrl) throw new Error('the agent is already running');
    const ctrl = this.ctrl = new AbortController(); const signal = ctrl.signal;
    const tools = this.kit.tools.openai(this.toolNames);
    this.messages.push({ role: 'user', content: String(text), ...(images?.length ? { images } : {}) });
    try {
      for (let step = 0; step < this.maxSteps; step++) {
        const msg = { role: 'assistant', content: '' }; let thinking = ''; const calls = [];
        for await (const ch of this.client.chat({ model: this.model, messages: [{ role: 'system', content: this.system }, ...this.messages], tools, ...(this.think !== undefined ? { think: this.think } : {}), ...(this.options ? { options: this.options } : {}), signal })) {
          const m = ch.message || {};
          if (m.thinking) { thinking += m.thinking; this.emit({ type: 'thinking', delta: m.thinking }); }
          if (m.content) { msg.content += m.content; this.emit({ type: 'text', delta: m.content }); }
          if (m.tool_calls?.length) calls.push(...m.tool_calls);
        }
        if (thinking) msg.thinking = thinking;
        if (calls.length) msg.tool_calls = calls;
        this.messages.push(msg); this.emit({ type: 'turn_end', message: msg });
        if (!calls.length) { this.emit({ type: 'done', text: msg.content }); return msg.content; }
        for (const c of calls) {
          const name = c.function?.name; let args = c.function?.arguments ?? {};
          if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
          this.emit({ type: 'tool_call', name, args });
          const result = await this.kit.tools.call(name, args, { signal });
          this.emit({ type: 'tool_result', name, result });
          this.messages.push({ role: 'tool', tool_name: name, content: result });
          if (signal.aborted) throw new DOMException('stopped', 'AbortError');
        }
      }
      const note = `(stopped after ${this.maxSteps} steps)`; this.emit({ type: 'done', text: note }); return note;
    } catch (e) {
      if (e?.name === 'AbortError') { this.emit({ type: 'done', text: '(stopped)' }); return '(stopped)'; }
      this.emit({ type: 'error', error: e }); throw e;
    } finally { this.ctrl = null; }
  }
}
