// Cron parsing, the task list, the scheduler, and their tools.
import { start } from './_harness.mjs';
const t = await start({ persist: 'sched-test', busybox: false });
const { ok, ev } = t;
// cron
let r = await ev(() => { const C = kit.cron; const base = new Date(2026, 0, 1, 10, 0).getTime(); return {
  a: C.fromText('every weekday at 8:30'), b: C.fromText('every 15 minutes'), c: C.describe('0 9 * * 1'), d: new Date(C.next('0 9 * * *', base)).getDate(),
  e: C.upcoming('*/30 * * * *', 2, base).map(x => new Date(x).getMinutes()), f: C.fromText('in 20 minutes').once > Date.now(), g: (() => { try { C.parse('61 * * * *'); } catch (e) { return e.message; } })() }; });
ok(r.a.cron === '30 8 * * 1-5' && r.b.cron === '*/15 * * * *' && r.c === 'every Monday at 9:00 AM' && r.d === 2 && r.e.join() === '30,0' && r.f && /out of range/.test(r.g), 'cron: plain English, describe, next, upcoming, errors: ' + JSON.stringify(r));
// tasks
r = await ev(() => { const T = kit.tasks; T.clear({ all: true }); const [a, b] = T.add(['plan', 'build']); T.start(a.id); T.done(a.id); T.add({ title: 'ship', due: 'friday' }); T.update(b.id, { notes: 'with tests' }); return { text: T.text(), file: JSON.parse(kit.vfs.read('/.kit/tasks.json')).items.length, pending: T.list({ status: 'pending' }).length }; });
ok(r.text === '[x] #1 plan\n[ ] #2 build — with tests\n[ ] #3 ship (due friday)' && r.file === 3 && r.pending === 2, 'tasks: add, start, done, update, text, saved: ' + JSON.stringify(r));
r = await ev(async () => [await kit.tools.call('tasks', { action: 'add', titles: ['test', 'docs'] }), await kit.tools.call('tasks', { action: 'update', id: 4, status: 'in_progress' }), await kit.tools.call('tasks', { action: 'clear' }), await kit.tools.call('tasks', { action: 'update', id: 99, status: 'done' })]);
ok(/^Added #4, #5/.test(r[0]) && /#4 is in_progress\n\n.*\[~\] #4 test/s.test(r[1]) && /^Removed 1 done task\n\n\[ \] #2/.test(r[2]) && r[3] === 'Error: no task #99', 'the tasks tool: ' + JSON.stringify(r));
// scheduler: jobs run when due (tick is driven by hand here)
r = await ev(async () => {
  const S = kit.schedule; S.stop(); for (const j of S.list()) S.remove(j.id);
  const runs = []; S.on(e => runs.push(e.type + ':' + e.job.name));
  const sh = S.add({ name: 'stamp', when: 'every 5 minutes', command: 'echo tick >> /log.txt' });
  const once = S.add({ name: 'later', when: 'in 10 minutes', js: `require('fs').writeFileSync('/once.txt', 'ran'); return 7` });
  const py = S.add({ name: 'py', when: '0 * * * *', python: 'print(6*7)' });
  const fn = S.add({ name: 'fn', when: '@daily', run: () => 'fn ran' });
  const bad = S.add({ name: 'bad', when: 'every minute', command: 'nosuchcmd' });
  const now = Date.now(); const n1 = await S.tick(now);                                 // nothing due yet
  const n2 = await S.tick(now + 11 * 60e3);                                              // stamp, later, bad due (py if the hour turned)
  const n3 = await S.tick(now + 2 * 864e5);                                              // everything recurring; later is done
  const later = S.find('later'); const stamp = S.find('stamp');
  return { n1, n2, n3, log: kit.vfs.read('/log.txt'), once: kit.vfs.read('/once.txt'), laterEnabled: later.enabled, laterResult: later.last.result, stampNext: stamp.next > now + 2 * 864e5, py: S.find('py').last?.output, fn: S.find('fn').last?.output, bad: S.find('bad').last?.code, runs, saved: JSON.parse(kit.vfs.read('/.kit/schedule.json')).jobs.map(j => j.name).sort().join() };
});
ok(r.n1 === 0 && r.n2 >= 3 && r.log === 'tick\ntick\n' && r.once === 'ran' && r.laterEnabled === false && r.laterResult === 7 && r.stampNext, 'shell and one-time JS jobs run when due and reschedule: ' + JSON.stringify(r));
ok(r.py === '42\n' && r.fn === 'fn ran' && r.bad === 127 && r.runs.includes('error:bad') && r.runs.includes('run:stamp'), 'python and function jobs, failures reported: ' + JSON.stringify({ py: r.py, fn: r.fn, bad: r.bad, runs: r.runs }));
ok(r.saved === 'bad,later,py,stamp', 'jobs are saved (not function jobs): ' + r.saved);
// the schedule tool
r = await ev(async () => [await kit.tools.call('schedule', { action: 'add', name: 'hi', when: 'weekdays at 9am', command: 'echo hi' }), await kit.tools.call('schedule', { action: 'run', id: 'hi' }), await kit.tools.call('schedule', { action: 'disable', id: 'hi' }), await kit.tools.call('schedule', { action: 'list' }), await kit.tools.call('schedule', { action: 'add', when: 'whenever', command: 'x' })]);
ok(/^Scheduled j\w+ hi · weekdays at 9:00 AM \(0 9 \* \* 1-5\)/.test(r[0]) && r[1] === 'hi' && /disabled/.test(r[2]) && /hi · weekdays/.test(r[3]) && /^Error: could not understand the time "whenever"/.test(r[4]), 'the schedule tool: ' + JSON.stringify(r));
// started by createKit, and catches up a run missed while the page was closed
r = await ev(async () => {
  const S = kit.schedule; const j = S.find('stamp'); j.next = Date.now() - 60e3; S._save(); await kit.vfs.flush();
  const k2 = await K.createKit({ persist: 'sched-test', busybox: false, use: ['schedule'] });
  await new Promise(r => setTimeout(r, 1500)); const l = k2.vfs.read('/log.txt'); const started = k2.schedule.started; k2.schedule.stop(); return { l, started };
});
ok(r.started && r.l === 'tick\ntick\ntick\n', 'a new page starts the scheduler and runs the missed job once: ' + JSON.stringify(r));
await t.done();
