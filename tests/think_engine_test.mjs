// The think engine (src/internal/think_engine.js) against hand-computed numbers, in Node. These checks are Jade Vault's
// (tests/think_test.mjs, the engine section), run unchanged so the port stays identical.
import * as TE from '../src/internal/think_engine.js';
const { thNewTree, thExpand, thAddEvals, thSelect, thBest, thAdvArray, thAdvantages, thFeatures, thReward, thRender, thBudget, thNodeScore, thQ, thValidateVerifier } = TE;
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
const E = (fn, arg) => fn(arg);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
// ---------------------------------------------------------------- the engine, no model, no verifiers
// priors, duplicates, limits
let r = await E(() => {
  const t = thNewTree('g', { width: 2, depth: 2, nodes: 4 });
  const a = thExpand(t, 0, [{ text: 'one' }, { text: 'two' }, { text: 'ONE ' }]);
  const priors = a.created.map(i => t.nodes[i].p);
  let depthErr = '', budgetErr = '';
  const kid = a.created[0]; thExpand(t, kid, ['x']);
  try { thExpand(t, t.nodes[kid].children[0], ['too deep']); } catch (e) { depthErr = e.message; }
  const partial = thExpand(t, 0, ['a', 'b', 'c', 'd', 'e']);   // one node of room left: it takes what fits and says what it left out
  try { thExpand(t, 0, ['f']); } catch (e) { budgetErr = e.message; }
  return { created: a.created.length, partial: partial.created.length, partialSkipped: partial.skipped, skipped: a.skipped, sum: priors.reduce((x, y) => x + y, 0), first: priors[0] > priors[1], depthErr, budgetErr, spent: t.spent.nodes };
});
ok(r.created === 2 && r.skipped.includes('duplicate') && near(r.sum, 1) && r.first, 'expand: duplicates are skipped, priors are normalised, rank decides when none are given: ' + JSON.stringify(r));
ok(r.partial === 1 && r.partialSkipped.some(x => /over the node budget/.test(x)) && /depth limit/.test(r.depthErr) && /budget used up/.test(r.budgetErr) && r.spent === 4, 'expand: the depth limit and the node budget are hard: ' + r.depthErr + ' | ' + r.budgetErr);

// evidence and score range are required
r = await E(() => {
  const t = thNewTree('g'); thExpand(t, 0, ['a']); const out = [];
  for (const ev of [{ kind: 'x', tier: 3, score: 0.9, evidence: '' }, { kind: 'x', tier: 3, score: 1.5, evidence: 'e' }]) { try { thAddEvals(t, 1, [ev]); out.push('accepted'); } catch (e) { out.push(e.message); } }
  return out;
});
ok(/needs evidence/.test(r[0]) && /between 0 and 1/.test(r[1]), 'a score with no evidence, or outside 0-1, is refused: ' + JSON.stringify(r));

// weighting: a hard pass (weight 1) with a judge (weight 0.5): (1*1 + 0.5*0.5) / 1.5
r = await E(() => { const t = thNewTree('g'); thExpand(t, 0, ['a']); thAddEvals(t, 1, [{ kind: 'code', tier: 1, score: 1, evidence: 'ok' }, { kind: 'decide', tier: 3, score: 0.5, evidence: 'meh' }]); return t.nodes[1].score; });
ok(near(r, (1 + 0.25) / 1.5), 'tiers are weighted 1 / 0.8 / 0.5 / 0.25: ' + r);

// a hard failure is a veto: no amount of judge confidence rescues it
r = await E(() => { const t = thNewTree('g'); thExpand(t, 0, ['a']); thAddEvals(t, 1, [{ kind: 'decide', tier: 3, score: 0.99, evidence: 'great' }, { kind: 'code', tier: 1, score: 0, veto: true, evidence: 'test failed' }]); const n = t.nodes[1]; return { s: n.score, v: n.vetoed, st: n.status, best: thBest(t).node }; });
ok(r.s === 0 && r.v && r.st === 'dead' && r.best === null, 'a failed hard check beats a 0.99 judge: score 0, dead, never the answer: ' + JSON.stringify(r));
r = await E(() => { const t = thNewTree('g'); thExpand(t, 0, ['a']); thAddEvals(t, 1, [{ kind: 'decide', tier: 3, score: 0.1, evidence: 'no', veto: true }]); return t.nodes[1].vetoed; });
ok(r === false, 'only a tier-1 check can veto; a judge cannot kill a line by itself');

