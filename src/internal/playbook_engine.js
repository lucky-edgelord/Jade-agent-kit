// Playbooks: the pure engine (expressions, templates, validation), ported unchanged from Jade Vault
// (app/modules/playbook.js, between PB:ENGINE:BEGIN and PB:ENGINE:END).
const PB_CONTROL = new Set(['set', 'debug', 'fail', 'assert', 'wait', 'save', 'playbook', 'tool']);
const PB_BROWSER = new Set(['goto', 'back', 'reload', 'click', 'type', 'select', 'check', 'press', 'scroll', 'wait_for', 'extract', 'assert', 'eval', 'screenshot', 'exists', 'url', 'title']);
const PB_NEEDS_TARGET = new Set(['click', 'type', 'select', 'check', 'wait_for', 'extract', 'exists']);
const PB_KEYS = new Set(['name', 'do', 'when', 'loop', 'loop_var', 'register', 'retries', 'delay', 'until', 'ignore_errors', 'failed_when', 'timeout', 'json', 'no_log', 'args', 'tags', 'block', 'rescue', 'always', 'tool']);
const PB_NOINTERP = new Set(['block', 'rescue', 'always', 'when', 'until', 'failed_when', 'loop', 'that']);
const PB_BLOCKED = new Set(['delegate', 'think', 'curiosity', 'find_skill']);          // these put a model in the loop
const PB_RISKY = new Set(['phone', 'screen', 'ssh', 'bash', 'write', 'edit', 'sentry', 'web_fetch', 'backup', 'schedule', 'flow']);
const PB_LIMITS = { tasks: 1000, seconds: 300, maxSeconds: 900, depth: 4, loop: 200, taskTimeout: 10, include: 3 };

