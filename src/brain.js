// The agent brain: turns kit.agent({ brain }) into plugins. Only the features named are loaded.
//   brain: true            memory, skills, history, guard (a sensible default)
//   brain: 'all'           every brain feature (the model router only when createKit({ models }) lists models)
//   automation parts (flows, playbooks, gantt, autonomy, heartbeat, curiosity, lisp, secrets) add their tool when named
//   brain: ['memory', { name: 'think' }, { name: 'memory', journal: true }]
export const BRAIN = ['memory', 'knowledge', 'think', 'delegate', 'skills', 'history', 'guard', 'router', 'models',
  'flows', 'playbooks', 'gantt', 'autonomy', 'heartbeat', 'curiosity', 'lisp', 'secrets'];
const EXTRA = new Set(['flows', 'playbooks', 'gantt', 'autonomy', 'heartbeat', 'curiosity', 'lisp', 'secrets']);   // tools only: not in 'all'
export const DEFAULT_BRAIN = ['memory', 'skills', 'history', 'guard'];
const ALIAS = { kg: 'knowledge', steering: 'skills', 'tool-router': 'router', 'model-router': 'models', context: 'guard', chats: 'history' };

export async function brainPlugins(kit, brain) {
  const list = brain === true ? DEFAULT_BRAIN : brain === 'all' ? BRAIN.filter(n => !EXTRA.has(n) && (n !== 'models' || kit.config.models)) : [].concat(brain);
  const items = list.map(x => typeof x === 'string' ? { name: x } : { ...x }).map(x => ({ ...x, name: ALIAS[x.name] || x.name }));
  for (const x of items) if (!BRAIN.includes(x.name)) throw new Error(`unknown brain feature "${x.name}". Use: ${BRAIN.join(', ')}`);
  const feats = await Promise.all(items.map(x => kit.use(x.name)));
  return feats.map((f, i) => { const { name, ...o } = items[i]; return f.plugin(o); });
}
