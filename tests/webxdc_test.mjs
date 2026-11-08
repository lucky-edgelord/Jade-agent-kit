// webxdc: load an .xdc, run it in a frame, exchange updates both ways.
import fs from 'node:fs';
import { start } from './_harness.mjs';
const t = await start({ busybox: false, persist: 'xdc-test' });
const { ok, ev, page } = t;
// a tiny app written into the VFS as a folder
await ev(() => kit.vfs.import({
  '/apps/counter/manifest.toml': 'name = "Counter"\n',
  '/apps/counter/index.html': '<!doctype html><html><head><script src="webxdc.js"></script><script src="app.js"></script></head><body><b id="n">0</b><button id="b">+</button></body></html>',
  '/apps/counter/app.js': `let n = 0; window.addEventListener('DOMContentLoaded', () => { document.getElementById('b').onclick = () => webxdc.sendUpdate({ payload: { add: 1 } }, 'plus'); webxdc.setUpdateListener(u => { n += u.payload.add; document.getElementById('n').textContent = n; localStorage.setItem('seen', String(u.serial)); }); });`,
}));
let r = await ev(async () => { const a = await kit.webxdc.load('/apps/counter'); return { name: a.name, id: a.id, files: Object.keys(a.files).sort() }; });
ok(r.name === 'Counter' && r.files.join() === 'app.js,index.html,manifest.toml', 'loads an app from a VFS folder: ' + JSON.stringify(r));
await ev(() => { window.S = kit.webxdc.open('Counter', { container: document.getElementById('app'), self: { addr: 'me@test', name: 'Me' } }); });
const fr = page.frameLocator('#app iframe');
await fr.locator('#b').click(); await fr.locator('#b').click();
await page.waitForFunction(() => kit.webxdc.get('Counter').updates.length === 2, null, { timeout: 10000 });
ok(await fr.locator('#n').textContent() === '2', 'the user\'s clicks are updates the app receives');
r = await ev(() => kit.webxdc.updates('Counter'));
ok(r.length === 2 && r[0].sender === 'me@test' && r[0].payload.add === 1, 'the host sees every update: ' + JSON.stringify(r[0]));
await ev(() => S.send({ payload: { add: 10 }, summary: 'agent added 10' }));
await page.waitForFunction(() => document.querySelector('#app iframe') && true);
await fr.locator('#n', { hasText: '12' }).waitFor({ timeout: 5000 });
ok(true, 'the agent sends an update into the app');
ok(await ev(() => kit.webxdc.get('Counter').summary) === 'agent added 10', 'summary is kept');
// a real .xdc file
await ev(b => kit.vfs.write('/test-list.xdc', new Uint8Array(b)), [...fs.readFileSync('tests/fixtures/test-list.xdc')]);
r = await ev(async () => { const a = await kit.webxdc.load('/test-list.xdc'); const z = kit.webxdc.pack(a); return { name: a.name, ok: !!a.files['index.html'], zip: z[0] === 0x50 && z[1] === 0x4b }; });
ok(r.ok && r.zip, 'loads a .xdc zip and packs it back: ' + JSON.stringify(r));
// updates persist
await ev(() => new Promise(r => setTimeout(r, 300)));
r = await ev(async () => { const k2 = await K.createKit({ persist: 'xdc-test', busybox: false }); const a = await k2.webxdc.load('/apps/counter'); return a.updates.length; });
ok(r === 3, 'updates persist with the kit: ' + r);
await t.done();
