// Automation: secrets, flows, playbooks, Gantt plans, the autonomy queue, heartbeat, curiosity and Jade Lisp in the browser.
// Ollama Cloud is stood in for.
import { start } from './_harness.mjs';
const t = await start({ use: null });
const { ok, ev, page } = t;
const cors = { 'access-control-allow-origin': '*' };
const nd = msg => ({ body: JSON.stringify({ message: msg, done: false }) + '\n' + JSON.stringify({ done: true, message: { role: 'assistant', content: '' } }) + '\n', headers: { ...cors, 'content-type': 'application/x-ndjson' } });
const say = content => ({ role: 'assistant', content }), call = (name, args) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
await page.route('https://ollama.com/**', async route => {
  const req = route.request(); const body = req.postData() ? JSON.parse(req.postData()) : {};
  if (new URL(req.url()).pathname !== '/api/chat') return route.fulfill({ status: 404, json: { error: 'nope' }, headers: cors });
  const sys = body.messages[0]?.role === 'system' ? body.messages[0].content : '';
  const users = body.messages.filter(m => m.role === 'user'), first = users[0]?.content || '', last = users.at(-1)?.content || '';
  const tools = body.messages.filter(m => m.role === 'tool');
  if (body.stream === false) return route.fulfill({ json: { message: say('summary: ' + last.slice(0, 40)), done: true }, headers: cors });
  let msg = say('hello');
  if (/autonomous mode/.test(sys)) {
    if (/^Stop here/.test(last)) msg = say('Wanted to run a command.\nSTATUS: blocked: approval');
    else if (/needs-bash/.test(first) && !tools.length) msg = call('bash', { command: 'echo hi' });
    else if (/two-slices/.test(first) && !/notes from the last slice/.test(first)) msg = say('Did part one.\nSTATUS: continue — part two');
    else msg = say('All finished.\nSTATUS: done');
  } else if (/^\[Heartbeat/.test(first)) msg = say(/ALERT/.test(first) ? 'The inbox has 9 items: sort it today.' : 'HEARTBEAT_OK');
  else if (/^\[Curiosity/.test(first)) {
    msg = [call('curiosity', { action: 'choose', activity: 'explore', intent: 'learn about tides' }), call('write', { path: '/.kit/curiosity/Explorations/Tides.md', content: '# Tides\nSee [[Moon]] and [[Sea]].' }), call('curiosity', { action: 'report', summary: 'wrote a note on tides', self_score: 0.9, next: 'later' })][tools.length] || say('done');
  }
  return route.fulfill(nd(msg));
});

// ---------------------------------------------------------------- secrets
let r = await ev(async () => { const s = await kit.use('secrets'); await s.set('API_TOKEN', 'tok-123456789'); let bad; try { await s.set('bad name', 'x'); } catch (e) { bad = e.message; } return { names: s.names(), red: s.redact('Bearer tok-123456789 ok'), tool: await kit.tool('secrets', {}), bad, inVfs: [...kit.vfs.walk('/')].some(p => kit.vfs.isFile(p) && kit.vfs.read(p).includes('tok-123456789')) }; });
ok(r.names.join() === 'API_TOKEN' && r.red === 'Bearer {{API_TOKEN}} ok' && /API_TOKEN/.test(r.tool) && !/tok-/.test(r.tool) && /letters, digits/.test(r.bad) && !r.inVfs, 'secrets: names only for the agent, values redacted and never in the file system: ' + JSON.stringify(r));

// ---------------------------------------------------------------- flows
r = await ev(async () => {
  const F = await kit.use('flows'); kit.vfs.write('/inbox.md', '- buy milk\n- urgent: call mum\n- read book\n');
  F.save({ name: 'Inbox triage', vars: { tag: 'urgent' }, steps: [
    { type: 'file', name: 'Inbox', action: 'read', path: '/inbox.md' },
    { type: 'each', name: 'Each', items: '$json.split("\\n").filter(l => l.startsWith("- ")).map(l => l.slice(2))', steps: [
      { type: 'if', condition: '$item.includes($vars.tag)', then: [{ type: 'file', action: 'append', path: '/urgent.md', content: '- [ ] {{ $item }} ({{ $index }})' }, { type: 'set', fields: { urgent: true, item: '{{ $item }}' } }], else: [{ type: 'set', fields: { urgent: false } }] }] },
    { type: 'js', name: 'Count', code: 'return $json.filter(x => x.urgent).length + fs.readFileSync("/urgent.md", "utf8").split("\\n").filter(Boolean).length' },
    { type: 'switch', value: '$json', cases: [{ match: 2, steps: [{ type: 'set', fields: { verdict: 'one urgent', n: '{{ $node.Count }}', day: '{{ $date("YYYY", "2026-03-05") }}' } }] }], default: [{ type: 'stop', value: 'unexpected' }] }] });
  const run = await F.run('Inbox triage');
  const shell = await F.run({ name: 'sh', steps: [{ type: 'shell', command: "echo 6 7 | awk '{print $1 * $2}'" }, { type: 'set', fields: { out: '{{ $json.stdout.trim() }}' } }] });
  const fail = await F.run({ name: 'f', steps: [{ type: 'shell', command: 'exit 3', onError: 'continue' }, { type: 'set', fields: { after: '{{ $json.error }}' } }] });
  const unknown = await F.run({ name: 'u', steps: [{ type: 'tool', tool: 'nope_tool' }] });
  const stop = await F.run({ name: 's', steps: [{ type: 'set', fields: { a: 1 } }, { type: 'stop' }, { type: 'set', fields: { a: 2 } }] });
  const bad = F.validate({ name: 'x', steps: [{ type: 'zap' }, { type: 'if' }], trigger: { type: 'schedule', when: 'tomorrow at 9am' } });
  const loopy = await F.run({ name: 'l', steps: [{ type: 'set', fields: { x: '{{ (() => { while (true) {} })() }}' } }] });
  const llm = await F.run({ name: 'a', steps: [{ type: 'llm', prompt: 'Summarise {{ $input }}' }] }, 'the news');
  return { shellErr: shell.error, out: run.output, status: run.status, urgent: kit.vfs.read('/urgent.md'), steps: run.steps.map(s => s.type + ':' + s.status).join(','), shell: shell.output, fail: [fail.status, fail.output.after, fail.steps[0].note, unknown.status, unknown.error], stop: [stop.status, stop.output], bad, loopy: loopy.error, llm: llm.output };
});
ok(r.status === 'ok' && JSON.stringify(r.out) === '{"verdict":"one urgent","n":2,"day":"2026"}' && r.urgent === '- [ ] urgent: call mum (1)\n', 'a flow reads a file, loops, branches, appends, runs JavaScript and switches, with expressions over $item, $vars, $node and $date: ' + JSON.stringify(r.out));
ok(JSON.stringify(r.shell) === '{"out":"42"}' && r.fail[0] === 'ok' && /exit 3/.test(r.fail[1]) && r.fail[2] === 'continued' && r.fail[3] === 'error' && /no tool named "nope_tool"/.test(r.fail[4]) && r.stop.join() === 'ok,[object Object]', 'shell steps, onError continue, an unknown tool is refused before running, stop ends it: ' + JSON.stringify([r.shell, r.shellErr, r.fail, r.stop]));
ok(r.bad.some(e => /unknown type "zap"/.test(e)) && r.bad.some(e => /"condition" is required/.test(e)) && r.bad.some(e => /must repeat/.test(e)) && /longer than 5 s/.test(r.loopy) && r.llm === 'summary: Summarise the news', 'validation names every problem; a runaway expression is stopped; llm steps ask the model: ' + JSON.stringify([r.bad.length, r.loopy, r.llm]));
r = await ev(async () => {
  const F = kit.flows; F.save({ name: 'Every minute', trigger: { type: 'schedule', when: '* * * * *' }, steps: [{ type: 'file', action: 'append', path: '/ticks.txt', content: 'tick {{ $input.trigger }}' }] });
  F.save({ name: 'Watch notes', trigger: { type: 'file', path: '/notes' }, steps: [{ type: 'set', fields: { changed: '{{ $input.changed }}' } }] });
  F.watchDelay = 50; F._arm(); kit.vfs.write('/notes/a.md', 'x'); await new Promise(r => setTimeout(r, 400));
  await F.tick(Date.now() + 61000);
  const watch = F.runs({ name: 'Watch notes' })[0];
  const tool = await kit.tool('flow', { action: 'list' }); const help = await kit.tool('flow', { action: 'help' });
  return { ticks: kit.vfs.read('/ticks.txt'), watch: watch && watch.output, via: watch && watch.via, tool, help: help.length };
});
ok(r.ticks === 'tick schedule\n' && JSON.stringify(r.watch) === '{"changed":["/notes/a.md"]}' && r.via === 'file' && /Every minute: schedule: every minute/.test(r.tool) && r.help < 6000, 'schedule and file triggers fire flows; the flow tool lists them: ' + JSON.stringify(r));

// ---------------------------------------------------------------- playbooks
r = await ev(async () => {
  const P = await kit.use('playbooks');
  const pb = { description: 'tidy', vars: { n: 3, who: 'x' }, tasks: [
    { name: 'make', do: 'write', path: '/pb/a.txt', content: 'hello {{ who }}' },
    { name: 'list', do: 'bash', command: 'ls /pb', register: 'ls' },
    { name: 'check', do: 'assert', that: ["'a.txt' in ls", 'n > 2'] },
    { name: 'loop', do: 'set', vars: { last: '{{ item * 2 }}' }, loop: 'range(n)' },
    { name: 'secret', do: 'debug', msg: 'token {{ secrets.API_TOKEN }}' },
    { name: 'skip', do: 'fail', when: 'n > 5' },
    { block: [{ do: 'fail', msg: 'boom' }], rescue: [{ do: 'set', vars: { caught: '{{ error }}' } }], always: [{ do: 'set', vars: { cleaned: true } }] },
    { name: 'tries', do: 'set', vars: { k: 1 }, until: 'k == 1' },
    { name: 'save', do: 'save', path: '/out/result.txt', value: '{{ last }}' } ] };
  const saved = await P.save('tidy', pb);
  const unattended = await P.runUnattended('tidy').then(() => 'ran', e => e.message);
  const viaTool = await kit.tool('playbook', { action: 'run', name: 'tidy' });
  await P.approve('tidy');
  const r1 = await P.runUnattended('tidy', { n: 4 });
  const badVars = await P.runUnattended('tidy', { zzz: 1 }).then(() => 'ran', e => e.message);
  kit.vfs.write('/.kit/playbooks/tidy.json', JSON.stringify({ ...pb, tasks: [...pb.tasks, { do: 'bash', command: 'echo sneaky' }] }));
  const changed = await P.runUnattended('tidy').then(() => 'ran', e => e.message);
  const agentSave = await kit.tool('playbook', { action: 'save', name: 'mine', playbook: { tasks: [{ do: 'debug', msg: 'hi' }] } });
  const val = await kit.tool('playbook', { action: 'validate', playbook: { tasks: [{ do: 'nonsense_tool' }, { do: 'think' }, { do: 'browser.goto', url: 'https://x.y' }] } });
  const failRun = await P.run({ name: 'f', tasks: [{ name: 'step one', do: 'debug', msg: 'a' }, { name: 'bad', do: 'bash', command: 'exit 4' }, { do: 'debug', msg: 'never' }] });
  return { saved, unattended, viaTool, r1: { ok: r1.ok, recap: r1.recap, vars: r1.vars, log: r1.log.map(l => l.status).join(',') }, secretLog: r1.log.find(l => l.name === 'secret').note, out: kit.vfs.isFile('/out/result.txt') ? kit.vfs.read('/out/result.txt') : r1.failed, badVars, changed, agentSave, val, failRun: failRun.failed };
});
ok(r.saved.approved === false && /not approved/.test(r.unattended) && /^Error: the playbook is not approved/.test(r.viaTool), 'a saved playbook does not run until the app approves it, not even when an agent asks: ' + r.viaTool);
ok(r.r1.ok && r.r1.vars.caught === 'boom' && r.r1.vars.cleaned === true && r.r1.vars.last === 6 && r.r1.recap.rescued === 1 && /skipped/.test(r.r1.log) && r.out === '6', 'approved, it runs: register, assert, loop, when, block/rescue/always, until, save: ' + JSON.stringify(r.r1));
ok(r.secretLog === '"token {{API_TOKEN}}"' && /only takes the vars it declares/.test(r.badVars) && /not approved/.test(r.changed), 'secrets are redacted from the log; undeclared vars are refused; an edited playbook needs approval again: ' + r.secretLog);
ok(/NOT approved yet/.test(r.agentSave) && /nonsense_tool/.test(r.val) && /think puts a model in the loop/.test(r.val) && /not available in the kit/.test(r.val) && r.failRun.task === 2 && r.failRun.name === 'bad' && /exit code 4/.test(r.failRun.error), 'an agent can save but not approve; validation catches unknown tools, model tools and browser steps; a failure names its task: ' + JSON.stringify(r.failRun));
r = await ev(async () => { const P = await kit.use('playbooks'); P.approver = async info => info.summary.tasks === 1; return [await kit.tool('playbook', { action: 'save', name: 'ok1', playbook: { tasks: [{ do: 'debug', msg: 'hi' }] } }), await kit.tool('playbook', { action: 'list' })]; });
ok(/approved\)/.test(r[0]) && /ok1: .*1 tasks\)/.test(r[1]), 'with an approve callback, the app decides when an agent saves: ' + r[0]);

