// The Sentry rules engine on a fake clock: the same cases as Jade's SentryTest.java (edges, debounce, hysteresis,
// cooldown, hourly limits, hours, events, geofence, idle, hot reload, bad rules). Runs in Node, no browser.
import { SentryEngine, meters } from '../src/sentry_engine.js';
let pass = 0, fail = 0; const out = [];
const ok = (c, m) => { if (c) pass++; else fail++; out.push((c ? 'PASS ' : 'FAIL ') + m); };
let T0, now;
const eng = () => { T0 = new Date(2026, 9, 21, 12, 0, 0, 0).getTime(); now = T0; const e = new SentryEngine(); e.tzOffsetMin = -new Date(T0).getTimezoneOffset(); const c = { configure: x => e.configure(x), set: (k, v) => e.set(k, v, now), update: r => e.update(r, now), tick: () => e.tick(now), touch: () => e.touch(now), event: (n, d) => e.event(n, d, now), nextWakeMs: () => e.nextWakeMs(now), status: () => JSON.stringify(e.status(now)), sources: () => e.sources() }; return c; };
const at = s => { now = T0 + Math.round(s * 1000); };
const cfg = (...t) => JSON.stringify({ triggers: t });
const ids = f => f.map(x => x.id + ',').join('');
const n = f => f.length;
let e, f;
// baseline
e = eng();
ok(e.configure(cfg({ id: 'low', when: { src: 'battery.level', op: 'lt', value: 20 } })).length === 0, 'valid rules load');
ok(n(e.set('battery.level', 10)) === 0, 'already low at start: baseline, no fire');
ok(n(e.set('battery.level', 9)) === 0, 'still low: still nothing');
e.set('battery.level', 25); ok(n(e.set('battery.level', 15)) === 1, 'recovers then drops below: fires on the edge');
ok(n(e.set('battery.level', 14)) === 0 && n(e.set('battery.level', 13)) === 0, 'staying low does not refire');
// hysteresis
e = eng(); e.configure(cfg({ id: 'h', when: { src: 'battery.level', op: 'lt', value: 20, clear: 30 } }));
e.set('battery.level', 50);
ok(n(e.set('battery.level', 19)) === 1, 'hysteresis: fires below 20');
e.set('battery.level', 22); e.set('battery.level', 25);
ok(n(e.set('battery.level', 18)) === 0, 'hovering inside the band does not refire');
e.set('battery.level', 31);
ok(n(e.set('battery.level', 19)) === 1, 'after clearing past 30 it can fire again');
// debounce
e = eng(); e.configure(cfg({ id: 'd', for_s: 5, when: { src: 'motion.state', op: 'eq', value: 'face_down' } }));
e.set('motion.state', 'face_up');
at(10); ok(n(e.set('motion.state', 'face_down')) === 0, 'debounce: not yet');
at(13); ok(n(e.tick()) === 0, 'debounce: 3 s is not enough');
ok(e.nextWakeMs() === 2000, 'the engine says when to look again: ' + e.nextWakeMs());
at(15.5); ok(n(e.tick()) === 1, 'debounce: fires once it has held for 5 s');
at(20); e.set('motion.state', 'face_up'); at(22); e.set('motion.state', 'face_down'); at(24); e.set('motion.state', 'face_up'); at(30);
ok(n(e.tick()) === 0, 'a flicker shorter than for_s never fires');
// cooldown and hourly limit
e = eng(); e.configure(cfg({ id: 'c', cooldown_s: 300, max_per_hour: 2, when: { src: 'light.lux', op: 'lt', value: 2 } }));
e.set('light.lux', 100);
at(1); ok(n(e.set('light.lux', 0)) === 1, 'cooldown: first fire');
at(2); e.set('light.lux', 100); at(3); ok(n(e.set('light.lux', 0)) === 0, 'cooldown: suppressed 2 s later');
at(400); e.set('light.lux', 100); at(401); ok(n(e.set('light.lux', 0)) === 1, 'after the cooldown it fires again');
at(800); e.set('light.lux', 100); at(801); ok(n(e.set('light.lux', 0)) === 0, 'hourly limit (2) holds back the third');
ok(e.status().includes('hourly limit reached') && e.status().includes('"fired_last_hour":2'), 'status reports the suppression: ' + e.status());
at(3700); e.set('light.lux', 100); at(3701); ok(n(e.set('light.lux', 0)) === 1, 'an hour later the budget is back');
// all / any / not
e = eng(); e.configure(cfg({ id: 'fd', when: { all: [{ src: 'motion.state', op: 'eq', value: 'face_down' }, { src: 'light.lux', op: 'lt', value: 2 }] } },
  { id: 'any', when: { any: [{ src: 'wifi.connected', op: 'eq', value: false }, { not: { src: 'battery.charging', op: 'eq', value: true } }] } }));
