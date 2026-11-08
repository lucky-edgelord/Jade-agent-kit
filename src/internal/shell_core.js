// A small POSIX-style shell over the VFS: pipes, redirects, && || ;, $VAR, $(cmd), globs.
// Commands run in BusyBox (WebAssembly) when it is loaded, with JavaScript versions of the common ones as a fallback.
// Extra commands (node, python, sqlite3, …) are added through `commands`. Adapted from Jade Vault.
import { enc, dec, sleep } from '../util.js';

/**
 * @param {{ vfs: import('./vfs.js').VFS, busybox: import('./busybox.js').BusyBox, engine?: 'auto'|'wasm'|'js', commands?: object }} env
 */
export function createShellEnv(env) {
  const vfs = env.vfs, bb = env.busybox;
  env.engine ||= 'auto'; env.commands ||= {};
  function tokenize(s) {
    const toks = []; let i = 0, w = null;
    const lit = (v, q) => { w ??= []; const l = w[w.length - 1]; if (l && l.t === 'lit' && l.q === q) l.v += v; else w.push({ t: 'lit', v, q }); };
    const end = () => { if (w) { toks.push({ t: 'w', segs: w }); w = null; } };
    const readVar = (q) => {
      const n = s[i + 1]; w ??= [];
      if (n === '(') { let d = 0, j = i + 1; for (; j < s.length; j++) { if (s[j] === '(') d++; else if (s[j] === ')') { d--; if (!d) break; } } if (j >= s.length) throw new Error('unterminated $('); w.push({ t: 'sub', v: s.slice(i + 2, j), q }); i = j + 1; return; }
      if (n === '{') { const j = s.indexOf('}', i); if (j < 0) throw new Error('bad substitution'); w.push({ t: 'var', v: s.slice(i + 2, j), q }); i = j + 1; return; }
      const m = /^([A-Za-z_]\w*|[?$#0-9])/.exec(s.slice(i + 1));
      if (m) { w.push({ t: 'var', v: m[1], q }); i += 1 + m[1].length; return; }
      lit('$', q); i++;
    };
    while (i < s.length) {
      const c = s[i];
      if (c === '\\') { if (s[i + 1] === '\n') { i += 2; continue; } lit(s[i + 1] ?? '', true); i += 2; continue; }
      if (c === "'") { const j = s.indexOf("'", i + 1); if (j < 0) throw new Error('unterminated quote'); w ??= []; lit(s.slice(i + 1, j), true); i = j + 1; continue; }
      if (c === '"') {
        i++; w ??= []; lit('', true);
        while (i < s.length && s[i] !== '"') {
          if (s[i] === '\\' && '"\\$`'.includes(s[i + 1])) { lit(s[i + 1], true); i += 2; }
          else if (s[i] === '$') readVar(true); else { lit(s[i], true); i++; }
        }
        if (s[i] !== '"') throw new Error('unterminated quote'); i++; continue;
      }
      if (c === '$') { readVar(false); continue; }
      if (c === ' ' || c === '\t' || c === '\r') { end(); i++; continue; }
      if (c === '\n') { end(); toks.push({ t: 'op', v: ';' }); i++; continue; }
      if (c === '#' && !w) { while (i < s.length && s[i] !== '\n') i++; continue; }
      const m = /^(2>&1|&>|2>>|2>|>>|>&2|1>|>|<|&&|\|\||\||;|&)/.exec(s.slice(i));
      if (m && !(w && m[1].startsWith('2'))) { end(); toks.push({ t: 'op', v: m[1] }); i += m[1].length; continue; }
      lit(c, false); i++;
    }
    end(); return toks;
  }
  function parse(toks) {
    const list = []; let pipeline = [], cmd = { words: [], redirs: [] };
    const endCmd = () => { if (cmd.words.length || cmd.redirs.length) pipeline.push(cmd); cmd = { words: [], redirs: [] }; };
    const endPipe = op => { endCmd(); if (pipeline.length) list.push({ pipeline, op }); else if (op === '&&' || op === '||') throw new Error(`syntax error near '${op}'`); pipeline = []; };
    for (let k = 0; k < toks.length; k++) {
      const t = toks[k];
      if (t.t === 'w') { cmd.words.push(t.segs); continue; }
      switch (t.v) {
        case '|': endCmd(); break;
        case '&&': case '||': case ';': case '&': endPipe(t.v === '&' ? ';' : t.v); break;
        case '2>&1': case '>&2': cmd.redirs.push({ op: t.v }); break;
        default: { const tgt = toks[++k]; if (!tgt || tgt.t !== 'w') throw new Error(`syntax error near '${t.v}'`); cmd.redirs.push({ op: t.v === '1>' ? '>' : t.v, target: tgt.segs }); }
      }
    }
    endPipe(';'); return list;
  }
  const GLOB_ESC = '\u0001';
  function globToRe(pat, { anchored = true } = {}) {
    let r = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === GLOB_ESC) { r += pat[++i].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); continue; }
      if (c === '*') r += '[^/]*'; else if (c === '?') r += '[^/]';
      else if (c === '[') { const j = pat.indexOf(']', i + 1); if (j > i) { let cls = pat.slice(i + 1, j); if (cls[0] === '!') cls = '^' + cls.slice(1); r += '[' + cls.replace(/\\/g, '\\\\') + ']'; i = j; } else r += '\\['; }
      else r += c.replace(/[.+^${}()|\\/\]]/g, '\\$&');
    }
    return new RegExp(anchored ? '^' + r + '$' : r);
  }

  class Shell {
    constructor({ cwd = '/', env = {}, onOutput = null } = {}) { this.cwd = cwd; this.env = { HOME: '/', USER: 'agent', SHELL: '/bin/sh', PATH: '/bin', ...env }; this.lastCode = 0; this.onOutput = onOutput; this.aborted = false; this.timeoutMs = 60000; }
    getVar(n) { if (n === '?') return String(this.lastCode); if (n === '$') return '1337'; if (n === '#') return '0'; if (n === '0') return 'sh'; if (n === 'PWD') return this.cwd; return this.env[n] ?? ''; }
    async expandWord(segs) {
      let s = '', glob = false;
      const escG = v => v.replace(/[*?[\]]/g, m => GLOB_ESC + m);
      for (const g of segs) {
        if (g.t === 'lit') { if (g.q) s += escG(g.v); else { s += g.v; if (/[*?[]/.test(g.v)) glob = true; } }
        else if (g.t === 'var') s += escG(this.getVar(g.v));
        else if (g.t === 'sub') { const r = await this.capture(g.v); s += escG(r.replace(/\n+$/, '')); }
      }
      if (glob) { const m = this.glob(s); if (m.length) return m; }
      return [s.replaceAll(GLOB_ESC, '')];
    }
    glob(pat) {
      const abs = pat.startsWith('/'); const absPat = vfs.norm(pat.replaceAll(GLOB_ESC, '\u0002'), this.cwd).replaceAll('\u0002', GLOB_ESC);
      const re = globToRe(absPat); const showDot = /(^|\/)\./.test(pat.replaceAll(GLOB_ESC, ''));
      const out = [];
      for (const p of vfs.nodes.keys()) { if (p === '/' || !re.test(p)) continue; if (!showDot && /\/\.[^/]*$/.test(p)) continue; out.push(p); }
      out.sort();
      if (abs) return out;
      const pre = this.cwd === '/' ? '/' : this.cwd + '/';
      return out.map(p => p.startsWith(pre) ? p.slice(pre.length) : p);
    }
    async capture(src) { const sub = new Shell({ cwd: this.cwd, env: { ...this.env } }); sub.aborted = this.aborted; sub.timeoutMs = this.timeoutMs; const r = await sub.run(src); return r.chunks.filter(c => !c.err).map(c => c.s).join(''); }
    /** run a script; returns {chunks:[{s,err}], code} */
    async run(src, { stdin = '' } = {}) {
      const chunks = []; const emit = (s, err = false) => { if (!s) return; chunks.push({ s, err }); this.onOutput?.(s, err); };
      let list;
      try { list = parse(tokenize(src)); } catch (e) { emit(`sh: ${e.message}\n`, true); this.lastCode = 2; return { chunks, code: 2 }; }
      let prevOp = ';';
      for (const item of list) {
        if (this.aborted) { emit('^C\n', true); this.lastCode = 130; break; }
        if ((prevOp === '&&' && this.lastCode !== 0) || (prevOp === '||' && this.lastCode === 0)) { prevOp = item.op; continue; }
        try { this.lastCode = await this.runPipeline(item.pipeline, stdin, emit); }
        catch (e) { if (e && e.__exit !== undefined) { this.lastCode = e.__exit; break; } emit(`sh: ${e.message}\n`, true); this.lastCode = 1; }
        prevOp = item.op;
      }
      return { chunks, code: this.lastCode };
    }
    async runPipeline(pipeline, stdin, emit) {
      let input = stdin, code = 0;
      for (let k = 0; k < pipeline.length; k++) {
        const cmd = pipeline[k]; const last = k === pipeline.length - 1;
        const argv = []; for (const w of cmd.words) argv.push(...await this.expandWord(w));
        let inp = k === 0 ? input : input;
        let outTo = null, errTo = null, mergeErr = false, outToErr = false;
        for (const r of cmd.redirs) {
          if (r.op === '2>&1') { mergeErr = true; continue; }
          if (r.op === '>&2') { outToErr = true; continue; }
          const t = (await this.expandWord(r.target))[0];
          const p = t === '/dev/null' ? null : vfs.norm(t, this.cwd);
          if (r.op === '<') { if (t === '/dev/null') inp = ''; else inp = vfs.read(p); }
          else if (r.op === '>' || r.op === '>>') outTo = { p, append: r.op === '>>', dn: t === '/dev/null' };
          else if (r.op === '2>' || r.op === '2>>') errTo = { p, append: r.op === '2>>', dn: t === '/dev/null' };
          else if (r.op === '&>') { outTo = { p, append: false, dn: t === '/dev/null' }; mergeErr = true; }
        }
        if (outTo && !outTo.dn) { if (outTo.append) { if (!vfs.exists(outTo.p)) vfs.write(outTo.p, '', { mkdirs: false }); } else vfs.write(outTo.p, '', { mkdirs: false }); }
        const r = await this.exec(argv, inp ?? '');
        let out = r.out || '', err = r.err || '';
        if (mergeErr) { out += err; err = ''; }
        if (outToErr) { err += out; out = ''; }
        if (errTo) { if (!errTo.dn) (errTo.append ? vfs.append(errTo.p, err) : vfs.write(errTo.p, err, { mkdirs: false })); err = ''; }
        if (outTo) { if (!outTo.dn) vfs.append(outTo.p, out); out = ''; }
        if (err) emit(err, true);
        if (last) emit(out); else input = out;
        code = r.code;
      }
      return code;
    }
    async exec(argv, stdin) {
      // VAR=value prefixes
      while (argv.length && /^[A-Za-z_]\w*=/.test(argv[0])) { const a = argv.shift(); const i = a.indexOf('='); this.env[a.slice(0, i)] = a.slice(i + 1); }
      if (!argv.length) return { out: '', err: '', code: 0 };
      let [name, ...args] = argv;
      if (name === 'busybox' && args.length && !args[0].startsWith('-')) { name = args.shift(); }
      const ctx = { argv: args, stdin, sh: this, outS: '', errS: '', o(s) { this.outS += s; }, e(s) { this.errS += s; }, P: p => vfs.norm(p, this.cwd), name };
      const fin = code => ({ out: ctx.outS, err: ctx.errS, code: code ?? 0 });
      try {
        if (BUILTINS[name]) return fin(await BUILTINS[name](ctx));
        if (env.commands[name]) return fin(await env.commands[name](ctx));
        const engine = env.engine;
        const useWasm = bb.ready && bb.applets.has(name) && engine !== 'js' && !JS_ONLY.has(name) && !env.commands[name];
        if (useWasm) {
          const r = await this.execWasm(name, args, stdin);
          // this BusyBox build trims some options (e.g. find -type): retry with the JS applet in auto mode
          if (r.code !== 0 && engine === 'auto' && APPLETS[name] && /unrecognized|invalid option|unknown option|not implemented/i.test(r.err)) return fin(await APPLETS[name](ctx));
          return r;
        }
        if (engine === 'wasm' && !JS_ONLY.has(name)) {
          if (!bb.ready) return { out: '', err: `sh: ${name}: BusyBox is not loaded${bb.error ? ' (' + bb.error + ')' : ''}\n`, code: 127 };
          return { out: '', err: `sh: ${name}: applet not found in this BusyBox build\n`, code: 127 };
        }
        if (env.commands[name]) return fin(await env.commands[name](ctx));
        if (APPLETS[name]) return fin(await APPLETS[name](ctx));
        if (bb.ready && bb.applets.has(name)) return await this.execWasm(name, args, stdin);
        if (vfs.isFile(vfs.norm(name, this.cwd)) && /\.(sh)$/.test(name)) return fin(await BUILTINS.sh({ ...ctx, argv: [name, ...args] }));
        return { out: '', err: `sh: ${name}: not found\n`, code: 127 };
      } catch (e) {
        if (e && e.__exit !== undefined) throw e;
        return { out: ctx.outS, err: ctx.errS + `${name}: ${e.message}\n`, code: 1 };
      }
    }
    async execWasm(name, args, stdin) {
      const r = await bb.exec(name, args, { stdin, cwd: this.cwd, timeoutMs: this.timeoutMs });
      return { out: r.stdout, err: r.stderr, code: r.code };
    }
  }

  /* ---------- helpers for applets ---------- */
  function opts(args, spec = '') {
    const takes = new Set([...spec.matchAll(/(\w):/g)].map(m => m[1])); const f = {}; const rest = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--') { rest.push(...args.slice(i + 1)); break; }
      if (/^-\d+$/.test(a) && takes.has('n')) { f.n = a.slice(1); continue; }
      if (a.startsWith('--') && a.length > 2) { const [k, v] = a.slice(2).split('='); f[k] = v ?? true; continue; }
      if (a.startsWith('-') && a.length > 1) { for (let j = 1; j < a.length; j++) { const ch = a[j]; if (takes.has(ch)) { f[ch] = a.slice(j + 1) || args[++i]; break; } f[ch] = true; } continue; }
      rest.push(a);
    }
    return { f, rest };
  }
  function inputs(c, files) {
    if (!files.length) return [{ name: '-', text: c.stdin }];
    return files.map(fn => { if (fn === '-') return { name: '-', text: c.stdin }; try { return { name: fn, text: vfs.read(c.P(fn)) }; } catch (e) { c.e(`${c.name}: ${e.message}\n`); return null; } }).filter(Boolean);
  }
  const splitLines = t => { if (!t) return []; const l = t.split('\n'); if (l[l.length - 1] === '') l.pop(); return l; };
  function breToJs(p) { // POSIX basic regex → JS
    let r = ''; for (let i = 0; i < p.length; i++) { const c = p[i];
      if (c === '\\' && i + 1 < p.length) { const n = p[++i]; if ('(){}|+?'.includes(n)) r += n; else r += '\\' + n; }
      else if ('(){}|+?'.includes(c)) r += '\\' + c; else r += c; }
    return r;
  }
  const fmtSize = n => n < 1024 ? n + '' : n < 1048576 ? (n / 1024).toFixed(1) + 'K' : (n / 1048576).toFixed(1) + 'M';
  const MON = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  const fmtDate = t => { const d = new Date(t); return `${MON[d.getMonth()]} ${String(d.getDate()).padStart(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* ---------- builtins (always JS) ---------- */
  const JS_ONLY = new Set(['node', 'js', 'python', 'python3', 'sqlite3', 'help', 'sh', 'bash', 'xargs']);
  const BUILTINS = {
    cd(c) { const t = c.P(c.argv[0] ?? '/'); if (!vfs.isDir(t)) { c.e(`cd: ${c.argv[0]}: No such directory\n`); return 1; } c.sh.cwd = t; return 0; },
    pwd(c) { c.o(c.sh.cwd + '\n'); return 0; },
    export(c) { for (const a of c.argv) { const i = a.indexOf('='); if (i > 0) c.sh.env[a.slice(0, i)] = a.slice(i + 1); } return 0; },
    unset(c) { for (const a of c.argv) delete c.sh.env[a]; return 0; },
    exit(c) { throw { __exit: parseInt(c.argv[0] ?? '0') || 0 }; },
    true: () => 0, false: () => 1, ':': () => 0,
    async sh(c) {
      const { f, rest } = opts(c.argv, 'c:');
      const sub = new Shell({ cwd: c.sh.cwd, env: { ...c.sh.env } }); sub.timeoutMs = c.sh.timeoutMs;
      let src = f.c; if (src == null) { if (!rest.length) { src = c.stdin; } else src = vfs.read(c.P(rest[0])); }
      const r = await sub.run(src);
      for (const ch of r.chunks) ch.err ? c.e(ch.s) : c.o(ch.s);
      return r.code;
    },
    get bash() { return this.sh; },
    source(c) { return BUILTINS.sh(c); },
    which(c) { let code = 0; for (const a of c.argv) { if (BUILTINS[a] || APPLETS[a] || env.commands[a] || bb.applets.has(a)) c.o(`/bin/${a}\n`); else code = 1; } return code; },
    type(c) { for (const a of c.argv) c.o(BUILTINS[a] ? `${a} is a shell builtin\n` : (bb.applets.has(a) && env.engine !== 'js') ? `${a} is /bin/${a} (busybox.wasm)\n` : APPLETS[a] ? `${a} is /bin/${a} (js applet)\n` : `${a}: not found\n`); return 0; },
    help(c) {
      const names = new Set([...Object.keys(BUILTINS), ...Object.keys(APPLETS), ...Object.keys(env.commands), ...bb.applets]);
      c.o(`Jade Agent Kit shell — ${bb.ready ? `BusyBox WASM (${bb.applets.size} applets) + JS` : 'JS applets'}\n` +
          `Supports: pipes |, redirects > >> < 2> 2>&1 &>, && || ;, $VAR, $(cmd), globs * ? [..]\n` +
          `No loops/if blocks: use node or python for scripting. Extra: ${Object.keys(env.commands).sort().join(', ')}, xargs.\n\n` +
          [...names].sort().join('  ') + '\n'); return 0;
    },
    async xargs(c) {
      const { f, rest } = opts(c.argv, 'n:I:');
      const items = c.stdin.split(/\s+/).filter(Boolean); const cmd = rest.length ? rest : ['echo'];
      const runOne = async argv => { const r = await c.sh.exec([...argv], ''); c.o(r.out); c.e(r.err); return r.code; };
      let code = 0;
      if (f.I) { for (const it of c.stdin.split('\n').filter(Boolean)) code = (await runOne(cmd.map(a => a.replaceAll(f.I, it)))) || code; }
      else { const n = parseInt(f.n) || items.length || 1; for (let i = 0; i < Math.max(items.length, 1); i += n) code = (await runOne([...cmd, ...items.slice(i, i + n)])) || code; }
      return code;
    },
  };

  /* ---------- JS applets (fallback when BusyBox WASM isn't loaded) ---------- */
  const APPLETS = {
    echo(c) { let a = c.argv, nl = true, esc_ = false; while (a.length && /^-[neE]+$/.test(a[0])) { if (a[0].includes('n')) nl = false; if (a[0].includes('e')) esc_ = true; a = a.slice(1); } let s = a.join(' '); if (esc_) s = s.replace(/\\(n|t|\\|e|r)/g, (m, x) => ({ n: '\n', t: '\t', '\\': '\\', e: '\x1b', r: '\r' }[x])); c.o(s + (nl ? '\n' : '')); return 0; },
    printf(c) { const [fmt = '', ...args] = c.argv; let i = 0; const s = fmt.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/%(-?\d*)([sdif%])/g, (m, w, t) => { if (t === '%') return '%'; let v = args[i++] ?? ''; if (t === 'd' || t === 'i') v = String(parseInt(v) || 0); else if (t === 'f') v = String(parseFloat(v) || 0); const n = parseInt(w); return isNaN(n) ? v : n < 0 ? v.padEnd(-n) : v.padStart(n); }); c.o(s); return 0; },
    cat(c) { const { f, rest } = opts(c.argv); let n = 1; for (const x of inputs(c, rest)) { if (f.n) c.o(splitLines(x.text).map(l => `${String(n++).padStart(6)}\t${l}`).join('\n') + '\n'); else c.o(x.text); } return c.errS ? 1 : 0; },
    ls(c) {
      const { f, rest } = opts(c.argv); const targets = rest.length ? rest : ['.']; let code = 0; const multi = targets.length > 1 || f.R;
      const line = (p, name) => { const st = vfs.stat(p); return f.l ? `${st.dir ? 'drwxr-xr-x' : '-rw-r--r--'} 1 agent agent ${(f.h ? fmtSize(st.size) : String(st.size)).padStart(7)} ${fmtDate(st.mtime)} ${name}${st.dir && f.F !== false ? '/' : ''}` : name + (st.dir ? '/' : ''); };
      const doDir = (p, label) => {
        let names = vfs.list(p); if (!f.a && !f.A) names = names.filter(n => !n.startsWith('.'));
        if (f.t) names.sort((a, b) => vfs.stat(vfs.norm(b, p)).mtime - vfs.stat(vfs.norm(a, p)).mtime);
        if (f.r) names.reverse();
        if (multi) c.o(`${label}:\n`);
        if (f.l) c.o(`total ${names.length}\n`);
        for (const n of names) c.o(line(vfs.norm(n, p), n) + '\n');
        if (f.R) for (const n of names) { const q = vfs.norm(n, p); if (vfs.isDir(q)) { c.o('\n'); doDir(q, label === '.' ? './' + n : label.replace(/\/$/, '') + '/' + n); } }
      };
      for (const t of targets) { const p = c.P(t); if (!vfs.exists(p)) { c.e(`ls: ${t}: No such file or directory\n`); code = 1; continue; } if (vfs.isDir(p) && !f.d) doDir(p, t); else c.o(line(p, t) + '\n'); if (multi && !f.R) c.o('\n'); }
      return code;
    },
    mkdir(c) { const { f, rest } = opts(c.argv); for (const d of rest) f.p ? vfs.mkdirp(c.P(d)) : vfs.mkdir(c.P(d)); return 0; },
    rmdir(c) { for (const d of c.argv) vfs.rm(c.P(d), false); return 0; },
    rm(c) { const { f, rest } = opts(c.argv); let code = 0; for (const x of rest) { const p = c.P(x); if (!vfs.exists(p)) { if (!f.f) { c.e(`rm: ${x}: No such file or directory\n`); code = 1; } continue; } if (vfs.isDir(p) && !(f.r || f.R)) { c.e(`rm: ${x}: is a directory\n`); code = 1; continue; } vfs.rm(p, true); } return code; },
    touch(c) { for (const x of opts(c.argv).rest) { const p = c.P(x); if (vfs.isFile(p)) vfs.touch(p); else vfs.write(p, '', { mkdirs: false }); } return 0; },
    mv(c) { const { rest } = opts(c.argv); const dst = c.P(rest.pop()); if (rest.length > 1 && !vfs.isDir(dst)) throw new Error(`target '${dst}' is not a directory`); for (const s of rest) vfs.move(c.P(s), dst); return 0; },
    cp(c) { const { f, rest } = opts(c.argv); const dst = c.P(rest.pop()); for (const s of rest) vfs.copy(c.P(s), dst, f.r || f.R || f.a); return 0; },
    head(c) { const { f, rest } = opts(c.argv, 'n:c:'); for (const x of inputs(c, rest)) { if (f.c) c.o(x.text.slice(0, +f.c)); else { const n = +(f.n ?? 10); const L = splitLines(x.text); c.o((n < 0 ? L.slice(0, n) : L.slice(0, n)).map(l => l + '\n').join('')); } } return 0; },
    tail(c) { const { f, rest } = opts(c.argv, 'n:c:'); for (const x of inputs(c, rest)) { if (f.c) c.o(x.text.slice(-f.c)); else { const L = splitLines(x.text); const s = String(f.n ?? 10); c.o((s.startsWith('+') ? L.slice(+s.slice(1) - 1) : L.slice(-Math.abs(+s) || L.length)).map(l => l + '\n').join('')); } } return 0; },
    wc(c) { const { f, rest } = opts(c.argv); const all = !f.l && !f.w && !f.c && !f.m; let T = [0, 0, 0]; const ins = inputs(c, rest);
      const row = (a, n) => [f.l || all ? a[0] : null, f.w || all ? a[1] : null, f.c || f.m || all ? a[2] : null].filter(v => v != null).map(v => String(v).padStart(7)).join(' ') + (n !== '-' ? ' ' + n : '') + '\n';
      for (const x of ins) { const a = [(x.text.match(/\n/g) || []).length, (x.text.match(/\S+/g) || []).length, enc.encode(x.text).length]; T = T.map((v, i) => v + a[i]); c.o(row(a, x.name)); }
      if (ins.length > 1) c.o(row(T, 'total')); return 0; },
    grep(c) {
      const { f, rest } = opts(c.argv, 'e:m:A:B:C:'); let pat = f.e ?? rest.shift(); if (pat == null) { c.e('usage: grep [-inrvlcEFwoq] PATTERN [FILE...]\n'); return 2; }
      let src = f.F ? pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : (f.E || f.P ? pat : breToJs(pat)); if (f.w) src = `\\b(?:${src})\\b`; if (f.x) src = `^(?:${src})$`;
      const re = new RegExp(src, f.i ? 'i' : ''); const reG = new RegExp(src, f.i ? 'gi' : 'g');
      let files = rest; const rec = f.r || f.R; if (rec && !files.length) files = ['.'];
      let list = [];
      for (const fn of files) { const p = c.P(fn); if (vfs.isDir(p)) { if (!rec) { c.e(`grep: ${fn}: Is a directory\n`); continue; } for (const q of vfs.walk(p)) if (vfs.isFile(q) && !/\/(node_modules|\.git)\//.test(q)) list.push({ name: fn === '.' ? q.slice(c.sh.cwd === '/' ? 1 : c.sh.cwd.length + 1) : (fn.replace(/\/$/, '') + q.slice(p.length)), p: q }); } else list.push({ name: fn, p }); }
      const ins = files.length ? list.map(x => { try { return { name: x.name, text: vfs.read(x.p) }; } catch (e) { c.e(`grep: ${e.message}\n`); return null; } }).filter(Boolean) : [{ name: '-', text: c.stdin }];
      const showName = (ins.length > 1 || rec) && !f.h; let any = false; const max = f.m ? +f.m : Infinity;
      for (const x of ins) { let cnt = 0; const L = splitLines(x.text);
        for (let i = 0; i < L.length && cnt < max; i++) { const hit = re.test(L[i]) !== !!f.v; if (!hit) continue; cnt++; any = true; if (f.q) return 0; if (f.l || f.c) continue;
          const pre = (showName ? x.name + ':' : '') + (f.n ? (i + 1) + ':' : '');
          if (f.o) { for (const m of L[i].matchAll(reG)) c.o(pre + m[0] + '\n'); } else c.o(pre + L[i] + '\n'); }
        if (f.l && cnt) c.o(x.name + '\n'); if (f.c) c.o((showName ? x.name + ':' : '') + cnt + '\n'); }
      return any ? 0 : 1;
    },
    find(c) {
      const a = [...c.argv]; const paths = []; while (a.length && !a[0].startsWith('-') && a[0] !== '(' && a[0] !== '!') paths.push(a.shift()); if (!paths.length) paths.push('.');
      const tests = []; let maxd = Infinity, mind = 0, neg = false;
      while (a.length) { const t = a.shift();
        if (t === '!' || t === '-not') { neg = true; continue; }
        const push = fn => { const n = neg; tests.push(n ? (p, b) => !fn(p, b) : fn); neg = false; };
        if (t === '-name') { const r = globToRe(a.shift()); push((p, b) => r.test(b)); }
        else if (t === '-iname') { const r = new RegExp(globToRe(a.shift()).source, 'i'); push((p, b) => r.test(b)); }
        else if (t === '-path' || t === '-wholename') { const g = a.shift(); const r = new RegExp(globToRe(g).source.replace(/\[\^\/\]\*/g, '.*')); push((p, b, disp) => r.test(disp)); }
        else if (t === '-type') { const ty = a.shift(); push(p => ty === 'd' ? vfs.isDir(p) : vfs.isFile(p)); }
        else if (t === '-maxdepth') maxd = +a.shift(); else if (t === '-mindepth') mind = +a.shift();
        else if (t === '-size') { const s = a.shift(); const m = /^([+-]?)(\d+)([ckM]?)$/.exec(s); const mul = { c: 1, k: 1024, M: 1048576, '': 512 }[m[3]]; const n = +m[2] * mul; push(p => { if (!vfs.isFile(p)) return false; const z = vfs.stat(p).size; return m[1] === '+' ? z > n : m[1] === '-' ? z < n : z === n; }); }
        else if (t === '-empty') push(p => vfs.isDir(p) ? vfs.list(p).length === 0 : vfs.stat(p).size === 0);
        else if (t === '-print' || t === '-o' || t === '-a') {}
        else { c.e(`find: unsupported option ${t} \n`); return 1; }
      }
      for (const root of paths) { const p0 = c.P(root); if (!vfs.exists(p0)) { c.e(`find: ${root}: No such file or directory\n`); continue; }
        for (const p of vfs.walk(p0)) { const rel = p === p0 ? '' : p.slice(p0 === '/' ? 1 : p0.length + 1); const depth = rel ? rel.split('/').length : 0; if (depth > maxd || depth < mind) continue; if (/\/(node_modules|\.git)(\/|$)/.test(rel) && !root.includes('node_modules')) continue;
          const disp = rel ? (root === '/' ? '/' + rel : root.replace(/\/$/, '') + '/' + rel) : root; if (tests.every(fn => fn(p, vfs.base(p), disp))) c.o(disp + '\n'); } }
      return 0;
    },
    tree(c) { const { f, rest } = opts(c.argv, 'L:'); const root = c.P(rest[0] || '.'); let nd = 0, nf = 0; const max = f.L ? +f.L : Infinity; c.o((rest[0] || '.') + '\n');
      const rec = (p, pre, d) => { if (d > max) return; const names = vfs.list(p).filter(n => f.a || !n.startsWith('.')); names.forEach((n, i) => { const q = vfs.norm(n, p); const lastOne = i === names.length - 1; const dir = vfs.isDir(q); dir ? nd++ : nf++; c.o(pre + (lastOne ? '└── ' : '├── ') + n + (dir ? '/' : '') + '\n'); if (dir) rec(q, pre + (lastOne ? '    ' : '│   '), d + 1); }); };
      rec(root, '', 1); c.o(`\n${nd} directories, ${nf} files\n`); return 0; },
    sort(c) { const { f, rest } = opts(c.argv, 'k:t:'); let L = inputs(c, rest).flatMap(x => splitLines(x.text)); const key = l => { if (!f.k) return l; const fs = f.t ? l.split(f.t) : l.trim().split(/\s+/); return fs.slice(parseInt(f.k) - 1).join(' '); };
      L.sort((a, b) => f.n ? (parseFloat(key(a)) || 0) - (parseFloat(key(b)) || 0) : (f.f ? key(a).toLowerCase().localeCompare(key(b).toLowerCase()) : key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0)); if (f.r) L.reverse(); if (f.u) L = L.filter((l, i) => i === 0 || l !== L[i - 1]); c.o(L.map(l => l + '\n').join('')); return 0; },
    uniq(c) { const { f, rest } = opts(c.argv); const L = inputs(c, rest).flatMap(x => splitLines(x.text)); const g = []; for (const l of L) { if (g.length && g[g.length - 1][0] === l) g[g.length - 1][1]++; else g.push([l, 1]); }
      for (const [l, n] of g) { if (f.d && n < 2) continue; if (f.u && n > 1) continue; c.o((f.c ? String(n).padStart(7) + ' ' : '') + l + '\n'); } return 0; },
    cut(c) { const { f, rest } = opts(c.argv, 'd:f:c:'); const rng = s => s.split(',').flatMap(r => { const [a, b] = r.split('-'); const lo = a ? +a : 1, hi = r.includes('-') ? (b ? +b : 1e9) : lo; const o = []; for (let i = lo; i <= Math.min(hi, 1000); i++) o.push(i); return o; });
      for (const l of inputs(c, rest).flatMap(x => splitLines(x.text))) { if (f.c) { const ix = rng(f.c); c.o(ix.map(i => l[i - 1] ?? '').join('') + '\n'); } else { const d = f.d ?? '\t'; const parts = l.split(d); if (parts.length === 1 && !l.includes(d)) { c.o(l + '\n'); continue; } c.o(rng(f.f || '1').filter(i => i <= parts.length).map(i => parts[i - 1]).join(d) + '\n'); } } return 0; },
    tr(c) { const { f, rest } = opts(c.argv); const exp = s => { s = s.replace(/\[:upper:\]/g, 'A-Z').replace(/\[:lower:\]/g, 'a-z').replace(/\[:digit:\]/g, '0-9').replace(/\[:space:\]/g, ' \t\n').replace(/\\n/g, '\n').replace(/\\t/g, '\t'); let o = ''; for (let i = 0; i < s.length; i++) { if (s[i + 1] === '-' && s[i + 2]) { for (let k = s.charCodeAt(i); k <= s.charCodeAt(i + 2); k++) o += String.fromCharCode(k); i += 2; } else o += s[i]; } return o; };
      const a = exp(rest[0] || ''), b = exp(rest[1] || ''); let out = '';
      for (const ch of c.stdin) { const i = a.indexOf(ch); if (f.d) { if (i < 0) out += ch; } else if (i >= 0 && b) out += b[Math.min(i, b.length - 1)]; else out += ch; }
      if (f.s) out = out.replace(new RegExp(`([${(b || a).replace(/[\]\\^-]/g, '\\$&')}])\\1+`, 'g'), '$1'); c.o(out); return 0; },
    sed(c) {
      const scripts = []; const files = []; let n = false, inplace = false, ere = false; const a = c.argv;
      for (let i = 0; i < a.length; i++) { const x = a[i]; if (x === '-n') n = true; else if (x === '-i' || x.startsWith('-i')) inplace = true; else if (x === '-E' || x === '-r') ere = true; else if (x === '-e') scripts.push(a[++i]); else if (x.startsWith('-') && x.length > 1 && /^-[nEr]+$/.test(x)) { if (x.includes('n')) n = true; if (/[Er]/.test(x)) ere = true; } else if (!scripts.length && !files.length && !a.slice(0, i).includes('-e')) scripts.push(x); else files.push(x); }
      const toRe = (p, fl = '') => new RegExp(ere ? p : breToJs(p), fl);
      const cmds = []; const src = scripts.join('\n'); let i = 0;
      const readDelim = d => { let o = ''; while (i < src.length && src[i] !== d) { if (src[i] === '\\' && src[i + 1] === d) { o += d; i += 2; continue; } if (src[i] === '\\' && src[i + 1] === 'n' && d !== 'n') { o += '\\n'; i += 2; continue; } o += src[i++]; } i++; return o; };
      const readAddr = () => { if (src[i] === '/') { i++; return { re: toRe(readDelim('/')) }; } if (src[i] === '$') { i++; return { last: true }; } const m = /^\d+/.exec(src.slice(i)); if (m) { i += m[0].length; return { n: +m[0] }; } return null; };
      while (i < src.length) { while (/[\s;]/.test(src[i] || '')) i++; if (i >= src.length) break;
        const a1 = readAddr(); let a2 = null; if (a1 && src[i] === ',') { i++; a2 = readAddr(); } while (src[i] === ' ') i++; let bang = false; if (src[i] === '!') { bang = true; i++; }
        const op = src[i++]; const cmd = { a1, a2, bang, op, on: false };
        if (op === 's') { const d = src[i++]; const re = readDelim(d); let rep = readDelim(d); let fl = ''; while (/[gipI0-9]/.test(src[i] || '')) fl += src[i++]; cmd.re = toRe(re, (fl.includes('g') ? 'g' : '') + (/[iI]/.test(fl) ? 'i' : '')); cmd.rep = rep.replace(/\$/g, '$$$$').replace(/\\(\d)/g, '$$$1').replace(/(^|[^\\])&/g, '$1$$&').replace(/\\&/g, '&').replace(/\\n/g, '\n'); cmd.p = fl.includes('p'); }
        else if (op === 'a' || op === 'i' || op === 'c') { while (src[i] === ' ' || src[i] === '\\') i++; let t = ''; while (i < src.length && src[i] !== '\n' && src[i] !== ';') t += src[i++]; cmd.text = t; }
        else if (!'dpq='.includes(op)) { c.e(`sed: unsupported command '${op}' (BusyBox WASM sed supports it)\n`); return 1; }
        cmds.push(cmd); }
      const run = text => { const L = splitLines(text); let out = ''; for (let ln = 0; ln < L.length; ln++) { let line = L[ln]; let del = false, quit = false; const isLast = ln === L.length - 1; let pre = '', post = '';
          for (const cm of cmds) { const m1 = ad => ad && (ad.n ? ad.n === ln + 1 : ad.last ? isLast : ad.re.test(line)); let hit;
            if (!cm.a1) hit = true; else if (!cm.a2) hit = m1(cm.a1); else { if (!cm.on && m1(cm.a1)) { cm.on = true; hit = true; if (cm.a2.n && cm.a2.n <= ln + 1) cm.on = false; } else if (cm.on) { hit = true; if (m1(cm.a2)) cm.on = false; } else hit = false; }
            if (cm.bang) hit = !hit; if (!hit) continue;
            if (cm.op === 's') { cm.re.lastIndex = 0; const nl = line.replace(cm.re, cm.rep); if (nl !== line || cm.re.test(line)) { line = nl; if (cm.p) out += line + '\n'; } }
            else if (cm.op === 'd') { del = true; break; } else if (cm.op === 'p') out += line + '\n'; else if (cm.op === 'q') { quit = true; break; } else if (cm.op === '=') out += (ln + 1) + '\n';
            else if (cm.op === 'a') post += cm.text + '\n'; else if (cm.op === 'i') pre += cm.text + '\n'; else if (cm.op === 'c') { line = cm.text; } }
          out += pre; if (!del && !n) out += line + '\n'; out += post; if (quit) break; }
        return out; };
      if (inplace) { for (const fn of files) { const p = c.P(fn); vfs.write(p, run(vfs.read(p))); } return 0; }
      for (const x of inputs(c, files)) c.o(run(x.text)); return 0;
    },
    awk(c) { // tiny awk: [-F sep] '[/re/]{ print $1, $2 }' — load BusyBox for real awk
      const { f, rest } = opts(c.argv, 'F:'); const prog = rest.shift() || ''; const m = /^\s*(?:\/(.*)\/)?\s*(?:\{\s*print\s*([^}]*)\})?\s*$/.exec(prog);
      if (!m) { c.e('awk: only "[/re/] { print ... }" is supported by the JS fallback; BusyBox WASM provides full awk\n'); return 2; }
      const re = m[1] ? new RegExp(m[1]) : null; const exprs = (m[2] ?? '$0').split(',').map(s => s.trim()).filter(Boolean); let NR = 0;
      for (const l of inputs(c, rest).flatMap(x => splitLines(x.text))) { NR++; if (re && !re.test(l)) continue; const F = f.F ? l.split(f.F === '\\t' ? '\t' : f.F) : l.trim().split(/\s+/);
        c.o((exprs.length ? exprs : ['$0']).map(e => e.split(/\s+/).map(t => t === '$0' ? l : /^\$\d+$/.test(t) ? (F[+t.slice(1) - 1] ?? '') : t === 'NR' ? NR : t === 'NF' ? F.length : t === '$NF' ? F[F.length - 1] : t.replace(/^"|"$/g, '')).join('')).join(' ') + '\n'); }
      return 0; },
    tee(c) { const { f, rest } = opts(c.argv); for (const fn of rest) f.a ? vfs.append(c.P(fn), c.stdin) : vfs.write(c.P(fn), c.stdin); c.o(c.stdin); return 0; },
    seq(c) { const n = c.argv.map(Number); const [a, s, b] = n.length === 1 ? [1, 1, n[0]] : n.length === 2 ? [n[0], 1, n[1]] : n; for (let i = a; s > 0 ? i <= b : i >= b; i += s) c.o(i + '\n'); return 0; },
    async sleep(c) { await sleep(Math.min(parseFloat(c.argv[0]) * 1000 || 0, 30000)); return 0; },
    date(c) { const d = new Date(); c.o((c.argv[0] === '-I' || c.argv[0] === '--iso-8601') ? d.toISOString().slice(0, 10) + '\n' : c.argv[0] === '+%s' ? Math.floor(d / 1000) + '\n' : d.toString() + '\n'); return 0; },
    env(c) { for (const [k, v] of Object.entries(c.sh.env)) c.o(`${k}=${v}\n`); return 0; },
    basename(c) { let b = vfs.base(vfs.norm(c.argv[0] || '')); if (c.argv[1] && b.endsWith(c.argv[1])) b = b.slice(0, -c.argv[1].length); c.o(b + '\n'); return 0; },
    dirname(c) { const p = c.argv[0] || '.'; const i = p.replace(/\/$/, '').lastIndexOf('/'); c.o((i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i)) + '\n'); return 0; },
    realpath(c) { for (const a of c.argv) c.o(c.P(a) + '\n'); return 0; },
    stat(c) { for (const a of c.argv) { const s = vfs.stat(c.P(a)); c.o(`  File: ${a}\n  Size: ${s.size}\tType: ${s.dir ? 'directory' : 'regular file'}\nModify: ${new Date(s.mtime).toISOString()}\n`); } return 0; },
    du(c) { const { f, rest } = opts(c.argv); for (const a of rest.length ? rest : ['.']) { let t = 0; for (const q of vfs.walk(c.P(a))) if (vfs.isFile(q)) t += vfs.stat(q).size; c.o(`${f.h ? fmtSize(t) : Math.ceil(t / 1024)}\t${a}\n`); } return 0; },
    base64(c) { const { f, rest } = opts(c.argv); const t = inputs(c, rest)[0]?.text ?? ''; if (f.d) c.o(dec.decode(Uint8Array.from(atob(t.replace(/\s/g, '')), ch => ch.charCodeAt(0)))); else { let b = ''; for (const x of enc.encode(t)) b += String.fromCharCode(x); c.o(btoa(b).replace(/.{76}/g, '$&\n') + '\n'); } return 0; },
    rev(c) { for (const l of inputs(c, c.argv).flatMap(x => splitLines(x.text))) c.o([...l].reverse().join('') + '\n'); return 0; },
    nl(c) { let n = 1; for (const l of inputs(c, c.argv).flatMap(x => splitLines(x.text))) c.o(l.trim() ? `${String(n++).padStart(6)}\t${l}\n` : '\n'); return 0; },
    test(c) { let a = [...c.argv]; if (c.name === '[') { if (a.pop() !== ']') { c.e('[: missing ]\n'); return 2; } } let neg = false; if (a[0] === '!') { neg = true; a.shift(); }
      let r; const [x, y, z] = a; if (a.length === 0) r = false; else if (a.length === 1) r = x !== ''; else if (a.length === 2) { const p = c.P(y); r = { '-f': vfs.isFile(p), '-d': vfs.isDir(p), '-e': vfs.exists(p), '-s': vfs.isFile(p) && vfs.stat(p).size > 0, '-z': y === '', '-n': y !== '', '-r': vfs.exists(p), '-w': vfs.exists(p), '-x': false }[x] ?? false; }
      else r = { '=': x === z, '==': x === z, '!=': x !== z, '-eq': +x === +z, '-ne': +x !== +z, '-lt': +x < +z, '-le': +x <= +z, '-gt': +x > +z, '-ge': +x >= +z }[y] ?? false;
      return (neg ? !r : r) ? 0 : 1; },
    get '['() { return this.test; },
    yes(c) { c.o(((c.argv[0] ?? 'y') + '\n').repeat(100)); return 0; },
    whoami(c) { c.o((c.sh.env.USER || 'agent') + '\n'); return 0; },
    uname(c) { c.o(c.argv.includes('-a') ? `JadeAgentKit browser 1.0 ${navigator.platform || 'web'} wasm32\n` : 'JadeAgentKit\n'); return 0; },
    async sha256sum(c) { for (const x of inputs(c, c.argv)) { const h = await crypto.subtle.digest('SHA-256', enc.encode(x.text)); c.o([...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('') + '  ' + x.name + '\n'); } return 0; },
    diff(c) { const { f, rest } = opts(c.argv); if (rest.length < 2) { c.e('usage: diff [-u] FILE1 FILE2\n'); return 2; }
      const A = splitLines(vfs.read(c.P(rest[0]))), B = splitLines(vfs.read(c.P(rest[1]))); if (A.join('\n') === B.join('\n')) return 0;
      if (A.length * B.length > 4e6) { c.o(`Files ${rest[0]} and ${rest[1]} differ\n`); return 1; }
      c.o(`--- ${rest[0]}\n+++ ${rest[1]}\n` + unifiedDiff(A, B)); return 1; },
  };
  function unifiedDiff(A, B, ctx = 3) {
    const n = A.length, m = B.length; const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n || j < m) { if (i < n && j < m && A[i] === B[j]) { ops.push([' ', A[i], i, j]); i++; j++; } else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { ops.push(['-', A[i], i, j]); i++; } else { ops.push(['+', B[j], i, j]); j++; } }
    let out = ''; let k = 0;
    while (k < ops.length) { if (ops[k][0] === ' ') { k++; continue; }
      let s = Math.max(0, k - ctx), e = k; while (e < ops.length) { if (ops[e][0] !== ' ') { e++; continue; } let run = 0; while (e + run < ops.length && ops[e + run][0] === ' ') run++; if (run > ctx * 2 || e + run >= ops.length) { e = Math.min(ops.length, e + ctx); break; } e += run; }
      const h = ops.slice(s, e); const a0 = h[0][2] + 1, b0 = h[0][3] + 1;
      out += `@@ -${a0},${h.filter(o => o[0] !== '+').length} +${b0},${h.filter(o => o[0] !== '-').length} @@\n` + h.map(o => o[0] + o[1] + '\n').join(''); k = e; }
    return out;
  }


  return { Shell, BUILTINS, APPLETS, opts, inputs, splitLines, tokenize, parse, globToRe };
}
