/*! Jade Agent Kit 3.1.0 | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */
import{b as v,d as x,h as S,l as E,m as k,p as q}from"./chunk-YB4QJ7BJ.js";import"./chunk-GZEGYG7Y.js";function P(w,s){let e=JSON.stringify(s+"micropython.mjs"),r={},o=String(w).replace(/import\.meta\.url/g,e).replace(/import\.meta\b/g,`({ url: ${e} })`).replace(/\bexport\s*\{([^}]*)\}\s*;?/g,(g,f)=>{for(let p of f.split(",")){let[c,d]=p.trim().split(/\s+as\s+/);c&&(r[(d||c).trim()]=c.trim())}return";"}).replace(/\bexport\s+default\s+(?=[\w$])/g,"var __mpyDefault = ").replace(/\bexport\s+(?=(?:async\s+function|function\*?|const|let|var|class)\b)/g,""),i=r.loadMicroPython||"loadMicroPython";return`const __mpyFactory = async () => {
const navigator = (() => { const n = globalThis.navigator; if (!n) return n; const ua = String(n.userAgent || '').replace(/\\s*Version\\/[\\d.]+/, '');
    return new Proxy(n, { get: (t, k) => k === 'userAgent' ? ua : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); })();
${o}
;return { loadMicroPython: typeof ${i} === 'function' ? ${i} : undefined };
};
`}var N=`def __jv_compat():
    import sys
    import os as _os
    if hasattr(_os, 'walk') and hasattr(_os, 'path'):
        return
    S_IFMT, S_IFDIR, S_IFREG = 0o170000, 0o040000, 0o100000
    class _Path:
        sep = '/'
        curdir = '.'
        def join(self, a, *p):
            for b in p:
                if b.startswith('/'):
                    a = b
                elif not a or a.endswith('/'):
                    a = a + b
                else:
                    a = a + '/' + b
            return a
        def _mode(self, p):
            try:
                return _os.stat(p)[0]
            except OSError:
                return None
        def exists(self, p):
            return self._mode(p) is not None
        def isdir(self, p):
            m = self._mode(p)
            return m is not None and (m & S_IFMT) == S_IFDIR
        def isfile(self, p):
            m = self._mode(p)
            return m is not None and (m & S_IFMT) == S_IFREG
        def getsize(self, p):
            return _os.stat(p)[6]
        def basename(self, p):
            return p.rsplit('/', 1)[-1]
        def dirname(self, p):
            if '/' not in p:
                return ''
            d = p.rsplit('/', 1)[0]
            return d if d else '/'
        def split(self, p):
            return (self.dirname(p), self.basename(p))
        def splitext(self, p):
            b = self.basename(p)
            i = b.rfind('.')
            if i <= 0:
                return (p, '')
            return (p[:len(p) - len(b) + i], b[i:])
        def normpath(self, p):
            absolute = p.startswith('/')
            out = []
            for s in p.split('/'):
                if s in ('', '.'):
                    continue
                if s == '..':
                    if out and out[-1] != '..':
                        out.pop()
                    elif not absolute:
                        out.append(s)
                else:
                    out.append(s)
            r = '/'.join(out)
            return ('/' + r) if absolute else (r or '.')
        def abspath(self, p):
            return self.normpath(p if p.startswith('/') else self.join(_os.getcwd(), p))
        def relpath(self, p, start='.'):
            a = [x for x in self.abspath(p).split('/') if x]
            b = [x for x in self.abspath(start).split('/') if x]
            i = 0
            while i < len(a) and i < len(b) and a[i] == b[i]:
                i += 1
            return '/'.join(['..'] * (len(b) - i) + a[i:]) or '.'
        def expanduser(self, p):
            return '/' + p[2:] if p.startswith('~/') else ('/' if p == '~' else p)
    path = _Path()
    def walk(top, topdown=True):
        try:
            names = _os.listdir(top)
        except OSError:
            return
        dirs, files = [], []
        for n in names:
            (dirs if path.isdir(path.join(top, n)) else files).append(n)
        if topdown:
            yield top, dirs, files
        for d in dirs:
            yield from walk(path.join(top, d), topdown)
        if not topdown:
            yield top, dirs, files
    def makedirs(p, exist_ok=False):
        cur = '/' if p.startswith('/') else ''
        for part in [x for x in p.split('/') if x]:
            cur = path.join(cur, part) if cur else part
            if not path.isdir(cur):
                _os.mkdir(cur)
            elif cur == p.rstrip('/') and not exist_ok:
                raise OSError(17)
    class _OS:
        def __getattr__(self, k):
            return getattr(_os, k)
    m = _OS()
    m.path = path
    m.sep = '/'
    if not hasattr(_os, 'walk'):
        m.walk = walk
    if not hasattr(_os, 'makedirs'):
        m.makedirs = makedirs
    sys.modules['os'] = m
    sys.modules['os.path'] = path
try:
    __jv_compat()
except Exception:
    pass
del __jv_compat
`,_=`
const dec = new TextDecoder();
self.onmessage = async (ev) => {
  const { wasm, files, dirs, cwd, argv, code, stdin, heap, compat, sqliteModule, sqliteShim } = ev.data;
  const outB = [], errB = [], out = [];
  const flush = () => { if (outB.length) { out.push(['o', dec.decode(new Uint8Array(outB.splice(0)))]); } if (errB.length) { out.push(['e', dec.decode(new Uint8Array(errB.splice(0)))]); } };
  let exit = 0, FS = null, SQ = null; const orig = new Map(Object.entries(files));
  try {
    const { loadMicroPython } = await __mpyFactory();
    let si = 0; const sin = new TextEncoder().encode(stdin || '');
    const mp = await loadMicroPython({ url: wasm, heapsize: heap, linebuffer: false,
      stdout: b => { for (const x of b) outB.push(x); if (outB.length > 4096) flush(); },
      stderr: b => { for (const x of b) errB.push(x); if (errB.length > 4096) flush(); },
      stdin: () => si < sin.length ? sin[si++] : null });
    FS = mp.FS;
    const mk = p => { const parts = p.split('/').filter(Boolean); let cur = ''; for (const s of parts) { cur += '/' + s; try { FS.mkdir(cur); } catch {} } };
    for (const d of dirs) if (d !== '/') mk(d);
    for (const [p, data] of orig) { mk(p.slice(0, p.lastIndexOf('/')) || '/'); FS.writeFile(p, data); }
    try { FS.chdir(cwd); } catch {}
    const scriptDir = argv[0] && argv[0].startsWith('/') ? argv[0].slice(0, argv[0].lastIndexOf('/')) || '/' : cwd;
    try { mp.runPython(compat); } catch (e) {}
    if (sqliteModule && typeof __jvSqliteBridge === 'function') { SQ = __jvSqliteBridge(__jvSqlite(sqliteModule), FS); mp.registerJsModule('_jvsqlite', SQ); try { mp.runPython(sqliteShim); } catch (e) {} }
    mp.runPython('import sys\\nsys.argv[:] = ' + JSON.stringify(argv) + '\\nif ' + JSON.stringify(scriptDir) + ' not in sys.path: sys.path.insert(0, ' + JSON.stringify(scriptDir) + ')');
    await mp.runPythonAsync(code);
  } catch (e) {
    flush();
    const msg = String((e && e.message) || e);
    const m = /SystemExit(?::\\s*(-?\\d+))?\\s*$/.exec(msg.trim());
    if (m) exit = m[1] ? +m[1] : 0;
    else { out.push(['e', msg.endsWith('\\n') ? msg : msg + '\\n']); exit = 1; }
  }
  flush();
  try { SQ && SQ.flushAll(); } catch (e) {}
  const writes = {}, deletes = [], mkdirs = [];
  if (FS) {
    const seen = new Set();
    const walk = (dir) => {
      let names = []; try { names = FS.readdir(dir); } catch { return; }
      for (const n of names) {
        if (n === '.' || n === '..') continue;
        const p = (dir === '/' ? '' : dir) + '/' + n;
        if (/^\\/(dev|proc|home\\/web_user)(\\/|$)/.test(p) || p === '/home' && !dirs.includes('/home')) continue;
        let st; try { st = FS.stat(p); } catch { continue; }
        if (FS.isDir(st.mode)) { if (!dirs.includes(p) && p !== '/tmp') mkdirs.push(p); walk(p); }
        else { seen.add(p); const data = FS.readFile(p); const o = orig.get(p); if (!o || o.length !== data.length || o.some((x, i) => x !== data[i])) writes[p] = data; }
      }
    };
    walk('/');
    for (const p of orig.keys()) if (!seen.has(p)) deletes.push(p);
  }
  self.postMessage({ out, writes, deletes, mkdirs, code: exit });
};`;var M=`
function __jvSqliteBridge(S, FS) {
  const H = new Map(); let hid = 0;
  const abs = p => p.startsWith('/') ? p : ((FS.cwd() === '/' ? '' : FS.cwd()) + '/' + p);
  const b64 = u => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const enc = v => v instanceof Uint8Array ? { $b: b64(v) } : typeof v === 'bigint' ? { $i: v.toString() } : v;
  const revive = (k, v) => v && typeof v === 'object' && !Array.isArray(v) ? (typeof v.$b === 'string' ? Uint8Array.from(atob(v.$b), c => c.charCodeAt(0)) : typeof v.$i === 'string' ? BigInt(v.$i) : v) : v;
  const flush = (h) => { const x = H.get(h); if (x && x.fp && x.d.dirty) { FS.writeFile(x.fp, x.d.export()); x.d.dirty = false; } return 0; };
  return {
    version: () => S.version,
    open: (path) => { const p = String(path); let fp = null, bytes = null; if (p && p !== ':memory:') { fp = abs(p); try { bytes = FS.readFile(fp); } catch (e) {} } const d = new S.Database(bytes); H.set(++hid, { d, fp }); return hid; },
    execute: (h, sql, pj) => { const x = H.get(h); try { const params = pj ? JSON.parse(pj, revive) : null; let cols = [], rows = [], n = 0;
        x.d.each(String(sql), st => { if (n++) throw new Error('You can only execute one statement at a time.'); cols = st.columns(); rows = st.rows(params); });
        return JSON.stringify({ cols, rows: rows.map(r => r.map(enc)), changes: x.d.changes(), lastrowid: Number(x.d.lastInsertRowid()), total: x.d.totalChanges() });
      } catch (e) { return JSON.stringify({ error: String(e.message || e) }); } },
    script: (h, sql) => { try { H.get(h).d.exec(String(sql)); return '{}'; } catch (e) { return JSON.stringify({ error: String(e.message || e) }); } },
    flush,
    close: (h) => { flush(h); const x = H.get(h); if (x) { x.d.close(); H.delete(h); } return 0; },
    flushAll: () => { for (const h of H.keys()) flush(h); return 0; },
  };
}`,j=`
def __jv_sqlite():
    import sys, json, binascii
    import _jvsqlite as J
    class Error(Exception): pass
    class Warning(Exception): pass
    class InterfaceError(Error): pass
    class DatabaseError(Error): pass
    class OperationalError(DatabaseError): pass
    class IntegrityError(DatabaseError): pass
    class ProgrammingError(DatabaseError): pass
    def _enc(v):
        if isinstance(v, (bytes, bytearray)):
            return {'$b': binascii.b2a_base64(bytes(v)).decode().strip()}
        return v
    def _dec(v):
        if isinstance(v, dict):
            if '$b' in v:
                return binascii.a2b_base64(v['$b'])
            if '$i' in v:
                return int(v['$i'])
        return v
    def _raise(msg):
        low = msg.lower()
        if 'constraint' in low:
            raise IntegrityError(msg)
        if 'one statement' in low or 'parameter' in low or 'values for' in low:
            raise ProgrammingError(msg)
        raise OperationalError(msg)
    def _starts(s, words):
        for w in words:
            if s.startswith(w):
                return True
        return False
    class Row:
        def __init__(self, cols, vals):
            self._c = cols
            self._v = vals
        def keys(self):
            return list(self._c)
        def __getitem__(self, k):
            if isinstance(k, str):
                lk = k.lower()
                for i, c in enumerate(self._c):
                    if c.lower() == lk:
                        return self._v[i]
                raise IndexError('No item with that key')
            return self._v[k]
        def __len__(self):
            return len(self._v)
        def __iter__(self):
            return iter(self._v)
        def __eq__(self, o):
            return isinstance(o, Row) and o._c == self._c and o._v == self._v
        def __repr__(self):
            return '<Row %r>' % (tuple(self._v),)
    class Cursor:
        def __init__(self, conn):
            self.connection = conn
            self._rows = []
            self._i = 0
            self.description = None
            self.rowcount = -1
            self.lastrowid = None
            self.row_factory = None
            self.arraysize = 1
        def execute(self, sql, params=()):
            c = self.connection
            c._check()
            if isinstance(params, dict):
                p = {}
                for k in params:
                    p[k] = _enc(params[k])
            else:
                p = [_enc(v) for v in params]
            r = json.loads(J.execute(c._h, sql, json.dumps(p) if p else ''))
            if 'error' in r:
                _raise(r['error'])
            cols = r['cols']
            rf = self.row_factory or c.row_factory
            rows = [tuple([_dec(v) for v in row]) for row in r['rows']]
            if rf is Row:
                rows = [Row(cols, list(t)) for t in rows]
            elif rf:
                rows = [rf(self, t) for t in rows]
            self._rows = rows
            self._i = 0
            self.description = tuple([(n, None, None, None, None, None, None) for n in cols]) if cols else None
            u = sql.lstrip()[:7].upper()
            self.rowcount = r['changes'] if _starts(u, ('INSERT', 'UPDATE', 'DELETE', 'REPLACE')) else -1
            if _starts(u, ('INSERT', 'REPLACE')):
                self.lastrowid = r['lastrowid']
            c.total_changes = r.get('total', c.total_changes)
            return self
        def executemany(self, sql, seq):
            n = 0
            for p in seq:
                self.execute(sql, p)
                if self.rowcount > 0:
                    n += self.rowcount
            self.rowcount = n
            return self
        def executescript(self, script):
            self.connection.executescript(script)
            return self
        def fetchone(self):
            if self._i < len(self._rows):
                self._i += 1
                return self._rows[self._i - 1]
            return None
        def fetchmany(self, size=None):
            size = size or self.arraysize
            out = self._rows[self._i:self._i + size]
            self._i += len(out)
            return out
        def fetchall(self):
            out = self._rows[self._i:]
            self._i = len(self._rows)
            return out
        def __iter__(self):
            return self
        def __next__(self):
            r = self.fetchone()
            if r is None:
                raise StopIteration
            return r
        def close(self):
            pass
    class Connection:
        def __init__(self, path):
            self._h = J.open(str(path))
            self.row_factory = None
            self.total_changes = 0
            self.isolation_level = ''
        def _check(self):
            if self._h is None:
                raise ProgrammingError('Cannot operate on a closed database.')
        def cursor(self):
            self._check()
            return Cursor(self)
        def execute(self, sql, params=()):
            return self.cursor().execute(sql, params)
        def executemany(self, sql, seq):
            return self.cursor().executemany(sql, seq)
        def executescript(self, script):
            self._check()
            r = json.loads(J.script(self._h, script))
            if 'error' in r:
                _raise(r['error'])
            return self.cursor()
        def commit(self):
            self._check()
            J.flush(self._h)
        def rollback(self):
            pass
        def close(self):
            if self._h is not None:
                J.close(self._h)
                self._h = None
        def __enter__(self):
            return self
        def __exit__(self, t, v, tb):
            if t is None:
                self.commit()
            return False
    class _Mod:
        pass
    m = _Mod()
    m.Error = Error
    m.Warning = Warning
    m.InterfaceError = InterfaceError
    m.DatabaseError = DatabaseError
    m.OperationalError = OperationalError
    m.IntegrityError = IntegrityError
    m.ProgrammingError = ProgrammingError
    m.Row = Row
    m.Cursor = Cursor
    m.Connection = Connection
    def connect(database, *a, **k):
        return Connection(database)
    m.connect = connect
    m.sqlite_version = J.version()
    m.version = '2.6.0'
    m.PARSE_DECLTYPES = 1
    m.PARSE_COLNAMES = 2
    m.paramstyle = 'qmark'
    sys.modules['sqlite3'] = m
try:
    __jv_sqlite()
except Exception as e:
    print('sqlite3 module failed to load:', e)
del __jv_sqlite
`;var y="1.27.0",F=class{constructor({vfs:s,sqlite:e=null,cdn:r="https://cdn.jsdelivr.net/npm/"}){this.vfs=s,this._sq=typeof e=="function"?e:e?async()=>e:null,this.base=`${r}@micropython/micropython-webassembly-pyscript@${y}/`,this._p=null}load(){return this._p||=(async()=>{let[s,e]=await Promise.all([k(this.base+"micropython.mjs","MicroPython"),E(this.base+"micropython.wasm","MicroPython")]);if(!s||!S(e))throw new Error(`MicroPython ${y} downloaded incomplete (${e.length} bytes of wasm)`);return{factory:P(s,this.base),wasm:"data:application/wasm;base64,"+x(e)}})().catch(s=>{throw this._p=null,s})}async run(s,{argv:e=[""],cwd:r="/",stdin:o="",timeoutMs:i=6e4,heapMB:l=16,signal:g=null}={}){let f;try{f=await this.load()}catch(t){return{stdout:"",stderr:`python: ${t.message}
`,output:`python: ${t.message}
`,code:1}}let p=this.vfs,c={},d=[];for(let[t,a]of p.nodes)a.dir?d.push(t):a.data.length<4e6&&(c[t]=a.data);let u=null,m=null;if(this._sq&&(/sqlite/i.test(s)||[...p.nodes].some(([t,a])=>!a.dir&&t.endsWith(".py")&&a.data.length<2e6&&/sqlite/i.test(v.decode(a.data)))))try{m=await this._sq(),u=await m.module()}catch(t){return{stdout:"",stderr:`python: could not load SQLite (${t.message})
`,code:1}}let I=u?f.factory+m.glueSource+`
`+M+`
`+_:f.factory+_,n=await q(I,{sqliteModule:u,sqliteShim:j,compat:N,wasm:f.wasm,files:c,dirs:d,cwd:r,argv:e,code:String(s),stdin:o,heap:l*1024*1024},{timeoutMs:i,signal:g,name:"python"});if(n.error)return{stdout:"",stderr:`python: ${n.error}
`,output:`python: ${n.error}
`,code:n.timeout?124:n.aborted?130:1};let b=[];p.applyChanges({deletes:n.deletes||[],mkdirs:n.mkdirs||[],writes:n.writes||{}},t=>b.push(`python: ${t.message}
`));let h=n.out||[];return{stdout:h.filter(t=>t[0]==="o").map(t=>t[1]).join(""),stderr:h.filter(t=>t[0]==="e").map(t=>t[1]).join("")+b.join(""),output:h.map(t=>t[1]).join(""),code:n.code??1}}command(){return async s=>{let e=s.argv,r,o;if(e[0]==="--version"||e[0]==="-V")return s.o(`MicroPython ${y} (WebAssembly)
`),0;if(e[0]==="-m"&&e[1]==="pip")return s.e(`pip is not available: MicroPython runs in the browser and has no package installer.
`),1;if(e[0]==="-c")r=e[1]??"",o=["-c",...e.slice(2)];else if(e.length&&e[0]!=="-"){let l=s.P(e[0]);if(!this.vfs.isFile(l))return s.e(`python: can't open file '${e[0]}': No such file
`),2;r=this.vfs.read(l),o=[l,...e.slice(1)]}else r=s.stdin,o=[""];if(!String(r).trim())return s.e(`python: no script given. Use python file.py or python -c "code"
`),2;let i=await this.run(r,{argv:o,cwd:s.sh.cwd,stdin:e[0]==="-c"||e.length&&e[0]!=="-"?s.stdin:"",timeoutMs:s.sh.timeoutMs});return s.o(i.stdout),s.e(i.stderr),i.code}}};export{y as MPY_VERSION,F as Python};
//# sourceMappingURL=python.js.map
