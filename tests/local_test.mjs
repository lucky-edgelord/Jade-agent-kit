// Ollama on a machine (stood in for at http://localhost:11434): embeddings, the vector store, the agent.
import { start } from './_harness.mjs';
const t = await start({ busybox: false, ollamaKey: '' });
const { ok, ev, page } = t;
const seen = [];
// fake embeddings: words hashed into 16 dimensions, normalized, so texts sharing words are close
const embed = s => { const v = new Array(16).fill(0); for (const w of String(s).toLowerCase().match(/[a-z]+/g) || []) { let h = 0; for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0; v[h % 16] += 1; } const n = Math.hypot(...v) || 1; return v.map(x => x / n); };
await page.route('http://localhost:11434/**', async route => {
  const req = route.request(); const url = new URL(req.url()); const body = req.postData() ? JSON.parse(req.postData()) : {}; seen.push({ path: url.pathname, body, auth: req.headers().authorization });
  const cors = { 'access-control-allow-origin': '*' };
  if (url.pathname === '/api/tags') return route.fulfill({ json: { models: [{ name: 'qwen3:8b' }, { name: 'embeddinggemma:latest' }] }, headers: cors });
  if (url.pathname === '/api/embed') { if (body.model === 'missing') return route.fulfill({ status: 404, json: { error: 'model "missing" not found, try pulling it first' }, headers: cors }); return route.fulfill({ json: { model: body.model, embeddings: body.input.map(embed) }, headers: cors }); }
  if (url.pathname === '/api/chat') {
    const tools = body.messages.filter(m => m.role === 'tool');
    const msg = tools.length ? { role: 'assistant', content: 'local: ' + tools[0].content } : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'bash', arguments: { command: 'echo from-local' } } }] };
    return route.fulfill({ body: JSON.stringify({ message: msg, done: false }) + '\n' + JSON.stringify({ done: true, message: { role: 'assistant', content: '' } }) + '\n', headers: { ...cors, 'content-type': 'application/x-ndjson' } });
  }
  return route.fulfill({ status: 404, json: { error: 'not found' }, headers: cors });
});
let r = await ev(async () => ({ models: await kit.local.models(), one: (await kit.embed('hello world')).length, many: (await kit.embed(['a cat', 'a dog'])).length }));
ok(r.models.join() === 'qwen3:8b,embeddinggemma:latest' && r.one === 16 && r.many === 2, 'local models and embeddings: ' + JSON.stringify(r));
const e = seen.find(s => s.path === '/api/embed');
ok(e.body.model === 'embeddinggemma' && Array.isArray(e.body.input) && !e.auth, 'embed calls /api/embed with embeddinggemma and no key');
r = await ev(async () => { try { await kit.embed('x', { model: 'missing' }); return 'no error'; } catch (err) { return err.message; } });
ok(/not found.*ollama pull/.test(r), 'a missing model says to pull it: ' + r);
// vector store on sqlite-vec
r = await ev(async () => {
  const store = await kit.vectors.open('/data/vec.db');
  await store.add([{ id: 'cats', text: 'cats purr and sleep all day', meta: { kind: 'animal' } }, { id: 'rust', text: 'rust compiles fast native code' }, { id: 'tea', text: 'green tea and black tea' }]);
  const hits = await store.search('do cats sleep', { limit: 2 });
  const hy = await store.search('compiles native code', { limit: 1, hybrid: true });
  await store.add({ id: 'tea', text: 'oolong tea' });
  const n = store.count(); store.remove('rust'); const n2 = store.count(); store.close();
  const again = await kit.vectors.open('/data/vec.db'); const after = (await again.search('oolong', { limit: 1 }))[0]?.id; const cnt = again.count(); again.close();
  return { hits, hy: hy[0]?.id, n, n2, after, cnt, file: kit.vfs.isFile('/data/vec.db') };
});
ok(r.hits?.[0]?.id === 'cats' && r.hits[0].meta?.kind === 'animal' && r.hits[0].score > 0.3 && r.hits.length === 2, 'vector search finds the closest text, with its metadata: ' + JSON.stringify(r.hits));
ok(r.hy === 'rust' && r.n === 3 && r.n2 === 2 && r.after === 'tea' && r.cnt === 2 && r.file, 'hybrid search, replacing by id, remove, saved to the VFS and reopened: ' + JSON.stringify({ ...r, hits: undefined }));
r = await ev(async () => { const s = await kit.vectors.open('/data/vec.db', { model: 'other' }).catch(e => e.message); return typeof s === 'string' ? s : 'opened'; });
ok(/embedded with embeddinggemma/.test(r), 'a store refuses a different embedding model: ' + r);
// the agent on the local Ollama (no cloud key → local)
r = await ev(async () => { const a = await kit.agent(); const text = await a.prompt('hi'); return { text, model: a.model, host: a.client.host }; });
ok(r.text === 'local: from-local' && r.model === 'qwen3:8b' && r.host === 'http://localhost:11434', 'with no cloud key the agent uses the local Ollama: ' + JSON.stringify(r));
ok(seen.some(s => s.path === '/api/chat' && s.body.model === 'qwen3:8b' && s.body.tools.length === 6), 'the local chat gets the six tools');
r = await ev(async () => { const a = await kit.agent({ provider: 'cloud' }); try { await a.prompt('x'); return 'no error'; } catch (err) { return err.message; } });
ok(/no Ollama Cloud API key/.test(r), 'the cloud agent without a key explains: ' + r);
r = await ev(() => kit.tools.call('search', { query: 'x' }));
ok(/^Error: no Ollama Cloud API key/.test(r), 'web search still needs the cloud key: ' + r);
await t.done();
