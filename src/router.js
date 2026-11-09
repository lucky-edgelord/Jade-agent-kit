// Routers. Each saves context or money on every turn, and each can be left out.
//   ToolRouter: send the model only the tools that fit the message. The core tools are always sent; the others when the
//     message points at them (BM25 on name + description + hint words), when they were used earlier in the chat, or when
//     the model asks for them with more_tools. Once offered, a tool stays offered (a stable list keeps the prompt cache).
//   ModelRouter: before each prompt a decision model picks which listed model answers it, from a note on what each is
//     good at. If the decision fails or is unsure, the agent's own model answers.
import { BM25 } from './bm25.js';

export const CORE = ['read', 'write', 'edit', 'bash', 'tasks', 'search', 'fetch', 'memory', 'skill', 'find_skill', 'more_tools'];
export const HINTS = {
  python: 'python script py micropython', javascript: 'javascript js node script', sqlite: 'sql database table query db sqlite vector',
  search_files: 'find files grep which file where', decide: 'classify triage route judge decision yes no score',
  schedule: 'schedule remind reminder daily weekly cron every later recurring', sentry: 'sentry rule trigger watch event battery when happens automatically',
  think: 'think reason deliberate tree verify hard problem puzzle plan', delegate: 'delegate sub-agent subagent side job helper research',
  chat_history: 'previous earlier chat conversation history said session', knowledge: 'knowledge graph fact facts verify prove proof contradiction consistent claim rule logic datalog',
};
const STOP = new Set('a an and are as at be but by can could do does did for from has have how i if in into is it its me my no not of on or our please so than thanks that the their them then there these they this to us was we what when where which who why will with would yes you your'.split(' '));

