/*! Jade Agent Kit 0.3.0 | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */
import{b as d,c as p,f as u,i as l,l as f,m}from"./chunk-XLHGWUGT.js";import"./chunk-HHGNCRW6.js";var h=`
async function __bbExec(BusyBoxModule, MOD, d) {
  const { args, stdin, entries, cwd } = d;
  const SYS = new Set(['/dev', '/proc']);
  const inp = new TextEncoder().encode(stdin || ''); let ip = 0; const out = [], err = [];
  const M = await BusyBoxModule({
    noInitialRun: true, thisProgram: 'busybox',
    instantiateWasm(imports, cb) { WebAssembly.instantiate(MOD, imports).then(i => cb(i, MOD)); return {}; },
    stdin: () => ip < inp.length ? inp[ip++] : null,
    stdout: c => { if (c != null) out.push(c); }, stderr: c => { if (c != null) err.push(c); },
    print: () => {}, printErr: () => {},
  });
  const FS = M.FS; const defaults = new Set();
  // stdio is already open, so Emscripten's /dev, /proc and /home can go: they would leak into
  // the agent's filesystem and make grep -r / find hang on /dev/urandom
  const nuke = (q) => { let st; try { st = FS.lstat(q); } catch { return; } if (FS.isDir(st.mode)) { let kids = []; try { kids = FS.readdir(q); } catch {} for (const n of kids) if (n !== '.' && n !== '..') nuke(q + '/' + n); try { FS.rmdir(q); } catch {} } else { try { FS.unlink(q); } catch {} } };
  if (!entries.some(([p]) => p === '/home' || p.startsWith('/home/'))) nuke('/home');
  for (const q of ['/proc/self/fd', '/proc/self', '/proc']) { try { FS.rmdir(q); } catch {} }
  nuke('/dev');
  if (!entries.some(([p]) => p === '/tmp' || p.startsWith('/tmp/'))) { try { FS.rmdir('/tmp'); } catch {} }
  const scan = (dir) => { for (const n of FS.readdir(dir)) { if (n === '.' || n === '..') continue; const q = (dir === '/' ? '' : dir) + '/' + n; if (SYS.has(q)) continue; defaults.add(q); if (FS.isDir(FS.stat(q).mode)) scan(q); } };
  scan('/');
  const orig = new Set();
  for (const [p, n] of entries) { if (p === '/') continue; orig.add(p); if (n.dir) { try { FS.mkdirTree(p); } catch {} } else { try { FS.mkdirTree(p.slice(0, p.lastIndexOf('/')) || '/'); } catch {} FS.writeFile(p, n.data); } }
  try { FS.mkdirTree(cwd); } catch {} FS.chdir(cwd);
  let code = 0;
  try { code = M.callMain(args) ?? 0; } catch (x) { code = typeof x?.status === 'number' ? x.status : 134; if (typeof x?.status !== 'number') err.push(...new TextEncoder().encode(String(x?.message || x) + '\\n')); }
  const res = [['/', { dir: true }]];
  const walk = (dir) => { for (const n of FS.readdir(dir)) { if (n === '.' || n === '..') continue; const q = (dir === '/' ? '' : dir) + '/' + n; if (SYS.has(q)) continue; let st; try { st = FS.lstat(q); } catch { continue; } if (FS.isDir(st.mode)) { res.push([q, { dir: true }]); walk(q); } else if (FS.isFile(st.mode)) res.push([q, { data: FS.readFile(q) }]); } };
  walk('/');
  // drop Emscripten's own empty default dirs unless the VFS had them or something was written inside
  const keep = res.filter(([p, n]) => !(n.dir && defaults.has(p) && !orig.has(p) && !res.some(([q]) => q.startsWith(p + '/') && !(defaults.has(q) && !orig.has(q)))));
  return { ok: true, out: new Uint8Array(out), err: new Uint8Array(err), code, entries: keep };
}`,w=`
let __MOD = null;
self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try { __MOD = await WebAssembly.compile(d.wasm); self.postMessage({ type: 'ready' }); }
    catch (x) { self.postMessage({ type: 'fail', error: 'WebAssembly compile in worker: ' + (x?.message || x) }); }
    return;
  }
  try { const r = await __bbExec(BusyBoxModule, __MOD, d); r.id = d.id; self.postMessage(r); }
  catch (x) { self.postMessage({ id: d.id, ok: false, error: String(x?.message || x) }); }
};`;var y=16e6,g=class{constructor(r){this.vfs=r,this.module=null,this.wasm=null,this.glue="",this.applets=new Set,this.host="",this.worker=null,this.seq=0,this.pending=new Map,this.mainFns=null,this._p=null,this.error=""}load(){return this._p||=(async()=>{try{let[e,o]=await Promise.all([f(l("busybox.wasm"),"BusyBox"),m(l("busybox.glue.js"),"BusyBox glue")]);this.wasm=e,this.glue=o,this.module=await WebAssembly.compile(e)}catch(e){return this.module=null,this.error=e.message,!1}let r=[],i=async()=>{let e=await this.run(["--list"],"",2e4);if(!e.ok)throw new Error(e.error);if(this.applets=new Set(d.decode(e.out).split(/\s+/).filter(Boolean)),!this.applets.size)throw new Error("busybox --list returned nothing")};try{return this.host="worker",await i(),!0}catch(e){r.push("worker: "+e.message)}try{return this.mainFns=this._mainHost(),this.host="main",await i(),!0}catch(e){return r.push("main thread: "+e.message),this.module=null,this.host="",this.error="BusyBox could not start ("+r.join("; ")+")",!1}})()}get ready(){return!!this.module&&this.applets.size>0}_classicGlue(){return this.glue.replace(/export\s+default\s+BusyBoxModule\s*;?\s*$/,"").replace(/import\.meta\.url/g,'"about:blank"')}_mainHost(){return new Function(this._classicGlue()+`
`+h+`
return { BusyBoxModule, __bbExec };`)()}_spawn(){let r=URL.createObjectURL(new Blob([this._classicGlue()+`
`+h+`
`+w],{type:"text/javascript"})),i,e=new Promise((o,s)=>{try{i=new Worker(r,{name:"busybox"})}catch(t){return s(new Error(`new Worker() refused: ${t.message}`))}let n=setTimeout(()=>s(new Error("worker did not answer within 10s")),1e4);i.onmessage=t=>{t.data.type==="ready"?(clearTimeout(n),i.onmessage=a=>{let c=this.pending.get(a.data.id);c&&(this.pending.delete(a.data.id),c(a.data))},o()):t.data.type==="fail"&&(clearTimeout(n),s(new Error(t.data.error)))},i.onerror=t=>{clearTimeout(n),t.preventDefault?.(),s(new Error(t.message||"worker script was blocked or failed to load"))},i.postMessage({type:"init",wasm:this.wasm})});this.worker={w:()=>i,ready:e,url:r}}_entries(){let r=[];for(let[i,e]of this.vfs.nodes)e.dir?r.push([i,{dir:!0}]):e.data.length<=y&&r.push([i,{data:e.data}]);return r}async run(r,i="",e=3e4,o="/"){if(this.host==="main")try{return await Promise.race([this.mainFns.__bbExec(this.mainFns.BusyBoxModule,this.module,{args:r,stdin:i,entries:this._entries(),cwd:o}),p(e).then(()=>({ok:!1,timeout:!0,error:`timed out after ${e/1e3}s`}))])}catch(t){return{ok:!1,error:String(t?.message||t)}}this.worker||this._spawn();try{await this.worker.ready}catch(t){return this.worker=null,{ok:!1,error:t.message}}let s=++this.seq,n=this.worker.w();return new Promise(t=>{let a=setTimeout(()=>{this.pending.delete(s),n.terminate(),this.worker?.w()===n&&(this.worker=null);for(let[,c]of this.pending)c({ok:!1,error:"worker restarted"});this.pending.clear(),t({ok:!1,timeout:!0,error:`timed out after ${e/1e3}s`})},e);this.pending.set(s,c=>{clearTimeout(a),t(c)}),n.postMessage({id:s,args:r,stdin:i,entries:this._entries(),cwd:o})})}async exec(r,i=[],{stdin:e="",cwd:o="/",timeoutMs:s=3e4}={}){if(!this.ready&&!await this.load())return{stdout:"",stderr:`busybox: ${this.error}
`,code:127};let n=new Map(this.vfs.nodes),t=await this.run([r,...i],e,s,o);return t.ok?(this._apply(t.entries,n),{stdout:d.decode(t.out),stderr:d.decode(t.err),code:t.code}):{stdout:"",stderr:`busybox ${r}: ${t.error}
`,code:t.timeout?124:126}}_apply(r,i){let e=this.vfs,o=new Set;for(let[s,n]of r){if(o.add(s),s==="/")continue;let t=i.get(s),a=e.nodes.get(s);if(n.dir){a||e.mkdirp(s);continue}t&&!t.dir&&u(t.data,n.data)||a&&!a.dir&&u(a.data,n.data)||e.write(s,n.data)}for(let[s,n]of i)s==="/"||o.has(s)||e.nodes.get(s)!==n||!n.dir&&n.data.length>y||e.exists(s)&&e.rm(s,!0)}close(){try{this.worker?.w()?.terminate()}catch{}this.worker?.url&&URL.revokeObjectURL(this.worker.url),this.worker=null}};export{g as BusyBox};
//# sourceMappingURL=busybox.js.map
