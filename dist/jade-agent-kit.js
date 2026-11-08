/*! Jade Agent Kit 0.1.0 | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */
var de=new TextEncoder,H=new TextDecoder,Oe=b=>new Promise(e=>setTimeout(e,b));function oe(b){let e="";for(let t=0;t<b.length;t+=32768)e+=String.fromCharCode.apply(null,b.subarray(t,t+32768));return btoa(e)}var Xe=b=>b instanceof Uint8Array?b:typeof b=="string"?de.encode(b):b instanceof ArrayBuffer?new Uint8Array(b):ArrayBuffer.isView(b)?new Uint8Array(b.buffer,b.byteOffset,b.byteLength):de.encode(String(b??"")),Ze=(b,e)=>{if(b===e)return!0;if(!b||!e||b.length!==e.length)return!1;for(let t=0;t<b.length;t++)if(b[t]!==e[t])return!1;return!0},ge=b=>!!b&&b.length>=16&&String.fromCharCode(...b.subarray(0,15))==="SQLite format 3",_t=b=>!!b&&b.length>=8&&b[0]===0&&b[1]===97&&b[2]===115&&b[3]===109,et=new URL("../assets/",import.meta.url).href,ve=b=>new URL(b,et).href,wt=b=>{b&&(et=new URL(b.endsWith("/")?b:b+"/",location.href).href)},Ut=()=>et;async function ne(b,e=b){let t;try{t=await fetch(b)}catch(r){throw new Error(`could not download ${e} (${r.message||r})`)}if(!t.ok)throw new Error(`could not download ${e}: HTTP ${t.status}`);return new Uint8Array(await t.arrayBuffer())}async function _e(b,e=b){return H.decode(await ne(b,e))}var qe=new Map;function Ae(b,e){return e&&globalThis[e]?Promise.resolve(globalThis[e]):(qe.has(b)||qe.set(b,new Promise((t,r)=>{let i=document.createElement("script");i.src=b,i.async=!0,i.crossOrigin="anonymous",i.onload=()=>t(e?globalThis[e]:!0),i.onerror=()=>{qe.delete(b),r(new Error(`could not load ${b}`))},document.head.appendChild(i)})),qe.get(b))}function Te(b,e="kv"){let t=null,r=()=>t??=new Promise((_,o)=>{let c=indexedDB.open(b,1);c.onupgradeneeded=()=>c.result.createObjectStore(e),c.onsuccess=()=>_(c.result),c.onerror=()=>{t=null,o(c.error)}}),i=async(_,o)=>{let c=await r();return new Promise((p,x)=>{let S=c.transaction(e,_),E=o(S.objectStore(e));S.oncomplete=()=>p(E?.result),S.onerror=()=>x(S.error),S.onabort=()=>x(S.error)})};return{get:_=>i("readonly",o=>o.get(_)),set:(_,o)=>i("readwrite",c=>c.put(o,_)),del:_=>i("readwrite",o=>o.delete(_)),keys:()=>i("readonly",_=>_.getAllKeys()),close:async()=>{t&&(await t).close(),t=null}}}function Fe(b,e,{timeoutMs:t=6e4,transfer:r=[],onMessage:i=null,signal:_=null,name:o="worker"}={}){let c=URL.createObjectURL(new Blob([b],{type:"text/javascript"}));return new Promise(p=>{let x;try{x=new Worker(c,{name:o})}catch(y){URL.revokeObjectURL(c),p({error:`could not start a ${o} worker (${y.message})`});return}let S=!1,E=y=>{S||(S=!0,clearTimeout(k),_?.removeEventListener?.("abort",$),x.terminate(),URL.revokeObjectURL(c),p(y))},k=setTimeout(()=>E({timeout:!0,error:`${o}: stopped after ${t/1e3}s timeout`}),t),$=()=>E({aborted:!0,error:`${o}: stopped`});_?.addEventListener?.("abort",$),x.onmessage=async y=>{i&&await i(y.data,x)||E(y.data)},x.onerror=y=>{y.preventDefault?.(),E({error:`${y.message||o+" error"}${y.lineno?` (line ${y.lineno})`:""}`,lineno:y.lineno})},x.postMessage(e,r)})}var Me=class{constructor({persist:e=!1}={}){this.nodes=new Map([["/",{dir:!0,mtime:Date.now()}]]),this.listeners=new Set,this.store=e?Te("jade-agent-kit:"+e):null,this._t=null,this._saving=null}async load(){if(!this.store)return!1;let e=await this.store.get("vfs");return Array.isArray(e)&&e.length?(this.nodes=new Map(e),this.nodes.has("/")||this.nodes.set("/",{dir:!0,mtime:Date.now()}),!0):!1}async flush(){clearTimeout(this._t),this._t=null,this.store&&await(this._saving=this.store.set("vfs",[...this.nodes.entries()]))}on(e){return this.listeners.add(e),()=>this.listeners.delete(e)}changed(e){for(let t of this.listeners)try{t(e)}catch{}this.store&&(clearTimeout(this._t),this._t=setTimeout(()=>this.flush().catch(()=>{}),150))}norm(e,t="/"){(e==null||e==="")&&(e="."),e=String(e),e==="~"?e="/":e.startsWith("~/")&&(e="/"+e.slice(2));let r=[];for(let i of(e.startsWith("/")?e:t+"/"+e).split("/"))!i||i==="."||(i===".."?r.pop():r.push(i));return"/"+r.join("/")}parent(e){if(e==="/")return"/";let t=e.lastIndexOf("/");return t<=0?"/":e.slice(0,t)}base(e){return e==="/"?"/":e.slice(e.lastIndexOf("/")+1)}exists(e){return this.nodes.has(this.norm(e))}isDir(e){return this.nodes.get(this.norm(e))?.dir===!0}isFile(e){let t=this.nodes.get(this.norm(e));return!!t&&!t.dir}stat(e){e=this.norm(e);let t=this.nodes.get(e);if(!t)throw new Error(`${e}: No such file or directory`);return{dir:!!t.dir,size:t.dir?4096:t.data.length,mtime:t.mtime}}mkdirp(e){if(e=this.norm(e),e!=="/"){if(this.isFile(e))throw new Error(`${e}: Not a directory`);this.isDir(e)||(this.mkdirp(this.parent(e)),this.nodes.set(e,{dir:!0,mtime:Date.now()}),this.changed(e))}}mkdir(e){if(e=this.norm(e),this.exists(e))throw new Error(`${e}: File exists`);if(!this.isDir(this.parent(e)))throw new Error(`${this.parent(e)}: No such file or directory`);this.nodes.set(e,{dir:!0,mtime:Date.now()}),this.changed(e)}readBytes(e){e=this.norm(e);let t=this.nodes.get(e);if(!t)throw new Error(`${e}: No such file or directory`);if(t.dir)throw new Error(`${e}: Is a directory`);return t.data}read(e){return H.decode(this.readBytes(e))}write(e,t,{mkdirs:r=!0}={}){if(e=this.norm(e),e==="/")throw new Error("/: Is a directory");let i=this.parent(e);if(r)this.mkdirp(i);else if(!this.isDir(i))throw new Error(`${i}: No such file or directory`);if(this.isDir(e))throw new Error(`${e}: Is a directory`);this.nodes.set(e,{data:Xe(t),mtime:Date.now()}),this.changed(e)}append(e,t){e=this.norm(e);let r=this.isFile(e)?this.readBytes(e):new Uint8Array,i=Xe(t),_=new Uint8Array(r.length+i.length);_.set(r),_.set(i,r.length),this.write(e,_)}touch(e){e=this.norm(e);let t=this.nodes.get(e);t?(t.mtime=Date.now(),this.changed(e)):this.write(e,"")}list(e="/"){if(e=this.norm(e),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(!this.isDir(e))throw new Error(`${e}: Not a directory`);let t=e==="/"?"/":e+"/",r=[];for(let i of this.nodes.keys())i!==e&&i.startsWith(t)&&!i.slice(t.length).includes("/")&&r.push(i.slice(t.length));return r.sort()}*walk(e="/"){e=this.norm(e);let t=e==="/"?"/":e+"/";for(let r of[...this.nodes.keys()].sort())(r===e||r.startsWith(t))&&(yield r)}rm(e,t=!1){if(e=this.norm(e),e==="/")throw new Error("refusing to remove '/'");if(!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(e)){if(this.list(e).length&&!t)throw new Error(`${e}: Directory not empty`);for(let r of[...this.nodes.keys()])r.startsWith(e+"/")&&this.nodes.delete(r)}this.nodes.delete(e),this.changed(e)}move(e,t){if(e=this.norm(e),t=this.norm(t),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(t)&&(t=(t==="/"?"":t)+"/"+this.base(e)),t===e)return;if(t.startsWith(e+"/"))throw new Error(`cannot move '${e}' into itself`);if(!this.isDir(this.parent(t)))throw new Error(`${this.parent(t)}: No such file or directory`);let r=[...this.nodes.entries()].filter(([i])=>i===e||i.startsWith(e+"/"));for(let[i]of r)this.nodes.delete(i);for(let[i,_]of r)this.nodes.set(t+i.slice(e.length),_);this.changed(t)}copy(e,t,r=!1){if(e=this.norm(e),t=this.norm(t),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(t)&&(t=(t==="/"?"":t)+"/"+this.base(e)),this.isDir(e)){if(!r)throw new Error(`-r not specified; omitting directory '${e}'`);for(let i of[...this.walk(e)]){let _=this.nodes.get(i),o=t+i.slice(e.length);_.dir?this.mkdirp(o):this.write(o,_.data.slice())}}else this.write(t,this.readBytes(e).slice())}entries(){return[...this.nodes.entries()]}replace(e){this.nodes=new Map(e),this.nodes.has("/")||this.nodes.set("/",{dir:!0,mtime:Date.now()}),this.changed("/")}snapshot(){let e={};for(let[t,r]of this.nodes)r.dir||(e[t]=r.data);return e}import(e,t="/"){for(let[r,i]of Object.entries(e))this.write(this.norm(r,t),i)}applyChanges({writes:e={},deletes:t=[],mkdirs:r=[],rmdirs:i=[]},_){for(let o of t)this.isFile(o)&&this.rm(o);for(let o of i)o!=="/"&&this.isDir(o)&&this.rm(o,!0);for(let o of r)try{this.mkdirp(o)}catch(c){_?.(c)}for(let[o,c]of Object.entries(e))try{c===null?this.isFile(o)&&this.rm(o):this.write(o,c)}catch(p){_?.(new Error(`could not save ${o}: ${p.message}`))}}};var tt=`
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
}`,yt=`
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
};`;var bt=16e6,Le=class{constructor(e){this.vfs=e,this.module=null,this.wasm=null,this.glue="",this.applets=new Set,this.host="",this.worker=null,this.seq=0,this.pending=new Map,this.mainFns=null,this._p=null,this.error=""}load(){return this._p||=(async()=>{try{let[r,i]=await Promise.all([ne(ve("busybox.wasm"),"BusyBox"),_e(ve("busybox.glue.js"),"BusyBox glue")]);this.wasm=r,this.glue=i,this.module=await WebAssembly.compile(r)}catch(r){return this.module=null,this.error=r.message,!1}let e=[],t=async()=>{let r=await this.run(["--list"],"",2e4);if(!r.ok)throw new Error(r.error);if(this.applets=new Set(H.decode(r.out).split(/\s+/).filter(Boolean)),!this.applets.size)throw new Error("busybox --list returned nothing")};try{return this.host="worker",await t(),!0}catch(r){e.push("worker: "+r.message)}try{return this.mainFns=this._mainHost(),this.host="main",await t(),!0}catch(r){return e.push("main thread: "+r.message),this.module=null,this.host="",this.error="BusyBox could not start ("+e.join("; ")+")",!1}})()}get ready(){return!!this.module&&this.applets.size>0}_classicGlue(){return this.glue.replace(/export\s+default\s+BusyBoxModule\s*;?\s*$/,"").replace(/import\.meta\.url/g,'"about:blank"')}_mainHost(){return new Function(this._classicGlue()+`
`+tt+`
return { BusyBoxModule, __bbExec };`)()}_spawn(){let e=URL.createObjectURL(new Blob([this._classicGlue()+`
`+tt+`
`+yt],{type:"text/javascript"})),t,r=new Promise((i,_)=>{try{t=new Worker(e,{name:"busybox"})}catch(c){return _(new Error(`new Worker() refused: ${c.message}`))}let o=setTimeout(()=>_(new Error("worker did not answer within 10s")),1e4);t.onmessage=c=>{c.data.type==="ready"?(clearTimeout(o),t.onmessage=p=>{let x=this.pending.get(p.data.id);x&&(this.pending.delete(p.data.id),x(p.data))},i()):c.data.type==="fail"&&(clearTimeout(o),_(new Error(c.data.error)))},t.onerror=c=>{clearTimeout(o),c.preventDefault?.(),_(new Error(c.message||"worker script was blocked or failed to load"))},t.postMessage({type:"init",wasm:this.wasm})});this.worker={w:()=>t,ready:r,url:e}}_entries(){let e=[];for(let[t,r]of this.vfs.nodes)r.dir?e.push([t,{dir:!0}]):r.data.length<=bt&&e.push([t,{data:r.data}]);return e}async run(e,t="",r=3e4,i="/"){if(this.host==="main")try{return await Promise.race([this.mainFns.__bbExec(this.mainFns.BusyBoxModule,this.module,{args:e,stdin:t,entries:this._entries(),cwd:i}),Oe(r).then(()=>({ok:!1,timeout:!0,error:`timed out after ${r/1e3}s`}))])}catch(c){return{ok:!1,error:String(c?.message||c)}}this.worker||this._spawn();try{await this.worker.ready}catch(c){return this.worker=null,{ok:!1,error:c.message}}let _=++this.seq,o=this.worker.w();return new Promise(c=>{let p=setTimeout(()=>{this.pending.delete(_),o.terminate(),this.worker?.w()===o&&(this.worker=null);for(let[,x]of this.pending)x({ok:!1,error:"worker restarted"});this.pending.clear(),c({ok:!1,timeout:!0,error:`timed out after ${r/1e3}s`})},r);this.pending.set(_,x=>{clearTimeout(p),c(x)}),o.postMessage({id:_,args:e,stdin:t,entries:this._entries(),cwd:i})})}async exec(e,t=[],{stdin:r="",cwd:i="/",timeoutMs:_=3e4}={}){if(!this.ready&&!await this.load())return{stdout:"",stderr:`busybox: ${this.error}
`,code:127};let o=new Map(this.vfs.nodes),c=await this.run([e,...t],r,_,i);return c.ok?(this._apply(c.entries,o),{stdout:H.decode(c.out),stderr:H.decode(c.err),code:c.code}):{stdout:"",stderr:`busybox ${e}: ${c.error}
`,code:c.timeout?124:126}}_apply(e,t){let r=this.vfs,i=new Set;for(let[_,o]of e){if(i.add(_),_==="/")continue;let c=t.get(_),p=r.nodes.get(_);if(o.dir){p||r.mkdirp(_);continue}c&&!c.dir&&Ze(c.data,o.data)||p&&!p.dir&&Ze(p.data,o.data)||r.write(_,o.data)}for(let[_,o]of t)_==="/"||i.has(_)||r.nodes.get(_)!==o||!o.dir&&o.data.length>bt||r.exists(_)&&r.rm(_,!0)}close(){try{this.worker?.w()?.terminate()}catch{}this.worker?.url&&URL.revokeObjectURL(this.worker.url),this.worker=null}};function xt(b){let e=b.vfs,t=b.busybox;b.engine||="auto",b.commands||={};function r(s){let n=[],l=0,u=null,m=(a,d)=>{u??=[];let g=u[u.length-1];g&&g.t==="lit"&&g.q===d?g.v+=a:u.push({t:"lit",v:a,q:d})},h=()=>{u&&(n.push({t:"w",segs:u}),u=null)},f=a=>{let d=s[l+1];if(u??=[],d==="("){let w=0,v=l+1;for(;v<s.length;v++)if(s[v]==="(")w++;else if(s[v]===")"&&(w--,!w))break;if(v>=s.length)throw new Error("unterminated $(");u.push({t:"sub",v:s.slice(l+2,v),q:a}),l=v+1;return}if(d==="{"){let w=s.indexOf("}",l);if(w<0)throw new Error("bad substitution");u.push({t:"var",v:s.slice(l+2,w),q:a}),l=w+1;return}let g=/^([A-Za-z_]\w*|[?$#0-9])/.exec(s.slice(l+1));if(g){u.push({t:"var",v:g[1],q:a}),l+=1+g[1].length;return}m("$",a),l++};for(;l<s.length;){let a=s[l];if(a==="\\"){if(s[l+1]===`
`){l+=2;continue}m(s[l+1]??"",!0),l+=2;continue}if(a==="'"){let g=s.indexOf("'",l+1);if(g<0)throw new Error("unterminated quote");u??=[],m(s.slice(l+1,g),!0),l=g+1;continue}if(a==='"'){for(l++,u??=[],m("",!0);l<s.length&&s[l]!=='"';)s[l]==="\\"&&'"\\$`'.includes(s[l+1])?(m(s[l+1],!0),l+=2):s[l]==="$"?f(!0):(m(s[l],!0),l++);if(s[l]!=='"')throw new Error("unterminated quote");l++;continue}if(a==="$"){f(!1);continue}if(a===" "||a==="	"||a==="\r"){h(),l++;continue}if(a===`
`){h(),n.push({t:"op",v:";"}),l++;continue}if(a==="#"&&!u){for(;l<s.length&&s[l]!==`
`;)l++;continue}let d=/^(2>&1|&>|2>>|2>|>>|>&2|1>|>|<|&&|\|\||\||;|&)/.exec(s.slice(l));if(d&&!(u&&d[1].startsWith("2"))){h(),n.push({t:"op",v:d[1]}),l+=d[1].length;continue}m(a,!1),l++}return h(),n}function i(s){let n=[],l=[],u={words:[],redirs:[]},m=()=>{(u.words.length||u.redirs.length)&&l.push(u),u={words:[],redirs:[]}},h=f=>{if(m(),l.length)n.push({pipeline:l,op:f});else if(f==="&&"||f==="||")throw new Error(`syntax error near '${f}'`);l=[]};for(let f=0;f<s.length;f++){let a=s[f];if(a.t==="w"){u.words.push(a.segs);continue}switch(a.v){case"|":m();break;case"&&":case"||":case";":case"&":h(a.v==="&"?";":a.v);break;case"2>&1":case">&2":u.redirs.push({op:a.v});break;default:{let d=s[++f];if(!d||d.t!=="w")throw new Error(`syntax error near '${a.v}'`);u.redirs.push({op:a.v==="1>"?">":a.v,target:d.segs})}}}return h(";"),n}let _="";function o(s,{anchored:n=!0}={}){let l="";for(let u=0;u<s.length;u++){let m=s[u];if(m===_){l+=s[++u].replace(/[.*+?^${}()|[\]\\/]/g,"\\$&");continue}if(m==="*")l+="[^/]*";else if(m==="?")l+="[^/]";else if(m==="["){let h=s.indexOf("]",u+1);if(h>u){let f=s.slice(u+1,h);f[0]==="!"&&(f="^"+f.slice(1)),l+="["+f.replace(/\\/g,"\\\\")+"]",u=h}else l+="\\["}else l+=m.replace(/[.+^${}()|\\/\]]/g,"\\$&")}return new RegExp(n?"^"+l+"$":l)}class c{constructor({cwd:n="/",env:l={},onOutput:u=null}={}){this.cwd=n,this.env={HOME:"/",USER:"agent",SHELL:"/bin/sh",PATH:"/bin",...l},this.lastCode=0,this.onOutput=u,this.aborted=!1,this.timeoutMs=6e4}getVar(n){return n==="?"?String(this.lastCode):n==="$"?"1337":n==="#"?"0":n==="0"?"sh":n==="PWD"?this.cwd:this.env[n]??""}async expandWord(n){let l="",u=!1,m=h=>h.replace(/[*?[\]]/g,f=>_+f);for(let h of n)if(h.t==="lit")h.q?l+=m(h.v):(l+=h.v,/[*?[]/.test(h.v)&&(u=!0));else if(h.t==="var")l+=m(this.getVar(h.v));else if(h.t==="sub"){let f=await this.capture(h.v);l+=m(f.replace(/\n+$/,""))}if(u){let h=this.glob(l);if(h.length)return h}return[l.replaceAll(_,"")]}glob(n){let l=n.startsWith("/"),u=e.norm(n.replaceAll(_,""),this.cwd).replaceAll("",_),m=o(u),h=/(^|\/)\./.test(n.replaceAll(_,"")),f=[];for(let d of e.nodes.keys())d==="/"||!m.test(d)||!h&&/\/\.[^/]*$/.test(d)||f.push(d);if(f.sort(),l)return f;let a=this.cwd==="/"?"/":this.cwd+"/";return f.map(d=>d.startsWith(a)?d.slice(a.length):d)}async capture(n){let l=new c({cwd:this.cwd,env:{...this.env}});return l.aborted=this.aborted,l.timeoutMs=this.timeoutMs,(await l.run(n)).chunks.filter(m=>!m.err).map(m=>m.s).join("")}async run(n,{stdin:l=""}={}){let u=[],m=(a,d=!1)=>{a&&(u.push({s:a,err:d}),this.onOutput?.(a,d))},h;try{h=i(r(n))}catch(a){return m(`sh: ${a.message}
`,!0),this.lastCode=2,{chunks:u,code:2}}let f=";";for(let a of h){if(this.aborted){m(`^C
`,!0),this.lastCode=130;break}if(f==="&&"&&this.lastCode!==0||f==="||"&&this.lastCode===0){f=a.op;continue}try{this.lastCode=await this.runPipeline(a.pipeline,l,m)}catch(d){if(d&&d.__exit!==void 0){this.lastCode=d.__exit;break}m(`sh: ${d.message}
`,!0),this.lastCode=1}f=a.op}return{chunks:u,code:this.lastCode}}async runPipeline(n,l,u){let m=l,h=0;for(let f=0;f<n.length;f++){let a=n[f],d=f===n.length-1,g=[];for(let P of a.words)g.push(...await this.expandWord(P));let w=m,v=null,O=null,D=!1,T=!1;for(let P of a.redirs){if(P.op==="2>&1"){D=!0;continue}if(P.op===">&2"){T=!0;continue}let z=(await this.expandWord(P.target))[0],G=z==="/dev/null"?null:e.norm(z,this.cwd);P.op==="<"?z==="/dev/null"?w="":w=e.read(G):P.op===">"||P.op===">>"?v={p:G,append:P.op===">>",dn:z==="/dev/null"}:P.op==="2>"||P.op==="2>>"?O={p:G,append:P.op==="2>>",dn:z==="/dev/null"}:P.op==="&>"&&(v={p:G,append:!1,dn:z==="/dev/null"},D=!0)}v&&!v.dn&&(v.append?e.exists(v.p)||e.write(v.p,"",{mkdirs:!1}):e.write(v.p,"",{mkdirs:!1}));let M=await this.exec(g,w??""),N=M.out||"",C=M.err||"";D&&(N+=C,C=""),T&&(C+=N,N=""),O&&(O.dn||(O.append?e.append(O.p,C):e.write(O.p,C,{mkdirs:!1})),C=""),v&&(v.dn||e.append(v.p,N),N=""),C&&u(C,!0),d?u(N):m=N,h=M.code}return h}async exec(n,l){for(;n.length&&/^[A-Za-z_]\w*=/.test(n[0]);){let a=n.shift(),d=a.indexOf("=");this.env[a.slice(0,d)]=a.slice(d+1)}if(!n.length)return{out:"",err:"",code:0};let[u,...m]=n;u==="busybox"&&m.length&&!m[0].startsWith("-")&&(u=m.shift());let h={argv:m,stdin:l,sh:this,outS:"",errS:"",o(a){this.outS+=a},e(a){this.errS+=a},P:a=>e.norm(a,this.cwd),name:u},f=a=>({out:h.outS,err:h.errS,code:a??0});try{if(j[u])return f(await j[u](h));if(b.commands[u])return f(await b.commands[u](h));let a=b.engine;if(t.ready&&t.applets.has(u)&&a!=="js"&&!A.has(u)&&!b.commands[u]){let g=await this.execWasm(u,m,l);return g.code!==0&&a==="auto"&&q[u]&&/unrecognized|invalid option|unknown option|not implemented/i.test(g.err)?f(await q[u](h)):g}return a==="wasm"&&!A.has(u)?t.ready?{out:"",err:`sh: ${u}: applet not found in this BusyBox build
`,code:127}:{out:"",err:`sh: ${u}: BusyBox is not loaded${t.error?" ("+t.error+")":""}
`,code:127}:b.commands[u]?f(await b.commands[u](h)):q[u]?f(await q[u](h)):t.ready&&t.applets.has(u)?await this.execWasm(u,m,l):e.isFile(e.norm(u,this.cwd))&&/\.(sh)$/.test(u)?f(await j.sh({...h,argv:[u,...m]})):{out:"",err:`sh: ${u}: not found
`,code:127}}catch(a){if(a&&a.__exit!==void 0)throw a;return{out:h.outS,err:h.errS+`${u}: ${a.message}
`,code:1}}}async execWasm(n,l,u){let m=await t.exec(n,l,{stdin:u,cwd:this.cwd,timeoutMs:this.timeoutMs});return{out:m.stdout,err:m.stderr,code:m.code}}}function p(s,n=""){let l=new Set([...n.matchAll(/(\w):/g)].map(h=>h[1])),u={},m=[];for(let h=0;h<s.length;h++){let f=s[h];if(f==="--"){m.push(...s.slice(h+1));break}if(/^-\d+$/.test(f)&&l.has("n")){u.n=f.slice(1);continue}if(f.startsWith("--")&&f.length>2){let[a,d]=f.slice(2).split("=");u[a]=d??!0;continue}if(f.startsWith("-")&&f.length>1){for(let a=1;a<f.length;a++){let d=f[a];if(l.has(d)){u[d]=f.slice(a+1)||s[++h];break}u[d]=!0}continue}m.push(f)}return{f:u,rest:m}}function x(s,n){return n.length?n.map(l=>{if(l==="-")return{name:"-",text:s.stdin};try{return{name:l,text:e.read(s.P(l))}}catch(u){return s.e(`${s.name}: ${u.message}
`),null}}).filter(Boolean):[{name:"-",text:s.stdin}]}let S=s=>{if(!s)return[];let n=s.split(`
`);return n[n.length-1]===""&&n.pop(),n};function E(s){let n="";for(let l=0;l<s.length;l++){let u=s[l];if(u==="\\"&&l+1<s.length){let m=s[++l];"(){}|+?".includes(m)?n+=m:n+="\\"+m}else"(){}|+?".includes(u)?n+="\\"+u:n+=u}return n}let k=s=>s<1024?s+"":s<1048576?(s/1024).toFixed(1)+"K":(s/1048576).toFixed(1)+"M",$="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" "),y=s=>{let n=new Date(s);return`${$[n.getMonth()]} ${String(n.getDate()).padStart(2)} ${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`},A=new Set(["node","js","python","python3","sqlite3","help","sh","bash","xargs"]),j={cd(s){let n=s.P(s.argv[0]??"/");return e.isDir(n)?(s.sh.cwd=n,0):(s.e(`cd: ${s.argv[0]}: No such directory
`),1)},pwd(s){return s.o(s.sh.cwd+`
`),0},export(s){for(let n of s.argv){let l=n.indexOf("=");l>0&&(s.sh.env[n.slice(0,l)]=n.slice(l+1))}return 0},unset(s){for(let n of s.argv)delete s.sh.env[n];return 0},exit(s){throw{__exit:parseInt(s.argv[0]??"0")||0}},true:()=>0,false:()=>1,":":()=>0,async sh(s){let{f:n,rest:l}=p(s.argv,"c:"),u=new c({cwd:s.sh.cwd,env:{...s.sh.env}});u.timeoutMs=s.sh.timeoutMs;let m=n.c;m==null&&(l.length?m=e.read(s.P(l[0])):m=s.stdin);let h=await u.run(m);for(let f of h.chunks)f.err?s.e(f.s):s.o(f.s);return h.code},get bash(){return this.sh},source(s){return j.sh(s)},which(s){let n=0;for(let l of s.argv)j[l]||q[l]||b.commands[l]||t.applets.has(l)?s.o(`/bin/${l}
`):n=1;return n},type(s){for(let n of s.argv)s.o(j[n]?`${n} is a shell builtin
`:t.applets.has(n)&&b.engine!=="js"?`${n} is /bin/${n} (busybox.wasm)
`:q[n]?`${n} is /bin/${n} (js applet)
`:`${n}: not found
`);return 0},help(s){let n=new Set([...Object.keys(j),...Object.keys(q),...Object.keys(b.commands),...t.applets]);return s.o(`Jade Agent Kit shell \u2014 ${t.ready?`BusyBox WASM (${t.applets.size} applets) + JS`:"JS applets"}
Supports: pipes |, redirects > >> < 2> 2>&1 &>, && || ;, $VAR, $(cmd), globs * ? [..]
No loops/if blocks: use node or python for scripting. Extra: ${Object.keys(b.commands).sort().join(", ")}, xargs.

`+[...n].sort().join("  ")+`
`),0},async xargs(s){let{f:n,rest:l}=p(s.argv,"n:I:"),u=s.stdin.split(/\s+/).filter(Boolean),m=l.length?l:["echo"],h=async a=>{let d=await s.sh.exec([...a],"");return s.o(d.out),s.e(d.err),d.code},f=0;if(n.I)for(let a of s.stdin.split(`
`).filter(Boolean))f=await h(m.map(d=>d.replaceAll(n.I,a)))||f;else{let a=parseInt(n.n)||u.length||1;for(let d=0;d<Math.max(u.length,1);d+=a)f=await h([...m,...u.slice(d,d+a)])||f}return f}},q={echo(s){let n=s.argv,l=!0,u=!1;for(;n.length&&/^-[neE]+$/.test(n[0]);)n[0].includes("n")&&(l=!1),n[0].includes("e")&&(u=!0),n=n.slice(1);let m=n.join(" ");return u&&(m=m.replace(/\\(n|t|\\|e|r)/g,(h,f)=>({n:`
`,t:"	","\\":"\\",e:"\x1B",r:"\r"})[f])),s.o(m+(l?`
`:"")),0},printf(s){let[n="",...l]=s.argv,u=0,m=n.replace(/\\n/g,`
`).replace(/\\t/g,"	").replace(/%(-?\d*)([sdif%])/g,(h,f,a)=>{if(a==="%")return"%";let d=l[u++]??"";a==="d"||a==="i"?d=String(parseInt(d)||0):a==="f"&&(d=String(parseFloat(d)||0));let g=parseInt(f);return isNaN(g)?d:g<0?d.padEnd(-g):d.padStart(g)});return s.o(m),0},cat(s){let{f:n,rest:l}=p(s.argv),u=1;for(let m of x(s,l))n.n?s.o(S(m.text).map(h=>`${String(u++).padStart(6)}	${h}`).join(`
`)+`
`):s.o(m.text);return s.errS?1:0},ls(s){let{f:n,rest:l}=p(s.argv),u=l.length?l:["."],m=0,h=u.length>1||n.R,f=(d,g)=>{let w=e.stat(d);return n.l?`${w.dir?"drwxr-xr-x":"-rw-r--r--"} 1 agent agent ${(n.h?k(w.size):String(w.size)).padStart(7)} ${y(w.mtime)} ${g}${w.dir&&n.F!==!1?"/":""}`:g+(w.dir?"/":"")},a=(d,g)=>{let w=e.list(d);!n.a&&!n.A&&(w=w.filter(v=>!v.startsWith("."))),n.t&&w.sort((v,O)=>e.stat(e.norm(O,d)).mtime-e.stat(e.norm(v,d)).mtime),n.r&&w.reverse(),h&&s.o(`${g}:
`),n.l&&s.o(`total ${w.length}
`);for(let v of w)s.o(f(e.norm(v,d),v)+`
`);if(n.R)for(let v of w){let O=e.norm(v,d);e.isDir(O)&&(s.o(`
`),a(O,g==="."?"./"+v:g.replace(/\/$/,"")+"/"+v))}};for(let d of u){let g=s.P(d);if(!e.exists(g)){s.e(`ls: ${d}: No such file or directory
`),m=1;continue}e.isDir(g)&&!n.d?a(g,d):s.o(f(g,d)+`
`),h&&!n.R&&s.o(`
`)}return m},mkdir(s){let{f:n,rest:l}=p(s.argv);for(let u of l)n.p?e.mkdirp(s.P(u)):e.mkdir(s.P(u));return 0},rmdir(s){for(let n of s.argv)e.rm(s.P(n),!1);return 0},rm(s){let{f:n,rest:l}=p(s.argv),u=0;for(let m of l){let h=s.P(m);if(!e.exists(h)){n.f||(s.e(`rm: ${m}: No such file or directory
`),u=1);continue}if(e.isDir(h)&&!(n.r||n.R)){s.e(`rm: ${m}: is a directory
`),u=1;continue}e.rm(h,!0)}return u},touch(s){for(let n of p(s.argv).rest){let l=s.P(n);e.isFile(l)?e.touch(l):e.write(l,"",{mkdirs:!1})}return 0},mv(s){let{rest:n}=p(s.argv),l=s.P(n.pop());if(n.length>1&&!e.isDir(l))throw new Error(`target '${l}' is not a directory`);for(let u of n)e.move(s.P(u),l);return 0},cp(s){let{f:n,rest:l}=p(s.argv),u=s.P(l.pop());for(let m of l)e.copy(s.P(m),u,n.r||n.R||n.a);return 0},head(s){let{f:n,rest:l}=p(s.argv,"n:c:");for(let u of x(s,l))if(n.c)s.o(u.text.slice(0,+n.c));else{let m=+(n.n??10),h=S(u.text);s.o((m<0,h.slice(0,m)).map(f=>f+`
`).join(""))}return 0},tail(s){let{f:n,rest:l}=p(s.argv,"n:c:");for(let u of x(s,l))if(n.c)s.o(u.text.slice(-n.c));else{let m=S(u.text),h=String(n.n??10);s.o((h.startsWith("+")?m.slice(+h.slice(1)-1):m.slice(-Math.abs(+h)||m.length)).map(f=>f+`
`).join(""))}return 0},wc(s){let{f:n,rest:l}=p(s.argv),u=!n.l&&!n.w&&!n.c&&!n.m,m=[0,0,0],h=x(s,l),f=(a,d)=>[n.l||u?a[0]:null,n.w||u?a[1]:null,n.c||n.m||u?a[2]:null].filter(g=>g!=null).map(g=>String(g).padStart(7)).join(" ")+(d!=="-"?" "+d:"")+`
`;for(let a of h){let d=[(a.text.match(/\n/g)||[]).length,(a.text.match(/\S+/g)||[]).length,de.encode(a.text).length];m=m.map((g,w)=>g+d[w]),s.o(f(d,a.name))}return h.length>1&&s.o(f(m,"total")),0},grep(s){let{f:n,rest:l}=p(s.argv,"e:m:A:B:C:"),u=n.e??l.shift();if(u==null)return s.e(`usage: grep [-inrvlcEFwoq] PATTERN [FILE...]
`),2;let m=n.F?u.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"):n.E||n.P?u:E(u);n.w&&(m=`\\b(?:${m})\\b`),n.x&&(m=`^(?:${m})$`);let h=new RegExp(m,n.i?"i":""),f=new RegExp(m,n.i?"gi":"g"),a=l,d=n.r||n.R;d&&!a.length&&(a=["."]);let g=[];for(let T of a){let M=s.P(T);if(e.isDir(M)){if(!d){s.e(`grep: ${T}: Is a directory
`);continue}for(let N of e.walk(M))e.isFile(N)&&!/\/(node_modules|\.git)\//.test(N)&&g.push({name:T==="."?N.slice(s.sh.cwd==="/"?1:s.sh.cwd.length+1):T.replace(/\/$/,"")+N.slice(M.length),p:N})}else g.push({name:T,p:M})}let w=a.length?g.map(T=>{try{return{name:T.name,text:e.read(T.p)}}catch(M){return s.e(`grep: ${M.message}
`),null}}).filter(Boolean):[{name:"-",text:s.stdin}],v=(w.length>1||d)&&!n.h,O=!1,D=n.m?+n.m:1/0;for(let T of w){let M=0,N=S(T.text);for(let C=0;C<N.length&&M<D;C++){if(!(h.test(N[C])!==!!n.v))continue;if(M++,O=!0,n.q)return 0;if(n.l||n.c)continue;let z=(v?T.name+":":"")+(n.n?C+1+":":"");if(n.o)for(let G of N[C].matchAll(f))s.o(z+G[0]+`
`);else s.o(z+N[C]+`
`)}n.l&&M&&s.o(T.name+`
`),n.c&&s.o((v?T.name+":":"")+M+`
`)}return O?0:1},find(s){let n=[...s.argv],l=[];for(;n.length&&!n[0].startsWith("-")&&n[0]!=="("&&n[0]!=="!";)l.push(n.shift());l.length||l.push(".");let u=[],m=1/0,h=0,f=!1;for(;n.length;){let a=n.shift();if(a==="!"||a==="-not"){f=!0;continue}let d=g=>{let w=f;u.push(w?(v,O)=>!g(v,O):g),f=!1};if(a==="-name"){let g=o(n.shift());d((w,v)=>g.test(v))}else if(a==="-iname"){let g=new RegExp(o(n.shift()).source,"i");d((w,v)=>g.test(v))}else if(a==="-path"||a==="-wholename"){let g=n.shift(),w=new RegExp(o(g).source.replace(/\[\^\/\]\*/g,".*"));d((v,O,D)=>w.test(D))}else if(a==="-type"){let g=n.shift();d(w=>g==="d"?e.isDir(w):e.isFile(w))}else if(a==="-maxdepth")m=+n.shift();else if(a==="-mindepth")h=+n.shift();else if(a==="-size"){let g=n.shift(),w=/^([+-]?)(\d+)([ckM]?)$/.exec(g),v={c:1,k:1024,M:1048576,"":512}[w[3]],O=+w[2]*v;d(D=>{if(!e.isFile(D))return!1;let T=e.stat(D).size;return w[1]==="+"?T>O:w[1]==="-"?T<O:T===O})}else if(a==="-empty")d(g=>e.isDir(g)?e.list(g).length===0:e.stat(g).size===0);else if(!(a==="-print"||a==="-o"||a==="-a"))return s.e(`find: unsupported option ${a} 
`),1}for(let a of l){let d=s.P(a);if(!e.exists(d)){s.e(`find: ${a}: No such file or directory
`);continue}for(let g of e.walk(d)){let w=g===d?"":g.slice(d==="/"?1:d.length+1),v=w?w.split("/").length:0;if(v>m||v<h||/\/(node_modules|\.git)(\/|$)/.test(w)&&!a.includes("node_modules"))continue;let O=w?a==="/"?"/"+w:a.replace(/\/$/,"")+"/"+w:a;u.every(D=>D(g,e.base(g),O))&&s.o(O+`
`)}}return 0},tree(s){let{f:n,rest:l}=p(s.argv,"L:"),u=s.P(l[0]||"."),m=0,h=0,f=n.L?+n.L:1/0;s.o((l[0]||".")+`
`);let a=(d,g,w)=>{if(w>f)return;let v=e.list(d).filter(O=>n.a||!O.startsWith("."));v.forEach((O,D)=>{let T=e.norm(O,d),M=D===v.length-1,N=e.isDir(T);N?m++:h++,s.o(g+(M?"\u2514\u2500\u2500 ":"\u251C\u2500\u2500 ")+O+(N?"/":"")+`
`),N&&a(T,g+(M?"    ":"\u2502   "),w+1)})};return a(u,"",1),s.o(`
${m} directories, ${h} files
`),0},sort(s){let{f:n,rest:l}=p(s.argv,"k:t:"),u=x(s,l).flatMap(h=>S(h.text)),m=h=>n.k?(n.t?h.split(n.t):h.trim().split(/\s+/)).slice(parseInt(n.k)-1).join(" "):h;return u.sort((h,f)=>n.n?(parseFloat(m(h))||0)-(parseFloat(m(f))||0):n.f?m(h).toLowerCase().localeCompare(m(f).toLowerCase()):m(h)<m(f)?-1:m(h)>m(f)?1:0),n.r&&u.reverse(),n.u&&(u=u.filter((h,f)=>f===0||h!==u[f-1])),s.o(u.map(h=>h+`
`).join("")),0},uniq(s){let{f:n,rest:l}=p(s.argv),u=x(s,l).flatMap(h=>S(h.text)),m=[];for(let h of u)m.length&&m[m.length-1][0]===h?m[m.length-1][1]++:m.push([h,1]);for(let[h,f]of m)n.d&&f<2||n.u&&f>1||s.o((n.c?String(f).padStart(7)+" ":"")+h+`
`);return 0},cut(s){let{f:n,rest:l}=p(s.argv,"d:f:c:"),u=m=>m.split(",").flatMap(h=>{let[f,a]=h.split("-"),d=f?+f:1,g=h.includes("-")?a?+a:1e9:d,w=[];for(let v=d;v<=Math.min(g,1e3);v++)w.push(v);return w});for(let m of x(s,l).flatMap(h=>S(h.text)))if(n.c){let h=u(n.c);s.o(h.map(f=>m[f-1]??"").join("")+`
`)}else{let h=n.d??"	",f=m.split(h);if(f.length===1&&!m.includes(h)){s.o(m+`
`);continue}s.o(u(n.f||"1").filter(a=>a<=f.length).map(a=>f[a-1]).join(h)+`
`)}return 0},tr(s){let{f:n,rest:l}=p(s.argv),u=a=>{a=a.replace(/\[:upper:\]/g,"A-Z").replace(/\[:lower:\]/g,"a-z").replace(/\[:digit:\]/g,"0-9").replace(/\[:space:\]/g,` 	
`).replace(/\\n/g,`
`).replace(/\\t/g,"	");let d="";for(let g=0;g<a.length;g++)if(a[g+1]==="-"&&a[g+2]){for(let w=a.charCodeAt(g);w<=a.charCodeAt(g+2);w++)d+=String.fromCharCode(w);g+=2}else d+=a[g];return d},m=u(l[0]||""),h=u(l[1]||""),f="";for(let a of s.stdin){let d=m.indexOf(a);n.d?d<0&&(f+=a):d>=0&&h?f+=h[Math.min(d,h.length-1)]:f+=a}return n.s&&(f=f.replace(new RegExp(`([${(h||m).replace(/[\]\\^-]/g,"\\$&")}])\\1+`,"g"),"$1")),s.o(f),0},sed(s){let n=[],l=[],u=!1,m=!1,h=!1,f=s.argv;for(let T=0;T<f.length;T++){let M=f[T];M==="-n"?u=!0:M==="-i"||M.startsWith("-i")?m=!0:M==="-E"||M==="-r"?h=!0:M==="-e"?n.push(f[++T]):M.startsWith("-")&&M.length>1&&/^-[nEr]+$/.test(M)?(M.includes("n")&&(u=!0),/[Er]/.test(M)&&(h=!0)):!n.length&&!l.length&&!f.slice(0,T).includes("-e")?n.push(M):l.push(M)}let a=(T,M="")=>new RegExp(h?T:E(T),M),d=[],g=n.join(`
`),w=0,v=T=>{let M="";for(;w<g.length&&g[w]!==T;){if(g[w]==="\\"&&g[w+1]===T){M+=T,w+=2;continue}if(g[w]==="\\"&&g[w+1]==="n"&&T!=="n"){M+="\\n",w+=2;continue}M+=g[w++]}return w++,M},O=()=>{if(g[w]==="/")return w++,{re:a(v("/"))};if(g[w]==="$")return w++,{last:!0};let T=/^\d+/.exec(g.slice(w));return T?(w+=T[0].length,{n:+T[0]}):null};for(;w<g.length;){for(;/[\s;]/.test(g[w]||"");)w++;if(w>=g.length)break;let T=O(),M=null;for(T&&g[w]===","&&(w++,M=O());g[w]===" ";)w++;let N=!1;g[w]==="!"&&(N=!0,w++);let C=g[w++],P={a1:T,a2:M,bang:N,op:C,on:!1};if(C==="s"){let z=g[w++],G=v(z),W=v(z),V="";for(;/[gipI0-9]/.test(g[w]||"");)V+=g[w++];P.re=a(G,(V.includes("g")?"g":"")+(/[iI]/.test(V)?"i":"")),P.rep=W.replace(/\$/g,"$$$$").replace(/\\(\d)/g,"$$$1").replace(/(^|[^\\])&/g,"$1$$&").replace(/\\&/g,"&").replace(/\\n/g,`
`),P.p=V.includes("p")}else if(C==="a"||C==="i"||C==="c"){for(;g[w]===" "||g[w]==="\\";)w++;let z="";for(;w<g.length&&g[w]!==`
`&&g[w]!==";";)z+=g[w++];P.text=z}else if(!"dpq=".includes(C))return s.e(`sed: unsupported command '${C}' (BusyBox WASM sed supports it)
`),1;d.push(P)}let D=T=>{let M=S(T),N="";for(let C=0;C<M.length;C++){let P=M[C],z=!1,G=!1,W=C===M.length-1,V="",be="";for(let R of d){let he=X=>X&&(X.n?X.n===C+1:X.last?W:X.re.test(P)),Y;if(R.a1?R.a2?!R.on&&he(R.a1)?(R.on=!0,Y=!0,R.a2.n&&R.a2.n<=C+1&&(R.on=!1)):R.on?(Y=!0,he(R.a2)&&(R.on=!1)):Y=!1:Y=he(R.a1):Y=!0,R.bang&&(Y=!Y),!!Y)if(R.op==="s"){R.re.lastIndex=0;let X=P.replace(R.re,R.rep);(X!==P||R.re.test(P))&&(P=X,R.p&&(N+=P+`
`))}else if(R.op==="d"){z=!0;break}else if(R.op==="p")N+=P+`
`;else if(R.op==="q"){G=!0;break}else R.op==="="?N+=C+1+`
`:R.op==="a"?be+=R.text+`
`:R.op==="i"?V+=R.text+`
`:R.op==="c"&&(P=R.text)}if(N+=V,!z&&!u&&(N+=P+`
`),N+=be,G)break}return N};if(m){for(let T of l){let M=s.P(T);e.write(M,D(e.read(M)))}return 0}for(let T of x(s,l))s.o(D(T.text));return 0},awk(s){let{f:n,rest:l}=p(s.argv,"F:"),u=l.shift()||"",m=/^\s*(?:\/(.*)\/)?\s*(?:\{\s*print\s*([^}]*)\})?\s*$/.exec(u);if(!m)return s.e(`awk: only "[/re/] { print ... }" is supported by the JS fallback; BusyBox WASM provides full awk
`),2;let h=m[1]?new RegExp(m[1]):null,f=(m[2]??"$0").split(",").map(d=>d.trim()).filter(Boolean),a=0;for(let d of x(s,l).flatMap(g=>S(g.text))){if(a++,h&&!h.test(d))continue;let g=n.F?d.split(n.F==="\\t"?"	":n.F):d.trim().split(/\s+/);s.o((f.length?f:["$0"]).map(w=>w.split(/\s+/).map(v=>v==="$0"?d:/^\$\d+$/.test(v)?g[+v.slice(1)-1]??"":v==="NR"?a:v==="NF"?g.length:v==="$NF"?g[g.length-1]:v.replace(/^"|"$/g,"")).join("")).join(" ")+`
`)}return 0},tee(s){let{f:n,rest:l}=p(s.argv);for(let u of l)n.a?e.append(s.P(u),s.stdin):e.write(s.P(u),s.stdin);return s.o(s.stdin),0},seq(s){let n=s.argv.map(Number),[l,u,m]=n.length===1?[1,1,n[0]]:n.length===2?[n[0],1,n[1]]:n;for(let h=l;u>0?h<=m:h>=m;h+=u)s.o(h+`
`);return 0},async sleep(s){return await Oe(Math.min(parseFloat(s.argv[0])*1e3||0,3e4)),0},date(s){let n=new Date;return s.o(s.argv[0]==="-I"||s.argv[0]==="--iso-8601"?n.toISOString().slice(0,10)+`
`:s.argv[0]==="+%s"?Math.floor(n/1e3)+`
`:n.toString()+`
`),0},env(s){for(let[n,l]of Object.entries(s.sh.env))s.o(`${n}=${l}
`);return 0},basename(s){let n=e.base(e.norm(s.argv[0]||""));return s.argv[1]&&n.endsWith(s.argv[1])&&(n=n.slice(0,-s.argv[1].length)),s.o(n+`
`),0},dirname(s){let n=s.argv[0]||".",l=n.replace(/\/$/,"").lastIndexOf("/");return s.o((l<0?".":l===0?"/":n.slice(0,l))+`
`),0},realpath(s){for(let n of s.argv)s.o(s.P(n)+`
`);return 0},stat(s){for(let n of s.argv){let l=e.stat(s.P(n));s.o(`  File: ${n}
  Size: ${l.size}	Type: ${l.dir?"directory":"regular file"}
Modify: ${new Date(l.mtime).toISOString()}
`)}return 0},du(s){let{f:n,rest:l}=p(s.argv);for(let u of l.length?l:["."]){let m=0;for(let h of e.walk(s.P(u)))e.isFile(h)&&(m+=e.stat(h).size);s.o(`${n.h?k(m):Math.ceil(m/1024)}	${u}
`)}return 0},base64(s){let{f:n,rest:l}=p(s.argv),u=x(s,l)[0]?.text??"";if(n.d)s.o(H.decode(Uint8Array.from(atob(u.replace(/\s/g,"")),m=>m.charCodeAt(0))));else{let m="";for(let h of de.encode(u))m+=String.fromCharCode(h);s.o(btoa(m).replace(/.{76}/g,`$&
`)+`
`)}return 0},rev(s){for(let n of x(s,s.argv).flatMap(l=>S(l.text)))s.o([...n].reverse().join("")+`
`);return 0},nl(s){let n=1;for(let l of x(s,s.argv).flatMap(u=>S(u.text)))s.o(l.trim()?`${String(n++).padStart(6)}	${l}
`:`
`);return 0},test(s){let n=[...s.argv];if(s.name==="["&&n.pop()!=="]")return s.e(`[: missing ]
`),2;let l=!1;n[0]==="!"&&(l=!0,n.shift());let u,[m,h,f]=n;if(n.length===0)u=!1;else if(n.length===1)u=m!=="";else if(n.length===2){let a=s.P(h);u={"-f":e.isFile(a),"-d":e.isDir(a),"-e":e.exists(a),"-s":e.isFile(a)&&e.stat(a).size>0,"-z":h==="","-n":h!=="","-r":e.exists(a),"-w":e.exists(a),"-x":!1}[m]??!1}else u={"=":m===f,"==":m===f,"!=":m!==f,"-eq":+m==+f,"-ne":+m!=+f,"-lt":+m<+f,"-le":+m<=+f,"-gt":+m>+f,"-ge":+m>=+f}[h]??!1;return(l?!u:u)?0:1},get"["(){return this.test},yes(s){return s.o(((s.argv[0]??"y")+`
`).repeat(100)),0},whoami(s){return s.o((s.sh.env.USER||"agent")+`
`),0},uname(s){return s.o(s.argv.includes("-a")?`JadeAgentKit browser 1.0 ${navigator.platform||"web"} wasm32
`:`JadeAgentKit
`),0},async sha256sum(s){for(let n of x(s,s.argv)){let l=await crypto.subtle.digest("SHA-256",de.encode(n.text));s.o([...new Uint8Array(l)].map(u=>u.toString(16).padStart(2,"0")).join("")+"  "+n.name+`
`)}return 0},diff(s){let{f:n,rest:l}=p(s.argv);if(l.length<2)return s.e(`usage: diff [-u] FILE1 FILE2
`),2;let u=S(e.read(s.P(l[0]))),m=S(e.read(s.P(l[1])));return u.join(`
`)===m.join(`
`)?0:u.length*m.length>4e6?(s.o(`Files ${l[0]} and ${l[1]} differ
`),1):(s.o(`--- ${l[0]}
+++ ${l[1]}
`+I(u,m)),1)}};function I(s,n,l=3){let u=s.length,m=n.length,h=Array.from({length:u+1},()=>new Uint32Array(m+1));for(let v=u-1;v>=0;v--)for(let O=m-1;O>=0;O--)h[v][O]=s[v]===n[O]?h[v+1][O+1]+1:Math.max(h[v+1][O],h[v][O+1]);let f=[],a=0,d=0;for(;a<u||d<m;)a<u&&d<m&&s[a]===n[d]?(f.push([" ",s[a],a,d]),a++,d++):a<u&&(d>=m||h[a+1][d]>=h[a][d+1])?(f.push(["-",s[a],a,d]),a++):(f.push(["+",n[d],a,d]),d++);let g="",w=0;for(;w<f.length;){if(f[w][0]===" "){w++;continue}let v=Math.max(0,w-l),O=w;for(;O<f.length;){if(f[O][0]!==" "){O++;continue}let N=0;for(;O+N<f.length&&f[O+N][0]===" ";)N++;if(N>l*2||O+N>=f.length){O=Math.min(f.length,O+l);break}O+=N}let D=f.slice(v,O),T=D[0][2]+1,M=D[0][3]+1;g+=`@@ -${T},${D.filter(N=>N[0]!=="+").length} +${M},${D.filter(N=>N[0]!=="-").length} @@
`+D.map(N=>N[0]+N[1]+`
`).join(""),w=O}return g}return{Shell:c,BUILTINS:j,APPLETS:q,opts:p,inputs:x,splitLines:S,tokenize:r,parse:i,globToRe:o}}var Ne=class{constructor(e,{cwd:t="/",env:r={},timeoutMs:i=6e4}={},_=null,o=()=>"auto"){this.core=e,this.bb=_,this.engine=o,this.sh=new e.Shell({cwd:t,env:r}),this.sh.timeoutMs=i}get cwd(){return this.sh.cwd}set cwd(e){this.sh.cwd=e}get env(){return this.sh.env}async run(e,{stdin:t="",timeoutMs:r,onOutput:i,signal:_}={}){this.bb&&!this.bb.ready&&this.engine()!=="js"&&await this.bb.load();let o=this.sh;r&&(o.timeoutMs=r),o.onOutput=i||null,o.aborted=!1;let c=()=>{o.aborted=!0};_?.addEventListener?.("abort",c);try{let p=await o.run(String(e??""),{stdin:t}),x=p.chunks.filter(E=>!E.err).map(E=>E.s).join(""),S=p.chunks.filter(E=>E.err).map(E=>E.s).join("");return{stdout:x,stderr:S,code:p.code,output:p.chunks.map(E=>E.s).join("")}}finally{_?.removeEventListener?.("abort",c),o.onOutput=null}}};function St({vfs:b,busybox:e,engine:t="auto",commands:r={}}){let i={vfs:b,busybox:e,engine:t,commands:r},_=xt(i);return{core:_,commands:r,session:o=>new Ne(_,o,e,()=>i.engine),get engine(){return i.engine},set engine(o){i.engine=o}}}var st=`
const __out = []; let __files = {}; let __dirs = new Set(['/']); const __writes = {}; const __mk = new Set(); const __rmd = new Set(); let __cwd = '/';
const __norm = (p) => { p = String(p); if (p.startsWith('file://')) p = p.slice(7); const parts = (p.startsWith('/') ? p : __cwd + '/' + p).split('/'); const o = []; for (const s of parts) { if (!s || s === '.') continue; if (s === '..') o.pop(); else o.push(s); } return '/' + o.join('/'); };
const __fmt = (a) => a.map(x => typeof x === 'string' ? x : (() => { try { return x instanceof Error ? (x.stack || String(x)) : x === undefined ? 'undefined' : typeof x === 'function' ? '[Function]' : JSON.stringify(x, (k, v) => v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : typeof v === 'bigint' ? String(v) : v, 2) ?? String(x); } catch { return String(x); } })()).join(' ');
const __log = (k) => (...a) => { __out.push([k, __fmt(a) + '\\n']); };
const console = { log: __log('o'), info: __log('o'), debug: __log('o'), dir: __log('o'), table: __log('o'), warn: __log('e'), error: __log('e'), time() {}, timeEnd() {}, group() {}, groupEnd() {} };
const __isFile = p => (p in __writes) ? __writes[p] !== null : (p in __files);
const __isDir = p => __dirs.has(p);
const __parent = p => p === '/' ? '/' : (p.slice(0, p.lastIndexOf('/')) || '/');
const __err = (code, op, p) => { const e = new Error(\`\${code}: \${{ ENOENT: 'no such file or directory', EISDIR: 'illegal operation on a directory', ENOTDIR: 'not a directory', EEXIST: 'file already exists', ENOTEMPTY: 'directory not empty' }[code] || code}, \${op} '\${p}'\`); e.code = code; e.syscall = op; e.path = p; return e; };
const __mkp = p => { const chain = []; while (p !== '/' && !__dirs.has(p)) { if (__isFile(p)) throw __err('ENOTDIR', 'mkdir', p); chain.push(p); p = __parent(p); } for (const d of chain) { __dirs.add(d); __mk.add(d); __rmd.delete(d); } };
const __kids = p => { const pre = p === '/' ? '/' : p + '/'; const s = new Set(); const add = k => { if (k.startsWith(pre) && k !== p) s.add(k.slice(pre.length).split('/')[0]); }; for (const k of Object.keys(__files)) if (__isFile(k)) add(k); for (const k of Object.keys(__writes)) if (__writes[k] !== null) add(k); for (const d of __dirs) add(d); return [...s].sort(); };
const __enc = (o) => typeof o === 'string' ? o : o && o.encoding;
class Dirent { constructor(name, dir) { this.name = name; this._d = dir; } isFile() { return !this._d; } isDirectory() { return this._d; } isSymbolicLink() { return false; } }
const fs = {
  readFileSync(p, o) { p = __norm(p); if (__isDir(p)) throw __err('EISDIR', 'read', p); if (!__isFile(p)) throw __err('ENOENT', 'open', p); const t = (p in __writes) ? __writes[p] : __files[p]; if (t instanceof Uint8Array && (o === 'utf8' || o === 'utf-8' || (o && o.encoding))) return new TextDecoder().decode(t); return t; },
  writeFileSync(p, d) { p = __norm(p); if (__isDir(p)) throw __err('EISDIR', 'open', p); __mkp(__parent(p)); __writes[p] = typeof d === 'string' ? d : d == null ? '' : (d instanceof Uint8Array ? new TextDecoder().decode(d) : String(d)); },
  appendFileSync(p, d) { let prev = ''; try { prev = fs.readFileSync(p); } catch (e) { if (e.code !== 'ENOENT') throw e; } fs.writeFileSync(p, prev + String(d)); },
  existsSync(p) { p = __norm(p); return __isFile(p) || __isDir(p); },
  accessSync(p) { if (!fs.existsSync(p)) throw __err('ENOENT', 'access', __norm(p)); },
  readdirSync(p, o) { p = __norm(p); if (__isFile(p)) throw __err('ENOTDIR', 'scandir', p); if (!__isDir(p)) throw __err('ENOENT', 'scandir', p); const names = __kids(p); if (o && o.recursive) { const out = []; const rec = (d, pre) => { for (const n of __kids(d)) { const q = d === '/' ? '/' + n : d + '/' + n; out.push(o.withFileTypes ? new Dirent(pre + n, __isDir(q)) : pre + n); if (__isDir(q)) rec(q, pre + n + '/'); } }; rec(p, ''); return out; } return o && o.withFileTypes ? names.map(n => new Dirent(n, __isDir(p === '/' ? '/' + n : p + '/' + n))) : names; },
  statSync(p, o) { p = __norm(p); const d = __isDir(p); if (!d && !__isFile(p)) { if (o && o.throwIfNoEntry === false) return undefined; throw __err('ENOENT', 'stat', p); } const size = d ? 4096 : (x => typeof x === 'string' ? new TextEncoder().encode(x).length : x.length)(fs.readFileSync(p)); const t = new Date(); return { size, isFile: () => !d, isDirectory: () => d, isSymbolicLink: () => false, mtime: t, ctime: t, birthtime: t, mtimeMs: +t }; },
  mkdirSync(p, o) { p = __norm(p); const rec = o === true || (o && o.recursive); if (__isDir(p)) { if (rec) return undefined; throw __err('EEXIST', 'mkdir', p); } if (__isFile(p)) throw __err('EEXIST', 'mkdir', p); if (!rec && !__isDir(__parent(p))) throw __err('ENOENT', 'mkdir', p); __mkp(p); return rec ? p : undefined; },
  unlinkSync(p) { p = __norm(p); if (__isDir(p)) throw __err('EISDIR', 'unlink', p); if (!__isFile(p)) throw __err('ENOENT', 'unlink', p); __writes[p] = null; },
  rmdirSync(p, o) { p = __norm(p); if (!__isDir(p)) throw __err(__isFile(p) ? 'ENOTDIR' : 'ENOENT', 'rmdir', p); if (__kids(p).length && !(o && o.recursive)) throw __err('ENOTEMPTY', 'rmdir', p); fs.rmSync(p, { recursive: true }); },
  rmSync(p, o = {}) { p = __norm(p); if (__isFile(p)) { __writes[p] = null; return; } if (!__isDir(p)) { if (o.force) return; throw __err('ENOENT', 'rm', p); } if (p === '/') throw new Error('refusing to remove /'); if (!o.recursive && __kids(p).length) throw __err('ENOTEMPTY', 'rm', p); const pre = p + '/'; for (const k of [...Object.keys(__files), ...Object.keys(__writes)]) if (k.startsWith(pre) && __isFile(k)) __writes[k] = null; for (const d of [...__dirs]) if (d === p || d.startsWith(pre)) { __dirs.delete(d); __mk.delete(d); } __rmd.add(p); },
  renameSync(a, b) { a = __norm(a); b = __norm(b); if (__isFile(a)) { const t = fs.readFileSync(a); fs.writeFileSync(b, t); __writes[a] = null; return; } if (!__isDir(a)) throw __err('ENOENT', 'rename', a); const pre = a + '/'; __mkp(b); for (const k of [...Object.keys(__files), ...Object.keys(__writes)]) if (k.startsWith(pre) && __isFile(k)) { fs.writeFileSync(b + k.slice(a.length), fs.readFileSync(k)); __writes[k] = null; } for (const d of [...__dirs]) if (d.startsWith(pre)) __mkp(b + d.slice(a.length)); fs.rmSync(a, { recursive: true }); },
  copyFileSync(a, b) { fs.writeFileSync(b, fs.readFileSync(a)); },
  cpSync(a, b, o) { a = __norm(a); if (__isFile(a)) return fs.copyFileSync(a, b); for (const n of fs.readdirSync(a, { recursive: true })) { const q = a + '/' + n; if (__isFile(q)) fs.writeFileSync(__norm(b) + '/' + n, fs.readFileSync(q)); } },
  lstatSync(p, o) { return fs.statSync(p, o); }, realpathSync(p) { return __norm(p); }, constants: { F_OK: 0, R_OK: 4, W_OK: 2, X_OK: 1 },
};
fs.promises = {}; for (const k of ['readFile', 'writeFile', 'appendFile', 'readdir', 'stat', 'lstat', 'mkdir', 'unlink', 'rm', 'rmdir', 'rename', 'copyFile', 'access', 'cp', 'realpath']) {
  const sync = fs[k + 'Sync'];
  fs.promises[k] = async (...a) => sync(...a);
  fs[k] = (...a) => { const cb = typeof a[a.length - 1] === 'function' ? a.pop() : null; let r, e = null; try { r = sync(...a); } catch (x) { e = x; } if (cb) queueMicrotask(() => cb(e, r)); };
}
fs.exists = (p, cb) => queueMicrotask(() => cb(fs.existsSync(p)));
const path = {
  sep: '/', delimiter: ':',
  normalize: p => { const abs = String(p).startsWith('/'); const o = []; for (const s of String(p).split('/')) { if (!s || s === '.') continue; if (s === '..') { if (o.length && o[o.length - 1] !== '..') o.pop(); else if (!abs) o.push('..'); } else o.push(s); } return (abs ? '/' : '') + o.join('/') || (abs ? '/' : '.'); },
  join: (...a) => path.normalize(a.filter(x => x !== '').join('/')),
  resolve: (...a) => { let r = ''; for (const x of a) r = String(x).startsWith('/') ? x : (r ? r + '/' + x : x); return __norm(r || '.'); },
  isAbsolute: p => String(p).startsWith('/'),
  basename: (p, ext) => { let b = String(p).replace(/\\/+$/, '').split('/').pop(); return ext && b.endsWith(ext) && b !== ext ? b.slice(0, -ext.length) : b; },
  dirname: p => { p = String(p).replace(/\\/+$/, ''); const i = p.lastIndexOf('/'); return i < 0 ? '.' : i === 0 ? '/' : p.slice(0, i); },
  extname: p => { const b = path.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
  relative: (a, b) => { const A = __norm(a).split('/').filter(Boolean), B = __norm(b).split('/').filter(Boolean); let i = 0; while (i < A.length && A[i] === B[i]) i++; return [...A.slice(i).map(() => '..'), ...B.slice(i)].join('/'); },
  parse: p => { const base = path.basename(p), ext = path.extname(p); return { root: String(p).startsWith('/') ? '/' : '', dir: path.dirname(p), base, ext, name: ext ? base.slice(0, -ext.length) : base }; },
  format: o => (o.dir ? o.dir + '/' : '') + (o.base || (o.name || '') + (o.ext || '')),
};
path.posix = path;
class __Exit { constructor(c) { this.code = c; } }
const process = { argv: [], env: { HOME: '/', USER: 'jade', PWD: '/' }, cwd: () => __cwd, chdir: d => { __cwd = __norm(d); }, exit: (c = 0) => { throw new __Exit(c); }, exitCode: 0, platform: 'linux', version: 'v20.0.0-browser', versions: { node: '20.0.0' }, stdout: { write: s => { __out.push(['o', String(s)]); return true; }, isTTY: false, columns: 80 }, stderr: { write: s => { __out.push(['e', String(s)]); return true; } }, nextTick: (f, ...a) => queueMicrotask(() => f(...a)), hrtime: Object.assign((t) => { const n = performance.now(); return [Math.floor(n / 1000), Math.round((n % 1000) * 1e6)]; }, { bigint: () => BigInt(Math.round(performance.now() * 1e6)) }), memoryUsage: () => ({ heapUsed: 0 }), on() {} };
const __mods = {};

// ---- SQLite: require('node:sqlite') (DatabaseSync) and require('better-sqlite3'), on the embedded SQLite build ----
let __bins = {}, __sqMod = null, __sqApi = null; const __sqOpen = new Set();
function __sqliteApi() {
  if (__sqApi) return __sqApi;
  if (typeof __jvSqlite !== 'function' || !__sqMod) throw new Error('SQLite is not available in this script');
  return (__sqApi = __jvSqlite(__sqMod));
}
function __sqliteModule(flavor) {
  const S = __sqliteApi();
  const toObj = (cols, r) => { const o = {}; cols.forEach((c, i) => { o[c] = r[i]; }); return o; };
  class StatementSync {
    constructor(db, sql) { this._db = db; this._st = db._d.prepare(sql); this.sourceSQL = sql; this.reader = this._st.columns().length > 0; this._raw = false; this._pluck = false; }
    _p(a) { if (a.length === 1 && a[0] && typeof a[0] === 'object' && !(a[0] instanceof Uint8Array)) return Array.isArray(a[0]) ? a[0] : a[0]; return a.length ? a : null; }
    _shape(cols, r) { return this._pluck ? r[0] : this._raw ? r : toObj(cols, r); }
    all(...a) { const cols = this._st.columns(); return this._st.rows(this._p(a)).map(r => this._shape(cols, r)); }
    get(...a) { const cols = this._st.columns(); for (const r of this._st.iterate(this._p(a))) { const v = this._shape(cols, r); this._st.bind(null); return v; } return undefined; }
    run(...a) { this._st.bind(this._p(a)); while (this._st.step()) {} return { changes: this._db._d.changes(), lastInsertRowid: this._db._d.lastInsertRowid() }; }
    *iterate(...a) { const cols = this._st.columns(); for (const r of this._st.iterate(this._p(a))) yield this._shape(cols, r); }
    columns() { return this._st.columns().map(name => ({ name, column: name })); }
    raw(on = true) { this._raw = on; return this; } pluck(on = true) { this._pluck = on; return this; }
    expandedSQL() { return this.sourceSQL; } finalize() { this._st.finalize(); }
  }
  class DatabaseSync {
    constructor(path = ':memory:', opts = {}) { this._path = !path || path === ':memory:' ? null : __norm(path); this._ro = !!(opts.readOnly || opts.readonly); this._d = null; if (opts.open !== false) this.open(); }
    open() {
      if (this._d) throw new Error('database is already open');
      let bytes = null;
      if (this._path) { if (this._path in __writes) { if (__writes[this._path] instanceof Uint8Array) bytes = __writes[this._path]; else if (__writes[this._path] && __writes[this._path].length) throw new Error(\`file is not a database: \${this._path}\`); } else if (__bins[this._path]) bytes = __bins[this._path]; else if (__isFile(this._path)) { const t = fs.readFileSync(this._path); if (t.length) throw new Error(\`file is not a database: \${this._path}\`); } else if (this._ro) throw new Error(\`unable to open database file: \${this._path}\`); }
      this._d = new S.Database(bytes); __sqOpen.add(this);
    }
    get isOpen() { return !!this._d; } get open_() { return !!this._d; } get name() { return this._path || ':memory:'; } get inTransaction() { return !!this._d && this._d.inTransaction(); }
    exec(sql) { if (this._ro && !/^\\s*(select|pragma|with|explain)\\b/i.test(sql)) throw new Error('attempt to write a readonly database'); this._d.exec(sql); return this; }
    prepare(sql) { return new StatementSync(this, sql); }
    pragma(s, o = {}) { const r = this._d.exec('PRAGMA ' + s)[0]; if (!r) return []; const rows = r.values.map(v => toObj(r.columns, v)); return o.simple ? (r.values[0] ? r.values[0][0] : undefined) : rows; }
    transaction(fn) { const self = this; return function (...a) { self._d.exec('BEGIN'); try { const r = fn.apply(this, a); self._d.exec('COMMIT'); return r; } catch (e) { try { self._d.exec('ROLLBACK'); } catch {} throw e; } }; }
    _flush() { if (this._path && this._d && this._d.dirty && !this._ro) { const b = this._d.export(); __writes[this._path] = b; __bins[this._path] = b; __mkp(__parent(this._path)); this._d.dirty = false; } }
    close() { if (this._d) { this._flush(); this._d.close(); this._d = null; __sqOpen.delete(this); } return this; }
  }
  if (flavor === 'better-sqlite3') { function Database(path, opts) { return new DatabaseSync(path, opts); } Database.prototype = DatabaseSync.prototype; return Database; }
  return { DatabaseSync, StatementSync, constants: {} };
}

// ---- network: global fetch (tracked so the script waits for it), Buffer, and http/https on top of fetch ----
let __inflight = 0; const __fetch0 = self.fetch ? self.fetch.bind(self) : null;
const __track = p => { __inflight++; p.then(() => { __inflight--; }, () => { __inflight--; }); return p; };
if (__fetch0) { self.fetch = (...a) => __track(__fetch0(...a)); for (const k of ['text', 'json', 'arrayBuffer', 'blob', 'formData']) { const f = Response.prototype[k]; if (f) Response.prototype[k] = function () { return __track(f.call(this)); }; } }
class Buffer extends Uint8Array {
  static from(x, enc) {
    if (typeof x === 'string') { if (enc === 'base64') return new Buffer(Uint8Array.from(atob(x.replace(/[^A-Za-z0-9+/=]/g, '')), c => c.charCodeAt(0))); if (enc === 'hex') return new Buffer((x.match(/../g) || []).map(h => parseInt(h, 16))); return new Buffer(new TextEncoder().encode(x)); }
    if (x instanceof ArrayBuffer) return new Buffer(new Uint8Array(x)); return new Buffer(Uint8Array.from(x || []));
  }
  static alloc(n, fill = 0) { const b = new Buffer(n); b.fill(fill); return b; }
  static concat(list) { const n = list.reduce((a, b) => a + b.length, 0); const out = new Buffer(n); let o = 0; for (const b of list) { out.set(b, o); o += b.length; } return out; }
  static isBuffer(x) { return x instanceof Uint8Array; }
  static byteLength(s) { return typeof s === 'string' ? new TextEncoder().encode(s).length : s.length; }
  toString(enc) { if (enc === 'base64') { let s = ''; for (let i = 0; i < this.length; i += 0x8000) s += String.fromCharCode.apply(null, this.subarray(i, i + 0x8000)); return btoa(s); } if (enc === 'hex') return [...this].map(b => b.toString(16).padStart(2, '0')).join(''); return new TextDecoder().decode(this); }
  toJSON() { return { type: 'Buffer', data: [...this] }; }
}
const __mkHttp = (proto) => {
  function request(url, opts, cb) {
    if (url && typeof url === 'object' && !(url instanceof URL)) { cb = opts; opts = url; url = null; }
    if (typeof opts === 'function') { cb = opts; opts = {}; } opts = opts || {};
    const u = url ? new URL(String(url)) : new URL(\`\${opts.protocol || proto}//\${opts.hostname || opts.host || 'localhost'}\${opts.port ? ':' + opts.port : ''}\${opts.path || '/'}\`);
    const L = {}, chunks = []; const emit = (ev, ...a) => (L[ev] || []).forEach(f => f(...a));
    const req = {
      on(ev, f) { (L[ev] ||= []).push(f); return req; }, once(ev, f) { return req.on(ev, f); },
      write(d) { chunks.push(typeof d === 'string' ? new TextEncoder().encode(d) : d); return true; },
      setHeader(k, v) { (opts.headers ||= {})[k] = v; }, getHeader(k) { return (opts.headers || {})[k]; },
      setTimeout(ms, f) { req._to = ms; if (f) req.on('timeout', f); return req; },
      destroy(e) { try { req._ab && req._ab.abort(); } catch (x) {} if (e) emit('error', e); }, abort() { req.destroy(); },
      end(d) {
        if (d) req.write(d); if (cb) req.on('response', cb);
        const ab = new AbortController(); req._ab = ab; const to = req._to || opts.timeout;
        const timer = to ? self.setTimeout(() => { emit('timeout'); ab.abort(); }, to) : null;
        self.fetch(u.toString(), { method: String(opts.method || 'GET').toUpperCase(), headers: opts.headers || {}, body: chunks.length ? new Blob(chunks) : undefined, signal: ab.signal })
          .then(async r => {
            const buf = Buffer.from(await r.arrayBuffer()); if (timer) self.clearTimeout(timer);
            const RL = {}; const headers = {}; r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
            const res = { statusCode: r.status, statusMessage: r.statusText, headers, _enc: null,
              on(ev, f) { (RL[ev] ||= []).push(f); return res; }, once(ev, f) { return res.on(ev, f); }, setEncoding(e) { res._enc = e; return res; }, resume() { return res; },
              pipe(dst) { res.on('data', c => dst.write(c)); res.on('end', () => dst.end && dst.end()); return dst; } };
            emit('response', res);
            self.setTimeout(() => { if (buf.length) (RL.data || []).forEach(f => f(res._enc ? buf.toString() : buf)); (RL.end || []).forEach(f => f()); (RL.close || []).forEach(f => f()); }, 0);
          }, e => { if (timer) self.clearTimeout(timer); emit('error', e); });
        return req;
      },
    };
    return req;
  }
  return { request, get: (u, o, c) => { const r = request(u, o, c); r.end(); return r; }, Agent: function Agent() {}, globalAgent: {}, METHODS: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'], STATUS_CODES: { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 429: 'Too Many Requests', 500: 'Internal Server Error' } };
};
const __core = (m) => { m = String(m).replace(/^node:/, ''); if (/^@tensorflow\\/tfjs(-core|-layers|-backend-cpu|-backend-webgl)?$/.test(m)) { if (self.tf) return self.tf; throw new Error("TensorFlow.js was not loaded for this script"); } if (m === 'fs') return fs; if (m === 'https') return __mkHttp('https:'); if (m === 'http') return __mkHttp('http:'); if (m === 'buffer') return { Buffer }; if (m === 'fs/promises') return fs.promises; if (m === 'path' || m === 'path/posix') return path; if (m === 'util') return { inspect: x => __fmt([x]), format: (...a) => __fmt(a), promisify: f => (...a) => new Promise((res, rej) => f(...a, (e, r) => e ? rej(e) : res(r))) }; if (m === 'os') return { EOL: '\\n', platform: () => 'linux', homedir: () => '/', tmpdir: () => '/tmp', cpus: () => [{}], hostname: () => 'jade' }; if (m === 'readline') return { createInterface: () => ({ on() {}, question(q, cb) { cb(''); }, close() {} }) }; if (m === 'sqlite') return __sqliteModule('node'); if (m === 'better-sqlite3') return __sqliteModule('better-sqlite3'); if (m === 'sqlite3') throw new Error("the callback-based 'sqlite3' npm package is not available; use require('node:sqlite') (DatabaseSync) or require('better-sqlite3'), both synchronous"); if (m === 'child_process') throw new Error("child_process is not available in the browser sandbox; use the bash tool for shell commands"); return null; };
const __mkRequire = (dir) => (m) => {
  const c = __core(m); if (c) return c;
  m = String(m);
  if (!/^(\\.{1,2}\\/|\\/)/.test(m)) throw new Error("Cannot find module '" + m + "' (browser sandbox: fs, path, util, os and local files like ./lib.js; no npm packages)");
  const base = __norm(m.startsWith('/') ? m : dir + '/' + m);
  const cand = [base, base + '.js', base + '.cjs', base + '.json', base + '/index.js'].find(p => __isFile(p));
  if (!cand) throw new Error("Cannot find module '" + m + "' (looked for " + base + "[.js|.json|/index.js])");
  if (__mods[cand]) return __mods[cand].exports;
  if (cand.endsWith('.json')) return (__mods[cand] = { exports: JSON.parse(fs.readFileSync(cand)) }).exports;
  const mod = __mods[cand] = { exports: {} };
  let src = fs.readFileSync(cand).replace(/^#!.*\\n/, '');
  src = src.replace(/^\\s*import\\s+\\*\\s+as\\s+(\\w+)\\s+from\\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");').replace(/^\\s*import\\s+(\\w+)\\s+from\\s+['"]([^'"]+)['"];?/gm, 'const $1 = require("$2");').replace(/^\\s*import\\s+\\{([^}]+)\\}\\s+from\\s+['"]([^'"]+)['"];?/gm, (s, a, b) => 'const {' + a.replace(/\\s+as\\s+/g, ': ') + '} = require("' + b + '");').replace(/^\\s*export\\s+default\\s+/gm, 'module.exports = ').replace(/^\\s*export\\s+(?=(const|let|var|function|class|async)\\b)/gm, '');
  new Function('module', 'exports', 'require', '__filename', '__dirname', 'console', 'process', src)(mod, mod.exports, __mkRequire(__parent(cand)), cand, __parent(cand), console, process);
  return mod.exports;
};
// ---- jade: call Jade's tools, decisions, model, shell and flows from a script ----
// Each call goes to the app over postMessage. Files the script wrote are handed over first, and files the
// call changed come back, so fs and Jade's tools see the same vault.
let __globals = {}; let __jseq = 0; const __jpend = new Map(); let __jbridge = true; let __jwhy = '';
function __takeSync() {
  const w = {}; let n = 0;
  for (const p of Object.keys(__writes)) { const d = __writes[p]; w[p] = d; n++; if (d === null) delete __files[p]; else __files[p] = d; delete __writes[p]; }
  const mk = [...__mk], rm = [...__rmd]; __mk.clear(); __rmd.clear();
  return n || mk.length || rm.length ? { writes: w, mkdirs: mk, rmdirs: rm } : null;
}
function __applySync(s) {
  if (!s) return;
  for (const p of s.deleted || []) { delete __files[p]; delete __writes[p]; }
  for (const d of s.rmdirs || []) __dirs.delete(d);
  for (const d of s.dirs || []) __dirs.add(d);
  for (const [p, d] of Object.entries(s.files || {})) { __files[p] = d; delete __writes[p]; let q = __parent(p); while (q !== '/' && !__dirs.has(q)) { __dirs.add(q); q = __parent(q); } }
}
const __jcall = (op, a) => {
  if (!__jbridge) return Promise.reject(new Error(\`jade.\${op} is not available here\${__jwhy ? ': ' + __jwhy : ''}\`));
  let args; try { args = a == null ? {} : JSON.parse(JSON.stringify(a)); } catch (e) { return Promise.reject(new Error(\`jade.\${op}: arguments must be plain JSON data (\${e.message})\`)); }
  return new Promise((res, rej) => { const id = ++__jseq; __inflight++; __jpend.set(id, { res, rej }); self.postMessage({ t: 'jade', id, op, a: args, sync: __takeSync() }); });
};
self.addEventListener('message', ev => {
  const m = ev.data; if (!m || m.t !== 'jret') return;
  const p = __jpend.get(m.id); if (!p) return; __jpend.delete(m.id); __inflight--;
  __applySync(m.sync); m.ok ? p.res(m.value) : p.rej(new Error(m.error));
});
const jade = Object.freeze({
  tool: (name, args) => __jcall('tool', { name: String(name), args: args || {} }),
  tools: new Proxy({}, { get: (_, n) => typeof n === 'string' && n !== 'then' && n !== 'toJSON' ? (args) => __jcall('tool', { name: n, args: args || {} }) : undefined }),
  list: () => __jcall('list', {}),
  decide: (o) => __jcall('decide', o || {}),
  ask: (prompt, o) => __jcall('ask', { ...(o || {}), prompt: String(prompt ?? '') }),
  agent: (message, o) => __jcall('agent', { ...(o || {}), message: String(message ?? '') }),
  flow: (name, input) => __jcall('flow', { name: String(name), input: input === undefined ? null : input }),
  flows: () => __jcall('flows', {}),
  shell: (command) => __jcall('shell', { command: String(command ?? '') }),
  notify: (title, body) => __jcall('notify', { title: String(title ?? ''), body: String(body ?? '') }),
  search: (query, limit) => __jcall('tool', { name: 'notes_search', args: { query: String(query ?? ''), ...(limit ? { limit } : {}) } }),
  kv: Object.freeze({ get: (k) => __jcall('kv', { op: 'get', k: String(k) }), set: (k, v) => __jcall('kv', { op: 'set', k: String(k), v: v === undefined ? null : v }), all: () => __jcall('kv', { op: 'all' }) }),
  prompt: (message, def) => __jcall('ui.prompt', { message: String(message ?? ''), def: def == null ? '' : String(def) }),
  suggest: (items, values, placeholder) => __jcall('ui.suggest', { items, values, placeholder }),
  sleep: (ms) => new Promise(r => setTimeout(r, Math.max(0, +ms || 0))),
});
let require = __mkRequire('/');
const module = { exports: {} }; const exports = module.exports; let __filename = '/[eval]', __dirname = '/';
let __pending = 0; const __st = self.setTimeout.bind(self), __ct = self.clearTimeout.bind(self); const __live = new Set();
self.setTimeout = (f, ms, ...a) => { const id = __st(() => { __live.delete(id); try { typeof f === 'function' && f(...a); } catch (e) { __out.push(['e', (e && e.stack || e) + '\\n']); } }, ms); __live.add(id); return id; };
self.clearTimeout = (id) => { __live.delete(id); __ct(id); };
let __code = 0;
let __ret;
self.onmessage = async (ev) => {
  if (ev.data && ev.data.t === 'jret') return;
  __globals = ev.data.globals || {}; __jbridge = ev.data.bridge !== false; __jwhy = ev.data.bridgeWhy || '';
  if (ev.data.noNet) { self.fetch = undefined; self.XMLHttpRequest = undefined; self.WebSocket = undefined; self.EventSource = undefined; }
  __files = ev.data.files; __bins = ev.data.bins || {}; __sqMod = ev.data.sqliteModule || null; __dirs = new Set(ev.data.dirs); __cwd = ev.data.cwd; process.env.PWD = __cwd; Object.assign(process.env, ev.data.env || {}); process.argv = ['node', ...ev.data.argv];
  if (ev.data.argv[0] && ev.data.argv[0].startsWith('/')) { __filename = ev.data.argv[0]; __dirname = __parent(__filename); require = __mkRequire(__dirname); } else require = __mkRequire(__cwd);
  try { if (self.__tfInit) await self.__tfInit(); __ret = await __main(); await new Promise(r => __st(r, 5)); while (__live.size || __inflight) await new Promise(r => __st(r, 10)); for (const d of __sqOpen) d._flush(); } catch (err) { if (err instanceof __Exit) __code = err.code; else { __out.push(['e', (err && (err.code ? err.message : err.stack)) || String(err)]); __out.push(['e', '\\n']); __code = 1; } }
  if (!__code && process.exitCode) __code = process.exitCode;
  let ret; if (__ret !== undefined) { try { ret = JSON.parse(JSON.stringify(__ret)); } catch (e) { ret = String(__ret); } }
  self.postMessage({ out: __out, writes: __writes, mkdirs: [...__mk], rmdirs: [...__rmd], code: __code, ret });
};
self.addEventListener('unhandledrejection', e => { __out.push(['e', 'Unhandled promise rejection: ' + ((e.reason && e.reason.stack) || e.reason) + '\\n']); });
`;var Ct=/\btf\s*\.\s*[A-Za-z_$]|@tensorflow\/tfjs/,Ie=class{constructor({vfs:e,sqlite:t=null,ml:r=null,bridge:i=null}){this.vfs=e,this.sqlite=t,this.ml=r,this.bridge=i}_changesSince(e){let t={},r=[],i=[],_=[];for(let[o,c]of this.vfs.nodes){let p=e.get(o);if(c.dir){p!=="d"&&i.push(o);continue}p!==c&&(ge(c.data)?t[o]=c.data:c.data.length<2e6&&(t[o]=H.decode(c.data)))}for(let[o,c]of e)this.vfs.nodes.has(o)||(c==="d"?_:r).push(o);return Object.keys(t).length||r.length||i.length||_.length?{files:t,deleted:r,dirs:i,rmdirs:_}:null}_apply(e,t){if(!e)return;let r=Object.entries(e.writes||{});this.vfs.applyChanges({deletes:r.filter(([,i])=>i===null).map(([i])=>i),rmdirs:e.rmdirs||[],mkdirs:e.mkdirs||[],writes:Object.fromEntries(r.filter(([,i])=>i!==null))},t)}async run(e,{argv:t=["[eval]"],cwd:r="/",globals:i=null,timeoutMs:_=6e4,readOnly:o=!1,network:c=!0,env:p={},signal:x=null}={}){let S=this.vfs;e=String(e??"").replace(/^#!.*\n/,""),/^\s*(import|export)\s/m.test(e)&&(e=e.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,'const $1 = require("$2");').replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,'const $1 = require("$2");').replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,(d,g,w)=>"const {"+g.replace(/\s+as\s+/g,": ")+'} = require("'+w+'");').replace(/^\s*export\s+(default\s+)?/gm,""));let E={},k=[],$={};for(let[d,g]of S.nodes)g.dir?k.push(d):ge(g.data)?($[d]=g.data,E[d]=g.data):g.data.length<2e6&&(E[d]=H.decode(g.data));let y=d=>d.test(e)||[...S.nodes].some(([g,w])=>!w.dir&&/\.[cm]?js$/.test(g)&&w.data.length<2e6&&d.test(H.decode(w.data))),A=null,j="",q="";if(this.sqlite&&y(/sqlite/i))try{A=await this.sqlite.module(),j=this.sqlite.glueSource}catch(d){return{stdout:"",stderr:`node: could not load SQLite (${d.message})
`,code:1}}if(this.ml&&c&&y(Ct))try{q=await this.ml.tfjsSource()}catch(d){return{stdout:"",stderr:`node: could not load TensorFlow.js (${d.message})
`,code:1}}let I=i?Object.keys(i).filter(d=>/^[$A-Za-z_][\w$]*$/.test(d)):[],s=I.length?`const { ${I.join(", ")} } = __globals;
`:"",n=st+`
const kit = jade;

async function __main() {
${s}${e}
}
`+(j?`
`+j+`
`:"")+(q?`
(function () { var exports, module, define;
${q}
}).call(self);
self.__tfInit = async () => { const tf = self.tf; try { tf.env().set('IS_NODE', false); } catch (e) {} const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { let gl = false; try { gl = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(2, 2).getContext('webgl2'); } catch (e) {} for (const b of ['webgpu', 'webgl']) { if (b === 'webgpu' && !(self.navigator && self.navigator.gpu)) continue; if (b === 'webgl' && !gl) continue; try { if (tf.findBackendFactory(b) && await tf.setBackend(b)) { await tf.ready(); const v = await tf.tensor([1, 2]).add(1).data(); if (v[0] === 2) return; } } catch (e) {} } for (const b of ['webgpu', 'webgl']) { try { tf.removeBackend(b); } catch (e) {} } await tf.setBackend('cpu'); await tf.ready(); } finally { Object.assign(console, keep); } };
`:""),l=st.split(`
`).length+3+(s?1:0),u=URL.createObjectURL(new Blob([n],{type:"text/javascript"})),m=this.bridge,h=await new Promise(d=>{let g;try{g=new Worker(u,{name:"node"})}catch(T){d({out:[["e",`node: could not start a worker (${T.message})
`]],writes:{},code:1});return}let w=!1,v=T=>{w||(w=!0,clearTimeout(O),x?.removeEventListener?.("abort",D),g.terminate(),d(T))},O=setTimeout(()=>v({out:[["e",`node: killed after ${_/1e3}s timeout
`]],writes:{},code:124}),_),D=()=>v({out:[["e",`node: stopped
`]],writes:{},code:130});x?.addEventListener?.("abort",D),g.onmessage=async T=>{let M=T.data;if(M&&M.t==="jade"){let N;try{if(!m)throw new Error("kit calls are not available here");M.sync&&!o&&this._apply(M.sync);let C=new Map;for(let[G,W]of S.nodes)C.set(G,W.dir?"d":W);let P=await m(M.op,M.a||{}),z=P===void 0?null:P;try{z=JSON.parse(JSON.stringify(z))}catch{z=String(z)}N={t:"jret",id:M.id,ok:!0,value:z,sync:o?null:this._changesSince(C)}}catch(C){N={t:"jret",id:M.id,ok:!1,error:String(C?.message||C)}}w||g.postMessage(N);return}v(M)},g.onerror=T=>{T.preventDefault?.(),v({out:[["e",`${T.message||"SyntaxError"}${T.lineno?` (line ${Math.max(1,T.lineno-l)})`:""}
`]],writes:{},code:1})},g.postMessage({files:E,dirs:k,bins:$,sqliteModule:A,env:p,cwd:r,argv:t,globals:i?JSON.parse(JSON.stringify(i)):{},bridge:!!m,bridgeWhy:m?"":"no host bridge",noNet:!c})});URL.revokeObjectURL(u);let f=[];o||this._apply(h,d=>f.push(d.message+`
`));let a=h.out||[];return{stdout:a.filter(d=>d[0]==="o").map(d=>d[1]).join(""),stderr:a.filter(d=>d[0]==="e").map(d=>d[1]).join("")+f.join(""),output:a.map(d=>d[1]).join(""),code:h.code??1,result:h.ret}}command(){return async e=>{let t=e.argv,r,i,_=t.findIndex(c=>c==="-e"||c==="-p"||c==="--eval"||c==="--print");if(_>=0)r=/p/.test(t[_])?`console.log(${t[_+1]??""})`:t[_+1]??"",i=["[eval]",...t.slice(_+2)];else if(t.length&&t[0]!=="-"){let c=e.P(t[0]);if(!this.vfs.isFile(c))return e.e(`node: cannot find module '${t[0]}'
`),1;r=this.vfs.read(c),i=[c,...t.slice(1)]}else r=e.stdin,i=["[stdin]"];if(!String(r).trim())return e.e(`node: no script given. Use node file.js or node -e "code"
`),1;let o=await this.run(r,{argv:i,cwd:e.sh.cwd,timeoutMs:e.sh.timeoutMs,env:e.sh.env});return e.o(o.stdout),e.e(o.stderr),o.code}}};function vt(b,e){let t=JSON.stringify(e+"micropython.mjs"),r={},i=String(b).replace(/import\.meta\.url/g,t).replace(/import\.meta\b/g,`({ url: ${t} })`).replace(/\bexport\s*\{([^}]*)\}\s*;?/g,(c,p)=>{for(let x of p.split(",")){let[S,E]=x.trim().split(/\s+as\s+/);S&&(r[(E||S).trim()]=S.trim())}return";"}).replace(/\bexport\s+default\s+(?=[\w$])/g,"var __mpyDefault = ").replace(/\bexport\s+(?=(?:async\s+function|function\*?|const|let|var|class)\b)/g,""),_=r.loadMicroPython||"loadMicroPython";return`const __mpyFactory = async () => {
const navigator = (() => { const n = globalThis.navigator; if (!n) return n; const ua = String(n.userAgent || '').replace(/\\s*Version\\/[\\d.]+/, '');
    return new Proxy(n, { get: (t, k) => k === 'userAgent' ? ua : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); })();
${i}
;return { loadMicroPython: typeof ${_} === 'function' ? ${_} : undefined };
};
`}var kt=`def __jv_compat():
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
`,nt=`
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
};`;var Et=`
self.onmessage = (ev) => {
  const { module, argv, stdin, dbBytes, files } = ev.data;
  try {
    const S = __jvSqlite(module);
    const r = S.cli({ argv, stdin, dbBytes, readFile: p => files[p] ?? null });
    self.postMessage(r, r.dbBytes ? [r.dbBytes.buffer] : []);
  } catch (e) { self.postMessage({ out: '', err: 'sqlite3: ' + ((e && e.message) || e) + '\\n', code: 1 }); }
};`,$t=`
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
}`,jt=`
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
`;var rt="1.27.0",Re=class{constructor({vfs:e,sqlite:t=null,cdn:r="https://cdn.jsdelivr.net/npm/"}){this.vfs=e,this.sqlite=t,this.base=`${r}@micropython/micropython-webassembly-pyscript@${rt}/`,this._p=null}load(){return this._p||=(async()=>{let[e,t]=await Promise.all([_e(this.base+"micropython.mjs","MicroPython"),ne(this.base+"micropython.wasm","MicroPython")]);if(!e||!_t(t))throw new Error(`MicroPython ${rt} downloaded incomplete (${t.length} bytes of wasm)`);return{factory:vt(e,this.base),wasm:"data:application/wasm;base64,"+oe(t)}})().catch(e=>{throw this._p=null,e})}async run(e,{argv:t=[""],cwd:r="/",stdin:i="",timeoutMs:_=6e4,heapMB:o=16,signal:c=null}={}){let p;try{p=await this.load()}catch(q){return{stdout:"",stderr:`python: ${q.message}
`,output:`python: ${q.message}
`,code:1}}let x=this.vfs,S={},E=[];for(let[q,I]of x.nodes)I.dir?E.push(q):I.data.length<4e6&&(S[q]=I.data);let k=null;if(this.sqlite&&(/sqlite/i.test(e)||[...x.nodes].some(([q,I])=>!I.dir&&q.endsWith(".py")&&I.data.length<2e6&&/sqlite/i.test(H.decode(I.data)))))try{k=await this.sqlite.module()}catch(q){return{stdout:"",stderr:`python: could not load SQLite (${q.message})
`,code:1}}let $=k?p.factory+this.sqlite.glueSource+`
`+$t+`
`+nt:p.factory+nt,y=await Fe($,{sqliteModule:k,sqliteShim:jt,compat:kt,wasm:p.wasm,files:S,dirs:E,cwd:r,argv:t,code:String(e),stdin:i,heap:o*1024*1024},{timeoutMs:_,signal:c,name:"python"});if(y.error)return{stdout:"",stderr:`python: ${y.error}
`,output:`python: ${y.error}
`,code:y.timeout?124:y.aborted?130:1};let A=[];x.applyChanges({deletes:y.deletes||[],mkdirs:y.mkdirs||[],writes:y.writes||{}},q=>A.push(`python: ${q.message}
`));let j=y.out||[];return{stdout:j.filter(q=>q[0]==="o").map(q=>q[1]).join(""),stderr:j.filter(q=>q[0]==="e").map(q=>q[1]).join("")+A.join(""),output:j.map(q=>q[1]).join(""),code:y.code??1}}command(){return async e=>{let t=e.argv,r,i;if(t[0]==="--version"||t[0]==="-V")return e.o(`MicroPython ${rt} (WebAssembly)
`),0;if(t[0]==="-m"&&t[1]==="pip")return e.e(`pip is not available: MicroPython runs in the browser and has no package installer.
`),1;if(t[0]==="-c")r=t[1]??"",i=["-c",...t.slice(2)];else if(t.length&&t[0]!=="-"){let o=e.P(t[0]);if(!this.vfs.isFile(o))return e.e(`python: can't open file '${t[0]}': No such file
`),2;r=this.vfs.read(o),i=[o,...t.slice(1)]}else r=e.stdin,i=[""];if(!String(r).trim())return e.e(`python: no script given. Use python file.py or python -c "code"
`),2;let _=await this.run(r,{argv:i,cwd:e.sh.cwd,stdin:t[0]==="-c"||t.length&&t[0]!=="-"?e.stdin:"",timeoutMs:e.sh.timeoutMs});return e.o(_.stdout),e.e(_.stderr),_.code}}};function it(b){let e=null,t={wasi_snapshot_preview1:{clock_time_get(h,f,a){return new DataView(e.buffer).setBigUint64(a,BigInt(Date.now())*1000000n,!0),0},fd_close(){return 8},fd_seek(){return 8},fd_write(h,f,a,d){let g=0,w=new DataView(e.buffer);for(let v=0;v<a;v++)g+=w.getUint32(f+v*8+4,!0);return w.setUint32(d,g,!0),0},fd_prestat_get(){return 8},fd_prestat_dir_name(){return 8},proc_exit(h){throw new Error("sqlite exited ("+h+")")},random_get(h,f){let a=new Uint8Array(e.buffer,h,f);for(let d=0;d<f;d+=65536)crypto.getRandomValues(a.subarray(d,Math.min(f,d+65536)));return 0}}},i=new WebAssembly.Instance(b,t).exports;e=i.memory,i._initialize(),i.sqlite3_initialize();let _=new TextEncoder,o=new TextDecoder,c=()=>new Uint8Array(e.buffer),p=()=>new DataView(e.buffer),x=h=>{if(!h)return null;let f=c(),a=h;for(;f[a];)a++;return o.decode(f.subarray(h,a))},S=h=>{let f=i.jv_malloc(Math.max(1,h));if(!f)throw new Error("out of memory");return f},E=(h,f)=>{let a=_.encode(String(h)),d=S(a.length+1);c().set(a,d),c()[d+a.length]=0;try{return f(d,a.length)}finally{i.jv_free(d)}},k=0,$=100,y=101,A=-1,j=x(i.sqlite3_libversion());class q extends Error{constructor(f,a){super(f),this.code=a,this.name="SqliteError"}}class I{constructor(f,a,d){this.db=f,this.p=a,this.sql=d,this.readonly=!!i.sqlite3_stmt_readonly(a)}columns(){let f=i.sqlite3_column_count(this.p),a=[];for(let d=0;d<f;d++)a.push(x(i.sqlite3_column_name(this.p,d)));return a}bind(f){if(i.sqlite3_reset(this.p),i.sqlite3_clear_bindings(this.p),f==null)return this;let a=i.sqlite3_bind_parameter_count(this.p),d=(g,w)=>{let v;if(w==null)v=i.sqlite3_bind_null(this.p,g);else if(typeof w=="bigint")v=i.sqlite3_bind_int64(this.p,g,w);else if(typeof w=="boolean")v=i.sqlite3_bind_int64(this.p,g,w?1n:0n);else if(typeof w=="number")v=Number.isSafeInteger(w)?i.sqlite3_bind_int64(this.p,g,BigInt(w)):i.sqlite3_bind_double(this.p,g,w);else if(w instanceof Uint8Array||w instanceof ArrayBuffer){let O=w instanceof Uint8Array?w:new Uint8Array(w),D=S(O.length);c().set(O,D),v=i.sqlite3_bind_blob(this.p,g,D,O.length,A),i.jv_free(D)}else v=E(typeof w=="object"?JSON.stringify(w):w,(O,D)=>i.sqlite3_bind_text(this.p,g,O,D,A));if(v!==k)throw this.db.err(v)};if(Array.isArray(f)){if(f.length>a)throw new q(`${f.length} values for ${a} parameters`,25);f.forEach((g,w)=>d(w+1,g))}else if(typeof f=="object"&&!(f instanceof Uint8Array))for(let[g,w]of Object.entries(f)){let v=0;for(let O of/^[:@$?]/.test(g)?[""]:[":","@","$"])if(v=E(O+g,D=>i.sqlite3_bind_parameter_index(this.p,D)),v)break;if(!v)throw new q(`no parameter named ${g}`,25);d(v,w)}else d(1,f);return this}value(f){switch(i.sqlite3_column_type(this.p,f)){case 1:{let a=i.sqlite3_column_int64(this.p,f);return a>=BigInt(Number.MIN_SAFE_INTEGER)&&a<=BigInt(Number.MAX_SAFE_INTEGER)?Number(a):a}case 2:return i.sqlite3_column_double(this.p,f);case 3:{let a=i.sqlite3_column_text(this.p,f),d=i.sqlite3_column_bytes(this.p,f);return o.decode(c().subarray(a,a+d))}case 4:{let a=i.sqlite3_column_blob(this.p,f),d=i.sqlite3_column_bytes(this.p,f);return c().slice(a,a+d)}default:return null}}step(){let f=i.sqlite3_step(this.p);if(f===$)return!0;if(f===y)return this.readonly||(this.db.dirty=!0),!1;throw this.db.err(f)}row(){let f=i.sqlite3_data_count(this.p),a=[];for(let d=0;d<f;d++)a.push(this.value(d));return a}*iterate(f){for(this.bind(f);this.step();)yield this.row()}rows(f){return[...this.iterate(f)]}finalize(){this.p&&(i.sqlite3_finalize(this.p),this.p=0)}}class s{constructor(f){if(this.p=E(":memory:",a=>{let d=S(4);try{let g=i.sqlite3_open_v2(a,d,6,0),w=p().getUint32(d,!0);if(g!==k)throw new q("cannot open database",g);return w}finally{i.jv_free(d)}}),this.dirty=!1,f&&f.length){let a=f.length,d=i.sqlite3_malloc64(BigInt(a));if(c().set(f,d),E("main",w=>i.sqlite3_deserialize(this.p,w,d,BigInt(a),BigInt(a),3))!==k)throw new q("file is not a database",26);try{this.exec("SELECT count(*) FROM sqlite_schema")}catch{throw new q("file is not a database",26)}}}err(f){return new q(x(i.sqlite3_errmsg(this.p))||`SQLite error ${f}`,i.sqlite3_extended_errcode(this.p))}each(f,a){let d=_.encode(String(f)),g=S(d.length+1);c().set(d,g),c()[g+d.length]=0;let w=S(4),v=S(4),O=g,D=g+d.length;try{for(;O<D;){let T=i.sqlite3_prepare_v2(this.p,O,D-O,w,v);if(T!==k)throw this.err(T);let M=p().getUint32(w,!0),N=p().getUint32(v,!0);if(M){let C=new I(this,M,o.decode(c().subarray(O,N)).trim());try{a(C)}finally{C.finalize()}}if(N<=O)break;O=N}}finally{i.jv_free(w),i.jv_free(v),i.jv_free(g)}}exec(f,a){let d=[],g=!0;return this.each(f,w=>{let v={columns:w.columns(),values:w.rows(g?a:null)};g=!1,v.columns.length&&d.push(v)}),d}prepare(f){let a=S(4);try{let d=E(f,(w,v)=>i.sqlite3_prepare_v2(this.p,w,v,a,0));if(d!==k)throw this.err(d);let g=p().getUint32(a,!0);if(!g)throw new q("empty statement",21);return new I(this,g,f)}finally{i.jv_free(a)}}changes(){return i.sqlite3_changes(this.p)}totalChanges(){return i.sqlite3_total_changes(this.p)}lastInsertRowid(){let f=i.sqlite3_last_insert_rowid(this.p);return f<=BigInt(Number.MAX_SAFE_INTEGER)?Number(f):f}inTransaction(){return!i.sqlite3_get_autocommit(this.p)}export(){let f=S(8);try{let a=E("main",w=>i.sqlite3_serialize(this.p,w,f,0)),d=Number(p().getBigInt64(f,!0));if(!a)return new Uint8Array(0);let g=c().slice(a,a+d);return i.sqlite3_free(a),g}finally{i.jv_free(f)}}close(){this.p&&(i.sqlite3_close_v2(this.p),this.p=0)}}let n=h=>E(h,f=>i.sqlite3_complete(f))!==0;function l({argv:h,stdin:f,readFile:a,dbBytes:d}){let g="",w="",v=0,O="list",D=!1,T="|",M="",N=!1,C=!1,P=null,z=[],G=[],W=F=>{g+=F},V=F=>{w+=F},be={"-json":"json","-csv":"csv","-column":"column","-box":"box","-table":"table","-markdown":"markdown","-line":"line","-list":"list","-html":"html","-tabs":"tabs","-quote":"quote"};for(let F=0;F<h.length;F++){let L=h[F].replace(/^--/,"-");if(be[L])O=be[L],["csv","tabs"].includes(O)&&(T=O==="csv"?",":"	"),["column","box","table","markdown"].includes(O)&&(D=!0);else if(L==="-header"||L==="-headers")D=!0;else if(L==="-noheader")D=!1;else if(L==="-separator")T=h[++F]??"|";else if(L==="-nullvalue")M=h[++F]??"";else if(L==="-cmd")z.push(h[++F]??"");else if(L==="-bail")N=!0;else if(L==="-readonly")C=!0;else{if(L==="-version")return W(j+`
`),{out:g,err:w,code:0};if(L==="-help")return W(m),{out:g,err:w,code:0};if(L.startsWith("-")&&L.length>1)return V(`sqlite3: unknown option: ${h[F]}
Use -help for a list of options.
`),{out:g,err:w,code:1};P===null?P=h[F]:G.push(h[F])}}let R;try{R=new s(P&&P!==":memory:"?d:null)}catch(F){return V(`Error: unable to open database "${P}": ${F.message}
`),{out:g,err:w,code:1}}let he=!1,Y=!1,X=F=>F===null?M:F instanceof Uint8Array?O==="json"||O==="quote"?"X'"+[...F].map(L=>L.toString(16).padStart(2,"0")).join("")+"'":o.decode(F):typeof F=="bigint"?F.toString():String(F),ut=F=>/[",\n\r]/.test(F)||F!==F.trim()?'"'+F.replace(/"/g,'""')+'"':F,ht=F=>F===null?"NULL":typeof F=="number"||typeof F=="bigint"?String(F):F instanceof Uint8Array?"X'"+[...F].map(L=>L.toString(16).padStart(2,"0")).join("")+"'":"'"+String(F).replace(/'/g,"''")+"'",Bt=(F,L)=>{if(F.length){if(O==="json"){if(!L.length)return;W("["+L.map(B=>"{"+F.map((U,Q)=>JSON.stringify(U)+":"+(B[Q]instanceof Uint8Array?JSON.stringify(X(B[Q])):typeof B[Q]=="bigint"?B[Q].toString():JSON.stringify(B[Q]))).join(",")+"}").join(`,
`)+`]
`);return}if(O==="line"){let B=Math.max(...F.map(U=>U.length));L.forEach((U,Q)=>{Q&&W(`
`),F.forEach((Z,se)=>W(Z.padStart(B)+" = "+X(U[se])+`
`))});return}if(O==="csv"){D&&W(F.map(ut).join(T)+`\r
`);for(let B of L)W(B.map(U=>U===null?"":ut(X(U))).join(T)+`\r
`);return}if(O==="quote"){D&&W(F.map(B=>"'"+B+"'").join(",")+`
`);for(let B of L)W(B.map(ht).join(",")+`
`);return}if(O==="html"){D&&W("<TR>"+F.map(B=>`<TH>${B}</TH>`).join("")+`
</TR>
`);for(let B of L)W("<TR>"+B.map(U=>`<TD>${X(U).replace(/&/g,"&amp;").replace(/</g,"&lt;")}</TD>`).join("")+`
</TR>
`);return}if(["column","box","table","markdown"].includes(O)){let B=L.map(J=>J.map(K=>X(K).replace(/\n/g," "))),U=F.map((J,K)=>Math.max(J.length,...B.map(ie=>(ie[K]||"").length))),Q=F.map((J,K)=>L.length&&L.every(ie=>ie[K]===null||typeof ie[K]=="number"||typeof ie[K]=="bigint")),Z=(J,K)=>Q[K]?J.padStart(U[K]):J.padEnd(U[K]);if(O==="column"){W(F.map((J,K)=>J.padEnd(U[K])).join("  ").trimEnd()+`
`+U.map(J=>"-".repeat(J)).join("  ")+`
`);for(let J of B)W(J.map(Z).join("  ").trimEnd()+`
`);return}if(O==="markdown"){W("| "+F.map((J,K)=>J.padEnd(U[K])).join(" | ")+` |
|`+U.map((J,K)=>Q[K]?"-".repeat(J+1)+":":":"+"-".repeat(J+1)).join("|")+`|
`);for(let J of B)W("| "+J.map(Z).join(" | ")+` |
`);return}let[se,pe,$e,Ge,Ve,je,te,xe,Se,fe,me]=O==="box"?["\u250C","\u252C","\u2510","\u251C","\u253C","\u2524","\u2514","\u2534","\u2518","\u2500","\u2502"]:["+","+","+","+","+","+","+","+","+","-","|"],Ye=(J,K,ie)=>J+U.map(Dt=>fe.repeat(Dt+2)).join(K)+ie+`
`;W(Ye(se,pe,$e)+me+F.map((J,K)=>" "+J.padEnd(U[K])+" ").join(me)+me+`
`+Ye(Ge,Ve,je));for(let J of B)W(me+J.map((K,ie)=>" "+Z(K,ie)+" ").join(me)+me+`
`);W(Ye(te,xe,Se));return}D&&W(F.join(T)+`
`);for(let B of L)W(B.map(X).join(O==="tabs"?"	":T)+`
`)}},Ee=F=>{try{R.each(F,L=>{if(C&&!L.readonly)throw new q("attempt to write a readonly database",8);let B=L.columns(),U=L.rows();Bt(B,U),he&&!L.readonly&&W(`changes: ${R.changes()}   total_changes: ${R.totalChanges()}
`)})}catch(L){V(`${/syntax error|incomplete input|unrecognized token/.test(L.message)?"Parse error":"Runtime error"}: ${L.message}
`),v=1,N&&(Y=!0)}},pt=F=>R.exec(`SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ${F?"AND name LIKE ?":""} ORDER BY 1`,F?[F]:null)[0]?.values.map(L=>L[0])||[],Qe=F=>{let L=(F.match(/"[^"]*"|'[^']*'|\S+/g)||[]).map(U=>U.replace(/^["']|["']$/g,"")),B=L[0].slice(1);if(B==="quit"||B==="exit"){Y=!0;return}if(B==="tables"){let U=pt(L[1]);U.length&&W(U.join("  ")+`
`);return}if(B==="schema"||B==="fullschema"){let U=R.exec(`SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${L[1]?"AND (name LIKE ?1 OR tbl_name LIKE ?1)":""} ORDER BY tbl_name, type DESC, name`,L[1]?[L[1]]:null)[0];for(let[Q]of U?.values||[])W(Q+`;
`);return}if(B==="indexes"||B==="indices"){let U=R.exec(`SELECT name FROM sqlite_schema WHERE type='index' ${L[1]?"AND tbl_name LIKE ?":""} ORDER BY 1`,L[1]?[L[1]]:null)[0];U&&W(U.values.map(Q=>Q[0]).join("  ")+`
`);return}if(B==="mode"){let U=L[1]||"list";if(!["list","csv","json","line","column","box","table","markdown","html","tabs","quote"].includes(U)){V(`Error: mode should be one of: box column csv html json line list markdown quote table tabs
`),v=1;return}O=U,U==="csv"?T=",":U==="tabs"?T="	":U==="list"&&(T="|"),["column","box","table","markdown"].includes(U)&&(D=!0);return}if(B==="headers"||B==="header"){D=/^(on|1|yes|true)$/i.test(L[1]||"");return}if(B==="separator"){T=(L[1]??"|").replace(/\\t/g,"	").replace(/\\n/g,`
`);return}if(B==="nullvalue"){M=L[1]??"";return}if(B==="changes"){he=/^(on|1|yes|true)$/i.test(L[1]||"");return}if(B==="bail"){N=/^(on|1|yes|true)$/i.test(L[1]||"");return}if(B==="databases"){W(`main: ${P&&P!==":memory:"?P:'""'} r${C?"o":"w"}
`);return}if(B==="print"){W(L.slice(1).join(" ")+`
`);return}if(B==="read"){let U=a(L[1]);if(U==null){V(`Error: cannot open "${L[1]}"
`),v=1;return}mt(U);return}if(B==="import"){let U=L.filter(te=>te.startsWith("--")),Q=L.slice(1).filter(te=>!te.startsWith("--")),[Z,se]=Q,pe=a(Z);if(pe==null){V(`Error: cannot open "${Z}"
`),v=1;return}let $e=u(pe,O==="tabs"||U.includes("--tabs")?"	":",");if(!$e.length)return;let Ge=+(U.find(te=>te.startsWith("--skip"))?.split("=")[1]||0),Ve=pt(se).includes(se),je=$e.slice(Ge);try{if(!Ve){let Se=je.shift();R.exec(`CREATE TABLE "${se.replace(/"/g,'""')}"(${Se.map(fe=>'"'+String(fe).replace(/"/g,'""')+'" TEXT').join(", ")})`),R.dirty=!0}let te=R.exec("SELECT count(*) FROM pragma_table_info(?)",[se])[0].values[0][0],xe=R.prepare(`INSERT INTO "${se.replace(/"/g,'""')}" VALUES(${Array(te).fill("?").join(",")})`);try{R.exec("BEGIN");for(let Se of je){let fe=Se.slice(0,te);for(;fe.length<te;)fe.push(null);xe.bind(fe),xe.step()}R.exec("COMMIT")}finally{xe.finalize()}R.dirty=!0}catch(te){try{R.exec("ROLLBACK")}catch{}V(`Error: ${te.message}
`),v=1}return}if(B==="dump"){W(`PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
`);let U=R.exec(`SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${L[1]?"AND tbl_name LIKE ?":""} ORDER BY type='table' DESC, rowid`,L[1]?[L[1]]:null)[0]?.values||[];for(let[Q,Z,se]of U)if(Q==="table"){W(se+`;
`);for(let pe of R.exec(`SELECT * FROM "${Z.replace(/"/g,'""')}"`)[0]?.values||[])W(`INSERT INTO ${/^[A-Za-z_]\w*$/.test(Z)?Z:'"'+Z+'"'} VALUES(${pe.map(ht).join(",")});
`)}for(let[Q,,Z]of U)Q!=="table"&&W(Z+`;
`);W(`COMMIT;
`);return}if(B==="help"){W(m);return}V(`Error: unknown command or invalid arguments: "${B}". Enter ".help" for help
`),v=1},ce="";function mt(F){for(let L of String(F).split(/\r?\n/)){if(Y)return;if(!ce.trim()&&/^\s*\./.test(L)){Qe(L.trim());continue}ce+=L+`
`,n(ce)&&(Ee(ce),ce="")}}for(let F of z){if(Y)break;/^\s*\./.test(F)?Qe(F.trim()):Ee(F)}if(G.length)for(let F of G){if(Y)break;/^\s*\./.test(F)?Qe(F.trim()):Ee(F)}else if(f&&f.trim())mt(f),ce.trim()&&!Y&&Ee(ce);else if(!z.length)return V(`sqlite3: no SQL given. Use: sqlite3 FILE "SQL" | sqlite3 FILE < script.sql | echo "SQL" | sqlite3 FILE
`),R.close(),{out:g,err:w,code:1};let gt={out:g,err:w,code:v};return R.dirty&&P&&P!==":memory:"&&!C&&(gt.dbBytes=R.export()),R.close(),gt}function u(h,f){let a=[],d=[],g="",w=!1;for(let v=0;v<h.length;v++){let O=h[v];if(w){O==='"'?h[v+1]==='"'?(g+='"',v++):w=!1:g+=O;continue}if(O==='"'&&g===""){w=!0;continue}if(O===f){d.push(g),g="";continue}if(O===`
`||O==="\r"){O==="\r"&&h[v+1]===`
`&&v++,d.push(g),g="",(d.length>1||d[0]!=="")&&a.push(d),d=[];continue}g+=O}return(g!==""||d.length)&&(d.push(g),a.push(d)),a}let m=`SQLite ${j} shell (batch mode)
usage: sqlite3 [OPTIONS] [FILE] ["SQL" ...]      (SQL can also come from stdin or < file.sql)
options: -json -csv -column -box -table -markdown -line -list -html -tabs -quote
         -header -noheader -separator SEP -nullvalue TEXT -cmd CMD -bail -readonly -version
dot commands: .tables [pat]  .schema [table]  .indexes [table]  .mode MODE  .headers on|off
              .separator SEP  .nullvalue TEXT  .import FILE TABLE [--skip=N]  .read FILE
              .dump [table]  .changes on|off  .bail on|off  .databases  .print TEXT  .quit
`;return{Database:s,Statement:I,SqliteError:q,version:j,complete:n,cli:l,parseCsv:u}}var ot="var __jvSqlite = "+it.toString()+";";var Be=class{constructor(e,t,r,{readOnly:i=!1}={}){this.vfs=t,this.path=r?t.norm(r):null,this.readOnly=i;let _=null;if(this.path&&t.isFile(this.path)&&(_=t.readBytes(this.path),_.length&&!ge(_)))throw new Error(`file is not a database: ${this.path}`);this.db=new e.Database(_)}exec(e,t){return this.db.exec(e,t??null)}query(e,t){let r=this.db.prepare(e);try{let i=r.columns();return r.rows(t??null).map(_=>Object.fromEntries(i.map((o,c)=>[o,_[c]])))}finally{r.finalize()}}get(e,t){return this.query(e,t)[0]}run(e,t){let r=this.db.prepare(e);try{for(r.bind(t??null);r.step(););}finally{r.finalize()}return{changes:this.db.changes(),lastInsertRowid:this.db.lastInsertRowid()}}transaction(e){this.db.exec("BEGIN");try{let t=e(this);return this.db.exec("COMMIT"),t}catch(t){try{this.db.exec("ROLLBACK")}catch{}throw t}}prepare(e){return this.db.prepare(e)}export(){return this.db.export()}save(e=this.path){if(!e)throw new Error("this database has no path: pass one to save(path)");if(this.readOnly)throw new Error("the database is read-only");return this.vfs.write(e,this.db.export()),this.path=this.vfs.norm(e),this.path}close({save:e=!0}={}){this.db&&(e&&this.path&&!this.readOnly&&this.save(),this.db.close(),this.db=null)}},De=class{constructor(e){this.vfs=e,this._mod=null,this._api=null,this.glueSource=ot}module(){return this._mod||=ne(ve("sqlite3.wasm"),"SQLite").then(e=>WebAssembly.compile(e)).catch(e=>{throw this._mod=null,e})}async api(){return this._api||=it(await this.module())}async version(){return(await this.api()).version}async open(e=":memory:",t={}){return new Be(await this.api(),this.vfs,e===":memory:"?null:e,t)}async cli(e,{stdin:t="",cwd:r="/",timeoutMs:i=6e4}={}){let _=this.vfs,o=null;for(let $=0;$<e.length;$++){let y=e[$];if(["-separator","--separator","-nullvalue","--nullvalue","-cmd","--cmd"].includes(y)){$++;continue}if(!y.startsWith("-")){o=y;break}}let c=o&&o!==":memory:"?_.norm(o,r):null;if(c&&_.isDir(c))return{stdout:"",stderr:`Error: unable to open database "${o}": it is a directory
`,code:1};let p=c&&_.isFile(c)?_.readBytes(c):null;if(p&&p.length&&!ge(p))return{stdout:"",stderr:`Error: file is not a database: ${o}
`,code:1};let x={},S=[t,...e].join(`
`);for(let $ of S.matchAll(/^\s*\.(?:import|read)\s+(.+)$/gm))for(let y of $[1].match(/"[^"]*"|'[^']*'|\S+/g)||[]){let A=y.replace(/^["']|["']$/g,"");if(A.startsWith("--"))continue;let j=_.norm(A,r);_.isFile(j)&&(x[A]=_.read(j))}let E;try{E=await this.module()}catch($){return{stdout:"",stderr:`sqlite3: could not load SQLite (${$.message})
`,code:1}}let k=await Fe(ot+`
`+Et,{module:E,argv:e,stdin:t,dbBytes:p,files:x},{timeoutMs:i,name:"sqlite3"});return k.error?{stdout:"",stderr:`sqlite3: ${k.error}
`,code:k.timeout?124:1}:(k.dbBytes&&c&&_.write(c,new Uint8Array(k.dbBytes)),{stdout:k.out||"",stderr:k.err||"",code:k.code??1})}command(){return async e=>{let t=await this.cli(e.argv,{stdin:e.stdin,cwd:e.sh.cwd,timeoutMs:e.sh.timeoutMs});return e.o(t.stdout),e.e(t.stderr),t.code}}};var Pt=new Set("a an and are as at be but by for from had has have he her his i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who will with you your do does did can could would should not no yes".split(" "));function Ue(b,{stopWords:e=Pt,stem:t=!0}={}){let r=[];for(let i of String(b??"").toLowerCase().split(/[^\p{L}\p{N}]+/u))i.length<2||e?.has(i)||(t&&i.length>4&&/[a-z]$/.test(i)&&(i=i.replace(/(ing|ed|es|s)$/,"")),r.push(i));return r}var ae=class{constructor(e=[],{k1:t=1.5,b:r=.75,epsilon:i=.25,tokenize:_=Ue}={}){this.k1=t,this.b=r,this.epsilon=i,this.tok=_,this.docs=[],this.add(e)}add(e){for(let t of e){let r=this.docs.length;this.docs.push(typeof t=="string"?{id:r,text:t}:{...t,id:t.id??r})}return this._build(),this}_build(){let e=this.docs.map(o=>this.tok(o.text??""));this.N=e.length,this.tf=e.map(o=>{let c=new Map;for(let p of o)c.set(p,(c.get(p)||0)+1);return c}),this.len=e.map(o=>o.length),this.avgdl=this.N?this.len.reduce((o,c)=>o+c,0)/this.N:0;let t=new Map;for(let o of this.tf)for(let c of o.keys())t.set(c,(t.get(c)||0)+1);this.idf=new Map;let r=0,i=[];for(let[o,c]of t){let p=Math.log((this.N-c+.5)/(c+.5));this.idf.set(o,p),r+=p,p<0&&i.push(o)}let _=Math.max(this.epsilon*(t.size?r/t.size:0),.01);for(let o of i)this.idf.set(o,_)}scores(e){let t=Array.isArray(e)?e:this.tok(e),r=new Array(this.N).fill(0);for(let i of new Set(t)){let _=this.idf.get(i);if(_!==void 0)for(let o=0;o<this.N;o++){let c=this.tf[o].get(i);c&&(r[o]+=_*(c*(this.k1+1))/(c+this.k1*(1-this.b+this.b*this.len[o]/(this.avgdl||1))))}}return r}search(e,{limit:t=10,minScore:r=0}={}){return this.scores(e).map((_,o)=>({...this.docs[o],score:_})).filter(_=>_.score>r).sort((_,o)=>o.score-_.score).slice(0,t)}},qt=(b,e,t={})=>new ae(b,t).search(e,t);function Ce(b,e,{root:t="/",limit:r=10,maxBytes:i=1e6,include:_=/\.(md|txt|js|mjs|ts|py|json|html|css|csv|toml|ya?ml|xml|sh|sql)$/i}={}){let o=[];for(let p of b.walk(t)){if(!b.isFile(p)||!_.test(p))continue;let x=b.readBytes(p);x.length>i||o.push({id:p,path:p,text:p+`
`+new TextDecoder().decode(x)})}let c=Ue(e);return new ae(o).search(e,{limit:r}).map(({path:p,text:x,score:S})=>{let E=x.split(`
`),k=Math.max(0,E.findIndex(($,y)=>y>0&&c.some(A=>$.toLowerCase().includes(A))));return{path:p,score:+S.toFixed(4),line:k||null,snippet:E.slice(k||1,(k||1)+3).join(`
`).slice(0,300)}})}var we={tfjs:"4.22.0",onnxruntime:"1.31.1",litert:"2.5.3"};function Tt(b=globalThis.navigator?.gpu){if(!b||b.__jak||typeof b.requestAdapter!="function")return;let e=b.requestAdapter.bind(b);b.requestAdapter=async t=>{let r=null;try{r=await e(t)}catch{}if(!r&&!(t&&t.featureLevel))try{r=await e({...t||{},featureLevel:"compatibility"})}catch{}if(r&&!r.__jak&&r.features?.has?.("core-features-and-limits")){let i=r.requestDevice.bind(r);r.requestDevice=(_={})=>i({..._,requiredFeatures:[...new Set([..._.requiredFeatures||[],"core-features-and-limits"])]}),r.__jak=!0}return r},b.__jak=!0}var Ot={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int8:Int8Array,float64:Float64Array,int16:Int16Array,uint16:Uint16Array},at=(b,e=[])=>{if(Array.isArray(b))for(let t of b)at(t,e);else e.push(+b);return e},At=b=>{let e=[];for(;Array.isArray(b);)e.push(b.length),b=b[0];return e},Pe=class{constructor({vfs:e,cdn:t="https://cdn.jsdelivr.net/npm/"}){this.vfs=e,this.cdn=t,this._tf=null,this._tfSrc=null,this._ort=null,this._lrt=null;try{Tt()}catch{}}url(e,t,r){return`${this.cdn}${e}@${t}/${r}`}async bytes(e){if(e instanceof Uint8Array)return e;if(e instanceof ArrayBuffer)return new Uint8Array(e);let t=String(e||"");if(/^(https?:|blob:|data:)/i.test(t))return ne(t,t);if(!this.vfs.isFile(t))throw new Error(`${t} is not a file`);return this.vfs.readBytes(t)}tensorInput(e,t="float32"){if(e&&!Array.isArray(e)&&!ArrayBuffer.isView(e)&&typeof e=="object"){t=e.dtype||t;let r=e.data,i=ArrayBuffer.isView(r)?r:(Ot[t]||Float32Array).from(at(r));return[i,e.shape||(Array.isArray(r)?At(r):[i.length]),t]}return ArrayBuffer.isView(e)?[e,[e.length],t]:[(Ot[t]||Float32Array).from(at(e)),At(e),t]}async tf({backend:e}={}){return this._tf||=(async()=>{let t=await Ae(this.url("@tensorflow/tfjs",we.tfjs,"dist/tf.min.js"),"tf");try{await Ae(this.url("@tensorflow/tfjs-backend-webgpu",we.tfjs,"dist/tf-backend-webgpu.min.js"))}catch{}let r=async i=>{try{return!t.findBackendFactory(i)||!await t.setBackend(i)?!1:(await t.ready(),(await t.tensor([1,2]).add(1).data())[0]===2)}catch{return!1}};for(let i of e?[e]:["webgpu","webgl","cpu"])if(await r(i))break;return t})().catch(t=>{throw this._tf=null,t})}tfjsSource(){return this._tfSrc||=_e(this.url("@tensorflow/tfjs",we.tfjs,"dist/tf.min.js"),"TensorFlow.js").catch(e=>{throw this._tfSrc=null,e})}ort(){return this._ort||=(async()=>{let e=this.url("onnxruntime-web",we.onnxruntime,"dist/"),t=await Ae(e+"ort.webgpu.min.js","ort");if(!t?.InferenceSession)throw new Error("ONNX Runtime did not load");return t.env.wasm.numThreads=globalThis.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||1):1,t.env.wasm.wasmPaths=e,t.env.logLevel="error",t})().catch(e=>{throw this._ort=null,e})}async onnx(e,{accelerator:t}={}){let r=this,i=await this.ort(),_=await this.bytes(e),o=t||(await this.webgpu()?"webgpu":"wasm"),c,p=$=>i.InferenceSession.create(_,{executionProviders:$==="webgpu"?["webgpu","wasm"]:["wasm"],graphOptimizationLevel:"all"}),x;try{x=await p(o)}catch($){if(o==="wasm")throw $;c=`${o} failed (${$.message}); using wasm`,o="wasm",x=await p("wasm")}let S=$=>x[$+"Names"].map((y,A)=>{let j=x[$+"Metadata"],q=Array.isArray(j)?j[A]:j?.[y];return{name:y,shape:(q?.shape||[]).map(I=>typeof I=="number"?I:-1),dtype:q?.type||"float32"}}),E=S("input"),k=S("output");return{accelerator:o,note:c,inputs:E,outputs:k,session:x,async run($){let y=Array.isArray($)?$:E.map(I=>$[I.name]??(E.length===1?$:void 0)),A={};E.forEach((I,s)=>{if(y[s]==null)throw new Error(`no data for input ${I.name}`);let[n,l,u]=r.tensorInput(y[s],y[s]?.dtype||I.dtype);if(!y[s]?.shape&&I.shape.length&&l.length!==I.shape.length&&I.shape.filter(m=>m<0).length===1){let m=I.shape.filter(h=>h>0).reduce((h,f)=>h*f,1);if(n.length%m)throw new Error(`input ${I.name} needs a multiple of ${m} values (shape ${JSON.stringify(I.shape)}), got ${n.length}`);l=I.shape.map(h=>h<0?n.length/m:h)}u==="int64"?n=BigInt64Array.from(n,m=>BigInt(Math.round(Number(m)))):u==="bool"&&(n=Uint8Array.from(n,m=>m?1:0)),A[I.name]=new i.Tensor(u,n,y[s]?.shape||l)});let j=await x.run(A),q={};for(let I of x.outputNames){let s=j[I],n=s.location&&s.location!=="cpu"?await s.getData():s.data;q[I]={data:n,shape:[...s.dims],dtype:s.type}}return q},release:()=>x.release()}}litert(){return this._lrt||=(async()=>{let e=await import(this.url("@litertjs/core",we.litert,"+esm"));return await e.loadLiteRt(this.url("@litertjs/core",we.litert,"wasm/")),e})().catch(e=>{throw this._lrt=null,e})}async tflite(e,{accelerator:t}={}){let r=this,i=await this.litert(),_=await this.bytes(e),o=!1;try{o=!!await i.isWebGPUSupported?.()}catch{}let c=t||(o?"webgpu":"wasm"),p,x;try{x=await i.loadAndCompile(_,{accelerator:c})}catch(y){if(c==="wasm")throw y;p=`${c} failed (${y.message}); using wasm`,c="wasm",x=await i.loadAndCompile(_,{accelerator:"wasm"})}let S=y=>[...y?.shape||y?.layout?.dimensions||y?.dimensions||[]],E=y=>[...y].map((A,j)=>({index:j,name:A.name,shape:S(A),dtype:A.dtype||A.type?.dtype})),k=E(x.getInputDetails()),$=E(x.getOutputDetails());return{accelerator:c,note:p,inputs:k,outputs:$,model:x,async run(y){let A=Array.isArray(y)&&k.length>1||Array.isArray(y)&&(Array.isArray(y[0])||ArrayBuffer.isView(y[0])||y[0]?.data)?y:[y],j=k.map((s,n)=>{let[l,u]=r.tensorInput(A[n],s.dtype||"float32");return new i.Tensor(l,A[n]?.shape||(s.shape.length?s.shape:u))}),q;try{q=await x.run(j)}finally{j.forEach(s=>{try{s.delete()}catch{}})}let I=[];for(let[s,n]of(Array.isArray(q)?q:Object.values(q)).entries()){let l=n;if(c!=="wasm")try{let u=await l.moveTo("wasm");u&&u!==l&&(l=u)}catch{}I.push({name:$[s]?.name,data:l.toTypedArray(),shape:[...l.type?.layout?.dimensions||$[s]?.shape||[]]});try{l.delete()}catch{}}return I},delete:()=>x.delete()}}async webgpu(){if(this._gpu==null)try{this._gpu=!!(navigator.gpu&&await navigator.gpu.requestAdapter())}catch{this._gpu=!1}return this._gpu}};async function We(b){let e=b instanceof Uint8Array?b:new Uint8Array(b),t=new DataView(e.buffer,e.byteOffset,e.byteLength),r=-1;for(let p=e.length-22;p>=Math.max(0,e.length-65557);p--)if(t.getUint32(p,!0)===101010256){r=p;break}if(r<0)throw new Error("not a zip file (.xdc files are zip archives)");let i=t.getUint16(r+10,!0),_=t.getUint32(r+16,!0),o={},c=new TextDecoder;for(let p=0;p<i;p++){if(t.getUint32(_,!0)!==33639248)throw new Error("broken zip directory");let x=t.getUint16(_+10,!0),S=t.getUint32(_+20,!0),E=t.getUint16(_+28,!0),k=t.getUint16(_+30,!0),$=t.getUint16(_+32,!0),y=t.getUint32(_+42,!0),A=c.decode(e.subarray(_+46,_+46+E));if(_+=46+E+k+$,A.endsWith("/"))continue;let j=y+30+t.getUint16(y+26,!0)+t.getUint16(y+28,!0),q=e.subarray(j,j+S),I;if(x===0)I=q.slice();else if(x===8)I=new Uint8Array(await new Response(new Blob([q]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());else throw new Error(`unsupported zip compression (${x}) for ${A}`);o[A.replace(/^\.?\//,"")]=I}return o}function Ft(b){let e={};for(let t of String(b||"").split(/\r?\n/)){let r=/^\s*([\w.-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'([^']*)'|([\w.+-]+))\s*(?:#.*)?$/.exec(t);if(r)e[r[1]]=r[2]!=null?r[2].replace(/\\"/g,'"').replace(/\\\\/g,"\\"):r[3]!=null?r[3]:/^-?\d+(\.\d+)?$/.test(r[4])?+r[4]:r[4]==="true"?!0:r[4]==="false"?!1:r[4];else if(/^\s*\[/.test(t))break}return e}var Wt={html:"text/html",htm:"text/html",js:"text/javascript",mjs:"text/javascript",css:"text/css",json:"application/json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",m4a:"audio/mp4",mp4:"video/mp4",webm:"video/webm",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",wasm:"application/wasm",txt:"text/plain",md:"text/markdown",xml:"application/xml",csv:"text/csv",toml:"text/plain"},ze=b=>Wt[(b.split(".").pop()||"").toLowerCase()]||"application/octet-stream";function le(b,e){let t=String(e||"").trim();if(!t||/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(t))return null;t=t.split("#")[0].split("?")[0];try{t=decodeURIComponent(t)}catch{}let r=t.startsWith("/")?[]:b.split("/").slice(0,-1);for(let i of t.split("/"))!i||i==="."||(i===".."?r.pop():r.push(i));return r.join("/")}function Mt(b,e){let t=b.files,r=y=>`data:${ze(y)};base64,${oe(t[y])}`,i=new Map,_=(y,A)=>y.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?/g,(j,q,I)=>{let s=le(A,I);return s&&t[s]?`@import url("data:text/css;base64,${oe(new TextEncoder().encode(_(H.decode(t[s]),s)))}")`:j}).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g,(j,q,I)=>{let s=le(A,I);return s&&t[s]?`url("${r(s)}")`:j}),o=(y,A=[])=>{if(i.has(y))return i.get(y);if(A.includes(y))return null;let j=c(H.decode(t[y]),y,[...A,y]),q=`data:text/javascript;base64,${oe(new TextEncoder().encode(j))}`;return i.set(y,q),q},c=(y,A,j=[])=>y.replace(/(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g,(q,I,s,n)=>{let l=le(A,n);if(!l||!t[l])return q;if(/\.(js|mjs)$/i.test(l)){let u=o(l,j);return u?I+s+u+s:q}return I+s+r(l)+s}).replace(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,(q,I,s)=>{let n=le(A,s);if(!n||!t[n])return q;let l=/\.(js|mjs)$/i.test(n)?o(n,j):r(n);return l?`import(${I}${l}${I})`:q}).replace(/new\s+URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g,(q,I,s)=>{let n=le(A,s);return n&&t[n]?`new URL(${I}${r(n)}${I})`:q}),p=new DOMParser().parseFromString(H.decode(t["index.html"]),"text/html");for(let y of[...p.querySelectorAll("script")]){let A=(y.getAttribute("type")||"").toLowerCase()==="module",j=y.getAttribute("src");if(j){let q=le("index.html",j);if(!q||!t[q]){/webxdc\.js$/.test(j)&&y.remove();continue}y.removeAttribute("src"),y.textContent=A?c(H.decode(t[q]),q,[q]):H.decode(t[q])}else A&&(y.textContent=c(y.textContent,"index.html"))}for(let y of[...p.querySelectorAll("link[href]")]){let A=(y.getAttribute("rel")||"").toLowerCase(),j=le("index.html",y.getAttribute("href"));if(!(!j||!t[j]))if(A.includes("stylesheet")){let q=p.createElement("style");q.textContent=_(H.decode(t[j]),j),y.replaceWith(q)}else A==="modulepreload"?y.remove():y.setAttribute("href",r(j))}for(let y of p.querySelectorAll("style"))y.textContent=_(y.textContent,"index.html");for(let y of p.querySelectorAll("[style]"))y.setAttribute("style",_(y.getAttribute("style"),"index.html"));for(let y of p.querySelectorAll("img[src],audio[src],video[src],source[src],input[src],embed[src],track[src],image[href],use[href]")){let A=y.hasAttribute("src")?"src":"href",j=le("index.html",y.getAttribute(A));j&&t[j]&&y.setAttribute(A,r(j))}let x={},S=12*1048576;for(let[y,A]of Object.entries(t))y!=="index.html"&&(A.length>S||(S-=A.length,x[y]=r(y)));let E=p.createElement("script");E.textContent=zt({app:b,assets:x,files:Object.keys(t),self:e});let k=p.createElement("meta");return k.setAttribute("http-equiv","Content-Security-Policy"),k.setAttribute("content","default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:"),(p.head||p.documentElement.insertBefore(p.createElement("head"),p.body)).prepend(k,E),`<!DOCTYPE html>
`+p.documentElement.outerHTML}function zt({app:b,assets:e,files:t,self:r}){let i={addr:r.addr,name:r.name,ls:b.ls||{},assets:e,files:t,android:!!r.android};return`(() => {
const CFG = ${JSON.stringify(i).replace(/<\//g,"<\\/")};
const P = window.parent; let seq = 0; const waits = new Map(); let listener = null; const ready = [];
const post = (m) => P.postMessage(Object.assign({ __xdc: 1 }, m), '*');
const call = (t, data) => new Promise((res, rej) => { const id = ++seq; waits.set(id, { res, rej }); post({ t, id, data }); });
window.addEventListener('message', (e) => {
  if (e.source !== P || !e.data || !e.data.__xdc) return; const m = e.data;
  if (m.t === 'update') { try { listener && listener(m.update); } catch (err) { console.error(err); } }
  else if (m.t === 'listen-done') { ready.splice(0).forEach(r => r()); }
  else if (m.t === 'reply') { const w = waits.get(m.id); if (w) { waits.delete(m.id); m.error ? w.rej(new Error(m.error)) : w.res(m.data); } }
  else if (m.t === 'realtime') { rtL && rtL(new Uint8Array(m.data)); }
});
let rtL = null;
const local = (u) => { if (typeof u !== 'string') u = String(u && u.url || u); if (/^(data|blob|javascript):/i.test(u)) return null; let s = u.replace(/^about:srcdoc/, '').replace(/^https?:\\/\\/[^/]*\\.localhost\\//, '').split('#')[0].split('?')[0]; if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; s = s.replace(/^\\.?\\//, ''); try { s = decodeURIComponent(s); } catch (e) {} return CFG.files.includes(s) ? s : null; };
window.webxdc = {
  selfAddr: CFG.addr, selfName: CFG.name, sendUpdateInterval: 1000, sendUpdateMaxSize: 128000,
  setUpdateListener(cb, serial) { listener = cb; const p = new Promise(r => ready.push(r)); post({ t: 'listen', serial: serial || 0 }); return p; },
  sendUpdate(update, descr) { post({ t: 'send', update: JSON.parse(JSON.stringify(update)), descr }); },
  getAllUpdates() { return call('all'); },
  async sendToChat(msg) {
    const out = { text: msg && msg.text || '' };
    if (msg && msg.file) { const f = msg.file; let b64 = f.base64; if (!b64 && f.plainText != null) b64 = btoa(unescape(encodeURIComponent(f.plainText))); if (!b64 && f.blob) { const u = new Uint8Array(await f.blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); b64 = btoa(s); } out.file = { name: f.name || 'file', base64: b64, type: f.type || (f.blob && f.blob.type) || '' }; }
    return call('chat', out);
  },
  importFiles(filter) { return new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; const f = filter || {}; i.multiple = !!f.multiple; const acc = [...(f.mimeTypes || []), ...(f.extensions || [])]; if (acc.length && !(CFG.android && !(f.mimeTypes || []).length)) i.accept = acc.join(','); i.style.display = 'none'; i.onchange = () => { res([...i.files]); i.remove(); }; document.body.appendChild(i); i.click(); }); },
  joinRealtimeChannel() { post({ t: 'rt-join' }); return { setListener(f) { rtL = f; }, send(data) { post({ t: 'rt-send', data: Array.from(data || []) }); }, leave() { rtL = null; post({ t: 'rt-leave' }); } }; },
};
// storage: the frame has no origin of its own, so localStorage is kept by the app host
const mkStore = (init, persist) => { const d = Object.assign({}, init); let t = 0; const save = () => { if (!persist) return; clearTimeout(t); t = setTimeout(() => post({ t: 'ls', data: d }), 200); };
  const s = { getItem: k => Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null, setItem: (k, v) => { d[k] = String(v); save(); }, removeItem: k => { delete d[k]; save(); }, clear: () => { for (const k in d) delete d[k]; save(); }, key: i => Object.keys(d)[i] ?? null, get length() { return Object.keys(d).length; } };
  return new Proxy(s, { get: (o, k) => k in o ? o[k] : (typeof k === 'string' ? s.getItem(k) : undefined), set: (o, k, v) => { s.setItem(k, v); return true; }, deleteProperty: (o, k) => { s.removeItem(k); return true; }, ownKeys: () => Object.keys(d), getOwnPropertyDescriptor: (o, k) => Object.prototype.hasOwnProperty.call(d, k) ? { value: d[k], enumerable: true, configurable: true } : undefined }); };
try { Object.defineProperty(window, 'localStorage', { value: mkStore(CFG.ls, true), configurable: true }); } catch (e) {}
try { Object.defineProperty(window, 'sessionStorage', { value: mkStore({}, false), configurable: true }); } catch (e) {}
// local files for fetch / XHR / src setters
const asset = (u) => { const p = local(u); return p ? (CFG.assets[p] || null) : null; };
const f0 = window.fetch && window.fetch.bind(window);
window.fetch = async (input, init) => { const p = local(input); if (p) { if (CFG.assets[p]) return f0(CFG.assets[p]); const r = await call('file', p); return new Response(new Uint8Array(r.bytes), { status: 200, headers: { 'Content-Type': r.type } }); } const u = String(input && input.url || input); if (/^(data|blob):/i.test(u)) return f0(input, init); throw new TypeError('webxdc apps have no internet access'); };
const xo = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...rest) { const a = asset(u); return xo.call(this, m, a || u, ...rest); };
for (const C of [HTMLImageElement, HTMLMediaElement, HTMLSourceElement, HTMLScriptElement]) { const d = Object.getOwnPropertyDescriptor(C.prototype, 'src'); if (d && d.set) Object.defineProperty(C.prototype, 'src', { get: d.get, set(v) { const a = asset(v); d.set.call(this, a || v); }, configurable: true }); }
const sa = Element.prototype.setAttribute; Element.prototype.setAttribute = function (k, v) { if ((k === 'src' || k === 'href') && typeof v === 'string') { const a = asset(v); if (a) v = a; } return sa.call(this, k, v); };
const A0 = window.Audio; if (A0) window.Audio = function (u) { return new A0(u ? (asset(u) || u) : u); };
window.open = (u) => { post({ t: 'open', url: String(u || '') }); return null; };
})();`}function Lt(b){let e=new TextEncoder,t=[],r=[],i=0,_=(()=>{let k=new Uint32Array(256);for(let $=0;$<256;$++){let y=$;for(let A=0;A<8;A++)y=y&1?3988292384^y>>>1:y>>>1;k[$]=y>>>0}return k})(),o=k=>{let $=4294967295;for(let y=0;y<k.length;y++)$=_[($^k[y])&255]^$>>>8;return($^4294967295)>>>0};for(let[k,$]of Object.entries(b)){let y=e.encode(k),A=o($),j=new DataView(new ArrayBuffer(30));j.setUint32(0,67324752,!0),j.setUint16(4,20,!0),j.setUint16(6,2048,!0),j.setUint32(14,A,!0),j.setUint32(18,$.length,!0),j.setUint32(22,$.length,!0),j.setUint16(26,y.length,!0),t.push(new Uint8Array(j.buffer),y,$);let q=new DataView(new ArrayBuffer(46));q.setUint32(0,33639248,!0),q.setUint16(4,20,!0),q.setUint16(6,20,!0),q.setUint16(8,2048,!0),q.setUint32(16,A,!0),q.setUint32(20,$.length,!0),q.setUint32(24,$.length,!0),q.setUint16(28,y.length,!0),q.setUint32(42,i,!0),r.push(new Uint8Array(q.buffer),y),i+=30+y.length+$.length}let c=r.reduce((k,$)=>k+$.length,0),p=new DataView(new ArrayBuffer(22));p.setUint32(0,101010256,!0),p.setUint16(8,Object.keys(b).length,!0),p.setUint16(10,Object.keys(b).length,!0),p.setUint32(12,c,!0),p.setUint32(16,i,!0);let x=[...t,...r,new Uint8Array(p.buffer)],S=new Uint8Array(x.reduce((k,$)=>k+$.length,0)),E=0;for(let k of x)S.set(k,E),E+=k.length;return S}var Je=class{constructor({vfs:e,persist:t=!1}){this.vfs=e,this.store=t?Te("jade-agent-kit-xdc:"+t):null,this.apps=new Map,this.sessions=new Set,this.listeners=new Set,this._q=new Map}async load(e,{name:t="App"}={}){let r;if(e instanceof Uint8Array||e instanceof ArrayBuffer)r=await We(e);else if(e&&typeof e=="object")r=Object.fromEntries(Object.entries(e).map(([S,E])=>[S,typeof E=="string"?new TextEncoder().encode(E):E]));else{let S=String(e);if(/^(https?:|blob:|data:)/i.test(S))r=await We(await ne(S));else if(this.vfs.isDir(S)){let E=this.vfs.norm(S).replace(/\/$/,"")+"/";r={};for(let[k,$]of this.vfs.nodes)!$.dir&&k.startsWith(E)&&(r[k.slice(E.length)]=$.data);t=this.vfs.base(this.vfs.norm(S))}else if(this.vfs.isFile(S))r=await We(this.vfs.readBytes(S)),t=this.vfs.base(this.vfs.norm(S)).replace(/\.xdc$/i,"");else throw new Error(`${S}: not a file, folder or URL`)}if(!r["index.html"]){let S=new Set(Object.keys(r).map(E=>E.split("/")[0]));if(S.size===1){let E=[...S][0]+"/";r[E+"index.html"]&&(r=Object.fromEntries(Object.entries(r).map(([k,$])=>[k.slice(E.length),$])))}}if(!r["index.html"])throw new Error("this is not a webxdc app: index.html is missing");let i=r["manifest.toml"]?Ft(H.decode(r["manifest.toml"])):{},_=String(i.name||"").trim();if(!_){let S=/<title>([^<]{1,60})<\/title>/i.exec(H.decode(r["index.html"]));_=S&&S[1].trim()||t}let o=["icon.png","icon.jpg","icon.jpeg","icon.svg","icon.webp"].find(S=>r[S]),c="xdc-"+_.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40),p=this.store?await this.store.get(c):null,x={id:c,name:_,manifest:i,files:r,icon:o?`data:${ze(o)};base64,${oe(r[o])}`:null,size:Object.values(r).reduce((S,E)=>S+E.length,0),updates:p?.updates||[],ls:p?.ls||{},summary:p?.summary||"",document:p?.document||""};return this.apps.set(c,x),x}get(e){if(typeof e=="object")return e;let t=String(e).toLowerCase();return this.apps.get(e)||[...this.apps.values()].find(r=>r.name.toLowerCase()===t)||null}list(){return[...this.apps.values()].map(({id:e,name:t,size:r,summary:i,document:_,updates:o})=>({id:e,name:t,size:r,summary:i,document:_,updates:o.length}))}updates(e,t=0){return e=this.get(e),e.updates.filter(r=>r.serial>t).map(r=>this._public(r,e.updates.length))}onUpdate(e){return this.listeners.add(e),()=>this.listeners.delete(e)}_public(e,t){let r={payload:e.payload,serial:e.serial,max_serial:t,sender:e.sender,timestamp:e.ts};for(let i of["info","document","summary","href"])e[i]!=null&&(r[i]=e[i]);return r}async _save(e){this.store&&await this.store.set(e.id,{updates:e.updates,ls:e.ls,summary:e.summary,document:e.document})}send(e,t,r={addr:"agent@kit",name:"Agent"}){if(e=this.get(e),!e)return Promise.reject(new Error("no such app"));let i=(this._q.get(e.id)||Promise.resolve()).then(async()=>{if(!t||typeof t!="object"||!("payload"in t))throw new Error("an update needs a payload");let _=JSON.stringify(t.payload);if(_===void 0)throw new Error("payload must be JSON");if(_.length>128e3)throw new Error("update payload is over 128 KB");let o={serial:e.updates.length+1,payload:JSON.parse(_),sender:r.addr,senderName:r.name,ts:Date.now()};for(let c of["info","document","summary","href","notify"])t[c]!=null&&(o[c]=t[c]);e.updates.push(o),o.summary!=null&&(e.summary=String(o.summary)),o.document!=null&&(e.document=String(o.document)),await this._save(e);for(let c of this.sessions)c.app===e&&c._deliver([o]);for(let c of this.listeners)try{c(e,this._public(o,e.updates.length))}catch{}return this._public(o,e.updates.length)});return this._q.set(e.id,i.catch(()=>{})),i}open(e,{container:t,self:r={addr:"user@kit",name:"You"},onSendToChat:i=null,onOpen:_=null}={}){let o=this.get(e);if(!o)throw new Error("no such app");if(!t)throw new Error("container is required");let c=document.createElement("iframe");c.setAttribute("sandbox","allow-scripts allow-forms allow-modals allow-downloads"),c.setAttribute("allow","autoplay; fullscreen"),c.title=o.name,c.style.cssText="border:0;width:100%;height:100%;display:block;background:#fff";let p=this,x={app:o,frame:c,listening:!1,lastSent:0,post:E=>c.contentWindow?.postMessage(Object.assign({__xdc:1},E),"*"),_deliver(E){if(!this.listening)return;let k=o.updates.length;for(let $ of E)$.serial>this.lastSent&&(this.post({t:"update",update:p._public($,k)}),this.lastSent=$.serial)},send:(E,k)=>p.send(o,E,k),reload:()=>{x.listening=!1,x.lastSent=0,c.srcdoc=Mt(o,r)},close:()=>{window.removeEventListener("message",S),c.remove(),p.sessions.delete(x)}},S=async E=>{if(E.source!==c.contentWindow||!E.data?.__xdc)return;let k=E.data,$=(y,A)=>x.post({t:"reply",id:k.id,data:y,error:A});try{if(k.t==="listen")x.listening=!0,x.lastSent=+k.serial||0,x._deliver(o.updates),x.post({t:"listen-done"});else if(k.t==="send")await p.send(o,k.update,r);else if(k.t==="all")$(o.updates.map(y=>p._public(y,o.updates.length)));else if(k.t==="ls")o.ls=k.data||{},await p._save(o);else if(k.t==="file"){let y=o.files[k.data];y?$({bytes:y.buffer.slice(y.byteOffset,y.byteOffset+y.byteLength),type:ze(k.data)}):$(null,"not found: "+k.data)}else k.t==="chat"?(i?.(k.data),$(null)):k.t==="open"&&(_?_(k.url):/^https?:/i.test(k.url)&&window.open(k.url,"_blank","noopener"))}catch(y){k.id&&$(null,String(y.message||y))}};return window.addEventListener("message",S),t.appendChild(c),this.sessions.add(x),x.reload(),x}pack(e){return Lt(this.get(e).files)}async reset(e){e=this.get(e),e.updates=[],e.ls={},e.summary="",e.document="",await this._save(e)}};var ct="https://ollama.com",ft="http://localhost:11434",ye=class{constructor({host:e=ft,apiKey:t=""}={}){this.host=String(e).replace(/\/+$/,""),this.apiKey=t}get cloud(){return/^https:\/\/(www\.)?ollama\.com$/i.test(this.host)}get name(){return this.cloud?"Ollama Cloud":`Ollama at ${this.host}`}get headers(){let e={"Content-Type":"application/json"};return this.apiKey&&(e.Authorization="Bearer "+this.apiKey),e}async _err(e){let t=`HTTP ${e.status}`;try{t=(await e.json()).error||t}catch{}return e.status===401?t=this.cloud?"the Ollama API key was rejected (401). Create one at https://ollama.com/settings/keys":`${this.name} refused the request (401)`:e.status===404&&/model/i.test(t)?t+=this.cloud?"":" (pull it first: ollama pull <model>)":(e.status===402||e.status===429)&&(t+=" (usage limit)"),new Error(`${this.name}: ${t}`)}async _fetch(e,t={}){if(this.cloud&&!this.apiKey)throw new Error("no Ollama Cloud API key: createKit({ ollamaKey }) or kit.ollama.apiKey = \u2026");let r;try{r=await fetch(this.host+e,{...t,headers:{...this.headers,...t.headers||{}}})}catch(i){throw i?.name==="AbortError"?i:new Error(this.cloud?`could not reach Ollama Cloud (${i.message})`:`could not reach ${this.name}. Is "ollama serve" running? If it is, the browser blocked the request: start it with OLLAMA_ORIGINS set to this page's origin (or "*").`)}if(!r.ok)throw await this._err(r);return r}_post(e,t,r){return this._fetch(e,{method:"POST",body:JSON.stringify(t),signal:r})}async models(){return((await(await this._fetch("/api/tags")).json()).models||[]).map(t=>t.name||t.model).filter(Boolean)}async embed(e,{model:t="embeddinggemma",dimensions:r,truncate:i=!0,signal:_}={}){let o=!Array.isArray(e),c=(o?[e]:e).map(String);if(!c.length)return[];let p=[];for(let x=0;x<c.length;x+=64){let S=await this._post("/api/embed",{model:t,input:c.slice(x,x+64),truncate:i,...r?{dimensions:r}:{}},_);p.push(...(await S.json()).embeddings||[])}return o?p[0]:p}async webSearch(e,{maxResults:t=5,signal:r}={}){return(await this._post("/api/web_search",{query:String(e),max_results:Math.max(1,Math.min(10,+t||5))},r)).json()}async webFetch(e,{signal:t}={}){return(await this._post("/api/web_fetch",{url:String(e)},t)).json()}async*chat({signal:e,...t}){let i=(await this._post("/api/chat",{stream:!0,...t},e)).body.getReader(),_=new TextDecoder,o="";for(;;){let{value:c,done:p}=await i.read();if(p)break;o+=_.decode(c,{stream:!0});let x;for(;(x=o.indexOf(`
`))>=0;){let S=o.slice(0,x).trim();if(o=o.slice(x+1),!S)continue;let E=JSON.parse(S);if(E.error)throw new Error(`${this.name}: ${E.error}`);yield E}}if(o.trim()){let c=JSON.parse(o);if(c.error)throw new Error(`${this.name}: ${c.error}`);yield c}}},lt=class extends ye{constructor({apiKey:e="",host:t=ct}={}){super({host:t,apiKey:e})}};var He=class{constructor(e,t,{model:r,table:i="docs"}){this.db=e,this.embedFn=t,this.model=r,this.t=i.replace(/[^\w]/g,"_"),this.dims=null}async init(){let e=this.t,t=this.db;t.exec(`create table if not exists ${e}(id text primary key, text text not null, meta text, model text, dims integer)`);let r=t.get(`select dims, model from ${e} limit 1`);if(r&&(this.dims=r.dims,r.model&&r.model!==this.model))throw new Error(`${e} was embedded with ${r.model}, not ${this.model}: open it with { model: '${r.model}' }`);return this}_vecTable(e){if(this.dims&&this.dims!==e)throw new Error(`the embedding model returned ${e} dimensions; this store has ${this.dims}`);this.dims||(this.dims=e,this.db.exec(`create virtual table if not exists ${this.t}_vec using vec0(embedding float[${e}] distance_metric=cosine)`))}async add(e,{signal:t}={}){if(e=(Array.isArray(e)?e:[e]).map((o,c)=>typeof o=="string"?{text:o}:o).filter(o=>o&&String(o.text??"").trim()),!e.length)return[];let r=await this.embedFn(e.map(o=>String(o.text)),{model:this.model,signal:t});this._vecTable(r[0].length);let i=this.t,_=[];return this.db.transaction(o=>{for(let[c,p]of e.entries()){let x=String(p.id??(crypto.randomUUID?.()||Date.now()+"-"+c)),S=o.get(`select rowid from ${i} where id = ?`,[x]);S&&(o.run(`delete from ${i}_vec where rowid = ?`,[S.rowid]),o.run(`delete from ${i} where rowid = ?`,[S.rowid]));let{lastInsertRowid:E}=o.run(`insert into ${i}(id, text, meta, model, dims) values (?, ?, ?, ?, ?)`,[x,String(p.text),p.meta==null?null:JSON.stringify(p.meta),this.model,r[c].length]);o.run(`insert into ${i}_vec(rowid, embedding) values (?, ?)`,[E,JSON.stringify(r[c])]),_.push(x)}}),_}async search(e,{limit:t=5,hybrid:r=!1,signal:i}={}){if(!this.dims)return[];let[_]=await this.embedFn([String(e)],{model:this.model,signal:i}),o=this.t,c=r?Math.max(t*4,20):t,p=this.db.query(`select d.id, d.text, d.meta, v.distance from ${o}_vec v join ${o} d on d.rowid = v.rowid where v.embedding match ? and k = ? order by v.distance`,[JSON.stringify(_),c]).map($=>({id:$.id,text:$.text,meta:$.meta?JSON.parse($.meta):null,distance:$.distance,score:1-$.distance}));if(!r)return p.slice(0,t);let x=this.db.query(`select id, text, meta from ${o}`),S=new ae(x.map($=>({id:$.id,text:$.text}))).search(e,{limit:c}),E=new Map,k=($,y)=>$.forEach((A,j)=>{let q=E.get(A.id)||{...A,score:0};q.score+=y/(60+j+1),E.set(A.id,q)});return k(p,1),k(S.map($=>{let y=p.find(j=>j.id===$.id),A=x.find(j=>j.id===$.id);return y||{id:$.id,text:A.text,meta:A.meta?JSON.parse(A.meta):null,distance:null}}),1),[...E.values()].sort(($,y)=>y.score-$.score).slice(0,t)}remove(e){let t=this.t;this.db.transaction(r=>{for(let i of[].concat(e)){let _=r.get(`select rowid from ${t} where id = ?`,[String(i)]);_&&(r.run(`delete from ${t}_vec where rowid = ?`,[_.rowid]),r.run(`delete from ${t} where rowid = ?`,[_.rowid]))}})}count(){return this.db.get(`select count(*) n from ${this.t}`).n}save(){return this.db.save()}close(){this.db.close()}};function Nt(b){return{async open(e=":memory:",{model:t="embeddinggemma",table:r="docs",ollama:i=null}={}){let _=await b.sqlite.open(e),o=i||b.local;return new He(_,(c,p)=>o.embed(c,p),{model:t,table:r}).init()}}}var Jt=3e4,dt=2e3,ue=(b,e=Jt)=>(b=String(b??""),b.length<=e?b:b.slice(0,e/2)+`

[\u2026 ${b.length-e} characters cut \u2026]

`+b.slice(-e/2)),ee={type:"string"},ke={type:"integer"},re=(b,e=[])=>({type:"object",properties:b,required:e});function It(b){let e=b.vfs,t=null,r=()=>t||=b.shell.session({cwd:"/"}),i={read:{description:"Read a text file. Lines are numbered (cat -n style). Use offset (1-based line) and limit for long files.",parameters:re({path:{...ee,description:"file path, e.g. /notes/todo.md"},offset:{...ke,description:"first line to read (1-based)"},limit:{...ke,description:`number of lines (default ${dt})`}},["path"]),run({path:o,offset:c=1,limit:p=dt}){let x=e.norm(o,r().cwd);if(e.isDir(x))return`${x} is a directory:
`+e.list(x).map(y=>e.isDir(e.norm(y,x))?y+"/":y).join(`
`);let S=e.read(x).split(`
`),E=Math.max(1,+c||1),k=Math.min(S.length,E-1+(+p||dt)),$=S.slice(E-1,k).map((y,A)=>`${String(E+A).padStart(6)}	${y.length>2e3?y.slice(0,2e3)+"\u2026":y}`).join(`
`);return ue($+(k<S.length?`

[${S.length-k} more lines: read with offset ${k+1}]`:""))}},write:{description:"Create or overwrite a file with the given content (folders are created as needed).",parameters:re({path:ee,content:ee},["path","content"]),run({path:o,content:c}){let p=e.norm(o,r().cwd),x=e.isFile(p);return e.write(p,String(c??"")),`${x?"Overwrote":"Created"} ${p} (${new TextEncoder().encode(String(c??"")).length} bytes)`}},edit:{description:"Edit a file by replacing exact text. oldText must match the file exactly (whitespace included) and occur once, unless replaceAll is true. Read the file first.",parameters:re({path:ee,oldText:{...ee,description:"the exact text to replace"},newText:{...ee,description:"the replacement"},replaceAll:{type:"boolean"}},["path","oldText","newText"]),run({path:o,oldText:c,newText:p,replaceAll:x=!1}){let S=e.norm(o,r().cwd),E=e.read(S),k=String(c??""),$=String(p??"");if(!k)throw new Error("oldText is empty");let y=E.split(k).length-1;if(!y)throw new Error(`oldText was not found in ${S}. Read the file and copy the text exactly.`);if(y>1&&!x)throw new Error(`oldText occurs ${y} times in ${S}. Include more surrounding text so it is unique, or set replaceAll.`);let A=x?E.split(k).join($):E.replace(k,()=>$);e.write(S,A);let j=E.slice(0,E.indexOf(k)).split(`
`).length;return`Edited ${S}: ${x?y:1} replacement${(x?y:1)>1?"s":""} at line ${j}`}},bash:{description:"Run a shell command line (BusyBox: ls, cat, grep, sed, awk, find, \u2026; pipes, redirects, && ||, $(\u2026)). Also node, python and sqlite3. The working directory persists between calls.",parameters:re({command:ee,timeout:{...ke,description:"seconds (default 60)"}},["command"]),async run({command:o,timeout:c=60},{signal:p}={}){let x=await r().run(o,{timeoutMs:Math.min(600,+c||60)*1e3,signal:p}),S=x.output.trimEnd();return ue((S||"(no output)")+(x.code?`
[exit code ${x.code}]`:""))}},python:{description:"Run MicroPython code. The file system is shared with the other tools. print() output is returned.",parameters:re({code:ee},["code"]),async run({code:o}){let c=await b.python.run(o,{cwd:r().cwd});return ue((c.output.trimEnd()||"(no output)")+(c.code?`
[exit code ${c.code}]`:""))}},javascript:{description:"Run JavaScript in a Node-style sandbox (require fs, path, node:sqlite; fetch). console.log output is returned, and the value of a top-level return.",parameters:re({code:ee},["code"]),async run({code:o}){let c=await b.js.run(o,{cwd:r().cwd});return ue([c.output.trimEnd(),c.result!==void 0?`=> ${JSON.stringify(c.result)}`:"",c.code?`[exit code ${c.code}]`:""].filter(Boolean).join(`
`)||"(no output)")}},sqlite:{description:'Run SQL on a SQLite database file (created if missing; ":memory:" for a scratch one). sqlite-vec (vec0, vec_distance_cosine) and FTS5 are built in. Returns rows as JSON.',parameters:re({database:{...ee,description:"file path, e.g. /data/app.db"},sql:ee,params:{type:"array",items:{}}},["database","sql"]),async run({database:o,sql:c,params:p}){let x=await b.sqlite.open(o===":memory:"?":memory:":e.norm(o,r().cwd));try{let S=x.exec(c,p??null);return ue(S.length?JSON.stringify(S.map(E=>E.values.map(k=>Object.fromEntries(E.columns.map(($,y)=>[$,k[y]])))).flat().slice(0,500)):`OK (${x.db.changes()} rows changed)`)}finally{x.close({save:o!==":memory:"})}}},search_files:{description:"Find files by meaning of words (BM25 ranking) under a folder. Returns paths, scores and a snippet.",parameters:re({query:ee,path:{...ee,description:"folder (default /)"},limit:ke},["query"]),run({query:o,path:c="/",limit:p=10}){let x=Ce(e,o,{root:e.norm(c,r().cwd),limit:p});return x.length?JSON.stringify(x,null,1):"no matches"}},search:{description:"Search the web (Ollama web search). Returns titles, URLs and text snippets.",parameters:re({query:ee,max_results:{...ke,description:"1-10 (default 5)"}},["query"]),async run({query:o,max_results:c=5},p){let x=await b.ollama.webSearch(o,{maxResults:c,signal:p?.signal});return ue(x.results?.length?x.results.map((S,E)=>`[${E+1}] ${S.title}
${S.url}
${String(S.content||"").trim()}`).join(`

`):"no results")}},fetch:{description:"Fetch a web page by URL (Ollama web fetch). Returns its title, text content and links.",parameters:re({url:ee},["url"]),async run({url:o},c){let p=await b.ollama.webFetch(o,{signal:c?.signal});return ue(`# ${p.title||o}

${p.content||""}${p.links?.length?`

Links:
`+p.links.slice(0,50).join(`
`):""}`)}}};i.web_search=i.search,i.web_fetch=i.fetch;let _=o=>(o||Object.keys(i).filter(c=>!c.startsWith("web_"))).filter(c=>i[c]);return{defs:i,names:()=>_(),openai:o=>_(o).map(c=>({type:"function",function:{name:c,description:i[c].description,parameters:i[c].parameters}})),anthropic:o=>_(o).map(c=>({name:c,description:i[c].description,input_schema:i[c].parameters})),async call(o,c={},p={}){let x=i[o];if(!x)return`Error: unknown tool "${o}". Tools: ${_().join(", ")}`;if(typeof c=="string")try{c=JSON.parse(c||"{}")}catch{return`Error: arguments for ${o} are not valid JSON`}try{return String(await x.run(c||{},p))}catch(S){return`Error: ${S?.message||S}`}},add(o,c){return i[o]=c,this},get shell(){return r()}}}var Rt=["read","write","edit","bash","search","fetch"],Ht=`You are a capable assistant working in a sandboxed browser workspace with a Unix-like file system.
Tools:
- read: read a file (numbered lines)
- write: create or overwrite a file
- edit: replace exact text in a file (read it first; oldText must match exactly)
- bash: run shell commands (ls, cat, grep, find, sed, awk, \u2026), plus node, python and sqlite3
- search: search the web
- fetch: fetch a web page
Work step by step. Prefer edit over rewriting whole files. Check your work (run it, read it back). Be concise in your final answer.`,Ke=class{constructor({kit:e,provider:t=null,ollama:r=null,model:i=null,system:_=Ht,tools:o=Rt,think:c=void 0,maxSteps:p=40,options:x=void 0,onEvent:S=null}){t||=e.ollama.apiKey?"cloud":"local",this.client=r||(t==="cloud"?e.ollama:e.local),i||=this.client.cloud?"gpt-oss:120b":"qwen3:8b",Object.assign(this,{kit:e,model:i,system:_,toolNames:o,think:c,maxSteps:p,options:x,onEvent:S}),this.messages=[],this.ctrl=null}emit(e){try{this.onEvent?.(e)}catch{}}reset(){this.messages=[]}abort(){this.ctrl?.abort()}async prompt(e,{images:t}={}){if(this.ctrl)throw new Error("the agent is already running");let i=(this.ctrl=new AbortController).signal,_=this.kit.tools.openai(this.toolNames);this.messages.push({role:"user",content:String(e),...t?.length?{images:t}:{}});try{for(let c=0;c<this.maxSteps;c++){let p={role:"assistant",content:""},x="",S=[];for await(let E of this.client.chat({model:this.model,messages:[{role:"system",content:this.system},...this.messages],tools:_,...this.think!==void 0?{think:this.think}:{},...this.options?{options:this.options}:{},signal:i})){let k=E.message||{};k.thinking&&(x+=k.thinking,this.emit({type:"thinking",delta:k.thinking})),k.content&&(p.content+=k.content,this.emit({type:"text",delta:k.content})),k.tool_calls?.length&&S.push(...k.tool_calls)}if(x&&(p.thinking=x),S.length&&(p.tool_calls=S),this.messages.push(p),this.emit({type:"turn_end",message:p}),!S.length)return this.emit({type:"done",text:p.content}),p.content;for(let E of S){let k=E.function?.name,$=E.function?.arguments??{};if(typeof $=="string")try{$=JSON.parse($)}catch{$={}}this.emit({type:"tool_call",name:k,args:$});let y=await this.kit.tools.call(k,$,{signal:i});if(this.emit({type:"tool_result",name:k,result:y}),this.messages.push({role:"tool",tool_name:k,content:y}),i.aborted)throw new DOMException("stopped","AbortError")}}let o=`(stopped after ${this.maxSteps} steps)`;return this.emit({type:"done",text:o}),o}catch(o){if(o?.name==="AbortError")return this.emit({type:"done",text:"(stopped)"}),"(stopped)";throw this.emit({type:"error",error:o}),o}finally{this.ctrl=null}}};var Kt="0.1.0";async function Qs({persist:b=!1,files:e=null,ollamaKey:t="",ollamaHost:r=ft,assetsBase:i=null,cdn:_="https://cdn.jsdelivr.net/npm/",engine:o="auto",busybox:c=!0}={}){i&&wt(i);let p=new Me({persist:b});!await p.load().catch(()=>!1)&&e&&p.import(e);let S=new Le(p),E=new De(p),k=new Pe({vfs:p,cdn:_}),$=new Re({vfs:p,sqlite:E,cdn:_}),y=new ye({host:ct,apiKey:t}),A=new ye({host:r}),j={version:Kt,vfs:p,busybox:S,sqlite:E,ml:k,python:$,ollama:y,local:A,bm25:{BM25:ae,search:qt,tokenize:Ue,searchFiles:(s,n)=>Ce(p,s,n)}};j.js=new Ie({vfs:p,sqlite:E,ml:k,bridge:(s,n)=>I(s,n)});let q={node:j.js.command(),js:j.js.command(),python:$.command(),python3:$.command(),sqlite3:E.command()};j.shell=St({vfs:p,busybox:S,engine:o,commands:q}),j.sh=j.shell.session(),j.run=(s,n)=>j.sh.run(s,n),j.webxdc=new Je({vfs:p,persist:b}),j.embed=(s,n)=>A.embed(s,n),j.vectors=Nt(j),j.tools=It(j),j.agent=(s={})=>new Ke({kit:j,...s});async function I(s,n){if(s==="tool")return j.tools.call(n.name,n.args||{});if(s==="list")return j.tools.names();if(s==="shell"){let l=await j.shell.session().run(n.command);return{stdout:l.stdout,stderr:l.stderr,code:l.code}}throw new Error(`kit.${s} is not available in Jade Agent Kit`)}return c&&S.load(),j}export{Ke as Agent,ae as BM25,Le as BusyBox,Rt as DEFAULT_TOOLS,Be as Database,Ie as JsRunner,Pe as ML,ct as OLLAMA_CLOUD,ft as OLLAMA_LOCAL,ye as Ollama,lt as OllamaCloud,Re as Python,Ne as ShellSession,De as Sqlite,Kt as VERSION,Me as VFS,He as VectorStore,Je as Webxdc,qt as bm25Search,Qs as createKit,It as createTools,Ut as getAssetsBase,Tt as gpuShim,Ce as searchFiles,wt as setAssetsBase,Ue as tokenize};
//# sourceMappingURL=jade-agent-kit.js.map
