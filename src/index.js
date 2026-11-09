// Jade Agent Kit: a browser workspace for AI agents, loadable from a CDN, and lean: createKit() loads only the
// virtual file system and this loader. Every feature is its own module, fetched the first time it is used:
//   const kit = await createKit({ persist: 'my-app' });
//   const py = await kit.use('python');            // or createKit({ use: ['python', 'sqlite'] })
//   await kit.run('ls /');                          // async helpers load what they need
// Each module also works on its own: import { BM25 } from '…/dist/bm25.js'.
import { VFS } from './vfs.js';
import { setAssetsBase, getAssetsBase } from './util.js';

export const VERSION = '0.5.0';
const OLLAMA_LOCAL = 'http://localhost:11434';

/** every feature: what kit.use(name) loads and how it is set up */
const FEATURES = {
  busybox: async k => { const { BusyBox } = await import('./busybox.js'); const b = new BusyBox(k.vfs); if (k.config.busybox !== false) b.load(); return b; },
  shell: async k => {
    const { createShell } = await import('./shell.js');
    const cmd = (feature) => async c => (await k.use(feature)).command()(c);
    const commands = { node: cmd('js'), js: cmd('js'), python: cmd('python'), python3: cmd('python'), sqlite3: cmd('sqlite') };
    const shell = createShell({ vfs: k.vfs, busybox: await k.use('busybox'), engine: k.config.engine, commands });
    k.sh = shell.session(); return shell;
  },
  js: async k => { const { JsRunner } = await import('./js.js'); return new JsRunner({ vfs: k.vfs, sqlite: () => k.use('sqlite'), ml: () => k.use('ml'), bridge: (op, a) => bridge(k, op, a) }); },
  python: async k => { const { Python } = await import('./python.js'); return new Python({ vfs: k.vfs, sqlite: () => k.use('sqlite'), cdn: k.config.cdn }); },
  sqlite: async k => { const { Sqlite } = await import('./sqlite.js'); return new Sqlite(k.vfs); },
  bm25: async k => { const m = await import('./bm25.js'); return { BM25: m.BM25, search: m.bm25Search, tokenize: m.tokenize, searchFiles: (q, o) => m.searchFiles(k.vfs, q, o) }; },
  ml: async k => { const { ML } = await import('./ml.js'); return new ML({ vfs: k.vfs, cdn: k.config.cdn }); },
  webxdc: async k => { const { Webxdc } = await import('./webxdc.js'); return new Webxdc({ vfs: k.vfs, persist: k.config.persist }); },
  ollama: async k => { const { Ollama, OLLAMA_CLOUD } = await import('./ollama.js'); const o = { cloud: new Ollama({ host: OLLAMA_CLOUD, apiKey: k.config.ollamaKey }), local: new Ollama({ host: k.config.ollamaHost }) }; k.ollama = o.cloud; k.local = o.local; return o; },
  vectors: async k => { const { createVectors } = await import('./vectors.js'); return createVectors(k); },
  decisions: async k => { const { Decisions } = await import('./decide.js'); return new Decisions({ ...(k.config.decide || {}), kit: k }); },
  tasks: async k => { const { Tasks } = await import('./tasks.js'); return new Tasks(k.vfs); },
  cron: async () => (await import('./schedule.js')).Cron,
  schedule: async k => { const { Scheduler } = await import('./schedule.js'); const s = new Scheduler(k); if (k.config.scheduler !== false) s.start(); return s; },
  sentry: async k => { const { Sentry } = await import('./sentry.js'); const s = new Sentry({ kit: k, allow: k.config.sentry?.allow || [] }); if (k.config.sentry?.start !== false) s.start(); return s; },
  tools: async k => { const { createTools } = await import('./tools.js'); const t = k.tools = createTools(k); for (const d of k._toolDefs) t.addAll(d); return t; },
  agent: async () => await import('./agent.js'),
  // the agent brain: each adds its tool(s) and a plugin for kit.agent({ brain }); options from createKit({ memory: {…}, … })
  memory: brain(async k => new (await import('./memory.js')).Memory({ kit: k, ...k.config.memory })),
  knowledge: brain(async k => new (await import('./knowledge.js')).Knowledge({ kit: k, ...k.config.knowledge })),
  think: brain(async k => new (await import('./think.js')).Think({ kit: k, ...k.config.think })),
  delegate: brain(async k => new (await import('./delegate.js')).Delegate({ kit: k, ...k.config.delegate })),
  skills: brain(async k => new (await import('./skills.js')).Skills({ kit: k, ...k.config.skills })),
  history: brain(async k => new (await import('./history.js')).History({ kit: k, ...k.config.history })),
  guard: brain(async k => new (await import('./guard.js')).ContextGuard({ kit: k, ...k.config.guard })),
  router: brain(async k => { await k.use('tools'); return new (await import('./router.js')).ToolRouter({ kit: k, ...k.config.router }); }),
  // automation: each adds its tool; options from createKit({ flows: {…}, … })
  secrets: brain(async k => { const { Secrets } = await import('./secrets.js'); const x = new Secrets({ persist: k.config.persist, values: k.config.secrets }); await x.ready; return x; }),
  flows: brain(async k => { const f = new (await import('./flows.js')).Flows({ kit: k, ...k.config.flows }); if (k.config.flows?.start !== false) f.start(); return f; }),
  playbooks: brain(async k => new (await import('./playbooks.js')).Playbooks({ kit: k, ...k.config.playbooks })),
  gantt: brain(async k => new (await import('./gantt.js')).Gantt({ kit: k, ...k.config.gantt })),
  autonomy: brain(async k => new (await import('./autonomy.js')).Autonomy({ kit: k, ...k.config.autonomy })),
  heartbeat: brain(async k => { const h = new (await import('./heartbeat.js')).Heartbeat({ kit: k, ...k.config.heartbeat }); if (k.config.heartbeat?.start) h.start(); return h; }),
  curiosity: brain(async k => { const c = new (await import('./curiosity.js')).Curiosity({ kit: k, ...k.config.curiosity }); if (k.config.curiosity?.start) c.start(); return c; }),
  lisp: brain(async k => new (await import('./lisp.js')).Lisp({ kit: k, ...k.config.lisp })),
  notes: brain(async k => new (await import('./notes.js')).Notes({ kit: k, ...k.config.notes })),
  // senses and devices
  http: brain(async k => new (await import('./http.js')).Http({ kit: k, ...k.config.http })),
  mcp: brain(async k => { await k.use('tools'); const m = new (await import('./mcp.js')).Mcp({ kit: k, ...k.config.mcp }); await m.ready; return m; }),
  senses: brain(async k => new (await import('./senses.js')).Senses({ kit: k, ...k.config.senses })),
  usb: brain(async k => new (await import('./usb.js')).Usb({ kit: k })),
  backup: brain(async k => new (await import('./backup.js')).Backup({ kit: k, ...k.config.backup })),
  models: brain(async k => new (await import('./router.js')).ModelRouter({ kit: k, ...(Array.isArray(k.config.models) ? { models: k.config.models } : k.config.models) })),
};
// a brain feature's tools join the kit's tool list (now, or when the tools load)
function brain(make) { return async k => { const f = await make(k); const d = f.toolDefs; if (d) { k._toolDefs.push(d); k.tools?.addAll(d); } return f; }; }
const ALIASES = { decide: 'decisions', schedules: 'schedule', scheduler: 'schedule', node: 'js', javascript: 'js', db: 'sqlite', kg: 'knowledge', steering: 'skills', playbook: 'playbooks', flow: 'flows', plans: 'gantt', sched: 'autonomy', queue: 'autonomy', 'tool-router': 'router', 'model-router': 'models', context: 'guard', chats: 'history' };
export const FEATURE_NAMES = Object.keys(FEATURES);
const KEEP = new Set(['agent', 'ollama']);   // kit.agent() stays the helper; ollama sets kit.ollama (the cloud) and kit.local itself

