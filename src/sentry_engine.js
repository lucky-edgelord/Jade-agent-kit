// Sentry's rules engine: a JavaScript port of Jade's Rust engine (rust/core/src/sentry.rs), so a rule means the same
// on a phone and in a browser. No I/O and no clock of its own: every call carries `now` (ms) and the host drives it.
//
// A trigger is { id, when?, on?, for_s, cooldown_s, max_per_hour, hours, rearm, ... }:
//  - `when` is a state condition: all / any / not over leaves { src, op, value, clear }. A leaf with `clear` is a
//    hysteresis band: it turns on at `value` and only turns off at `clear`, so a reading hovering at the threshold
//    does not flap. Leaves: ops lt le gt ge eq ne in; { src: 'geo', op: 'inside'|'outside', lat, lon, radius_m, clear_m }.
//  - a state trigger (no `on`) fires on the edge, once its condition has held for `for_s` seconds; it fires again only
//    after the condition clears (rearm "clear", the default) or the cooldown passes while it holds (rearm "cooldown").
//  - an event trigger (`on: { event, where }`) fires when a matching event arrives while `when` holds.
//  - guards on both: cooldown_s, max_per_hour, and active hours ("22:00-07:00").
//  - after (re)configuring, a condition that is already true is a baseline, not an edge.
const T = 1, F = 0, U = -1;

/** a value as text, as the engine compares them: whole numbers without ".0" */
export const text = v => v === null || v === undefined ? 'null' : typeof v === 'string' ? v : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : typeof v === 'boolean' ? String(v) : JSON.stringify(v);
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const same = (a, b) => isNum(a) && isNum(b) ? a === b : text(a) === text(b);
const num = (o, k, d) => isNum(o[k]) ? o[k] : d;

