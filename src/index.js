// Jade Agent Kit: a browser workspace for AI agents, loadable from a CDN.
//   import { createKit } from 'https://cdn.jsdelivr.net/gh/lucky-edgelord/Jade-agent-kit@v0.1.0/dist/jade-agent-kit.js';
//   const kit = await createKit({ persist: 'my-app', ollamaKey: '…' });
import { VFS } from './vfs.js';
import { BusyBox } from './busybox.js';
import { createShell, ShellSession } from './shell.js';
import { JsRunner } from './js.js';
import { Python } from './python.js';
import { Sqlite, Database } from './sqlite.js';
import { BM25, bm25Search, tokenize, searchFiles } from './bm25.js';
import { ML, gpuShim } from './ml.js';
import { Webxdc } from './webxdc.js';
import { Ollama, OllamaCloud, OLLAMA_CLOUD, OLLAMA_LOCAL } from './ollama.js';
import { createVectors, VectorStore } from './vectors.js';
import { createTools } from './tools.js';
import { Agent, DEFAULT_TOOLS } from './agent.js';
import { setAssetsBase, getAssetsBase } from './util.js';

export const VERSION = '0.1.0';

/**
 * Create a workspace.
 * @param {{ persist?: string|false, files?: Record<string, string|Uint8Array>, ollamaKey?: string, ollamaHost?: string, assetsBase?: string,
 *           cdn?: string, engine?: 'auto'|'wasm'|'js', busybox?: boolean }} [o]
 *   persist: an IndexedDB name; files and webxdc updates are kept across reloads under it
 *   files: files to add when the workspace is empty
 *   ollamaKey: Ollama Cloud API key (the agent on the cloud, web search and fetch)
 *   ollamaHost: Ollama on a machine, for the agent and embeddings (default http://localhost:11434)
 *   assetsBase: where the kit's own files (assets/) are, if you host them yourself
 *   cdn: npm CDN for the runtimes loaded on demand (default https://cdn.jsdelivr.net/npm/)
 *   busybox: start BusyBox right away (default true; the shell uses JS commands until it is ready)
 */
export async function createKit({ persist = false, files = null, ollamaKey = '', ollamaHost = OLLAMA_LOCAL, assetsBase = null, cdn = 'https://cdn.jsdelivr.net/npm/', engine = 'auto', busybox: bbNow = true } = {}) {
  if (assetsBase) setAssetsBase(assetsBase);
  const vfs = new VFS({ persist });
  const loaded = await vfs.load().catch(() => false);
  if (!loaded && files) vfs.import(files);
  const busybox = new BusyBox(vfs);
  const sqlite = new Sqlite(vfs);
  const ml = new ML({ vfs, cdn });
  const python = new Python({ vfs, sqlite, cdn });
  const ollama = new Ollama({ host: OLLAMA_CLOUD, apiKey: ollamaKey });
  const local = new Ollama({ host: ollamaHost });
  const kit = { version: VERSION, vfs, busybox, sqlite, ml, python, ollama, local, bm25: { BM25, search: bm25Search, tokenize, searchFiles: (q, o) => searchFiles(vfs, q, o) } };
  kit.js = new JsRunner({ vfs, sqlite, ml, bridge: (op, a) => bridge(op, a) });
  const commands = { node: kit.js.command(), js: kit.js.command(), python: python.command(), python3: python.command(), sqlite3: sqlite.command() };
  kit.shell = createShell({ vfs, busybox, engine, commands });
  kit.sh = kit.shell.session();
  /** run a command line in the kit's main shell session */
  kit.run = (cmd, o) => kit.sh.run(cmd, o);
  kit.webxdc = new Webxdc({ vfs, persist });
  /** embeddings from Ollama on a machine: one vector per text (embed(text) → one vector) */
  kit.embed = (input, o) => local.embed(input, o);
  kit.vectors = createVectors(kit);
  kit.tools = createTools(kit);
  /** a pi-style agent on Ollama Cloud or a local Ollama (read, write, edit, bash, search, fetch) */
  kit.agent = (o = {}) => new Agent({ kit, ...o });
  // scripts call back into the kit: kit.tool(name, args) / kit.tools.<name>(args) / kit.list() / kit.shell(cmd)
  async function bridge(op, a) {
    if (op === 'tool') return kit.tools.call(a.name, a.args || {});
    if (op === 'list') return kit.tools.names();
    if (op === 'shell') { const r = await kit.shell.session().run(a.command); return { stdout: r.stdout, stderr: r.stderr, code: r.code }; }
    throw new Error(`kit.${op} is not available in Jade Agent Kit`);
  }
  if (bbNow) busybox.load();
  return kit;
}

export { VFS, BusyBox, ShellSession, JsRunner, Python, Sqlite, Database, BM25, bm25Search, tokenize, searchFiles, ML, gpuShim, Webxdc, Ollama, OllamaCloud, OLLAMA_CLOUD, OLLAMA_LOCAL, VectorStore, Agent, DEFAULT_TOOLS, createTools, setAssetsBase, getAssetsBase };