// scripts call back into the kit: kit.tool(name, args) / kit.list() / kit.decide({…}) / kit.shell(cmd)
async function bridge(k, op, a) {
  if (op === 'tool') return (await k.use('tools')).call(a.name, a.args || {});
  if (op === 'list') return (await k.use('tools')).names();
  if (op === 'decide') return k.decide(a);
  if (op === 'shell') { const r = await (await k.use('shell')).session().run(a.command); return { stdout: r.stdout, stderr: r.stderr, code: r.code }; }
  if (op === 'ask') return k.complete({ prompt: a.prompt, system: a.system, json: !!a.json });
  if (op === 'agent') { const ag = await k.agent({ brain: a.brain }); return ag.prompt(a.message); }
  if (op === 'flow') { const r = await (await k.use('flows')).run(a.name, a.input); if (r.status !== 'ok') throw new Error(`flow "${a.name}" ${r.status}: ${r.error}`); return r.output; }
  if (op === 'flows') return (await k.use('flows')).list().map(f => ({ name: f.name, description: f.description || '', trigger: f.trigger || { type: 'manual' } }));
  if (op === 'notify') { await k.notify(a.title, a.body); return true; }
  if (op === 'kv') { const p = '/.kit/kv.json'; let o = {}; try { o = JSON.parse(k.vfs.read(p)); } catch {} if (a.op === 'get') return o[a.k] ?? null; if (a.op === 'all') return o; o[a.k] = a.v; k.vfs.write(p, JSON.stringify(o)); return true; }
  throw new Error(`kit.${op} is not available in Jade Agent Kit`);
}