// ---------------------------------------------------------------- Gantt
r = await ev(async () => {
  const T = a => kit.tool('gantt', a); const today = new Date(); const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await T({ action: 'create', name: 'Launch', description: 'ship it' });
  await T({ action: 'add', project: 'launch', name: 'Design', start: iso(today), days: 2 });
  await T({ action: 'add', project: 'launch', name: 'Build', deps: ['t1'], days: 3, owner: 'user' });
  await T({ action: 'add', project: 'launch', name: 'Release', deps: ['t2'], milestone: true });
  const cyc = await T({ action: 'link', project: 'launch', task: 't1', dep: 't3' });
  const mine = await T({ action: 'update', project: 'launch', task: 't2', progress: 50 });
  const p = kit.gantt.load('launch');
  return { cyc, mine, starts: p.tasks.map(x => x.start), crit: kit.gantt.critical(p).ids, ready: kit.gantt.ready().map(x => x.task.id), show: await T({ action: 'show', project: 'launch' }) };
});
ok(/makes a cycle/.test(r.cyc) && /user's task/.test(r.mine) && r.crit.includes('t3') && r.ready.join() === 't1' && /t3 Release .*◆/.test(r.show) && r.starts[1] > r.starts[0], 'gantt: dependencies push tasks later, cycles are refused, the user\'s tasks are theirs, critical path and ready tasks: ' + JSON.stringify([r.starts, r.crit, r.ready, r.cyc, r.mine]));

