// Sentry in the browser: rules, custom states and events, actions, systems that start only when a rule needs them.
import { start } from './_harness.mjs';
const t = await start({ use: null, busybox: false });
const { ok, ev, page, ctx } = t;
let r = await ev(async () => {
  window.fired = []; window.notes = [];
  const s = await kit.use('sentry'); s.notifyFn = (title, body) => notes.push(title + ': ' + body); s.on(f => fired.push(f.id));
  s.add({ id: 'cart', name: 'Big cart', when: { src: 'cart.items', op: 'ge', value: 3 }, alert: { notify: 'cart is big' } });
  s.add({ id: 'order', on: { event: 'order', where: { total: { gt: 100 } } }, run: { js: 'require("fs").writeFileSync("/order.txt", String(sentry.event.total)); console.log("ok")' } });
  s.add({ id: 'cmd', on: { event: 'ping' }, run: { command: 'echo pong > /pong.txt' } });
  s.set('cart.items', 1); s.set('cart.items', 4); s.emit('order', { total: 50 }); s.emit('order', { total: 150 }); s.emit('ping');
  await new Promise(r => setTimeout(r, 1500));
  return { fired, notes, order: kit.vfs.isFile('/order.txt') && kit.vfs.read('/order.txt'), pong: kit.vfs.isFile('/pong.txt') && kit.vfs.read('/pong.txt'), saved: JSON.parse(kit.vfs.read('/.kit/sentry.json')).triggers.length, systems: s.status().systems, log: s.status().log.map(l => l.id + (l.error ? ' ' + l.error : '')) };
});
ok(r.fired.join() === 'cart,order,cmd' && r.notes[0] === 'Big cart: cart is big', 'custom state and events fire rules, alerts notify: ' + JSON.stringify(r));
ok(r.order === '150' && r.pong === 'pong\n' && r.saved === 3, 'rules run JS and shell commands with the event, and are saved: ' + JSON.stringify({ order: r.order, pong: r.pong, log: r.log }));
ok(r.systems.length === 0, 'rules on custom data start no system: ' + JSON.stringify(r.systems));
// a system starts only when a rule reads it, and stops when none does
r = await ev(async () => {
  const s = kit.sentry; s.add({ id: 'k', on: { event: 'key', where: { key: 'q', ctrl: true } } }); const sys = s.status().systems;
  return sys;
});
ok(r.join() === 'keys', 'a key rule starts the keyboard system only: ' + r);
await page.keyboard.press('Control+q'); await page.keyboard.press('q');
ok(await ev(() => fired.filter(x => x === 'k').length) === 1, 'ctrl+q fires, q alone does not');
ok(await ev(() => { kit.sentry.remove('k'); return kit.sentry.status().systems.length; }) === 0, 'removing the rule stops the system');
// battery (stand-in Battery Status API)
r = await ev(async () => {
  const bat = new EventTarget(); bat.level = 0.5; bat.charging = true; navigator.getBattery = async () => bat; window.bat = bat;
  kit.sentry.add({ id: 'low', when: { src: 'battery.level', op: 'lt', value: 20, clear: 30 } }); kit.sentry.add({ id: 'unplug', on: { event: 'charger', where: { plugged: false } } });
  await new Promise(r => setTimeout(r, 50));
  bat.level = 0.15; bat.dispatchEvent(new Event('levelchange')); bat.charging = false; bat.dispatchEvent(new Event('chargingchange'));
  await new Promise(r => setTimeout(r, 50));
  return { fired: fired.slice(-2), level: kit.sentry.status().values['battery.level'], sys: kit.sentry.status().systems };
});
ok(r.fired.join() === 'low,unplug' && r.level === 15 && r.sys.includes('battery'), 'battery level and charger events: ' + JSON.stringify(r));
// location: sensitive, needs allow(); then a geofence fires
r = await ev(async () => {
  kit.sentry.add({ id: 'home', when: { src: 'geo', op: 'inside', lat: 40, lon: -74, radius_m: 100 } });
  const before = kit.sentry.status(); kit.sentry.allow('location'); await new Promise(r => setTimeout(r, 500));
  return { warn: before.warnings.join(' '), sysBefore: before.systems, sysAfter: kit.sentry.status().systems, lat: kit.sentry.status().values['geo.lat'] };
});
ok(/not allowed: sentry.allow\('location'\)/.test(r.warn) && !r.sysBefore.includes('location') && r.sysAfter.includes('location') && r.lat === 40.01, 'location waits for allow(), then starts: ' + JSON.stringify(r));
await ctx.setGeolocation({ latitude: 40.0003, longitude: -74, accuracy: 10 });
await page.waitForFunction(() => fired.includes('home'), null, { timeout: 10000 }).then(() => ok(true, 'arriving inside the geofence fires'), () => ok(false, 'arriving inside the geofence fires'));
// camera and microphone (Chromium's fake devices)
r = await ev(async () => {
  kit.sentry.allow('camera', 'audio');
  kit.sentry.add({ id: 'moved', when: { src: 'camera.change', op: 'ge', value: 0 }, snapshot: true, cooldown_s: 0 });
  kit.sentry.add({ id: 'loud', when: { src: 'audio.level', op: 'ge', value: 0 }, cooldown_s: 0 });
  await new Promise(r => setTimeout(r, 4000));
  const v = kit.sentry.status().values; return { sys: kit.sentry.status().systems, change: v['camera.change'], bright: v['camera.brightness'], audio: v['audio.level'], warn: kit.sentry.status().warnings };
});
ok(r.sys.includes('camera') && r.sys.includes('audio') && typeof r.change === 'number' && typeof r.bright === 'number' && typeof r.audio === 'number', 'camera change and sound level readings: ' + JSON.stringify(r));
// phone-only events, hot reload from the file, the tool
r = await ev(async () => {
  kit.sentry.add({ id: 'sms', on: { event: 'sms' } }); const w = kit.sentry.status().warnings.join(' ');
  const cfg = JSON.parse(kit.vfs.read('/.kit/sentry.json')); cfg.triggers = cfg.triggers.filter(x => x.id === 'cart'); kit.vfs.write('/.kit/sentry.json', JSON.stringify(cfg));
  await new Promise(r => setTimeout(r, 300));
  return { w, ids: kit.sentry.rules().triggers.map(x => x.id), sys: kit.sentry.status().systems };
});
ok(/only exists on a phone/.test(r.w) && r.ids.join() === 'cart' && r.sys.length === 0, 'phone-only events are explained; editing the file reloads the rules and stops unused systems: ' + JSON.stringify(r));
r = await ev(async () => [await kit.tool('sentry', { action: 'add', rule: { id: 'hot', when: { src: 'temp', op: 'gt', value: 30 } } }), await kit.tool('sentry', { action: 'set', key: 'temp', value: 20 }), await kit.tool('sentry', { action: 'set', key: 'temp', value: 35 }), await kit.tool('sentry', { action: 'systems' }), await kit.tool('sentry', { action: 'add', rule: { id: 'bad', when: { src: 'x', op: 'wobbly', value: 1 } } })]);
ok(/^Added rule hot/.test(r[0]) && r[1] === 'set; no rule fired' && r[2] === 'fired: hot' && /camera \(needs allow\)/.test(r[3]) && /^Error: .*unknown op wobbly/.test(r[4]), 'the sentry tool: ' + JSON.stringify(r).slice(0, 400));
ok(await ev(() => { kit.sentry.stop(); return kit.sentry.status().systems.length === 0 && !kit.sentry.started; }), 'stop() stops everything');
await t.done();
