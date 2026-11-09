// Context guard: keep every request inside the model's context window. It estimates the whole request (system prompt,
// tool schemas, history), compacts old turns into a summary when the chat gets long, trims what is left if it still
// does not fit, and when a server says "prompt is too long" it learns that model's real limit and the step is retried.
import { complete, transcript } from './internal/llm.js';

const COMPACT_SYS = `You are compacting an agent conversation so the work can continue in a fresh context window. Write a concise but complete handoff summary in Markdown with exactly these sections:
## Goal
What the user wants overall.
## Progress
What has been done: files created or changed (exact paths), commands run and their outcomes.
## Key facts
Decisions, constraints, user preferences, important values, error messages, open questions.
## Current state
Where things stand right now.
## Next steps
What remains to do.
Keep exact file paths, function names, commands and numbers. Do not invent anything. Do not address the user.`;
export const isContextError = msg => /prompt is too long|maximum context length|context[_ ]length[_ ]exceeded|exceeds? (?:the )?(?:available |maximum )?context|context (?:size|window) (?:exceeded|is too small)|too many (?:input )?tokens|reduce the length of the (?:messages|prompt)|input is too long/i.test(String(msg));
const msgChars = m => String(m.content || '').length + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0) + 12;
const clip = (s, keep, why) => { s = String(s || ''); if (s.length <= keep) return s; const head = Math.round(keep * 0.7); return `${s.slice(0, head)}\n[… ${s.length - keep} characters ${why} …]\n${s.slice(-(keep - head))}`; };