// ---------------------------------------------------------------- autonomy
r = await ev(async () => {
  const A = await kit.use('autonomy'); A.cfg.pauseOnUse = false; A.cfg.quietFrom = A.cfg.quietTo = 0;
  const a = A.add({ goal: 'tidy the notes', tier: 3 }), b = A.add({ prompt: 'one answer', kind: 'prompt', priority: 10 }), c = A.add({ prompt: 'urgent!', kind: 'prompt', tier: 1 }), d = A.add({ command: 'echo shelled', priority: 90 });
  const order = []; for (let i = 0; i < 4; i++) { const x = A.pick(); order.push(x.id); x.state = 'done'; }
  for (const x of [a, b, c, d]) x.state = 'ready'; A.picks = 0;
  const blocked0 = A.blocked(); A.on = true; const blocked1 = A.blocked();
  const t1 = await A.runTask(d.id), t2 = await A.runTask(c.id);
  const g = A.add({ goal: 'two-slices job' }); const s1 = await A.runTask(g.id); const s1state = s1.state, lvl = s1.level; const s2 = await A.runTask(g.id);
  const need = A.add({ goal: 'needs-bash job', tier: 2 }); const n1 = await A.runTask(need.id); const waiting = [n1.state, n1.need?.tool];
  A.allow(need.id); const allowed = [A.get(need.id).state, A.get(need.id).allow.join()];
  A.cfg.stepsPerHour = 1; const budget = A.blocked(); A.on = false;
  return { order: order.join(), ids: [a.id, b.id, c.id, d.id].join(), blocked0, blocked1, t1: [t1.state, t1.result], t2: [t2.state, t2.result], s1: [s1state, lvl], s2: [s2.state, s2.result], waiting, allowed, budget, log: kit.vfs.read('/.kit/autonomy/log.md').split('\n').length, tool: await kit.tool('autonomy', { action: 'status' }) };
});
ok(r.order === 'q3,q4,q2,q1' && r.blocked0 === 'off' && r.blocked1 === '', 'the queue runs interrupts first, then priorities, then long goals; autonomous mode is off until the app turns it on: ' + r.order);
ok(r.t1.join() === 'done,shelled\n' && r.t2.join() === 'done,All finished.' && r.s1.join() === 'ready,0' && r.s2.join() === 'done,All finished.', 'shell and prompt tasks run; a goal continues across slices until STATUS: done: ' + JSON.stringify([r.t1, r.s1, r.s2]));
ok(r.waiting.join() === 'waiting,bash' && r.allowed.join() === 'ready,bash' && /hourly budget used/.test(r.budget) && r.log > 8 && /Queue: /.test(r.tool), 'a denied tool waits for approval and allow() requeues it; budgets stop the loop; everything is logged: ' + JSON.stringify([r.waiting, r.budget]));
r = await ev(async () => { const A = kit.autonomy; A.cfg.stepsPerHour = 1000; A._tasks = []; A.save(); A.on = true; const n = A.fromGantt(); const t = A.tasks[0]; const run = await A.runTask(t); A.on = false; return { n, title: t.title, state: run.state, progress: kit.gantt.load('launch').tasks[0].progress }; });
ok(r.n === 1 && /Launch: Design/.test(r.title) && r.state === 'done' && r.progress === 100, 'the agent\'s ready plan tasks become queue goals, and finishing one completes the plan task: ' + JSON.stringify(r));