e.update({ 'motion.state': 'face_up', 'light.lux': 300, 'wifi.connected': true, 'battery.charging': true });
ok(n(e.set('motion.state', 'face_down')) === 0, 'all: one of two true is not enough');
f = e.set('light.lux', 0); ok(ids(f) === 'fd,', 'all: both true fires: ' + ids(f));
f = e.set('wifi.connected', false); ok(ids(f) === 'any,', 'any: one true fires');
e.set('wifi.connected', true); f = e.set('battery.charging', false); ok(ids(f) === 'any,', 'not: unplugging fires');
// unknown sources
e = eng(); e.configure(cfg({ id: 'u', when: { all: [{ src: 'light.lux', op: 'lt', value: 2 }, { src: 'never.set', op: 'eq', value: 1 }] } }));
ok(n(e.set('light.lux', 0)) === 0, 'a source nobody reports never fires');
// events
e = eng(); e.configure(cfg({ id: 'n', for_s: 3, when: { src: 'motion.state', op: 'eq', value: 'face_down' }, on: { event: 'notification', min_importance: 4, contains: 'urgent' }, cooldown_s: 60 }));
e.set('motion.state', 'face_up');
ok(n(e.event('notification', { title: 'URGENT: call me', importance: 4 })) === 0, 'event: face up, nothing');
at(5); e.set('motion.state', 'face_down');
at(6); ok(n(e.event('notification', { title: 'URGENT: call me', importance: 4 })) === 0, 'event: face down only 1 s');
at(9); ok(n(e.event('notification', { title: 'lunch?', importance: 4 })) === 0, 'event: wrong text');
ok(n(e.event('notification', { title: 'urgent', importance: 2 })) === 0, 'event: not important enough');
f = e.event('notification', { title: 'URGENT: call me', text: 'now', importance: 4, package: 'com.x' });
ok(n(f) === 1 && f[0].kind === 'event' && f[0].event.package === 'com.x' && f[0].values['motion.state'] === 'face_down', 'event fires with the event and the readings');
at(20); ok(n(e.event('notification', { title: 'URGENT again', importance: 5 })) === 0, 'event: cooldown holds the second');
e.configure(cfg({ id: 'p', on: { event: 'notification', package: 'com.bank' } }));
ok(n(e.event('notification', { package: 'com.other' })) === 0 && n(e.event('notification', { package: 'com.bank' })) === 1, 'event with only a package filter');
// active hours (12:00 local)
e = eng(); e.configure(cfg({ id: 'night', hours: '22:00-07:00', when: { src: 'light.lux', op: 'lt', value: 2 } }, { id: 'day', hours: '08:00-18:00', when: { src: 'light.lux', op: 'lt', value: 2 } }));
e.set('light.lux', 100); f = e.set('light.lux', 0); ok(ids(f) === 'day,', 'hours: at noon only the daytime rule fires: ' + ids(f));
// rearm cooldown
e = eng(); e.configure(cfg({ id: 'r', rearm: 'cooldown', cooldown_s: 60, when: { src: 'battery.level', op: 'lt', value: 10 } }));
e.set('battery.level', 50); at(1); ok(n(e.set('battery.level', 5)) === 1, 'rearm cooldown: first');
at(30); ok(n(e.tick()) === 0, 'rearm cooldown: not yet'); at(62); ok(n(e.tick()) === 1, 'rearm cooldown: repeats after 60 s');
// geofence
e = eng(); e.configure(cfg({ id: 'home', when: { src: 'geo', op: 'inside', lat: 40, lon: -74, radius_m: 100, clear_m: 50 } }, { id: 'away', when: { src: 'geo', op: 'outside', lat: 40, lon: -74, radius_m: 100, clear_m: 50 } }));
e.update({ 'geo.lat': 40.01, 'geo.lon': -74, 'geo.accuracy': 10 });
ok(n(e.update({ 'geo.lat': 40.0003, 'geo.lon': -74 })) === 1, 'geo: arriving fires home');
ok(n(e.update({ 'geo.lat': 40.0013, 'geo.lon': -74 })) === 0, 'geo: inside the exit margin, no away yet');
f = e.update({ 'geo.lat': 40.003, 'geo.lon': -74 }); ok(ids(f) === 'away,', 'geo: well outside fires away: ' + ids(f));
ok(n(e.update({ 'geo.lat': 40.0013, 'geo.lon': -74 })) === 0 && n(e.update({ 'geo.lat': 40.0004, 'geo.lon': -74 })) === 1, 'geo: coming back fires home again');
ok(Math.abs(meters(40, -74, 40.001, -74) - 111.2) < 0.5, 'distance maths');
// idle
e = eng(); e.configure(cfg({ id: 'idle', when: { src: 'user.idle_s', op: 'gt', value: 120 } }));
e.touch(); at(10); ok(n(e.tick()) === 0, 'idle: active 10 s ago');
ok(e.nextWakeMs() > 0 && e.nextWakeMs() <= 10000, 'idle rules ask to be ticked');
at(60); e.tick(); at(130); ok(n(e.tick()) === 1, 'idle: 130 s fires');
at(131); e.touch(); at(140); ok(n(e.tick()) === 0, 'idle: touching resets it');
// hot reload
e = eng(); const A = { id: 'a', cooldown_s: 600, when: { src: 'light.lux', op: 'lt', value: 2 } }, B = { id: 'b', when: { src: 'battery.level', op: 'lt', value: 10 } };
e.configure(cfg(A)); e.set('light.lux', 100); at(1); ok(n(e.set('light.lux', 0)) === 1, 'reload: a fires');
ok(e.configure(cfg(A, B)).length === 0, 'reload: adding b works');
at(2); e.set('light.lux', 100); at(3); ok(n(e.set('light.lux', 0)) === 0, 'reload: a kept its cooldown');
e.set('battery.level', 50); ok(n(e.set('battery.level', 5)) === 1, 'reload: b is live');
e.configure(cfg(B)); ok(e.status().includes('"id":"b"') && !e.status().includes('"id":"a"'), 'reload: removed rule is gone');
// disabled and bad rules
e = eng(); const errs = e.configure(cfg({ id: 'off', enabled: false, when: { src: 'light.lux', op: 'lt', value: 2 } }, { id: 'bad', when: { src: 'x', op: 'wobbly', value: 1 } }, { when: { src: 'x', op: 'lt', value: 1 } }, { id: 'nohours', hours: '25', when: { src: 'x', op: 'lt', value: 1 } }, { id: 'good', when: { src: 'light.lux', op: 'lt', value: 2 } }, { id: 'geo', when: { src: 'geo', op: 'inside', lon: 1 } }));
ok(errs.length === 4, 'four bad rules are reported: ' + JSON.stringify(errs));
e.set('light.lux', 100); f = e.set('light.lux', 0); ok(ids(f) === 'good,', 'disabled never fire, bad skipped, good work: ' + ids(f));
ok(e.configure('{nope').length > 0, 'malformed JSON is reported');
// where filters
e = eng(); e.configure(cfg({ id: 'call', on: { event: 'call', where: { state: 'ringing', number: { starts: '+1555' } } } }, { id: 'sms', on: { event: ['sms', 'mms'], where: { text: { contains: 'Code' }, from: { in: ['BANK', '+15550100'] } } } },
  { id: 'wake', on: { event: 'wake_word', where: { confidence: { ge: 0.5, lt: 1.1 }, phrase: 'hey choom' } } }, { id: 'ex', on: { event: 'headset', where: { name: { exists: false } } } }));
