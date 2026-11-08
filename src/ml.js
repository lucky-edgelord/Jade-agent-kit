// Machine learning runtimes, each downloaded from jsDelivr (pinned) the first time it is used:
//   TensorFlow.js 4.22 (WebGPU → WebGL → CPU), ONNX Runtime Web 1.31.1 (WebGPU or WebAssembly),
//   LiteRT.js 2.5.3 for .tflite models (WebGPU or WebAssembly).
import { fetchBytes, fetchText, loadScript } from './util.js';

export const VERSIONS = { tfjs: '4.22.0', onnxruntime: '1.31.1', litert: '2.5.3' };

// WebGPU on phones: Android WebView may only give an adapter for "compatibility" requests. Try plain, then that.
export function gpuShim(g = globalThis.navigator?.gpu) {
  if (!g || g.__jak || typeof g.requestAdapter !== 'function') return;
  const req = g.requestAdapter.bind(g);
  g.requestAdapter = async (o) => {
    let a = null; try { a = await req(o); } catch {}
    if (!a && !(o && o.featureLevel)) { try { a = await req({ ...(o || {}), featureLevel: 'compatibility' }); } catch {} }
    if (a && !a.__jak && a.features?.has?.('core-features-and-limits')) { const rd = a.requestDevice.bind(a); a.requestDevice = (d = {}) => rd({ ...d, requiredFeatures: [...new Set([...(d.requiredFeatures || []), 'core-features-and-limits'])] }); a.__jak = true; }
    return a;
  };
  g.__jak = true;
}

const TA = { float32: Float32Array, int32: Int32Array, uint8: Uint8Array, int8: Int8Array, float64: Float64Array, int16: Int16Array, uint16: Uint16Array };
const flat = (x, out = []) => { if (Array.isArray(x)) for (const v of x) flat(v, out); else out.push(+x); return out; };
const shapeOf = x => { const s = []; while (Array.isArray(x)) { s.push(x.length); x = x[0]; } return s; };

export class ML {
  constructor({ vfs, cdn = 'https://cdn.jsdelivr.net/npm/' }) { this.vfs = vfs; this.cdn = cdn; this._tf = null; this._tfSrc = null; this._ort = null; this._lrt = null; try { gpuShim(); } catch {} }
  url(pkg, ver, path) { return `${this.cdn}${pkg}@${ver}/${path}`; }

  // a model from a VFS path, a URL or bytes
  async bytes(src) {
    if (src instanceof Uint8Array) return src;
    if (src instanceof ArrayBuffer) return new Uint8Array(src);
    const s = String(src || '');
    if (/^(https?:|blob:|data:)/i.test(s)) return fetchBytes(s, s);
    if (!this.vfs.isFile(s)) throw new Error(`${s} is not a file`);
    return this.vfs.readBytes(s);
  }
  // { data, shape, dtype } | nested arrays | a typed array → [typedArray, shape, dtype]
  tensorInput(x, dtype = 'float32') {
    if (x && !Array.isArray(x) && !ArrayBuffer.isView(x) && typeof x === 'object') { dtype = x.dtype || dtype; const d = x.data; const arr = ArrayBuffer.isView(d) ? d : (TA[dtype] || Float32Array).from(flat(d)); return [arr, x.shape || (Array.isArray(d) ? shapeOf(d) : [arr.length]), dtype]; }
    if (ArrayBuffer.isView(x)) return [x, [x.length], dtype];
    return [(TA[dtype] || Float32Array).from(flat(x)), shapeOf(x), dtype];
  }

  /* ---------- TensorFlow.js ---------- */
  /** TensorFlow.js on this page (window.tf), with the fastest backend that works */
  async tf({ backend } = {}) {
    return this._tf ||= (async () => {
      const tf = await loadScript(this.url('@tensorflow/tfjs', VERSIONS.tfjs, 'dist/tf.min.js'), 'tf');
      try { await loadScript(this.url('@tensorflow/tfjs-backend-webgpu', VERSIONS.tfjs, 'dist/tf-backend-webgpu.min.js')); } catch {}
      const works = async (b) => { try { if (!tf.findBackendFactory(b) || !(await tf.setBackend(b))) return false; await tf.ready(); const v = await tf.tensor([1, 2]).add(1).data(); return v[0] === 2; } catch { return false; } };
      for (const b of backend ? [backend] : ['webgpu', 'webgl', 'cpu']) if (await works(b)) break;
      return tf;
    })().catch(e => { this._tf = null; throw e; });
  }
  /** TensorFlow.js as source text (for scripts in a worker) */
  tfjsSource() { return this._tfSrc ||= fetchText(this.url('@tensorflow/tfjs', VERSIONS.tfjs, 'dist/tf.min.js'), 'TensorFlow.js').catch(e => { this._tfSrc = null; throw e; }); }

