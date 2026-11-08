# Jade Agent Kit

A browser workspace for AI agents, loaded from a CDN with one import. It gives any web project:

- a **virtual file system** (in memory, optionally kept in IndexedDB) shared by everything below
- a **shell**: BusyBox 1.37 compiled to WebAssembly, with pipes, redirects, `&&` `||`, `$VAR`, `$(…)` and globs, plus JavaScript versions of the common commands as a fallback
- **MicroPython** 1.27 and a **Node-style JavaScript** sandbox (`require('fs')`, local modules, `node:sqlite`, `fetch`), both in Web Workers
- **SQLite** 3.53 with **sqlite-vec** (vector search) and FTS5
- ranked **BM25** keyword search
- **TensorFlow.js**, **ONNX Runtime Web** and **LiteRT** (`.tflite`), on WebGPU when the device has it
- a **webxdc** host for running `.xdc` apps in a sandboxed frame
- **LLM tool definitions** (OpenAI/Ollama and Anthropic shapes) with one dispatcher
- a small **pi-style agent** on **Ollama Cloud** with six tools: `read`, `write`, `edit`, `bash`, `search`, `fetch`

Its pieces come from [Jade Vault](https://github.com/lucky-edgelord/jade-vault).

## Quick start

```html
<script type="module">
  import { createKit } from 'https://cdn.jsdelivr.net/gh/lucky-edgelord/jade-agent-kit@v0.1.0/dist/jade-agent-kit.js';

  const kit = await createKit({ persist: 'my-app' });          // files kept in IndexedDB under "my-app"
  kit.vfs.write('/hello.txt', 'hello world\n');
  const r = await kit.run('cat /hello.txt | tr a-z A-Z');      // { stdout, stderr, code, output }
  console.log(r.stdout);                                        // HELLO WORLD
</script>
```

Always pin a version (`@v0.1.0`); jsDelivr caches tags permanently. `dist/jade-agent-kit.js` is one minified ES module
(about 145 KB); `src/index.js` loads the same code as separate modules. Open `examples/index.html` for a shell and an agent
side by side.

### What loads when

| Piece | Size | Where from | When |
| --- | --- | --- | --- |
| The kit (`dist/jade-agent-kit.js`) | ~145 KB | this repository | the import |
| BusyBox (`assets/busybox.wasm` + glue) | ~300 KB | this repository | at start (pass `busybox: false` to wait for the first command) |
| SQLite + sqlite-vec (`assets/sqlite3.wasm`) | ~900 KB | this repository | first database, `sqlite3` command, or script that mentions sqlite |
| MicroPython 1.27.0 | ~0.5 MB | jsDelivr | first Python run |
| TensorFlow.js 4.22.0 | ~1.8 MB | jsDelivr | `kit.ml.tf()`, or a script that uses `tf` |
| ONNX Runtime Web 1.31.1 | ~29 MB | jsDelivr | `kit.ml.onnx()` |
| LiteRT.js 2.5.3 | ~10 MB | jsDelivr | `kit.ml.tflite()` |

The kit finds `assets/` next to the file you imported. To host everything yourself, copy `dist/` and `assets/`
together, or pass `createKit({ assetsBase: '/static/jak-assets/' })`; `createKit({ cdn })` changes where the runtimes
in the bottom four rows come from.

## API

```js
const kit = await createKit({
  persist: 'my-app',            // IndexedDB name (default: memory only)
  files: { '/a.txt': 'hi' },    // added when the workspace is empty
  ollamaKey: '…',               // for the agent, search and fetch
});
```

### Files: `kit.vfs`

```js
kit.vfs.write('/notes/a.md', '# Hi');      // folders are created; strings or bytes
kit.vfs.read('/notes/a.md');               // string; readBytes() for a Uint8Array
kit.vfs.list('/notes');                    // ['a.md']
kit.vfs.exists(p); kit.vfs.isDir(p); kit.vfs.stat(p); kit.vfs.mkdirp(p); kit.vfs.rm(p, true); kit.vfs.move(a, b); kit.vfs.copy(a, b, true);
kit.vfs.on(path => …);                     // something changed
await kit.vfs.flush();                     // save to IndexedDB now (otherwise shortly after each change)
kit.vfs.snapshot(); kit.vfs.import({ '/x.txt': 'x' });
```

### Shell: `kit.run`, `kit.shell`

```js
await kit.run('ls -la / && grep -rn TODO /src | head');
const sh = kit.shell.session({ cwd: '/project', env: { NAME: 'x' } });   // its own working directory and variables
await sh.run('cd lib && pwd', { onOutput: (text, isErr) => …, timeoutMs: 30000, signal });
kit.shell.engine = 'js';      // 'auto' (BusyBox when loaded), 'wasm' or 'js'
```

Besides the BusyBox applets: `node`, `js`, `python`, `python3`, `sqlite3`, `sh`, `xargs`, `cd`, `export`, `which`,
`help`. There are no `if`/`for` blocks; use `node` or `python` for scripting. Add your own commands:

```js
kit.shell.commands.hello = c => { c.o(`hello ${c.argv[0] ?? ''}\n`); return 0; };   // c.stdin, c.e(err), c.P(path), c.sh.cwd
```

### Python: `kit.python`

```js
const r = await kit.python.run(`import json\nprint(json.dumps({'n': 1}))`, { cwd: '/' });
```

MicroPython's standard library (json, re, math, random, collections, os, time, hashlib, struct, …) plus `sqlite3`.
`open()` and `os` see the VFS; files it writes are saved.

### JavaScript: `kit.js`

```js
const r = await kit.js.run(`
  const fs = require('fs');
  const { twice } = require('./lib/util.js');
  console.log(twice(21));
  const t = await kit.tool('read', { path: '/notes/a.md' });   // call the kit's tools from a script
  return { ok: true };                                         // → r.result
`, { cwd: '/', timeoutMs: 60000, globals: { input: 42 }, network: true });
```

Modules: `fs` (and `fs/promises`), `path`, `util`, `os`, `http`, `https`, `node:sqlite` / `better-sqlite3`, local
files, and `tf` when the script mentions it. No npm packages.

### SQLite: `kit.sqlite`

```js
const db = await kit.sqlite.open('/data/app.db');       // or ':memory:'
db.exec(`create table if not exists t(id integer primary key, body text)`);
db.run(`insert into t(body) values (?)`, ['hello']);
db.query(`select * from t where id > ?`, [0]);           // [{ id: 1, body: 'hello' }]
// sqlite-vec
db.exec(`create virtual table v using vec0(embedding float[3])`);
db.run(`insert into v(rowid, embedding) values (1, ?)`, ['[0.1, 0.2, 0.3]']);
db.query(`select rowid, distance from v where embedding match ? order by distance limit 5`, ['[0.1, 0.2, 0.25]']);
db.save();   // write back to the VFS (close() also saves)
await kit.sqlite.cli(['-json', '/data/app.db', 'select * from t']);   // the sqlite3 shell
```

### BM25: `kit.bm25`

```js
kit.bm25.search(['the cat sat', 'a dog ran', 'cats and dogs'], 'cat');   // [{ id, text, score }]
const index = new kit.bm25.BM25([{ id: 'a', text: '…' }, { id: 'b', text: '…' }]);   // scores like Python's rank_bm25
index.search('query', { limit: 5 });
kit.bm25.searchFiles('error handling', { root: '/src' });   // [{ path, score, line, snippet }]
```

### Machine learning: `kit.ml`

```js
const tf = await kit.ml.tf();                                  // TensorFlow.js on the page (WebGPU → WebGL → CPU)
const onnx = await kit.ml.onnx('/models/m.onnx');             // VFS path, URL or bytes
const out = await onnx.run({ input: { data: [...], shape: [1, 3, 224, 224] } });   // { output: { data, shape, dtype } }
const lite = await kit.ml.tflite('https://…/model.tflite');
const res = await lite.run([{ data: [...], shape: [1, 4] }]);   // [{ name, data, shape }]
```

Both pick WebGPU when the device has it and fall back to WebAssembly (`{ accelerator: 'wasm' }` to choose).

### webxdc: `kit.webxdc`

```js
const app = await kit.webxdc.load('/apps/game.xdc');          // .xdc file, VFS folder, URL or bytes
const s = kit.webxdc.open(app, { container: document.querySelector('#app'), self: { addr: 'me@site', name: 'Me' } });
kit.webxdc.onUpdate((app, u) => console.log(u.payload));      // the user's updates
await s.send({ payload: { move: 'e4' }, info: 'Agent moved' }); // the agent's
kit.webxdc.updates(app); s.close(); kit.webxdc.pack(app);      // → .xdc bytes
```

Apps run in an `iframe sandbox="allow-scripts …"` (no same-origin access, no network); their updates persist with the kit.

### Tools for LLMs: `kit.tools`

```js
kit.tools.openai();                 // [{ type: 'function', function: { name, description, parameters } }] (also Ollama's format)
kit.tools.anthropic(['read', 'bash']);  // [{ name, description, input_schema }]
const text = await kit.tools.call('bash', { command: 'ls /' });   // always a string; failures start with "Error:"
kit.tools.add('now', { description: 'the time', parameters: { type: 'object', properties: {} }, run: () => new Date().toISOString() });
```

| Tool | Does |
| --- | --- |
| `read` | a file with numbered lines (`offset`, `limit`) |
| `write` | create or overwrite a file |
| `edit` | replace exact text (`oldText` must be unique, or `replaceAll`) |
| `bash` | a command line in a persistent shell session |
| `python`, `javascript` | run code |
| `sqlite` | SQL on a database file, rows as JSON |
| `search_files` | BM25 over the files under a folder |
| `search`, `fetch` | Ollama web search and web fetch (need an Ollama key) |

### The agent: `kit.agent()`

A minimal coding agent in the style of [pi](https://github.com/badlogic/pi-mono): a model on Ollama Cloud, a loop,
and the tools `read`, `write`, `edit`, `bash`, `search`, `fetch`.

```js
const kit = await createKit({ ollamaKey: 'your Ollama API key' });
const agent = kit.agent({
  model: 'gpt-oss:120b',           // any Ollama Cloud model that supports tools
  onEvent: e => {                  // text / thinking (delta), tool_call, tool_result, turn_end, done, error
    if (e.type === 'text') output.append(e.delta);
  },
});
const answer = await agent.prompt('Write fizzbuzz.py, run it and show me the output');
agent.abort(); agent.reset(); agent.messages;   // stop, clear, the history
```

Options: `system` (prompt), `tools` (names, default the six above), `think` (`true` or `'low'|'medium'|'high'` for
models that think), `maxSteps` (40), `options` (Ollama model options). `kit.ollama` is the client itself:
`chat()`, `models()`, `webSearch()`, `webFetch()`.

## Things to know

- **Browser support**: a current Chrome, Edge, Firefox or Safari. Needs Web Workers, WebAssembly and
  `DecompressionStream`. WebGPU is optional.
- **Content-Security-Policy**: the shell, Python and JS run in workers made from `blob:` URLs (`worker-src blob:`),
  WebAssembly needs `'wasm-unsafe-eval'`, and the runtimes come from `cdn.jsdelivr.net` unless you host them.
- **Sandboxing**: scripts run in Web Workers of your page's origin. They cannot touch the page or its DOM, but they
  can make network requests as your page (pass `network: false` to `kit.js.run` to turn that off). webxdc apps are
  isolated in a sandboxed frame. Treat the kit as a workspace, not a security boundary against hostile code.
- **API keys**: an Ollama key used in a browser is visible to whoever uses that page. Use it in your own tools, or
  put a small proxy in front of `https://ollama.com` and set `kit.ollama.host` to it.
- **Big files**: files over 16 MB are not copied into BusyBox commands, over 4 MB into Python and over 2 MB into JS
  scripts (SQLite databases excepted).

## Development

```sh
npm install                  # esbuild and Playwright
npx playwright install chromium
npm test                     # builds dist/ and runs the browser tests (tests/*_test.mjs)
JAK_SRC=1 node tests/run.mjs # the same tests against src/
```

`dist/` is committed, because jsDelivr serves the repository's files as they are. Release: bump `version` in
`package.json` and `VERSION` in `src/index.js`, `npm test`, commit, tag `vX.Y.Z`, push the tag.

## License

MIT for the kit's own code (`LICENSE`). BusyBox is GPL-2.0, SQLite is public domain, and the other components keep
their licenses: see `THIRD_PARTY_NOTICES.md`.
