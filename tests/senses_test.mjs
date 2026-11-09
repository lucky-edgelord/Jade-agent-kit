// Senses and devices: HTTP with secrets, MCP servers, camera / microphone / location / battery / device, look, WebUSB and
// backups. APIs, MCP servers, a backup server and Ollama Cloud are stood in for; the camera and microphone are Chromium's fakes.
import { start } from './_harness.mjs';
const t = await start({ use: null, busybox: false });
const { ok, ev, page } = t;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*', 'access-control-allow-methods': '*' };
const seen = [];
await page.route('https://api.test/**', async route => {
  const req = route.request(); const u = new URL(req.url()); seen.push({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (u.pathname === '/echo') return route.fulfill({ json: { got: req.headers().authorization, q: u.searchParams.get('key'), body: req.postData() ? JSON.parse(req.postData()) : null }, headers: cors });
  if (u.pathname === '/image.png') return route.fulfill({ body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]), headers: { ...cors, 'content-type': 'image/png' } });
  return route.fulfill({ status: 404, body: 'not here', headers: cors });
});
// a stand-in MCP server: JSON for most calls, an event stream for one
await page.route('https://mcp.test/**', async route => {
  const req = route.request(); if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.method() === 'DELETE') return route.fulfill({ status: 200, headers: cors });
  const m = JSON.parse(req.postData()); const h = { ...cors, 'mcp-session-id': 'sess-1' };
  if (req.headers().authorization !== 'Bearer mcp-secret-value') return route.fulfill({ status: 401, json: { error: { message: 'bad token' } }, headers: h });
  if (!m.id) return route.fulfill({ status: 202, headers: h });
  if (m.method !== 'initialize' && req.headers()['mcp-session-id'] !== 'sess-1') return route.fulfill({ status: 400, json: { error: { message: 'no session' } }, headers: h });
  const R = result => route.fulfill({ json: { jsonrpc: '2.0', id: m.id, result }, headers: h });
  if (m.method === 'initialize') return R({ protocolVersion: '2025-06-18', serverInfo: { name: 'calc' }, capabilities: { tools: {}, resources: {} } });
  if (m.method === 'tools/list') return R({ tools: [{ name: 'add', description: 'Add two numbers', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } } }, { name: 'chart', description: 'Draw a chart', inputSchema: { type: 'object' } }, { name: 'fail', description: 'Always fails' }] });
  if (m.method === 'tools/call' && m.params.name === 'add') return route.fulfill({ body: `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } })}\n\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: String(m.params.arguments.a + m.params.arguments.b) }] } })}\n\n`, headers: { ...h, 'content-type': 'text/event-stream' } });
  if (m.method === 'tools/call' && m.params.name === 'chart') return R({ content: [{ type: 'text', text: 'here' }, { type: 'image', data: Buffer.from('PNGDATA').toString('base64'), mimeType: 'image/png' }] });
  if (m.method === 'tools/call') return R({ isError: true, content: [{ type: 'text', text: 'it failed' }] });
  if (m.method === 'resources/list') return R({ resources: [{ uri: 'calc://readme', name: 'readme' }] });
  if (m.method === 'resources/read') return R({ contents: [{ uri: m.params.uri, text: 'Calc reads numbers.' }] });
  return route.fulfill({ json: { jsonrpc: '2.0', id: m.id, error: { message: 'unknown method' } }, headers: h });
});
const store = new Map();
await page.route('https://backup.test/**', async route => {
  const req = route.request(); const u = new URL(req.url()); if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
  if (req.headers().authorization !== 'Bearer bk-token') return route.fulfill({ status: 401, json: { error: 'bad token' }, headers: cors });
  const name = decodeURIComponent(u.pathname.replace(/^\/backups\/?/, ''));
  if (req.method() === 'PUT') { const b = req.postDataBuffer(); const sha = require_sha(b); if (sha !== req.headers()['x-sha256']) return route.fulfill({ status: 400, json: { error: 'checksum' }, headers: cors }); store.set(name, b); return route.fulfill({ json: { ok: true, sha256: sha }, headers: cors }); }
  if (!name) return route.fulfill({ json: { backups: [...store.keys()].map(n => ({ name: n, size: store.get(n).length })) }, headers: cors });
  const b = store.get(name); return b ? route.fulfill({ body: b, headers: { ...cors, 'x-sha256': require_sha(b), 'content-type': 'application/octet-stream' } }) : route.fulfill({ status: 404, json: { error: 'no such backup' }, headers: cors });
});
const crypto = await import('node:crypto'); function require_sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
let lastChat = null;
await page.route('https://ollama.com/**', async route => {
  const body = JSON.parse(route.request().postData() || '{}'); lastChat = body; const tools = body.messages.filter(m => m.role === 'tool');
  const msg = tools.length ? { role: 'assistant', content: 'I see a picture.' } : { role: 'assistant', content: '', tool_calls: [{ function: { name: 'look', arguments: { path: '/pics/dot.png' } } }] };
  return route.fulfill({ body: JSON.stringify({ message: msg, done: false }) + '\n' + JSON.stringify({ done: true, message: { role: 'assistant', content: '' } }) + '\n', headers: { 'access-control-allow-origin': '*', 'content-type': 'application/x-ndjson' } });
});