// ---------------------------------------------------------------- heartbeat
r = await ev(async () => {
  const alerts = []; const H = await kit.use('heartbeat'); H.onAlert = x => alerts.push(x);
  H.seed(); const skip = await H.run();
  kit.vfs.write('/.kit/HEARTBEAT.md', '# HEARTBEAT\n## Check\n- [ ] is the build green?\n'); const okRun = await H.run();
  kit.vfs.write('/.kit/HEARTBEAT.md', '# HEARTBEAT\n- ALERT if inbox > 5\n'); const alert = await H.run();
  H.from = '01:00'; H.to = '01:00'; const inactive = H.active();
  return { skip: skip.status, ok: okRun.status, alert, alerts, inactive };
});
ok(r.skip === 'skipped' && r.ok === 'ok' && r.alert.status === 'alert' && /9 items/.test(r.alerts[0]) && r.inactive === false, 'heartbeat: an empty checklist skips without the model, HEARTBEAT_OK is silent, anything else alerts: ' + JSON.stringify(r));

// ---------------------------------------------------------------- curiosity
r = await ev(async () => {
  const C = await kit.use('curiosity'); const entry = await C.wake();
  const st = C.state(); const status = await kit.tool('curiosity', { action: 'status' }); const outside = await kit.tool('curiosity', { action: 'choose', activity: 'explore' });
  return { entry, total: st.total, next: C.next > Date.now(), status: status.split('\n')[0], outside };
});
ok(r.entry.id === 'explore' && r.entry.measured.created === 1 && r.entry.measured.links === 2 && r.entry.reward > 0.3 && r.entry.self === 0.9 && r.total === 1 && r.next, 'curiosity: the agent chooses, works and reports; the reward is measured from the files it made: ' + JSON.stringify(r.entry.measured) + ' reward ' + r.entry.reward);
ok(/only available during a curiosity wake-up/.test(r.outside) && /Next wake-up/.test(r.status), 'choose and report work only during a wake-up');

