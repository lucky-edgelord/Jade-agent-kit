// Decisions on Ollaya, Ollama (local) and Ollama Cloud, each with its own wire format (stand-in servers).
import { start } from './_harness.mjs';
const t = await start({ busybox: false, ollamaKey: 'cloud-key' });
const { ok, ev, page } = t;
const seen = []; const cors = { 'access-control-allow-origin': '*' };
const fulfill = (route, json, status = 200) => route.fulfill({ status, json, headers: cors });
// Ollaya: criteria is a list; the answer names the option; noul is a boolean with true/false probabilities
await page.route('http://localhost:11435/**', async route => {
  const u = new URL(route.request().url()); const b = route.request().postData() ? JSON.parse(route.request().postData()) : {}; seen.push({ s: 'ollaya', path: u.pathname, b, auth: route.request().headers().authorization });
  if (u.pathname === '/api/tags') return fulfill(route, { models: [{ name: 'winnow:e4b' }, { name: 'judge-1' }] });
  const q = b.questions.q; let a;
  if (q.type === 'choice') { if (!Array.isArray(q.criteria)) return fulfill(route, { error: 'criteria must be a list' }, 400); a = { choice: q.criteria[1], confidence: 0.8, probabilities: Object.fromEntries(q.criteria.map((c, i) => [c, i === 1 ? 0.8 : 0.2 / (q.criteria.length - 1)])) }; }
  else if (q.type === 'score') a = { score: 2, legend: q.criteria[1], confidence: 0.7, probabilities: [0.1, 0.7, 0.2] };
  else a = { noul: /urgent/i.test(b.state), confidence: 0.88, probabilities: { true: 0.88, false: 0.12 } };
  return fulfill(route, { model: b.model, answers: { q: a } });
});
// Ollama (local) and Ollama Cloud: criteria is an object; the answer names the key; noul is the probability of true
const ollamaLike = name => async route => {
  const u = new URL(route.request().url()); const b = route.request().postData() ? JSON.parse(route.request().postData()) : {}; seen.push({ s: name, path: u.pathname, b, auth: route.request().headers().authorization });
  if (name === 'cloud' && route.request().headers().authorization !== 'Bearer cloud-key') return fulfill(route, { error: 'unauthorized' }, 401);
  if (u.pathname === '/api/tags') return fulfill(route, { models: [{ name: 'qwen3:8b' }, { name: name === 'cloud' ? 'clef' : 'clef-flash:latest' }, { name: 'gpt-oss:120b' }] });
  if (u.pathname !== '/v1/systemone') return fulfill(route, { error: 'not found' }, 404);
  if (name === 'cloud' && b.model !== 'clef') return fulfill(route, { error: `model "${b.model}" not found` }, 404);
  const q = b.questions.q; let a;
  if (q.type === 'choice') { if (Array.isArray(q.criteria) || typeof q.criteria !== 'object') return fulfill(route, { error: 'criteria must be an object' }, 400); const k = Object.keys(q.criteria); a = { type: 'choice', choice: k[1], confidence: 0.61, probabilities: Object.fromEntries(k.map((x, i) => [x, i === 1 ? 0.82 : +(0.18 / (k.length - 1)).toFixed(4)])) }; }
  else if (q.type === 'score') a = { type: 'score', score: 1.4, legend: { 0: 'low', 1: 'medium', 2: 'high' }, probabilities: { 0: 0.1, 1: 0.4, 2: 0.5 }, confidence: 0.3 };
  else a = { type: 'noul', noul: 0.91 };
  return fulfill(route, { model: b.model, answers: { q: a } });
};
await page.route('http://localhost:11434/**', ollamaLike('ollama'));
await page.route('https://ollama.com/**', ollamaLike('cloud'));
const ask = { state: 'TypeError at list.js:42', question: 'What kind of problem?', options: ['bug', 'network', 'user input'] };

