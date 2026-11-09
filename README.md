# Jade Agent Kit

A browser workspace for AI agents, loaded from a CDN with one import. It is lean: the core is about 5 KB gzipped, and
each feature below is its own module that downloads only when a page uses it. It gives any web project:

- a **virtual file system** (in memory, optionally kept in IndexedDB) shared by everything below
- a **shell**: BusyBox 1.37 compiled to WebAssembly, with pipes, redirects, `&&` `||`, `$VAR`, `$(…)` and globs, plus JavaScript versions of the common commands as a fallback
- **MicroPython** 1.27 and a **Node-style JavaScript** sandbox (`require('fs')`, local modules, `node:sqlite`, `fetch`), both in Web Workers
- **SQLite** 3.53 with **sqlite-vec** (vector search) and FTS5
- ranked **BM25** keyword search
- **TensorFlow.js**, **ONNX Runtime Web** and **LiteRT** (`.tflite`), on WebGPU when the device has it
- a **webxdc** host for running `.xdc` apps in a sandboxed frame
- **LLM tool definitions** (OpenAI/Ollama and Anthropic shapes) with one dispatcher
- **decisions** with decision models on **Ollaya**, **Ollama** (0.35+) or **Ollama Cloud**: pick one, score, yes/no, with calibrated probabilities
- **Sentry**: rules that watch the page and the device (battery, network, idle, keys, motion, light, location,
  sound level, camera change, your own states and events) and act when something happens
- a **cron scheduler** (plain English or cron) for shell, JS, Python, agent or function jobs, and a **task list**
- **embeddings** from Ollama on your machine, and a **vector store** on sqlite-vec (semantic and hybrid search)
- a small **pi-style agent** on **Ollama Cloud** or **Ollama on your machine**, with six tools: `read`, `write`, `edit`, `bash`, `search`, `fetch`