// ---------------------------------------------------------------- Jade Lisp in the browser
r = await ev(async () => {
  const L = await kit.use('lisp');
  const a = await L.run({ code: '(define (sq x) (* x x)) (map sq (list 1 2 3))' });
  const b = await L.run({ code: '(tool/write :path "/lisp/out.txt" :content "from lisp") (read-file "/lisp/out.txt")' });
  const c = await L.run({ code: '(jade/kv-set "k" 42) (jade/kv-get "k")' });
  const d = await L.run({ file: '/.kit/lisp/examples/hello.jl', args: ['Kit'] });
  const e = await L.run({ code: '(tool/read :path "/x")', pure: true });
  const f = await kit.tool('lisp', { code: '(+ 1 (* 2 3))' });
  return { a: a.output, b: b.output, c: c.output, d: d.output, e: [e.code, e.output.slice(0, 120)], f, skill: kit.vfs.isFile('/.kit/skills/lisp-dsl/SKILL.md') };
});
ok(r.a === '(1 4 9)' && r.b === '"from lisp"' && r.c === '42' && /Kit/.test(r.d) && r.e[0] === 1 && r.f === '7' && r.skill, 'Jade Lisp runs in the sandbox, calls the kit\'s tools and kv, runs example files, and pure mode blocks tools: ' + JSON.stringify(r));
await t.done();
