// Jade Agent Kit: a browser workspace for AI agents, loadable from a CDN, and lean: createKit() loads only the
// virtual file system and this loader. Every feature is its own module, fetched the first time it is used:
//   const kit = await createKit({ persist: 'my-app' });
//   const py = await kit.use('python');            // or createKit({ use: ['python', 'sqlite'] })
//   await kit.run('ls /');                          // async helpers load what they need
// Each module also works on its own: import { BM25 } from '…/dist/bm25.js'.
import { VFS } from './vfs.js';
import { setAssetsBase, getAssetsBase } from './util.js';

export const VERSION = '0.2.0';
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
  tools: async k => { const { createTools } = await import('./tools.js'); return createTools(k); },
  agent: async () => await import('./agent.js'),
};
const ALIASES = { decide: 'decisions', schedules: 'schedule', scheduler: 'schedule', node: 'js', javascript: 'js', db: 'sqlite' };
export const FEATURE_NAMES = Object.keys(FEATURES);
const KEEP = new Set(['agent', 'ollama']);   // kit.agent() stays the helper; ollama sets kit.ollama (the cloud) and kit.local itself

// scripts call back into the kit: kit.tool(name, args) / kit.list() / kit.decide({…}) / kit.shell(cmd)
async function bridge(k, op, a) {
  if (op === 'tool') return (await k.use('tools')).call(a.name, a.args || {});
  if (op === 'list') return (await k.use('tools')).names();
  if (op === 'decide') return k.decide(a);
  if (op === 'shell') { const r = await (await k.use('shell')).session().run(a.command); return { stdout: r.stdout, stderr: r.stderr, code: r.code }; }
  throw new Error(`kit.${op} is not available in Jade Agent Kit`);
}

/**
 * Create a workspace. Only the file system is loaded; everything else comes with kit.use() or the helpers.
 * @param {{ persist?: string|false, files?: Record<string, string|Uint8Array>, use?: string[]|'all', ollamaKey?: string,
 *           ollamaHost?: string, decide?: { server?: 'ollaya'|'ollama'|'cloud', model?: string, host?: string, apiKey?: string },
 *           sentry?: { allow?: string[], start?: boolean }, assetsBase?: string, cdn?: string, engine?: 'auto'|'wasm'|'js',
 *           scheduler?: boolean, busybox?: boolean }} [o]
 *   persist: an IndexedDB name; files (and webxdc updates) are kept across reloads under it
 *   use: features to load now (e.g. ['shell', 'python']), or 'all'
 *   ollamaKey / ollamaHost: Ollama Cloud key; Ollama on a machine (default http://localhost:11434)
 *   decide: decision server; sentry: { allow: ['camera', 'audio', 'location'] }
 *   assetsBase: where the kit's assets/ are if you host them; cdn: npm CDN for runtimes loaded on demand
 *   scheduler / sentry.start: start them when they are loaded (default true); busybox: start BusyBox with the shell
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
    /** a pi-style agent on Ollama (read, write, edit, bash, search, fetch): await kit.agent({ model }) */
    async agent(opts = {}) { const [m] = await kit.use('agent', 'tools', 'ollama'); return new m.Agent({ kit, ...opts }); },
  };
  if (config.use) await kit.use(config.use);
  return kit;
}

export { VFS, setAssetsBase, getAssetsBase };