// ---------------------------------------------------------------- HTTP with secrets
let r = await ev(async () => {
  const s = await kit.use('secrets'); await s.set('API_KEY', 'sk-live-0123456789'); const H = await kit.use('http');
  const a = await H.request({ url: 'https://api.test/echo', query: { key: '{{API_KEY}}' }, headers: { Authorization: 'Bearer {{API_KEY}}' }, method: 'POST', json: { hello: 'world', k: '{{API_KEY}}' } });
  const tool = await kit.tool('http', { url: 'https://api.test/echo', headers: { Authorization: 'Bearer {{API_KEY}}' } });
  const img = await kit.tool('http', { url: 'https://api.test/image.png' });
  const nf = await kit.tool('http', { url: 'https://api.test/nothing' });
  const bad = await kit.tool('http', { url: 'ftp://x' }), getBody = await kit.tool('http', { url: 'https://api.test/echo', body: 'x' });
  H.allow = ['api.test']; const allowed = await kit.tool('http', { url: 'https://api.test/echo' }); H.allow = ['example.com']; const blocked = await kit.tool('http', { url: 'https://api.test/echo' }); H.allow = null;
  return { a: { status: a.status, json: a.json, secrets: a.secrets }, tool, img, saved: kit.vfs.readBytes('/downloads/image.png').length, nf, bad, getBody, allowed: allowed.slice(0, 8), blocked };
});
const sent = seen.find(s => s.method === 'POST');
ok(sent.headers.authorization === 'Bearer sk-live-0123456789' && /key=sk-live/.test(sent.url) && JSON.parse(sent.body).k === 'sk-live-0123456789', 'secrets are filled into the url, headers and body that go out');
ok(r.a.status === 200 && r.a.json.got === 'Bearer {{API_KEY}}' && r.a.json.body.k === '{{API_KEY}}' && r.a.secrets.join() === 'API_KEY' && !/sk-live/.test(r.tool) && /secrets used: API_KEY/.test(r.tool), 'and redacted from everything that comes back: ' + JSON.stringify(r.a.json));
ok(/Saved 8 bytes \(image\/png\) to \/downloads\/image\.png/.test(r.img) && r.saved === 8 && /^HTTP 404/.test(r.nf) && /not here/.test(r.nf) && /must start with http/.test(r.bad) && /cannot have a body/.test(r.getBody), 'binary bodies are saved; errors are plain: ' + r.img.split('\n').pop());
ok(r.allowed === 'HTTP 200' && /not in the allowed hosts/.test(r.blocked), 'an allow list limits the hosts');