const bsHost = u => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
/* ---------- expressions: a small safe language ({{ items | length > 2 and not done }}) ---------- */
const PB_UNDEF = Object.freeze({ undef: true });
const pbNeed = (v, what) => { if (v === PB_UNDEF) throw new Error(`undefined variable${what ? ' ' + what : ''}`); return v; };
function pbTokens(src) {
  const t = []; let i = 0; const s = String(src);
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    let m;
    if ((m = /^\d+(\.\d+)?/.exec(s.slice(i)))) { t.push({ k: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    if (c === '"' || c === "'") { let j = i + 1, out = ''; while (j < s.length && s[j] !== c) { if (s[j] === '\\' && j + 1 < s.length) { j++; out += ({ n: '\n', t: '\t' })[s[j]] || s[j]; } else out += s[j]; j++; } if (j >= s.length) throw new Error('unterminated string in expression: ' + s); t.push({ k: 'str', v: out }); i = j + 1; continue; }
    if ((m = /^[A-Za-z_]\w*/.exec(s.slice(i)))) { t.push({ k: 'id', v: m[0] }); i += m[0].length; continue; }
    if ((m = /^(==|!=|<=|>=|&&|\|\||[<>+\-*/%()[\],.|!])/.exec(s.slice(i)))) { t.push({ k: 'op', v: m[0] }); i += m[0].length; continue; }
    throw new Error(`unexpected "${c}" in expression: ${s}`);
  }
  return t;
}
function pbParse(src) {
  const T = pbTokens(src); let p = 0;
  const peek = () => T[p], isOp = v => T[p] && T[p].k === 'op' && T[p].v === v, isId = v => T[p] && T[p].k === 'id' && T[p].v === v;
  const eat = v => { if (!isOp(v)) throw new Error(`expected "${v}" in expression: ${src}`); p++; };
  function or() { let l = and(); while (isId('or') || isOp('||')) { p++; l = { t: 'or', l, r: and() }; } return l; }
  function and() { let l = not(); while (isId('and') || isOp('&&')) { p++; l = { t: 'and', l, r: not() }; } return l; }
  function not() { if (isId('not') || isOp('!')) { p++; return { t: 'not', e: not() }; } return cmp(); }
  function cmp() {
    let l = add();
    for (;;) {
      const x = peek(); if (!x) break;
      if (x.k === 'op' && ['==', '!=', '<', '<=', '>', '>='].includes(x.v)) { p++; l = { t: 'cmp', op: x.v, l, r: add() }; }
      else if (isId('in')) { p++; l = { t: 'in', l, r: add() }; }
      else if (isId('not') && T[p + 1] && T[p + 1].k === 'id' && T[p + 1].v === 'in') { p += 2; l = { t: 'not', e: { t: 'in', l, r: add() } }; }
      else if (isId('is')) { p++; let neg = false; if (isId('not')) { neg = true; p++; } if (!isId('defined')) throw new Error('only "is defined" is supported after "is": ' + src); p++; l = { t: 'def', e: l }; if (neg) l = { t: 'not', e: l }; }
      else break;
    }
    return l;
  }
  function add() { let l = mul(); while (isOp('+') || isOp('-')) { const op = T[p++].v; l = { t: 'bin', op, l, r: mul() }; } return l; }
  function mul() { let l = unary(); while (isOp('*') || isOp('/') || isOp('%')) { const op = T[p++].v; l = { t: 'bin', op, l, r: unary() }; } return l; }
  function unary() { if (isOp('-')) { p++; return { t: 'neg', e: unary() }; } return pipe(); }
  function pipe() {
    let e = postfix();
    while (isOp('|')) { p++; const n = T[p++]; if (!n || n.k !== 'id') throw new Error('expected a filter name after "|": ' + src); let args = []; if (isOp('(')) args = callArgs(); e = { t: 'call', name: n.v, args: [e, ...args] }; }
    return e;
  }
  function callArgs() { eat('('); const a = []; if (!isOp(')')) { a.push(or()); while (isOp(',')) { p++; a.push(or()); } } eat(')'); return a; }
  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp('.')) { p++; const n = T[p++]; if (!n || n.k !== 'id') throw new Error('expected a name after ".": ' + src); e = { t: 'get', e, key: { t: 'lit', v: n.v } }; }
      else if (isOp('[')) { p++; const k = or(); eat(']'); e = { t: 'get', e, key: k }; }
      else break;
    }
    return e;
  }
  function primary() {
    const x = T[p++]; if (!x) throw new Error('the expression ended too early: ' + src);
    if (x.k === 'num' || x.k === 'str') return { t: 'lit', v: x.v };
    if (x.k === 'op' && x.v === '(') { const e = or(); eat(')'); return e; }
    if (x.k === 'op' && x.v === '[') { const a = []; if (!isOp(']')) { a.push(or()); while (isOp(',')) { p++; a.push(or()); } } eat(']'); return { t: 'list', a }; }
    if (x.k === 'id') {
      if (x.v === 'true' || x.v === 'True') return { t: 'lit', v: true };
      if (x.v === 'false' || x.v === 'False') return { t: 'lit', v: false };
      if (x.v === 'null' || x.v === 'none' || x.v === 'None') return { t: 'lit', v: null };
      if (isOp('(')) return { t: 'call', name: x.v, args: callArgs() };
      return { t: 'var', name: x.v };
    }
    throw new Error(`unexpected "${x.v}" in expression: ${src}`);
  }
  if (!T.length) throw new Error('empty expression');
  const ast = or(); if (p < T.length) throw new Error(`unexpected "${T[p].v}" in expression: ${src}`);
  return ast;
}
const pbTruthy = v => v === PB_UNDEF ? false : Array.isArray(v) ? v.length > 0 : v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v;
const pbNumLike = v => typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v));
function pbEq(a, b) {
  if (a === b) return true;
  if ((typeof a === 'number' || typeof b === 'number') && pbNumLike(a) && pbNumLike(b)) return +a === +b;
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}
const pbStr = v => v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
// a regular expression cannot be interrupted once it runs, so patterns that can blow up (nested quantifiers) and huge inputs are refused
function pbRegex(re) { re = pbStr(re); if (re.length > 200) throw new Error('regular expression too long'); if (/\([^)]*[+*][^)]*\)\s*[+*{]/.test(re) || /\([^)]*\|[^)]*\)\s*[+*{]/.test(re)) throw new Error('that regular expression could take forever (a repeated group with a repeat inside); simplify it'); try { return new RegExp(re, 'i'); } catch (e) { throw new Error('bad regular expression: ' + e.message); } }
const pbText = s => { s = pbStr(s); if (s.length > 100000) throw new Error('text too long for a regular expression (over 100000 characters); cut it first'); return s; };
const pbFns = {
  len: x => x == null ? 0 : typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).length : x.length, length: x => pbFns.len(x), count: x => pbFns.len(x),
  lower: x => pbStr(x).toLowerCase(), upper: x => pbStr(x).toUpperCase(), trim: x => pbStr(x).trim(), str: pbStr,
  int: x => { const n = parseInt(x, 10); if (Number.isNaN(n)) throw new Error(`int(): "${pbStr(x).slice(0, 40)}" is not a number`); return n; },
  float: x => { const n = parseFloat(String(x).replace(/[^\d.eE+-]/g, '')); if (Number.isNaN(n)) throw new Error(`float(): "${pbStr(x).slice(0, 40)}" is not a number`); return n; },
  join: (a, sep = ',') => (Array.isArray(a) ? a : [a]).map(pbStr).join(sep), split: (s, sep = ',') => pbStr(s).split(sep),
  first: a => Array.isArray(a) ? a[0] : pbStr(a)[0], last: a => Array.isArray(a) ? a[a.length - 1] : pbStr(a).slice(-1),
  keys: o => Object.keys(o || {}), values: o => Object.values(o || {}),
  replace: (s, a, b) => pbStr(s).split(pbStr(a)).join(pbStr(b)), startswith: (s, a) => pbStr(s).startsWith(pbStr(a)), endswith: (s, a) => pbStr(s).endsWith(pbStr(a)),
  contains: (a, b) => Array.isArray(a) ? a.some(x => pbEq(x, b)) : pbStr(a).includes(pbStr(b)),
  matches: (s, re) => pbRegex(re).test(pbText(s)),
  regex_find: (s, re, g = 0) => { const m = pbRegex(re).exec(pbText(s)); return m ? (m[g] ?? '') : ''; },
  json: x => JSON.stringify(x), from_json: s => { try { return JSON.parse(pbStr(s)); } catch (e) { throw new Error('from_json: not valid JSON (' + e.message + ')'); } },
  sort: a => [...(a || [])].sort((x, y) => pbNumLike(x) && pbNumLike(y) ? x - y : pbStr(x) < pbStr(y) ? -1 : 1), unique: a => (a || []).filter((x, i, l) => l.findIndex(y => pbEq(x, y)) === i), reverse: a => [...(a || [])].reverse(),
  abs: Math.abs, round: (x, n = 0) => { const f = 10 ** n; return Math.round(x * f) / f; }, min: (...a) => Math.min(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a)), max: (...a) => Math.max(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a)),
  range: (a, b) => { const lo = b == null ? 0 : +a, hi = b == null ? +a : +b; if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('range() needs numbers'); if (hi - lo > 1000) throw new Error('range() is capped at 1000'); return Array.from({ length: Math.max(0, hi - lo) }, (_, i) => lo + i); },
  now: () => new Date().toISOString(), today: () => new Date().toISOString().slice(0, 10), random_int: (a, b) => { const lo = b == null ? 0 : +a, hi = b == null ? +a : +b; return lo + Math.floor(Math.random() * Math.max(1, hi - lo)); },
};
function pbEval(ast, scope) {      // scope: name -> value, or PB_UNDEF
  const E = n => pbEval(n, scope);
  switch (ast.t) {
    case 'lit': return ast.v;
    case 'list': return ast.a.map(x => pbNeed(E(x)));
    case 'var': return scope(ast.name);
    case 'get': {
      const o = E(ast.e); if (o === PB_UNDEF || o == null) return PB_UNDEF;
      const k = pbNeed(E(ast.key)); if (typeof k === 'string' && /^(__proto__|constructor|prototype)$/.test(k)) return PB_UNDEF;
      if (typeof o !== 'object') return typeof o === 'string' && k === 'length' ? o.length : PB_UNDEF;
      return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : PB_UNDEF;
    }
    case 'or': { const l = E(ast.l); return pbTruthy(l) ? l : E(ast.r); }
    case 'and': { const l = E(ast.l); return pbTruthy(l) ? E(ast.r) : l; }
    case 'not': return !pbTruthy(E(ast.e));
    case 'neg': return -pbNeed(E(ast.e));
    case 'def': return E(ast.e) !== PB_UNDEF;
    case 'in': { const l = pbNeed(E(ast.l)), r = pbNeed(E(ast.r)); return Array.isArray(r) ? r.some(x => pbEq(x, l)) : r && typeof r === 'object' ? Object.prototype.hasOwnProperty.call(r, l) : pbStr(r).includes(pbStr(l)); }
    case 'cmp': {
      const l = pbNeed(E(ast.l)), r = pbNeed(E(ast.r));
      if (ast.op === '==') return pbEq(l, r); if (ast.op === '!=') return !pbEq(l, r);
      const a = pbNumLike(l) && pbNumLike(r) ? [+l, +r] : [pbStr(l), pbStr(r)];
      return ast.op === '<' ? a[0] < a[1] : ast.op === '<=' ? a[0] <= a[1] : ast.op === '>' ? a[0] > a[1] : a[0] >= a[1];
    }
    case 'bin': {
      const l = pbNeed(E(ast.l)), r = pbNeed(E(ast.r));
      if (ast.op === '+') return Array.isArray(l) && Array.isArray(r) ? [...l, ...r] : (typeof l === 'number' || typeof r === 'number') && pbNumLike(l) && pbNumLike(r) ? +l + +r : pbStr(l) + pbStr(r);
      const a = +l, b = +r; if (Number.isNaN(a) || Number.isNaN(b)) throw new Error(`"${ast.op}" needs numbers (got ${JSON.stringify(l)} and ${JSON.stringify(r)})`);
      return ast.op === '-' ? a - b : ast.op === '*' ? a * b : ast.op === '/' ? (b === 0 ? (() => { throw new Error('division by zero'); })() : a / b) : a % b;
    }
    case 'call': {
      if (ast.name === 'default') { const v = E(ast.args[0]); return v === PB_UNDEF || v == null ? pbNeed(E(ast.args[1] || { t: 'lit', v: '' })) : v; }
      if (ast.name === 'defined') return E(ast.args[0]) !== PB_UNDEF;
      const f = pbFns[ast.name]; if (!Object.prototype.hasOwnProperty.call(pbFns, ast.name)) throw new Error(`unknown function ${ast.name}(). Available: ${Object.keys(pbFns).join(', ')}, default`);
      return f(...ast.args.map(x => pbNeed(E(x))));
    }
  }
  throw new Error('bad expression');
}
const pbCache = new Map();
const pbCompile = src => { let a = pbCache.get(src); if (!a) { a = pbParse(src); if (pbCache.size > 500) pbCache.clear(); pbCache.set(src, a); } return a; };
function pbScope(vars, secrets, used) {
  return name => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    if (secrets && secrets[name] != null && secrets[name] !== '') { used && used.add(name); return String(secrets[name]); }
    return PB_UNDEF;
  };
}
function pbExpr(src, scope) { const v = pbEval(pbCompile(String(src)), scope); if (v === PB_UNDEF) throw new Error(`undefined variable in: ${src}`); return v; }
const PB_TPL = /\{\{([\s\S]+?)\}\}/g;
function pbInterp(v, scope, skip) {
  if (typeof v === 'string') {
    if (!v.includes('{{')) return v;
    const whole = /^\s*\{\{([\s\S]+?)\}\}\s*$/.exec(v);
    if (whole && !/\}\}/.test(whole[1])) { try { return pbExpr(whole[1], scope); } catch (e) { throw new Error(`${e.message} (in "${v.slice(0, 80)}")`); } }
    return v.replace(PB_TPL, (m, ex) => { try { return pbStr(pbExpr(ex, scope)); } catch (e) { throw new Error(`${e.message} (in "${v.slice(0, 80)}")`); } });
  }
  if (Array.isArray(v)) return v.map(x => pbInterp(x, scope));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = skip && skip.has(k) ? x : pbInterp(x, scope); return o; }
  return v;
}
const pbRedact = (s, secrets) => { let out = String(s); for (const [k, v] of Object.entries(secrets || {})) if (v && String(v).length >= 4) out = out.split(String(v)).join(`{{${k}}}`); return out; };
const pbHash = str => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(36) + str.length.toString(36); };
const pbCanon = pb => JSON.stringify({ name: pb.name || '', allow_hosts: pb.allow_hosts || [], vars: pb.vars || {}, seconds: pb.seconds || 0, tasks: pb.tasks });

