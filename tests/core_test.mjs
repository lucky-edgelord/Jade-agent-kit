// VFS, shell (BusyBox and the JS commands), persistence.
import { start } from './_harness.mjs';
const t = await start({ persist: 'core-test', files: { '/hello.txt': 'hello world\n', '/src/a.js': 'console.log(1)\n' } });
const { ok, ev, page } = t;
ok(await ev(() => kit.vfs.read('/hello.txt')) === 'hello world\n', 'files given to createKit are there');
ok(await ev(() => kit.version) === (await import('fs')).default.readFileSync('package.json', 'utf8').match(/"version": "([^"]+)"/)[1], 'version matches package.json');
// BusyBox
ok(await ev(() => kit.busybox.load()) === true, 'BusyBox loads: ' + await ev(() => kit.busybox.error));
ok(await ev(() => kit.busybox.applets.size) >= 40, 'BusyBox has its applets: ' + await ev(() => kit.busybox.applets.size));
let r = await ev(() => kit.run('ls / | sort'));
ok(r.stdout === 'hello.txt\nsrc\n' && r.code === 0, 'ls | sort: ' + JSON.stringify(r));
r = await ev(() => kit.run('echo "one\ntwo\nthree" > /n.txt && grep -c o /n.txt && awk \'{print toupper($0)}\' /n.txt | head -2'));
ok(r.stdout === '2\nONE\nTWO\n', 'redirects, &&, grep, awk, pipes: ' + JSON.stringify(r.stdout));
r = await ev(() => kit.run("sed -i 's/world/kit/' /hello.txt; cat /hello.txt"));
ok(r.stdout === 'hello kit\n' && await ev(() => kit.vfs.read('/hello.txt')) === 'hello kit\n', 'sed -i changes the VFS file');
r = await ev(() => kit.run('mkdir -p /d/e && cd /d && touch x && pwd && ls; cd /; rm -r /d; ls /d'));
ok(/^\/d\n(e\nx|x\ne)\n/.test(r.stdout) && r.code !== 0 && /No such file|can't access|cannot access/.test(r.stderr), 'mkdir -p, cd, pwd, rm -r: ' + JSON.stringify(r));
r = await ev(() => kit.run('X=5; echo "$X $(echo sub)" ; false || echo fell; true && echo then'));
ok(r.stdout === '5 sub\nfell\nthen\n', 'variables, $(…), || and &&: ' + JSON.stringify(r.stdout));
r = await ev(() => kit.run('nosuchcmd'));
ok(r.code === 127 && /not found/.test(r.stderr), 'unknown command: 127');
r = await ev(() => kit.run('ls /src/*.js'));
ok(r.stdout.trim() === '/src/a.js', 'globs: ' + r.stdout);
// a file changed while BusyBox runs survives (only what the command changed is written back)
r = await ev(async () => { const p = kit.run('sleep 0.3; echo done > /bb.txt'); await new Promise(r => setTimeout(r, 100)); kit.vfs.write('/meanwhile.txt', 'kept'); await p; return [kit.vfs.read('/bb.txt'), kit.vfs.isFile('/meanwhile.txt')]; });
ok(r[0] === 'done\n' && r[1] === true, 'edits made while a command runs are kept: ' + JSON.stringify(r));
// JS engine
r = await ev(async () => { kit.shell.engine = 'js'; const x = await kit.run('echo hi | tr a-z A-Z; wc -l /n.txt'); kit.shell.engine = 'auto'; return x; });
ok(r.stdout === 'HI\n      3 /n.txt\n', 'JS commands: ' + JSON.stringify(r.stdout));
// sessions keep their own cwd
r = await ev(async () => { const a = kit.shell.session({ cwd: '/src' }); await a.run('cd /'); const b = kit.shell.session({ cwd: '/src' }); return [a.cwd, (await b.run('pwd')).stdout]; });
ok(r[0] === '/' && r[1] === '/src\n', 'sessions have their own working directory');
// your own commands, in every engine mode
r = await ev(async () => { kit.shell.commands.hello = c => { c.o(`hello ${c.argv[0] ?? ''} ${c.stdin.trim()}\n`); return 0; }; const a = await kit.run('echo in | hello you'); kit.shell.engine = 'wasm'; const b = await kit.run('hello'); kit.shell.engine = 'auto'; return [a.stdout, b.stdout]; });
ok(r[0] === 'hello you in\n' && r[1] === 'hello  \n', 'custom commands: ' + JSON.stringify(r));
// with busybox: false, BusyBox starts with the first command
r = await ev(async () => { const k = await K.createKit({ busybox: false }); const before = k.busybox.ready; const x = await k.run('echo hi'); return { before, after: k.busybox.ready, out: x.stdout }; });
ok(r.before === false && r.after === true && r.out === 'hi\n', 'BusyBox loads on the first command: ' + JSON.stringify(r));
// persistence
await ev(() => kit.vfs.flush());
await page.reload();
r = await ev(async () => { const mod = await import('/dist/jade-agent-kit.js'); const k = await mod.createKit({ persist: 'core-test', busybox: false }); return k.vfs.read('/hello.txt'); });
ok(r === 'hello kit\n', 'files persist in IndexedDB across reloads');
await t.done();