// ---------------------------------------------------------------- MCP
r = await ev(async () => {
  await kit.secrets.set('CALC_TOKEN', 'mcp-secret-value');
  const M = await kit.use('mcp'); await M.add('calc', { url: 'https://mcp.test/mcp', headers: { Authorization: 'Bearer ${CALC_TOKEN}' }, description: 'a calculator' });
  const st = M.status(); const sum = await M.call('calc', 'add', { a: 2, b: 40 });
  const chart = await kit.tool('mcp', { action: 'call', server: 'calc', tool: 'chart' }); const fail = await kit.tool('mcp', { action: 'call', server: 'calc', tool: 'fail' });
  const tools = await kit.tool('mcp', { action: 'tools' }); const res = await kit.tool('mcp', { action: 'read', server: 'calc', uri: 'calc://readme' });
  const direct0 = kit.tools.names().includes('mcp__calc__add');
  await M.add('calc', { url: 'https://mcp.test/mcp', headers: { Authorization: 'Bearer ${CALC_TOKEN}' }, exposure: 'direct' });
  const direct = await kit.tool('mcp__calc__add', { a: 1, b: 1 }); const plugin = M.plugin().tools;
  await M.add('bad', { url: 'https://mcp.test/mcp', headers: { Authorization: 'Bearer wrong' } }); let stdio; try { await M.add('local', { command: 'npx thing' }); } catch (e) { stdio = e.message; }
  return { st, sum, chart, fail, tools, res, direct0, direct, plugin, bad: M.status().find(s => s.name === 'bad'), stdio, cfg: JSON.parse(kit.vfs.read('/.kit/mcp.json')).mcpServers.calc.headers.Authorization };
});
ok(r.st[0].state === 'connected' && r.st[0].tools === 3 && r.sum === '42' && /here\n\[image saved to \/downloads\/mcp\/chart\.png\]/.test(r.chart) && /^Error: it failed/.test(r.fail), 'MCP over streamable HTTP: session, JSON and event-stream answers, images saved, error results: ' + JSON.stringify([r.sum, r.chart]));
ok(/calc\/add: Add two numbers/.test(r.tools) && r.res === 'Calc reads numbers.' && !r.direct0 && r.direct === '2' && r.plugin.includes('mcp__calc__add'), 'tools stay behind the mcp tool unless exposure is direct; resources: ' + JSON.stringify(r.plugin));
ok(r.bad.state === 'error' && /401.*bad token|bad token/.test(r.bad.error) && /stdio servers/.test(r.stdio) && r.cfg === 'Bearer ${CALC_TOKEN}', 'a bad token is reported; stdio servers are refused; secrets stay as ${NAME} in mcp.json: ' + r.bad.error);