/**
 * Create a workspace. Only the file system is loaded; everything else comes with kit.use() or the helpers.
 * @param {{ persist?: string|false, files?: Record<string, string|Uint8Array>, use?: string[]|'all', ollamaKey?: string,
 *           ollamaHost?: string, decide?: { server?: 'ollaya'|'ollama'|'cloud', model?: string, host?: string, apiKey?: string },
 *           sentry?: { allow?: string[], start?: boolean }, assetsBase?: string, cdn?: string, engine?: 'auto'|'wasm'|'js',
 *           scheduler?: boolean, busybox?: boolean, provider?: 'cloud'|'local', model?: string,
 *           memory?: object, knowledge?: object, think?: object, delegate?: object, skills?: object, history?: object, guard?: object,
 *           router?: object, models?: Array<{ model, note, provider? }> }} [o]
 *   persist: an IndexedDB name; files (and webxdc updates) are kept across reloads under it
 *   use: features to load now (e.g. ['shell', 'python']), or 'all'
 *   ollamaKey / ollamaHost: Ollama Cloud key; Ollama on a machine (default http://localhost:11434)
 *   decide: decision server; sentry: { allow: ['camera', 'audio', 'location'] }
 *   assetsBase: where the kit's assets/ are if you host them; cdn: npm CDN for runtimes loaded on demand
 *   scheduler / sentry.start: start them when they are loaded (default true); busybox: start BusyBox with the shell
 *   provider / model: the default Ollama and model for agents and kit.complete(); memory, knowledge, …: options for the
 *   agent-brain features (see each module), models: the model router's list
 */
export async function createKit(o = {}) {
  const config = { persist: false, files: null, ollamaKey: '', ollamaHost: OLLAMA_LOCAL, decide: {}, cdn: 'https://cdn.jsdelivr.net/npm/', engine: 'auto', ...o };
  if (config.assetsBase) setAssetsBase(config.assetsBase);
  const vfs = new VFS({ persist: config.persist });
  const loaded = await vfs.load().catch(() => false);
  if (!loaded && config.files) vfs.import(config.files);
  const loading = new Map();
  const kit = {
    version: VERSION, config, vfs,
    /** the features that can be loaded */
    features: FEATURE_NAMES,
    /** is a feature loaded? */
    has: name => loading.has(ALIASES[name] || name),
    /**
     * Load features (each once) and return them: await kit.use('python') → the Python runner; kit.use('a', 'b') → [a, b].
     * After loading, a feature is also kit[name] (kit.python, kit.sqlite, …).
     */
    async use(...names) {
      names = names.flat(); if (names.length === 1 && names[0] === 'all') names = FEATURE_NAMES;
      const out = await Promise.all(names.map(n => {
        const name = ALIASES[n] || n; const f = FEATURES[name];
        if (!f) return Promise.reject(new Error(`unknown feature "${n}". Features: ${FEATURE_NAMES.join(', ')}`));
        if (!loading.has(name)) loading.set(name, f(kit).then(v => { if (!KEEP.has(name)) kit[name] = v; return v; }, e => { loading.delete(name); throw e; }));
        return loading.get(name);
      }));
      return names.length === 1 ? out[0] : out;
    },
    /** run a command line in the kit's main shell session (loads the shell) */
    async run(cmd, opts) { await kit.use('shell'); return kit.sh.run(cmd, opts); },
    /** run a tool by name, as an agent would (loads the tools and the feature behind the tool) */
    async tool(name, args, ctx) { return (await kit.use('tools')).call(name, args, ctx); },
    /** decide({ state, question, type: 'choice'|'score'|'yesno', options }) with a decision model */
    async decide(args) { return (await kit.use('decisions')).decide(args); },
    /** embeddings from Ollama on a machine */
    async embed(input, opts) { return (await kit.use('ollama')).local.embed(input, opts); },
    /**
     * A pi-style agent on Ollama (read, write, edit, bash, search, fetch): await kit.agent({ model }).
     * brain: what else it gets, each loaded only if asked for: true (memory, skills, history, guard), 'all', or a list of
     * memory | knowledge | think | delegate | skills | history | guard | router | models (or { name, ...options }).
     * resume: a saved chat's id (needs history) to carry on with.
     */
    async agent(opts = {}) {
      const [m] = await kit.use('agent', 'tools', 'ollama');
      let plugins = opts.plugins || [];
      if (opts.brain) plugins = [...await (await import('./brain.js')).brainPlugins(kit, opts.brain), ...plugins];
      const a = new m.Agent({ kit, ...opts, plugins });
      if (opts.resume) { const c = (await kit.use('history')).load(opts.resume); Object.assign(a, { id: c.id, title: c.title, messages: c.messages }); }
      return a;
    },
    /** tell the user: createKit({ notify(title, body) }), else a browser notification when permitted, else the console */
    async notify(title, body = '') {
      if (typeof kit.config.notify === 'function') return kit.config.notify(String(title), String(body));
      try { if (globalThis.Notification?.permission === 'granted') { new Notification(String(title), { body: String(body) }); return; } } catch {}
      console.info(`[notify] ${title}${body ? ': ' + body : ''}`);
    },
    /** one answer from the kit's model, not streamed: await kit.complete({ prompt | messages, system, json }) */
    async complete(o) { return (await import('./internal/llm.js')).complete(kit, o); },
  };
  Object.defineProperty(kit, '_toolDefs', { value: [] });   // brain features' tools, waiting for the tools to load
  if (config.use) await kit.use(config.use);
  return kit;
}

export { VFS, setAssetsBase, getAssetsBase };