ok(ids(e.event('call', { state: 'ringing', number: '+15551234' })) === 'call,', 'where: ringing from +1555 matches');
ok(n(e.event('call', { state: 'ended', number: '+15551234' })) === 0 && n(e.event('call', { state: 'ringing', number: '+44555' })) === 0, 'where: others do not');
ok(ids(e.event('sms', { from: 'BANK', text: 'Your CODE is 123' })) === 'sms,' && ids(e.event('mms', { from: '+15550100', text: 'code' })) === 'sms,', 'where: lists, contains, in');
ok(n(e.event('sms', { from: 'Mum', text: 'code?' })) === 0, 'where: sender not in the list');
ok(ids(e.event('wake_word', { phrase: 'hey choom', confidence: 0.9 })) === 'wake,' && n(e.event('wake_word', { phrase: 'hey choom', confidence: 0.2 })) === 0, 'where: numeric ranges');
ok(n(e.event('headset', { name: 'Buds' })) === 0 && ids(e.event('headset', { plugged: true })) === 'ex,', 'where: exists:false');
ok(JSON.stringify(e.sources()) === '["event:call","event:sms","event:mms","event:wake_word","event:headset"]', 'sources lists every event name: ' + e.sources());
e.configure(cfg({ id: 'bad', on: { event: 'x', where: { a: { wobbly: 1 } } } }));
ok(n(e.event('x', { a: 1 })) === 0, 'an unknown where-operator never matches');
e.configure(cfg({ id: 'bad2', on: { event: 5 } })); ok(e.status().includes('"triggers":[]'), 'an event that is not a name is rejected');
// sources
e = eng(); e.configure(cfg({ id: '1', when: { all: [{ src: 'light.lux', op: 'lt', value: 2 }, { src: 'geo', op: 'inside', lat: 1, lon: 1 }] }, on: { event: 'notification' } }, { id: '2', enabled: false, when: { src: 'battery.level', op: 'lt', value: 1 } }));
ok(JSON.stringify(e.sources()) === '["light.lux","geo","event:notification"]', 'sources() lists only enabled rules: ' + e.sources());
for (const l of out) console.log(l);
console.log(`\n${pass} passed, ${fail} failed`); console.log(fail ? `\n${fail} FAILED` : '\nALL PASS');
process.exit(fail ? 1 : 0);