export function meters(la1, lo1, la2, lo2) {
  const r = 6371000, rad = x => x * Math.PI / 180;
  const p1 = rad(la1), p2 = rad(la2), dp = p2 - p1, dl = rad(lo2 - lo1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function mins(t, id) {
  const bad = () => new Error(`${id}: bad time "${t}" in hours`);
  const p = String(t).trim().split(':');
  if (!/^\s*\d+\s*$/.test(p[0]) || (p.length > 1 && !/^\s*\d+\s*$/.test(p[1]))) throw bad();
  const h = +p[0], m = p.length > 1 ? +p[1] : 0;
  if (h < 0 || h > 24 || m < 0 || m > 59) throw bad();
  return h * 60 + m;
}

function node(m, key) {
  const n = { kind: 'leaf', kids: [], src: '', op: '', value: null, clear: null, lat: NaN, lon: NaN, radius: 100, clearM: 20, key };
  if ('all' in m || 'any' in m) {
    const all = 'all' in m; n.kind = all ? 'all' : 'any'; const name = all ? 'all' : 'any';
    const l = m[name]; if (!Array.isArray(l) || !l.length) throw new Error(`${key}: ${name} needs a list of conditions`);
    l.forEach((k, i) => { if (!k || typeof k !== 'object' || Array.isArray(k)) throw new Error(`${key}/${i}: a condition must be an object`); n.kids.push(node(k, `${key}/${i}`)); });
    return n;
  }
  if ('not' in m) {
    n.kind = 'not'; const o = m.not;
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(`${key}/n: a condition must be an object`);
    n.kids.push(node(o, `${key}/n`)); return n;
  }
  if (typeof m.src !== 'string' || typeof m.op !== 'string') throw new Error(`${key}: a condition needs src and op`);
  n.src = m.src; n.op = m.op; n.value = m.value ?? null; n.clear = m.clear ?? null;
  if (n.src === 'geo') {
    if (n.op !== 'inside' && n.op !== 'outside') throw new Error(`${key}: geo op is inside or outside`);
    n.lat = num(m, 'lat', NaN); n.lon = num(m, 'lon', NaN); n.radius = num(m, 'radius_m', 100); n.clearM = num(m, 'clear_m', 20);
    if (Number.isNaN(n.lat) || Number.isNaN(n.lon)) throw new Error(`${key}: geo needs lat and lon`);
  } else {
    if (!['lt', 'le', 'gt', 'ge', 'eq', 'ne', 'in'].includes(n.op)) throw new Error(`${key}: unknown op ${n.op}`);
    if (n.value === null) throw new Error(`${key}: a condition needs a value`);
  }
  return n;
}

function build(id, r, json) {
  const when = r.when && typeof r.when === 'object' && !Array.isArray(r.when) ? node(r.when, `${id}/w`) : null;
  const on = r.on && typeof r.on === 'object' && !Array.isArray(r.on) ? r.on : null;
  if (on && !(typeof on.event === 'string' || Array.isArray(on.event))) throw new Error(`${id}: on needs an event name (or a list of names)`);
  if (!when && !on) throw new Error(`${id}: needs when or on`);
  let hf = -1, ht = -1;
  if (typeof r.hours === 'string' && r.hours) { const p = r.hours.split('-'); if (p.length !== 2) throw new Error(`${id}: hours must look like 22:00-07:00`); hf = mins(p[0], id); ht = mins(p[1], id); }
  return { id, json, rule: r, enabled: r.enabled !== false, when, on, forS: Math.max(0, num(r, 'for_s', 0)), cooldownS: Math.max(0, num(r, 'cooldown_s', 0)), maxPerHour: Math.max(0, num(r, 'max_per_hour', 0)), hoursFrom: hf, hoursTo: ht, rearmCooldown: r.rearm === 'cooldown', baselined: false, holding: false, since: -1, lastFire: -1, fires: [], suppressed: 0, lastReason: '', lastSuppressed: -1, latch: new Map() };
}

function track(t, c, now) { if (c === T) { if (t.since < 0) t.since = now; } else { t.since = -1; if (c === F) t.holding = false; } }
function suppress(t, why, now) { t.suppressed++; t.lastReason = why; t.lastSuppressed = now; }
function record(t, now) { t.lastFire = now; t.fires.push(now); while (t.fires.length && now - t.fires[0] > 3600000) t.fires.shift(); }
const countHour = (t, now) => t.fires.filter(f => now - f <= 3600000).length;
const minuteOfDay = (now, tz) => { const m = Math.floor(now / 60000) + tz; return ((m % 1440) + 1440) % 1440; };
function guard(t, now, tz) {
  if (t.hoursFrom >= 0) { const m = minuteOfDay(now, tz), a = t.hoursFrom, b = t.hoursTo; const inside = a <= b ? m >= a && m < b : m >= a || m < b; if (!inside) return 'outside active hours'; }
  if (t.cooldownS > 0 && t.lastFire >= 0 && now - t.lastFire < t.cooldownS * 1000) return 'cooling down';
  if (t.maxPerHour > 0 && countHour(t, now) >= t.maxPerHour) return 'hourly limit reached';
  return null;
}

function field(v, spec) {
  const present = v !== undefined;
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return present && same(v, spec);
  for (const [op, w] of Object.entries(spec)) {
    if (op === 'exists') { if ((w === true) !== present) return false; continue; }
    if (!present) return op === 'ne';
    const sv = text(v).toLowerCase(), sw = text(w).toLowerCase();
    let ok;
    switch (op) {
      case 'eq': ok = same(v, w); break;
      case 'ne': ok = !same(v, w); break;
      case 'in': ok = Array.isArray(w) && w.some(o => same(v, o)); break;
      case 'contains': ok = sv.includes(sw); break;
      case 'starts': ok = sv.startsWith(sw); break;
      case 'ends': ok = sv.endsWith(sw); break;
      case 'gt': case 'ge': case 'lt': case 'le': ok = isNum(v) && isNum(w) && (op === 'gt' ? v > w : op === 'ge' ? v >= w : op === 'lt' ? v < w : v <= w); break;
      default: ok = false;   // an operator we do not know never matches
    }
    if (!ok) return false;
  }
  return true;
}
/** does an event match a trigger's `on`? on.event is a name or a list; on.where filters its data */
export function matches(on, name, d = {}) {
  const ev = on.event; const named = Array.isArray(ev) ? ev.some(o => text(o) === name) : ev != null && text(ev) === name;
  if (!named) return false;
  if (on.where && typeof on.where === 'object' && !Array.isArray(on.where)) for (const [k, spec] of Object.entries(on.where)) if (!field(d[k], spec)) return false;
  const get = k => d[k] === undefined ? 'null' : text(d[k]);
  if (typeof on.package === 'string' && on.package !== get('package')) return false;
  if (typeof on.category === 'string' && on.category !== get('category')) return false;
  if ('min_importance' in on) { const i = d.importance; if (!(isNum(i) && i >= num(on, 'min_importance', 0))) return false; }
  if (typeof on.contains === 'string' && on.contains && !`${get('title')} ${get('text')}`.toLowerCase().includes(on.contains.toLowerCase())) return false;
  return true;
}

export class SentryEngine {
  constructor() { this.vals = {}; this.trigs = []; this.lastActive = -1; this.tzOffsetMin = 0; }
  /** replace the rules ({ triggers: [...] } or its JSON); unchanged triggers keep their state. Returns problems found */
  configure(rules) {
    const errs = [], next = [];
    let root = rules;
    if (typeof rules === 'string') { try { root = JSON.parse(rules.trim() || '{}'); } catch (e) { errs.push(`the rules are not valid JSON: ${e.message}`); this.trigs = []; return errs; } }
    if (!root || typeof root !== 'object' || Array.isArray(root)) { errs.push('the rules are not valid JSON: not an object'); this.trigs = []; return errs; }
    const old = new Map(this.trigs.map(t => [t.id, t]));
    for (const r of Array.isArray(root.triggers) ? root.triggers : []) {
      if (!r || typeof r !== 'object' || Array.isArray(r)) { errs.push('a trigger is not an object'); continue; }
      if (r.id == null || text(r.id) === '') { errs.push('a trigger has no id'); continue; }
      const id = text(r.id);
      if (next.some(t => t.id === id)) { errs.push(`duplicate trigger id ${id}`); continue; }
      const json = JSON.stringify(r); const o = old.get(id);
      if (o && o.json === json) { next.push(o); continue; }
      try { next.push(build(id, r, json)); } catch (e) { errs.push(e.message); }
    }
    this.trigs = next; return errs;
  }
  update(readings, now) { Object.assign(this.vals, readings); return this._evaluate(now, null); }
  set(key, value, now) { return this.update({ [key]: value }, now); }
  tick(now) { return this._evaluate(now, null); }
  /** the user did something: resets user.idle_s */
  touch(now) { this.lastActive = now; }
  event(name, data, now) { return this._evaluate(now, [name, data || {}]); }
  _read(src, now) { if (src === 'user.idle_s') return this.lastActive < 0 ? undefined : (now - this.lastActive) / 1000; return this.vals[src]; }
  _eval(latch, n, now) {
    if (n.kind === 'not') { const v = this._eval(latch, n.kids[0], now); return v === U ? U : v === T ? F : T; }
    if (n.kind === 'all' || n.kind === 'any') {
      const all = n.kind === 'all'; let res = all ? T : F, unknown = false;
      for (const k of n.kids) { const v = this._eval(latch, k, now); if (v === U) unknown = true; else if (all && v === F) res = F; else if (!all && v === T) res = T; }
      const decided = all ? F : T; return res === decided ? res : unknown ? U : res;
    }
    return this._leaf(latch, n, now);
  }
  _leaf(latch, n, now) {
    const was = latch.get(n.key) || false;
    if (n.src === 'geo') {
      const la = this.vals['geo.lat'], lo = this.vals['geo.lon'];
      if (!isNum(la) || !isNum(lo)) return U;
      const d = meters(la, lo, n.lat, n.lon); const acc = isNum(this.vals['geo.accuracy']) ? this.vals['geo.accuracy'] * 0.5 : 0; const margin = Math.max(n.clearM, acc);
      const on = n.op === 'inside' ? (was ? d <= n.radius + margin : d <= n.radius) : (was ? d > n.radius : d > n.radius + margin);
      latch.set(n.key, on); return on ? T : F;
    }
    const v = this._read(n.src, now); if (v === undefined || v === null) return U;
    let on;
    if (isNum(v) && isNum(n.value)) {
      const x = v, val = n.value, rel = isNum(n.clear) ? n.clear : val;
      switch (n.op) { case 'lt': on = was ? x < rel : x < val; break; case 'le': on = was ? x <= rel : x <= val; break; case 'gt': on = was ? x > rel : x > val; break; case 'ge': on = was ? x >= rel : x >= val; break; case 'eq': on = x === val; break; case 'ne': on = x !== val; break; case 'in': on = false; break; default: return U; }
    } else if (n.op === 'in' && Array.isArray(n.value)) on = n.value.some(o => text(o) === text(v));
    else { const a = text(v), b = text(n.value); if (n.op === 'eq') on = a === b; else if (n.op === 'ne') on = a !== b; else return U; }
    latch.set(n.key, on); return on ? T : F;
  }
  _snapshot(now) { const m = { ...this.vals }; if (this.lastActive >= 0) m['user.idle_s'] = Math.round((now - this.lastActive) / 1000); return m; }
  _evaluate(now, ev) {
    const out = []; const snap = this._snapshot(now); const tz = this.tzOffsetMin;
    for (const t of this.trigs) {
      const c = t.when ? this._eval(t.latch, t.when, now) : T;
      if (t.when) track(t, c, now);
      if (!t.enabled) continue;
      if (t.on) {
        if (!ev) continue; const [name, data] = ev;
        if (!matches(t.on, name, data)) continue;
        if (t.when && !(c === T && t.since >= 0 && now - t.since >= t.forS * 1000)) continue;
        const why = guard(t, now, tz); if (why) { suppress(t, why, now); continue; }
        record(t, now); out.push({ id: t.id, kind: 'event', at: now, rule: t.rule, values: { ...snap }, event: { ...data } }); continue;
      }
      if (c === U) continue;
      if (!t.baselined) { t.baselined = true; if (c === T) t.holding = true; continue; }
      if (c !== T) continue;
      if (t.holding && !(t.rearmCooldown && t.lastFire >= 0 && now - t.lastFire >= t.cooldownS * 1000)) continue;
      if (t.since < 0 || now - t.since < t.forS * 1000) continue;
      const why = guard(t, now, tz); if (why) { if (!t.holding) { t.holding = true; suppress(t, why, now); } continue; }
      t.holding = true; record(t, now);
      out.push({ id: t.id, kind: 'state', at: now, rule: t.rule, values: { ...snap }, event: null });
    }
    return out;
  }
  /** which sources the enabled rules read ("battery.level", "geo", "event:shake", …) */
  sources() {
    const out = []; const add = s => { if (!out.includes(s)) out.push(s); };
    const collect = n => { if (n.kind === 'leaf') add(n.src === 'geo' ? 'geo' : n.src); else n.kids.forEach(collect); };
    for (const t of this.trigs.filter(t => t.enabled)) { if (t.when) collect(t.when); if (t.on) for (const e of [].concat(t.on.event)) add('event:' + text(e)); }
    return out;
  }
  /** ms until something needs re-evaluating with no new input, or -1 */
  nextWakeMs(now) {
    let best = -1; const better = d => d > 0 && (best < 0 || d < best);
    const usesIdle = n => n.kind === 'leaf' ? n.src === 'user.idle_s' : n.kids.some(usesIdle);
    for (const t of this.trigs.filter(t => t.enabled)) {
      if (t.since >= 0 && t.forS > 0) { const d = t.since + Math.trunc(t.forS * 1000) - now; if (better(d)) best = d; }
      if (t.rearmCooldown && t.holding && t.lastFire >= 0 && t.cooldownS > 0) { const d = t.lastFire + Math.trunc(t.cooldownS * 1000) - now; if (better(d)) best = d; }
      if (t.when && usesIdle(t.when) && (best < 0 || best > 10000)) best = 10000;
    }
    return best;
  }
  value(key) { return this.vals[key]; }
  status(now) {
    return { values: this._snapshot(now), triggers: this.trigs.map(t => ({ id: t.id, enabled: t.enabled, holding: t.holding, ...(t.lastFire >= 0 ? { last_fired_ago_s: Math.round((now - t.lastFire) / 1000) } : {}), fired_last_hour: countHour(t, now), ...(t.suppressed ? { suppressed: t.suppressed, last_suppressed_reason: t.lastReason } : {}) })) };
  }
}
