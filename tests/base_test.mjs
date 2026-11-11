// The kit against a real Jade Agent Base server (built from ../jade-agent-base, or $JAB_BIN): connect with an agent
// token, use the server's tools over MCP as an agent would, the REST helpers, and the records API.
import { spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { start } from './_harness.mjs';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
let bin = process.env.JAB_BIN;
const src = process.env.JAB_DIR || path.join(ROOT, '../jade-agent-base');
if (!bin && fs.existsSync(path.join(src, 'cmd/jab'))) {
  bin = path.join(os.tmpdir(), 'jab-kit-test');
  const b = spawnSync('go', ['build', '-o', bin, './cmd/jab'], { cwd: src, encoding: 'utf8' });
  if (b.status !== 0) { console.log('build failed:', b.stderr); process.exit(1); }
}
if (!bin) { console.log('SKIP: no Jade Agent Base (set JAB_BIN or check it out next to this repository)'); process.exit(0); }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jab-'));
const run = (...a) => { const r = spawnSync(bin, [...a, '--dir', path.join(dir, 'pb_data')], { encoding: 'utf8' }); if (r.status !== 0) throw new Error(r.stderr); return r.stdout.trim(); };
run('superuser', 'upsert', 'root@example.com', '1234567890');
const token = run('agent', 'create', 'kit-test', '--scopes', 'read,write,schema,site', '--days', '1').split('\n').pop();
const boss = run('agent', 'create', 'boss', '--scopes', 'all', '--days', '1').split('\n').pop();
// a stand-in for Ollama behind the gateway
import http from 'node:http';
const upstream = http.createServer((req, res) => {
  let body = ''; req.on('data', d => (body += d)); req.on('end', () => {
    const b = JSON.parse(body || '{}');
    if (req.url === '/api/chat') { res.setHeader('Content-Type', 'application/x-ndjson'); for (const w of ['Hi ', 'from ', 'the gateway']) res.write(JSON.stringify({ message: { content: w }, done: false }) + '\n'); res.end(JSON.stringify({ message: { content: '' }, done: true, prompt_eval_count: 9, eval_count: 3 }) + '\n'); }
    else if (req.url === '/api/embed') res.end(JSON.stringify({ embeddings: b.input.map((_, i) => [i, 1, 2]), prompt_eval_count: 4 }));
    else { res.statusCode = 404; res.end('{}'); }
  });
}).listen(0);
await new Promise(r => upstream.once('listening', r));
const port = 18000 + Math.floor(Math.random() * 1000);
const srv = spawn(bin, ['serve', '--http', `127.0.0.1:${port}`, '--dir', path.join(dir, 'pb_data'), '--publicDir', path.join(dir, 'pb_public'), '--hooksDir', path.join(dir, 'pb_hooks')], { stdio: 'ignore' });
const cleanup = () => { srv.kill(); upstream.close(); fs.rmSync(dir, { recursive: true, force: true }); };
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }

