// Curiosity: the pure engine (learning-progress activity ranking), ported unchanged from Jade Vault
// (app/modules/curiosity.js, between CU:ENGINE:BEGIN and CU:ENGINE:END). Activity briefs name {root}.
const CU_ACTS = [
  { id: 'explore', label: 'Explore something I am curious about', brief: 'Pick a topic from Memory, the journal or recent chats that you would like to understand better. Research it (notes first, then the web if allowed), and write what you learned and what is still open as a new note under {root}/Explorations/.' },
  { id: 'reflect', label: 'Reflect on recent conversations', brief: 'Review your recent chats and journal (chat_history and memory, if you have them). Find what went wrong or was left unfinished, what the user keeps needing, and what you should do differently. Write a short reflection note under {root}/Reflections/ and save durable facts about the user with the memory tool.' },
  { id: 'connect', label: 'Connect and tidy my notes', brief: 'Find notes that should link to each other, broken links, orphan notes, or near-duplicates. Fix a few with small, careful edits (never delete; never overwrite what you did not write) and list every change in {root}/Changes.md.' },
  { id: 'practice', label: 'Improve a skill or tool', brief: 'Look at your skills and tools. Try one on a small safe example, find what is unclear or missing, and improve its SKILL.md or write a new skill for something you had to work out the hard way. List the change in {root}/Changes.md.' },
  { id: 'anticipate', label: 'Prepare something for the user', brief: 'Look at the user\'s projects, tasks and recent notes. Prepare something they will probably want next (a draft, a checklist, a summary, a plan) under {root}/Prepared/. Do not send anything anywhere.' },
  { id: 'ask', label: 'Leave one good question for the user', brief: 'If there is something important you cannot know without asking, write exactly one clear question in {root}/Questions.md. If nothing is worth asking, say so and rest instead.' },
  { id: 'rest', label: 'Rest (do nothing)', brief: 'Do nothing this time. Resting is a real choice, and the right one when nothing is worth doing.' },
];
const CU_W = { lp: 1.5, prior: 1.0, nov: 0.25, ucb: 0.4, repeat: 0.2, cost: 0.05 };
const CU_REST_REWARD = 0.1;
const cuClamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const cuDaypart = d => { const h = (d instanceof Date ? d : new Date(d)).getHours(); return h < 6 ? 0 : h < 12 ? 1 : h < 18 ? 2 : 3; };
const cuNewAct = () => ({ n: 0, rA: 0.3, rD: [null, null, null, null], eF: 0, eS: 0, last: 0, fb: 0 });
const cuNewState = () => ({ v: 1, acts: {}, log: [], total: 0 });
function cuAct(state, id) { return state.acts[id] || (state.acts[id] = cuNewAct()); }
// forecast of the reward of an activity now: its own average blended with the average for this time of day
function cuPredict(state, id, dp) { const a = cuAct(state, id); return id === 'rest' ? CU_REST_REWARD : 0.6 * a.rA + 0.4 * (a.rD[dp] == null ? a.rA : a.rD[dp]); }
const cuLP = a => Math.max(0, a.eS - a.eF);                       // error going down = progress; error going up counts for nothing
function cuTemperature(state) { return Math.max(0.12, 0.35 / (1 + state.total / 40)); }
function cuScores(state, ids, now, lastId, boost) {
  const dp = cuDaypart(now);
  return ids.map(id => {
    const a = cuAct(state, id), hours = a.last ? (now - a.last) / 3600000 : 99;
    const parts = id === 'rest'
      ? { lp: 0, prior: CU_REST_REWARD * CU_W.prior, nov: 0, ucb: 0, repeat: id === lastId ? -CU_W.repeat * 0.5 : 0, cost: 0 }
      : { lp: CU_W.lp * cuLP(a), prior: CU_W.prior * cuPredict(state, id, dp), nov: CU_W.nov * (1 - Math.exp(-hours / 12)) * (0.4 + a.rA), ucb: CU_W.ucb / Math.sqrt(1 + a.n), repeat: id === lastId ? -CU_W.repeat : 0, cost: -CU_W.cost };
    if (boost && boost[id]) parts.wish = boost[id];                                   // something the user asked for in CURIOSITY.md
    const score = Object.values(parts).reduce((s, x) => s + x, 0);
    return { id, score, parts, forecast: cuPredict(state, id, dp), progress: cuLP(a), tries: a.n };
  }).sort((x, y) => y.score - x.score);
}
function cuPick(scores, T, rand = Math.random) {
  if (!scores.length) return null;
  const m = scores[0].score, w = scores.map(s => Math.exp((s.score - m) / Math.max(1e-6, T))), tot = w.reduce((a, b) => a + b, 0);
  let r = rand() * tot; for (let i = 0; i < scores.length; i++) { r -= w[i]; if (r <= 0) return scores[i].id; }
  return scores.at(-1).id;
}
// reward from what the harness measured (never from her opinion alone)
function cuMeasured(d) { return cuClamp(0.45 * Math.tanh((d.created || 0) * 0.6) + 0.2 * Math.tanh((d.changed || 0) * 0.25) + 0.2 * Math.tanh((d.links || 0) * 0.25) + 0.15 * Math.tanh((d.memories || 0) * 0.7)); }
function cuReward(id, d, self) {
  if (id === 'rest') return CU_REST_REWARD;
  const m = cuMeasured(d); return self == null ? m : cuClamp(0.75 * m + 0.25 * Math.min(cuClamp(self), m + 0.2));
}
function cuUpdate(state, id, reward, now) {
  const a = cuAct(state, id), dp = cuDaypart(now), pred = cuPredict(state, id, dp), e = Math.abs(reward - pred);
  if (id !== 'rest') {
    if (a.n === 0) { a.eF = e; a.eS = e; } else { a.eF = 0.5 * a.eF + 0.5 * e; a.eS = 0.9 * a.eS + 0.1 * e; }
    a.rA = a.n === 0 ? reward : a.rA + 0.3 * (reward - a.rA);
    a.rD[dp] = a.rD[dp] == null ? reward : a.rD[dp] + 0.3 * (reward - a.rD[dp]);
  }
  a.n++; a.last = now; state.total++;
  return { forecast: pred, error: e, progress: cuLP(a) };
}
// next wake: uniform in [min,max] minutes (a nudge picks the lower or upper half), then moved into the active hours
function cuNextDelay(minM, maxM, rand = Math.random, nudge = '') {
  minM = Math.max(1, +minM || 45); maxM = Math.max(minM, +maxM || 180);
  let lo = minM, hi = maxM; const mid = (minM + maxM) / 2;
  if (nudge === 'sooner') hi = Math.max(lo, mid); else if (nudge === 'later') lo = Math.min(hi, mid);
  return Math.round((lo + rand() * (hi - lo)) * 60000 + rand() * 60000);
}
const cuHm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };
function cuInWindow(t, from, to) {
  const a = cuHm(from), b = cuHm(to); if (a == null || b == null) return true; if (a === b) return false;
  const d = new Date(t), n = d.getHours() * 60 + d.getMinutes(); return a < b ? n >= a && n < b : n >= a || n < b;
}
function cuNextAt(now, o, rand = Math.random, nudge = '') {
  let t = now + cuNextDelay(o.min, o.max, rand, nudge);
  if (!cuInWindow(t, o.from, o.to)) {                            // outside the active hours: first moment of the next window + a random offset
    const a = cuHm(o.from); if (a == null) return t;
    const d = new Date(t); d.setHours(Math.floor(a / 60), a % 60, 0, 0); if (d.getTime() < t) d.setDate(d.getDate() + 1);
    t = d.getTime() + Math.round(rand() * Math.max(1, +o.min || 45) * 30000);
  }
  return t;
}

export { CU_ACTS, CU_REST_REWARD, CU_W, cuAct, cuClamp, cuDaypart, cuHm, cuInWindow, cuLP, cuMeasured, cuNewAct, cuNewState, cuNextAt, cuNextDelay, cuPick, cuPredict, cuReward, cuScores, cuTemperature, cuUpdate };
