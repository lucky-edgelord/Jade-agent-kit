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
const port = 18000 + Math.floor(Math.random() * 1000);
const srv = spawn(bin, ['serve', '--http', `127.0.0.1:${port}`, '--dir', path.join(dir, 'pb_data'), '--publicDir', path.join(dir, 'pb_public'), '--hooksDir', path.join(dir, 'pb_hooks')], { stdio: 'ignore' });
const cleanup = () => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); };
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
await ev(() => kit.base.disconnect());
ok(await ev(async () => !(await kit.use('secrets')).has('BASE_TOKEN') && !(await kit.use('tools')).names().some(n => n.startsWith('mcp__base__'))), 'disconnect forgets the token and the tools');
cleanup();
await t.done();
