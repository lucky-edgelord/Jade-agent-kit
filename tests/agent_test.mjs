// The pi-style agent on a stand-in Ollama Cloud, and the tool definitions.
import { start } from './_harness.mjs';
const t = await start({ busybox: true });
const { ok, ev, page } = t;
// tool definitions
let r = await ev(() => ({ names: kit.tools.names(), oa: kit.tools.openai(['read', 'edit'])[1].function.name, an: kit.tools.anthropic(['bash'])[0].input_schema.required }));
ok(['read', 'write', 'edit', 'bash', 'python', 'javascript', 'sqlite', 'search_files', 'search', 'fetch'].every(n => r.names.includes(n)) && r.oa === 'edit' && r.an.join() === 'command', 'tool definitions in OpenAI and Anthropic shapes: ' + JSON.stringify(r));
r = await ev(async () => {
  const c = (n, a) => kit.tools.call(n, a);
  return [await c('write', { path: '/w/a.txt', content: 'alpha\nbeta\ngamma\n' }), await c('edit', { path: '/w/a.txt', oldText: 'beta', newText: 'BETA' }), await c('read', { path: '/w/a.txt' }),
    await c('edit', { path: '/w/a.txt', oldText: 'nope', newText: 'x' }), await c('bash', { command: 'cd /w && grep -n BETA a.txt' }), await c('bash', { command: 'pwd' }), await c('nope', {}),
    await c('python', { code: 'print(6*7)' }), await c('javascript', { code: 'return 1+1' }), await c('sqlite', { database: ':memory:', sql: 'select 1 as x' })];
});
ok(/^Created \/w\/a.txt/.test(r[0]) && /Edited \/w\/a.txt: 1 replacement at line 2/.test(r[1]) && r[2] === '     1\talpha\n     2\tBETA\n     3\tgamma\n     4\t', 'write, edit, read: ' + JSON.stringify(r.slice(0, 3)));
ok(/^Error: oldText was not found/.test(r[3]) && r[4] === '2:BETA' && r[5] === '/w' && /^Error: unknown tool/.test(r[6]), 'errors come back as text; bash keeps its working directory: ' + JSON.stringify(r.slice(3, 7)));
ok(r[7] === '42' && r[8] === '=> 2' && r[9] === '[{"x":1}]', 'python, javascript, sqlite tools: ' + JSON.stringify(r.slice(7)));
// stand-in Ollama Cloud: the model writes a file, runs it, searches, then answers
const seen = [];
await page.route('https://ollama.com/**', async route => {
  const req = route.request(); const url = new URL(req.url()); const body = req.postData() ? JSON.parse(req.postData()) : {}; seen.push({ path: url.pathname, auth: req.headers().authorization, body });
  const cors = { 'access-control-allow-origin': '*' };
  if (req.headers().authorization !== 'Bearer test-key') return route.fulfill({ status: 401, json: { error: 'unauthorized' }, headers: cors });
  if (url.pathname === '/api/web_search') return route.fulfill({ json: { results: [{ title: 'Kit', url: 'https://example.com/kit', content: 'Jade Agent Kit docs' }] }, headers: cors });
  if (url.pathname === '/api/web_fetch') return route.fulfill({ json: { title: 'Example', content: 'page text', links: ['https://example.com/a'] }, headers: cors });
  if (url.pathname === '/api/chat') {
    const turn = body.messages.filter(m => m.role === 'tool').length;
    const plan = [
      { tool_calls: [{ function: { name: 'write', arguments: { path: '/hi.py', content: 'print("hi from py")' } } }] },
      { tool_calls: [{ function: { name: 'bash', arguments: { command: 'python /hi.py' } } }] },
      { tool_calls: [{ function: { name: 'search', arguments: { query: 'jade agent kit' } } }, { function: { name: 'fetch', arguments: { url: 'https://example.com/kit' } } }] },
    ];
    const step = turn === 0 ? 0 : turn === 1 ? 1 : turn === 2 ? 2 : 3;
    const msg = step < 3 ? { role: 'assistant', content: '', ...plan[step] } : { role: 'assistant', content: 'Done: ' + body.messages.filter(m => m.role === 'tool').map(m => m.content.split('\n')[0]).join(' | ') };
    const lines = [{ message: { role: 'assistant', content: '', thinking: 'hmm' }, done: false }, { message: msg, done: false }, { done: true, message: { role: 'assistant', content: '' } }];
    return route.fulfill({ body: lines.map(l => JSON.stringify(l)).join('\n') + '\n', headers: { ...cors, 'content-type': 'application/x-ndjson' } });
  }
  return route.fulfill({ status: 404, json: { error: 'nope' }, headers: cors });
});
r = await ev(async () => { const ev_ = []; const a = await kit.agent({ model: 'gpt-oss:120b', onEvent: e => ev_.push(e.type + (e.name ? ':' + e.name : '')) }); const text = await a.prompt('make and run a python hello'); return { text, ev: ev_, n: a.messages.length }; });
ok(r.text === 'Done: Created /hi.py (19 bytes) | hi from py | [1] Kit | # Example', 'the agent loop runs tools until the model answers: ' + JSON.stringify(r.text));
ok(r.ev.includes('tool_call:write') && r.ev.includes('tool_result:bash') && r.ev.includes('thinking') && r.ev.at(-1) === 'done', 'events: ' + r.ev.join(','));
const chat = seen.find(s => s.path === '/api/chat');
ok(chat.auth === 'Bearer test-key' && chat.body.model === 'gpt-oss:120b' && chat.body.stream === true && chat.body.tools.map(x => x.function.name).join() === 'read,write,edit,bash,search,fetch' && chat.body.messages[0].role === 'system', 'requests go to ollama.com with the key, the six tools and a system prompt');
ok(seen.some(s => s.path === '/api/web_search' && s.body.query === 'jade agent kit' && s.body.max_results === 5) && seen.some(s => s.path === '/api/web_fetch' && s.body.url === 'https://example.com/kit'), 'search and fetch use Ollama web search / fetch');
r = await ev(async () => { kit.ollama.apiKey = 'bad'; try { await (await kit.agent()).prompt('x'); return 'no error'; } catch (e) { return e.message; } finally { kit.ollama.apiKey = 'test-key'; } });
ok(/key was rejected/.test(r), 'a bad key is explained: ' + r);
await t.done();