export class ToolRouter {
  /** @param {{ kit: object, core?: string[], hints?: object, max?: number, minSaving?: number }} o minSaving: route only when the optional tools are at least this many characters */
  constructor({ kit, core = CORE, hints = HINTS, max = 5, minSaving = 6000 } = {}) { Object.assign(this, { kit, core: new Set(core), hints, max, minSaving }); }
  _text(t) { const n = t.function.name; return `${n} ${this.hints[n] || ''} ${this.hints[n] || ''} ${t.function.description}`; }
  /** the names to send for a query, given all names and the ones used or loaded before */
  pick(names, query, sticky = new Set()) {
    const tools = this.kit.tools.openai(names.filter(n => n !== 'more_tools'));
    const opt = tools.filter(t => !this.core.has(t.function.name)); if (!opt.length) return { send: names, hidden: [] };
    if (opt.reduce((a, t) => a + JSON.stringify(t).length, 0) < this.minSaving) return { send: names, hidden: [] };
    const keep = new Set(sticky); const lower = ' ' + String(query).toLowerCase().replace(/[^a-z0-9_ ]+/g, ' ') + ' ';
    for (const t of opt) if (lower.includes(' ' + t.function.name.toLowerCase() + ' ')) keep.add(t.function.name);
    const q = String(query).split(/\s+/).filter(w => !STOP.has(w.toLowerCase().replace(/[^a-z']/g, ''))).join(' ');
    if (q.trim()) { const r = new BM25(opt.map(t => ({ id: t.function.name, text: this._text(t) }))).search(q, { limit: this.max }); const top = r[0]?.score || 0; for (const x of r.filter(x => x.score >= Math.max(0.5 * top, 1.2))) keep.add(x.id); }
    const optNames = new Set(opt.map(t => t.function.name));
    const send = names.filter(n => !optNames.has(n) || keep.has(n));
    return { send, hidden: [...optNames].filter(n => !keep.has(n)), kept: [...keep].filter(n => optNames.has(n)) };
  }
  get toolDefs() {
    return { more_tools: {
      description: 'Load tools that exist but are not loaded yet, to save context. Give names, or a short description of the job; they are callable from your next step.',
      parameters: { type: 'object', properties: { names: { type: 'array', items: { type: 'string' } }, query: { type: 'string' } } },
      run: (a, ctx = {}) => {
        const st = ctx.agent?.state; const hidden = st?.toolsHidden || [];
        const all = this.kit.tools.openai(hidden.length ? hidden : this.kit.tools.names().filter(n => !this.core.has(n)));
        const want = new Set((Array.isArray(a.names) ? a.names : typeof a.names === 'string' ? a.names.split(/[,\s]+/) : []).map(x => String(x).trim()).filter(Boolean));
        if (a.query) for (const x of new BM25(all.map(t => ({ id: t.function.name, text: this._text(t) }))).search(String(a.query), { limit: 4 })) want.add(x.id);
        const hits = all.filter(t => want.has(t.function.name));
        if (!hits.length) return `No tool matches. Not loaded: ${all.map(t => t.function.name).join(', ') || 'none'}.`;
        if (st) st.toolsLoaded = [...new Set([...(st.toolsLoaded || []), ...hits.map(t => t.function.name)])];
        return `Loaded ${hits.length} tool${hits.length > 1 ? 's' : ''}; call ${hits.length > 1 ? 'them' : 'it'} from your next step:\n` + hits.map(t => `- ${t.function.name}: ${String(t.function.description).slice(0, 220)}`).join('\n');
      },
    } };
  }
  /** an agent plugin: routes the tool list on every step */
  plugin() {
    return { name: 'tool-router',
      select: (agent, names, { query }) => {
        const used = new Set(agent.state.toolsLoaded || []);
        for (const m of agent.messages.slice(-80)) if (m.role === 'assistant') for (const c of m.tool_calls || []) used.add(c.function?.name);
        const r = this.pick(names, query, used);
        agent.state.toolsLoaded = [...new Set([...(agent.state.toolsLoaded || []), ...(r.kept || [])])];
        agent.state.toolsHidden = r.hidden;
        return r.hidden.length ? [...r.send.filter(n => n !== 'more_tools'), 'more_tools'] : r.send.filter(n => n !== 'more_tools');
      } };
  }
}

const ROUTER_Q = "Which model should answer the user's latest message? Each option describes what a model is good at. Pick the cheapest option that can answer this message well; pick a stronger one only when the message needs it.";

export class ModelRouter {
  /**
   * @param {{ kit: object, models: Array<{ model: string, note: string, provider?: 'cloud'|'local' }>, decider?: string, min?: number }} o
   *   models: at least two, each with a note on what it is good at; decider: the decision model (default the kit's); min: confidence below this keeps the agent's model
   */
  constructor({ kit, models = [], decider = null, min = 0 } = {}) { Object.assign(this, { kit, models: models.filter(m => m && m.model), decider, min }); }
  /** the state a decision model reads: the previous reply's end and the latest message */
  state(messages) {
    const users = messages.map((m, i) => [m, i]).filter(([m]) => m.role === 'user'); if (!users.length) return '';
    const [last, i] = users.at(-1); const prev = messages.slice(0, i).reverse().find(m => m.role === 'assistant' && m.content);
    return ((prev ? `Previous reply (end): ${String(prev.content).slice(-600)}\n\n` : '') + `Latest message: ${last.content}`).slice(-4000);
  }
  /** pick a model for a state → { model, provider, note, confidence, ms } */
  async pick(state, { signal } = {}) {
    if (this.models.length < 2) throw new Error('the model router needs at least two models');
    const t0 = Date.now(); const notes = this.models.map(m => String(m.note || m.model));
    const d = await this.kit.decide({ state, question: ROUTER_Q, type: 'choice', options: notes, ...(this.decider ? { model: this.decider } : {}), signal });
    const i = notes.indexOf(String(d.choice)); if (i < 0) throw new Error(`the decision model answered ${JSON.stringify(d.choice)}`);
    return { ...this.models[i], confidence: d.confidence, ms: Date.now() - t0 };
  }
  /** an agent plugin: picks the model for each prompt */
  plugin() {
    return { name: 'model-router',
      route: async agent => {
        try {
          const p = await this.pick(this.state(agent.messages));
          if (p.confidence != null && p.confidence < this.min) { agent.emit({ type: 'route', model: agent.model, note: `router unsure (${Math.round(p.confidence * 100)}%)` }); return null; }
          const o = await this.kit.use('ollama'); const client = p.provider === 'cloud' ? o.cloud : p.provider === 'local' ? o.local : agent.client;
          return { client, model: p.model, note: p.note, confidence: p.confidence };
        } catch (e) { agent.emit({ type: 'route', model: agent.model, note: 'router failed: ' + e.message }); return null; }
      } };
  }
}