// backup: first evaluation counts a visit, later ones move the sum only
r = await E(() => {
  const t = thNewTree('g'); thExpand(t, 0, ['a']); thExpand(t, 1, ['b']);
  thAddEvals(t, 2, [{ kind: 'k', tier: 3, score: 0.8, evidence: 'e' }]); const s1 = [0, 1, 2].map(i => [t.nodes[i].N, +t.nodes[i].W.toFixed(3)]);
  thAddEvals(t, 1, [{ kind: 'k', tier: 3, score: 0.4, evidence: 'e' }]); const s2 = [0, 1, 2].map(i => [t.nodes[i].N, +t.nodes[i].W.toFixed(3)]);
  thAddEvals(t, 2, [{ kind: 'k', tier: 3, score: 0.4, evidence: 'e' }]); const s3 = [0, 1, 2].map(i => [t.nodes[i].N, +t.nodes[i].W.toFixed(3), +t.nodes[i].score?.toFixed?.(3)]);
  return { s1, s2, s3 };
});
ok(JSON.stringify(r.s1) === '[[1,0.8],[1,0.8],[1,0.8]]' && JSON.stringify(r.s2) === '[[2,1.2],[2,1.2],[1,0.8]]', 'backup: visits and value sums along the path: ' + JSON.stringify([r.s1, r.s2]));
ok(JSON.stringify(r.s3.map(x => x.slice(0, 2))) === '[[2,1],[2,1],[1,0.6]]', 're-evaluating a node moves the sums but not the visit counts (mean of 0.8 and 0.4 = 0.6): ' + JSON.stringify(r.s3));

// advantages: hand-computed. V = [.5,.6,.8], R = 1, gamma .95, lambda .9
//   d0 = .95*.6-.5 = .07 ; d1 = .95*.8-.6 = .16 ; d2 = 1-.8 = .2
//   A2 = .2 ; A1 = .16 + .855*.2 = .331 ; A0 = .07 + .855*.331 = .353005
r = await E(() => thAdvArray([0.5, 0.6, 0.8], 1, 0.95, 0.9));
ok(near(r.delta[0], 0.07) && near(r.delta[1], 0.16) && near(r.delta[2], 0.2) && near(r.A[2], 0.2) && near(r.A[1], 0.331) && near(r.A[0], 0.353005), 'GAE matches the hand-computed numbers: ' + JSON.stringify(r));
r = await E(() => thAdvArray([0.7], 0.9, 0.95, 0.9));
ok(near(r.A[0], 0.2), 'a one-step path has advantage = reward - value');

// selection, beam: check before expand, finish a level's beam before going deeper
r = await E(() => {
  const t = thNewTree('g', { mode: 'beam', width: 2, depth: 3, nodes: 50, stop_on_solve: false }); const seq = [];
  const rec = () => { const d = thSelect(t); seq.push(d.action + ':' + (d.node ?? d.stop)); return d; };
  const sc = (id, s) => thAddEvals(t, id, [{ kind: 'k', tier: 3, score: s, evidence: 'e' }]);
  rec();                                         // expand 0
  thExpand(t, 0, ['a', 'b', 'c']);               // 1 2 3
  rec(); sc(1, 0.9); rec(); sc(2, 0.7); rec(); sc(3, 0.2);
  rec();                                         // expand 1 (best of the top 2)
  thExpand(t, 1, ['a1', 'a2']);                  // 4 5
  rec(); sc(4, 0.95); rec(); sc(5, 0.5);
  rec();                                         // expand 2: the level-1 beam finishes first
  thExpand(t, 2, ['b1', 'b2']);                  // 6 7
  rec(); sc(6, 0.3); rec(); sc(7, 0.85);
  rec();                                         // level 1 done; level 2 top-2 are 4 (.95) and 7 (.85)
  return seq;
});
ok(JSON.stringify(r) === JSON.stringify(['expand:0', 'check:1', 'check:2', 'check:3', 'expand:1', 'check:4', 'check:5', 'expand:2', 'check:6', 'check:7', 'expand:4']), 'beam: checks everything created first, expands the top-2 of a level in score order, then goes deeper: ' + JSON.stringify(r));