  /* ---------- ONNX Runtime Web ---------- */
  ort() {
    return this._ort ||= (async () => {
      const base = this.url('onnxruntime-web', VERSIONS.onnxruntime, 'dist/');
      const ort = await loadScript(base + 'ort.webgpu.min.js', 'ort');
      if (!ort?.InferenceSession) throw new Error('ONNX Runtime did not load');
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      ort.env.wasm.wasmPaths = base; ort.env.logLevel = 'error';
      return ort;
    })().catch(e => { this._ort = null; throw e; });
  }
  /**
   * Load an .onnx model (VFS path, URL or bytes).
   * @returns {Promise<{ accelerator: string, inputs: object[], outputs: object[], run: (inputs: object|any[]) => Promise<object>, release: () => Promise<void> }>}
   */
  async onnx(src, { accelerator } = {}) {
    const self = this; const ort = await this.ort(); const bytes = await this.bytes(src);
    let acc = accelerator || (await this.webgpu() ? 'webgpu' : 'wasm'), note;
    const make = ac => ort.InferenceSession.create(bytes, { executionProviders: ac === 'webgpu' ? ['webgpu', 'wasm'] : ['wasm'], graphOptimizationLevel: 'all' });
    let s; try { s = await make(acc); } catch (e) { if (acc === 'wasm') throw e; note = `${acc} failed (${e.message}); using wasm`; acc = 'wasm'; s = await make('wasm'); }
    const meta = which => s[which + 'Names'].map((n, i) => { const md = s[which + 'Metadata']; const m = Array.isArray(md) ? md[i] : md?.[n]; return { name: n, shape: (m?.shape || []).map(d => typeof d === 'number' ? d : -1), dtype: m?.type || 'float32' }; });
    const inputs = meta('input'), outputs = meta('output');
    return {
      accelerator: acc, note, inputs, outputs, session: s,
      /** inputs: an object by input name, or an array in order; each { data, shape?, dtype? } or nested arrays. Returns { name: { data, shape, dtype } } */
      async run(given) {
        const list = Array.isArray(given) ? given : inputs.map(d => given[d.name] ?? (inputs.length === 1 ? given : undefined));
        const feeds = {};
        inputs.forEach((d, i) => {
          if (list[i] == null) throw new Error(`no data for input ${d.name}`);
          let [arr, shape, dtype] = self.tensorInput(list[i], list[i]?.dtype || d.dtype);
          // flat data for a model input with one flexible dimension (a batch size): work that dimension out
          if (!list[i]?.shape && d.shape.length && shape.length !== d.shape.length && d.shape.filter(x => x < 0).length === 1) {
            const fixed = d.shape.filter(x => x > 0).reduce((p, q) => p * q, 1);
            if (arr.length % fixed) throw new Error(`input ${d.name} needs a multiple of ${fixed} values (shape ${JSON.stringify(d.shape)}), got ${arr.length}`);
            shape = d.shape.map(x => x < 0 ? arr.length / fixed : x);
          }
          if (dtype === 'int64') arr = BigInt64Array.from(arr, x => BigInt(Math.round(Number(x)))); else if (dtype === 'bool') arr = Uint8Array.from(arr, x => x ? 1 : 0);
          feeds[d.name] = new ort.Tensor(dtype, arr, list[i]?.shape || shape);
        });
        const outs = await s.run(feeds); const res = {};
        for (const n of s.outputNames) { const t = outs[n]; const raw = t.location && t.location !== 'cpu' ? await t.getData() : t.data; res[n] = { data: raw, shape: [...t.dims], dtype: t.type }; }
        return res;
      },
      release: () => s.release(),
    };
  }

  /* ---------- LiteRT.js (.tflite) ---------- */
  litert() {
    return this._lrt ||= (async () => {
      const L = await import(/* @vite-ignore */ this.url('@litertjs/core', VERSIONS.litert, '+esm'));
      await L.loadLiteRt(this.url('@litertjs/core', VERSIONS.litert, 'wasm/'));
      return L;
    })().catch(e => { this._lrt = null; throw e; });
  }
  /**
   * Load a .tflite model (VFS path, URL or bytes).
   * @returns {Promise<{ accelerator: string, inputs: object[], outputs: object[], run: (inputs: any[]) => Promise<object[]>, delete: () => void }>}
   */
  async tflite(src, { accelerator } = {}) {
    const self = this; const L = await this.litert(); const bytes = await this.bytes(src);
    let gpu = false; try { gpu = !!(await L.isWebGPUSupported?.()); } catch {}
    let acc = accelerator || (gpu ? 'webgpu' : 'wasm'), note, model;
    try { model = await L.loadAndCompile(bytes, { accelerator: acc }); } catch (e) { if (acc === 'wasm') throw e; note = `${acc} failed (${e.message}); using wasm`; acc = 'wasm'; model = await L.loadAndCompile(bytes, { accelerator: 'wasm' }); }
    const dims = d => [...(d?.shape || d?.layout?.dimensions || d?.dimensions || [])];
    const det = ds => [...ds].map((d, i) => ({ index: i, name: d.name, shape: dims(d), dtype: d.dtype || d.type?.dtype }));
    const inputs = det(model.getInputDetails()), outputs = det(model.getOutputDetails());
    return {
      accelerator: acc, note, inputs, outputs, model,
      /** inputs: one per model input ({ data, shape?, dtype? }, nested arrays or a typed array). Returns [{ data, shape }] */
      async run(given) {
        const list = Array.isArray(given) && inputs.length > 1 ? given : (Array.isArray(given) && (Array.isArray(given[0]) || ArrayBuffer.isView(given[0]) || given[0]?.data) ? given : [given]);
        const ts = inputs.map((d, i) => { const [arr, shape] = self.tensorInput(list[i], d.dtype || 'float32'); return new L.Tensor(arr, list[i]?.shape || (d.shape.length ? d.shape : shape)); });
        let outs; try { outs = await model.run(ts); } finally { ts.forEach(t => { try { t.delete(); } catch {} }); }
        const res = [];
        for (const [i, t0] of (Array.isArray(outs) ? outs : Object.values(outs)).entries()) {
          let t = t0; if (acc !== 'wasm') { try { const c = await t.moveTo('wasm'); if (c && c !== t) t = c; } catch {} }
          res.push({ name: outputs[i]?.name, data: t.toTypedArray(), shape: [...(t.type?.layout?.dimensions || outputs[i]?.shape || [])] }); try { t.delete(); } catch {}
        }
        return res;
      },
      delete: () => model.delete(),
    };
  }
  async webgpu() { if (this._gpu == null) { try { this._gpu = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch { this._gpu = false; } } return this._gpu; }
}
