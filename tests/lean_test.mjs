// Lean: createKit() fetches only the core; each feature is fetched when it is first used; modules work on their own.
import { start } from './_harness.mjs';
const t = await start({ use: null, busybox: false });
const { ok, ev, requests, from } = t;
const dist = !from.startsWith('src/');
const kitFiles = () => requests.filter(u => u.startsWith('https://kit.test/') && /\.(js|wasm)$/.test(u)).map(u => new URL(u).pathname);
let files = kitFiles();
ok(await ev(() => Object.keys(kit).filter(k => !['version', 'config', 'vfs', 'features', 'has', 'use', 'run', 'tool', 'decide', 'embed', 'agent', 'complete'].includes(k)).length) === 0, 'createKit() sets up only the file system and the helpers');
if (dist) ok(files.every(f => /^\/dist\/(jade-agent-kit|chunk-[A-Z0-9]+)\.js$/.test(f)) && !files.some(f => /shell|python|sqlite|busybox/.test(f)), 'only the core was downloaded: ' + files.join(' '));
await ev(() => kit.run('echo hi'));
files = kitFiles();
ok(await ev(() => ['shell', 'busybox'].every(n => kit.has(n)) && !kit.has('python') && !kit.has('sqlite') && !kit.has('tools')), 'a shell command loads the shell and BusyBox, nothing else');
if (dist) ok(files.includes('/dist/shell.js') && files.includes('/dist/busybox.js') && !files.some(f => /\/(python|sqlite|tools|agent|sentry|js)\.js$/.test(f)), 'and only their files were downloaded: ' + files.filter(f => !f.includes('chunk')).join(' '));
// one module, alone, without createKit
const r = await ev(async from => { const base = from.replace(/[^/]+$/, ''); const m = await import('/' + base + (base.startsWith('src') ? 'bm25.js' : 'bm25.js')); return new m.BM25(['the cat sat', 'dogs bark loudly', 'fish swim deep']).search('cat')[0]?.id; }, from);
ok(r === 0, 'bm25 works imported on its own');
const r2 = await ev(async from => { const base = from.replace(/[^/]+$/, ''); const { SentryEngine } = await import('/' + base + (base.startsWith('src') ? 'sentry_engine.js' : 'sentry-engine.js')); const e = new SentryEngine(); e.configure({ triggers: [{ id: 'hot', when: { src: 'temp', op: 'gt', value: 30 } }] }); e.update({ temp: 20 }, 1); return e.update({ temp: 35 }, 2).map(f => f.id); }, from);
ok(r2.join() === 'hot', 'the Sentry engine works on its own: ' + r2);
ok(await ev(async () => { try { await kit.use('nope'); return 'no error'; } catch (e) { return e.message; } }).then(m => /unknown feature "nope"/.test(m)), 'an unknown feature is reported');
ok(await ev(async () => { const [a, b] = await kit.use('tasks', 'cron'); return typeof a.add === 'function' && typeof b.fromText === 'function' && kit.tasks === a; }), 'use() loads several and sets kit[name]');
await t.done();
