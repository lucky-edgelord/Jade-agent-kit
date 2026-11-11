// Transformers.js 4.3.2 (Hugging Face): models from the Hugging Face Hub running in the page, on WebGPU when the device
// has it, else WebAssembly. Downloaded from jsDelivr the first time it is used; models are cached by the browser.
//   const tf = await kit.use('transformers');
//   await tf.embed(['hello', 'world'])                         // [[…384 numbers], […]] (Xenova/all-MiniLM-L6-v2)
//   await tf.run('sentiment-analysis', 'I love it')            // any pipeline task, default or chosen model
//   await tf.run('automatic-speech-recognition', '/rec.wav', { model: 'Xenova/whisper-tiny.en' })
// Embedding models named "hf:<repo>" work everywhere the kit embeds: kit.embed(x, { model: 'hf:Xenova/all-MiniLM-L6-v2' }),
// kit.vectors.open(path, { model: 'hf:…' }), createKit({ memory: { embed: 'hf:…' } }).
export const VERSION = '4.3.2';
export const DEFAULT_EMBED = 'Xenova/all-MiniLM-L6-v2';
const MEDIA = /\.(png|jpe?g|gif|webp|bmp|wav|mp3|ogg|flac|m4a|webm|mp4)$/i;
const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', flac: 'audio/flac', m4a: 'audio/mp4', webm: 'audio/webm', mp4: 'video/mp4' };

export class Transformers {
  /**
   * @param {{ kit: object, cdn?: string, device?: 'auto'|'webgpu'|'wasm', dtype?: string, remote?: boolean, localPath?: string, onProgress?: (p) => void }} o
   *   device: where models run (auto: WebGPU if the device has it); dtype: e.g. 'q8', 'q4', 'fp16' (default: the model's)
   *   remote: download from the Hugging Face Hub (default true); localPath: serve models yourself from this URL path
   */
  constructor({ kit, cdn = kit?.config?.cdn || 'https://cdn.jsdelivr.net/npm/', device = 'auto', dtype, remote = true, localPath, onProgress } = {}) {
    Object.assign(this, { kit, cdn, deviceOpt: device, dtype, remote, localPath, onProgress });
    this._lib = null; this._pipes = new Map(); this._device = null;
  }
  /** the transformers.js module (its env, pipeline, AutoModel, …) */
  lib() {
    return (this._lib ||= import(/* @vite-ignore */ `${this.cdn}@huggingface/transformers@${VERSION}/+esm`).then(m => {
      m.env.allowRemoteModels = this.remote; m.env.allowLocalModels = !!this.localPath;
      if (this.localPath) m.env.localModelPath = this.localPath;
      return m;
    }, e => { this._lib = null; throw new Error(`could not load Transformers.js ${VERSION}: ${e.message}`); }));
  }
  /** where models run: 'webgpu' or 'wasm' */
  async device() {
    if (this._device) return this._device;
    if (this.deviceOpt !== 'auto') return (this._device = this.deviceOpt);
    let gpu = false; try { gpu = !!(await globalThis.navigator?.gpu?.requestAdapter()); } catch {}
    return (this._device = gpu ? 'webgpu' : 'wasm');
  }
  /** a pipeline (made once per task, model and options) */
  async pipeline(task, model, opts = {}) {
    const key = JSON.stringify([task, model || null, opts]);
    if (!this._pipes.has(key)) {
      const p = (async () => {
        const { pipeline } = await this.lib(); const device = opts.device || await this.device();
        const o = { device, ...(this.dtype && !opts.dtype ? { dtype: this.dtype } : {}), ...opts, ...(this.onProgress ? { progress_callback: this.onProgress } : {}) };
        try { return await pipeline(task, model || undefined, o); }
        catch (e) { if (device === 'webgpu' && !opts.device) return pipeline(task, model || undefined, { ...o, device: 'wasm' }); throw e; }
      })();
      this._pipes.set(key, p); p.catch(() => this._pipes.delete(key));
    }
    return this._pipes.get(key);
  }
  /** a file in the kit's file system → a blob URL the pipeline can read (images, audio) */
  _input(x) {
    const vfs = this.kit?.vfs;
    if (typeof x === 'string' && x.startsWith('/') && vfs?.isFile?.(x) && MEDIA.test(x)) {
      const type = TYPES[x.split('.').pop().toLowerCase()] || 'application/octet-stream';
      return URL.createObjectURL(new Blob([vfs.readBytes(x)], { type }));
    }
    return x;
  }
  /**
   * Run any pipeline task: text-classification, zero-shot-classification, token-classification, question-answering,
   * summarization, translation, text-generation, fill-mask, feature-extraction, image-classification, object-detection,
   * image-to-text, automatic-speech-recognition, … (inputs may be VFS paths for images and audio)
   */
  async run(task, input, { model, pipeline: popts, ...opts } = {}) {
    const pipe = await this.pipeline(task, model, popts);
    const inp = Array.isArray(input) ? input.map(x => this._input(x)) : this._input(input);
    try { const out = await pipe(inp, opts); return plain(out); }
    finally { for (const u of [].concat(inp)) if (typeof u === 'string' && u.startsWith('blob:')) URL.revokeObjectURL(u); }
  }
  /** embeddings for a text or a list of texts → number[] or number[][] (mean pooled, normalized) */
  async embed(input, { model = DEFAULT_EMBED, pooling = 'mean', normalize = true } = {}) {
    model = String(model).replace(/^hf:/, '');
    const one = !Array.isArray(input); const list = (one ? [input] : input).map(String); if (!list.length) return [];
    const pipe = await this.pipeline('feature-extraction', model); const out = [];
    for (let i = 0; i < list.length; i += 32) out.push(...(await pipe(list.slice(i, i + 32), { pooling, normalize })).tolist());
    return one ? out[0] : out;
  }
  /** free the models (and their GPU memory) */
  async dispose() { for (const p of this._pipes.values()) { try { await (await p).dispose?.(); } catch {} } this._pipes.clear(); }