const t = await start({ use: [] });
const { ok, ev } = t;
await t.ctx.route('https://base.test/**', async route => {
  const q = route.request(); const u = new URL(q.url());
  const h = { ...q.headers() }; delete h.host;
  const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`, { method: q.method(), headers: h, body: ['GET', 'HEAD'].includes(q.method()) ? undefined : q.postDataBuffer() });
  const headers = Object.fromEntries(r.headers); delete headers['content-encoding']; delete headers['content-length'];
  await route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
});
const info = await ev(async tok => { const b = await kit.use('base'); return b.connect({ url: 'https://base.test', token: tok }); }, token);
ok(info.you === 'agent kit-test' && info.scopes.includes('schema'), 'connect: the server knows the agent: ' + info.you);
ok(await ev(async tok => { const d = new TextDecoder(); const inFiles = [...kit.vfs.nodes.values()].some(n => !n.dir && d.decode(n.data).includes(tok)); return !inFiles && (await kit.use('secrets')).get('BASE_TOKEN') === tok; }, token), 'the token is a secret, in no file (mcp.json holds ${BASE_TOKEN})');
const names = await ev(async () => (await kit.use('tools')).names().filter(n => n.startsWith('mcp__base__')));
ok(names.includes('mcp__base__collection_create') && names.includes('mcp__base__site_write') && !names.includes('mcp__base__hook_write'), `the server's tools are the agent's, within its scopes (${names.length})`);
// as an agent would: through the tool dispatcher (MCP)
const created = await ev(() => kit.tool('mcp__base__collection_create', { name: 'leads', listRule: '', createRule: '', fields: [{ name: 'email', type: 'email', required: true }, { name: 'note', type: 'text' }] }));
ok(/"leads"/.test(created) && !/^Error/.test(created), 'an agent creates a collection over MCP');
ok(/^Error/.test(await ev(() => kit.tool('mcp__base__record_create', { collection: 'leads', data: { note: 'no email' } }))), 'validation errors come back to the agent');
await ev(() => kit.tool('mcp__base__site_write', { path: 'index.html', content: '<form>Join us</form>' }));
ok((await (await fetch(`http://127.0.0.1:${port}/`)).text()) === '<form>Join us</form>', 'an agent publishes a page');
// REST helpers and the public records API (anyone may create a lead: createRule "")
ok((await ev(() => kit.base.call('records_list', { collection: 'leads' }))).count === 0, 'base.call runs a tool over REST');
await ev(() => kit.base.collection('leads').create({ email: 'ada@example.com', note: 'hi' }));
const list = await ev(() => kit.base.collection('leads').list({ filter: "email ~ 'ada'" }));
ok(list.totalItems === 1 && list.items[0].email === 'ada@example.com', 'the records API');
ok(await ev(() => kit.base.call('hook_write', { name: 'x.pb.js', content: '' }).then(() => false, e => /scope/.test(e.message))), 'out-of-scope calls fail with the reason');
ok(await ev(() => kit.base.health()), 'health');
// the model gateway: an agent sets it up, a user gets a key, and the kit's own Ollama client uses it unchanged
const gw = await ev(async ({ boss, up, dir }) => {
  const b = kit.base; const as = async (tok, f) => { const s = await kit.use('secrets'); const old = s.get('BASE_TOKEN'); await s.set('BASE_TOKEN', tok); try { return await f(); } finally { await s.set('BASE_TOKEN', old); } };
  await as(boss, async () => {
    await b.call('module_enable', { name: 'gateway' });
    await b.call('provider_set', { name: 'box', type: 'ollama', base_url: up });
    await b.call('model_set', { name: 'house-chat', provider: 'box', upstream: 'qwen3:8b', kind: 'chat', price_in: 1, price_out: 2 });
    await b.call('model_set', { name: 'house-embed', provider: 'box', upstream: 'embeddinggemma', kind: 'embed' });
  });
  await b.collection('users').create({ email: 'grace@example.com', password: 'password123', passwordConfirm: 'password123' });
  await b.signIn('grace@example.com', 'password123');
  const { key } = await b._fetch('/api/gateway/keys', { method: 'POST', body: { name: 'kit' } });
  const { Ollama } = await import(dir + 'ollama.js');
  const o = new Ollama({ host: 'https://base.test', apiKey: key });
  let text = ''; for await (const c of o.chat({ model: 'house-chat', messages: [{ role: 'user', content: 'hi' }] })) text += c.message?.content || '';
  const vecs = await o.embed(['a', 'b'], { model: 'house-embed' });
  const models = await o.models();
  const me = await b._fetch('/api/gateway/me');
  return { text, dims: vecs.map(v => v.length), models, tokens: me.month.tokens, keyPrefix: key.slice(0, 4) };
}, { boss, up: `http://127.0.0.1:${upstream.address().port}`, dir: '/' + t.from.replace(/[^/]+$/, '') });
ok(gw.text === 'Hi from the gateway', "the kit's Ollama client chats through the gateway: " + gw.text);
ok(gw.dims.join() === '3,3' && gw.models.includes('house-chat'), 'embeddings and the model list through the gateway');
ok(gw.tokens === 16 && gw.keyPrefix === 'jab_', `usage is metered for the user (${gw.tokens} tokens)`);
await ev(() => kit.base.disconnect());
ok(await ev(async () => !(await kit.use('secrets')).has('BASE_TOKEN') && !(await kit.use('tools')).names().some(n => n.startsWith('mcp__base__'))), 'disconnect forgets the token and the tools');
cleanup();
await t.done();