// Ollaya (the default server)
let r = await ev(a => { kit.decisions.model = 'judge-1'; return kit.decide(a); }, ask);
ok(r.server === 'ollaya' && r.choice === 'network' && r.result === 'network' && r.confidence === 0.8 && r.probabilities.network === 0.8, 'Ollaya: choice: ' + JSON.stringify(r));
ok(Array.isArray(seen.at(-1).b.questions.q.criteria), 'Ollaya gets the options as a list');
r = await ev(() => kit.decide({ state: 'urgent: prod down', question: 'Urgent?', type: 'yesno' }));
ok(r.type === 'yesno' && r.answer === true && r.confidence === 0.88, 'Ollaya yes/no: ' + JSON.stringify(r));
r = await ev(() => kit.decide({ state: 'x', question: 'How bad?', type: 'score', options: ['low', 'medium', 'high'] }));
ok(r.score === 2 && r.legend === 'medium' && r.probabilities['1'] === 0.7, 'Ollaya score: ' + JSON.stringify(r));
ok(JSON.stringify(await ev(() => kit.decisions.models())) === '["winnow:e4b","judge-1"]', 'Ollaya lists its models');

// Ollama on the machine
r = await ev(a => { Object.assign(kit.decisions, { server: 'ollama', model: 'clef-flash' }); return kit.decide(a); }, ask);
ok(r.server === 'ollama' && r.choice === 'network' && r.probabilities.network === 0.82 && r.probabilities.bug === 0.09, 'Ollama: the winning key maps back to the option: ' + JSON.stringify(r));
ok(JSON.stringify(seen.at(-1).b.questions.q.criteria) === '{"bug":"bug","network":"network","user input":"user input"}' && !seen.at(-1).auth, 'Ollama gets the options as an object, no key');
r = await ev(() => kit.decide({ state: 's', question: 'q', type: 'yesno' }));
ok(r.answer === true && r.probabilities.yes === 0.91 && r.confidence === 0.91, 'Ollama yes/no: the probability of true becomes yes/no: ' + JSON.stringify(r));
ok(JSON.stringify(await ev(() => kit.decisions.models())) === '["clef-flash:latest"]', 'Ollama lists decision models only');
r = await ev(() => kit.decide({ state: 's', question: 'q', options: ['short', 'y'.repeat(150)] }));
ok(r.choice === 'y'.repeat(150) && seen.at(-1).b.questions.q.criteria.option_2, 'an option too long for a key is sent as option_2 and maps back');

// Ollama Cloud
r = await ev(a => { Object.assign(kit.decisions, { server: 'cloud', model: 'clef:cloud' }); return kit.decide(a); }, ask);
ok(r.server === 'cloud' && r.choice === 'network' && seen.at(-1).b.model === 'clef' && seen.at(-1).auth === 'Bearer cloud-key', 'Ollama Cloud: clef:cloud sent as clef with the key: ' + JSON.stringify(r));
ok(JSON.stringify(await ev(() => kit.decisions.models())) === '["clef"]', 'Ollama Cloud lists clef');
r = await ev(async () => { kit.decisions.model = 'laya'; try { await kit.decide({ state: 's', question: 'q', type: 'yesno' }); return 'no error'; } catch (e) { return e.message; } finally { kit.decisions.model = ''; } });
ok(/no decision model "laya"; try clef/.test(r), 'an unknown cloud model says to try clef: ' + r);
r = await ev(() => kit.decide({ state: 's', question: 'q', type: 'yesno' }));
ok(r.model === 'clef', 'the cloud defaults to clef');

// the decide tool and scripts
r = await ev(() => kit.tools.call('decide', { state: 'x', question: 'kind?', type: 'choice', options: ['bug', 'network', 'user input'] }));
ok(/^choice: network \| confidence 0\.610\nprobabilities: network 0\.820/.test(r) && /\(Ollama Cloud\)$/.test(r), 'the decide tool: ' + JSON.stringify(r));
r = await ev(() => kit.js.run(`const d = await kit.decide({ state: 'x', question: 'q', type: 'yesno' }); console.log(d.answer, d.server)`));
ok(r.stdout === 'true cloud\n', 'scripts call kit.decide: ' + JSON.stringify(r));
r = await ev(async () => { Object.assign(kit.decisions, { server: 'ollaya', model: '' }); try { await kit.decide({ state: 's', question: 'q', type: 'yesno' }); return 'no error'; } catch (e) { return e.message; } });
ok(/no decision model/.test(r), 'no model set: ' + r);
r = await ev(async () => { const k = await K.createKit({ use: ['decide'], busybox: false, decide: { server: 'ollama', model: 'clef-flash', host: 'http://localhost:11434' } }); return [k.decisions.server, k.decisions.base, (await k.decide({ state: 's', question: 'q', type: 'yesno' })).answer]; });
ok(r.join() === 'ollama,http://localhost:11434,true', 'createKit({ decide }) configures it: ' + r);
await t.done();