// ---------------------------------------------------------------- senses
r = await ev(async () => {
  const S = await kit.use('senses'); const denied = await kit.tool('senses', { action: 'photo' });
  S.allow('camera', 'microphone', 'location');
  const photo = await S.photo({ width: 320 }); const head = [...kit.vfs.readBytes(photo.path).slice(0, 3)];
  const rec = await S.record({ seconds: 1 }); const loc = await S.location(); const bat = await S.battery(); const dev = S.device(); const net = S.network();
  return { denied, photo, head, rec, loc, bat, dev: { tz: dev.timezone, cores: dev.cores, allowed: dev.allowed }, net };
});
ok(/not allowed by this app/.test(r.denied) && r.photo.width === 320 && r.head.join() === '255,216,255' && r.rec.bytes > 100 && /\.(webm|ogg|m4a)$/.test(r.rec.path), 'camera and microphone (once the app allows them): a JPEG photo and a recording in the file system: ' + JSON.stringify([r.photo, r.rec]));
ok(r.loc.lat === 40.01 && r.loc.lon === -74 && typeof r.bat.level === 'number' && r.dev.cores > 0 && r.dev.allowed.length === 3 && typeof r.net.online === 'boolean', 'location, battery, device and network: ' + JSON.stringify([r.loc, r.bat]));
r = await ev(async () => {
  kit.vfs.write('/pics/dot.png', Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='), c => c.charCodeAt(0)));
  const a = await kit.agent({ brain: ['senses'] }); const text = await a.prompt('what is in /pics/dot.png?');
  return { text, roles: a.messages.map(m => m.role + (m.images ? '+img' : '')).join(',') };
});
const imgMsg = lastChat.messages.find(m => m.images);
ok(r.text === 'I see a picture.' && r.roles === 'user,assistant,tool,user+img,assistant' && imgMsg?.images[0]?.startsWith('iVBOR'), 'look: the agent asks to see an image and gets it on its next step: ' + r.roles);

// ---------------------------------------------------------------- WebUSB
r = await ev(async () => { const U = await kit.use('usb'); return { supported: U.supported, list: await kit.tool('usb', { action: 'list' }), open: await kit.tool('usb', { action: 'open' }) }; });
ok(r.supported ? /No USB devices are allowed yet/.test(r.list) && /no USB device has been allowed yet/.test(r.open) : /not available/.test(r.list), 'usb: no device until the user picks one: ' + JSON.stringify(r));

// ---------------------------------------------------------------- backups
r = await ev(async () => {
  const B = await kit.use('backup'); kit.vfs.write('/keep/a.txt', 'alpha'); kit.vfs.write('/keep/bin.dat', new Uint8Array([0, 255, 1, 2]));
  const plain = await B.make({ root: '/keep' }); const sealed = await B.make({ root: '/keep', passphrase: 'correct horse' });
  const back = await B.read(plain.bytes); let wrong; try { await B.read(sealed.bytes, 'nope'); } catch (e) { wrong = e.message; }
  kit.vfs.write('/keep/a.txt', 'changed'); kit.vfs.write('/keep/extra.txt', 'new');
  const merged = await B.restore(sealed.bytes, { passphrase: 'correct horse' }); const afterMerge = [kit.vfs.read('/keep/a.txt'), kit.vfs.exists('/keep/extra.txt')];
  const replaced = await B.restore(plain.bytes, { mode: 'replace' });
  return { files: plain.files, gz: [...plain.bytes.slice(0, 2)].join(), enc: new TextDecoder().decode(sealed.bytes.slice(0, 40)), keys: Object.keys(back.files).sort(), bin: back.files['/keep/bin.dat'], wrong, merged, afterMerge, replaced, extra: kit.vfs.exists('/keep/extra.txt'), bytes: [...kit.vfs.readBytes('/keep/bin.dat')].join() };
});
ok(r.files === 2 && r.gz === '31,139' && /jade-agent-kit-encrypted/.test(r.enc) && r.keys.join() === '/keep/a.txt,/keep/bin.dat' && r.bin.b64 === 'AP8BAg==' && /wrong passphrase/.test(r.wrong), 'a backup is gzip JSON, binary files kept, encrypted with a passphrase: ' + r.enc.slice(0, 30));
ok(r.merged.written === 2 && r.afterMerge.join() === 'alpha,true' && r.replaced.removed === 1 && !r.extra && r.bytes === '0,255,1,2', 'restore merges, or replaces (removing files not in the backup): ' + JSON.stringify([r.merged, r.replaced]));
r = await ev(async () => {
  const B = kit.backup; B.server = { url: 'https://backup.test', token: 'bk-token' }; B.passphrase = 'pw';
  const up = await B.upload({ root: '/keep' }); const list = await B.list(); kit.vfs.rm('/keep/a.txt');
  const restored = await B.restoreFrom(up.name); B.server.token = 'nope'; let denied; try { await B.list(); } catch (e) { denied = e.message; } B.server.token = 'bk-token';
  return { up, list: list.map(x => x.name), restored, a: kit.vfs.read('/keep/a.txt'), denied, tool: await kit.tool('backup', { action: 'list' }) };
});
ok(r.up.encrypted && r.list.includes(r.up.name) && r.restored.written === 2 && r.a === 'alpha' && /401: bad token/.test(r.denied) && r.tool.includes(r.up.name), 'the backup server: upload with a checksum, list, restore, and its errors: ' + JSON.stringify(r.up));
await t.done();
