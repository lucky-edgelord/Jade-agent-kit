/*! Jade Agent Kit 0.1.0 | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */
var de=new TextEncoder,K=new TextDecoder,Te=_=>new Promise(e=>setTimeout(e,_));function oe(_){let e="";for(let t=0;t<_.length;t+=32768)e+=String.fromCharCode.apply(null,_.subarray(t,t+32768));return btoa(e)}var tt=_=>_ instanceof Uint8Array?_:typeof _=="string"?de.encode(_):_ instanceof ArrayBuffer?new Uint8Array(_):ArrayBuffer.isView(_)?new Uint8Array(_.buffer,_.byteOffset,_.byteLength):de.encode(String(_??"")),st=(_,e)=>{if(_===e)return!0;if(!_||!e||_.length!==e.length)return!1;for(let t=0;t<_.length;t++)if(_[t]!==e[t])return!1;return!0},ge=_=>!!_&&_.length>=16&&String.fromCharCode(..._.subarray(0,15))==="SQLite format 3",_t=_=>!!_&&_.length>=8&&_[0]===0&&_[1]===97&&_[2]===115&&_[3]===109,rt=new URL("../assets/",import.meta.url).href,ve=_=>new URL(_,rt).href,yt=_=>{_&&(rt=new URL(_.endsWith("/")?_:_+"/",location.href).href)},Pt=()=>rt;async function re(_,e=_){let t;try{t=await fetch(_)}catch(r){throw new Error(`could not download ${e} (${r.message||r})`)}if(!t.ok)throw new Error(`could not download ${e}: HTTP ${t.status}`);return new Uint8Array(await t.arrayBuffer())}async function we(_,e=_){return K.decode(await re(_,e))}var Ae=new Map;function Le(_,e){return e&&globalThis[e]?Promise.resolve(globalThis[e]):(Ae.has(_)||Ae.set(_,new Promise((t,r)=>{let i=document.createElement("script");i.src=_,i.async=!0,i.crossOrigin="anonymous",i.onload=()=>t(e?globalThis[e]:!0),i.onerror=()=>{Ae.delete(_),r(new Error(`could not load ${_}`))},document.head.appendChild(i)})),Ae.get(_))}function Fe(_,e="kv"){let t=null,r=()=>t??=new Promise((p,o)=>{let a=indexedDB.open(_,1);a.onupgradeneeded=()=>a.result.createObjectStore(e),a.onsuccess=()=>p(a.result),a.onerror=()=>{t=null,o(a.error)}}),i=async(p,o)=>{let a=await r();return new Promise((h,b)=>{let S=a.transaction(e,p),v=o(S.objectStore(e));S.oncomplete=()=>h(v?.result),S.onerror=()=>b(S.error),S.onabort=()=>b(S.error)})};return{get:p=>i("readonly",o=>o.get(p)),set:(p,o)=>i("readwrite",a=>a.put(o,p)),del:p=>i("readwrite",o=>o.delete(p)),keys:()=>i("readonly",p=>p.getAllKeys()),close:async()=>{t&&(await t).close(),t=null}}}function Me(_,e,{timeoutMs:t=6e4,transfer:r=[],onMessage:i=null,signal:p=null,name:o="worker"}={}){let a=URL.createObjectURL(new Blob([_],{type:"text/javascript"}));return new Promise(h=>{let b;try{b=new Worker(a,{name:o})}catch(y){URL.revokeObjectURL(a),h({error:`could not start a ${o} worker (${y.message})`});return}let S=!1,v=y=>{S||(S=!0,clearTimeout(k),p?.removeEventListener?.("abort",E),b.terminate(),URL.revokeObjectURL(a),h(y))},k=setTimeout(()=>v({timeout:!0,error:`${o}: stopped after ${t/1e3}s timeout`}),t),E=()=>v({aborted:!0,error:`${o}: stopped`});p?.addEventListener?.("abort",E),b.onmessage=async y=>{i&&await i(y.data,b)||v(y.data)},b.onerror=y=>{y.preventDefault?.(),v({error:`${y.message||o+" error"}${y.lineno?` (line ${y.lineno})`:""}`,lineno:y.lineno})},b.postMessage(e,r)})}var Ne=class{constructor({persist:e=!1}={}){this.nodes=new Map([["/",{dir:!0,mtime:Date.now()}]]),this.listeners=new Set,this.store=e?Fe("jade-agent-kit:"+e):null,this._t=null,this._saving=null}async load(){if(!this.store)return!1;let e=await this.store.get("vfs");return Array.isArray(e)&&e.length?(this.nodes=new Map(e),this.nodes.has("/")||this.nodes.set("/",{dir:!0,mtime:Date.now()}),!0):!1}async flush(){clearTimeout(this._t),this._t=null,this.store&&await(this._saving=this.store.set("vfs",[...this.nodes.entries()]))}on(e){return this.listeners.add(e),()=>this.listeners.delete(e)}changed(e){for(let t of this.listeners)try{t(e)}catch{}this.store&&(clearTimeout(this._t),this._t=setTimeout(()=>this.flush().catch(()=>{}),150))}norm(e,t="/"){(e==null||e==="")&&(e="."),e=String(e),e==="~"?e="/":e.startsWith("~/")&&(e="/"+e.slice(2));let r=[];for(let i of(e.startsWith("/")?e:t+"/"+e).split("/"))!i||i==="."||(i===".."?r.pop():r.push(i));return"/"+r.join("/")}parent(e){if(e==="/")return"/";let t=e.lastIndexOf("/");return t<=0?"/":e.slice(0,t)}base(e){return e==="/"?"/":e.slice(e.lastIndexOf("/")+1)}exists(e){return this.nodes.has(this.norm(e))}isDir(e){return this.nodes.get(this.norm(e))?.dir===!0}isFile(e){let t=this.nodes.get(this.norm(e));return!!t&&!t.dir}stat(e){e=this.norm(e);let t=this.nodes.get(e);if(!t)throw new Error(`${e}: No such file or directory`);return{dir:!!t.dir,size:t.dir?4096:t.data.length,mtime:t.mtime}}mkdirp(e){if(e=this.norm(e),e!=="/"){if(this.isFile(e))throw new Error(`${e}: Not a directory`);this.isDir(e)||(this.mkdirp(this.parent(e)),this.nodes.set(e,{dir:!0,mtime:Date.now()}),this.changed(e))}}mkdir(e){if(e=this.norm(e),this.exists(e))throw new Error(`${e}: File exists`);if(!this.isDir(this.parent(e)))throw new Error(`${this.parent(e)}: No such file or directory`);this.nodes.set(e,{dir:!0,mtime:Date.now()}),this.changed(e)}readBytes(e){e=this.norm(e);let t=this.nodes.get(e);if(!t)throw new Error(`${e}: No such file or directory`);if(t.dir)throw new Error(`${e}: Is a directory`);return t.data}read(e){return K.decode(this.readBytes(e))}write(e,t,{mkdirs:r=!0}={}){if(e=this.norm(e),e==="/")throw new Error("/: Is a directory");let i=this.parent(e);if(r)this.mkdirp(i);else if(!this.isDir(i))throw new Error(`${i}: No such file or directory`);if(this.isDir(e))throw new Error(`${e}: Is a directory`);this.nodes.set(e,{data:tt(t),mtime:Date.now()}),this.changed(e)}append(e,t){e=this.norm(e);let r=this.isFile(e)?this.readBytes(e):new Uint8Array,i=tt(t),p=new Uint8Array(r.length+i.length);p.set(r),p.set(i,r.length),this.write(e,p)}touch(e){e=this.norm(e);let t=this.nodes.get(e);t?(t.mtime=Date.now(),this.changed(e)):this.write(e,"")}list(e="/"){if(e=this.norm(e),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(!this.isDir(e))throw new Error(`${e}: Not a directory`);let t=e==="/"?"/":e+"/",r=[];for(let i of this.nodes.keys())i!==e&&i.startsWith(t)&&!i.slice(t.length).includes("/")&&r.push(i.slice(t.length));return r.sort()}*walk(e="/"){e=this.norm(e);let t=e==="/"?"/":e+"/";for(let r of[...this.nodes.keys()].sort())(r===e||r.startsWith(t))&&(yield r)}rm(e,t=!1){if(e=this.norm(e),e==="/")throw new Error("refusing to remove '/'");if(!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(e)){if(this.list(e).length&&!t)throw new Error(`${e}: Directory not empty`);for(let r of[...this.nodes.keys()])r.startsWith(e+"/")&&this.nodes.delete(r)}this.nodes.delete(e),this.changed(e)}move(e,t){if(e=this.norm(e),t=this.norm(t),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(t)&&(t=(t==="/"?"":t)+"/"+this.base(e)),t===e)return;if(t.startsWith(e+"/"))throw new Error(`cannot move '${e}' into itself`);if(!this.isDir(this.parent(t)))throw new Error(`${this.parent(t)}: No such file or directory`);let r=[...this.nodes.entries()].filter(([i])=>i===e||i.startsWith(e+"/"));for(let[i]of r)this.nodes.delete(i);for(let[i,p]of r)this.nodes.set(t+i.slice(e.length),p);this.changed(t)}copy(e,t,r=!1){if(e=this.norm(e),t=this.norm(t),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(t)&&(t=(t==="/"?"":t)+"/"+this.base(e)),this.isDir(e)){if(!r)throw new Error(`-r not specified; omitting directory '${e}'`);for(let i of[...this.walk(e)]){let p=this.nodes.get(i),o=t+i.slice(e.length);p.dir?this.mkdirp(o):this.write(o,p.data.slice())}}else this.write(t,this.readBytes(e).slice())}entries(){return[...this.nodes.entries()]}replace(e){this.nodes=new Map(e),this.nodes.has("/")||this.nodes.set("/",{dir:!0,mtime:Date.now()}),this.changed("/")}snapshot(){let e={};for(let[t,r]of this.nodes)r.dir||(e[t]=r.data);return e}import(e,t="/"){for(let[r,i]of Object.entries(e))this.write(this.norm(r,t),i)}applyChanges({writes:e={},deletes:t=[],mkdirs:r=[],rmdirs:i=[]},p){for(let o of t)this.isFile(o)&&this.rm(o);for(let o of i)o!=="/"&&this.isDir(o)&&this.rm(o,!0);for(let o of r)try{this.mkdirp(o)}catch(a){p?.(a)}for(let[o,a]of Object.entries(e))try{a===null?this.isFile(o)&&this.rm(o):this.write(o,a)}catch(h){p?.(new Error(`could not save ${o}: ${h.message}`))}}};var nt=`
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
}`,bt=`
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
};`;var xt=16e6,Ie=class{constructor(e){this.vfs=e,this.module=null,this.wasm=null,this.glue="",this.applets=new Set,this.host="",this.worker=null,this.seq=0,this.pending=new Map,this.mainFns=null,this._p=null,this.error=""}load(){return this._p||=(async()=>{try{let[r,i]=await Promise.all([re(ve("busybox.wasm"),"BusyBox"),we(ve("busybox.glue.js"),"BusyBox glue")]);this.wasm=r,this.glue=i,this.module=await WebAssembly.compile(r)}catch(r){return this.module=null,this.error=r.message,!1}let e=[],t=async()=>{let r=await this.run(["--list"],"",2e4);if(!r.ok)throw new Error(r.error);if(this.applets=new Set(K.decode(r.out).split(/\s+/).filter(Boolean)),!this.applets.size)throw new Error("busybox --list returned nothing")};try{return this.host="worker",await t(),!0}catch(r){e.push("worker: "+r.message)}try{return this.mainFns=this._mainHost(),this.host="main",await t(),!0}catch(r){return e.push("main thread: "+r.message),this.module=null,this.host="",this.error="BusyBox could not start ("+e.join("; ")+")",!1}})()}get ready(){return!!this.module&&this.applets.size>0}_classicGlue(){return this.glue.replace(/export\s+default\s+BusyBoxModule\s*;?\s*$/,"").replace(/import\.meta\.url/g,'"about:blank"')}_mainHost(){return new Function(this._classicGlue()+`
`+nt+`
return { BusyBoxModule, __bbExec };`)()}_spawn(){let e=URL.createObjectURL(new Blob([this._classicGlue()+`
`+nt+`
`+bt],{type:"text/javascript"})),t,r=new Promise((i,p)=>{try{t=new Worker(e,{name:"busybox"})}catch(a){return p(new Error(`new Worker() refused: ${a.message}`))}let o=setTimeout(()=>p(new Error("worker did not answer within 10s")),1e4);t.onmessage=a=>{a.data.type==="ready"?(clearTimeout(o),t.onmessage=h=>{let b=this.pending.get(h.data.id);b&&(this.pending.delete(h.data.id),b(h.data))},i()):a.data.type==="fail"&&(clearTimeout(o),p(new Error(a.data.error)))},t.onerror=a=>{clearTimeout(o),a.preventDefault?.(),p(new Error(a.message||"worker script was blocked or failed to load"))},t.postMessage({type:"init",wasm:this.wasm})});this.worker={w:()=>t,ready:r,url:e}}_entries(){let e=[];for(let[t,r]of this.vfs.nodes)r.dir?e.push([t,{dir:!0}]):r.data.length<=xt&&e.push([t,{data:r.data}]);return e}async run(e,t="",r=3e4,i="/"){if(this.host==="main")try{return await Promise.race([this.mainFns.__bbExec(this.mainFns.BusyBoxModule,this.module,{args:e,stdin:t,entries:this._entries(),cwd:i}),Te(r).then(()=>({ok:!1,timeout:!0,error:`timed out after ${r/1e3}s`}))])}catch(a){return{ok:!1,error:String(a?.message||a)}}this.worker||this._spawn();try{await this.worker.ready}catch(a){return this.worker=null,{ok:!1,error:a.message}}let p=++this.seq,o=this.worker.w();return new Promise(a=>{let h=setTimeout(()=>{this.pending.delete(p),o.terminate(),this.worker?.w()===o&&(this.worker=null);for(let[,b]of this.pending)b({ok:!1,error:"worker restarted"});this.pending.clear(),a({ok:!1,timeout:!0,error:`timed out after ${r/1e3}s`})},r);this.pending.set(p,b=>{clearTimeout(h),a(b)}),o.postMessage({id:p,args:e,stdin:t,entries:this._entries(),cwd:i})})}async exec(e,t=[],{stdin:r="",cwd:i="/",timeoutMs:p=3e4}={}){if(!this.ready&&!await this.load())return{stdout:"",stderr:`busybox: ${this.error}
`,code:127};let o=new Map(this.vfs.nodes),a=await this.run([e,...t],r,p,i);return a.ok?(this._apply(a.entries,o),{stdout:K.decode(a.out),stderr:K.decode(a.err),code:a.code}):{stdout:"",stderr:`busybox ${e}: ${a.error}
`,code:a.timeout?124:126}}_apply(e,t){let r=this.vfs,i=new Set;for(let[p,o]of e){if(i.add(p),p==="/")continue;let a=t.get(p),h=r.nodes.get(p);if(o.dir){h||r.mkdirp(p);continue}a&&!a.dir&&st(a.data,o.data)||h&&!h.dir&&st(h.data,o.data)||r.write(p,o.data)}for(let[p,o]of t)p==="/"||i.has(p)||r.nodes.get(p)!==o||!o.dir&&o.data.length>xt||r.exists(p)&&r.rm(p,!0)}close(){try{this.worker?.w()?.terminate()}catch{}this.worker?.url&&URL.revokeObjectURL(this.worker.url),this.worker=null}};function St(_){let e=_.vfs,t=_.busybox;_.engine||="auto",_.commands||={};function r(s){let n=[],l=0,u=null,g=(c,d)=>{u??=[];let w=u[u.length-1];w&&w.t==="lit"&&w.q===d?w.v+=c:u.push({t:"lit",v:c,q:d})},m=()=>{u&&(n.push({t:"w",segs:u}),u=null)},f=c=>{let d=s[l+1];if(u??=[],d==="("){let x=0,$=l+1;for(;$<s.length;$++)if(s[$]==="(")x++;else if(s[$]===")"&&(x--,!x))break;if($>=s.length)throw new Error("unterminated $(");u.push({t:"sub",v:s.slice(l+2,$),q:c}),l=$+1;return}if(d==="{"){let x=s.indexOf("}",l);if(x<0)throw new Error("bad substitution");u.push({t:"var",v:s.slice(l+2,x),q:c}),l=x+1;return}let w=/^([A-Za-z_]\w*|[?$#0-9])/.exec(s.slice(l+1));if(w){u.push({t:"var",v:w[1],q:c}),l+=1+w[1].length;return}g("$",c),l++};for(;l<s.length;){let c=s[l];if(c==="\\"){if(s[l+1]===`
`){l+=2;continue}g(s[l+1]??"",!0),l+=2;continue}if(c==="'"){let w=s.indexOf("'",l+1);if(w<0)throw new Error("unterminated quote");u??=[],g(s.slice(l+1,w),!0),l=w+1;continue}if(c==='"'){for(l++,u??=[],g("",!0);l<s.length&&s[l]!=='"';)s[l]==="\\"&&'"\\$`'.includes(s[l+1])?(g(s[l+1],!0),l+=2):s[l]==="$"?f(!0):(g(s[l],!0),l++);if(s[l]!=='"')throw new Error("unterminated quote");l++;continue}if(c==="$"){f(!1);continue}if(c===" "||c==="	"||c==="\r"){m(),l++;continue}if(c===`
`){m(),n.push({t:"op",v:";"}),l++;continue}if(c==="#"&&!u){for(;l<s.length&&s[l]!==`
`;)l++;continue}let d=/^(2>&1|&>|2>>|2>|>>|>&2|1>|>|<|&&|\|\||\||;|&)/.exec(s.slice(l));if(d&&!(u&&d[1].startsWith("2"))){m(),n.push({t:"op",v:d[1]}),l+=d[1].length;continue}g(c,!1),l++}return m(),n}function i(s){let n=[],l=[],u={words:[],redirs:[]},g=()=>{(u.words.length||u.redirs.length)&&l.push(u),u={words:[],redirs:[]}},m=f=>{if(g(),l.length)n.push({pipeline:l,op:f});else if(f==="&&"||f==="||")throw new Error(`syntax error near '${f}'`);l=[]};for(let f=0;f<s.length;f++){let c=s[f];if(c.t==="w"){u.words.push(c.segs);continue}switch(c.v){case"|":g();break;case"&&":case"||":case";":case"&":m(c.v==="&"?";":c.v);break;case"2>&1":case">&2":u.redirs.push({op:c.v});break;default:{let d=s[++f];if(!d||d.t!=="w")throw new Error(`syntax error near '${c.v}'`);u.redirs.push({op:c.v==="1>"?">":c.v,target:d.segs})}}}return m(";"),n}let p="";function o(s,{anchored:n=!0}={}){let l="";for(let u=0;u<s.length;u++){let g=s[u];if(g===p){l+=s[++u].replace(/[.*+?^${}()|[\]\\/]/g,"\\$&");continue}if(g==="*")l+="[^/]*";else if(g==="?")l+="[^/]";else if(g==="["){let m=s.indexOf("]",u+1);if(m>u){let f=s.slice(u+1,m);f[0]==="!"&&(f="^"+f.slice(1)),l+="["+f.replace(/\\/g,"\\\\")+"]",u=m}else l+="\\["}else l+=g.replace(/[.+^${}()|\\/\]]/g,"\\$&")}return new RegExp(n?"^"+l+"$":l)}class a{constructor({cwd:n="/",env:l={},onOutput:u=null}={}){this.cwd=n,this.env={HOME:"/",USER:"agent",SHELL:"/bin/sh",PATH:"/bin",...l},this.lastCode=0,this.onOutput=u,this.aborted=!1,this.timeoutMs=6e4}getVar(n){return n==="?"?String(this.lastCode):n==="$"?"1337":n==="#"?"0":n==="0"?"sh":n==="PWD"?this.cwd:this.env[n]??""}async expandWord(n){let l="",u=!1,g=m=>m.replace(/[*?[\]]/g,f=>p+f);for(let m of n)if(m.t==="lit")m.q?l+=g(m.v):(l+=m.v,/[*?[]/.test(m.v)&&(u=!0));else if(m.t==="var")l+=g(this.getVar(m.v));else if(m.t==="sub"){let f=await this.capture(m.v);l+=g(f.replace(/\n+$/,""))}if(u){let m=this.glob(l);if(m.length)return m}return[l.replaceAll(p,"")]}glob(n){let l=n.startsWith("/"),u=e.norm(n.replaceAll(p,""),this.cwd).replaceAll("",p),g=o(u),m=/(^|\/)\./.test(n.replaceAll(p,"")),f=[];for(let d of e.nodes.keys())d==="/"||!g.test(d)||!m&&/\/\.[^/]*$/.test(d)||f.push(d);if(f.sort(),l)return f;let c=this.cwd==="/"?"/":this.cwd+"/";return f.map(d=>d.startsWith(c)?d.slice(c.length):d)}async capture(n){let l=new a({cwd:this.cwd,env:{...this.env}});return l.aborted=this.aborted,l.timeoutMs=this.timeoutMs,(await l.run(n)).chunks.filter(g=>!g.err).map(g=>g.s).join("")}async run(n,{stdin:l=""}={}){let u=[],g=(c,d=!1)=>{c&&(u.push({s:c,err:d}),this.onOutput?.(c,d))},m;try{m=i(r(n))}catch(c){return g(`sh: ${c.message}
`,!0),this.lastCode=2,{chunks:u,code:2}}let f=";";for(let c of m){if(this.aborted){g(`^C
`,!0),this.lastCode=130;break}if(f==="&&"&&this.lastCode!==0||f==="||"&&this.lastCode===0){f=c.op;continue}try{this.lastCode=await this.runPipeline(c.pipeline,l,g)}catch(d){if(d&&d.__exit!==void 0){this.lastCode=d.__exit;break}g(`sh: ${d.message}
`,!0),this.lastCode=1}f=c.op}return{chunks:u,code:this.lastCode}}async runPipeline(n,l,u){let g=l,m=0;for(let f=0;f<n.length;f++){let c=n[f],d=f===n.length-1,w=[];for(let P of c.words)w.push(...await this.expandWord(P));let x=g,$=null,q=null,B=!1,T=!1;for(let P of c.redirs){if(P.op==="2>&1"){B=!0;continue}if(P.op===">&2"){T=!0;continue}let z=(await this.expandWord(P.target))[0],Y=z==="/dev/null"?null:e.norm(z,this.cwd);P.op==="<"?z==="/dev/null"?x="":x=e.read(Y):P.op===">"||P.op===">>"?$={p:Y,append:P.op===">>",dn:z==="/dev/null"}:P.op==="2>"||P.op==="2>>"?q={p:Y,append:P.op==="2>>",dn:z==="/dev/null"}:P.op==="&>"&&($={p:Y,append:!1,dn:z==="/dev/null"},B=!0)}$&&!$.dn&&($.append?e.exists($.p)||e.write($.p,"",{mkdirs:!1}):e.write($.p,"",{mkdirs:!1}));let F=await this.exec(w,x??""),N=F.out||"",C=F.err||"";B&&(N+=C,C=""),T&&(C+=N,N=""),q&&(q.dn||(q.append?e.append(q.p,C):e.write(q.p,C,{mkdirs:!1})),C=""),$&&($.dn||e.append($.p,N),N=""),C&&u(C,!0),d?u(N):g=N,m=F.code}return m}async exec(n,l){for(;n.length&&/^[A-Za-z_]\w*=/.test(n[0]);){let c=n.shift(),d=c.indexOf("=");this.env[c.slice(0,d)]=c.slice(d+1)}if(!n.length)return{out:"",err:"",code:0};let[u,...g]=n;u==="busybox"&&g.length&&!g[0].startsWith("-")&&(u=g.shift());let m={argv:g,stdin:l,sh:this,outS:"",errS:"",o(c){this.outS+=c},e(c){this.errS+=c},P:c=>e.norm(c,this.cwd),name:u},f=c=>({out:m.outS,err:m.errS,code:c??0});try{if(A[u])return f(await A[u](m));if(_.commands[u])return f(await _.commands[u](m));let c=_.engine;if(t.ready&&t.applets.has(u)&&c!=="js"&&!O.has(u)&&!_.commands[u]){let w=await this.execWasm(u,g,l);return w.code!==0&&c==="auto"&&j[u]&&/unrecognized|invalid option|unknown option|not implemented/i.test(w.err)?f(await j[u](m)):w}return c==="wasm"&&!O.has(u)?t.ready?{out:"",err:`sh: ${u}: applet not found in this BusyBox build
`,code:127}:{out:"",err:`sh: ${u}: BusyBox is not loaded${t.error?" ("+t.error+")":""}
`,code:127}:_.commands[u]?f(await _.commands[u](m)):j[u]?f(await j[u](m)):t.ready&&t.applets.has(u)?await this.execWasm(u,g,l):e.isFile(e.norm(u,this.cwd))&&/\.(sh)$/.test(u)?f(await A.sh({...m,argv:[u,...g]})):{out:"",err:`sh: ${u}: not found
`,code:127}}catch(c){if(c&&c.__exit!==void 0)throw c;return{out:m.outS,err:m.errS+`${u}: ${c.message}
`,code:1}}}async execWasm(n,l,u){let g=await t.exec(n,l,{stdin:u,cwd:this.cwd,timeoutMs:this.timeoutMs});return{out:g.stdout,err:g.stderr,code:g.code}}}function h(s,n=""){let l=new Set([...n.matchAll(/(\w):/g)].map(m=>m[1])),u={},g=[];for(let m=0;m<s.length;m++){let f=s[m];if(f==="--"){g.push(...s.slice(m+1));break}if(/^-\d+$/.test(f)&&l.has("n")){u.n=f.slice(1);continue}if(f.startsWith("--")&&f.length>2){let[c,d]=f.slice(2).split("=");u[c]=d??!0;continue}if(f.startsWith("-")&&f.length>1){for(let c=1;c<f.length;c++){let d=f[c];if(l.has(d)){u[d]=f.slice(c+1)||s[++m];break}u[d]=!0}continue}g.push(f)}return{f:u,rest:g}}function b(s,n){return n.length?n.map(l=>{if(l==="-")return{name:"-",text:s.stdin};try{return{name:l,text:e.read(s.P(l))}}catch(u){return s.e(`${s.name}: ${u.message}
`),null}}).filter(Boolean):[{name:"-",text:s.stdin}]}let S=s=>{if(!s)return[];let n=s.split(`
`);return n[n.length-1]===""&&n.pop(),n};function v(s){let n="";for(let l=0;l<s.length;l++){let u=s[l];if(u==="\\"&&l+1<s.length){let g=s[++l];"(){}|+?".includes(g)?n+=g:n+="\\"+g}else"(){}|+?".includes(u)?n+="\\"+u:n+=u}return n}let k=s=>s<1024?s+"":s<1048576?(s/1024).toFixed(1)+"K":(s/1048576).toFixed(1)+"M",E="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" "),y=s=>{let n=new Date(s);return`${E[n.getMonth()]} ${String(n.getDate()).padStart(2)} ${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`},O=new Set(["node","js","python","python3","sqlite3","help","sh","bash","xargs"]),A={cd(s){let n=s.P(s.argv[0]??"/");return e.isDir(n)?(s.sh.cwd=n,0):(s.e(`cd: ${s.argv[0]}: No such directory
`),1)},pwd(s){return s.o(s.sh.cwd+`
`),0},export(s){for(let n of s.argv){let l=n.indexOf("=");l>0&&(s.sh.env[n.slice(0,l)]=n.slice(l+1))}return 0},unset(s){for(let n of s.argv)delete s.sh.env[n];return 0},exit(s){throw{__exit:parseInt(s.argv[0]??"0")||0}},true:()=>0,false:()=>1,":":()=>0,async sh(s){let{f:n,rest:l}=h(s.argv,"c:"),u=new a({cwd:s.sh.cwd,env:{...s.sh.env}});u.timeoutMs=s.sh.timeoutMs;let g=n.c;g==null&&(l.length?g=e.read(s.P(l[0])):g=s.stdin);let m=await u.run(g);for(let f of m.chunks)f.err?s.e(f.s):s.o(f.s);return m.code},get bash(){return this.sh},source(s){return A.sh(s)},which(s){let n=0;for(let l of s.argv)A[l]||j[l]||_.commands[l]||t.applets.has(l)?s.o(`/bin/${l}
`):n=1;return n},type(s){for(let n of s.argv)s.o(A[n]?`${n} is a shell builtin
`:t.applets.has(n)&&_.engine!=="js"?`${n} is /bin/${n} (busybox.wasm)
`:j[n]?`${n} is /bin/${n} (js applet)
`:`${n}: not found
`);return 0},help(s){let n=new Set([...Object.keys(A),...Object.keys(j),...Object.keys(_.commands),...t.applets]);return s.o(`Jade Agent Kit shell \u2014 ${t.ready?`BusyBox WASM (${t.applets.size} applets) + JS`:"JS applets"}
Supports: pipes |, redirects > >> < 2> 2>&1 &>, && || ;, $VAR, $(cmd), globs * ? [..]
No loops/if blocks: use node or python for scripting. Extra: ${Object.keys(_.commands).sort().join(", ")}, xargs.

`+[...n].sort().join("  ")+`
`),0},async xargs(s){let{f:n,rest:l}=h(s.argv,"n:I:"),u=s.stdin.split(/\s+/).filter(Boolean),g=l.length?l:["echo"],m=async c=>{let d=await s.sh.exec([...c],"");return s.o(d.out),s.e(d.err),d.code},f=0;if(n.I)for(let c of s.stdin.split(`
`).filter(Boolean))f=await m(g.map(d=>d.replaceAll(n.I,c)))||f;else{let c=parseInt(n.n)||u.length||1;for(let d=0;d<Math.max(u.length,1);d+=c)f=await m([...g,...u.slice(d,d+c)])||f}return f}},j={echo(s){let n=s.argv,l=!0,u=!1;for(;n.length&&/^-[neE]+$/.test(n[0]);)n[0].includes("n")&&(l=!1),n[0].includes("e")&&(u=!0),n=n.slice(1);let g=n.join(" ");return u&&(g=g.replace(/\\(n|t|\\|e|r)/g,(m,f)=>({n:`
`,t:"	","\\":"\\",e:"\x1B",r:"\r"})[f])),s.o(g+(l?`
`:"")),0},printf(s){let[n="",...l]=s.argv,u=0,g=n.replace(/\\n/g,`
`).replace(/\\t/g,"	").replace(/%(-?\d*)([sdif%])/g,(m,f,c)=>{if(c==="%")return"%";let d=l[u++]??"";c==="d"||c==="i"?d=String(parseInt(d)||0):c==="f"&&(d=String(parseFloat(d)||0));let w=parseInt(f);return isNaN(w)?d:w<0?d.padEnd(-w):d.padStart(w)});return s.o(g),0},cat(s){let{f:n,rest:l}=h(s.argv),u=1;for(let g of b(s,l))n.n?s.o(S(g.text).map(m=>`${String(u++).padStart(6)}	${m}`).join(`
`)+`
`):s.o(g.text);return s.errS?1:0},ls(s){let{f:n,rest:l}=h(s.argv),u=l.length?l:["."],g=0,m=u.length>1||n.R,f=(d,w)=>{let x=e.stat(d);return n.l?`${x.dir?"drwxr-xr-x":"-rw-r--r--"} 1 agent agent ${(n.h?k(x.size):String(x.size)).padStart(7)} ${y(x.mtime)} ${w}${x.dir&&n.F!==!1?"/":""}`:w+(x.dir?"/":"")},c=(d,w)=>{let x=e.list(d);!n.a&&!n.A&&(x=x.filter($=>!$.startsWith("."))),n.t&&x.sort(($,q)=>e.stat(e.norm(q,d)).mtime-e.stat(e.norm($,d)).mtime),n.r&&x.reverse(),m&&s.o(`${w}:
`),n.l&&s.o(`total ${x.length}
`);for(let $ of x)s.o(f(e.norm($,d),$)+`
`);if(n.R)for(let $ of x){let q=e.norm($,d);e.isDir(q)&&(s.o(`
`),c(q,w==="."?"./"+$:w.replace(/\/$/,"")+"/"+$))}};for(let d of u){let w=s.P(d);if(!e.exists(w)){s.e(`ls: ${d}: No such file or directory
`),g=1;continue}e.isDir(w)&&!n.d?c(w,d):s.o(f(w,d)+`
`),m&&!n.R&&s.o(`
`)}return g},mkdir(s){let{f:n,rest:l}=h(s.argv);for(let u of l)n.p?e.mkdirp(s.P(u)):e.mkdir(s.P(u));return 0},rmdir(s){for(let n of s.argv)e.rm(s.P(n),!1);return 0},rm(s){let{f:n,rest:l}=h(s.argv),u=0;for(let g of l){let m=s.P(g);if(!e.exists(m)){n.f||(s.e(`rm: ${g}: No such file or directory
`),u=1);continue}if(e.isDir(m)&&!(n.r||n.R)){s.e(`rm: ${g}: is a directory
`),u=1;continue}e.rm(m,!0)}return u},touch(s){for(let n of h(s.argv).rest){let l=s.P(n);e.isFile(l)?e.touch(l):e.write(l,"",{mkdirs:!1})}return 0},mv(s){let{rest:n}=h(s.argv),l=s.P(n.pop());if(n.length>1&&!e.isDir(l))throw new Error(`target '${l}' is not a directory`);for(let u of n)e.move(s.P(u),l);return 0},cp(s){let{f:n,rest:l}=h(s.argv),u=s.P(l.pop());for(let g of l)e.copy(s.P(g),u,n.r||n.R||n.a);return 0},head(s){let{f:n,rest:l}=h(s.argv,"n:c:");for(let u of b(s,l))if(n.c)s.o(u.text.slice(0,+n.c));else{let g=+(n.n??10),m=S(u.text);s.o((g<0,m.slice(0,g)).map(f=>f+`
`).join(""))}return 0},tail(s){let{f:n,rest:l}=h(s.argv,"n:c:");for(let u of b(s,l))if(n.c)s.o(u.text.slice(-n.c));else{let g=S(u.text),m=String(n.n??10);s.o((m.startsWith("+")?g.slice(+m.slice(1)-1):g.slice(-Math.abs(+m)||g.length)).map(f=>f+`
`).join(""))}return 0},wc(s){let{f:n,rest:l}=h(s.argv),u=!n.l&&!n.w&&!n.c&&!n.m,g=[0,0,0],m=b(s,l),f=(c,d)=>[n.l||u?c[0]:null,n.w||u?c[1]:null,n.c||n.m||u?c[2]:null].filter(w=>w!=null).map(w=>String(w).padStart(7)).join(" ")+(d!=="-"?" "+d:"")+`
`;for(let c of m){let d=[(c.text.match(/\n/g)||[]).length,(c.text.match(/\S+/g)||[]).length,de.encode(c.text).length];g=g.map((w,x)=>w+d[x]),s.o(f(d,c.name))}return m.length>1&&s.o(f(g,"total")),0},grep(s){let{f:n,rest:l}=h(s.argv,"e:m:A:B:C:"),u=n.e??l.shift();if(u==null)return s.e(`usage: grep [-inrvlcEFwoq] PATTERN [FILE...]
`),2;let g=n.F?u.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"):n.E||n.P?u:v(u);n.w&&(g=`\\b(?:${g})\\b`),n.x&&(g=`^(?:${g})$`);let m=new RegExp(g,n.i?"i":""),f=new RegExp(g,n.i?"gi":"g"),c=l,d=n.r||n.R;d&&!c.length&&(c=["."]);let w=[];for(let T of c){let F=s.P(T);if(e.isDir(F)){if(!d){s.e(`grep: ${T}: Is a directory
`);continue}for(let N of e.walk(F))e.isFile(N)&&!/\/(node_modules|\.git)\//.test(N)&&w.push({name:T==="."?N.slice(s.sh.cwd==="/"?1:s.sh.cwd.length+1):T.replace(/\/$/,"")+N.slice(F.length),p:N})}else w.push({name:T,p:F})}let x=c.length?w.map(T=>{try{return{name:T.name,text:e.read(T.p)}}catch(F){return s.e(`grep: ${F.message}
`),null}}).filter(Boolean):[{name:"-",text:s.stdin}],$=(x.length>1||d)&&!n.h,q=!1,B=n.m?+n.m:1/0;for(let T of x){let F=0,N=S(T.text);for(let C=0;C<N.length&&F<B;C++){if(!(m.test(N[C])!==!!n.v))continue;if(F++,q=!0,n.q)return 0;if(n.l||n.c)continue;let z=($?T.name+":":"")+(n.n?C+1+":":"");if(n.o)for(let Y of N[C].matchAll(f))s.o(z+Y[0]+`
`);else s.o(z+N[C]+`
`)}n.l&&F&&s.o(T.name+`
`),n.c&&s.o(($?T.name+":":"")+F+`
`)}return q?0:1},find(s){let n=[...s.argv],l=[];for(;n.length&&!n[0].startsWith("-")&&n[0]!=="("&&n[0]!=="!";)l.push(n.shift());l.length||l.push(".");let u=[],g=1/0,m=0,f=!1;for(;n.length;){let c=n.shift();if(c==="!"||c==="-not"){f=!0;continue}let d=w=>{let x=f;u.push(x?($,q)=>!w($,q):w),f=!1};if(c==="-name"){let w=o(n.shift());d((x,$)=>w.test($))}else if(c==="-iname"){let w=new RegExp(o(n.shift()).source,"i");d((x,$)=>w.test($))}else if(c==="-path"||c==="-wholename"){let w=n.shift(),x=new RegExp(o(w).source.replace(/\[\^\/\]\*/g,".*"));d(($,q,B)=>x.test(B))}else if(c==="-type"){let w=n.shift();d(x=>w==="d"?e.isDir(x):e.isFile(x))}else if(c==="-maxdepth")g=+n.shift();else if(c==="-mindepth")m=+n.shift();else if(c==="-size"){let w=n.shift(),x=/^([+-]?)(\d+)([ckM]?)$/.exec(w),$={c:1,k:1024,M:1048576,"":512}[x[3]],q=+x[2]*$;d(B=>{if(!e.isFile(B))return!1;let T=e.stat(B).size;return x[1]==="+"?T>q:x[1]==="-"?T<q:T===q})}else if(c==="-empty")d(w=>e.isDir(w)?e.list(w).length===0:e.stat(w).size===0);else if(!(c==="-print"||c==="-o"||c==="-a"))return s.e(`find: unsupported option ${c} 
`),1}for(let c of l){let d=s.P(c);if(!e.exists(d)){s.e(`find: ${c}: No such file or directory
`);continue}for(let w of e.walk(d)){let x=w===d?"":w.slice(d==="/"?1:d.length+1),$=x?x.split("/").length:0;if($>g||$<m||/\/(node_modules|\.git)(\/|$)/.test(x)&&!c.includes("node_modules"))continue;let q=x?c==="/"?"/"+x:c.replace(/\/$/,"")+"/"+x:c;u.every(B=>B(w,e.base(w),q))&&s.o(q+`
`)}}return 0},tree(s){let{f:n,rest:l}=h(s.argv,"L:"),u=s.P(l[0]||"."),g=0,m=0,f=n.L?+n.L:1/0;s.o((l[0]||".")+`
`);let c=(d,w,x)=>{if(x>f)return;let $=e.list(d).filter(q=>n.a||!q.startsWith("."));$.forEach((q,B)=>{let T=e.norm(q,d),F=B===$.length-1,N=e.isDir(T);N?g++:m++,s.o(w+(F?"\u2514\u2500\u2500 ":"\u251C\u2500\u2500 ")+q+(N?"/":"")+`
`),N&&c(T,w+(F?"    ":"\u2502   "),x+1)})};return c(u,"",1),s.o(`
${g} directories, ${m} files
`),0},sort(s){let{f:n,rest:l}=h(s.argv,"k:t:"),u=b(s,l).flatMap(m=>S(m.text)),g=m=>n.k?(n.t?m.split(n.t):m.trim().split(/\s+/)).slice(parseInt(n.k)-1).join(" "):m;return u.sort((m,f)=>n.n?(parseFloat(g(m))||0)-(parseFloat(g(f))||0):n.f?g(m).toLowerCase().localeCompare(g(f).toLowerCase()):g(m)<g(f)?-1:g(m)>g(f)?1:0),n.r&&u.reverse(),n.u&&(u=u.filter((m,f)=>f===0||m!==u[f-1])),s.o(u.map(m=>m+`
`).join("")),0},uniq(s){let{f:n,rest:l}=h(s.argv),u=b(s,l).flatMap(m=>S(m.text)),g=[];for(let m of u)g.length&&g[g.length-1][0]===m?g[g.length-1][1]++:g.push([m,1]);for(let[m,f]of g)n.d&&f<2||n.u&&f>1||s.o((n.c?String(f).padStart(7)+" ":"")+m+`
`);return 0},cut(s){let{f:n,rest:l}=h(s.argv,"d:f:c:"),u=g=>g.split(",").flatMap(m=>{let[f,c]=m.split("-"),d=f?+f:1,w=m.includes("-")?c?+c:1e9:d,x=[];for(let $=d;$<=Math.min(w,1e3);$++)x.push($);return x});for(let g of b(s,l).flatMap(m=>S(m.text)))if(n.c){let m=u(n.c);s.o(m.map(f=>g[f-1]??"").join("")+`
`)}else{let m=n.d??"	",f=g.split(m);if(f.length===1&&!g.includes(m)){s.o(g+`
`);continue}s.o(u(n.f||"1").filter(c=>c<=f.length).map(c=>f[c-1]).join(m)+`
`)}return 0},tr(s){let{f:n,rest:l}=h(s.argv),u=c=>{c=c.replace(/\[:upper:\]/g,"A-Z").replace(/\[:lower:\]/g,"a-z").replace(/\[:digit:\]/g,"0-9").replace(/\[:space:\]/g,` 	
`).replace(/\\n/g,`
`).replace(/\\t/g,"	");let d="";for(let w=0;w<c.length;w++)if(c[w+1]==="-"&&c[w+2]){for(let x=c.charCodeAt(w);x<=c.charCodeAt(w+2);x++)d+=String.fromCharCode(x);w+=2}else d+=c[w];return d},g=u(l[0]||""),m=u(l[1]||""),f="";for(let c of s.stdin){let d=g.indexOf(c);n.d?d<0&&(f+=c):d>=0&&m?f+=m[Math.min(d,m.length-1)]:f+=c}return n.s&&(f=f.replace(new RegExp(`([${(m||g).replace(/[\]\\^-]/g,"\\$&")}])\\1+`,"g"),"$1")),s.o(f),0},sed(s){let n=[],l=[],u=!1,g=!1,m=!1,f=s.argv;for(let T=0;T<f.length;T++){let F=f[T];F==="-n"?u=!0:F==="-i"||F.startsWith("-i")?g=!0:F==="-E"||F==="-r"?m=!0:F==="-e"?n.push(f[++T]):F.startsWith("-")&&F.length>1&&/^-[nEr]+$/.test(F)?(F.includes("n")&&(u=!0),/[Er]/.test(F)&&(m=!0)):!n.length&&!l.length&&!f.slice(0,T).includes("-e")?n.push(F):l.push(F)}let c=(T,F="")=>new RegExp(m?T:v(T),F),d=[],w=n.join(`
`),x=0,$=T=>{let F="";for(;x<w.length&&w[x]!==T;){if(w[x]==="\\"&&w[x+1]===T){F+=T,x+=2;continue}if(w[x]==="\\"&&w[x+1]==="n"&&T!=="n"){F+="\\n",x+=2;continue}F+=w[x++]}return x++,F},q=()=>{if(w[x]==="/")return x++,{re:c($("/"))};if(w[x]==="$")return x++,{last:!0};let T=/^\d+/.exec(w.slice(x));return T?(x+=T[0].length,{n:+T[0]}):null};for(;x<w.length;){for(;/[\s;]/.test(w[x]||"");)x++;if(x>=w.length)break;let T=q(),F=null;for(T&&w[x]===","&&(x++,F=q());w[x]===" ";)x++;let N=!1;w[x]==="!"&&(N=!0,x++);let C=w[x++],P={a1:T,a2:F,bang:N,op:C,on:!1};if(C==="s"){let z=w[x++],Y=$(z),W=$(z),V="";for(;/[gipI0-9]/.test(w[x]||"");)V+=w[x++];P.re=c(Y,(V.includes("g")?"g":"")+(/[iI]/.test(V)?"i":"")),P.rep=W.replace(/\$/g,"$$$$").replace(/\\(\d)/g,"$$$1").replace(/(^|[^\\])&/g,"$1$$&").replace(/\\&/g,"&").replace(/\\n/g,`
`),P.p=V.includes("p")}else if(C==="a"||C==="i"||C==="c"){for(;w[x]===" "||w[x]==="\\";)x++;let z="";for(;x<w.length&&w[x]!==`
`&&w[x]!==";";)z+=w[x++];P.text=z}else if(!"dpq=".includes(C))return s.e(`sed: unsupported command '${C}' (BusyBox WASM sed supports it)
`),1;d.push(P)}let B=T=>{let F=S(T),N="";for(let C=0;C<F.length;C++){let P=F[C],z=!1,Y=!1,W=C===F.length-1,V="",be="";for(let R of d){let he=Z=>Z&&(Z.n?Z.n===C+1:Z.last?W:Z.re.test(P)),X;if(R.a1?R.a2?!R.on&&he(R.a1)?(R.on=!0,X=!0,R.a2.n&&R.a2.n<=C+1&&(R.on=!1)):R.on?(X=!0,he(R.a2)&&(R.on=!1)):X=!1:X=he(R.a1):X=!0,R.bang&&(X=!X),!!X)if(R.op==="s"){R.re.lastIndex=0;let Z=P.replace(R.re,R.rep);(Z!==P||R.re.test(P))&&(P=Z,R.p&&(N+=P+`
`))}else if(R.op==="d"){z=!0;break}else if(R.op==="p")N+=P+`
`;else if(R.op==="q"){Y=!0;break}else R.op==="="?N+=C+1+`
`:R.op==="a"?be+=R.text+`
`:R.op==="i"?V+=R.text+`
`:R.op==="c"&&(P=R.text)}if(N+=V,!z&&!u&&(N+=P+`
`),N+=be,Y)break}return N};if(g){for(let T of l){let F=s.P(T);e.write(F,B(e.read(F)))}return 0}for(let T of b(s,l))s.o(B(T.text));return 0},awk(s){let{f:n,rest:l}=h(s.argv,"F:"),u=l.shift()||"",g=/^\s*(?:\/(.*)\/)?\s*(?:\{\s*print\s*([^}]*)\})?\s*$/.exec(u);if(!g)return s.e(`awk: only "[/re/] { print ... }" is supported by the JS fallback; BusyBox WASM provides full awk
`),2;let m=g[1]?new RegExp(g[1]):null,f=(g[2]??"$0").split(",").map(d=>d.trim()).filter(Boolean),c=0;for(let d of b(s,l).flatMap(w=>S(w.text))){if(c++,m&&!m.test(d))continue;let w=n.F?d.split(n.F==="\\t"?"	":n.F):d.trim().split(/\s+/);s.o((f.length?f:["$0"]).map(x=>x.split(/\s+/).map($=>$==="$0"?d:/^\$\d+$/.test($)?w[+$.slice(1)-1]??"":$==="NR"?c:$==="NF"?w.length:$==="$NF"?w[w.length-1]:$.replace(/^"|"$/g,"")).join("")).join(" ")+`
`)}return 0},tee(s){let{f:n,rest:l}=h(s.argv);for(let u of l)n.a?e.append(s.P(u),s.stdin):e.write(s.P(u),s.stdin);return s.o(s.stdin),0},seq(s){let n=s.argv.map(Number),[l,u,g]=n.length===1?[1,1,n[0]]:n.length===2?[n[0],1,n[1]]:n;for(let m=l;u>0?m<=g:m>=g;m+=u)s.o(m+`
`);return 0},async sleep(s){return await Te(Math.min(parseFloat(s.argv[0])*1e3||0,3e4)),0},date(s){let n=new Date;return s.o(s.argv[0]==="-I"||s.argv[0]==="--iso-8601"?n.toISOString().slice(0,10)+`
`:s.argv[0]==="+%s"?Math.floor(n/1e3)+`
`:n.toString()+`
`),0},env(s){for(let[n,l]of Object.entries(s.sh.env))s.o(`${n}=${l}
`);return 0},basename(s){let n=e.base(e.norm(s.argv[0]||""));return s.argv[1]&&n.endsWith(s.argv[1])&&(n=n.slice(0,-s.argv[1].length)),s.o(n+`
`),0},dirname(s){let n=s.argv[0]||".",l=n.replace(/\/$/,"").lastIndexOf("/");return s.o((l<0?".":l===0?"/":n.slice(0,l))+`
`),0},realpath(s){for(let n of s.argv)s.o(s.P(n)+`
`);return 0},stat(s){for(let n of s.argv){let l=e.stat(s.P(n));s.o(`  File: ${n}
  Size: ${l.size}	Type: ${l.dir?"directory":"regular file"}
Modify: ${new Date(l.mtime).toISOString()}
`)}return 0},du(s){let{f:n,rest:l}=h(s.argv);for(let u of l.length?l:["."]){let g=0;for(let m of e.walk(s.P(u)))e.isFile(m)&&(g+=e.stat(m).size);s.o(`${n.h?k(g):Math.ceil(g/1024)}	${u}
`)}return 0},base64(s){let{f:n,rest:l}=h(s.argv),u=b(s,l)[0]?.text??"";if(n.d)s.o(K.decode(Uint8Array.from(atob(u.replace(/\s/g,"")),g=>g.charCodeAt(0))));else{let g="";for(let m of de.encode(u))g+=String.fromCharCode(m);s.o(btoa(g).replace(/.{76}/g,`$&
`)+`
`)}return 0},rev(s){for(let n of b(s,s.argv).flatMap(l=>S(l.text)))s.o([...n].reverse().join("")+`
`);return 0},nl(s){let n=1;for(let l of b(s,s.argv).flatMap(u=>S(u.text)))s.o(l.trim()?`${String(n++).padStart(6)}	${l}
`:`
`);return 0},test(s){let n=[...s.argv];if(s.name==="["&&n.pop()!=="]")return s.e(`[: missing ]
`),2;let l=!1;n[0]==="!"&&(l=!0,n.shift());let u,[g,m,f]=n;if(n.length===0)u=!1;else if(n.length===1)u=g!=="";else if(n.length===2){let c=s.P(m);u={"-f":e.isFile(c),"-d":e.isDir(c),"-e":e.exists(c),"-s":e.isFile(c)&&e.stat(c).size>0,"-z":m==="","-n":m!=="","-r":e.exists(c),"-w":e.exists(c),"-x":!1}[g]??!1}else u={"=":g===f,"==":g===f,"!=":g!==f,"-eq":+g==+f,"-ne":+g!=+f,"-lt":+g<+f,"-le":+g<=+f,"-gt":+g>+f,"-ge":+g>=+f}[m]??!1;return(l?!u:u)?0:1},get"["(){return this.test},yes(s){return s.o(((s.argv[0]??"y")+`
`).repeat(100)),0},whoami(s){return s.o((s.sh.env.USER||"agent")+`
`),0},uname(s){return s.o(s.argv.includes("-a")?`JadeAgentKit browser 1.0 ${navigator.platform||"web"} wasm32
`:`JadeAgentKit
`),0},async sha256sum(s){for(let n of b(s,s.argv)){let l=await crypto.subtle.digest("SHA-256",de.encode(n.text));s.o([...new Uint8Array(l)].map(u=>u.toString(16).padStart(2,"0")).join("")+"  "+n.name+`
`)}return 0},diff(s){let{f:n,rest:l}=h(s.argv);if(l.length<2)return s.e(`usage: diff [-u] FILE1 FILE2
`),2;let u=S(e.read(s.P(l[0]))),g=S(e.read(s.P(l[1])));return u.join(`
`)===g.join(`
`)?0:u.length*g.length>4e6?(s.o(`Files ${l[0]} and ${l[1]} differ
`),1):(s.o(`--- ${l[0]}
+++ ${l[1]}
`+I(u,g)),1)}};function I(s,n,l=3){let u=s.length,g=n.length,m=Array.from({length:u+1},()=>new Uint32Array(g+1));for(let $=u-1;$>=0;$--)for(let q=g-1;q>=0;q--)m[$][q]=s[$]===n[q]?m[$+1][q+1]+1:Math.max(m[$+1][q],m[$][q+1]);let f=[],c=0,d=0;for(;c<u||d<g;)c<u&&d<g&&s[c]===n[d]?(f.push([" ",s[c],c,d]),c++,d++):c<u&&(d>=g||m[c+1][d]>=m[c][d+1])?(f.push(["-",s[c],c,d]),c++):(f.push(["+",n[d],c,d]),d++);let w="",x=0;for(;x<f.length;){if(f[x][0]===" "){x++;continue}let $=Math.max(0,x-l),q=x;for(;q<f.length;){if(f[q][0]!==" "){q++;continue}let N=0;for(;q+N<f.length&&f[q+N][0]===" ";)N++;if(N>l*2||q+N>=f.length){q=Math.min(f.length,q+l);break}q+=N}let B=f.slice($,q),T=B[0][2]+1,F=B[0][3]+1;w+=`@@ -${T},${B.filter(N=>N[0]!=="+").length} +${F},${B.filter(N=>N[0]!=="-").length} @@
`+B.map(N=>N[0]+N[1]+`
`).join(""),x=q}return w}return{Shell:a,BUILTINS:A,APPLETS:j,opts:h,inputs:b,splitLines:S,tokenize:r,parse:i,globToRe:o}}var Re=class{constructor(e,{cwd:t="/",env:r={},timeoutMs:i=6e4}={},p=null,o=()=>"auto"){this.core=e,this.bb=p,this.engine=o,this.sh=new e.Shell({cwd:t,env:r}),this.sh.timeoutMs=i}get cwd(){return this.sh.cwd}set cwd(e){this.sh.cwd=e}get env(){return this.sh.env}async run(e,{stdin:t="",timeoutMs:r,onOutput:i,signal:p}={}){this.bb&&!this.bb.ready&&this.engine()!=="js"&&await this.bb.load();let o=this.sh;r&&(o.timeoutMs=r),o.onOutput=i||null,o.aborted=!1;let a=()=>{o.aborted=!0};p?.addEventListener?.("abort",a);try{let h=await o.run(String(e??""),{stdin:t}),b=h.chunks.filter(v=>!v.err).map(v=>v.s).join(""),S=h.chunks.filter(v=>v.err).map(v=>v.s).join("");return{stdout:b,stderr:S,code:h.code,output:h.chunks.map(v=>v.s).join("")}}finally{p?.removeEventListener?.("abort",a),o.onOutput=null}}};function vt({vfs:_,busybox:e,engine:t="auto",commands:r={}}){let i={vfs:_,busybox:e,engine:t,commands:r},p=St(i);return{core:p,commands:r,session:o=>new Re(p,o,e,()=>i.engine),get engine(){return i.engine},set engine(o){i.engine=o}}}var it=`
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
`;var Wt=/\btf\s*\.\s*[A-Za-z_$]|@tensorflow\/tfjs/,De=class{constructor({vfs:e,sqlite:t=null,ml:r=null,bridge:i=null}){this.vfs=e,this.sqlite=t,this.ml=r,this.bridge=i}_changesSince(e){let t={},r=[],i=[],p=[];for(let[o,a]of this.vfs.nodes){let h=e.get(o);if(a.dir){h!=="d"&&i.push(o);continue}h!==a&&(ge(a.data)?t[o]=a.data:a.data.length<2e6&&(t[o]=K.decode(a.data)))}for(let[o,a]of e)this.vfs.nodes.has(o)||(a==="d"?p:r).push(o);return Object.keys(t).length||r.length||i.length||p.length?{files:t,deleted:r,dirs:i,rmdirs:p}:null}_apply(e,t){if(!e)return;let r=Object.entries(e.writes||{});this.vfs.applyChanges({deletes:r.filter(([,i])=>i===null).map(([i])=>i),rmdirs:e.rmdirs||[],mkdirs:e.mkdirs||[],writes:Object.fromEntries(r.filter(([,i])=>i!==null))},t)}async run(e,{argv:t=["[eval]"],cwd:r="/",globals:i=null,timeoutMs:p=6e4,readOnly:o=!1,network:a=!0,env:h={},signal:b=null}={}){let S=this.vfs;e=String(e??"").replace(/^#!.*\n/,""),/^\s*(import|export)\s/m.test(e)&&(e=e.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,'const $1 = require("$2");').replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,'const $1 = require("$2");').replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,(d,w,x)=>"const {"+w.replace(/\s+as\s+/g,": ")+'} = require("'+x+'");').replace(/^\s*export\s+(default\s+)?/gm,""));let v={},k=[],E={};for(let[d,w]of S.nodes)w.dir?k.push(d):ge(w.data)?(E[d]=w.data,v[d]=w.data):w.data.length<2e6&&(v[d]=K.decode(w.data));let y=d=>d.test(e)||[...S.nodes].some(([w,x])=>!x.dir&&/\.[cm]?js$/.test(w)&&x.data.length<2e6&&d.test(K.decode(x.data))),O=null,A="",j="";if(this.sqlite&&y(/sqlite/i))try{O=await this.sqlite.module(),A=this.sqlite.glueSource}catch(d){return{stdout:"",stderr:`node: could not load SQLite (${d.message})
`,code:1}}if(this.ml&&a&&y(Wt))try{j=await this.ml.tfjsSource()}catch(d){return{stdout:"",stderr:`node: could not load TensorFlow.js (${d.message})
`,code:1}}let I=i?Object.keys(i).filter(d=>/^[$A-Za-z_][\w$]*$/.test(d)):[],s=I.length?`const { ${I.join(", ")} } = __globals;
`:"",n=it+`
const kit = jade;

async function __main() {
${s}${e}
}
`+(A?`
`+A+`
`:"")+(j?`
(function () { var exports, module, define;
${j}
}).call(self);
self.__tfInit = async () => { const tf = self.tf; try { tf.env().set('IS_NODE', false); } catch (e) {} const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { let gl = false; try { gl = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(2, 2).getContext('webgl2'); } catch (e) {} for (const b of ['webgpu', 'webgl']) { if (b === 'webgpu' && !(self.navigator && self.navigator.gpu)) continue; if (b === 'webgl' && !gl) continue; try { if (tf.findBackendFactory(b) && await tf.setBackend(b)) { await tf.ready(); const v = await tf.tensor([1, 2]).add(1).data(); if (v[0] === 2) return; } } catch (e) {} } for (const b of ['webgpu', 'webgl']) { try { tf.removeBackend(b); } catch (e) {} } await tf.setBackend('cpu'); await tf.ready(); } finally { Object.assign(console, keep); } };
`:""),l=it.split(`
`).length+3+(s?1:0),u=URL.createObjectURL(new Blob([n],{type:"text/javascript"})),g=this.bridge,m=await new Promise(d=>{let w;try{w=new Worker(u,{name:"node"})}catch(T){d({out:[["e",`node: could not start a worker (${T.message})
`]],writes:{},code:1});return}let x=!1,$=T=>{x||(x=!0,clearTimeout(q),b?.removeEventListener?.("abort",B),w.terminate(),d(T))},q=setTimeout(()=>$({out:[["e",`node: killed after ${p/1e3}s timeout
`]],writes:{},code:124}),p),B=()=>$({out:[["e",`node: stopped
`]],writes:{},code:130});b?.addEventListener?.("abort",B),w.onmessage=async T=>{let F=T.data;if(F&&F.t==="jade"){let N;try{if(!g)throw new Error("kit calls are not available here");F.sync&&!o&&this._apply(F.sync);let C=new Map;for(let[Y,W]of S.nodes)C.set(Y,W.dir?"d":W);let P=await g(F.op,F.a||{}),z=P===void 0?null:P;try{z=JSON.parse(JSON.stringify(z))}catch{z=String(z)}N={t:"jret",id:F.id,ok:!0,value:z,sync:o?null:this._changesSince(C)}}catch(C){N={t:"jret",id:F.id,ok:!1,error:String(C?.message||C)}}x||w.postMessage(N);return}$(F)},w.onerror=T=>{T.preventDefault?.(),$({out:[["e",`${T.message||"SyntaxError"}${T.lineno?` (line ${Math.max(1,T.lineno-l)})`:""}
`]],writes:{},code:1})},w.postMessage({files:v,dirs:k,bins:E,sqliteModule:O,env:h,cwd:r,argv:t,globals:i?JSON.parse(JSON.stringify(i)):{},bridge:!!g,bridgeWhy:g?"":"no host bridge",noNet:!a})});URL.revokeObjectURL(u);let f=[];o||this._apply(m,d=>f.push(d.message+`
`));let c=m.out||[];return{stdout:c.filter(d=>d[0]==="o").map(d=>d[1]).join(""),stderr:c.filter(d=>d[0]==="e").map(d=>d[1]).join("")+f.join(""),output:c.map(d=>d[1]).join(""),code:m.code??1,result:m.ret}}command(){return async e=>{let t=e.argv,r,i,p=t.findIndex(a=>a==="-e"||a==="-p"||a==="--eval"||a==="--print");if(p>=0)r=/p/.test(t[p])?`console.log(${t[p+1]??""})`:t[p+1]??"",i=["[eval]",...t.slice(p+2)];else if(t.length&&t[0]!=="-"){let a=e.P(t[0]);if(!this.vfs.isFile(a))return e.e(`node: cannot find module '${t[0]}'
`),1;r=this.vfs.read(a),i=[a,...t.slice(1)]}else r=e.stdin,i=["[stdin]"];if(!String(r).trim())return e.e(`node: no script given. Use node file.js or node -e "code"
`),1;let o=await this.run(r,{argv:i,cwd:e.sh.cwd,timeoutMs:e.sh.timeoutMs,env:e.sh.env});return e.o(o.stdout),e.e(o.stderr),o.code}}};function kt(_,e){let t=JSON.stringify(e+"micropython.mjs"),r={},i=String(_).replace(/import\.meta\.url/g,t).replace(/import\.meta\b/g,`({ url: ${t} })`).replace(/\bexport\s*\{([^}]*)\}\s*;?/g,(a,h)=>{for(let b of h.split(",")){let[S,v]=b.trim().split(/\s+as\s+/);S&&(r[(v||S).trim()]=S.trim())}return";"}).replace(/\bexport\s+default\s+(?=[\w$])/g,"var __mpyDefault = ").replace(/\bexport\s+(?=(?:async\s+function|function\*?|const|let|var|class)\b)/g,""),p=r.loadMicroPython||"loadMicroPython";return`const __mpyFactory = async () => {
const navigator = (() => { const n = globalThis.navigator; if (!n) return n; const ua = String(n.userAgent || '').replace(/\\s*Version\\/[\\d.]+/, '');
    return new Proxy(n, { get: (t, k) => k === 'userAgent' ? ua : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); })();
${i}
;return { loadMicroPython: typeof ${p} === 'function' ? ${p} : undefined };
};
`}var Et=`def __jv_compat():
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
`,ot=`
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
};`;var $t=`
self.onmessage = (ev) => {
  const { module, argv, stdin, dbBytes, files } = ev.data;
  try {
    const S = __jvSqlite(module);
    const r = S.cli({ argv, stdin, dbBytes, readFile: p => files[p] ?? null });
    self.postMessage(r, r.dbBytes ? [r.dbBytes.buffer] : []);
  } catch (e) { self.postMessage({ out: '', err: 'sqlite3: ' + ((e && e.message) || e) + '\\n', code: 1 }); }
};`,jt=`
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
}`,qt=`
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
`;var at="1.27.0",Be=class{constructor({vfs:e,sqlite:t=null,cdn:r="https://cdn.jsdelivr.net/npm/"}){this.vfs=e,this.sqlite=t,this.base=`${r}@micropython/micropython-webassembly-pyscript@${at}/`,this._p=null}load(){return this._p||=(async()=>{let[e,t]=await Promise.all([we(this.base+"micropython.mjs","MicroPython"),re(this.base+"micropython.wasm","MicroPython")]);if(!e||!_t(t))throw new Error(`MicroPython ${at} downloaded incomplete (${t.length} bytes of wasm)`);return{factory:kt(e,this.base),wasm:"data:application/wasm;base64,"+oe(t)}})().catch(e=>{throw this._p=null,e})}async run(e,{argv:t=[""],cwd:r="/",stdin:i="",timeoutMs:p=6e4,heapMB:o=16,signal:a=null}={}){let h;try{h=await this.load()}catch(j){return{stdout:"",stderr:`python: ${j.message}
`,output:`python: ${j.message}
`,code:1}}let b=this.vfs,S={},v=[];for(let[j,I]of b.nodes)I.dir?v.push(j):I.data.length<4e6&&(S[j]=I.data);let k=null;if(this.sqlite&&(/sqlite/i.test(e)||[...b.nodes].some(([j,I])=>!I.dir&&j.endsWith(".py")&&I.data.length<2e6&&/sqlite/i.test(K.decode(I.data)))))try{k=await this.sqlite.module()}catch(j){return{stdout:"",stderr:`python: could not load SQLite (${j.message})
`,code:1}}let E=k?h.factory+this.sqlite.glueSource+`
`+jt+`
`+ot:h.factory+ot,y=await Me(E,{sqliteModule:k,sqliteShim:qt,compat:Et,wasm:h.wasm,files:S,dirs:v,cwd:r,argv:t,code:String(e),stdin:i,heap:o*1024*1024},{timeoutMs:p,signal:a,name:"python"});if(y.error)return{stdout:"",stderr:`python: ${y.error}
`,output:`python: ${y.error}
`,code:y.timeout?124:y.aborted?130:1};let O=[];b.applyChanges({deletes:y.deletes||[],mkdirs:y.mkdirs||[],writes:y.writes||{}},j=>O.push(`python: ${j.message}
`));let A=y.out||[];return{stdout:A.filter(j=>j[0]==="o").map(j=>j[1]).join(""),stderr:A.filter(j=>j[0]==="e").map(j=>j[1]).join("")+O.join(""),output:A.map(j=>j[1]).join(""),code:y.code??1}}command(){return async e=>{let t=e.argv,r,i;if(t[0]==="--version"||t[0]==="-V")return e.o(`MicroPython ${at} (WebAssembly)
`),0;if(t[0]==="-m"&&t[1]==="pip")return e.e(`pip is not available: MicroPython runs in the browser and has no package installer.
`),1;if(t[0]==="-c")r=t[1]??"",i=["-c",...t.slice(2)];else if(t.length&&t[0]!=="-"){let o=e.P(t[0]);if(!this.vfs.isFile(o))return e.e(`python: can't open file '${t[0]}': No such file
`),2;r=this.vfs.read(o),i=[o,...t.slice(1)]}else r=e.stdin,i=[""];if(!String(r).trim())return e.e(`python: no script given. Use python file.py or python -c "code"
`),2;let p=await this.run(r,{argv:i,cwd:e.sh.cwd,stdin:t[0]==="-c"||t.length&&t[0]!=="-"?e.stdin:"",timeoutMs:e.sh.timeoutMs});return e.o(p.stdout),e.e(p.stderr),p.code}}};function lt(_){let e=null,t={wasi_snapshot_preview1:{clock_time_get(m,f,c){return new DataView(e.buffer).setBigUint64(c,BigInt(Date.now())*1000000n,!0),0},fd_close(){return 8},fd_seek(){return 8},fd_write(m,f,c,d){let w=0,x=new DataView(e.buffer);for(let $=0;$<c;$++)w+=x.getUint32(f+$*8+4,!0);return x.setUint32(d,w,!0),0},fd_prestat_get(){return 8},fd_prestat_dir_name(){return 8},proc_exit(m){throw new Error("sqlite exited ("+m+")")},random_get(m,f){let c=new Uint8Array(e.buffer,m,f);for(let d=0;d<f;d+=65536)crypto.getRandomValues(c.subarray(d,Math.min(f,d+65536)));return 0}}},i=new WebAssembly.Instance(_,t).exports;e=i.memory,i._initialize(),i.sqlite3_initialize();let p=new TextEncoder,o=new TextDecoder,a=()=>new Uint8Array(e.buffer),h=()=>new DataView(e.buffer),b=m=>{if(!m)return null;let f=a(),c=m;for(;f[c];)c++;return o.decode(f.subarray(m,c))},S=m=>{let f=i.jv_malloc(Math.max(1,m));if(!f)throw new Error("out of memory");return f},v=(m,f)=>{let c=p.encode(String(m)),d=S(c.length+1);a().set(c,d),a()[d+c.length]=0;try{return f(d,c.length)}finally{i.jv_free(d)}},k=0,E=100,y=101,O=-1,A=b(i.sqlite3_libversion());class j extends Error{constructor(f,c){super(f),this.code=c,this.name="SqliteError"}}class I{constructor(f,c,d){this.db=f,this.p=c,this.sql=d,this.readonly=!!i.sqlite3_stmt_readonly(c)}columns(){let f=i.sqlite3_column_count(this.p),c=[];for(let d=0;d<f;d++)c.push(b(i.sqlite3_column_name(this.p,d)));return c}bind(f){if(i.sqlite3_reset(this.p),i.sqlite3_clear_bindings(this.p),f==null)return this;let c=i.sqlite3_bind_parameter_count(this.p),d=(w,x)=>{let $;if(x==null)$=i.sqlite3_bind_null(this.p,w);else if(typeof x=="bigint")$=i.sqlite3_bind_int64(this.p,w,x);else if(typeof x=="boolean")$=i.sqlite3_bind_int64(this.p,w,x?1n:0n);else if(typeof x=="number")$=Number.isSafeInteger(x)?i.sqlite3_bind_int64(this.p,w,BigInt(x)):i.sqlite3_bind_double(this.p,w,x);else if(x instanceof Uint8Array||x instanceof ArrayBuffer){let q=x instanceof Uint8Array?x:new Uint8Array(x),B=S(q.length);a().set(q,B),$=i.sqlite3_bind_blob(this.p,w,B,q.length,O),i.jv_free(B)}else $=v(typeof x=="object"?JSON.stringify(x):x,(q,B)=>i.sqlite3_bind_text(this.p,w,q,B,O));if($!==k)throw this.db.err($)};if(Array.isArray(f)){if(f.length>c)throw new j(`${f.length} values for ${c} parameters`,25);f.forEach((w,x)=>d(x+1,w))}else if(typeof f=="object"&&!(f instanceof Uint8Array))for(let[w,x]of Object.entries(f)){let $=0;for(let q of/^[:@$?]/.test(w)?[""]:[":","@","$"])if($=v(q+w,B=>i.sqlite3_bind_parameter_index(this.p,B)),$)break;if(!$)throw new j(`no parameter named ${w}`,25);d($,x)}else d(1,f);return this}value(f){switch(i.sqlite3_column_type(this.p,f)){case 1:{let c=i.sqlite3_column_int64(this.p,f);return c>=BigInt(Number.MIN_SAFE_INTEGER)&&c<=BigInt(Number.MAX_SAFE_INTEGER)?Number(c):c}case 2:return i.sqlite3_column_double(this.p,f);case 3:{let c=i.sqlite3_column_text(this.p,f),d=i.sqlite3_column_bytes(this.p,f);return o.decode(a().subarray(c,c+d))}case 4:{let c=i.sqlite3_column_blob(this.p,f),d=i.sqlite3_column_bytes(this.p,f);return a().slice(c,c+d)}default:return null}}step(){let f=i.sqlite3_step(this.p);if(f===E)return!0;if(f===y)return this.readonly||(this.db.dirty=!0),!1;throw this.db.err(f)}row(){let f=i.sqlite3_data_count(this.p),c=[];for(let d=0;d<f;d++)c.push(this.value(d));return c}*iterate(f){for(this.bind(f);this.step();)yield this.row()}rows(f){return[...this.iterate(f)]}finalize(){this.p&&(i.sqlite3_finalize(this.p),this.p=0)}}class s{constructor(f){if(this.p=v(":memory:",c=>{let d=S(4);try{let w=i.sqlite3_open_v2(c,d,6,0),x=h().getUint32(d,!0);if(w!==k)throw new j("cannot open database",w);return x}finally{i.jv_free(d)}}),this.dirty=!1,f&&f.length){let c=f.length,d=i.sqlite3_malloc64(BigInt(c));if(a().set(f,d),v("main",x=>i.sqlite3_deserialize(this.p,x,d,BigInt(c),BigInt(c),3))!==k)throw new j("file is not a database",26);try{this.exec("SELECT count(*) FROM sqlite_schema")}catch{throw new j("file is not a database",26)}}}err(f){return new j(b(i.sqlite3_errmsg(this.p))||`SQLite error ${f}`,i.sqlite3_extended_errcode(this.p))}each(f,c){let d=p.encode(String(f)),w=S(d.length+1);a().set(d,w),a()[w+d.length]=0;let x=S(4),$=S(4),q=w,B=w+d.length;try{for(;q<B;){let T=i.sqlite3_prepare_v2(this.p,q,B-q,x,$);if(T!==k)throw this.err(T);let F=h().getUint32(x,!0),N=h().getUint32($,!0);if(F){let C=new I(this,F,o.decode(a().subarray(q,N)).trim());try{c(C)}finally{C.finalize()}}if(N<=q)break;q=N}}finally{i.jv_free(x),i.jv_free($),i.jv_free(w)}}exec(f,c){let d=[],w=!0;return this.each(f,x=>{let $={columns:x.columns(),values:x.rows(w?c:null)};w=!1,$.columns.length&&d.push($)}),d}prepare(f){let c=S(4);try{let d=v(f,(x,$)=>i.sqlite3_prepare_v2(this.p,x,$,c,0));if(d!==k)throw this.err(d);let w=h().getUint32(c,!0);if(!w)throw new j("empty statement",21);return new I(this,w,f)}finally{i.jv_free(c)}}changes(){return i.sqlite3_changes(this.p)}totalChanges(){return i.sqlite3_total_changes(this.p)}lastInsertRowid(){let f=i.sqlite3_last_insert_rowid(this.p);return f<=BigInt(Number.MAX_SAFE_INTEGER)?Number(f):f}inTransaction(){return!i.sqlite3_get_autocommit(this.p)}export(){let f=S(8);try{let c=v("main",x=>i.sqlite3_serialize(this.p,x,f,0)),d=Number(h().getBigInt64(f,!0));if(!c)return new Uint8Array(0);let w=a().slice(c,c+d);return i.sqlite3_free(c),w}finally{i.jv_free(f)}}close(){this.p&&(i.sqlite3_close_v2(this.p),this.p=0)}}let n=m=>v(m,f=>i.sqlite3_complete(f))!==0;function l({argv:m,stdin:f,readFile:c,dbBytes:d}){let w="",x="",$=0,q="list",B=!1,T="|",F="",N=!1,C=!1,P=null,z=[],Y=[],W=L=>{w+=L},V=L=>{x+=L},be={"-json":"json","-csv":"csv","-column":"column","-box":"box","-table":"table","-markdown":"markdown","-line":"line","-list":"list","-html":"html","-tabs":"tabs","-quote":"quote"};for(let L=0;L<m.length;L++){let M=m[L].replace(/^--/,"-");if(be[M])q=be[M],["csv","tabs"].includes(q)&&(T=q==="csv"?",":"	"),["column","box","table","markdown"].includes(q)&&(B=!0);else if(M==="-header"||M==="-headers")B=!0;else if(M==="-noheader")B=!1;else if(M==="-separator")T=m[++L]??"|";else if(M==="-nullvalue")F=m[++L]??"";else if(M==="-cmd")z.push(m[++L]??"");else if(M==="-bail")N=!0;else if(M==="-readonly")C=!0;else{if(M==="-version")return W(A+`
`),{out:w,err:x,code:0};if(M==="-help")return W(g),{out:w,err:x,code:0};if(M.startsWith("-")&&M.length>1)return V(`sqlite3: unknown option: ${m[L]}
Use -help for a list of options.
`),{out:w,err:x,code:1};P===null?P=m[L]:Y.push(m[L])}}let R;try{R=new s(P&&P!==":memory:"?d:null)}catch(L){return V(`Error: unable to open database "${P}": ${L.message}
`),{out:w,err:x,code:1}}let he=!1,X=!1,Z=L=>L===null?F:L instanceof Uint8Array?q==="json"||q==="quote"?"X'"+[...L].map(M=>M.toString(16).padStart(2,"0")).join("")+"'":o.decode(L):typeof L=="bigint"?L.toString():String(L),ht=L=>/[",\n\r]/.test(L)||L!==L.trim()?'"'+L.replace(/"/g,'""')+'"':L,pt=L=>L===null?"NULL":typeof L=="number"||typeof L=="bigint"?String(L):L instanceof Uint8Array?"X'"+[...L].map(M=>M.toString(16).padStart(2,"0")).join("")+"'":"'"+String(L).replace(/'/g,"''")+"'",Ut=(L,M)=>{if(L.length){if(q==="json"){if(!M.length)return;W("["+M.map(D=>"{"+L.map((U,G)=>JSON.stringify(U)+":"+(D[G]instanceof Uint8Array?JSON.stringify(Z(D[G])):typeof D[G]=="bigint"?D[G].toString():JSON.stringify(D[G]))).join(",")+"}").join(`,
`)+`]
`);return}if(q==="line"){let D=Math.max(...L.map(U=>U.length));M.forEach((U,G)=>{G&&W(`
`),L.forEach((ee,se)=>W(ee.padStart(D)+" = "+Z(U[se])+`
`))});return}if(q==="csv"){B&&W(L.map(ht).join(T)+`\r
`);for(let D of M)W(D.map(U=>U===null?"":ht(Z(U))).join(T)+`\r
`);return}if(q==="quote"){B&&W(L.map(D=>"'"+D+"'").join(",")+`
`);for(let D of M)W(D.map(pt).join(",")+`
`);return}if(q==="html"){B&&W("<TR>"+L.map(D=>`<TH>${D}</TH>`).join("")+`
</TR>
`);for(let D of M)W("<TR>"+D.map(U=>`<TD>${Z(U).replace(/&/g,"&amp;").replace(/</g,"&lt;")}</TD>`).join("")+`
</TR>
`);return}if(["column","box","table","markdown"].includes(q)){let D=M.map(J=>J.map(H=>Z(H).replace(/\n/g," "))),U=L.map((J,H)=>Math.max(J.length,...D.map(ie=>(ie[H]||"").length))),G=L.map((J,H)=>M.length&&M.every(ie=>ie[H]===null||typeof ie[H]=="number"||typeof ie[H]=="bigint")),ee=(J,H)=>G[H]?J.padStart(U[H]):J.padEnd(U[H]);if(q==="column"){W(L.map((J,H)=>J.padEnd(U[H])).join("  ").trimEnd()+`
`+U.map(J=>"-".repeat(J)).join("  ")+`
`);for(let J of D)W(J.map(ee).join("  ").trimEnd()+`
`);return}if(q==="markdown"){W("| "+L.map((J,H)=>J.padEnd(U[H])).join(" | ")+` |
|`+U.map((J,H)=>G[H]?"-".repeat(J+1)+":":":"+"-".repeat(J+1)).join("|")+`|
`);for(let J of D)W("| "+J.map(ee).join(" | ")+` |
`);return}let[se,pe,qe,Xe,Ze,Oe,te,xe,Se,fe,me]=q==="box"?["\u250C","\u252C","\u2510","\u251C","\u253C","\u2524","\u2514","\u2534","\u2518","\u2500","\u2502"]:["+","+","+","+","+","+","+","+","+","-","|"],et=(J,H,ie)=>J+U.map(Ct=>fe.repeat(Ct+2)).join(H)+ie+`
`;W(et(se,pe,qe)+me+L.map((J,H)=>" "+J.padEnd(U[H])+" ").join(me)+me+`
`+et(Xe,Ze,Oe));for(let J of D)W(me+J.map((H,ie)=>" "+ee(H,ie)+" ").join(me)+me+`
`);W(et(te,xe,Se));return}B&&W(L.join(T)+`
`);for(let D of M)W(D.map(Z).join(q==="tabs"?"	":T)+`
`)}},je=L=>{try{R.each(L,M=>{if(C&&!M.readonly)throw new j("attempt to write a readonly database",8);let D=M.columns(),U=M.rows();Ut(D,U),he&&!M.readonly&&W(`changes: ${R.changes()}   total_changes: ${R.totalChanges()}
`)})}catch(M){V(`${/syntax error|incomplete input|unrecognized token/.test(M.message)?"Parse error":"Runtime error"}: ${M.message}
`),$=1,N&&(X=!0)}},mt=L=>R.exec(`SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ${L?"AND name LIKE ?":""} ORDER BY 1`,L?[L]:null)[0]?.values.map(M=>M[0])||[],Ve=L=>{let M=(L.match(/"[^"]*"|'[^']*'|\S+/g)||[]).map(U=>U.replace(/^["']|["']$/g,"")),D=M[0].slice(1);if(D==="quit"||D==="exit"){X=!0;return}if(D==="tables"){let U=mt(M[1]);U.length&&W(U.join("  ")+`
`);return}if(D==="schema"||D==="fullschema"){let U=R.exec(`SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${M[1]?"AND (name LIKE ?1 OR tbl_name LIKE ?1)":""} ORDER BY tbl_name, type DESC, name`,M[1]?[M[1]]:null)[0];for(let[G]of U?.values||[])W(G+`;
`);return}if(D==="indexes"||D==="indices"){let U=R.exec(`SELECT name FROM sqlite_schema WHERE type='index' ${M[1]?"AND tbl_name LIKE ?":""} ORDER BY 1`,M[1]?[M[1]]:null)[0];U&&W(U.values.map(G=>G[0]).join("  ")+`
`);return}if(D==="mode"){let U=M[1]||"list";if(!["list","csv","json","line","column","box","table","markdown","html","tabs","quote"].includes(U)){V(`Error: mode should be one of: box column csv html json line list markdown quote table tabs
`),$=1;return}q=U,U==="csv"?T=",":U==="tabs"?T="	":U==="list"&&(T="|"),["column","box","table","markdown"].includes(U)&&(B=!0);return}if(D==="headers"||D==="header"){B=/^(on|1|yes|true)$/i.test(M[1]||"");return}if(D==="separator"){T=(M[1]??"|").replace(/\\t/g,"	").replace(/\\n/g,`
`);return}if(D==="nullvalue"){F=M[1]??"";return}if(D==="changes"){he=/^(on|1|yes|true)$/i.test(M[1]||"");return}if(D==="bail"){N=/^(on|1|yes|true)$/i.test(M[1]||"");return}if(D==="databases"){W(`main: ${P&&P!==":memory:"?P:'""'} r${C?"o":"w"}
`);return}if(D==="print"){W(M.slice(1).join(" ")+`
`);return}if(D==="read"){let U=c(M[1]);if(U==null){V(`Error: cannot open "${M[1]}"
`),$=1;return}gt(U);return}if(D==="import"){let U=M.filter(te=>te.startsWith("--")),G=M.slice(1).filter(te=>!te.startsWith("--")),[ee,se]=G,pe=c(ee);if(pe==null){V(`Error: cannot open "${ee}"
`),$=1;return}let qe=u(pe,q==="tabs"||U.includes("--tabs")?"	":",");if(!qe.length)return;let Xe=+(U.find(te=>te.startsWith("--skip"))?.split("=")[1]||0),Ze=mt(se).includes(se),Oe=qe.slice(Xe);try{if(!Ze){let Se=Oe.shift();R.exec(`CREATE TABLE "${se.replace(/"/g,'""')}"(${Se.map(fe=>'"'+String(fe).replace(/"/g,'""')+'" TEXT').join(", ")})`),R.dirty=!0}let te=R.exec("SELECT count(*) FROM pragma_table_info(?)",[se])[0].values[0][0],xe=R.prepare(`INSERT INTO "${se.replace(/"/g,'""')}" VALUES(${Array(te).fill("?").join(",")})`);try{R.exec("BEGIN");for(let Se of Oe){let fe=Se.slice(0,te);for(;fe.length<te;)fe.push(null);xe.bind(fe),xe.step()}R.exec("COMMIT")}finally{xe.finalize()}R.dirty=!0}catch(te){try{R.exec("ROLLBACK")}catch{}V(`Error: ${te.message}
`),$=1}return}if(D==="dump"){W(`PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
`);let U=R.exec(`SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${M[1]?"AND tbl_name LIKE ?":""} ORDER BY type='table' DESC, rowid`,M[1]?[M[1]]:null)[0]?.values||[];for(let[G,ee,se]of U)if(G==="table"){W(se+`;
`);for(let pe of R.exec(`SELECT * FROM "${ee.replace(/"/g,'""')}"`)[0]?.values||[])W(`INSERT INTO ${/^[A-Za-z_]\w*$/.test(ee)?ee:'"'+ee+'"'} VALUES(${pe.map(pt).join(",")});
`)}for(let[G,,ee]of U)G!=="table"&&W(ee+`;
`);W(`COMMIT;
`);return}if(D==="help"){W(g);return}V(`Error: unknown command or invalid arguments: "${D}". Enter ".help" for help
`),$=1},ce="";function gt(L){for(let M of String(L).split(/\r?\n/)){if(X)return;if(!ce.trim()&&/^\s*\./.test(M)){Ve(M.trim());continue}ce+=M+`
`,n(ce)&&(je(ce),ce="")}}for(let L of z){if(X)break;/^\s*\./.test(L)?Ve(L.trim()):je(L)}if(Y.length)for(let L of Y){if(X)break;/^\s*\./.test(L)?Ve(L.trim()):je(L)}else if(f&&f.trim())gt(f),ce.trim()&&!X&&je(ce);else if(!z.length)return V(`sqlite3: no SQL given. Use: sqlite3 FILE "SQL" | sqlite3 FILE < script.sql | echo "SQL" | sqlite3 FILE
`),R.close(),{out:w,err:x,code:1};let wt={out:w,err:x,code:$};return R.dirty&&P&&P!==":memory:"&&!C&&(wt.dbBytes=R.export()),R.close(),wt}function u(m,f){let c=[],d=[],w="",x=!1;for(let $=0;$<m.length;$++){let q=m[$];if(x){q==='"'?m[$+1]==='"'?(w+='"',$++):x=!1:w+=q;continue}if(q==='"'&&w===""){x=!0;continue}if(q===f){d.push(w),w="";continue}if(q===`
`||q==="\r"){q==="\r"&&m[$+1]===`
`&&$++,d.push(w),w="",(d.length>1||d[0]!=="")&&c.push(d),d=[];continue}w+=q}return(w!==""||d.length)&&(d.push(w),c.push(d)),c}let g=`SQLite ${A} shell (batch mode)
usage: sqlite3 [OPTIONS] [FILE] ["SQL" ...]      (SQL can also come from stdin or < file.sql)
options: -json -csv -column -box -table -markdown -line -list -html -tabs -quote
         -header -noheader -separator SEP -nullvalue TEXT -cmd CMD -bail -readonly -version
dot commands: .tables [pat]  .schema [table]  .indexes [table]  .mode MODE  .headers on|off
              .separator SEP  .nullvalue TEXT  .import FILE TABLE [--skip=N]  .read FILE
              .dump [table]  .changes on|off  .bail on|off  .databases  .print TEXT  .quit
`;return{Database:s,Statement:I,SqliteError:j,version:A,complete:n,cli:l,parseCsv:u}}var ct="var __jvSqlite = "+lt.toString()+";";var Ue=class{constructor(e,t,r,{readOnly:i=!1}={}){this.vfs=t,this.path=r?t.norm(r):null,this.readOnly=i;let p=null;if(this.path&&t.isFile(this.path)&&(p=t.readBytes(this.path),p.length&&!ge(p)))throw new Error(`file is not a database: ${this.path}`);this.db=new e.Database(p)}exec(e,t){return this.db.exec(e,t??null)}query(e,t){let r=this.db.prepare(e);try{let i=r.columns();return r.rows(t??null).map(p=>Object.fromEntries(i.map((o,a)=>[o,p[a]])))}finally{r.finalize()}}get(e,t){return this.query(e,t)[0]}run(e,t){let r=this.db.prepare(e);try{for(r.bind(t??null);r.step(););}finally{r.finalize()}return{changes:this.db.changes(),lastInsertRowid:this.db.lastInsertRowid()}}transaction(e){this.db.exec("BEGIN");try{let t=e(this);return this.db.exec("COMMIT"),t}catch(t){try{this.db.exec("ROLLBACK")}catch{}throw t}}prepare(e){return this.db.prepare(e)}export(){return this.db.export()}save(e=this.path){if(!e)throw new Error("this database has no path: pass one to save(path)");if(this.readOnly)throw new Error("the database is read-only");return this.vfs.write(e,this.db.export()),this.path=this.vfs.norm(e),this.path}close({save:e=!0}={}){this.db&&(e&&this.path&&!this.readOnly&&this.save(),this.db.close(),this.db=null)}},Ce=class{constructor(e){this.vfs=e,this._mod=null,this._api=null,this.glueSource=ct}module(){return this._mod||=re(ve("sqlite3.wasm"),"SQLite").then(e=>WebAssembly.compile(e)).catch(e=>{throw this._mod=null,e})}async api(){return this._api||=lt(await this.module())}async version(){return(await this.api()).version}async open(e=":memory:",t={}){return new Ue(await this.api(),this.vfs,e===":memory:"?null:e,t)}async cli(e,{stdin:t="",cwd:r="/",timeoutMs:i=6e4}={}){let p=this.vfs,o=null;for(let E=0;E<e.length;E++){let y=e[E];if(["-separator","--separator","-nullvalue","--nullvalue","-cmd","--cmd"].includes(y)){E++;continue}if(!y.startsWith("-")){o=y;break}}let a=o&&o!==":memory:"?p.norm(o,r):null;if(a&&p.isDir(a))return{stdout:"",stderr:`Error: unable to open database "${o}": it is a directory
`,code:1};let h=a&&p.isFile(a)?p.readBytes(a):null;if(h&&h.length&&!ge(h))return{stdout:"",stderr:`Error: file is not a database: ${o}
`,code:1};let b={},S=[t,...e].join(`
`);for(let E of S.matchAll(/^\s*\.(?:import|read)\s+(.+)$/gm))for(let y of E[1].match(/"[^"]*"|'[^']*'|\S+/g)||[]){let O=y.replace(/^["']|["']$/g,"");if(O.startsWith("--"))continue;let A=p.norm(O,r);p.isFile(A)&&(b[O]=p.read(A))}let v;try{v=await this.module()}catch(E){return{stdout:"",stderr:`sqlite3: could not load SQLite (${E.message})
`,code:1}}let k=await Me(ct+`
`+$t,{module:v,argv:e,stdin:t,dbBytes:h,files:b},{timeoutMs:i,name:"sqlite3"});return k.error?{stdout:"",stderr:`sqlite3: ${k.error}
`,code:k.timeout?124:1}:(k.dbBytes&&a&&p.write(a,new Uint8Array(k.dbBytes)),{stdout:k.out||"",stderr:k.err||"",code:k.code??1})}command(){return async e=>{let t=await this.cli(e.argv,{stdin:e.stdin,cwd:e.sh.cwd,timeoutMs:e.sh.timeoutMs});return e.o(t.stdout),e.e(t.stderr),t.code}}};var zt=new Set("a an and are as at be but by for from had has have he her his i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who will with you your do does did can could would should not no yes".split(" "));function Pe(_,{stopWords:e=zt,stem:t=!0}={}){let r=[];for(let i of String(_??"").toLowerCase().split(/[^\p{L}\p{N}]+/u))i.length<2||e?.has(i)||(t&&i.length>4&&/[a-z]$/.test(i)&&(i=i.replace(/(ing|ed|es|s)$/,"")),r.push(i));return r}var ae=class{constructor(e=[],{k1:t=1.5,b:r=.75,epsilon:i=.25,tokenize:p=Pe}={}){this.k1=t,this.b=r,this.epsilon=i,this.tok=p,this.docs=[],this.add(e)}add(e){for(let t of e){let r=this.docs.length;this.docs.push(typeof t=="string"?{id:r,text:t}:{...t,id:t.id??r})}return this._build(),this}_build(){let e=this.docs.map(o=>this.tok(o.text??""));this.N=e.length,this.tf=e.map(o=>{let a=new Map;for(let h of o)a.set(h,(a.get(h)||0)+1);return a}),this.len=e.map(o=>o.length),this.avgdl=this.N?this.len.reduce((o,a)=>o+a,0)/this.N:0;let t=new Map;for(let o of this.tf)for(let a of o.keys())t.set(a,(t.get(a)||0)+1);this.idf=new Map;let r=0,i=[];for(let[o,a]of t){let h=Math.log((this.N-a+.5)/(a+.5));this.idf.set(o,h),r+=h,h<0&&i.push(o)}let p=Math.max(this.epsilon*(t.size?r/t.size:0),.01);for(let o of i)this.idf.set(o,p)}scores(e){let t=Array.isArray(e)?e:this.tok(e),r=new Array(this.N).fill(0);for(let i of new Set(t)){let p=this.idf.get(i);if(p!==void 0)for(let o=0;o<this.N;o++){let a=this.tf[o].get(i);a&&(r[o]+=p*(a*(this.k1+1))/(a+this.k1*(1-this.b+this.b*this.len[o]/(this.avgdl||1))))}}return r}search(e,{limit:t=10,minScore:r=0}={}){return this.scores(e).map((p,o)=>({...this.docs[o],score:p})).filter(p=>p.score>r).sort((p,o)=>o.score-p.score).slice(0,t)}},Ot=(_,e,t={})=>new ae(_,t).search(e,t);function We(_,e,{root:t="/",limit:r=10,maxBytes:i=1e6,include:p=/\.(md|txt|js|mjs|ts|py|json|html|css|csv|toml|ya?ml|xml|sh|sql)$/i}={}){let o=[];for(let h of _.walk(t)){if(!_.isFile(h)||!p.test(h))continue;let b=_.readBytes(h);b.length>i||o.push({id:h,path:h,text:h+`
`+new TextDecoder().decode(b)})}let a=Pe(e);return new ae(o).search(e,{limit:r}).map(({path:h,text:b,score:S})=>{let v=b.split(`
`),k=Math.max(0,v.findIndex((E,y)=>y>0&&a.some(O=>E.toLowerCase().includes(O))));return{path:h,score:+S.toFixed(4),line:k||null,snippet:v.slice(k||1,(k||1)+3).join(`
`).slice(0,300)}})}var _e={tfjs:"4.22.0",onnxruntime:"1.31.1",litert:"2.5.3"};function Lt(_=globalThis.navigator?.gpu){if(!_||_.__jak||typeof _.requestAdapter!="function")return;let e=_.requestAdapter.bind(_);_.requestAdapter=async t=>{let r=null;try{r=await e(t)}catch{}if(!r&&!(t&&t.featureLevel))try{r=await e({...t||{},featureLevel:"compatibility"})}catch{}if(r&&!r.__jak&&r.features?.has?.("core-features-and-limits")){let i=r.requestDevice.bind(r);r.requestDevice=(p={})=>i({...p,requiredFeatures:[...new Set([...p.requiredFeatures||[],"core-features-and-limits"])]}),r.__jak=!0}return r},_.__jak=!0}var At={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int8:Int8Array,float64:Float64Array,int16:Int16Array,uint16:Uint16Array},ft=(_,e=[])=>{if(Array.isArray(_))for(let t of _)ft(t,e);else e.push(+_);return e},Tt=_=>{let e=[];for(;Array.isArray(_);)e.push(_.length),_=_[0];return e},ze=class{constructor({vfs:e,cdn:t="https://cdn.jsdelivr.net/npm/"}){this.vfs=e,this.cdn=t,this._tf=null,this._tfSrc=null,this._ort=null,this._lrt=null;try{Lt()}catch{}}url(e,t,r){return`${this.cdn}${e}@${t}/${r}`}async bytes(e){if(e instanceof Uint8Array)return e;if(e instanceof ArrayBuffer)return new Uint8Array(e);let t=String(e||"");if(/^(https?:|blob:|data:)/i.test(t))return re(t,t);if(!this.vfs.isFile(t))throw new Error(`${t} is not a file`);return this.vfs.readBytes(t)}tensorInput(e,t="float32"){if(e&&!Array.isArray(e)&&!ArrayBuffer.isView(e)&&typeof e=="object"){t=e.dtype||t;let r=e.data,i=ArrayBuffer.isView(r)?r:(At[t]||Float32Array).from(ft(r));return[i,e.shape||(Array.isArray(r)?Tt(r):[i.length]),t]}return ArrayBuffer.isView(e)?[e,[e.length],t]:[(At[t]||Float32Array).from(ft(e)),Tt(e),t]}async tf({backend:e}={}){return this._tf||=(async()=>{let t=await Le(this.url("@tensorflow/tfjs",_e.tfjs,"dist/tf.min.js"),"tf");try{await Le(this.url("@tensorflow/tfjs-backend-webgpu",_e.tfjs,"dist/tf-backend-webgpu.min.js"))}catch{}let r=async i=>{try{return!t.findBackendFactory(i)||!await t.setBackend(i)?!1:(await t.ready(),(await t.tensor([1,2]).add(1).data())[0]===2)}catch{return!1}};for(let i of e?[e]:["webgpu","webgl","cpu"])if(await r(i))break;return t})().catch(t=>{throw this._tf=null,t})}tfjsSource(){return this._tfSrc||=we(this.url("@tensorflow/tfjs",_e.tfjs,"dist/tf.min.js"),"TensorFlow.js").catch(e=>{throw this._tfSrc=null,e})}ort(){return this._ort||=(async()=>{let e=this.url("onnxruntime-web",_e.onnxruntime,"dist/"),t=await Le(e+"ort.webgpu.min.js","ort");if(!t?.InferenceSession)throw new Error("ONNX Runtime did not load");return t.env.wasm.numThreads=globalThis.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||1):1,t.env.wasm.wasmPaths=e,t.env.logLevel="error",t})().catch(e=>{throw this._ort=null,e})}async onnx(e,{accelerator:t}={}){let r=this,i=await this.ort(),p=await this.bytes(e),o=t||(await this.webgpu()?"webgpu":"wasm"),a,h=E=>i.InferenceSession.create(p,{executionProviders:E==="webgpu"?["webgpu","wasm"]:["wasm"],graphOptimizationLevel:"all"}),b;try{b=await h(o)}catch(E){if(o==="wasm")throw E;a=`${o} failed (${E.message}); using wasm`,o="wasm",b=await h("wasm")}let S=E=>b[E+"Names"].map((y,O)=>{let A=b[E+"Metadata"],j=Array.isArray(A)?A[O]:A?.[y];return{name:y,shape:(j?.shape||[]).map(I=>typeof I=="number"?I:-1),dtype:j?.type||"float32"}}),v=S("input"),k=S("output");return{accelerator:o,note:a,inputs:v,outputs:k,session:b,async run(E){let y=Array.isArray(E)?E:v.map(I=>E[I.name]??(v.length===1?E:void 0)),O={};v.forEach((I,s)=>{if(y[s]==null)throw new Error(`no data for input ${I.name}`);let[n,l,u]=r.tensorInput(y[s],y[s]?.dtype||I.dtype);if(!y[s]?.shape&&I.shape.length&&l.length!==I.shape.length&&I.shape.filter(g=>g<0).length===1){let g=I.shape.filter(m=>m>0).reduce((m,f)=>m*f,1);if(n.length%g)throw new Error(`input ${I.name} needs a multiple of ${g} values (shape ${JSON.stringify(I.shape)}), got ${n.length}`);l=I.shape.map(m=>m<0?n.length/g:m)}u==="int64"?n=BigInt64Array.from(n,g=>BigInt(Math.round(Number(g)))):u==="bool"&&(n=Uint8Array.from(n,g=>g?1:0)),O[I.name]=new i.Tensor(u,n,y[s]?.shape||l)});let A=await b.run(O),j={};for(let I of b.outputNames){let s=A[I],n=s.location&&s.location!=="cpu"?await s.getData():s.data;j[I]={data:n,shape:[...s.dims],dtype:s.type}}return j},release:()=>b.release()}}litert(){return this._lrt||=(async()=>{let e=await import(this.url("@litertjs/core",_e.litert,"+esm"));return await e.loadLiteRt(this.url("@litertjs/core",_e.litert,"wasm/")),e})().catch(e=>{throw this._lrt=null,e})}async tflite(e,{accelerator:t}={}){let r=this,i=await this.litert(),p=await this.bytes(e),o=!1;try{o=!!await i.isWebGPUSupported?.()}catch{}let a=t||(o?"webgpu":"wasm"),h,b;try{b=await i.loadAndCompile(p,{accelerator:a})}catch(y){if(a==="wasm")throw y;h=`${a} failed (${y.message}); using wasm`,a="wasm",b=await i.loadAndCompile(p,{accelerator:"wasm"})}let S=y=>[...y?.shape||y?.layout?.dimensions||y?.dimensions||[]],v=y=>[...y].map((O,A)=>({index:A,name:O.name,shape:S(O),dtype:O.dtype||O.type?.dtype})),k=v(b.getInputDetails()),E=v(b.getOutputDetails());return{accelerator:a,note:h,inputs:k,outputs:E,model:b,async run(y){let O=Array.isArray(y)&&k.length>1||Array.isArray(y)&&(Array.isArray(y[0])||ArrayBuffer.isView(y[0])||y[0]?.data)?y:[y],A=k.map((s,n)=>{let[l,u]=r.tensorInput(O[n],s.dtype||"float32");return new i.Tensor(l,O[n]?.shape||(s.shape.length?s.shape:u))}),j;try{j=await b.run(A)}finally{A.forEach(s=>{try{s.delete()}catch{}})}let I=[];for(let[s,n]of(Array.isArray(j)?j:Object.values(j)).entries()){let l=n;if(a!=="wasm")try{let u=await l.moveTo("wasm");u&&u!==l&&(l=u)}catch{}I.push({name:E[s]?.name,data:l.toTypedArray(),shape:[...l.type?.layout?.dimensions||E[s]?.shape||[]]});try{l.delete()}catch{}}return I},delete:()=>b.delete()}}async webgpu(){if(this._gpu==null)try{this._gpu=!!(navigator.gpu&&await navigator.gpu.requestAdapter())}catch{this._gpu=!1}return this._gpu}};async function Je(_){let e=_ instanceof Uint8Array?_:new Uint8Array(_),t=new DataView(e.buffer,e.byteOffset,e.byteLength),r=-1;for(let h=e.length-22;h>=Math.max(0,e.length-65557);h--)if(t.getUint32(h,!0)===101010256){r=h;break}if(r<0)throw new Error("not a zip file (.xdc files are zip archives)");let i=t.getUint16(r+10,!0),p=t.getUint32(r+16,!0),o={},a=new TextDecoder;for(let h=0;h<i;h++){if(t.getUint32(p,!0)!==33639248)throw new Error("broken zip directory");let b=t.getUint16(p+10,!0),S=t.getUint32(p+20,!0),v=t.getUint16(p+28,!0),k=t.getUint16(p+30,!0),E=t.getUint16(p+32,!0),y=t.getUint32(p+42,!0),O=a.decode(e.subarray(p+46,p+46+v));if(p+=46+v+k+E,O.endsWith("/"))continue;let A=y+30+t.getUint16(y+26,!0)+t.getUint16(y+28,!0),j=e.subarray(A,A+S),I;if(b===0)I=j.slice();else if(b===8)I=new Uint8Array(await new Response(new Blob([j]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());else throw new Error(`unsupported zip compression (${b}) for ${O}`);o[O.replace(/^\.?\//,"")]=I}return o}function Ft(_){let e={};for(let t of String(_||"").split(/\r?\n/)){let r=/^\s*([\w.-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'([^']*)'|([\w.+-]+))\s*(?:#.*)?$/.exec(t);if(r)e[r[1]]=r[2]!=null?r[2].replace(/\\"/g,'"').replace(/\\\\/g,"\\"):r[3]!=null?r[3]:/^-?\d+(\.\d+)?$/.test(r[4])?+r[4]:r[4]==="true"?!0:r[4]==="false"?!1:r[4];else if(/^\s*\[/.test(t))break}return e}var Jt={html:"text/html",htm:"text/html",js:"text/javascript",mjs:"text/javascript",css:"text/css",json:"application/json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",m4a:"audio/mp4",mp4:"video/mp4",webm:"video/webm",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",wasm:"application/wasm",txt:"text/plain",md:"text/markdown",xml:"application/xml",csv:"text/csv",toml:"text/plain"},Ke=_=>Jt[(_.split(".").pop()||"").toLowerCase()]||"application/octet-stream";function le(_,e){let t=String(e||"").trim();if(!t||/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(t))return null;t=t.split("#")[0].split("?")[0];try{t=decodeURIComponent(t)}catch{}let r=t.startsWith("/")?[]:_.split("/").slice(0,-1);for(let i of t.split("/"))!i||i==="."||(i===".."?r.pop():r.push(i));return r.join("/")}function Mt(_,e){let t=_.files,r=y=>`data:${Ke(y)};base64,${oe(t[y])}`,i=new Map,p=(y,O)=>y.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?/g,(A,j,I)=>{let s=le(O,I);return s&&t[s]?`@import url("data:text/css;base64,${oe(new TextEncoder().encode(p(K.decode(t[s]),s)))}")`:A}).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g,(A,j,I)=>{let s=le(O,I);return s&&t[s]?`url("${r(s)}")`:A}),o=(y,O=[])=>{if(i.has(y))return i.get(y);if(O.includes(y))return null;let A=a(K.decode(t[y]),y,[...O,y]),j=`data:text/javascript;base64,${oe(new TextEncoder().encode(A))}`;return i.set(y,j),j},a=(y,O,A=[])=>y.replace(/(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g,(j,I,s,n)=>{let l=le(O,n);if(!l||!t[l])return j;if(/\.(js|mjs)$/i.test(l)){let u=o(l,A);return u?I+s+u+s:j}return I+s+r(l)+s}).replace(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,(j,I,s)=>{let n=le(O,s);if(!n||!t[n])return j;let l=/\.(js|mjs)$/i.test(n)?o(n,A):r(n);return l?`import(${I}${l}${I})`:j}).replace(/new\s+URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g,(j,I,s)=>{let n=le(O,s);return n&&t[n]?`new URL(${I}${r(n)}${I})`:j}),h=new DOMParser().parseFromString(K.decode(t["index.html"]),"text/html");for(let y of[...h.querySelectorAll("script")]){let O=(y.getAttribute("type")||"").toLowerCase()==="module",A=y.getAttribute("src");if(A){let j=le("index.html",A);if(!j||!t[j]){/webxdc\.js$/.test(A)&&y.remove();continue}y.removeAttribute("src"),y.textContent=O?a(K.decode(t[j]),j,[j]):K.decode(t[j])}else O&&(y.textContent=a(y.textContent,"index.html"))}for(let y of[...h.querySelectorAll("link[href]")]){let O=(y.getAttribute("rel")||"").toLowerCase(),A=le("index.html",y.getAttribute("href"));if(!(!A||!t[A]))if(O.includes("stylesheet")){let j=h.createElement("style");j.textContent=p(K.decode(t[A]),A),y.replaceWith(j)}else O==="modulepreload"?y.remove():y.setAttribute("href",r(A))}for(let y of h.querySelectorAll("style"))y.textContent=p(y.textContent,"index.html");for(let y of h.querySelectorAll("[style]"))y.setAttribute("style",p(y.getAttribute("style"),"index.html"));for(let y of h.querySelectorAll("img[src],audio[src],video[src],source[src],input[src],embed[src],track[src],image[href],use[href]")){let O=y.hasAttribute("src")?"src":"href",A=le("index.html",y.getAttribute(O));A&&t[A]&&y.setAttribute(O,r(A))}let b={},S=12*1048576;for(let[y,O]of Object.entries(t))y!=="index.html"&&(O.length>S||(S-=O.length,b[y]=r(y)));let v=h.createElement("script");v.textContent=Kt({app:_,assets:b,files:Object.keys(t),self:e});let k=h.createElement("meta");return k.setAttribute("http-equiv","Content-Security-Policy"),k.setAttribute("content","default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:"),(h.head||h.documentElement.insertBefore(h.createElement("head"),h.body)).prepend(k,v),`<!DOCTYPE html>
`+h.documentElement.outerHTML}function Kt({app:_,assets:e,files:t,self:r}){let i={addr:r.addr,name:r.name,ls:_.ls||{},assets:e,files:t,android:!!r.android};return`(() => {
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
})();`}function Nt(_){let e=new TextEncoder,t=[],r=[],i=0,p=(()=>{let k=new Uint32Array(256);for(let E=0;E<256;E++){let y=E;for(let O=0;O<8;O++)y=y&1?3988292384^y>>>1:y>>>1;k[E]=y>>>0}return k})(),o=k=>{let E=4294967295;for(let y=0;y<k.length;y++)E=p[(E^k[y])&255]^E>>>8;return(E^4294967295)>>>0};for(let[k,E]of Object.entries(_)){let y=e.encode(k),O=o(E),A=new DataView(new ArrayBuffer(30));A.setUint32(0,67324752,!0),A.setUint16(4,20,!0),A.setUint16(6,2048,!0),A.setUint32(14,O,!0),A.setUint32(18,E.length,!0),A.setUint32(22,E.length,!0),A.setUint16(26,y.length,!0),t.push(new Uint8Array(A.buffer),y,E);let j=new DataView(new ArrayBuffer(46));j.setUint32(0,33639248,!0),j.setUint16(4,20,!0),j.setUint16(6,20,!0),j.setUint16(8,2048,!0),j.setUint32(16,O,!0),j.setUint32(20,E.length,!0),j.setUint32(24,E.length,!0),j.setUint16(28,y.length,!0),j.setUint32(42,i,!0),r.push(new Uint8Array(j.buffer),y),i+=30+y.length+E.length}let a=r.reduce((k,E)=>k+E.length,0),h=new DataView(new ArrayBuffer(22));h.setUint32(0,101010256,!0),h.setUint16(8,Object.keys(_).length,!0),h.setUint16(10,Object.keys(_).length,!0),h.setUint32(12,a,!0),h.setUint32(16,i,!0);let b=[...t,...r,new Uint8Array(h.buffer)],S=new Uint8Array(b.reduce((k,E)=>k+E.length,0)),v=0;for(let k of b)S.set(k,v),v+=k.length;return S}var He=class{constructor({vfs:e,persist:t=!1}){this.vfs=e,this.store=t?Fe("jade-agent-kit-xdc:"+t):null,this.apps=new Map,this.sessions=new Set,this.listeners=new Set,this._q=new Map}async load(e,{name:t="App"}={}){let r;if(e instanceof Uint8Array||e instanceof ArrayBuffer)r=await Je(e);else if(e&&typeof e=="object")r=Object.fromEntries(Object.entries(e).map(([S,v])=>[S,typeof v=="string"?new TextEncoder().encode(v):v]));else{let S=String(e);if(/^(https?:|blob:|data:)/i.test(S))r=await Je(await re(S));else if(this.vfs.isDir(S)){let v=this.vfs.norm(S).replace(/\/$/,"")+"/";r={};for(let[k,E]of this.vfs.nodes)!E.dir&&k.startsWith(v)&&(r[k.slice(v.length)]=E.data);t=this.vfs.base(this.vfs.norm(S))}else if(this.vfs.isFile(S))r=await Je(this.vfs.readBytes(S)),t=this.vfs.base(this.vfs.norm(S)).replace(/\.xdc$/i,"");else throw new Error(`${S}: not a file, folder or URL`)}if(!r["index.html"]){let S=new Set(Object.keys(r).map(v=>v.split("/")[0]));if(S.size===1){let v=[...S][0]+"/";r[v+"index.html"]&&(r=Object.fromEntries(Object.entries(r).map(([k,E])=>[k.slice(v.length),E])))}}if(!r["index.html"])throw new Error("this is not a webxdc app: index.html is missing");let i=r["manifest.toml"]?Ft(K.decode(r["manifest.toml"])):{},p=String(i.name||"").trim();if(!p){let S=/<title>([^<]{1,60})<\/title>/i.exec(K.decode(r["index.html"]));p=S&&S[1].trim()||t}let o=["icon.png","icon.jpg","icon.jpeg","icon.svg","icon.webp"].find(S=>r[S]),a="xdc-"+p.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40),h=this.store?await this.store.get(a):null,b={id:a,name:p,manifest:i,files:r,icon:o?`data:${Ke(o)};base64,${oe(r[o])}`:null,size:Object.values(r).reduce((S,v)=>S+v.length,0),updates:h?.updates||[],ls:h?.ls||{},summary:h?.summary||"",document:h?.document||""};return this.apps.set(a,b),b}get(e){if(typeof e=="object")return e;let t=String(e).toLowerCase();return this.apps.get(e)||[...this.apps.values()].find(r=>r.name.toLowerCase()===t)||null}list(){return[...this.apps.values()].map(({id:e,name:t,size:r,summary:i,document:p,updates:o})=>({id:e,name:t,size:r,summary:i,document:p,updates:o.length}))}updates(e,t=0){return e=this.get(e),e.updates.filter(r=>r.serial>t).map(r=>this._public(r,e.updates.length))}onUpdate(e){return this.listeners.add(e),()=>this.listeners.delete(e)}_public(e,t){let r={payload:e.payload,serial:e.serial,max_serial:t,sender:e.sender,timestamp:e.ts};for(let i of["info","document","summary","href"])e[i]!=null&&(r[i]=e[i]);return r}async _save(e){this.store&&await this.store.set(e.id,{updates:e.updates,ls:e.ls,summary:e.summary,document:e.document})}send(e,t,r={addr:"agent@kit",name:"Agent"}){if(e=this.get(e),!e)return Promise.reject(new Error("no such app"));let i=(this._q.get(e.id)||Promise.resolve()).then(async()=>{if(!t||typeof t!="object"||!("payload"in t))throw new Error("an update needs a payload");let p=JSON.stringify(t.payload);if(p===void 0)throw new Error("payload must be JSON");if(p.length>128e3)throw new Error("update payload is over 128 KB");let o={serial:e.updates.length+1,payload:JSON.parse(p),sender:r.addr,senderName:r.name,ts:Date.now()};for(let a of["info","document","summary","href","notify"])t[a]!=null&&(o[a]=t[a]);e.updates.push(o),o.summary!=null&&(e.summary=String(o.summary)),o.document!=null&&(e.document=String(o.document)),await this._save(e);for(let a of this.sessions)a.app===e&&a._deliver([o]);for(let a of this.listeners)try{a(e,this._public(o,e.updates.length))}catch{}return this._public(o,e.updates.length)});return this._q.set(e.id,i.catch(()=>{})),i}open(e,{container:t,self:r={addr:"user@kit",name:"You"},onSendToChat:i=null,onOpen:p=null}={}){let o=this.get(e);if(!o)throw new Error("no such app");if(!t)throw new Error("container is required");let a=document.createElement("iframe");a.setAttribute("sandbox","allow-scripts allow-forms allow-modals allow-downloads"),a.setAttribute("allow","autoplay; fullscreen"),a.title=o.name,a.style.cssText="border:0;width:100%;height:100%;display:block;background:#fff";let h=this,b={app:o,frame:a,listening:!1,lastSent:0,post:v=>a.contentWindow?.postMessage(Object.assign({__xdc:1},v),"*"),_deliver(v){if(!this.listening)return;let k=o.updates.length;for(let E of v)E.serial>this.lastSent&&(this.post({t:"update",update:h._public(E,k)}),this.lastSent=E.serial)},send:(v,k)=>h.send(o,v,k),reload:()=>{b.listening=!1,b.lastSent=0,a.srcdoc=Mt(o,r)},close:()=>{window.removeEventListener("message",S),a.remove(),h.sessions.delete(b)}},S=async v=>{if(v.source!==a.contentWindow||!v.data?.__xdc)return;let k=v.data,E=(y,O)=>b.post({t:"reply",id:k.id,data:y,error:O});try{if(k.t==="listen")b.listening=!0,b.lastSent=+k.serial||0,b._deliver(o.updates),b.post({t:"listen-done"});else if(k.t==="send")await h.send(o,k.update,r);else if(k.t==="all")E(o.updates.map(y=>h._public(y,o.updates.length)));else if(k.t==="ls")o.ls=k.data||{},await h._save(o);else if(k.t==="file"){let y=o.files[k.data];y?E({bytes:y.buffer.slice(y.byteOffset,y.byteOffset+y.byteLength),type:Ke(k.data)}):E(null,"not found: "+k.data)}else k.t==="chat"?(i?.(k.data),E(null)):k.t==="open"&&(p?p(k.url):/^https?:/i.test(k.url)&&window.open(k.url,"_blank","noopener"))}catch(y){k.id&&E(null,String(y.message||y))}};return window.addEventListener("message",S),t.appendChild(a),this.sessions.add(b),b.reload(),b}pack(e){return Nt(this.get(e).files)}async reset(e){e=this.get(e),e.updates=[],e.ls={},e.summary="",e.document="",await this._save(e)}};var ke="https://ollama.com",Ee="http://localhost:11434",ye=class{constructor({host:e=Ee,apiKey:t=""}={}){this.host=String(e).replace(/\/+$/,""),this.apiKey=t}get cloud(){return/^https:\/\/(www\.)?ollama\.com$/i.test(this.host)}get name(){return this.cloud?"Ollama Cloud":`Ollama at ${this.host}`}get headers(){let e={"Content-Type":"application/json"};return this.apiKey&&(e.Authorization="Bearer "+this.apiKey),e}async _err(e){let t=`HTTP ${e.status}`;try{t=(await e.json()).error||t}catch{}return e.status===401?t=this.cloud?"the Ollama API key was rejected (401). Create one at https://ollama.com/settings/keys":`${this.name} refused the request (401)`:e.status===404&&/model/i.test(t)?t+=this.cloud?"":" (pull it first: ollama pull <model>)":(e.status===402||e.status===429)&&(t+=" (usage limit)"),new Error(`${this.name}: ${t}`)}async _fetch(e,t={}){if(this.cloud&&!this.apiKey)throw new Error("no Ollama Cloud API key: createKit({ ollamaKey }) or kit.ollama.apiKey = \u2026");let r;try{r=await fetch(this.host+e,{...t,headers:{...this.headers,...t.headers||{}}})}catch(i){throw i?.name==="AbortError"?i:new Error(this.cloud?`could not reach Ollama Cloud (${i.message})`:`could not reach ${this.name}. Is "ollama serve" running? If it is, the browser blocked the request: start it with OLLAMA_ORIGINS set to this page's origin (or "*").`)}if(!r.ok)throw await this._err(r);return r}_post(e,t,r){return this._fetch(e,{method:"POST",body:JSON.stringify(t),signal:r})}async models(){return((await(await this._fetch("/api/tags")).json()).models||[]).map(t=>t.name||t.model).filter(Boolean)}async embed(e,{model:t="embeddinggemma",dimensions:r,truncate:i=!0,signal:p}={}){let o=!Array.isArray(e),a=(o?[e]:e).map(String);if(!a.length)return[];let h=[];for(let b=0;b<a.length;b+=64){let S=await this._post("/api/embed",{model:t,input:a.slice(b,b+64),truncate:i,...r?{dimensions:r}:{}},p);h.push(...(await S.json()).embeddings||[])}return o?h[0]:h}async webSearch(e,{maxResults:t=5,signal:r}={}){return(await this._post("/api/web_search",{query:String(e),max_results:Math.max(1,Math.min(10,+t||5))},r)).json()}async webFetch(e,{signal:t}={}){return(await this._post("/api/web_fetch",{url:String(e)},t)).json()}async*chat({signal:e,...t}){let i=(await this._post("/api/chat",{stream:!0,...t},e)).body.getReader(),p=new TextDecoder,o="";for(;;){let{value:a,done:h}=await i.read();if(h)break;o+=p.decode(a,{stream:!0});let b;for(;(b=o.indexOf(`
`))>=0;){let S=o.slice(0,b).trim();if(o=o.slice(b+1),!S)continue;let v=JSON.parse(S);if(v.error)throw new Error(`${this.name}: ${v.error}`);yield v}}if(o.trim()){let a=JSON.parse(o);if(a.error)throw new Error(`${this.name}: ${a.error}`);yield a}}},dt=class extends ye{constructor({apiKey:e="",host:t=ke}={}){super({host:t,apiKey:e})}};var Ge=class{constructor(e,t,{model:r,table:i="docs"}){this.db=e,this.embedFn=t,this.model=r,this.t=i.replace(/[^\w]/g,"_"),this.dims=null}async init(){let e=this.t,t=this.db;t.exec(`create table if not exists ${e}(id text primary key, text text not null, meta text, model text, dims integer)`);let r=t.get(`select dims, model from ${e} limit 1`);if(r&&(this.dims=r.dims,r.model&&r.model!==this.model))throw new Error(`${e} was embedded with ${r.model}, not ${this.model}: open it with { model: '${r.model}' }`);return this}_vecTable(e){if(this.dims&&this.dims!==e)throw new Error(`the embedding model returned ${e} dimensions; this store has ${this.dims}`);this.dims||(this.dims=e,this.db.exec(`create virtual table if not exists ${this.t}_vec using vec0(embedding float[${e}] distance_metric=cosine)`))}async add(e,{signal:t}={}){if(e=(Array.isArray(e)?e:[e]).map((o,a)=>typeof o=="string"?{text:o}:o).filter(o=>o&&String(o.text??"").trim()),!e.length)return[];let r=await this.embedFn(e.map(o=>String(o.text)),{model:this.model,signal:t});this._vecTable(r[0].length);let i=this.t,p=[];return this.db.transaction(o=>{for(let[a,h]of e.entries()){let b=String(h.id??(crypto.randomUUID?.()||Date.now()+"-"+a)),S=o.get(`select rowid from ${i} where id = ?`,[b]);S&&(o.run(`delete from ${i}_vec where rowid = ?`,[S.rowid]),o.run(`delete from ${i} where rowid = ?`,[S.rowid]));let{lastInsertRowid:v}=o.run(`insert into ${i}(id, text, meta, model, dims) values (?, ?, ?, ?, ?)`,[b,String(h.text),h.meta==null?null:JSON.stringify(h.meta),this.model,r[a].length]);o.run(`insert into ${i}_vec(rowid, embedding) values (?, ?)`,[v,JSON.stringify(r[a])]),p.push(b)}}),p}async search(e,{limit:t=5,hybrid:r=!1,signal:i}={}){if(!this.dims)return[];let[p]=await this.embedFn([String(e)],{model:this.model,signal:i}),o=this.t,a=r?Math.max(t*4,20):t,h=this.db.query(`select d.id, d.text, d.meta, v.distance from ${o}_vec v join ${o} d on d.rowid = v.rowid where v.embedding match ? and k = ? order by v.distance`,[JSON.stringify(p),a]).map(E=>({id:E.id,text:E.text,meta:E.meta?JSON.parse(E.meta):null,distance:E.distance,score:1-E.distance}));if(!r)return h.slice(0,t);let b=this.db.query(`select id, text, meta from ${o}`),S=new ae(b.map(E=>({id:E.id,text:E.text}))).search(e,{limit:a}),v=new Map,k=(E,y)=>E.forEach((O,A)=>{let j=v.get(O.id)||{...O,score:0};j.score+=y/(60+A+1),v.set(O.id,j)});return k(h,1),k(S.map(E=>{let y=h.find(A=>A.id===E.id),O=b.find(A=>A.id===E.id);return y||{id:E.id,text:O.text,meta:O.meta?JSON.parse(O.meta):null,distance:null}}),1),[...v.values()].sort((E,y)=>y.score-E.score).slice(0,t)}remove(e){let t=this.t;this.db.transaction(r=>{for(let i of[].concat(e)){let p=r.get(`select rowid from ${t} where id = ?`,[String(i)]);p&&(r.run(`delete from ${t}_vec where rowid = ?`,[p.rowid]),r.run(`delete from ${t} where rowid = ?`,[p.rowid]))}})}count(){return this.db.get(`select count(*) n from ${this.t}`).n}save(){return this.db.save()}close(){this.db.close()}};function It(_){return{async open(e=":memory:",{model:t="embeddinggemma",table:r="docs",ollama:i=null}={}){let p=await _.sqlite.open(e),o=i||_.local;return new Ge(p,(a,h)=>o.embed(a,h),{model:t,table:r}).init()}}}var Rt="http://localhost:11435",Ht=/^(clef|clef-flash|laya|jev|nimble|tev1|kev|winnow|largha|decider)(?=$|[:\-])/i,Gt={ollaya:"Ollaya",ollama:"Ollama",cloud:"Ollama Cloud"},Qt=(_,e)=>{let t=String(_[e]).trim(),r=t.length&&t.length<=100?t:`option_${e+1}`;return _.findIndex(i=>String(i).trim()===t)===e?r:`option_${e+1}`};function Yt(_,e){let t={},r={};for(let[p,o]of Object.entries(_.questions||{})){let a={...o};if((o.type||"choice")==="choice"&&Array.isArray(o.criteria)){let h=o.criteria.map((b,S)=>Qt(o.criteria,S));a.criteria=Object.fromEntries(h.map((b,S)=>[b,String(o.criteria[S])])),t[p]={keys:h,opts:o.criteria.map(String)}}r[p]=a}let i=String(_.model||"");return e&&(i=i.replace(/[:\-]cloud$/i,"")),{req:{..._,model:i,questions:r},maps:t}}function Vt(_,e){if(!_||typeof _!="object")return _;let t={..._};if("choice"in _&&e){let r=typeof _.choice=="number"?_.choice:e.keys.indexOf(String(_.choice));r>=0&&r<e.opts.length&&(t.choice=e.opts[r]),_.probabilities&&!Array.isArray(_.probabilities)&&(t.probabilities=Object.fromEntries(e.keys.map((i,p)=>[e.opts[p],+(_.probabilities[i]??0)])))}if(typeof _.noul=="number"){let r=Math.max(0,Math.min(1,_.noul));t.noul=r>=.5,t.p_true=r,t.probabilities={no:+(1-r).toFixed(6),yes:+r.toFixed(6)},t.confidence==null&&(t.confidence=+Math.max(r,1-r).toFixed(6))}return t}var Qe=class{constructor({server:e="ollaya",host:t="",apiKey:r="",model:i="",kit:p=null}={}){Object.assign(this,{server:e,host:t,apiKey:r,model:i,kit:p})}get name(){return Gt[this.server]||this.server}get base(){return this.server==="cloud"?ke:this.server==="ollama"?String(this.host||this.kit?.local?.host||Ee).replace(/\/+$/,""):String(this.host||Rt).replace(/\/+$/,"")}get key(){return this.server==="cloud"?this.apiKey||this.kit?.ollama?.apiKey||"":this.apiKey}get headers(){let e={"Content-Type":"application/json"};return this.key&&(e.Authorization="Bearer "+this.key),e}async _fetch(e,t={}){if(!["ollaya","ollama","cloud"].includes(this.server))throw new Error(`unknown decision server "${this.server}": use ollaya, ollama or cloud`);if(this.server==="cloud"&&!this.key)throw new Error("no Ollama Cloud API key for decisions: createKit({ ollamaKey }) or kit.decisions.apiKey = \u2026");try{return await fetch(this.base+e,{...t,headers:this.headers})}catch(r){if(r?.name==="AbortError")throw r;if(this.server==="cloud")throw new Error(`could not reach Ollama Cloud (${r.message})`);let i=this.server;throw new Error(`could not reach ${this.name} at ${this.base}. Is "${i} serve" running? If it is, the browser blocked the request: start it with ${i.toUpperCase()}_ORIGINS set to this page's origin (or "*").`)}}async _err(e,t){let r=`HTTP ${e.status}`;try{let i=await e.json();r=(i.error||r)+(i.detail?" \u2014 "+JSON.stringify(i.detail).slice(0,300):"")}catch{}return e.status===401?r+=this.server==="cloud"?" (the Ollama Cloud API key was rejected)":this.server==="ollaya"?" (the API key was rejected: OLLAYA_API_KEY)":" (the request was refused)":e.status===402?r+=" (cloud decision models need a paid Ollama plan or usage credits)":e.status===403?r+=` (${this.name} refused this page's origin: set ${this.server.toUpperCase()}_ORIGINS)`:e.status===404&&(r+=this.server==="cloud"?` (Ollama Cloud has no decision model "${t}"; try clef)`:this.server==="ollama"?" (decision models need Ollama 0.35 or newer, and the model pulled: ollama pull clef-flash)":` (pull the model: ollaya pull ${t||"<model>"})`),new Error(`${this.name} said ${e.status}: ${r}`)}async models(){let e=await this._fetch("/api/tags");if(!e.ok)throw await this._err(e);let t=((await e.json()).models||[]).map(i=>({name:i.name||i.model,caps:i.capabilities||i.details?.capabilities})).filter(i=>i.name);if(this.server==="ollaya")return t.map(i=>i.name);let r=t.filter(i=>Array.isArray(i.caps)&&i.caps.includes("decision")||Ht.test(i.name)).map(i=>i.name);return this.server==="cloud"&&(r=r.map(i=>i.replace(/[:\-]cloud$/i,"")),r.includes("clef")||r.unshift("clef")),[...new Set(r)]}async systemone(e,{signal:t}={}){let r=this.server!=="ollaya",i=e,p={};r&&({req:i,maps:p}=Yt(e,this.server==="cloud"));let o=await this._fetch("/v1/systemone",{method:"POST",body:JSON.stringify(i),signal:t});if(!o.ok)throw await this._err(o,i.model);let a=await o.json();return r?{...a,answers:Object.fromEntries(Object.entries(a.answers||{}).map(([h,b])=>[h,Vt(b,p[h])]))}:a}async decide({state:e="",question:t="",type:r="choice",options:i,model:p,signal:o}={}){if(p||=this.model||(this.server==="cloud"?"clef":""),!p)throw new Error("no decision model: kit.decisions.model = '\u2026' (list them with kit.decisions.models())");let a=r==="yesno"?"noul":r,h={type:a,instructions:String(t||"")},b=(Array.isArray(i)?i:typeof i=="string"?i.split(`
`):[]).map(String).map(y=>y.trim()).filter(Boolean);if(a==="choice"){if(b.length<2)throw new Error('type "choice" needs at least 2 options');h.criteria=b.slice(0,255)}else if(a==="score"){if(b.length<2)throw new Error('type "score" needs 2-10 level descriptions, lowest first');h.criteria=b.slice(0,10)}else if(a!=="noul")throw new Error("type must be choice, score or yesno");let S=await this.systemone({model:p,state:typeof e=="string"?e:JSON.stringify(e??""),questions:{q:h}},{signal:o}),v=S.answers?.q;if(!v)throw new Error(`${this.name} returned no answer`);let k=Array.isArray(v.probabilities)?Object.fromEntries(v.probabilities.map((y,O)=>[String(O),+y])):Object.fromEntries(Object.entries(v.probabilities||{}).map(([y,O])=>[y,+O])),E={type:r==="yesno"?"yesno":a,confidence:v.confidence!=null?+v.confidence:null,probabilities:k,model:S.model||p,server:this.server};return"choice"in v&&(E.choice=v.choice,E.result=v.choice),"score"in v&&(E.score=v.score,E.result=v.score,v.legend!=null&&(E.legend=v.legend)),"noul"in v&&(E.answer=v.noul,E.result=v.noul),E}};var Xt=3e4,ut=2e3,ue=(_,e=Xt)=>(_=String(_??""),_.length<=e?_:_.slice(0,e/2)+`

[\u2026 ${_.length-e} characters cut \u2026]

`+_.slice(-e/2)),Q={type:"string"},$e={type:"integer"},ne=(_,e=[])=>({type:"object",properties:_,required:e});function Dt(_){let e=_.vfs,t=null,r=()=>t||=_.shell.session({cwd:"/"}),i={read:{description:"Read a text file. Lines are numbered (cat -n style). Use offset (1-based line) and limit for long files.",parameters:ne({path:{...Q,description:"file path, e.g. /notes/todo.md"},offset:{...$e,description:"first line to read (1-based)"},limit:{...$e,description:`number of lines (default ${ut})`}},["path"]),run({path:o,offset:a=1,limit:h=ut}){let b=e.norm(o,r().cwd);if(e.isDir(b))return`${b} is a directory:
`+e.list(b).map(y=>e.isDir(e.norm(y,b))?y+"/":y).join(`
`);let S=e.read(b).split(`
`),v=Math.max(1,+a||1),k=Math.min(S.length,v-1+(+h||ut)),E=S.slice(v-1,k).map((y,O)=>`${String(v+O).padStart(6)}	${y.length>2e3?y.slice(0,2e3)+"\u2026":y}`).join(`
`);return ue(E+(k<S.length?`

[${S.length-k} more lines: read with offset ${k+1}]`:""))}},write:{description:"Create or overwrite a file with the given content (folders are created as needed).",parameters:ne({path:Q,content:Q},["path","content"]),run({path:o,content:a}){let h=e.norm(o,r().cwd),b=e.isFile(h);return e.write(h,String(a??"")),`${b?"Overwrote":"Created"} ${h} (${new TextEncoder().encode(String(a??"")).length} bytes)`}},edit:{description:"Edit a file by replacing exact text. oldText must match the file exactly (whitespace included) and occur once, unless replaceAll is true. Read the file first.",parameters:ne({path:Q,oldText:{...Q,description:"the exact text to replace"},newText:{...Q,description:"the replacement"},replaceAll:{type:"boolean"}},["path","oldText","newText"]),run({path:o,oldText:a,newText:h,replaceAll:b=!1}){let S=e.norm(o,r().cwd),v=e.read(S),k=String(a??""),E=String(h??"");if(!k)throw new Error("oldText is empty");let y=v.split(k).length-1;if(!y)throw new Error(`oldText was not found in ${S}. Read the file and copy the text exactly.`);if(y>1&&!b)throw new Error(`oldText occurs ${y} times in ${S}. Include more surrounding text so it is unique, or set replaceAll.`);let O=b?v.split(k).join(E):v.replace(k,()=>E);e.write(S,O);let A=v.slice(0,v.indexOf(k)).split(`
`).length;return`Edited ${S}: ${b?y:1} replacement${(b?y:1)>1?"s":""} at line ${A}`}},bash:{description:"Run a shell command line (BusyBox: ls, cat, grep, sed, awk, find, \u2026; pipes, redirects, && ||, $(\u2026)). Also node, python and sqlite3. The working directory persists between calls.",parameters:ne({command:Q,timeout:{...$e,description:"seconds (default 60)"}},["command"]),async run({command:o,timeout:a=60},{signal:h}={}){let b=await r().run(o,{timeoutMs:Math.min(600,+a||60)*1e3,signal:h}),S=b.output.trimEnd();return ue((S||"(no output)")+(b.code?`
[exit code ${b.code}]`:""))}},python:{description:"Run MicroPython code. The file system is shared with the other tools. print() output is returned.",parameters:ne({code:Q},["code"]),async run({code:o}){let a=await _.python.run(o,{cwd:r().cwd});return ue((a.output.trimEnd()||"(no output)")+(a.code?`
[exit code ${a.code}]`:""))}},javascript:{description:"Run JavaScript in a Node-style sandbox (require fs, path, node:sqlite; fetch). console.log output is returned, and the value of a top-level return.",parameters:ne({code:Q},["code"]),async run({code:o}){let a=await _.js.run(o,{cwd:r().cwd});return ue([a.output.trimEnd(),a.result!==void 0?`=> ${JSON.stringify(a.result)}`:"",a.code?`[exit code ${a.code}]`:""].filter(Boolean).join(`
`)||"(no output)")}},sqlite:{description:'Run SQL on a SQLite database file (created if missing; ":memory:" for a scratch one). sqlite-vec (vec0, vec_distance_cosine) and FTS5 are built in. Returns rows as JSON.',parameters:ne({database:{...Q,description:"file path, e.g. /data/app.db"},sql:Q,params:{type:"array",items:{}}},["database","sql"]),async run({database:o,sql:a,params:h}){let b=await _.sqlite.open(o===":memory:"?":memory:":e.norm(o,r().cwd));try{let S=b.exec(a,h??null);return ue(S.length?JSON.stringify(S.map(v=>v.values.map(k=>Object.fromEntries(v.columns.map((E,y)=>[E,k[y]])))).flat().slice(0,500)):`OK (${b.db.changes()} rows changed)`)}finally{b.close({save:o!==":memory:"})}}},search_files:{description:"Find files by meaning of words (BM25 ranking) under a folder. Returns paths, scores and a snippet.",parameters:ne({query:Q,path:{...Q,description:"folder (default /)"},limit:$e},["query"]),run({query:o,path:a="/",limit:h=10}){let b=We(e,o,{root:e.norm(a,r().cwd),limit:h});return b.length?JSON.stringify(b,null,1):"no matches"}},search:{description:"Search the web (Ollama web search). Returns titles, URLs and text snippets.",parameters:ne({query:Q,max_results:{...$e,description:"1-10 (default 5)"}},["query"]),async run({query:o,max_results:a=5},h){let b=await _.ollama.webSearch(o,{maxResults:a,signal:h?.signal});return ue(b.results?.length?b.results.map((S,v)=>`[${v+1}] ${S.title}
${S.url}
${String(S.content||"").trim()}`).join(`

`):"no results")}},fetch:{description:"Fetch a web page by URL (Ollama web fetch). Returns its title, text content and links.",parameters:ne({url:Q},["url"]),async run({url:o},a){let h=await _.ollama.webFetch(o,{signal:a?.signal});return ue(`# ${h.title||o}

${h.content||""}${h.links?.length?`

Links:
`+h.links.slice(0,50).join(`
`):""}`)}},decide:{description:"Ask a decision model to judge something with calibrated probabilities: pick one option (choice), rate on levels (score), or answer yes/no (yesno). Fast and cheap; use it for triage, routing and checks.",parameters:ne({state:{...Q,description:"what to judge: a message, log, diff, error or JSON"},question:{...Q,description:"what to decide, as an instruction"},type:{type:"string",enum:["choice","score","yesno"]},options:{type:"array",items:Q,description:"choice: the options; score: 2-10 levels, lowest first; yesno: none"}},["state","question"]),async run(o,a){let h=await _.decide({...o,signal:a?.signal}),b=Object.entries(h.probabilities).sort((v,k)=>k[1]-v[1]).map(([v,k])=>`${v} ${k.toFixed(3)}`).join(", ");return`${h.type==="score"?`score: ${h.score}${h.legend!=null?` (${typeof h.legend=="string"?h.legend:JSON.stringify(h.legend).slice(0,200)})`:""}`:h.type==="yesno"?`answer: ${h.answer?"yes":"no"}`:`choice: ${h.choice}`}${h.confidence!=null?` | confidence ${h.confidence.toFixed(3)}`:""}${b?`
probabilities: ${b}`:""}
model: ${h.model} (${_.decisions.name})`}}};i.web_search=i.search,i.web_fetch=i.fetch;let p=o=>(o||Object.keys(i).filter(a=>!a.startsWith("web_"))).filter(a=>i[a]);return{defs:i,names:()=>p(),openai:o=>p(o).map(a=>({type:"function",function:{name:a,description:i[a].description,parameters:i[a].parameters}})),anthropic:o=>p(o).map(a=>({name:a,description:i[a].description,input_schema:i[a].parameters})),async call(o,a={},h={}){let b=i[o];if(!b)return`Error: unknown tool "${o}". Tools: ${p().join(", ")}`;if(typeof a=="string")try{a=JSON.parse(a||"{}")}catch{return`Error: arguments for ${o} are not valid JSON`}try{return String(await b.run(a||{},h))}catch(S){return`Error: ${S?.message||S}`}},add(o,a){return i[o]=a,this},get shell(){return r()}}}var Bt=["read","write","edit","bash","search","fetch"],Zt=`You are a capable assistant working in a sandboxed browser workspace with a Unix-like file system.
Tools:
- read: read a file (numbered lines)
- write: create or overwrite a file
- edit: replace exact text in a file (read it first; oldText must match exactly)
- bash: run shell commands (ls, cat, grep, find, sed, awk, \u2026), plus node, python and sqlite3
- search: search the web
- fetch: fetch a web page
Work step by step. Prefer edit over rewriting whole files. Check your work (run it, read it back). Be concise in your final answer.`,Ye=class{constructor({kit:e,provider:t=null,ollama:r=null,model:i=null,system:p=Zt,tools:o=Bt,think:a=void 0,maxSteps:h=40,options:b=void 0,onEvent:S=null}){t||=e.ollama.apiKey?"cloud":"local",this.client=r||(t==="cloud"?e.ollama:e.local),i||=this.client.cloud?"gpt-oss:120b":"qwen3:8b",Object.assign(this,{kit:e,model:i,system:p,toolNames:o,think:a,maxSteps:h,options:b,onEvent:S}),this.messages=[],this.ctrl=null}emit(e){try{this.onEvent?.(e)}catch{}}reset(){this.messages=[]}abort(){this.ctrl?.abort()}async prompt(e,{images:t}={}){if(this.ctrl)throw new Error("the agent is already running");let i=(this.ctrl=new AbortController).signal,p=this.kit.tools.openai(this.toolNames);this.messages.push({role:"user",content:String(e),...t?.length?{images:t}:{}});try{for(let a=0;a<this.maxSteps;a++){let h={role:"assistant",content:""},b="",S=[];for await(let v of this.client.chat({model:this.model,messages:[{role:"system",content:this.system},...this.messages],tools:p,...this.think!==void 0?{think:this.think}:{},...this.options?{options:this.options}:{},signal:i})){let k=v.message||{};k.thinking&&(b+=k.thinking,this.emit({type:"thinking",delta:k.thinking})),k.content&&(h.content+=k.content,this.emit({type:"text",delta:k.content})),k.tool_calls?.length&&S.push(...k.tool_calls)}if(b&&(h.thinking=b),S.length&&(h.tool_calls=S),this.messages.push(h),this.emit({type:"turn_end",message:h}),!S.length)return this.emit({type:"done",text:h.content}),h.content;for(let v of S){let k=v.function?.name,E=v.function?.arguments??{};if(typeof E=="string")try{E=JSON.parse(E)}catch{E={}}this.emit({type:"tool_call",name:k,args:E});let y=await this.kit.tools.call(k,E,{signal:i});if(this.emit({type:"tool_result",name:k,result:y}),this.messages.push({role:"tool",tool_name:k,content:y}),i.aborted)throw new DOMException("stopped","AbortError")}}let o=`(stopped after ${this.maxSteps} steps)`;return this.emit({type:"done",text:o}),o}catch(o){if(o?.name==="AbortError")return this.emit({type:"done",text:"(stopped)"}),"(stopped)";throw this.emit({type:"error",error:o}),o}finally{this.ctrl=null}}};var es="0.1.0";async function nr({persist:_=!1,files:e=null,ollamaKey:t="",ollamaHost:r=Ee,decide:i={},assetsBase:p=null,cdn:o="https://cdn.jsdelivr.net/npm/",engine:a="auto",busybox:h=!0}={}){p&&yt(p);let b=new Ne({persist:_});!await b.load().catch(()=>!1)&&e&&b.import(e);let v=new Ie(b),k=new Ce(b),E=new ze({vfs:b,cdn:o}),y=new Be({vfs:b,sqlite:k,cdn:o}),O=new ye({host:ke,apiKey:t}),A=new ye({host:r}),j={version:es,vfs:b,busybox:v,sqlite:k,ml:E,python:y,ollama:O,local:A,bm25:{BM25:ae,search:Ot,tokenize:Pe,searchFiles:(n,l)=>We(b,n,l)}};j.js=new De({vfs:b,sqlite:k,ml:E,bridge:(n,l)=>s(n,l)});let I={node:j.js.command(),js:j.js.command(),python:y.command(),python3:y.command(),sqlite3:k.command()};j.shell=vt({vfs:b,busybox:v,engine:a,commands:I}),j.sh=j.shell.session(),j.run=(n,l)=>j.sh.run(n,l),j.webxdc=new He({vfs:b,persist:_}),j.embed=(n,l)=>A.embed(n,l),j.vectors=It(j),j.decisions=new Qe({...i,kit:j}),j.decide=n=>j.decisions.decide(n),j.tools=Dt(j),j.agent=(n={})=>new Ye({kit:j,...n});async function s(n,l){if(n==="tool")return j.tools.call(l.name,l.args||{});if(n==="list")return j.tools.names();if(n==="decide")return j.decide(l);if(n==="shell"){let u=await j.shell.session().run(l.command);return{stdout:u.stdout,stderr:u.stderr,code:u.code}}throw new Error(`kit.${n} is not available in Jade Agent Kit`)}return h&&v.load(),j}export{Ye as Agent,ae as BM25,Ie as BusyBox,Bt as DEFAULT_TOOLS,Ue as Database,Qe as Decisions,De as JsRunner,ze as ML,ke as OLLAMA_CLOUD,Ee as OLLAMA_LOCAL,Rt as OLLAYA_LOCAL,ye as Ollama,dt as OllamaCloud,Be as Python,Re as ShellSession,Ce as Sqlite,es as VERSION,Ne as VFS,Ge as VectorStore,He as Webxdc,Ot as bm25Search,nr as createKit,Dt as createTools,Pt as getAssetsBase,Lt as gpuShim,We as searchFiles,yt as setAssetsBase,Pe as tokenize};
//# sourceMappingURL=jade-agent-kit.js.map