export class ContextGuard {
  /**
   * @param {{ kit?: object, limit?: number, localLimit?: number, compactAt?: number, keepTurns?: number, compact?: boolean, ratio?: number }} o
   *   limit: the window for cloud models (default 131072 tokens); localLimit: for Ollama on a machine (its num_ctx, default 16384)
   *   compactAt: compact when the request passes this share of the window (default 0.85); keepTurns: recent turns kept as they are
   */
  constructor({ kit = null, limit = 131072, localLimit = 16384, compactAt = 0.85, keepTurns = 2, compact = true, ratio = 3.3 } = {}) {
    Object.assign(this, { kit, limit, localLimit, compactAt, keepTurns, compactOn: compact, defaultRatio: ratio });
    this.limits = {}; this.ratios = {}; this.last = null;
  }
  _key(client, model) { return `${client?.host || ''}:${model || ''}`; }
  ratio(key) { return this.ratios[key] || this.defaultRatio; }
  /** the window for a model: what was learned, else the configured limit */
  windowFor(client, model, options) {
    const base = client && !client.cloud ? (+options?.num_ctx || this.localLimit) : this.limit;
    const learned = this.limits[this._key(client, model)]; return learned ? Math.min(base, learned) : base;
  }
  /** estimated tokens for messages plus tool schemas */
  estimate(msgs, tools = [], key = '') { let c = JSON.stringify(tools || []).length, img = 0; for (const m of msgs) { c += msgChars(m); img += m.images?.length || 0; } return Math.ceil(c / this.ratio(key)) + img * 800; }
  target(lim) { return Math.max(2048, Math.floor(lim * Math.min(0.95, this.compactAt)) - Math.min(4096, Math.round(lim * 0.15))); }
  /** learn from a context error: the model's real limit and how many characters a token is */
  learn(message, est, key) {
    const num = s => +String(s).replace(/,/g, '');
    const maxM = /(?:maximum context length(?: is)?|context (?:length|size|window)(?: is| of)?|n_ctx|max(?:imum)?(?: allowed)?(?: tokens)?)\D{0,24}?(\d[\d,]{2,})/i.exec(message);
    const prM = /(?:prompt is too long|resulted in|request(?:ed)?|prompt has|prompt tokens?|input (?:is|of|length))\D{0,24}?(\d[\d,]{2,})/i.exec(message);
    if (prM && est) { const actual = num(prM[1]); if (actual > est) this.ratios[key] = Math.max(0.8, this.ratio(key) * est / actual * 0.97); }
    if (maxM && num(maxM[1]) >= 1024) this.limits[key] = num(maxM[1]);
    else if (!prM) this.limits[key] = Math.max(2048, Math.floor(Math.min(this.limits[key] || this.limit, est || this.limit) * 0.7));
  }
  /** make a request fit: shrink old tool results, then long messages, then drop the oldest turns, then the system prompt */
  shrink(msgs, tools, target, key = '') {
    let out = msgs.map(m => ({ ...m })); const fits = () => this.estimate(out, tools, key) <= target;
    const toolIdx = out.map((m, i) => m.role === 'tool' ? i : -1).filter(i => i >= 0);
    for (const keep of [2000, 800]) { for (const i of toolIdx.slice(0, -2)) out[i].content = clip(out[i].content, keep, 'left out to fit the context window; run the tool again if you need them'); if (fits()) return out; }
    for (const keep of [6000, 2000]) {
      for (const i of toolIdx) out[i].content = clip(out[i].content, keep, 'left out to fit the context window; read the part you need');
      for (const m of out) if (m.role !== 'system' && m.role !== 'tool' && String(m.content || '').length > keep * 2) m.content = clip(m.content, keep * 2, 'left out to fit the context window');
      if (fits()) return out;
    }
    const sys = out[0]?.role === 'system' ? out[0] : null; let rest = sys ? out.slice(1) : out; let dropped = 0;
    while (this.estimate([sys, ...rest].filter(Boolean), tools, key) > target) { const next = rest.findIndex((m, i) => i > 0 && m.role === 'user'); if (next <= 0) break; dropped += next; rest = rest.slice(next); }
    if (dropped) rest = [{ role: 'user', content: `[${dropped} earlier messages were left out to fit the model's context window.]` }, { role: 'assistant', content: 'Understood.' }, ...rest];
    out = [sys, ...rest].filter(Boolean);
    if (sys && !fits()) out[0] = { ...sys, content: clip(sys.content, Math.max(2000, Math.floor((target - this.estimate(rest, tools, key)) * this.ratio(key))), 'of the system prompt cut to fit the context window') };
    return out;
  }
  /**
   * Compact a message list: everything before the last keepTurns user turns becomes one summary.
   * @returns {Promise<{ messages: object[], summary: string, compacted: number } | null>} null when there is nothing to compact
   */
  async compact(messages, { keepTurns = this.keepTurns, client = null, model = null, signal } = {}) {
    const starts = messages.map((m, i) => m.role === 'user' && !m._summary ? i : -1).filter(i => i >= 0);
    if (starts.length <= keepTurns) return null;
    const keepFrom = keepTurns ? starts[starts.length - keepTurns] : messages.length;
    const prev = messages.find(m => m._summary)?.content.replace(/^\[[^\]]*\]\n/, '');
    let text = transcript(messages.slice(0, keepFrom).filter(m => !m._summary)); if (text.length > 60000) text = '[…the earliest part was trimmed…]\n' + text.slice(-60000);
    const summary = await complete(this.kit, { system: COMPACT_SYS, prompt: (prev ? `Previous summary:\n${prev}\n\n---\nConversation since that summary:\n\n` : 'Conversation:\n\n') + text, temperature: 0.2, client, model, signal });
    if (String(summary).trim().length < 20) throw new Error('the model returned an empty summary');
    return { summary, compacted: keepFrom, messages: [{ role: 'user', content: `[Summary of the earlier conversation, compacted to save context]\n${summary}`, _summary: true }, { role: 'assistant', content: 'Understood. I will continue from this summary.', _summary: true }, ...messages.slice(keepFrom)] };
  }
  /** an agent plugin: compact agent.messages when the request nears the window, trim the request if it still does not fit, learn limits from errors */
  plugin() {
    return { name: 'guard',
      prepare: async (agent, { messages, tools, client, model }) => {
        const key = this._key(client, model), lim = this.windowFor(client, model, agent.options), target = this.target(lim);
        let est = this.estimate(messages, tools, key), how = '';
        if (est > target && this.compactOn && this.kit) {
          try { const r = await this.compact(agent.messages, { client, model }); if (r) { agent.messages = r.messages; (agent.state.compactions ||= []).push({ at: Date.now(), compacted: r.compacted }); messages = [messages[0], ...agent.messages]; est = this.estimate(messages, tools, key); how = 'compacted'; agent.emit({ type: 'compaction', compacted: r.compacted, summary: r.summary }); } }
          catch (e) { agent.emit({ type: 'plugin_error', plugin: 'guard', hook: 'compact', error: e }); }
        }
        if (est > target) { messages = this.shrink(messages, tools, target, key); est = this.estimate(messages, tools, key); how = how ? how + '+trimmed' : 'trimmed'; }
        this.last = { est, lim, how, at: Date.now() }; agent.emit({ type: 'context', est, limit: lim, how });
        agent.state.lastEst = { key, est };
        return messages;
      },
      recover: (agent, err) => { if (!isContextError(err?.message)) return false; const l = agent.state.lastEst || {}; this.learn(err.message, l.est, l.key); return true; } };
  }
}