Its pieces come from [Jade Vault](https://github.com/lucky-edgelord/jade-vault). The examples below use `kit.<feature>`
after `await kit.use('<feature>')`.

## Quick start

```html
<script type="module">
  import { createKit } from 'https://cdn.jsdelivr.net/gh/lucky-edgelord/Jade-agent-kit@v0.2.0/dist/jade-agent-kit.js';

  const kit = await createKit({ persist: 'my-app' });          // loads only the file system; kept in IndexedDB
  kit.vfs.write('/hello.txt', 'hello world\n');
  const r = await kit.run('cat /hello.txt | tr a-z A-Z');      // loads the shell and BusyBox, then runs
  console.log(r.stdout);                                        // HELLO WORLD
</script>
```

Always pin a version (`@v0.2.0`); jsDelivr caches tags permanently. Open `examples/index.html` for a shell and an
agent side by side.

## Lean loading

`createKit()` sets up the file system and nothing else. A feature is downloaded the first time it is used:

```js
const py = await kit.use('python');               // the Python runner (also kit.python from now on)
const [db, bm] = await kit.use('sqlite', 'bm25');
await createKit({ use: ['shell', 'sqlite'] });     // load some up front
await createKit({ use: 'all' });                   // everything, like 0.1
kit.has('python');                                 // loaded yet?
```

The helpers load what they need: `kit.run()` (shell), `kit.tool()` (tools + the feature behind the tool),
`kit.decide()`, `kit.embed()`, `kit.agent()`. Every module also works on its own, without `createKit`:

```js
import { BM25 } from 'https://cdn.jsdelivr.net/gh/lucky-edgelord/Jade-agent-kit@v0.2.0/dist/bm25.js';
import { SentryEngine } from 'https://cdn.jsdelivr.net/gh/lucky-edgelord/Jade-agent-kit@v0.2.0/dist/sentry-engine.js';
```

| Feature (`kit.use(…)`) | File | Size (gzip, with what it imports) |
| --- | --- | --- |
| core: `createKit`, file system | `jade-agent-kit.js` | 5.1 KB |
| `shell` (+ `busybox`) | `shell.js`, `busybox.js` | 12.3 KB + 4.7 KB, then BusyBox's ~300 KB WebAssembly |
| `js` | `js.js` | 13.1 KB |
| `python` | `python.js` | 8.2 KB, then MicroPython (~0.5 MB) from jsDelivr |
| `sqlite` | `sqlite.js` | 8.7 KB, then SQLite + sqlite-vec (~900 KB WebAssembly) |
| `bm25` | `bm25.js` | 1.7 KB |
| `ml` | `ml.js` | 4.4 KB, then each runtime from jsDelivr when used |
| `webxdc` | `webxdc.js` | 9.0 KB |
| `ollama` | `ollama.js` | 1.8 KB |
| `vectors` | `vectors.js` | 3.1 KB (+ `sqlite`, `ollama`) |
| `decisions` | `decide.js` | 4.1 KB |
| `tasks`, `cron`, `schedule` | `tasks.js`, `schedule.js` | 1.0 KB, 4.8 KB |
| `sentry` | `sentry.js` (engine alone: `sentry-engine.js`) | 9.5 KB (3.9 KB) |
| `tools` | `tools.js` | 7.9 KB |
| agent (`kit.agent()`) | `agent.js` | 1.4 KB (+ `tools`, `ollama`) |

Shared code goes into small `chunk-*.js` files, so two features never download the same code twice. The kit finds
`assets/` next to the file you imported; to host everything yourself, copy `dist/` and `assets/` together, or pass
`createKit({ assetsBase: '/static/jak-assets/' })`; `createKit({ cdn })` changes where the runtimes loaded on demand
come from.

### Changes from 0.1

- `createKit()` no longer loads every feature. Use `kit.use('…')` (or `createKit({ use: [...] })` / `'all'`) before
  touching `kit.python`, `kit.sqlite`, `kit.webxdc`, …; the async helpers load by themselves.
- `kit.agent()` is async: `const agent = await kit.agent({ … })`.
- `createKit` exports only `createKit`, `VFS`, `setAssetsBase` and `getAssetsBase`; import other classes from their
  module file (`dist/sqlite.js`, `dist/bm25.js`, …).
- The scheduler starts when it is loaded (`use: ['schedule']` on pages that should run saved jobs).

## API

```js
const kit = await createKit({
  persist: 'my-app',            // IndexedDB name (default: memory only)
  files: { '/a.txt': 'hi' },    // added when the workspace is empty
  ollamaKey: '…',               // Ollama Cloud: the agent on the cloud, web search and fetch
  ollamaHost: 'http://localhost:11434',   // Ollama on a machine: the agent and embeddings (this is the default)
  decide: { server: 'ollaya', model: 'winnow:e4b' },   // decision models: 'ollaya' | 'ollama' | 'cloud'
  sentry: { allow: ['location'] },  // sensitive Sentry systems the app allows
  use: ['shell'],               // features to load now (default: none)
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

### Decisions: `kit.decide`, `kit.decisions`

Decision models (System One, `POST /v1/systemone`) judge a state against a question and answer with calibrated
probabilities. They are fast and cheap, good for triage, routing and checks.

```js
kit.decisions.server = 'ollaya';            // 'ollaya' (default http://localhost:11435) | 'ollama' (0.35+) | 'cloud'
kit.decisions.model = 'winnow:e4b';         // the cloud defaults to clef
await kit.decisions.models();               // what the server offers (Ollama: decision models only)

await kit.decide({ state: 'TypeError at list.js:42', question: 'What kind of problem?', options: ['bug', 'network', 'user input'] });
// → { type: 'choice', result: 'bug', choice: 'bug', confidence: 0.91, probabilities: { bug: 0.91, … }, model, server }
await kit.decide({ state: log, question: 'How urgent?', type: 'score', options: ['low', 'medium', 'high'] });   // → score, legend
await kit.decide({ state: msg, question: 'Is this spam?', type: 'yesno' });                                    // → answer: true/false
```

The servers speak different formats, and the kit translates both ways so the answer looks the same:

| | Ollaya | Ollama (local, 0.35+) | Ollama Cloud |
| --- | --- | --- | --- |
| Address | `decisions.host`, default `http://localhost:11435` | `decisions.host`, else the kit's local Ollama | `https://ollama.com` |
| Key | optional (`decisions.apiKey`) | none | the kit's Ollama Cloud key (or `decisions.apiKey`) |
| Options sent as | a list | an object `{ key: description }` | an object |
| Yes/no answer | a boolean | the probability of true (turned into yes/no + probabilities) | the same as Ollama |
| Models | any it has | decision models such as `clef-flash` (`ollama pull`) | `clef` (paid plan or credits); `clef:cloud` is sent as `clef` |

Scripts call `await kit.decide({ … })` too, and agents get a `decide` tool (`await kit.agent({ tools: [...DEFAULT_TOOLS, 'decide'] })`).

### Scheduling and tasks: `kit.schedule`, `kit.cron`, `kit.tasks`

```js
kit.schedule.add({ name: 'backup', when: 'every day at 2am', command: 'tar -czf /backup.tgz /notes' });
kit.schedule.add({ name: 'digest', when: 'weekdays at 8:30', prompt: 'Summarize /inbox into /digest.md' });   // an agent run
kit.schedule.add({ when: 'in 20 minutes', js: `require('fs').writeFileSync('/ping.txt', 'pong')` });         // once
kit.schedule.add({ when: '*/5 * * * *', run: () => refreshSomething() });                                   // a function (not saved)
kit.schedule.add({ when: '@hourly', python: 'print("hi")' });
kit.schedule.list(); kit.schedule.runNow('backup'); kit.schedule.disable('digest'); kit.schedule.remove('backup');
kit.schedule.on(e => console.log(e.type, e.job.name, e.result));   // 'run' | 'error' | 'change'
```

`when` is plain English ("every 30 minutes", "every monday at 6pm", "tomorrow at 7pm", "in 2 hours") or 5-field cron
(`* , - /`, names, `@daily`…), in local time. Jobs run only while a page with the kit is open; one missed while it was
closed runs once when the page opens again. Jobs are saved in `/.kit/schedule.json` (function jobs are not: add them
again on each load). `createKit({ scheduler: false })` keeps it stopped until `kit.schedule.start()`.
`kit.cron` has the parser itself: `fromText`, `parse`, `next`, `upcoming`, `describe`.

```js
const [a] = kit.tasks.add(['Plan the API', 'Write tests']);   // or add({ title, notes, due })
kit.tasks.start(a.id); kit.tasks.done(a.id); kit.tasks.update(2, { notes: 'edge cases' });
kit.tasks.list({ status: 'pending' }); kit.tasks.text();     // [x] #1 Plan the API …
kit.tasks.on(items => render(items)); kit.tasks.clear();      // clear removes done tasks
```

Agents get both as tools: `await kit.agent({ tools: [...DEFAULT_TOOLS, 'tasks', 'schedule'] })` (`DEFAULT_TOOLS` is exported by `dist/agent.js`).

### Sentry: `kit.sentry`

Rules that watch the page and the device and act when something happens. The rules engine is the one Jade runs on
a phone (ported from Rust, same tests), so a rule means the same in both places.

```js
const sentry = await kit.use('sentry');                 // starts watching; rules are kept in /.kit/sentry.json
sentry.add({ id: 'low-battery', when: { src: 'battery.level', op: 'lt', value: 20, clear: 30 }, alert: { notify: 'Battery low' } });
sentry.add({ id: 'away', when: { src: 'user.idle_s', op: 'gt', value: 300 }, run: { command: 'echo idle >> /log.txt' } });
sentry.add({ id: 'big-order', on: { event: 'order', where: { total: { gt: 100 } } }, run: { prompt: 'Thank the customer' } });
sentry.emit('order', { total: 140 });                   // your own events …
sentry.set('cart.items', 3);                            // … and states
sentry.on(fire => console.log(fire.id, fire.values, fire.event));
sentry.allow('location');                               // camera, audio and location need this (and the browser's prompt)
sentry.status(); sentry.disable('away'); sentry.remove('away'); sentry.stop();
```

A rule: `when` (a condition: `{ src, op: lt|le|gt|ge|eq|ne|in, value, clear }`, combined with `all` / `any` / `not`,
or a geofence `{ src: 'geo', op: 'inside'|'outside', lat, lon, radius_m }`), and/or `on` (an event, filtered with
`where`); `for_s` (must hold this long), `cooldown_s` (default 60), `max_per_hour` (default 30), `hours`
(`"22:00-07:00"`), `rearm`. When it fires: `alert` (`notify`, `vibrate`), `run` (`command`, `js`, `python`, `prompt`,
or `tool` + `args`; the firing's data is passed in as `sentry`), `snapshot` (camera rules keep a small grayscale picture).

| System | Readings and events | Notes |
| --- | --- | --- |
| `time` | `time.hour`, `time.minute`, `time.weekday`, `time.day` | |
| `battery` | `battery.level` (0-100), `battery.charging`; event `charger` | Chrome, Edge |
| `network` | `net.online`, `net.type`, `net.downlink`; event `network` | |
| `page` | `page.visible`, `page.focused`, `user.idle_s`; events `page`, `user_present` | |
| `keys` | event `key` `{key, code, ctrl, alt, shift, meta}` | |
| `files` | event `file` `{path}` | the kit's file system |
| `motion` | `motion.state` (face_up/face_down/upright/tilted), `motion.moving`; event `shake` | iOS: call `requestPermissions()` from a tap |
| `light` | `light.lux` | where the browser has AmbientLightSensor |
| `location` | `geo.lat`, `geo.lon`, `geo.accuracy` | needs `allow('location')` |
| `audio` | `audio.level` (0-100) | needs `allow('audio')`; nothing is recorded |
| `camera` | `camera.change` (% of the picture), `camera.brightness` | needs `allow('camera')` |

A system starts only when an enabled rule reads it and stops when none does, so unused sensors cost nothing.
Phone-only events (calls, texts, notifications from other apps, Bluetooth, volume keys) have no browser source;
rules on them are kept and can be fed with `emit()`. Agents get a `sentry` tool.

### Embeddings and vector search: `kit.embed`, `kit.vectors`

Embeddings come from Ollama on your machine (`ollama pull embeddinggemma`, or any embedding model:
`nomic-embed-text`, `qwen3-embedding`, `mxbai-embed-large`, …). Ollama Cloud has no embedding models.

```js
const v = await kit.embed('hello world');                       // one vector
const vs = await kit.embed(['a', 'b'], { model: 'nomic-embed-text' });

const store = await kit.vectors.open('/data/notes.db');          // SQLite + sqlite-vec, saved in the VFS (or ':memory:')
await store.add([{ id: 'n1', text: 'Cats sleep 15 hours a day', meta: { source: 'wiki' } }, 'plain text works too']);
await store.search('how long do cats sleep', { limit: 5 });      // [{ id, text, meta, distance, score }]
await store.search('cats sleep', { hybrid: true });              // meaning + BM25 keywords, merged
store.remove('n1'); store.count(); store.close();                // close() saves
```

A store remembers which model embedded it and refuses another (vectors from different models do not compare).

### Tools for LLMs: `kit.tools`

```js
kit.tools.openai();                 // [{ type: 'function', function: { name, description, parameters } }] (also Ollama's format)
kit.tools.anthropic(['read', 'bash']);  // [{ name, description, input_schema }]
const text = await kit.tool('bash', { command: 'ls /' });         // always a string; failures start with "Error:"
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
| `decide` | a decision model: choice, score or yes/no with probabilities |
| `tasks` | the task list: add, update status, list, remove, clear |
| `schedule` | schedule a command, JS, Python or agent prompt: add, list, remove, enable, disable, run |
| `sentry` | Sentry rules: systems, list, add, remove, enable, disable, status, emit, set |
| `search`, `fetch` | Ollama Cloud web search and web fetch (need an Ollama Cloud key) |

### The agent: `kit.agent()`

A minimal coding agent in the style of [pi](https://github.com/badlogic/pi-mono): a model on Ollama, a loop, and the
tools `read`, `write`, `edit`, `bash`, `search`, `fetch`.

```js
const kit = await createKit({ ollamaKey: 'your Ollama Cloud key' });   // leave it out to use Ollama on your machine
const agent = await kit.agent({
  provider: 'cloud',               // 'cloud' or 'local' (default: cloud when there is a key, else local)
  model: 'gpt-oss:120b',           // any model with tool support (default gpt-oss:120b on the cloud, qwen3:8b locally)
  onEvent: e => {                  // text / thinking (delta), tool_call, tool_result, turn_end, done, error
    if (e.type === 'text') output.append(e.delta);
  },
});
const answer = await agent.prompt('Write fizzbuzz.py, run it and show me the output');
agent.abort(); agent.reset(); agent.messages;   // stop, clear, the history
```

`search` and `fetch` always use Ollama Cloud's web search and web fetch, so they need the cloud key even when the
agent runs locally. Options: `system` (prompt), `tools` (names, default the six above), `think` (`true` or
`'low'|'medium'|'high'`), `maxSteps` (40), `options` (Ollama model options), `ollama` (your own client).
`kit.ollama` (the cloud) and `kit.local` (your machine) are the clients: `chat()`, `models()`, `embed()`,
`webSearch()`, `webFetch()`.

## Things to know

- **Browser support**: a current Chrome, Edge, Firefox or Safari. Needs Web Workers, WebAssembly and
  `DecompressionStream`. WebGPU is optional.
- **Content-Security-Policy**: the shell, Python and JS run in workers made from `blob:` URLs (`worker-src blob:`),
  WebAssembly needs `'wasm-unsafe-eval'`, and the runtimes come from `cdn.jsdelivr.net` unless you host them.
- **Sandboxing**: scripts run in Web Workers of your page's origin. They cannot touch the page or its DOM, but they
  can make network requests as your page (pass `network: false` to `kit.js.run` to turn that off). webxdc apps are
  isolated in a sandboxed frame. Treat the kit as a workspace, not a security boundary against hostile code.
- **API keys**: an Ollama Cloud key used in a browser is visible to whoever uses that page. Use it in your own
  tools, or put a small proxy in front of `https://ollama.com` and set `kit.ollama.host` to it.
- **Ollama and Ollaya on your machine**: a web page may only call them when they allow the page's origin. Start them
  with `OLLAMA_ORIGINS="https://your.site" ollama serve` / `OLLAYA_ORIGINS=… ollaya serve` (or `"*"`). Chrome may also ask the user to allow local network
  access the first time.
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
