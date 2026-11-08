// TensorFlow.js, ONNX Runtime Web and LiteRT, each downloaded from jsDelivr on first use.
import fs from 'node:fs';
import { start } from './_harness.mjs';
const t = await start({ busybox: false });
const { ok, ev } = t;
await ev(b => kit.vfs.write('/models/tiny.onnx', new Uint8Array(b)), [...fs.readFileSync('tests/fixtures/tiny_matmul.onnx')]);
await ev(b => kit.vfs.write('/models/add.tflite', new Uint8Array(b)), [...fs.readFileSync('tests/fixtures/add.tflite')]);
// TensorFlow.js on the page
let r = await ev(async () => { const tf = await kit.ml.tf(); return { v: [...await tf.tensor([1, 2, 3]).mul(2).data()], backend: tf.getBackend() }; });
ok(r.v?.join() === '2,4,6', 'TensorFlow.js computes (' + r.backend + '): ' + JSON.stringify(r));
// and in a JS script (worker)
r = await ev(() => kit.js.run(`const v = await tf.tensor([1, 2]).add(1).data(); console.log([...v].join(','), tf.getBackend())`));
ok(/^2,3 /.test(r.stdout), 'tf in scripts: ' + JSON.stringify(r).slice(0, 300));
// ONNX
r = await ev(async () => { const m = await kit.ml.onnx('/models/tiny.onnx', { accelerator: 'wasm' }); const a = await m.run({ X: { data: [[1, 2, 3, 4], [0, 0, 0, 1]] } }); const b = await m.run([[1, 2, 3, 4]]); const c = await m.run({ X: [0, 1, 0, 0] }); await m.release(); return { inputs: m.inputs, a: [...a.Y.data], shape: a.Y.shape, b: [...b.Y.data], c: [...c.Y.data] }; });
ok(r.a?.join() === '5.5,5,17,1.5,0,11' && r.shape?.join() === '2,3' && r.b?.join() === '5.5,5,17' && r.c?.join() === '0.5,0,10' && r.inputs?.[0]?.name === 'X', 'ONNX: by name, in order, flat data with a flexible batch: ' + JSON.stringify(r).slice(0, 300));
// LiteRT (.tflite)
r = await ev(async () => { const m = await kit.ml.tflite('/models/add.tflite', { accelerator: 'wasm' }); const o = await m.run([{ data: [1, 2, 3, 4] }, { data: [10, 20, 30, 40] }]); m.delete(); return { acc: m.accelerator, inputs: m.inputs.length, out: [...o[0].data] }; });
ok(r.out?.join() === '11,22,33,44' && r.inputs === 2, 'LiteRT runs a .tflite model: ' + JSON.stringify(r).slice(0, 300));
r = await ev(async () => { try { await kit.ml.onnx('/nope.onnx'); return 'no error'; } catch (e) { return e.message; } });
ok(/not a file/.test(r), 'a missing model says so: ' + r);
await t.done();
