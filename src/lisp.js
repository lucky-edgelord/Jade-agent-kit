// Jade Lisp: a small Scheme/Clojure-style Lisp for DSLs and for scripting the kit's tools, from Jade Vault. The interpreter
// (assets/lisp/lisp.js, ~50 KB, fetched on first use) is copied into the file system at /.kit/tools/lisp.js with its library
// and examples (/.kit/lisp/) and a skill (/.kit/skills/lisp-dsl/), and runs in the JavaScript sandbox, where every tool is
// (tool/NAME …) and kit.ask / decide / agent / flow / shell / notify / kv are jade/… . A file whose seed marker line was
// deleted is the user's and is left alone.
import { assetUrl, fetchText } from './util.js';

export const FILES = { 'lisp.js': '/.kit/tools/lisp.js', 'lib/dsl.jl': '/.kit/lisp/lib/dsl.jl', 'examples/hello.jl': '/.kit/lisp/examples/hello.jl', 'examples/rules.jl': '/.kit/lisp/examples/rules.jl', 'examples/state-machine.jl': '/.kit/lisp/examples/state-machine.jl', 'examples/tools.jl': '/.kit/lisp/examples/tools.jl', 'examples/tflite.jl': '/.kit/lisp/examples/tflite.jl', 'skill/SKILL.md': '/.kit/skills/lisp-dsl/SKILL.md' };
const VER = 1;

export class Lisp {
  /** @param {{ kit: object, skill?: boolean }} o skill: also install the lisp-dsl skill (default true) */
  constructor({ kit, skill = true } = {}) { Object.assign(this, { kit, vfs: kit.vfs, skill }); this.path = FILES['lisp.js']; this._seeded = null; }
  /** copy the interpreter, library, examples (and skill) into the file system; force rewrites them */
  seed(force = false) {
    return this._seeded && !force ? this._seeded : (this._seeded = (async () => {
      let n = 0;
      for (const [src, dst] of Object.entries(FILES)) {
        if (!this.skill && src.startsWith('skill/')) continue;
        const cur = this.vfs.isFile(dst) ? this.vfs.read(dst) : '';
        if (cur && !force) { const m = /jade-lisp-seed v(\d+)/.exec(cur); if (!m || +m[1] >= VER) continue; }
        this.vfs.write(dst, await fetchText(assetUrl('lisp/' + src), 'Jade Lisp')); n++;
      }
      return n;
    })().catch(e => { this._seeded = null; throw e; }));
  }
  /**
   * Run Lisp code (or a file) → { output, code, value? }
   * @param {{ code?: string, file?: string, args?: string[], fuel?: number, pure?: boolean, timeoutMs?: number, signal?: AbortSignal }} o
   */
  async run({ code, file, args = [], fuel, pure, timeoutMs = 120000, signal } = {}) {
    await this.seed(); if (!this.vfs.isFile(this.path)) await this.seed(true);
    const argv = [this.path];
    if (file) { const p = this.vfs.norm(String(file)); if (!this.vfs.isFile(p)) throw new Error(`${p} is not a file`); argv.push(p, ...[].concat(args || []).map(String)); }
    else { const c = String(code ?? '').trim(); if (!c) throw new Error('lisp needs code (or a file)'); argv.push('eval', c); }
    if (fuel) argv.push('fuel=' + Math.max(1000, Math.min(2e9, +fuel | 0)));
    if (pure) argv.push('pure=yes');
    const r = await (await this.kit.use('js')).run(this.vfs.read(this.path), { argv, timeoutMs, signal });
    return { output: (r.stdout + r.stderr).replace(/\n$/, ''), code: r.code };
  }
  get toolDefs() {
    return { lisp: {
      description: 'Jade Lisp, a small Scheme/Clojure-style Lisp for DSLs and for scripting your tools ((tool/NAME :arg v), jade/ask, jade/decide, jade/flow, jade/shell, read-file, write-file, defmacro, sandboxes with fuel). Give code, or file (a .jl path) with args. pure: true turns off tools, files and JavaScript. The lisp-dsl skill and /.kit/lisp/examples show how.',
      parameters: { type: 'object', properties: { code: { type: 'string' }, file: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, fuel: { type: 'integer' }, pure: { type: 'boolean' } } },
      run: async (a, ctx) => { const r = await this.run({ ...a, signal: ctx?.signal }); return (r.output || '(no output)') + (r.code ? `\n[exit code ${r.code}]` : ''); },
    } };
  }
  plugin() { return { name: 'lisp', tools: ['lisp'] }; }
}