// selection ends: solved, budget
r = await E(() => {
  const t = thNewTree('g', { nodes: 3 }); thExpand(t, 0, ['a', 'b', 'c']);
  const s1 = thSelect(t);                         // check 1 (nodes exactly used up, but checking is still allowed)
  for (const i of [1, 2, 3]) thAddEvals(t, i, [{ kind: 'k', tier: 3, score: 0.5, evidence: 'e' }]);
  const s2 = thSelect(t);
  const u = thNewTree('g'); thExpand(u, 0, ['a']); thAddEvals(u, 1, [{ kind: 'code', tier: 1, score: 1, evidence: 'passed' }]);
  const s3 = thSelect(u);
  return { s1, s2: { a: s2.action, stop: s2.stop }, s3: { a: s3.action, stop: s3.stop } };
});
ok(r.s1.action === 'check' && r.s2.a === 'stop' && r.s2.stop === 'nodes' && r.s3.a === 'stop' && r.s3.stop === 'solved', 'selection: still checks nodes it already has when the node budget is spent, stops on budget, stops on a hard pass: ' + JSON.stringify(r));

// selection, best_first and puct choose the higher-valued line
r = await E(() => {
  const out = {};
  for (const mode of ['best_first', 'puct']) {
    const t = thNewTree('g', { mode, depth: 3, stop_on_solve: false }); thExpand(t, 0, ['a', 'b']);
    thAddEvals(t, 1, [{ kind: 'k', tier: 3, score: 0.9, evidence: 'e' }]); thAddEvals(t, 2, [{ kind: 'k', tier: 3, score: 0.3, evidence: 'e' }]);
    out[mode] = thSelect(t).node;
  }
  return out;
});
ok(r.best_first === 1 && r.puct === 1, 'best_first and puct both expand the better line first: ' + JSON.stringify(r));

// best: a hard-verified line beats a higher judge score
r = await E(() => {
  const t = thNewTree('g'); thExpand(t, 0, ['judged', 'verified']);
  thAddEvals(t, 1, [{ kind: 'critique', tier: 4, score: 0.99, evidence: 'looks great' }]);
  thAddEvals(t, 2, [{ kind: 'code', tier: 1, score: 0.9, evidence: 'partial' }, { kind: 'code', tier: 1, score: 1, evidence: 'second test passed' }]);
  const b = thBest(t); return { node: b.node, verified: b.verified };
});
ok(r.node === 2 && r.verified, 'best: a line that passed a hard check outranks a higher self-rating: ' + JSON.stringify(r));

// features and reward
r = await E(() => { const t = thNewTree('g'); thExpand(t, 0, ['a']); const f = thFeatures(t); thAddEvals(t, 1, [{ kind: 'code', tier: 1, score: 1, evidence: 'ok' }]); return { n: f.length, ok: f.every(x => x >= 0 && x <= 1), rw: thReward(t) }; });
ok(r.n === 13 && r.ok && r.rw.outcome === 1 && r.rw.total < 1 && r.rw.total > 0.7, 'the state vector is 13 numbers in 0..1; a verified solve earns 1 minus a cost term: ' + JSON.stringify(r));

// the verifier schema
r = (() => { const out = []; for (const v of [{ kind: 'code' }, { kind: 'shell', cmd: 'true' }, { kind: 'nope' }, { kind: 'rubric', items: [] }]) { try { out.push(thValidateVerifier(v, 0).tier); } catch (e) { out.push(e.message.split(':')[1]?.trim().split(' ')[0]); } } return out; })();
ok(JSON.stringify(r) === JSON.stringify(['code', 1, 'kind', 'rubric']), 'verifiers are validated (code needs source, unknown kinds are refused): ' + JSON.stringify(r));
console.log(fail ? `\n${fail} FAILED` : '\nALL PASS'); process.exit(fail ? 1 : 0);
