// Transformers.js in the page: loads from jsDelivr on first use, embeds with a Hugging Face model, and those
// embeddings work everywhere the kit embeds (kit.embed, vector stores) when the model is named "hf:…".
import { start } from './_harness.mjs';
const t = await start({ use: [] });
const { ok, ev } = t;
await ev(() => { window.kit.config.transformers = { dtype: 'q8', device: 'wasm' }; });
ok(!t.requests.some(u => u.includes('@huggingface/transformers')), 'nothing loads until it is used');
const r = await ev(async () => {
  const tf = await kit.use('transformers');
  const [a, b, c] = await tf.embed(['The cat sat on the mat.', 'A kitten rests on a rug.', 'Quarterly revenue grew 8%.']);
  const dot = (x, y) => x.reduce((s, v, i) => s + v * y[i], 0);
  return { dims: a.length, near: dot(a, b), far: dot(a, c), norm: Math.sqrt(dot(a, a)), device: await tf.device() };
});
ok(r.dims === 384, `384-dimension embeddings (${r.dims})`);
ok(Math.abs(r.norm - 1) < 1e-3, 'normalized');
ok(r.near > r.far + 0.2, `similar sentences are closer (${r.near.toFixed(3)} vs ${r.far.toFixed(3)})`);
ok(t.requests.some(u => u.includes('@huggingface/transformers@4.3.2')) && t.requests.some(u => u.includes('huggingface.co')), 'library from jsDelivr, model from the Hub');
const one = await ev(() => kit.embed('hello', { model: 'hf:Xenova/all-MiniLM-L6-v2' }));
ok(Array.isArray(one) && one.length === 384, 'kit.embed routes hf: models to Transformers.js');
const hits = await ev(async () => {
  const store = await (await kit.use('vectors')).open(':memory:', { model: 'hf:Xenova/all-MiniLM-L6-v2' });
  await store.add(['How to bake sourdough bread', 'Fixing a flat bicycle tire', 'Training a puppy to sit']);
  return (await store.search('my bike wheel is punctured', { limit: 1 })).map(h => h.text);
});
ok(hits[0] === 'Fixing a flat bicycle tire', 'a vector store with an hf: model searches by meaning: ' + hits[0]);
const tool = await ev(() => kit.tool('transformers', { action: 'embed', input: ['a', 'b'] }));
ok(/2 embedding\(s\) of 384 dimensions/.test(tool), 'the transformers tool: ' + tool.slice(0, 60));
const fx = await ev(() => kit.transformers.run('feature-extraction', 'hi', { model: 'Xenova/all-MiniLM-L6-v2', pooling: 'mean', normalize: true }));
ok(Array.isArray(fx) && fx[0].length === 384, 'run() returns plain arrays for any pipeline task');
ok(/task is required/.test(await ev(() => kit.tool('transformers', { input: 'x' }))), 'the tool explains a missing task');
await t.done();