/* ---------- validation ---------- */
const PB_ID_RE = /^[A-Za-z_]\w*$/, PB_BAD_NAMES = /^(__proto__|constructor|prototype|hasOwnProperty|toString|valueOf)$/;
const PB_ID = { test: x => PB_ID_RE.test(String(x)) && !PB_BAD_NAMES.test(String(x)) };
function pbModule(t) {         // -> { kind: 'control'|'browser'|'tool', name }
  const d = String(t.do || '');
  if (d === 'tool') return { kind: 'tool', name: String(t.tool || '') };
  if (PB_CONTROL.has(d)) return { kind: 'control', name: d };
  if (d.startsWith('browser.') && PB_BROWSER.has(d.slice(8))) return { kind: 'browser', name: d.slice(8) };
  const [tool, ...rest] = d.split('.'); return { kind: 'tool', name: tool, action: rest.join('.') };
}
function pbValidate(pb, toolNames) {
  const errs = []; let count = 0;
  const exprOk = (p, k, e) => { for (const x of [].concat(e)) { if (typeof x !== 'string' || !x.trim()) { errs.push(`${p}: "${k}" must be an expression string`); continue; } try { pbCompile(x.replace(/^\s*\{\{([\s\S]*)\}\}\s*$/, '$1')); } catch (er) { errs.push(`${p}: "${k}": ${er.message}`); } } };
  const walk = (tasks, path, depth) => {
    if (!Array.isArray(tasks) || !tasks.length) { errs.push(`${path}: must be a non-empty list of tasks`); return; }
    if (depth > PB_LIMITS.depth) { errs.push(`${path}: nested too deep (at most ${PB_LIMITS.depth} levels)`); return; }
    tasks.forEach((t, i) => {
      const p = `${path}[${i}]`; count++;
      if (!t || typeof t !== 'object' || Array.isArray(t)) { errs.push(`${p}: a task is an object like {"do":"set","vars":{"x":1}}`); return; }
      const isBlock = t.block != null;
      if (isBlock && t.do != null) { errs.push(`${p}: a task has either "do" or "block", not both`); return; }
      if (!isBlock && t.do == null) { errs.push(`${p}: a task needs "do" (what to run) or "block" (a list of tasks)`); return; }
      if (t.when != null) exprOk(p, 'when', t.when);
      if (t.until != null) exprOk(p, 'until', t.until);
      if (t.failed_when != null) exprOk(p, 'failed_when', t.failed_when);
      if (t.register != null && !PB_ID.test(String(t.register))) errs.push(`${p}: "register" must be a plain name`);
      if (t.loop_var != null && !PB_ID.test(String(t.loop_var))) errs.push(`${p}: "loop_var" must be a plain name`);
      if (t.loop != null && typeof t.loop !== 'string' && !Array.isArray(t.loop)) errs.push(`${p}: "loop" is a list, or an expression string like "items"`);
      if (typeof t.loop === 'string') exprOk(p, 'loop', t.loop.replace(/^\s*\{\{([\s\S]*)\}\}\s*$/, '$1'));
      if (t.retries != null && !(Number.isInteger(+t.retries) && +t.retries >= 0 && +t.retries <= 10)) errs.push(`${p}: retries must be 0 to 10`);
      if (t.delay != null && !(+t.delay >= 0 && +t.delay <= 60)) errs.push(`${p}: delay is seconds, 0 to 60`);
      if (t.timeout != null && !(+t.timeout > 0 && +t.timeout <= 120)) errs.push(`${p}: timeout is seconds, 1 to 120`);
      if (t.tags != null && !(Array.isArray(t.tags) && t.tags.every(x => typeof x === 'string'))) errs.push(`${p}: tags is a list of words`);
      if (isBlock) { walk(t.block, p + '.block', depth + 1); if (t.rescue != null) walk(t.rescue, p + '.rescue', depth + 1); if (t.always != null) walk(t.always, p + '.always', depth + 1); return; }
      if (t.rescue != null || t.always != null) errs.push(`${p}: rescue and always belong on a "block" task`);
      const m = pbModule(t), a = { ...(t.args && typeof t.args === 'object' ? t.args : {}), ...Object.fromEntries(Object.entries(t).filter(([k]) => !PB_KEYS.has(k))) };
      if (t.args != null && (typeof t.args !== 'object' || Array.isArray(t.args))) errs.push(`${p}: "args" must be an object`);
      if (m.kind === 'tool') {
        if (!m.name) { errs.push(`${p}: do "tool" needs "tool": the tool's name`); return; }
        if (m.name === 'browser_script') { errs.push(`${p}: browser_script is gone; its steps are now "browser.<step>" tasks in a playbook`); return; }
        if (PB_BLOCKED.has(m.name)) errs.push(`${p}: ${m.name} puts a model in the loop, so a playbook cannot call it`);
        else if (toolNames && !toolNames.includes(m.name) && !/^mcp__/.test(m.name)) errs.push(`${p}: unknown "do": ${JSON.stringify(t.do)}. It is not a built-in action (${[...PB_CONTROL].filter(x => x !== 'tool').join(', ')}, browser.<${[...PB_BROWSER].join('|')}>) and there is no tool called "${m.name}" (or it is switched off)`);
        return;
      }
      if (m.kind === 'browser') {
        const b = m.name, tgt = !!(a.css || a.text || a.xpath);
        if (PB_NEEDS_TARGET.has(b) && !tgt) errs.push(`${p}: browser.${b} needs a target: css, text or xpath`);
        if (b === 'goto' && !/^https?:\/\//i.test(String(a.url || ''))) errs.push(`${p}: browser.goto needs a url starting with http:// or https://`);
        if (b === 'type' && a.text == null) errs.push(`${p}: browser.type needs text`);
        if (b === 'select' && a.value == null && a.label == null) errs.push(`${p}: browser.select needs value or label`);
        if (b === 'press' && !a.key) errs.push(`${p}: browser.press needs key`);
        if (b === 'eval' && !a.code) errs.push(`${p}: browser.eval needs code`);
        if (b === 'assert' && !tgt && a.url_contains == null && a.title_contains == null) errs.push(`${p}: browser.assert needs a target, url_contains or title_contains (to check variables use the "assert" action)`);
        return;
      }
      switch (m.name) {
        case 'set': if (!a.vars || typeof a.vars !== 'object' || Array.isArray(a.vars) || !Object.keys(a.vars).length) errs.push(`${p}: set needs vars: {"name": value}`); else for (const k of Object.keys(a.vars)) if (!PB_ID.test(k)) errs.push(`${p}: "${k}" is not a plain variable name`); break;
        case 'assert': if (a.that == null) errs.push(`${p}: assert needs "that": an expression or a list of them`); else exprOk(p, 'that', a.that); break;
        case 'fail': break;
        case 'wait': if (!(+a.seconds > 0 || +a.ms > 0)) errs.push(`${p}: wait needs seconds or ms`); break;
        case 'save': if (!a.path) errs.push(`${p}: save needs a path`); if (a.value === undefined) errs.push(`${p}: save needs a value`); break;
        case 'debug': break;
        case 'playbook': if (!a.playbook) errs.push(`${p}: playbook needs "playbook": the name of the playbook to run`); break;
      }
    });
  };
  if (!pb || typeof pb !== 'object') return ['the playbook must be an object with "tasks"'];
  if (pb.steps && !pb.tasks) return ['this is an old browser script ("steps"). Save it as a playbook with "tasks": run the playbook tool with action convert, or write the tasks anew (action help shows the format)'];
  walk(pb.tasks, 'tasks', 1);
  if (count > PB_LIMITS.tasks) errs.push(`more than ${PB_LIMITS.tasks} tasks`);
  if (pb.allow_hosts != null && !(Array.isArray(pb.allow_hosts) && pb.allow_hosts.every(h => typeof h === 'string' && h))) errs.push('allow_hosts must be a list of host names');
  if (pb.vars != null && (typeof pb.vars !== 'object' || Array.isArray(pb.vars))) errs.push('vars must be an object');
  else for (const k of Object.keys(pb.vars || {})) if (!PB_ID.test(k)) errs.push(`vars: "${k}" is not a plain variable name`);
  return errs;
}
function pbSummary(pb) {
  const mods = new Set(), hosts = new Set(); let n = 0;
  const walk = ts => (ts || []).forEach(t => { n++; if (t.block) { walk(t.block); walk(t.rescue); walk(t.always); return; } const m = pbModule(t); mods.add(m.kind === 'browser' ? 'browser.' + m.name : m.name); const a = { ...(t.args || {}), ...t }; if (typeof a.url === 'string') { const h = bsHost(a.url); if (h) hosts.add(h); } });
  walk(pb.tasks);
  const list = [...mods]; return { tasks: n, modules: list, hosts: [...hosts], risky: list.filter(x => PB_RISKY.has(x)) };
}

/* ---------- old browser scripts become playbooks ---------- */
function pbFromLegacy(sc) {
  let uid = 0; const lookup = [];
  const conv = steps => (steps || []).flatMap(s => {
    if (!s || typeof s !== 'object') return [s];
    const { do: d, retry, optional, as, ...r } = s; const out = { ...r };
    if (retry) out.retries = +retry; if (optional) out.ignore_errors = true; if (as && (d === 'extract' || d === 'eval')) out.register = as;
    const tgt = !!(s.css || s.text || s.xpath);
    switch (d) {
      case 'goto': case 'back': case 'reload': case 'click': case 'type': case 'select': case 'check': case 'press': case 'scroll': case 'wait_for': case 'extract': case 'eval': case 'screenshot':
        if (d === 'scroll' && r.to != null && !tgt) { /* same keys */ } return [{ do: 'browser.' + d, ...out }];
      case 'wait': return [{ do: 'wait', ...out }];
      case 'fail': { const { message, ...o } = out; return [{ do: 'fail', msg: message, ...o }]; }
      case 'set': { const { var: v, value, ...o } = out; return [{ do: 'set', vars: { [v]: value }, ...o }]; }
      case 'save': { const { from, ...o } = out; if (from) o.value = `{{ ${from} }}`; return [{ do: 'save', ...o }]; }
      case 'assert': {
        if (s.var != null && !tgt && s.url_contains == null && s.title_contains == null) {
          const v = s.var, that = []; if (s.min != null) that.push(`len(${v} | default('')) >= ${+s.min}`); if (s.contains != null) that.push(`${JSON.stringify(String(s.contains))} in json(${v})`); if (s.equals != null) that.push(`str(${v}) == ${JSON.stringify(String(s.equals))}`);
          const o = { ...out }; for (const k of ['var', 'min', 'contains', 'equals']) delete o[k]; return [{ do: 'assert', that: that.length ? that : [`${v} is defined`], ...o }];
        }
        return [{ do: 'browser.assert', ...out }];
      }
      case 'if': {
        const id = '_c' + (++uid), { then: th, else: el, absent, ...o } = out; const res = [];
        if (s.url_contains != null) { res.push({ do: 'browser.url', register: id + 'u' }); res.push({ when: `${JSON.stringify(String(s.url_contains))} in ${id}u`, block: conv(th) }); if (el) res.push({ when: `${JSON.stringify(String(s.url_contains))} not in ${id}u`, block: conv(el) }); }
        else if (s.title_contains != null) { res.push({ do: 'browser.title', register: id + 't' }); res.push({ when: `${JSON.stringify(String(s.title_contains))} in ${id}t`, block: conv(th) }); if (el) res.push({ when: `${JSON.stringify(String(s.title_contains))} not in ${id}t`, block: conv(el) }); }
        else { const { then: _a, else: _b, ...tg } = s; delete tg.do; delete tg.absent; res.push({ do: 'browser.exists', ...tg, register: id }); res.push({ when: s.absent ? `not ${id}` : id, block: conv(th) }); if (el) res.push({ when: s.absent ? id : `not ${id}`, block: conv(el) }); }
        return res;
      }
      case 'each': { const { in: inV, times, steps: st, as: _as, ...o } = out; const lp = inV ? inV : `range(${Math.min(100, +times || 0)})`; return [{ ...(s.as ? { loop_var: s.as } : {}), loop: lp, block: conv(st), ...o }]; }
      default: return [{ do: d, ...out }];
    }
  });
  const o = { description: sc.description || '', vars: sc.vars || {}, allow_hosts: sc.allow_hosts || [], tasks: conv(sc.steps) };
  if (sc.seconds) o.seconds = sc.seconds; return o;
}

export { PB_BLOCKED, PB_BROWSER, PB_CONTROL, PB_ID, PB_ID_RE, PB_KEYS, PB_LIMITS, PB_NEEDS_TARGET, PB_NOINTERP, PB_RISKY, PB_TPL, PB_UNDEF, bsHost, pbCache, pbCanon, pbCompile, pbEq, pbEval, pbExpr, pbFns, pbFromLegacy, pbHash, pbInterp, pbModule, pbNeed, pbNumLike, pbParse, pbRedact, pbRegex, pbScope, pbStr, pbSummary, pbText, pbTokens, pbTruthy, pbValidate };