  get toolDefs() {
    return { transformers: {
      description: 'Run a Hugging Face model in the browser with Transformers.js (downloaded once, then cached). Tasks: sentiment-analysis, zero-shot-classification (options.candidate_labels), summarization, translation, question-answering ({question, context}), fill-mask, token-classification, text-generation, image-classification, object-detection, image-to-text, automatic-speech-recognition (file paths for images and audio), feature-extraction. action "embed" returns embeddings.',
      parameters: { type: 'object', properties: {
        action: { type: 'string', enum: ['run', 'embed'], description: 'run a pipeline (default) or embed texts' },
        task: { type: 'string', description: 'pipeline task' }, model: { type: 'string', description: 'Hugging Face repo with ONNX weights, e.g. Xenova/distilbert-base-uncased-finetuned-sst-2-english (default: the task\'s default)' },
        input: { description: 'text, a list of texts, an object for question-answering, or a file path' }, options: { type: 'object', description: 'pipeline call options, e.g. { "candidate_labels": [...] }, { "max_new_tokens": 64 }, { "top_k": 3 }' },
      }, required: ['input'] },
      run: async a => {
        if (a.action === 'embed') { const v = await this.embed(a.input, a.model ? { model: a.model } : {}); const list = Array.isArray(v[0]) ? v : [v]; return `${list.length} embedding(s) of ${list[0]?.length ?? 0} dimensions: ${JSON.stringify(list.map(x => x.slice(0, 8).map(n => +n.toFixed(4))))}…`; }
        if (!a.task) throw new Error('task is required to run a pipeline');
        return JSON.stringify(await this.run(a.task, a.input, { model: a.model, ...(a.options || {}) }), null, 1).slice(0, 20000);
      },
    } };
  }
}
// results as plain data (tensors become arrays)
function plain(x) {
  if (x == null || typeof x !== 'object') return x;
  if (typeof x.tolist === 'function') return x.tolist();
  if (Array.isArray(x)) return x.map(plain);
  if (ArrayBuffer.isView(x)) return Array.from(x);
  const o = {}; for (const [k, v] of Object.entries(x)) o[k] = plain(v); return o;
}
