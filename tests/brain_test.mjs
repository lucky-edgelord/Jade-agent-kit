// The agent brain: memory, knowledge graph, think, delegate, skills and steering, chat history, context guard, the tool
// and model routers, and kit.agent({ brain }) wiring them in as plugins. Ollama Cloud is stood in for.
import { start } from './_harness.mjs';
const t = await start({ use: null, busybox: false });
const { ok, ev, page, from } = t;
const base = from.replace(/[^/]+$/, '');
const seen = []; let agentTurn = null; let failNext = null;
const cors = { 'access-control-allow-origin': '*' };
const nd = msg => ({ body: JSON.stringify({ message: msg, done: false }) + '\n' + JSON.stringify({ done: true, message: { role: 'assistant', content: '' } }) + '\n', headers: { ...cors, 'content-type': 'application/x-ndjson' } });
await page.route('https://ollama.com/**', async route => {
  const req = route.request(); const url = new URL(req.url()); const body = req.postData() ? JSON.parse(req.postData()) : {}; seen.push({ path: url.pathname, body });
  if (url.pathname === '/v1/systemone') {
    const q = body.questions.q; const keys = Object.keys(q.criteria || {});
    if (q.type === 'noul') return route.fulfill({ json: { model: body.model, answers: { q: { noul: /42/.test(body.state) ? 0.9 : 0.2, confidence: 0.9 } } }, headers: cors });
    const pick = /rust|parse|code/i.test(body.state) ? keys.find(k => /code/i.test(q.criteria[k])) : keys[0];
    return route.fulfill({ json: { model: body.model, answers: { q: { choice: pick, confidence: 0.8, probabilities: Object.fromEntries(keys.map(k => [k, k === pick ? 0.8 : 0.2 / (keys.length - 1)])) } } }, headers: cors });
  }
  if (url.pathname !== '/api/chat') return route.fulfill({ status: 404, json: { error: 'nope' }, headers: cors });
  if (failNext) { const m = failNext; failNext = null; return route.fulfill({ status: 400, json: { error: m }, headers: cors }); }
  const sys = body.messages[0]?.role === 'system' ? body.messages[0].content : '';
  if (body.stream === false) {
    let content = 'ok';
    if (/diary/.test(sys)) content = 'SUMMARY:\n- The user asked about tea.\nREMEMBER:\n- The user likes green tea\n- api_key: sk-abcdefabcdef123456\n- none';
    else if (/compacting/.test(sys)) content = '## Goal\nKeep chatting about planets.\n## Progress\nTalked about Mars.\n## Key facts\n- favourite: Mars\n## Current state\nmid-chat\n## Next steps\nmore planets';
    else if (/propose candidate/.test(sys)) content = JSON.stringify({ thoughts: [{ text: 'the answer is 41', p: 0.6 }, { text: 'the answer is 42', p: 0.4 }] });
    else if (/strict reviewer/.test(sys)) content = '{"score": 0.7, "flaw": "a bit vague"}';
    else if (/sub-agent/.test(sys)) {
      const tools = body.messages.filter(m => m.role === 'tool');
      if (!tools.length) return route.fulfill({ json: { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read', arguments: { path: '/notes/plan.md' } } }, { function: { name: 'write', arguments: { path: '/x', content: 'y' } } }] }, done: true }, headers: cors });
      content = 'Report: ' + tools.map(m => m.content.split('\n')[0]).join(' | ') + ` (tools offered: ${(body.tools || []).map(x => x.function.name).join(',')})`;
    }
    return route.fulfill({ json: { message: { role: 'assistant', content }, done: true }, headers: cors });
  }
  return route.fulfill(nd(agentTurn ? agentTurn(body) : { role: 'assistant', content: 'hello' }));
});
await ev(async () => { window.kb = await K.createKit({ ollamaKey: 'test-key', decide: { server: 'cloud' } }); });

// ---------------------------------------------------------------- lean: nothing loads until it is used
let r = await ev(async () => { const before = ['memory', 'knowledge', 'think', 'skills', 'history', 'guard', 'router'].filter(n => kb.has(n)); const listed0 = (await kb.use('tools')).names().includes('memory'); const out = await kb.tool('memory', { action: 'save', text: 'Works on the Jade Agent Kit', section: 'projects' }); return { before, listed0, out, has: kb.has('memory'), listed: kb.tools.names().includes('memory') }; });
ok(r.before.length === 0 && !r.listed0 && /Saved under "Projects & people"/.test(r.out) && r.has && r.listed, 'brain features load on first use: a memory call loads memory and adds its tool: ' + JSON.stringify(r));

// ---------------------------------------------------------------- memory
r = await ev(async () => {
  const m = kb.memory; const o = [];
  o.push(m.save('Prefers short answers', 'preferences').added, m.save('prefers short answers!', 'preferences').added, m.save('my password: hunter2').added, m.save('Lives in Lisbon', 'about').added);
  const file = kb.vfs.read('/.kit/memory/Memory.md');
  const s = await m.search('does the user live in Lisbon'); const ctx = await m.context('answers should be short please');
  let forgot; try { m.forget('nothing like this'); } catch (e) { forgot = e.message; }
  const f2 = m.forget('Lisbon');
  return { o, sections: /## Preferences\n- Prefers short answers \(\d{4}-\d{2}-\d{2}\)/.test(file), s: s[0]?.text, ctx, forgot, f2, after: m.lines().map(x => x.text.replace(/ \(.*\)$/, '')) };
});
ok(JSON.stringify(r.o) === '[true,false,false,true]' && r.sections, 'save files facts under sections, skips duplicates and refuses secrets: ' + JSON.stringify(r.o));
ok(/Lives in Lisbon/.test(r.s) && /Long-term memory/.test(r.ctx) && /Prefers short answers/.test(r.ctx.split('\n')[3] || ''), 'search ranks with BM25 and the prompt block leads with the best match: ' + JSON.stringify(r.ctx.split('\n').slice(0, 4)));
ok(/Nothing in memory matches/.test(r.forgot) && /Forgot 1/.test(r.f2) && !r.after.some(x => /Lisbon/.test(x)), 'forget removes the matching line: ' + JSON.stringify(r.after));
r = await ev(async () => { const j = await kb.memory.journal([{ role: 'user', content: 'tell me about tea' }, { role: 'assistant', content: 'Tea is…' }], { title: 'Tea chat', id: 'c1' }); const again = await kb.memory.journal([{ role: 'user', content: 'tell me about tea' }, { role: 'assistant', content: 'Tea is…' }], { id: 'c1' }); return { j, again, day: kb.vfs.read(j.path), mem: kb.memory.lines().map(x => x.text) }; });
ok(r.j.learned === 1 && /## \d\d:\d\d · Tea chat\n- The user asked about tea/.test(r.day) && r.mem.some(x => /green tea/.test(x)) && !r.mem.some(x => /sk-/.test(x)) && r.again === null, 'journal: an entry per chat, durable facts learned, secrets dropped, nothing new is not journaled twice: ' + JSON.stringify(r.mem));
r = await ev(async () => (await kb.memory.search('tea')).map(x => x.src));
ok(r.includes('memory') && r.some(x => /^\d{4}-\d{2}-\d{2}$/.test(x)), 'search covers memory and the journal: ' + JSON.stringify(r));

// ---------------------------------------------------------------- knowledge graph: the shared cases, then the tool
r = await ev(async b => {
  const { kgEngine } = await import('/' + b + 'knowledge.js'); const call = await kgEngine(); const { cases } = await (await fetch('/tests/fixtures/kg_cases.json')).json();
  const norm = rows => rows.map(x => JSON.stringify(Object.fromEntries(Object.entries(x).sort()))).sort(); const bad = [];
  for (const c of cases) {
    let l; try { l = call({ op: 'load', rules: c.rules, facts: c.facts || [] }); } catch (e) { if (c.op !== 'error' || e.code !== c.code) bad.push(c.name + ': ' + e.message); continue; }
    if (c.op === 'error') { bad.push(c.name + ': no error'); continue; }
    if (c.op === 'query') { const q = call({ op: 'query', handle: l.handle, q: c.input }); if (JSON.stringify(norm(q.answers.map(a => a.bindings))) !== JSON.stringify(norm(c.answers))) bad.push(c.name); }
    else if (c.op === 'check') { const q = call({ op: 'check', handle: l.handle }); if (q.violations.length !== (c.violations || []).length) bad.push(c.name); }
    else { const v = call({ op: 'verify', handle: l.handle, claim: c.input }); if (v.verdict !== c.verdict) bad.push(c.name + ': ' + v.verdict); }
    call({ op: 'free', handle: l.handle });
  }
  return { n: cases.length, bad };
}, base);
ok(r.n > 20 && r.bad.length === 0, `the knowledge engine passes the ${r.n} cases Jade Vault and jade-py share: ` + JSON.stringify(r.bad));
r = await ev(async () => {
  const k = await kb.use('knowledge'); const T = a => kb.tool('knowledge', a);
  await k.add('reports_to(bob, alice)'); const out = {};
  out.add = await T({ action: 'add', facts: ['reports_to(carl, bob)', 'reports_to(carl, bob)'], source: 'People.md' });
  out.rule = await T({ action: 'add_rule', rule: 'above(X, Z) :- reports_to(X, Y), above(Y, Z)' }); await T({ action: 'add_rule', rule: 'above(X, Y) :- reports_to(X, Y).' });
  out.proven = await T({ action: 'verify', claim: 'above(carl, alice)' }); out.unknown = await T({ action: 'verify', claim: 'above(alice, carl)' });
  out.query = await T({ action: 'query', q: 'above(carl, X)' });
  await T({ action: 'add_rule', rule: '! no_self_report: reports_to(P, P).' }); await k.add('reports_to(dana, dana)'); out.check = await T({ action: 'check' });
  const prop = k.facts().find(f => f.status === 'proposed'); k.confirm(prop.id); out.confirmed = await T({ action: 'verify', claim: 'above(carl, alice)' });
  out.remove = await T({ action: 'remove', id: k.facts()[0].id }); out.stats = await T({ action: 'stats' }); out.bad = await T({ action: 'add_rule', rule: 'this is not a rule' });
  return out;
});
ok(/reports_to\(carl, bob\): proposed/.test(r.add) && /already in the graph/.test(r.add), 'add: agent facts are proposed, duplicates are not added twice: ' + r.add.split('\n').slice(0, 2).join(' | '));
ok(/^✓ PROVEN \(rests on 1 unconfirmed fact/.test(r.proven) && /^\? UNKNOWN/.test(r.unknown) && /alice/.test(r.query) && /bob/.test(r.query), 'verify proves through rules and names unconfirmed facts; unknown stays unknown; query binds variables: ' + r.proven.split('\n')[0]);
ok(/no_self_report/.test(r.check) && /dana/.test(r.check) && /^✓ PROVEN: above\(carl, alice\)/.test(r.confirmed), 'check finds constraint violations; once confirmed, the proof no longer warns: ' + r.confirmed.split('\n')[0]);
ok(/Not removed/.test(r.remove) && /facts \(/.test(r.stats) && /Relations: .*reports_to\/2/.test(r.stats) && /^Error:/.test(r.bad), 'confirmed facts are not the agent\'s to remove; stats lists relations; a bad rule is refused: ' + r.stats.replace(/\n/g, ' | '));

// ---------------------------------------------------------------- skills and steering
r = await ev(async () => {
  const v = kb.vfs; v.write('/.kit/SOUL.md', '---\nname: Ivy\n---\n# SOUL\n<!-- a note for people -->\nI am Ivy. I speak briefly.'); v.write('/AGENTS.md', '# AGENTS\n- Use metric units.');
  v.write('/.kit/skills/tea-brewing/SKILL.md', '---\nname: tea-brewing\ndescription: Brew tea properly. Use when the user asks how to make tea.\n---\n# Tea\n1. Boil water to 80C.\n2. Steep 3 minutes.');
  v.write('/.kit/skills/tea-brewing/temps.txt', 'green 80, black 95');
  const s = await kb.use('skills'); const ctx = await s.context('how do I make tea');
  return { ctx, load: s.load('Tea Brewing'), exp: s.expand('/skill:tea-brewing for two cups').text, miss: (() => { try { s.load('nope'); } catch (e) { return e.message; } })(), seed: s.seed(), names: s.list().map(x => x.name) };
});
ok(/Your persona .*\n.*I am Ivy\. I speak briefly\./.test(r.ctx) && !/a note for people/.test(r.ctx) && /Use metric units/.test(r.ctx) && /- tea-brewing: Brew tea properly/.test(r.ctx), 'steering: persona, standing instructions and the skill list reach the prompt; comments do not: ' + JSON.stringify(r.ctx.slice(0, 200)));
ok(/Skill "tea-brewing" loaded/.test(r.load) && /temps\.txt/.test(r.load) && /Steep 3 minutes/.test(r.load) && /The user's request: for two cups/.test(r.exp) && /Available: .*tea-brewing/.test(r.miss), 'skills load by name (loosely matched), list their extra files, and /skill:name expands: ' + r.miss);
ok(r.names.join() === 'skill-creator,tea-brewing', 'seed() adds only the skill-creator skill: ' + r.names);
r = await ev(async () => {
  const topics = ['invoice', 'garden', 'guitar', 'running', 'budget', 'poetry', 'chess', 'cooking', 'travel', 'sleep', 'resume', 'taxes', 'baking', 'cycling', 'painting', 'photography', 'birdwatching', 'astronomy'];
  for (const x of topics) kb.vfs.write(`/.kit/skills/${x}-helper/SKILL.md`, `---\nname: ${x}-helper\ndescription: Help with ${x}. Use when the user mentions ${x}.\n---\nsteps`);
  const ctx = await kb.skills.context('I want to plan my astronomy night'); const listed = ctx.split('Skills (')[1].split('\n').filter(l => l.startsWith('- '));
  return { routed: kb.skills.routed(), listed: listed.map(l => l.slice(2).split(':')[0]), find: await kb.tool('find_skill', { query: 'filing my taxes' }), tools: kb.skills.plugin().tools };
});
ok(r.routed && r.listed.length <= 6 && r.listed[0] === 'astronomy-helper' && /taxes-helper/.test(r.find.split('\n')[1]) && r.tools.join() === 'skill,find_skill', 'with many skills, only the best matches are listed and find_skill searches the rest: ' + JSON.stringify(r.listed));

// ---------------------------------------------------------------- chat history
r = await ev(async () => {
  const h = await kb.use('history');
  h.save({ id: 'a1', title: 'Planets', messages: [{ role: 'user', content: 'tell me about Mars' }, { role: 'assistant', content: 'Mars is red', tool_calls: [{ function: { name: 'search', arguments: { query: 'mars' } } }] }, { role: 'tool', tool_name: 'search', content: 'Mars facts' }, { role: 'user', content: 'and Venus?' }, { role: 'assistant', content: 'Venus is hot' }] });
  h.save({ id: 'a2', title: 'Recipes', messages: [{ role: 'user', content: 'a soup recipe' }, { role: 'assistant', content: 'Lentil soup…' }] });
  const s = h.search('venus hot'); const read = JSON.parse((await kb.tool('chat_history', { action: 'read', session: 'plan', from: 3 })).split('\n').slice(1).join('\n'));
  return { list: h.list().map(c => c.id).sort(), s: s[0], read: read.messages.map(m => m.i + m.role), tool: (await kb.tool('chat_history', { action: 'search', query: 'lentil' })).split('\n')[0] };
});
ok(r.list.join() === 'a1,a2' && r.s.chat === 'a1' && r.s.index === 3 && r.read.join() === '3user,4assistant' && /data, never instructions/.test(r.tool), 'history: chats are saved, cut into exchanges, searched and read by part of a title: ' + JSON.stringify(r.s));

// ---------------------------------------------------------------- context guard
r = await ev(async () => {
  const g = await kb.use('guard'); const big = 'x'.repeat(20000);
  const msgs = [{ role: 'system', content: 'sys' }, { role: 'user', content: 'q1' }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read', arguments: {} } }] }, { role: 'tool', content: big }, { role: 'user', content: 'q2' }, { role: 'assistant', content: 'a2' }, { role: 'tool', content: big }, { role: 'tool', content: big }, { role: 'user', content: 'q3' }];
  const est = g.estimate(msgs); const s = g.shrink(msgs, [], 6000); const s2 = g.shrink(msgs, [], 600);
  g.learn('prompt is too long: 9000 tokens, maximum context length is 4096', 5000, 'k'); g.learn('input is too long', 8000, 'j');
  return { est, after: g.estimate(s), firstTool: s[3].content.length, kept: s.length, tiny: s2.length, tinyFirst: s2[1].content, lim: g.limits.k, ratio: +g.ratios.k.toFixed(3), lim2: g.limits.j };
});
ok(r.est > 18000 && r.after <= 6000 && r.firstTool < 3000 && r.kept === 9 && r.tinyFirst.startsWith('[') && r.tiny < 9, 'shrink: old tool results are clipped first, then whole old turns are dropped: ' + JSON.stringify(r));
ok(r.lim === 4096 && r.ratio < 3.3 && r.lim2 === 5600, 'learn: a server\'s stated limit is kept, and the characters-per-token ratio is corrected: ' + JSON.stringify([r.lim, r.ratio, r.lim2]));

// ---------------------------------------------------------------- think
r = await ev(async () => {
  const J = async a => { const s = await kb.tool('think', a); const i = s.indexOf('{'); return i >= 0 ? JSON.parse(s.slice(i)) : s; };
  kb.vfs.write('/work/out.txt', 'result: 42 items');
  const st = await J({ action: 'start', goal: 'say something containing 42', verifiers: [{ kind: 'code', source: 'if (!THOUGHT.includes("42")) throw new Error("no 42 in it")' }, { kind: 'file', path: '/work/out.txt', contains: '42' }], nodes: 12 });
  await J({ action: 'expand', node: 0, thoughts: [{ text: 'it is 41', p: 0.6 }, { text: 'it is 42', p: 0.4 }] });
  const c1 = await kb.tool('think', { action: 'check', node: 1 }); const c2 = await J({ action: 'check', node: 2 });
  const best = await J({ action: 'best' }); const next = await J({ action: 'next' }); const close = await J({ action: 'close' });
  const ep = kb.vfs.read('/.kit/think/episodes.jsonl').trim().split('\n').map(JSON.parse);
  const sh = await J({ action: 'start', goal: 'shell check', verifiers: [{ kind: 'shell', cmd: 'grep -q 42 {file}' }] }); await J({ action: 'expand', thoughts: ['no number', 'it is 42'] });
  const s1 = await J({ action: 'check', node: 1 }), s2 = await J({ action: 'check', node: 2 });
  return { st, c1, c2, best, next, close, ep: ep.at(-1), s1: s1.status, s2: s2.status, help: (await kb.tool('think', { action: 'help' })).length };
});
ok(r.st.tree && r.st.verifiers === 2 && r.st.type === 'other', 'start: a tree with its verifiers: ' + JSON.stringify(r.st));
ok(r.c1.startsWith('[Verifier output') && /"vetoed": true/.test(r.c1) && /no 42 in it/.test(r.c1) && r.c2.status === 'solved' && r.c2.score === 1, 'a code verifier that throws vetoes the line (as data); one that passes, with the file check, solves it: ' + r.c1.slice(0, 160).replace(/\n/g, ' '));
ok(r.best.node === 2 && r.best.verified && r.next.action === 'stop' && r.next.stop === 'solved' && r.close.closed === 'ok' && r.ep.outcome === 'ok' && r.ep.best.verified, 'best is the verified line; next stops; close records the episode: ' + JSON.stringify(r.close));
ok(r.s1 === 'dead' && r.s2 === 'solved' && r.help < 3000, 'a shell verifier reads the thought from {file}: ' + JSON.stringify([r.s1, r.s2]));
r = await ev(async () => { const s = await kb.tool('think', { action: 'auto', goal: 'what is six times seven', verifiers: [{ kind: 'code', source: 'if (!/42/.test(THOUGHT)) process.exit(1)' }], n: 2, nodes: 6 }); return JSON.parse(s.slice(s.indexOf('{'))); });
ok(r.stopped === 'solved' && r.best.verified && r.best.thoughts[0] === 'the answer is 42' && r.spent.checks === 2, 'auto: the model proposes, the verifier kills the wrong line, the search stops at the verified one: ' + JSON.stringify(r.best));
r = await ev(async () => { const s = await kb.tool('think', { action: 'auto', goal: 'unverifiable', n: 2, nodes: 2 }); return JSON.parse(s.slice(s.indexOf('{'))); });
ok(r.best.verified === false && /self-review/.test(r.warning) && r.best.score === 0.7, 'auto without a hard check says the result is only self-reviewed: ' + JSON.stringify(r.best));

// ---------------------------------------------------------------- delegate
r = await ev(async () => {
  kb.vfs.write('/notes/plan.md', 'Plan: ship 0.3\nthen rest');
  const rep = await kb.tool('delegate', { task: 'summarise the plan' });
  const nest = await kb.tools.call('delegate', { task: 'x' }, { subagent: true });
  return { rep, nest, x: kb.vfs.exists('/x') };
});
ok(/^\[Sub-agent report/.test(r.rep) && /Report: .*Plan: ship 0\.3/.test(r.rep) && /write is not available to a sub-agent \(it is read-only\)/.test(r.rep) && !r.x, 'delegate: a sub-agent reads with read-only tools, cannot write, and returns one report: ' + r.rep.split('\n').slice(1, 3).join(' | '));
ok(!/tools offered: [^)]*\bwrite\b/.test(r.rep) && /^Error: sub-agents cannot start sub-agents/.test(r.nest), 'write tools are not even offered; sub-agents cannot nest: ' + r.nest);

// ---------------------------------------------------------------- routers
r = await ev(async () => {
  const tr = await kb.use('router'); const all = kb.tools.names();
  const hi = tr.pick(all, 'hello there'), rem = tr.pick(all, 'remind me every day at 9 to water the plants'), named = tr.pick(all, 'use sqlite for this');
  const st = { state: { toolsHidden: hi.hidden } }; const more = await kb.tools.call('more_tools', { query: 'run a python script' }, { agent: st });
  return { hiSend: hi.send, hidden: hi.hidden.length, rem: rem.send.includes('schedule'), named: named.send.includes('sqlite'), more, loaded: st.state.toolsLoaded };
});
ok(['read', 'write', 'edit', 'bash', 'search', 'fetch', 'memory'].every(n => r.hiSend.includes(n)) && !r.hiSend.includes('sentry') && r.hidden > 3 && r.rem && r.named, 'tool router: core tools always, others when the message points at them: ' + JSON.stringify(r.hiSend));
ok(/Loaded/.test(r.more) && r.loaded.includes('python'), 'more_tools loads hidden tools by description: ' + r.more.split('\n')[0]);

// ---------------------------------------------------------------- kit.agent({ brain }): the plugins at work
r = await ev(async () => {
  kb.config.models = [{ model: 'small-chat', note: 'small talk and simple questions' }, { model: 'big-coder', note: 'code and hard technical work' }];
  const evs = []; const a = await kb.agent({ tools: kb.tools.names(), brain: ['memory', 'skills', 'history', 'guard', 'router', 'models'], onEvent: e => evs.push(e.type === 'route' ? 'route:' + e.model : e.type) });
  const out = await a.prompt('Write a Rust function that parses dates');
  return { out, evs, tools: a.plugins.flatMap(p => p.tools || []), id: a.id, saved: kb.history.list().some(c => c.id === a.id && /Rust/.test(c.title)) };
});
const chat = seen.filter(s => s.path === '/api/chat' && s.body.stream !== false).at(-1).body;
ok(r.out === 'hello' && r.evs.includes('route:big-coder') && chat.model === 'big-coder', 'model router: the decision model sent a coding request to the coder: ' + JSON.stringify(r.evs));
ok(/Long-term memory/.test(chat.messages[0].content) && /I am Ivy/.test(chat.messages[0].content) && /Skills \(/.test(chat.messages[0].content) && /metric units/.test(chat.messages[0].content), 'the system prompt carries memory, persona, standing instructions and skills');
const sent = chat.tools.map(x => x.function.name);
ok(sent.includes('memory') && sent.includes('skill') && sent.includes('find_skill') && sent.includes('more_tools') && !sent.includes('sentry') && !sent.includes('chat_history'), 'the brain\'s tools are sent; the router hides the rest behind more_tools: ' + sent.join(','));
ok(r.saved && r.evs.includes('context'), 'history saved the chat; the guard measured the request');
// SYSTEM.md replaces the base prompt; resume carries on with a saved chat
r = await ev(async id => { kb.vfs.write('/.kit/SYSTEM.md', 'You are a calm test bot.'); const a = await kb.agent({ brain: ['skills', 'history'], resume: id }); const n = a.messages.length; await a.prompt('again'); kb.vfs.rm('/.kit/SYSTEM.md'); return { n, id: a.id === id }; }, r.id);
const chat2 = seen.filter(s => s.path === '/api/chat' && s.body.stream !== false).at(-1).body;
ok(chat2.messages[0].content.startsWith('You are a calm test bot.') && r.n === 2 && r.id && chat2.messages.length === 4, 'SYSTEM.md replaces the base prompt; resume continues a saved chat: ' + JSON.stringify(r));
// guard: compaction when the chat outgrows a small window, and a retry after a context error
r = await ev(async () => {
  kb.guard.limit = 3000; const evs = [];
  const a = await kb.agent({ brain: ['guard'], onEvent: e => evs.push(e.type) });
  for (const q of ['Mars?', 'Venus?', 'Jupiter?']) { a.messages.push({ role: 'user', content: q + ' ' + 'lorem ipsum '.repeat(150) }, { role: 'assistant', content: 'answer ' + 'dolor '.repeat(100) }); }
  const out = await a.prompt('and Saturn?');
  kb.guard.limit = 131072;
  return { out, evs, first: a.messages[0].content.slice(0, 60), n: a.messages.length };
});
const chat3 = seen.filter(s => s.path === '/api/chat' && s.body.stream !== false).at(-1).body;
ok(r.evs.includes('compaction') && /^\[Summary of the earlier conversation/.test(r.first) && /favourite: Mars/.test(chat3.messages[1].content) && r.n === 6, 'guard: a chat that outgrows the window is compacted into a summary and the recent turns kept: ' + JSON.stringify(r));
failNext = 'prompt is too long: 9000 tokens, maximum context length is 4096';
r = await ev(async () => { const a = await kb.agent({ brain: ['guard'] }); const out = await a.prompt('hi'); return { out, lim: Object.values(kb.guard.limits) }; });
ok(r.out === 'hello' && r.lim.includes(4096), 'guard: after "prompt is too long" the limit is learned and the step retried: ' + JSON.stringify(r));
failNext = 'model not found';
r = await ev(async () => { const a = await kb.agent({ brain: ['guard'] }); try { await a.prompt('hi'); return 'no error'; } catch (e) { return e.message; } });
ok(/model not found/.test(r), 'other errors are not retried: ' + r);
// memory journal after a prompt, when asked for
r = await ev(async () => { const a = await kb.agent({ brain: [{ name: 'memory', journal: true }] }); await a.prompt('remember that I like tea'); return [...kb.vfs.walk('/.kit/memory/journal')].filter(p => p.endsWith('.md')).map(p => kb.vfs.read(p)).join('').split('## ').length; });
ok(r >= 3, 'memory with journal: true writes an entry after each prompt');
r = await ev(async () => { try { await kb.agent({ brain: ['nope'] }); return 'no error'; } catch (e) { return e.message; } });
ok(/unknown brain feature "nope"/.test(r), 'an unknown brain feature is reported: ' + r);
await t.done();
