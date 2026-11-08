/*! Jade Agent Kit 0.1.0 | MIT | https://github.com/lucky-edgelord/jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */
var fe=new TextEncoder,H=new TextDecoder,qe=b=>new Promise(e=>setTimeout(e,b));function ie(b){let e="";for(let t=0;t<b.length;t+=32768)e+=String.fromCharCode.apply(null,b.subarray(t,t+32768));return btoa(e)}var Ve=b=>b instanceof Uint8Array?b:typeof b=="string"?fe.encode(b):b instanceof ArrayBuffer?new Uint8Array(b):ArrayBuffer.isView(b)?new Uint8Array(b.buffer,b.byteOffset,b.byteLength):fe.encode(String(b??"")),Xe=(b,e)=>{if(b===e)return!0;if(!b||!e||b.length!==e.length)return!1;for(let t=0;t<b.length;t++)if(b[t]!==e[t])return!1;return!0},me=b=>!!b&&b.length>=16&&String.fromCharCode(...b.subarray(0,15))==="SQLite format 3",ht=b=>!!b&&b.length>=8&&b[0]===0&&b[1]===97&&b[2]===115&&b[3]===109,Ze=new URL("../assets/",import.meta.url).href,Se=b=>new URL(b,Ze).href,pt=b=>{b&&(Ze=new URL(b.endsWith("/")?b:b+"/",location.href).href)},Nt=()=>Ze;async function ne(b,e=b){let t;try{t=await fetch(b)}catch(r){throw new Error(`could not download ${e} (${r.message||r})`)}if(!t.ok)throw new Error(`could not download ${e}: HTTP ${t.status}`);return new Uint8Array(await t.arrayBuffer())}async function _e(b,e=b){return H.decode(await ne(b,e))}var je=new Map;function Oe(b,e){return e&&globalThis[e]?Promise.resolve(globalThis[e]):(je.has(b)||je.set(b,new Promise((t,r)=>{let o=document.createElement("script");o.src=b,o.async=!0,o.crossOrigin="anonymous",o.onload=()=>t(e?globalThis[e]:!0),o.onerror=()=>{je.delete(b),r(new Error(`could not load ${b}`))},document.head.appendChild(o)})),je.get(b))}function Ae(b,e="kv"){let t=null,r=()=>t??=new Promise((g,a)=>{let f=indexedDB.open(b,1);f.onupgradeneeded=()=>f.result.createObjectStore(e),f.onsuccess=()=>g(f.result),f.onerror=()=>{t=null,a(f.error)}}),o=async(g,a)=>{let f=await r();return new Promise((y,x)=>{let S=f.transaction(e,g),E=a(S.objectStore(e));S.oncomplete=()=>y(E?.result),S.onerror=()=>x(S.error),S.onabort=()=>x(S.error)})};return{get:g=>o("readonly",a=>a.get(g)),set:(g,a)=>o("readwrite",f=>f.put(a,g)),del:g=>o("readwrite",a=>a.delete(g)),keys:()=>o("readonly",g=>g.getAllKeys()),close:async()=>{t&&(await t).close(),t=null}}}function Te(b,e,{timeoutMs:t=6e4,transfer:r=[],onMessage:o=null,signal:g=null,name:a="worker"}={}){let f=URL.createObjectURL(new Blob([b],{type:"text/javascript"}));return new Promise(y=>{let x;try{x=new Worker(f,{name:a})}catch(_){URL.revokeObjectURL(f),y({error:`could not start a ${a} worker (${_.message})`});return}let S=!1,E=_=>{S||(S=!0,clearTimeout(k),g?.removeEventListener?.("abort",q),x.terminate(),URL.revokeObjectURL(f),y(_))},k=setTimeout(()=>E({timeout:!0,error:`${a}: stopped after ${t/1e3}s timeout`}),t),q=()=>E({aborted:!0,error:`${a}: stopped`});g?.addEventListener?.("abort",q),x.onmessage=async _=>{o&&await o(_.data,x)||E(_.data)},x.onerror=_=>{_.preventDefault?.(),E({error:`${_.message||a+" error"}${_.lineno?` (line ${_.lineno})`:""}`,lineno:_.lineno})},x.postMessage(e,r)})}var Fe=class{constructor({persist:e=!1}={}){this.nodes=new Map([["/",{dir:!0,mtime:Date.now()}]]),this.listeners=new Set,this.store=e?Ae("jade-agent-kit:"+e):null,this._t=null,this._saving=null}async load(){if(!this.store)return!1;let e=await this.store.get("vfs");return Array.isArray(e)&&e.length?(this.nodes=new Map(e),this.nodes.has("/")||this.nodes.set("/",{dir:!0,mtime:Date.now()}),!0):!1}async flush(){clearTimeout(this._t),this._t=null,this.store&&await(this._saving=this.store.set("vfs",[...this.nodes.entries()]))}on(e){return this.listeners.add(e),()=>this.listeners.delete(e)}changed(e){for(let t of this.listeners)try{t(e)}catch{}this.store&&(clearTimeout(this._t),this._t=setTimeout(()=>this.flush().catch(()=>{}),150))}norm(e,t="/"){(e==null||e==="")&&(e="."),e=String(e),e==="~"?e="/":e.startsWith("~/")&&(e="/"+e.slice(2));let r=[];for(let o of(e.startsWith("/")?e:t+"/"+e).split("/"))!o||o==="."||(o===".."?r.pop():r.push(o));return"/"+r.join("/")}parent(e){if(e==="/")return"/";let t=e.lastIndexOf("/");return t<=0?"/":e.slice(0,t)}base(e){return e==="/"?"/":e.slice(e.lastIndexOf("/")+1)}exists(e){return this.nodes.has(this.norm(e))}isDir(e){return this.nodes.get(this.norm(e))?.dir===!0}isFile(e){let t=this.nodes.get(this.norm(e));return!!t&&!t.dir}stat(e){e=this.norm(e);let t=this.nodes.get(e);if(!t)throw new Error(`${e}: No such file or directory`);return{dir:!!t.dir,size:t.dir?4096:t.data.length,mtime:t.mtime}}mkdirp(e){if(e=this.norm(e),e!=="/"){if(this.isFile(e))throw new Error(`${e}: Not a directory`);this.isDir(e)||(this.mkdirp(this.parent(e)),this.nodes.set(e,{dir:!0,mtime:Date.now()}),this.changed(e))}}mkdir(e){if(e=this.norm(e),this.exists(e))throw new Error(`${e}: File exists`);if(!this.isDir(this.parent(e)))throw new Error(`${this.parent(e)}: No such file or directory`);this.nodes.set(e,{dir:!0,mtime:Date.now()}),this.changed(e)}readBytes(e){e=this.norm(e);let t=this.nodes.get(e);if(!t)throw new Error(`${e}: No such file or directory`);if(t.dir)throw new Error(`${e}: Is a directory`);return t.data}read(e){return H.decode(this.readBytes(e))}write(e,t,{mkdirs:r=!0}={}){if(e=this.norm(e),e==="/")throw new Error("/: Is a directory");let o=this.parent(e);if(r)this.mkdirp(o);else if(!this.isDir(o))throw new Error(`${o}: No such file or directory`);if(this.isDir(e))throw new Error(`${e}: Is a directory`);this.nodes.set(e,{data:Ve(t),mtime:Date.now()}),this.changed(e)}append(e,t){e=this.norm(e);let r=this.isFile(e)?this.readBytes(e):new Uint8Array,o=Ve(t),g=new Uint8Array(r.length+o.length);g.set(r),g.set(o,r.length),this.write(e,g)}touch(e){e=this.norm(e);let t=this.nodes.get(e);t?(t.mtime=Date.now(),this.changed(e)):this.write(e,"")}list(e="/"){if(e=this.norm(e),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(!this.isDir(e))throw new Error(`${e}: Not a directory`);let t=e==="/"?"/":e+"/",r=[];for(let o of this.nodes.keys())o!==e&&o.startsWith(t)&&!o.slice(t.length).includes("/")&&r.push(o.slice(t.length));return r.sort()}*walk(e="/"){e=this.norm(e);let t=e==="/"?"/":e+"/";for(let r of[...this.nodes.keys()].sort())(r===e||r.startsWith(t))&&(yield r)}rm(e,t=!1){if(e=this.norm(e),e==="/")throw new Error("refusing to remove '/'");if(!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(e)){if(this.list(e).length&&!t)throw new Error(`${e}: Directory not empty`);for(let r of[...this.nodes.keys()])r.startsWith(e+"/")&&this.nodes.delete(r)}this.nodes.delete(e),this.changed(e)}move(e,t){if(e=this.norm(e),t=this.norm(t),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(t)&&(t=(t==="/"?"":t)+"/"+this.base(e)),t===e)return;if(t.startsWith(e+"/"))throw new Error(`cannot move '${e}' into itself`);if(!this.isDir(this.parent(t)))throw new Error(`${this.parent(t)}: No such file or directory`);let r=[...this.nodes.entries()].filter(([o])=>o===e||o.startsWith(e+"/"));for(let[o]of r)this.nodes.delete(o);for(let[o,g]of r)this.nodes.set(t+o.slice(e.length),g);this.changed(t)}copy(e,t,r=!1){if(e=this.norm(e),t=this.norm(t),!this.exists(e))throw new Error(`${e}: No such file or directory`);if(this.isDir(t)&&(t=(t==="/"?"":t)+"/"+this.base(e)),this.isDir(e)){if(!r)throw new Error(`-r not specified; omitting directory '${e}'`);for(let o of[...this.walk(e)]){let g=this.nodes.get(o),a=t+o.slice(e.length);g.dir?this.mkdirp(a):this.write(a,g.data.slice())}}else this.write(t,this.readBytes(e).slice())}entries(){return[...this.nodes.entries()]}replace(e){this.nodes=new Map(e),this.nodes.has("/")||this.nodes.set("/",{dir:!0,mtime:Date.now()}),this.changed("/")}snapshot(){let e={};for(let[t,r]of this.nodes)r.dir||(e[t]=r.data);return e}import(e,t="/"){for(let[r,o]of Object.entries(e))this.write(this.norm(r,t),o)}applyChanges({writes:e={},deletes:t=[],mkdirs:r=[],rmdirs:o=[]},g){for(let a of t)this.isFile(a)&&this.rm(a);for(let a of o)a!=="/"&&this.isDir(a)&&this.rm(a,!0);for(let a of r)try{this.mkdirp(a)}catch(f){g?.(f)}for(let[a,f]of Object.entries(e))try{f===null?this.isFile(a)&&this.rm(a):this.write(a,f)}catch(y){g?.(new Error(`could not save ${a}: ${y.message}`))}}};var et=`
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
}`,mt=`
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
};`;var _t=16e6,Me=class{constructor(e){this.vfs=e,this.module=null,this.wasm=null,this.glue="",this.applets=new Set,this.host="",this.worker=null,this.seq=0,this.pending=new Map,this.mainFns=null,this._p=null,this.error=""}load(){return this._p||=(async()=>{try{let[r,o]=await Promise.all([ne(Se("busybox.wasm"),"BusyBox"),_e(Se("busybox.glue.js"),"BusyBox glue")]);this.wasm=r,this.glue=o,this.module=await WebAssembly.compile(r)}catch(r){return this.module=null,this.error=r.message,!1}let e=[],t=async()=>{let r=await this.run(["--list"],"",2e4);if(!r.ok)throw new Error(r.error);if(this.applets=new Set(H.decode(r.out).split(/\s+/).filter(Boolean)),!this.applets.size)throw new Error("busybox --list returned nothing")};try{return this.host="worker",await t(),!0}catch(r){e.push("worker: "+r.message)}try{return this.mainFns=this._mainHost(),this.host="main",await t(),!0}catch(r){return e.push("main thread: "+r.message),this.module=null,this.host="",this.error="BusyBox could not start ("+e.join("; ")+")",!1}})()}get ready(){return!!this.module&&this.applets.size>0}_classicGlue(){return this.glue.replace(/export\s+default\s+BusyBoxModule\s*;?\s*$/,"").replace(/import\.meta\.url/g,'"about:blank"')}_mainHost(){return new Function(this._classicGlue()+`
`+et+`
return { BusyBoxModule, __bbExec };`)()}_spawn(){let e=URL.createObjectURL(new Blob([this._classicGlue()+`
`+et+`
`+mt],{type:"text/javascript"})),t,r=new Promise((o,g)=>{try{t=new Worker(e,{name:"busybox"})}catch(f){return g(new Error(`new Worker() refused: ${f.message}`))}let a=setTimeout(()=>g(new Error("worker did not answer within 10s")),1e4);t.onmessage=f=>{f.data.type==="ready"?(clearTimeout(a),t.onmessage=y=>{let x=this.pending.get(y.data.id);x&&(this.pending.delete(y.data.id),x(y.data))},o()):f.data.type==="fail"&&(clearTimeout(a),g(new Error(f.data.error)))},t.onerror=f=>{clearTimeout(a),f.preventDefault?.(),g(new Error(f.message||"worker script was blocked or failed to load"))},t.postMessage({type:"init",wasm:this.wasm})});this.worker={w:()=>t,ready:r,url:e}}_entries(){let e=[];for(let[t,r]of this.vfs.nodes)r.dir?e.push([t,{dir:!0}]):r.data.length<=_t&&e.push([t,{data:r.data}]);return e}async run(e,t="",r=3e4,o="/"){if(this.host==="main")try{return await Promise.race([this.mainFns.__bbExec(this.mainFns.BusyBoxModule,this.module,{args:e,stdin:t,entries:this._entries(),cwd:o}),qe(r).then(()=>({ok:!1,timeout:!0,error:`timed out after ${r/1e3}s`}))])}catch(f){return{ok:!1,error:String(f?.message||f)}}this.worker||this._spawn();try{await this.worker.ready}catch(f){return this.worker=null,{ok:!1,error:f.message}}let g=++this.seq,a=this.worker.w();return new Promise(f=>{let y=setTimeout(()=>{this.pending.delete(g),a.terminate(),this.worker?.w()===a&&(this.worker=null);for(let[,x]of this.pending)x({ok:!1,error:"worker restarted"});this.pending.clear(),f({ok:!1,timeout:!0,error:`timed out after ${r/1e3}s`})},r);this.pending.set(g,x=>{clearTimeout(y),f(x)}),a.postMessage({id:g,args:e,stdin:t,entries:this._entries(),cwd:o})})}async exec(e,t=[],{stdin:r="",cwd:o="/",timeoutMs:g=3e4}={}){if(!this.ready&&!await this.load())return{stdout:"",stderr:`busybox: ${this.error}
`,code:127};let a=new Map(this.vfs.nodes),f=await this.run([e,...t],r,g,o);return f.ok?(this._apply(f.entries,a),{stdout:H.decode(f.out),stderr:H.decode(f.err),code:f.code}):{stdout:"",stderr:`busybox ${e}: ${f.error}
`,code:f.timeout?124:126}}_apply(e,t){let r=this.vfs,o=new Set;for(let[g,a]of e){if(o.add(g),g==="/")continue;let f=t.get(g),y=r.nodes.get(g);if(a.dir){y||r.mkdirp(g);continue}f&&!f.dir&&Xe(f.data,a.data)||y&&!y.dir&&Xe(y.data,a.data)||r.write(g,a.data)}for(let[g,a]of t)g==="/"||o.has(g)||r.nodes.get(g)!==a||!a.dir&&a.data.length>_t||r.exists(g)&&r.rm(g,!0)}close(){try{this.worker?.w()?.terminate()}catch{}this.worker?.url&&URL.revokeObjectURL(this.worker.url),this.worker=null}};function gt(b){let e=b.vfs,t=b.busybox;b.engine||="auto",b.commands||={};function r(s){let n=[],l=0,d=null,p=(i,u)=>{d??=[];let m=d[d.length-1];m&&m.t==="lit"&&m.q===u?m.v+=i:d.push({t:"lit",v:i,q:u})},h=()=>{d&&(n.push({t:"w",segs:d}),d=null)},c=i=>{let u=s[l+1];if(d??=[],u==="("){let w=0,v=l+1;for(;v<s.length;v++)if(s[v]==="(")w++;else if(s[v]===")"&&(w--,!w))break;if(v>=s.length)throw new Error("unterminated $(");d.push({t:"sub",v:s.slice(l+2,v),q:i}),l=v+1;return}if(u==="{"){let w=s.indexOf("}",l);if(w<0)throw new Error("bad substitution");d.push({t:"var",v:s.slice(l+2,w),q:i}),l=w+1;return}let m=/^([A-Za-z_]\w*|[?$#0-9])/.exec(s.slice(l+1));if(m){d.push({t:"var",v:m[1],q:i}),l+=1+m[1].length;return}p("$",i),l++};for(;l<s.length;){let i=s[l];if(i==="\\"){if(s[l+1]===`
`){l+=2;continue}p(s[l+1]??"",!0),l+=2;continue}if(i==="'"){let m=s.indexOf("'",l+1);if(m<0)throw new Error("unterminated quote");d??=[],p(s.slice(l+1,m),!0),l=m+1;continue}if(i==='"'){for(l++,d??=[],p("",!0);l<s.length&&s[l]!=='"';)s[l]==="\\"&&'"\\$`'.includes(s[l+1])?(p(s[l+1],!0),l+=2):s[l]==="$"?c(!0):(p(s[l],!0),l++);if(s[l]!=='"')throw new Error("unterminated quote");l++;continue}if(i==="$"){c(!1);continue}if(i===" "||i==="	"||i==="\r"){h(),l++;continue}if(i===`
`){h(),n.push({t:"op",v:";"}),l++;continue}if(i==="#"&&!d){for(;l<s.length&&s[l]!==`
`;)l++;continue}let u=/^(2>&1|&>|2>>|2>|>>|>&2|1>|>|<|&&|\|\||\||;|&)/.exec(s.slice(l));if(u&&!(d&&u[1].startsWith("2"))){h(),n.push({t:"op",v:u[1]}),l+=u[1].length;continue}p(i,!1),l++}return h(),n}function o(s){let n=[],l=[],d={words:[],redirs:[]},p=()=>{(d.words.length||d.redirs.length)&&l.push(d),d={words:[],redirs:[]}},h=c=>{if(p(),l.length)n.push({pipeline:l,op:c});else if(c==="&&"||c==="||")throw new Error(`syntax error near '${c}'`);l=[]};for(let c=0;c<s.length;c++){let i=s[c];if(i.t==="w"){d.words.push(i.segs);continue}switch(i.v){case"|":p();break;case"&&":case"||":case";":case"&":h(i.v==="&"?";":i.v);break;case"2>&1":case">&2":d.redirs.push({op:i.v});break;default:{let u=s[++c];if(!u||u.t!=="w")throw new Error(`syntax error near '${i.v}'`);d.redirs.push({op:i.v==="1>"?">":i.v,target:u.segs})}}}return h(";"),n}let g="";function a(s,{anchored:n=!0}={}){let l="";for(let d=0;d<s.length;d++){let p=s[d];if(p===g){l+=s[++d].replace(/[.*+?^${}()|[\]\\/]/g,"\\$&");continue}if(p==="*")l+="[^/]*";else if(p==="?")l+="[^/]";else if(p==="["){let h=s.indexOf("]",d+1);if(h>d){let c=s.slice(d+1,h);c[0]==="!"&&(c="^"+c.slice(1)),l+="["+c.replace(/\\/g,"\\\\")+"]",d=h}else l+="\\["}else l+=p.replace(/[.+^${}()|\\/\]]/g,"\\$&")}return new RegExp(n?"^"+l+"$":l)}class f{constructor({cwd:n="/",env:l={},onOutput:d=null}={}){this.cwd=n,this.env={HOME:"/",USER:"agent",SHELL:"/bin/sh",PATH:"/bin",...l},this.lastCode=0,this.onOutput=d,this.aborted=!1,this.timeoutMs=6e4}getVar(n){return n==="?"?String(this.lastCode):n==="$"?"1337":n==="#"?"0":n==="0"?"sh":n==="PWD"?this.cwd:this.env[n]??""}async expandWord(n){let l="",d=!1,p=h=>h.replace(/[*?[\]]/g,c=>g+c);for(let h of n)if(h.t==="lit")h.q?l+=p(h.v):(l+=h.v,/[*?[]/.test(h.v)&&(d=!0));else if(h.t==="var")l+=p(this.getVar(h.v));else if(h.t==="sub"){let c=await this.capture(h.v);l+=p(c.replace(/\n+$/,""))}if(d){let h=this.glob(l);if(h.length)return h}return[l.replaceAll(g,"")]}glob(n){let l=n.startsWith("/"),d=e.norm(n.replaceAll(g,""),this.cwd).replaceAll("",g),p=a(d),h=/(^|\/)\./.test(n.replaceAll(g,"")),c=[];for(let u of e.nodes.keys())u==="/"||!p.test(u)||!h&&/\/\.[^/]*$/.test(u)||c.push(u);if(c.sort(),l)return c;let i=this.cwd==="/"?"/":this.cwd+"/";return c.map(u=>u.startsWith(i)?u.slice(i.length):u)}async capture(n){let l=new f({cwd:this.cwd,env:{...this.env}});return l.aborted=this.aborted,l.timeoutMs=this.timeoutMs,(await l.run(n)).chunks.filter(p=>!p.err).map(p=>p.s).join("")}async run(n,{stdin:l=""}={}){let d=[],p=(i,u=!1)=>{i&&(d.push({s:i,err:u}),this.onOutput?.(i,u))},h;try{h=o(r(n))}catch(i){return p(`sh: ${i.message}
`,!0),this.lastCode=2,{chunks:d,code:2}}let c=";";for(let i of h){if(this.aborted){p(`^C
`,!0),this.lastCode=130;break}if(c==="&&"&&this.lastCode!==0||c==="||"&&this.lastCode===0){c=i.op;continue}try{this.lastCode=await this.runPipeline(i.pipeline,l,p)}catch(u){if(u&&u.__exit!==void 0){this.lastCode=u.__exit;break}p(`sh: ${u.message}
`,!0),this.lastCode=1}c=i.op}return{chunks:d,code:this.lastCode}}async runPipeline(n,l,d){let p=l,h=0;for(let c=0;c<n.length;c++){let i=n[c],u=c===n.length-1,m=[];for(let C of i.words)m.push(...await this.expandWord(C));let w=p,v=null,j=null,D=!1,O=!1;for(let C of i.redirs){if(C.op==="2>&1"){D=!0;continue}if(C.op===">&2"){O=!0;continue}let z=(await this.expandWord(C.target))[0],G=z==="/dev/null"?null:e.norm(z,this.cwd);C.op==="<"?z==="/dev/null"?w="":w=e.read(G):C.op===">"||C.op===">>"?v={p:G,append:C.op===">>",dn:z==="/dev/null"}:C.op==="2>"||C.op==="2>>"?j={p:G,append:C.op==="2>>",dn:z==="/dev/null"}:C.op==="&>"&&(v={p:G,append:!1,dn:z==="/dev/null"},D=!0)}v&&!v.dn&&(v.append?e.exists(v.p)||e.write(v.p,"",{mkdirs:!1}):e.write(v.p,"",{mkdirs:!1}));let M=await this.exec(m,w??""),R=M.out||"",P=M.err||"";D&&(R+=P,P=""),O&&(P+=R,R=""),j&&(j.dn||(j.append?e.append(j.p,P):e.write(j.p,P,{mkdirs:!1})),P=""),v&&(v.dn||e.append(v.p,R),R=""),P&&d(P,!0),u?d(R):p=R,h=M.code}return h}async exec(n,l){for(;n.length&&/^[A-Za-z_]\w*=/.test(n[0]);){let i=n.shift(),u=i.indexOf("=");this.env[i.slice(0,u)]=i.slice(u+1)}if(!n.length)return{out:"",err:"",code:0};let[d,...p]=n;d==="busybox"&&p.length&&!p[0].startsWith("-")&&(d=p.shift());let h={argv:p,stdin:l,sh:this,outS:"",errS:"",o(i){this.outS+=i},e(i){this.errS+=i},P:i=>e.norm(i,this.cwd),name:d},c=i=>({out:h.outS,err:h.errS,code:i??0});try{if(A[d])return c(await A[d](h));if(b.commands[d])return c(await b.commands[d](h));let i=b.engine;if(t.ready&&t.applets.has(d)&&i!=="js"&&!T.has(d)&&!b.commands[d]){let m=await this.execWasm(d,p,l);return m.code!==0&&i==="auto"&&$[d]&&/unrecognized|invalid option|unknown option|not implemented/i.test(m.err)?c(await $[d](h)):m}return i==="wasm"&&!T.has(d)?t.ready?{out:"",err:`sh: ${d}: applet not found in this BusyBox build
`,code:127}:{out:"",err:`sh: ${d}: BusyBox is not loaded${t.error?" ("+t.error+")":""}
`,code:127}:b.commands[d]?c(await b.commands[d](h)):$[d]?c(await $[d](h)):t.ready&&t.applets.has(d)?await this.execWasm(d,p,l):e.isFile(e.norm(d,this.cwd))&&/\.(sh)$/.test(d)?c(await A.sh({...h,argv:[d,...p]})):{out:"",err:`sh: ${d}: not found
`,code:127}}catch(i){if(i&&i.__exit!==void 0)throw i;return{out:h.outS,err:h.errS+`${d}: ${i.message}
`,code:1}}}async execWasm(n,l,d){let p=await t.exec(n,l,{stdin:d,cwd:this.cwd,timeoutMs:this.timeoutMs});return{out:p.stdout,err:p.stderr,code:p.code}}}function y(s,n=""){let l=new Set([...n.matchAll(/(\w):/g)].map(h=>h[1])),d={},p=[];for(let h=0;h<s.length;h++){let c=s[h];if(c==="--"){p.push(...s.slice(h+1));break}if(/^-\d+$/.test(c)&&l.has("n")){d.n=c.slice(1);continue}if(c.startsWith("--")&&c.length>2){let[i,u]=c.slice(2).split("=");d[i]=u??!0;continue}if(c.startsWith("-")&&c.length>1){for(let i=1;i<c.length;i++){let u=c[i];if(l.has(u)){d[u]=c.slice(i+1)||s[++h];break}d[u]=!0}continue}p.push(c)}return{f:d,rest:p}}function x(s,n){return n.length?n.map(l=>{if(l==="-")return{name:"-",text:s.stdin};try{return{name:l,text:e.read(s.P(l))}}catch(d){return s.e(`${s.name}: ${d.message}
`),null}}).filter(Boolean):[{name:"-",text:s.stdin}]}let S=s=>{if(!s)return[];let n=s.split(`
`);return n[n.length-1]===""&&n.pop(),n};function E(s){let n="";for(let l=0;l<s.length;l++){let d=s[l];if(d==="\\"&&l+1<s.length){let p=s[++l];"(){}|+?".includes(p)?n+=p:n+="\\"+p}else"(){}|+?".includes(d)?n+="\\"+d:n+=d}return n}let k=s=>s<1024?s+"":s<1048576?(s/1024).toFixed(1)+"K":(s/1048576).toFixed(1)+"M",q="Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" "),_=s=>{let n=new Date(s);return`${q[n.getMonth()]} ${String(n.getDate()).padStart(2)} ${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}`},T=new Set(["node","js","python","python3","sqlite3","help","sh","bash","xargs"]),A={cd(s){let n=s.P(s.argv[0]??"/");return e.isDir(n)?(s.sh.cwd=n,0):(s.e(`cd: ${s.argv[0]}: No such directory
`),1)},pwd(s){return s.o(s.sh.cwd+`
`),0},export(s){for(let n of s.argv){let l=n.indexOf("=");l>0&&(s.sh.env[n.slice(0,l)]=n.slice(l+1))}return 0},unset(s){for(let n of s.argv)delete s.sh.env[n];return 0},exit(s){throw{__exit:parseInt(s.argv[0]??"0")||0}},true:()=>0,false:()=>1,":":()=>0,async sh(s){let{f:n,rest:l}=y(s.argv,"c:"),d=new f({cwd:s.sh.cwd,env:{...s.sh.env}});d.timeoutMs=s.sh.timeoutMs;let p=n.c;p==null&&(l.length?p=e.read(s.P(l[0])):p=s.stdin);let h=await d.run(p);for(let c of h.chunks)c.err?s.e(c.s):s.o(c.s);return h.code},get bash(){return this.sh},source(s){return A.sh(s)},which(s){let n=0;for(let l of s.argv)A[l]||$[l]||b.commands[l]||t.applets.has(l)?s.o(`/bin/${l}
`):n=1;return n},type(s){for(let n of s.argv)s.o(A[n]?`${n} is a shell builtin
`:t.applets.has(n)&&b.engine!=="js"?`${n} is /bin/${n} (busybox.wasm)
`:$[n]?`${n} is /bin/${n} (js applet)
`:`${n}: not found
`);return 0},help(s){let n=new Set([...Object.keys(A),...Object.keys($),...Object.keys(b.commands),...t.applets]);return s.o(`Jade Agent Kit shell \u2014 ${t.ready?`BusyBox WASM (${t.applets.size} applets) + JS`:"JS applets"}
Supports: pipes |, redirects > >> < 2> 2>&1 &>, && || ;, $VAR, $(cmd), globs * ? [..]
No loops/if blocks: use node or python for scripting. Extra: ${Object.keys(b.commands).sort().join(", ")}, xargs.

`+[...n].sort().join("  ")+`
`),0},async xargs(s){let{f:n,rest:l}=y(s.argv,"n:I:"),d=s.stdin.split(/\s+/).filter(Boolean),p=l.length?l:["echo"],h=async i=>{let u=await s.sh.exec([...i],"");return s.o(u.out),s.e(u.err),u.code},c=0;if(n.I)for(let i of s.stdin.split(`
`).filter(Boolean))c=await h(p.map(u=>u.replaceAll(n.I,i)))||c;else{let i=parseInt(n.n)||d.length||1;for(let u=0;u<Math.max(d.length,1);u+=i)c=await h([...p,...d.slice(u,u+i)])||c}return c}},$={echo(s){let n=s.argv,l=!0,d=!1;for(;n.length&&/^-[neE]+$/.test(n[0]);)n[0].includes("n")&&(l=!1),n[0].includes("e")&&(d=!0),n=n.slice(1);let p=n.join(" ");return d&&(p=p.replace(/\\(n|t|\\|e|r)/g,(h,c)=>({n:`
`,t:"	","\\":"\\",e:"\x1B",r:"\r"})[c])),s.o(p+(l?`
`:"")),0},printf(s){let[n="",...l]=s.argv,d=0,p=n.replace(/\\n/g,`
`).replace(/\\t/g,"	").replace(/%(-?\d*)([sdif%])/g,(h,c,i)=>{if(i==="%")return"%";let u=l[d++]??"";i==="d"||i==="i"?u=String(parseInt(u)||0):i==="f"&&(u=String(parseFloat(u)||0));let m=parseInt(c);return isNaN(m)?u:m<0?u.padEnd(-m):u.padStart(m)});return s.o(p),0},cat(s){let{f:n,rest:l}=y(s.argv),d=1;for(let p of x(s,l))n.n?s.o(S(p.text).map(h=>`${String(d++).padStart(6)}	${h}`).join(`
`)+`
`):s.o(p.text);return s.errS?1:0},ls(s){let{f:n,rest:l}=y(s.argv),d=l.length?l:["."],p=0,h=d.length>1||n.R,c=(u,m)=>{let w=e.stat(u);return n.l?`${w.dir?"drwxr-xr-x":"-rw-r--r--"} 1 agent agent ${(n.h?k(w.size):String(w.size)).padStart(7)} ${_(w.mtime)} ${m}${w.dir&&n.F!==!1?"/":""}`:m+(w.dir?"/":"")},i=(u,m)=>{let w=e.list(u);!n.a&&!n.A&&(w=w.filter(v=>!v.startsWith("."))),n.t&&w.sort((v,j)=>e.stat(e.norm(j,u)).mtime-e.stat(e.norm(v,u)).mtime),n.r&&w.reverse(),h&&s.o(`${m}:
`),n.l&&s.o(`total ${w.length}
`);for(let v of w)s.o(c(e.norm(v,u),v)+`
`);if(n.R)for(let v of w){let j=e.norm(v,u);e.isDir(j)&&(s.o(`
`),i(j,m==="."?"./"+v:m.replace(/\/$/,"")+"/"+v))}};for(let u of d){let m=s.P(u);if(!e.exists(m)){s.e(`ls: ${u}: No such file or directory
`),p=1;continue}e.isDir(m)&&!n.d?i(m,u):s.o(c(m,u)+`
`),h&&!n.R&&s.o(`
`)}return p},mkdir(s){let{f:n,rest:l}=y(s.argv);for(let d of l)n.p?e.mkdirp(s.P(d)):e.mkdir(s.P(d));return 0},rmdir(s){for(let n of s.argv)e.rm(s.P(n),!1);return 0},rm(s){let{f:n,rest:l}=y(s.argv),d=0;for(let p of l){let h=s.P(p);if(!e.exists(h)){n.f||(s.e(`rm: ${p}: No such file or directory
`),d=1);continue}if(e.isDir(h)&&!(n.r||n.R)){s.e(`rm: ${p}: is a directory
`),d=1;continue}e.rm(h,!0)}return d},touch(s){for(let n of y(s.argv).rest){let l=s.P(n);e.isFile(l)?e.touch(l):e.write(l,"",{mkdirs:!1})}return 0},mv(s){let{rest:n}=y(s.argv),l=s.P(n.pop());if(n.length>1&&!e.isDir(l))throw new Error(`target '${l}' is not a directory`);for(let d of n)e.move(s.P(d),l);return 0},cp(s){let{f:n,rest:l}=y(s.argv),d=s.P(l.pop());for(let p of l)e.copy(s.P(p),d,n.r||n.R||n.a);return 0},head(s){let{f:n,rest:l}=y(s.argv,"n:c:");for(let d of x(s,l))if(n.c)s.o(d.text.slice(0,+n.c));else{let p=+(n.n??10),h=S(d.text);s.o((p<0,h.slice(0,p)).map(c=>c+`
`).join(""))}return 0},tail(s){let{f:n,rest:l}=y(s.argv,"n:c:");for(let d of x(s,l))if(n.c)s.o(d.text.slice(-n.c));else{let p=S(d.text),h=String(n.n??10);s.o((h.startsWith("+")?p.slice(+h.slice(1)-1):p.slice(-Math.abs(+h)||p.length)).map(c=>c+`
`).join(""))}return 0},wc(s){let{f:n,rest:l}=y(s.argv),d=!n.l&&!n.w&&!n.c&&!n.m,p=[0,0,0],h=x(s,l),c=(i,u)=>[n.l||d?i[0]:null,n.w||d?i[1]:null,n.c||n.m||d?i[2]:null].filter(m=>m!=null).map(m=>String(m).padStart(7)).join(" ")+(u!=="-"?" "+u:"")+`
`;for(let i of h){let u=[(i.text.match(/\n/g)||[]).length,(i.text.match(/\S+/g)||[]).length,fe.encode(i.text).length];p=p.map((m,w)=>m+u[w]),s.o(c(u,i.name))}return h.length>1&&s.o(c(p,"total")),0},grep(s){let{f:n,rest:l}=y(s.argv,"e:m:A:B:C:"),d=n.e??l.shift();if(d==null)return s.e(`usage: grep [-inrvlcEFwoq] PATTERN [FILE...]
`),2;let p=n.F?d.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"):n.E||n.P?d:E(d);n.w&&(p=`\\b(?:${p})\\b`),n.x&&(p=`^(?:${p})$`);let h=new RegExp(p,n.i?"i":""),c=new RegExp(p,n.i?"gi":"g"),i=l,u=n.r||n.R;u&&!i.length&&(i=["."]);let m=[];for(let O of i){let M=s.P(O);if(e.isDir(M)){if(!u){s.e(`grep: ${O}: Is a directory
`);continue}for(let R of e.walk(M))e.isFile(R)&&!/\/(node_modules|\.git)\//.test(R)&&m.push({name:O==="."?R.slice(s.sh.cwd==="/"?1:s.sh.cwd.length+1):O.replace(/\/$/,"")+R.slice(M.length),p:R})}else m.push({name:O,p:M})}let w=i.length?m.map(O=>{try{return{name:O.name,text:e.read(O.p)}}catch(M){return s.e(`grep: ${M.message}
`),null}}).filter(Boolean):[{name:"-",text:s.stdin}],v=(w.length>1||u)&&!n.h,j=!1,D=n.m?+n.m:1/0;for(let O of w){let M=0,R=S(O.text);for(let P=0;P<R.length&&M<D;P++){if(!(h.test(R[P])!==!!n.v))continue;if(M++,j=!0,n.q)return 0;if(n.l||n.c)continue;let z=(v?O.name+":":"")+(n.n?P+1+":":"");if(n.o)for(let G of R[P].matchAll(c))s.o(z+G[0]+`
`);else s.o(z+R[P]+`
`)}n.l&&M&&s.o(O.name+`
`),n.c&&s.o((v?O.name+":":"")+M+`
`)}return j?0:1},find(s){let n=[...s.argv],l=[];for(;n.length&&!n[0].startsWith("-")&&n[0]!=="("&&n[0]!=="!";)l.push(n.shift());l.length||l.push(".");let d=[],p=1/0,h=0,c=!1;for(;n.length;){let i=n.shift();if(i==="!"||i==="-not"){c=!0;continue}let u=m=>{let w=c;d.push(w?(v,j)=>!m(v,j):m),c=!1};if(i==="-name"){let m=a(n.shift());u((w,v)=>m.test(v))}else if(i==="-iname"){let m=new RegExp(a(n.shift()).source,"i");u((w,v)=>m.test(v))}else if(i==="-path"||i==="-wholename"){let m=n.shift(),w=new RegExp(a(m).source.replace(/\[\^\/\]\*/g,".*"));u((v,j,D)=>w.test(D))}else if(i==="-type"){let m=n.shift();u(w=>m==="d"?e.isDir(w):e.isFile(w))}else if(i==="-maxdepth")p=+n.shift();else if(i==="-mindepth")h=+n.shift();else if(i==="-size"){let m=n.shift(),w=/^([+-]?)(\d+)([ckM]?)$/.exec(m),v={c:1,k:1024,M:1048576,"":512}[w[3]],j=+w[2]*v;u(D=>{if(!e.isFile(D))return!1;let O=e.stat(D).size;return w[1]==="+"?O>j:w[1]==="-"?O<j:O===j})}else if(i==="-empty")u(m=>e.isDir(m)?e.list(m).length===0:e.stat(m).size===0);else if(!(i==="-print"||i==="-o"||i==="-a"))return s.e(`find: unsupported option ${i} 
`),1}for(let i of l){let u=s.P(i);if(!e.exists(u)){s.e(`find: ${i}: No such file or directory
`);continue}for(let m of e.walk(u)){let w=m===u?"":m.slice(u==="/"?1:u.length+1),v=w?w.split("/").length:0;if(v>p||v<h||/\/(node_modules|\.git)(\/|$)/.test(w)&&!i.includes("node_modules"))continue;let j=w?i==="/"?"/"+w:i.replace(/\/$/,"")+"/"+w:i;d.every(D=>D(m,e.base(m),j))&&s.o(j+`
`)}}return 0},tree(s){let{f:n,rest:l}=y(s.argv,"L:"),d=s.P(l[0]||"."),p=0,h=0,c=n.L?+n.L:1/0;s.o((l[0]||".")+`
`);let i=(u,m,w)=>{if(w>c)return;let v=e.list(u).filter(j=>n.a||!j.startsWith("."));v.forEach((j,D)=>{let O=e.norm(j,u),M=D===v.length-1,R=e.isDir(O);R?p++:h++,s.o(m+(M?"\u2514\u2500\u2500 ":"\u251C\u2500\u2500 ")+j+(R?"/":"")+`
`),R&&i(O,m+(M?"    ":"\u2502   "),w+1)})};return i(d,"",1),s.o(`
${p} directories, ${h} files
`),0},sort(s){let{f:n,rest:l}=y(s.argv,"k:t:"),d=x(s,l).flatMap(h=>S(h.text)),p=h=>n.k?(n.t?h.split(n.t):h.trim().split(/\s+/)).slice(parseInt(n.k)-1).join(" "):h;return d.sort((h,c)=>n.n?(parseFloat(p(h))||0)-(parseFloat(p(c))||0):n.f?p(h).toLowerCase().localeCompare(p(c).toLowerCase()):p(h)<p(c)?-1:p(h)>p(c)?1:0),n.r&&d.reverse(),n.u&&(d=d.filter((h,c)=>c===0||h!==d[c-1])),s.o(d.map(h=>h+`
`).join("")),0},uniq(s){let{f:n,rest:l}=y(s.argv),d=x(s,l).flatMap(h=>S(h.text)),p=[];for(let h of d)p.length&&p[p.length-1][0]===h?p[p.length-1][1]++:p.push([h,1]);for(let[h,c]of p)n.d&&c<2||n.u&&c>1||s.o((n.c?String(c).padStart(7)+" ":"")+h+`
`);return 0},cut(s){let{f:n,rest:l}=y(s.argv,"d:f:c:"),d=p=>p.split(",").flatMap(h=>{let[c,i]=h.split("-"),u=c?+c:1,m=h.includes("-")?i?+i:1e9:u,w=[];for(let v=u;v<=Math.min(m,1e3);v++)w.push(v);return w});for(let p of x(s,l).flatMap(h=>S(h.text)))if(n.c){let h=d(n.c);s.o(h.map(c=>p[c-1]??"").join("")+`
`)}else{let h=n.d??"	",c=p.split(h);if(c.length===1&&!p.includes(h)){s.o(p+`
`);continue}s.o(d(n.f||"1").filter(i=>i<=c.length).map(i=>c[i-1]).join(h)+`
`)}return 0},tr(s){let{f:n,rest:l}=y(s.argv),d=i=>{i=i.replace(/\[:upper:\]/g,"A-Z").replace(/\[:lower:\]/g,"a-z").replace(/\[:digit:\]/g,"0-9").replace(/\[:space:\]/g,` 	
`).replace(/\\n/g,`
`).replace(/\\t/g,"	");let u="";for(let m=0;m<i.length;m++)if(i[m+1]==="-"&&i[m+2]){for(let w=i.charCodeAt(m);w<=i.charCodeAt(m+2);w++)u+=String.fromCharCode(w);m+=2}else u+=i[m];return u},p=d(l[0]||""),h=d(l[1]||""),c="";for(let i of s.stdin){let u=p.indexOf(i);n.d?u<0&&(c+=i):u>=0&&h?c+=h[Math.min(u,h.length-1)]:c+=i}return n.s&&(c=c.replace(new RegExp(`([${(h||p).replace(/[\]\\^-]/g,"\\$&")}])\\1+`,"g"),"$1")),s.o(c),0},sed(s){let n=[],l=[],d=!1,p=!1,h=!1,c=s.argv;for(let O=0;O<c.length;O++){let M=c[O];M==="-n"?d=!0:M==="-i"||M.startsWith("-i")?p=!0:M==="-E"||M==="-r"?h=!0:M==="-e"?n.push(c[++O]):M.startsWith("-")&&M.length>1&&/^-[nEr]+$/.test(M)?(M.includes("n")&&(d=!0),/[Er]/.test(M)&&(h=!0)):!n.length&&!l.length&&!c.slice(0,O).includes("-e")?n.push(M):l.push(M)}let i=(O,M="")=>new RegExp(h?O:E(O),M),u=[],m=n.join(`
`),w=0,v=O=>{let M="";for(;w<m.length&&m[w]!==O;){if(m[w]==="\\"&&m[w+1]===O){M+=O,w+=2;continue}if(m[w]==="\\"&&m[w+1]==="n"&&O!=="n"){M+="\\n",w+=2;continue}M+=m[w++]}return w++,M},j=()=>{if(m[w]==="/")return w++,{re:i(v("/"))};if(m[w]==="$")return w++,{last:!0};let O=/^\d+/.exec(m.slice(w));return O?(w+=O[0].length,{n:+O[0]}):null};for(;w<m.length;){for(;/[\s;]/.test(m[w]||"");)w++;if(w>=m.length)break;let O=j(),M=null;for(O&&m[w]===","&&(w++,M=j());m[w]===" ";)w++;let R=!1;m[w]==="!"&&(R=!0,w++);let P=m[w++],C={a1:O,a2:M,bang:R,op:P,on:!1};if(P==="s"){let z=m[w++],G=v(z),W=v(z),Y="";for(;/[gipI0-9]/.test(m[w]||"");)Y+=m[w++];C.re=i(G,(Y.includes("g")?"g":"")+(/[iI]/.test(Y)?"i":"")),C.rep=W.replace(/\$/g,"$$$$").replace(/\\(\d)/g,"$$$1").replace(/(^|[^\\])&/g,"$1$$&").replace(/\\&/g,"&").replace(/\\n/g,`
`),C.p=Y.includes("p")}else if(P==="a"||P==="i"||P==="c"){for(;m[w]===" "||m[w]==="\\";)w++;let z="";for(;w<m.length&&m[w]!==`
`&&m[w]!==";";)z+=m[w++];C.text=z}else if(!"dpq=".includes(P))return s.e(`sed: unsupported command '${P}' (BusyBox WASM sed supports it)
`),1;u.push(C)}let D=O=>{let M=S(O),R="";for(let P=0;P<M.length;P++){let C=M[P],z=!1,G=!1,W=P===M.length-1,Y="",ye="";for(let I of u){let de=X=>X&&(X.n?X.n===P+1:X.last?W:X.re.test(C)),V;if(I.a1?I.a2?!I.on&&de(I.a1)?(I.on=!0,V=!0,I.a2.n&&I.a2.n<=P+1&&(I.on=!1)):I.on?(V=!0,de(I.a2)&&(I.on=!1)):V=!1:V=de(I.a1):V=!0,I.bang&&(V=!V),!!V)if(I.op==="s"){I.re.lastIndex=0;let X=C.replace(I.re,I.rep);(X!==C||I.re.test(C))&&(C=X,I.p&&(R+=C+`
`))}else if(I.op==="d"){z=!0;break}else if(I.op==="p")R+=C+`
`;else if(I.op==="q"){G=!0;break}else I.op==="="?R+=P+1+`
`:I.op==="a"?ye+=I.text+`
`:I.op==="i"?Y+=I.text+`
`:I.op==="c"&&(C=I.text)}if(R+=Y,!z&&!d&&(R+=C+`
`),R+=ye,G)break}return R};if(p){for(let O of l){let M=s.P(O);e.write(M,D(e.read(M)))}return 0}for(let O of x(s,l))s.o(D(O.text));return 0},awk(s){let{f:n,rest:l}=y(s.argv,"F:"),d=l.shift()||"",p=/^\s*(?:\/(.*)\/)?\s*(?:\{\s*print\s*([^}]*)\})?\s*$/.exec(d);if(!p)return s.e(`awk: only "[/re/] { print ... }" is supported by the JS fallback; BusyBox WASM provides full awk
`),2;let h=p[1]?new RegExp(p[1]):null,c=(p[2]??"$0").split(",").map(u=>u.trim()).filter(Boolean),i=0;for(let u of x(s,l).flatMap(m=>S(m.text))){if(i++,h&&!h.test(u))continue;let m=n.F?u.split(n.F==="\\t"?"	":n.F):u.trim().split(/\s+/);s.o((c.length?c:["$0"]).map(w=>w.split(/\s+/).map(v=>v==="$0"?u:/^\$\d+$/.test(v)?m[+v.slice(1)-1]??"":v==="NR"?i:v==="NF"?m.length:v==="$NF"?m[m.length-1]:v.replace(/^"|"$/g,"")).join("")).join(" ")+`
`)}return 0},tee(s){let{f:n,rest:l}=y(s.argv);for(let d of l)n.a?e.append(s.P(d),s.stdin):e.write(s.P(d),s.stdin);return s.o(s.stdin),0},seq(s){let n=s.argv.map(Number),[l,d,p]=n.length===1?[1,1,n[0]]:n.length===2?[n[0],1,n[1]]:n;for(let h=l;d>0?h<=p:h>=p;h+=d)s.o(h+`
`);return 0},async sleep(s){return await qe(Math.min(parseFloat(s.argv[0])*1e3||0,3e4)),0},date(s){let n=new Date;return s.o(s.argv[0]==="-I"||s.argv[0]==="--iso-8601"?n.toISOString().slice(0,10)+`
`:s.argv[0]==="+%s"?Math.floor(n/1e3)+`
`:n.toString()+`
`),0},env(s){for(let[n,l]of Object.entries(s.sh.env))s.o(`${n}=${l}
`);return 0},basename(s){let n=e.base(e.norm(s.argv[0]||""));return s.argv[1]&&n.endsWith(s.argv[1])&&(n=n.slice(0,-s.argv[1].length)),s.o(n+`
`),0},dirname(s){let n=s.argv[0]||".",l=n.replace(/\/$/,"").lastIndexOf("/");return s.o((l<0?".":l===0?"/":n.slice(0,l))+`
`),0},realpath(s){for(let n of s.argv)s.o(s.P(n)+`
`);return 0},stat(s){for(let n of s.argv){let l=e.stat(s.P(n));s.o(`  File: ${n}
  Size: ${l.size}	Type: ${l.dir?"directory":"regular file"}
Modify: ${new Date(l.mtime).toISOString()}
`)}return 0},du(s){let{f:n,rest:l}=y(s.argv);for(let d of l.length?l:["."]){let p=0;for(let h of e.walk(s.P(d)))e.isFile(h)&&(p+=e.stat(h).size);s.o(`${n.h?k(p):Math.ceil(p/1024)}	${d}
`)}return 0},base64(s){let{f:n,rest:l}=y(s.argv),d=x(s,l)[0]?.text??"";if(n.d)s.o(H.decode(Uint8Array.from(atob(d.replace(/\s/g,"")),p=>p.charCodeAt(0))));else{let p="";for(let h of fe.encode(d))p+=String.fromCharCode(h);s.o(btoa(p).replace(/.{76}/g,`$&
`)+`
`)}return 0},rev(s){for(let n of x(s,s.argv).flatMap(l=>S(l.text)))s.o([...n].reverse().join("")+`
`);return 0},nl(s){let n=1;for(let l of x(s,s.argv).flatMap(d=>S(d.text)))s.o(l.trim()?`${String(n++).padStart(6)}	${l}
`:`
`);return 0},test(s){let n=[...s.argv];if(s.name==="["&&n.pop()!=="]")return s.e(`[: missing ]
`),2;let l=!1;n[0]==="!"&&(l=!0,n.shift());let d,[p,h,c]=n;if(n.length===0)d=!1;else if(n.length===1)d=p!=="";else if(n.length===2){let i=s.P(h);d={"-f":e.isFile(i),"-d":e.isDir(i),"-e":e.exists(i),"-s":e.isFile(i)&&e.stat(i).size>0,"-z":h==="","-n":h!=="","-r":e.exists(i),"-w":e.exists(i),"-x":!1}[p]??!1}else d={"=":p===c,"==":p===c,"!=":p!==c,"-eq":+p==+c,"-ne":+p!=+c,"-lt":+p<+c,"-le":+p<=+c,"-gt":+p>+c,"-ge":+p>=+c}[h]??!1;return(l?!d:d)?0:1},get"["(){return this.test},yes(s){return s.o(((s.argv[0]??"y")+`
`).repeat(100)),0},whoami(s){return s.o((s.sh.env.USER||"agent")+`
`),0},uname(s){return s.o(s.argv.includes("-a")?`JadeAgentKit browser 1.0 ${navigator.platform||"web"} wasm32
`:`JadeAgentKit
`),0},async sha256sum(s){for(let n of x(s,s.argv)){let l=await crypto.subtle.digest("SHA-256",fe.encode(n.text));s.o([...new Uint8Array(l)].map(d=>d.toString(16).padStart(2,"0")).join("")+"  "+n.name+`
`)}return 0},diff(s){let{f:n,rest:l}=y(s.argv);if(l.length<2)return s.e(`usage: diff [-u] FILE1 FILE2
`),2;let d=S(e.read(s.P(l[0]))),p=S(e.read(s.P(l[1])));return d.join(`
`)===p.join(`
`)?0:d.length*p.length>4e6?(s.o(`Files ${l[0]} and ${l[1]} differ
`),1):(s.o(`--- ${l[0]}
+++ ${l[1]}
`+N(d,p)),1)}};function N(s,n,l=3){let d=s.length,p=n.length,h=Array.from({length:d+1},()=>new Uint32Array(p+1));for(let v=d-1;v>=0;v--)for(let j=p-1;j>=0;j--)h[v][j]=s[v]===n[j]?h[v+1][j+1]+1:Math.max(h[v+1][j],h[v][j+1]);let c=[],i=0,u=0;for(;i<d||u<p;)i<d&&u<p&&s[i]===n[u]?(c.push([" ",s[i],i,u]),i++,u++):i<d&&(u>=p||h[i+1][u]>=h[i][u+1])?(c.push(["-",s[i],i,u]),i++):(c.push(["+",n[u],i,u]),u++);let m="",w=0;for(;w<c.length;){if(c[w][0]===" "){w++;continue}let v=Math.max(0,w-l),j=w;for(;j<c.length;){if(c[j][0]!==" "){j++;continue}let R=0;for(;j+R<c.length&&c[j+R][0]===" ";)R++;if(R>l*2||j+R>=c.length){j=Math.min(c.length,j+l);break}j+=R}let D=c.slice(v,j),O=D[0][2]+1,M=D[0][3]+1;m+=`@@ -${O},${D.filter(R=>R[0]!=="+").length} +${M},${D.filter(R=>R[0]!=="-").length} @@
`+D.map(R=>R[0]+R[1]+`
`).join(""),w=j}return m}return{Shell:f,BUILTINS:A,APPLETS:$,opts:y,inputs:x,splitLines:S,tokenize:r,parse:o,globToRe:a}}var Le=class{constructor(e,{cwd:t="/",env:r={},timeoutMs:o=6e4}={}){this.core=e,this.sh=new e.Shell({cwd:t,env:r}),this.sh.timeoutMs=o}get cwd(){return this.sh.cwd}set cwd(e){this.sh.cwd=e}get env(){return this.sh.env}async run(e,{stdin:t="",timeoutMs:r,onOutput:o,signal:g}={}){let a=this.sh;r&&(a.timeoutMs=r),a.onOutput=o||null,a.aborted=!1;let f=()=>{a.aborted=!0};g?.addEventListener?.("abort",f);try{let y=await a.run(String(e??""),{stdin:t}),x=y.chunks.filter(E=>!E.err).map(E=>E.s).join(""),S=y.chunks.filter(E=>E.err).map(E=>E.s).join("");return{stdout:x,stderr:S,code:y.code,output:y.chunks.map(E=>E.s).join("")}}finally{g?.removeEventListener?.("abort",f),a.onOutput=null}}};function wt({vfs:b,busybox:e,engine:t="auto",commands:r={}}){let o={vfs:b,busybox:e,engine:t,commands:r},g=gt(o);return{core:g,commands:r,session:a=>new Le(g,a),get engine(){return o.engine},set engine(a){o.engine=a}}}var tt=`
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
`;var Rt=/\btf\s*\.\s*[A-Za-z_$]|@tensorflow\/tfjs/,Ne=class{constructor({vfs:e,sqlite:t=null,ml:r=null,bridge:o=null}){this.vfs=e,this.sqlite=t,this.ml=r,this.bridge=o}_changesSince(e){let t={},r=[],o=[],g=[];for(let[a,f]of this.vfs.nodes){let y=e.get(a);if(f.dir){y!=="d"&&o.push(a);continue}y!==f&&(me(f.data)?t[a]=f.data:f.data.length<2e6&&(t[a]=H.decode(f.data)))}for(let[a,f]of e)this.vfs.nodes.has(a)||(f==="d"?g:r).push(a);return Object.keys(t).length||r.length||o.length||g.length?{files:t,deleted:r,dirs:o,rmdirs:g}:null}_apply(e,t){if(!e)return;let r=Object.entries(e.writes||{});this.vfs.applyChanges({deletes:r.filter(([,o])=>o===null).map(([o])=>o),rmdirs:e.rmdirs||[],mkdirs:e.mkdirs||[],writes:Object.fromEntries(r.filter(([,o])=>o!==null))},t)}async run(e,{argv:t=["[eval]"],cwd:r="/",globals:o=null,timeoutMs:g=6e4,readOnly:a=!1,network:f=!0,env:y={},signal:x=null}={}){let S=this.vfs;e=String(e??"").replace(/^#!.*\n/,""),/^\s*(import|export)\s/m.test(e)&&(e=e.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,'const $1 = require("$2");').replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm,'const $1 = require("$2");').replace(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?/gm,(u,m,w)=>"const {"+m.replace(/\s+as\s+/g,": ")+'} = require("'+w+'");').replace(/^\s*export\s+(default\s+)?/gm,""));let E={},k=[],q={};for(let[u,m]of S.nodes)m.dir?k.push(u):me(m.data)?(q[u]=m.data,E[u]=m.data):m.data.length<2e6&&(E[u]=H.decode(m.data));let _=u=>u.test(e)||[...S.nodes].some(([m,w])=>!w.dir&&/\.[cm]?js$/.test(m)&&w.data.length<2e6&&u.test(H.decode(w.data))),T=null,A="",$="";if(this.sqlite&&_(/sqlite/i))try{T=await this.sqlite.module(),A=this.sqlite.glueSource}catch(u){return{stdout:"",stderr:`node: could not load SQLite (${u.message})
`,code:1}}if(this.ml&&f&&_(Rt))try{$=await this.ml.tfjsSource()}catch(u){return{stdout:"",stderr:`node: could not load TensorFlow.js (${u.message})
`,code:1}}let N=o?Object.keys(o).filter(u=>/^[$A-Za-z_][\w$]*$/.test(u)):[],s=N.length?`const { ${N.join(", ")} } = __globals;
`:"",n=tt+`
const kit = jade;

async function __main() {
${s}${e}
}
`+(A?`
`+A+`
`:"")+($?`
(function () { var exports, module, define;
${$}
}).call(self);
self.__tfInit = async () => { const tf = self.tf; try { tf.env().set('IS_NODE', false); } catch (e) {} const keep = { log: console.log, info: console.info, warn: console.warn, error: console.error }; console.log = console.info = console.warn = console.error = () => {}; try { let gl = false; try { gl = typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(2, 2).getContext('webgl2'); } catch (e) {} for (const b of ['webgpu', 'webgl']) { if (b === 'webgpu' && !(self.navigator && self.navigator.gpu)) continue; if (b === 'webgl' && !gl) continue; try { if (tf.findBackendFactory(b) && await tf.setBackend(b)) { await tf.ready(); const v = await tf.tensor([1, 2]).add(1).data(); if (v[0] === 2) return; } } catch (e) {} } for (const b of ['webgpu', 'webgl']) { try { tf.removeBackend(b); } catch (e) {} } await tf.setBackend('cpu'); await tf.ready(); } finally { Object.assign(console, keep); } };
`:""),l=tt.split(`
`).length+3+(s?1:0),d=URL.createObjectURL(new Blob([n],{type:"text/javascript"})),p=this.bridge,h=await new Promise(u=>{let m;try{m=new Worker(d,{name:"node"})}catch(O){u({out:[["e",`node: could not start a worker (${O.message})
`]],writes:{},code:1});return}let w=!1,v=O=>{w||(w=!0,clearTimeout(j),x?.removeEventListener?.("abort",D),m.terminate(),u(O))},j=setTimeout(()=>v({out:[["e",`node: killed after ${g/1e3}s timeout
`]],writes:{},code:124}),g),D=()=>v({out:[["e",`node: stopped
`]],writes:{},code:130});x?.addEventListener?.("abort",D),m.onmessage=async O=>{let M=O.data;if(M&&M.t==="jade"){let R;try{if(!p)throw new Error("kit calls are not available here");M.sync&&!a&&this._apply(M.sync);let P=new Map;for(let[G,W]of S.nodes)P.set(G,W.dir?"d":W);let C=await p(M.op,M.a||{}),z=C===void 0?null:C;try{z=JSON.parse(JSON.stringify(z))}catch{z=String(z)}R={t:"jret",id:M.id,ok:!0,value:z,sync:a?null:this._changesSince(P)}}catch(P){R={t:"jret",id:M.id,ok:!1,error:String(P?.message||P)}}w||m.postMessage(R);return}v(M)},m.onerror=O=>{O.preventDefault?.(),v({out:[["e",`${O.message||"SyntaxError"}${O.lineno?` (line ${Math.max(1,O.lineno-l)})`:""}
`]],writes:{},code:1})},m.postMessage({files:E,dirs:k,bins:q,sqliteModule:T,env:y,cwd:r,argv:t,globals:o?JSON.parse(JSON.stringify(o)):{},bridge:!!p,bridgeWhy:p?"":"no host bridge",noNet:!f})});URL.revokeObjectURL(d);let c=[];a||this._apply(h,u=>c.push(u.message+`
`));let i=h.out||[];return{stdout:i.filter(u=>u[0]==="o").map(u=>u[1]).join(""),stderr:i.filter(u=>u[0]==="e").map(u=>u[1]).join("")+c.join(""),output:i.map(u=>u[1]).join(""),code:h.code??1,result:h.ret}}command(){return async e=>{let t=e.argv,r,o,g=t.findIndex(f=>f==="-e"||f==="-p"||f==="--eval"||f==="--print");if(g>=0)r=/p/.test(t[g])?`console.log(${t[g+1]??""})`:t[g+1]??"",o=["[eval]",...t.slice(g+2)];else if(t.length&&t[0]!=="-"){let f=e.P(t[0]);if(!this.vfs.isFile(f))return e.e(`node: cannot find module '${t[0]}'
`),1;r=this.vfs.read(f),o=[f,...t.slice(1)]}else r=e.stdin,o=["[stdin]"];if(!String(r).trim())return e.e(`node: no script given. Use node file.js or node -e "code"
`),1;let a=await this.run(r,{argv:o,cwd:e.sh.cwd,timeoutMs:e.sh.timeoutMs,env:e.sh.env});return e.o(a.stdout),e.e(a.stderr),a.code}}};function yt(b,e){let t=JSON.stringify(e+"micropython.mjs"),r={},o=String(b).replace(/import\.meta\.url/g,t).replace(/import\.meta\b/g,`({ url: ${t} })`).replace(/\bexport\s*\{([^}]*)\}\s*;?/g,(f,y)=>{for(let x of y.split(",")){let[S,E]=x.trim().split(/\s+as\s+/);S&&(r[(E||S).trim()]=S.trim())}return";"}).replace(/\bexport\s+default\s+(?=[\w$])/g,"var __mpyDefault = ").replace(/\bexport\s+(?=(?:async\s+function|function\*?|const|let|var|class)\b)/g,""),g=r.loadMicroPython||"loadMicroPython";return`const __mpyFactory = async () => {
const navigator = (() => { const n = globalThis.navigator; if (!n) return n; const ua = String(n.userAgent || '').replace(/\\s*Version\\/[\\d.]+/, '');
    return new Proxy(n, { get: (t, k) => k === 'userAgent' ? ua : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }); })();
${o}
;return { loadMicroPython: typeof ${g} === 'function' ? ${g} : undefined };
};
`}var bt=`def __jv_compat():
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
`,st=`
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
};`;var xt=`
self.onmessage = (ev) => {
  const { module, argv, stdin, dbBytes, files } = ev.data;
  try {
    const S = __jvSqlite(module);
    const r = S.cli({ argv, stdin, dbBytes, readFile: p => files[p] ?? null });
    self.postMessage(r, r.dbBytes ? [r.dbBytes.buffer] : []);
  } catch (e) { self.postMessage({ out: '', err: 'sqlite3: ' + ((e && e.message) || e) + '\\n', code: 1 }); }
};`,St=`
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
}`,vt=`
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
`;var nt="1.27.0",Re=class{constructor({vfs:e,sqlite:t=null,cdn:r="https://cdn.jsdelivr.net/npm/"}){this.vfs=e,this.sqlite=t,this.base=`${r}@micropython/micropython-webassembly-pyscript@${nt}/`,this._p=null}load(){return this._p||=(async()=>{let[e,t]=await Promise.all([_e(this.base+"micropython.mjs","MicroPython"),ne(this.base+"micropython.wasm","MicroPython")]);if(!e||!ht(t))throw new Error(`MicroPython ${nt} downloaded incomplete (${t.length} bytes of wasm)`);return{factory:yt(e,this.base),wasm:"data:application/wasm;base64,"+ie(t)}})().catch(e=>{throw this._p=null,e})}async run(e,{argv:t=[""],cwd:r="/",stdin:o="",timeoutMs:g=6e4,heapMB:a=16,signal:f=null}={}){let y;try{y=await this.load()}catch($){return{stdout:"",stderr:`python: ${$.message}
`,output:`python: ${$.message}
`,code:1}}let x=this.vfs,S={},E=[];for(let[$,N]of x.nodes)N.dir?E.push($):N.data.length<4e6&&(S[$]=N.data);let k=null;if(this.sqlite&&(/sqlite/i.test(e)||[...x.nodes].some(([$,N])=>!N.dir&&$.endsWith(".py")&&N.data.length<2e6&&/sqlite/i.test(H.decode(N.data)))))try{k=await this.sqlite.module()}catch($){return{stdout:"",stderr:`python: could not load SQLite (${$.message})
`,code:1}}let q=k?y.factory+this.sqlite.glueSource+`
`+St+`
`+st:y.factory+st,_=await Te(q,{sqliteModule:k,sqliteShim:vt,compat:bt,wasm:y.wasm,files:S,dirs:E,cwd:r,argv:t,code:String(e),stdin:o,heap:a*1024*1024},{timeoutMs:g,signal:f,name:"python"});if(_.error)return{stdout:"",stderr:`python: ${_.error}
`,output:`python: ${_.error}
`,code:_.timeout?124:_.aborted?130:1};let T=[];x.applyChanges({deletes:_.deletes||[],mkdirs:_.mkdirs||[],writes:_.writes||{}},$=>T.push(`python: ${$.message}
`));let A=_.out||[];return{stdout:A.filter($=>$[0]==="o").map($=>$[1]).join(""),stderr:A.filter($=>$[0]==="e").map($=>$[1]).join("")+T.join(""),output:A.map($=>$[1]).join(""),code:_.code??1}}command(){return async e=>{let t=e.argv,r,o;if(t[0]==="--version"||t[0]==="-V")return e.o(`MicroPython ${nt} (WebAssembly)
`),0;if(t[0]==="-m"&&t[1]==="pip")return e.e(`pip is not available: MicroPython runs in the browser and has no package installer.
`),1;if(t[0]==="-c")r=t[1]??"",o=["-c",...t.slice(2)];else if(t.length&&t[0]!=="-"){let a=e.P(t[0]);if(!this.vfs.isFile(a))return e.e(`python: can't open file '${t[0]}': No such file
`),2;r=this.vfs.read(a),o=[a,...t.slice(1)]}else r=e.stdin,o=[""];if(!String(r).trim())return e.e(`python: no script given. Use python file.py or python -c "code"
`),2;let g=await this.run(r,{argv:o,cwd:e.sh.cwd,stdin:t[0]==="-c"||t.length&&t[0]!=="-"?e.stdin:"",timeoutMs:e.sh.timeoutMs});return e.o(g.stdout),e.e(g.stderr),g.code}}};function rt(b){let e=null,t={wasi_snapshot_preview1:{clock_time_get(h,c,i){return new DataView(e.buffer).setBigUint64(i,BigInt(Date.now())*1000000n,!0),0},fd_close(){return 8},fd_seek(){return 8},fd_write(h,c,i,u){let m=0,w=new DataView(e.buffer);for(let v=0;v<i;v++)m+=w.getUint32(c+v*8+4,!0);return w.setUint32(u,m,!0),0},fd_prestat_get(){return 8},fd_prestat_dir_name(){return 8},proc_exit(h){throw new Error("sqlite exited ("+h+")")},random_get(h,c){let i=new Uint8Array(e.buffer,h,c);for(let u=0;u<c;u+=65536)crypto.getRandomValues(i.subarray(u,Math.min(c,u+65536)));return 0}}},o=new WebAssembly.Instance(b,t).exports;e=o.memory,o._initialize(),o.sqlite3_initialize();let g=new TextEncoder,a=new TextDecoder,f=()=>new Uint8Array(e.buffer),y=()=>new DataView(e.buffer),x=h=>{if(!h)return null;let c=f(),i=h;for(;c[i];)i++;return a.decode(c.subarray(h,i))},S=h=>{let c=o.jv_malloc(Math.max(1,h));if(!c)throw new Error("out of memory");return c},E=(h,c)=>{let i=g.encode(String(h)),u=S(i.length+1);f().set(i,u),f()[u+i.length]=0;try{return c(u,i.length)}finally{o.jv_free(u)}},k=0,q=100,_=101,T=-1,A=x(o.sqlite3_libversion());class $ extends Error{constructor(c,i){super(c),this.code=i,this.name="SqliteError"}}class N{constructor(c,i,u){this.db=c,this.p=i,this.sql=u,this.readonly=!!o.sqlite3_stmt_readonly(i)}columns(){let c=o.sqlite3_column_count(this.p),i=[];for(let u=0;u<c;u++)i.push(x(o.sqlite3_column_name(this.p,u)));return i}bind(c){if(o.sqlite3_reset(this.p),o.sqlite3_clear_bindings(this.p),c==null)return this;let i=o.sqlite3_bind_parameter_count(this.p),u=(m,w)=>{let v;if(w==null)v=o.sqlite3_bind_null(this.p,m);else if(typeof w=="bigint")v=o.sqlite3_bind_int64(this.p,m,w);else if(typeof w=="boolean")v=o.sqlite3_bind_int64(this.p,m,w?1n:0n);else if(typeof w=="number")v=Number.isSafeInteger(w)?o.sqlite3_bind_int64(this.p,m,BigInt(w)):o.sqlite3_bind_double(this.p,m,w);else if(w instanceof Uint8Array||w instanceof ArrayBuffer){let j=w instanceof Uint8Array?w:new Uint8Array(w),D=S(j.length);f().set(j,D),v=o.sqlite3_bind_blob(this.p,m,D,j.length,T),o.jv_free(D)}else v=E(typeof w=="object"?JSON.stringify(w):w,(j,D)=>o.sqlite3_bind_text(this.p,m,j,D,T));if(v!==k)throw this.db.err(v)};if(Array.isArray(c)){if(c.length>i)throw new $(`${c.length} values for ${i} parameters`,25);c.forEach((m,w)=>u(w+1,m))}else if(typeof c=="object"&&!(c instanceof Uint8Array))for(let[m,w]of Object.entries(c)){let v=0;for(let j of/^[:@$?]/.test(m)?[""]:[":","@","$"])if(v=E(j+m,D=>o.sqlite3_bind_parameter_index(this.p,D)),v)break;if(!v)throw new $(`no parameter named ${m}`,25);u(v,w)}else u(1,c);return this}value(c){switch(o.sqlite3_column_type(this.p,c)){case 1:{let i=o.sqlite3_column_int64(this.p,c);return i>=BigInt(Number.MIN_SAFE_INTEGER)&&i<=BigInt(Number.MAX_SAFE_INTEGER)?Number(i):i}case 2:return o.sqlite3_column_double(this.p,c);case 3:{let i=o.sqlite3_column_text(this.p,c),u=o.sqlite3_column_bytes(this.p,c);return a.decode(f().subarray(i,i+u))}case 4:{let i=o.sqlite3_column_blob(this.p,c),u=o.sqlite3_column_bytes(this.p,c);return f().slice(i,i+u)}default:return null}}step(){let c=o.sqlite3_step(this.p);if(c===q)return!0;if(c===_)return this.readonly||(this.db.dirty=!0),!1;throw this.db.err(c)}row(){let c=o.sqlite3_data_count(this.p),i=[];for(let u=0;u<c;u++)i.push(this.value(u));return i}*iterate(c){for(this.bind(c);this.step();)yield this.row()}rows(c){return[...this.iterate(c)]}finalize(){this.p&&(o.sqlite3_finalize(this.p),this.p=0)}}class s{constructor(c){if(this.p=E(":memory:",i=>{let u=S(4);try{let m=o.sqlite3_open_v2(i,u,6,0),w=y().getUint32(u,!0);if(m!==k)throw new $("cannot open database",m);return w}finally{o.jv_free(u)}}),this.dirty=!1,c&&c.length){let i=c.length,u=o.sqlite3_malloc64(BigInt(i));if(f().set(c,u),E("main",w=>o.sqlite3_deserialize(this.p,w,u,BigInt(i),BigInt(i),3))!==k)throw new $("file is not a database",26);try{this.exec("SELECT count(*) FROM sqlite_schema")}catch{throw new $("file is not a database",26)}}}err(c){return new $(x(o.sqlite3_errmsg(this.p))||`SQLite error ${c}`,o.sqlite3_extended_errcode(this.p))}each(c,i){let u=g.encode(String(c)),m=S(u.length+1);f().set(u,m),f()[m+u.length]=0;let w=S(4),v=S(4),j=m,D=m+u.length;try{for(;j<D;){let O=o.sqlite3_prepare_v2(this.p,j,D-j,w,v);if(O!==k)throw this.err(O);let M=y().getUint32(w,!0),R=y().getUint32(v,!0);if(M){let P=new N(this,M,a.decode(f().subarray(j,R)).trim());try{i(P)}finally{P.finalize()}}if(R<=j)break;j=R}}finally{o.jv_free(w),o.jv_free(v),o.jv_free(m)}}exec(c,i){let u=[],m=!0;return this.each(c,w=>{let v={columns:w.columns(),values:w.rows(m?i:null)};m=!1,v.columns.length&&u.push(v)}),u}prepare(c){let i=S(4);try{let u=E(c,(w,v)=>o.sqlite3_prepare_v2(this.p,w,v,i,0));if(u!==k)throw this.err(u);let m=y().getUint32(i,!0);if(!m)throw new $("empty statement",21);return new N(this,m,c)}finally{o.jv_free(i)}}changes(){return o.sqlite3_changes(this.p)}totalChanges(){return o.sqlite3_total_changes(this.p)}lastInsertRowid(){let c=o.sqlite3_last_insert_rowid(this.p);return c<=BigInt(Number.MAX_SAFE_INTEGER)?Number(c):c}inTransaction(){return!o.sqlite3_get_autocommit(this.p)}export(){let c=S(8);try{let i=E("main",w=>o.sqlite3_serialize(this.p,w,c,0)),u=Number(y().getBigInt64(c,!0));if(!i)return new Uint8Array(0);let m=f().slice(i,i+u);return o.sqlite3_free(i),m}finally{o.jv_free(c)}}close(){this.p&&(o.sqlite3_close_v2(this.p),this.p=0)}}let n=h=>E(h,c=>o.sqlite3_complete(c))!==0;function l({argv:h,stdin:c,readFile:i,dbBytes:u}){let m="",w="",v=0,j="list",D=!1,O="|",M="",R=!1,P=!1,C=null,z=[],G=[],W=F=>{m+=F},Y=F=>{w+=F},ye={"-json":"json","-csv":"csv","-column":"column","-box":"box","-table":"table","-markdown":"markdown","-line":"line","-list":"list","-html":"html","-tabs":"tabs","-quote":"quote"};for(let F=0;F<h.length;F++){let L=h[F].replace(/^--/,"-");if(ye[L])j=ye[L],["csv","tabs"].includes(j)&&(O=j==="csv"?",":"	"),["column","box","table","markdown"].includes(j)&&(D=!0);else if(L==="-header"||L==="-headers")D=!0;else if(L==="-noheader")D=!1;else if(L==="-separator")O=h[++F]??"|";else if(L==="-nullvalue")M=h[++F]??"";else if(L==="-cmd")z.push(h[++F]??"");else if(L==="-bail")R=!0;else if(L==="-readonly")P=!0;else{if(L==="-version")return W(A+`
`),{out:m,err:w,code:0};if(L==="-help")return W(p),{out:m,err:w,code:0};if(L.startsWith("-")&&L.length>1)return Y(`sqlite3: unknown option: ${h[F]}
Use -help for a list of options.
`),{out:m,err:w,code:1};C===null?C=h[F]:G.push(h[F])}}let I;try{I=new s(C&&C!==":memory:"?u:null)}catch(F){return Y(`Error: unable to open database "${C}": ${F.message}
`),{out:m,err:w,code:1}}let de=!1,V=!1,X=F=>F===null?M:F instanceof Uint8Array?j==="json"||j==="quote"?"X'"+[...F].map(L=>L.toString(16).padStart(2,"0")).join("")+"'":a.decode(F):typeof F=="bigint"?F.toString():String(F),lt=F=>/[",\n\r]/.test(F)||F!==F.trim()?'"'+F.replace(/"/g,'""')+'"':F,ct=F=>F===null?"NULL":typeof F=="number"||typeof F=="bigint"?String(F):F instanceof Uint8Array?"X'"+[...F].map(L=>L.toString(16).padStart(2,"0")).join("")+"'":"'"+String(F).replace(/'/g,"''")+"'",Mt=(F,L)=>{if(F.length){if(j==="json"){if(!L.length)return;W("["+L.map(B=>"{"+F.map((U,Q)=>JSON.stringify(U)+":"+(B[Q]instanceof Uint8Array?JSON.stringify(X(B[Q])):typeof B[Q]=="bigint"?B[Q].toString():JSON.stringify(B[Q]))).join(",")+"}").join(`,
`)+`]
`);return}if(j==="line"){let B=Math.max(...F.map(U=>U.length));L.forEach((U,Q)=>{Q&&W(`
`),F.forEach((Z,se)=>W(Z.padStart(B)+" = "+X(U[se])+`
`))});return}if(j==="csv"){D&&W(F.map(lt).join(O)+`\r
`);for(let B of L)W(B.map(U=>U===null?"":lt(X(U))).join(O)+`\r
`);return}if(j==="quote"){D&&W(F.map(B=>"'"+B+"'").join(",")+`
`);for(let B of L)W(B.map(ct).join(",")+`
`);return}if(j==="html"){D&&W("<TR>"+F.map(B=>`<TH>${B}</TH>`).join("")+`
</TR>
`);for(let B of L)W("<TR>"+B.map(U=>`<TD>${X(U).replace(/&/g,"&amp;").replace(/</g,"&lt;")}</TD>`).join("")+`
</TR>
`);return}if(["column","box","table","markdown"].includes(j)){let B=L.map(J=>J.map(K=>X(K).replace(/\n/g," "))),U=F.map((J,K)=>Math.max(J.length,...B.map(oe=>(oe[K]||"").length))),Q=F.map((J,K)=>L.length&&L.every(oe=>oe[K]===null||typeof oe[K]=="number"||typeof oe[K]=="bigint")),Z=(J,K)=>Q[K]?J.padStart(U[K]):J.padEnd(U[K]);if(j==="column"){W(F.map((J,K)=>J.padEnd(U[K])).join("  ").trimEnd()+`
`+U.map(J=>"-".repeat(J)).join("  ")+`
`);for(let J of B)W(J.map(Z).join("  ").trimEnd()+`
`);return}if(j==="markdown"){W("| "+F.map((J,K)=>J.padEnd(U[K])).join(" | ")+` |
|`+U.map((J,K)=>Q[K]?"-".repeat(J+1)+":":":"+"-".repeat(J+1)).join("|")+`|
`);for(let J of B)W("| "+J.map(Z).join(" | ")+` |
`);return}let[se,he,Ee,Qe,Ge,$e,te,be,xe,ce,pe]=j==="box"?["\u250C","\u252C","\u2510","\u251C","\u253C","\u2524","\u2514","\u2534","\u2518","\u2500","\u2502"]:["+","+","+","+","+","+","+","+","+","-","|"],Ye=(J,K,oe)=>J+U.map(Lt=>ce.repeat(Lt+2)).join(K)+oe+`
`;W(Ye(se,he,Ee)+pe+F.map((J,K)=>" "+J.padEnd(U[K])+" ").join(pe)+pe+`
`+Ye(Qe,Ge,$e));for(let J of B)W(pe+J.map((K,oe)=>" "+Z(K,oe)+" ").join(pe)+pe+`
`);W(Ye(te,be,xe));return}D&&W(F.join(O)+`
`);for(let B of L)W(B.map(X).join(j==="tabs"?"	":O)+`
`)}},ke=F=>{try{I.each(F,L=>{if(P&&!L.readonly)throw new $("attempt to write a readonly database",8);let B=L.columns(),U=L.rows();Mt(B,U),de&&!L.readonly&&W(`changes: ${I.changes()}   total_changes: ${I.totalChanges()}
`)})}catch(L){Y(`${/syntax error|incomplete input|unrecognized token/.test(L.message)?"Parse error":"Runtime error"}: ${L.message}
`),v=1,R&&(V=!0)}},ft=F=>I.exec(`SELECT name FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ${F?"AND name LIKE ?":""} ORDER BY 1`,F?[F]:null)[0]?.values.map(L=>L[0])||[],Ke=F=>{let L=(F.match(/"[^"]*"|'[^']*'|\S+/g)||[]).map(U=>U.replace(/^["']|["']$/g,"")),B=L[0].slice(1);if(B==="quit"||B==="exit"){V=!0;return}if(B==="tables"){let U=ft(L[1]);U.length&&W(U.join("  ")+`
`);return}if(B==="schema"||B==="fullschema"){let U=I.exec(`SELECT sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${L[1]?"AND (name LIKE ?1 OR tbl_name LIKE ?1)":""} ORDER BY tbl_name, type DESC, name`,L[1]?[L[1]]:null)[0];for(let[Q]of U?.values||[])W(Q+`;
`);return}if(B==="indexes"||B==="indices"){let U=I.exec(`SELECT name FROM sqlite_schema WHERE type='index' ${L[1]?"AND tbl_name LIKE ?":""} ORDER BY 1`,L[1]?[L[1]]:null)[0];U&&W(U.values.map(Q=>Q[0]).join("  ")+`
`);return}if(B==="mode"){let U=L[1]||"list";if(!["list","csv","json","line","column","box","table","markdown","html","tabs","quote"].includes(U)){Y(`Error: mode should be one of: box column csv html json line list markdown quote table tabs
`),v=1;return}j=U,U==="csv"?O=",":U==="tabs"?O="	":U==="list"&&(O="|"),["column","box","table","markdown"].includes(U)&&(D=!0);return}if(B==="headers"||B==="header"){D=/^(on|1|yes|true)$/i.test(L[1]||"");return}if(B==="separator"){O=(L[1]??"|").replace(/\\t/g,"	").replace(/\\n/g,`
`);return}if(B==="nullvalue"){M=L[1]??"";return}if(B==="changes"){de=/^(on|1|yes|true)$/i.test(L[1]||"");return}if(B==="bail"){R=/^(on|1|yes|true)$/i.test(L[1]||"");return}if(B==="databases"){W(`main: ${C&&C!==":memory:"?C:'""'} r${P?"o":"w"}
`);return}if(B==="print"){W(L.slice(1).join(" ")+`
`);return}if(B==="read"){let U=i(L[1]);if(U==null){Y(`Error: cannot open "${L[1]}"
`),v=1;return}ut(U);return}if(B==="import"){let U=L.filter(te=>te.startsWith("--")),Q=L.slice(1).filter(te=>!te.startsWith("--")),[Z,se]=Q,he=i(Z);if(he==null){Y(`Error: cannot open "${Z}"
`),v=1;return}let Ee=d(he,j==="tabs"||U.includes("--tabs")?"	":",");if(!Ee.length)return;let Qe=+(U.find(te=>te.startsWith("--skip"))?.split("=")[1]||0),Ge=ft(se).includes(se),$e=Ee.slice(Qe);try{if(!Ge){let xe=$e.shift();I.exec(`CREATE TABLE "${se.replace(/"/g,'""')}"(${xe.map(ce=>'"'+String(ce).replace(/"/g,'""')+'" TEXT').join(", ")})`),I.dirty=!0}let te=I.exec("SELECT count(*) FROM pragma_table_info(?)",[se])[0].values[0][0],be=I.prepare(`INSERT INTO "${se.replace(/"/g,'""')}" VALUES(${Array(te).fill("?").join(",")})`);try{I.exec("BEGIN");for(let xe of $e){let ce=xe.slice(0,te);for(;ce.length<te;)ce.push(null);be.bind(ce),be.step()}I.exec("COMMIT")}finally{be.finalize()}I.dirty=!0}catch(te){try{I.exec("ROLLBACK")}catch{}Y(`Error: ${te.message}
`),v=1}return}if(B==="dump"){W(`PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
`);let U=I.exec(`SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ${L[1]?"AND tbl_name LIKE ?":""} ORDER BY type='table' DESC, rowid`,L[1]?[L[1]]:null)[0]?.values||[];for(let[Q,Z,se]of U)if(Q==="table"){W(se+`;
`);for(let he of I.exec(`SELECT * FROM "${Z.replace(/"/g,'""')}"`)[0]?.values||[])W(`INSERT INTO ${/^[A-Za-z_]\w*$/.test(Z)?Z:'"'+Z+'"'} VALUES(${he.map(ct).join(",")});
`)}for(let[Q,,Z]of U)Q!=="table"&&W(Z+`;
`);W(`COMMIT;
`);return}if(B==="help"){W(p);return}Y(`Error: unknown command or invalid arguments: "${B}". Enter ".help" for help
`),v=1},le="";function ut(F){for(let L of String(F).split(/\r?\n/)){if(V)return;if(!le.trim()&&/^\s*\./.test(L)){Ke(L.trim());continue}le+=L+`
`,n(le)&&(ke(le),le="")}}for(let F of z){if(V)break;/^\s*\./.test(F)?Ke(F.trim()):ke(F)}if(G.length)for(let F of G){if(V)break;/^\s*\./.test(F)?Ke(F.trim()):ke(F)}else if(c&&c.trim())ut(c),le.trim()&&!V&&ke(le);else if(!z.length)return Y(`sqlite3: no SQL given. Use: sqlite3 FILE "SQL" | sqlite3 FILE < script.sql | echo "SQL" | sqlite3 FILE
`),I.close(),{out:m,err:w,code:1};let dt={out:m,err:w,code:v};return I.dirty&&C&&C!==":memory:"&&!P&&(dt.dbBytes=I.export()),I.close(),dt}function d(h,c){let i=[],u=[],m="",w=!1;for(let v=0;v<h.length;v++){let j=h[v];if(w){j==='"'?h[v+1]==='"'?(m+='"',v++):w=!1:m+=j;continue}if(j==='"'&&m===""){w=!0;continue}if(j===c){u.push(m),m="";continue}if(j===`
`||j==="\r"){j==="\r"&&h[v+1]===`
`&&v++,u.push(m),m="",(u.length>1||u[0]!=="")&&i.push(u),u=[];continue}m+=j}return(m!==""||u.length)&&(u.push(m),i.push(u)),i}let p=`SQLite ${A} shell (batch mode)
usage: sqlite3 [OPTIONS] [FILE] ["SQL" ...]      (SQL can also come from stdin or < file.sql)
options: -json -csv -column -box -table -markdown -line -list -html -tabs -quote
         -header -noheader -separator SEP -nullvalue TEXT -cmd CMD -bail -readonly -version
dot commands: .tables [pat]  .schema [table]  .indexes [table]  .mode MODE  .headers on|off
              .separator SEP  .nullvalue TEXT  .import FILE TABLE [--skip=N]  .read FILE
              .dump [table]  .changes on|off  .bail on|off  .databases  .print TEXT  .quit
`;return{Database:s,Statement:N,SqliteError:$,version:A,complete:n,cli:l,parseCsv:d}}var ot="var __jvSqlite = "+rt.toString()+";";var Ie=class{constructor(e,t,r,{readOnly:o=!1}={}){this.vfs=t,this.path=r?t.norm(r):null,this.readOnly=o;let g=null;if(this.path&&t.isFile(this.path)&&(g=t.readBytes(this.path),g.length&&!me(g)))throw new Error(`file is not a database: ${this.path}`);this.db=new e.Database(g)}exec(e,t){return this.db.exec(e,t??null)}query(e,t){let r=this.db.prepare(e);try{let o=r.columns();return r.rows(t??null).map(g=>Object.fromEntries(o.map((a,f)=>[a,g[f]])))}finally{r.finalize()}}get(e,t){return this.query(e,t)[0]}run(e,t){let r=this.db.prepare(e);try{for(r.bind(t??null);r.step(););}finally{r.finalize()}return{changes:this.db.changes(),lastInsertRowid:this.db.lastInsertRowid()}}transaction(e){this.db.exec("BEGIN");try{let t=e(this);return this.db.exec("COMMIT"),t}catch(t){try{this.db.exec("ROLLBACK")}catch{}throw t}}prepare(e){return this.db.prepare(e)}export(){return this.db.export()}save(e=this.path){if(!e)throw new Error("this database has no path: pass one to save(path)");if(this.readOnly)throw new Error("the database is read-only");return this.vfs.write(e,this.db.export()),this.path=this.vfs.norm(e),this.path}close({save:e=!0}={}){this.db&&(e&&this.path&&!this.readOnly&&this.save(),this.db.close(),this.db=null)}},Be=class{constructor(e){this.vfs=e,this._mod=null,this._api=null,this.glueSource=ot}module(){return this._mod||=ne(Se("sqlite3.wasm"),"SQLite").then(e=>WebAssembly.compile(e)).catch(e=>{throw this._mod=null,e})}async api(){return this._api||=rt(await this.module())}async version(){return(await this.api()).version}async open(e=":memory:",t={}){return new Ie(await this.api(),this.vfs,e===":memory:"?null:e,t)}async cli(e,{stdin:t="",cwd:r="/",timeoutMs:o=6e4}={}){let g=this.vfs,a=null;for(let q=0;q<e.length;q++){let _=e[q];if(["-separator","--separator","-nullvalue","--nullvalue","-cmd","--cmd"].includes(_)){q++;continue}if(!_.startsWith("-")){a=_;break}}let f=a&&a!==":memory:"?g.norm(a,r):null;if(f&&g.isDir(f))return{stdout:"",stderr:`Error: unable to open database "${a}": it is a directory
`,code:1};let y=f&&g.isFile(f)?g.readBytes(f):null;if(y&&y.length&&!me(y))return{stdout:"",stderr:`Error: file is not a database: ${a}
`,code:1};let x={},S=[t,...e].join(`
`);for(let q of S.matchAll(/^\s*\.(?:import|read)\s+(.+)$/gm))for(let _ of q[1].match(/"[^"]*"|'[^']*'|\S+/g)||[]){let T=_.replace(/^["']|["']$/g,"");if(T.startsWith("--"))continue;let A=g.norm(T,r);g.isFile(A)&&(x[T]=g.read(A))}let E;try{E=await this.module()}catch(q){return{stdout:"",stderr:`sqlite3: could not load SQLite (${q.message})
`,code:1}}let k=await Te(ot+`
`+xt,{module:E,argv:e,stdin:t,dbBytes:y,files:x},{timeoutMs:o,name:"sqlite3"});return k.error?{stdout:"",stderr:`sqlite3: ${k.error}
`,code:k.timeout?124:1}:(k.dbBytes&&f&&g.write(f,new Uint8Array(k.dbBytes)),{stdout:k.out||"",stderr:k.err||"",code:k.code??1})}command(){return async e=>{let t=await this.cli(e.argv,{stdin:e.stdin,cwd:e.sh.cwd,timeoutMs:e.sh.timeoutMs});return e.o(t.stdout),e.e(t.stderr),t.code}}};var It=new Set("a an and are as at be but by for from had has have he her his i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who will with you your do does did can could would should not no yes".split(" "));function De(b,{stopWords:e=It,stem:t=!0}={}){let r=[];for(let o of String(b??"").toLowerCase().split(/[^\p{L}\p{N}]+/u))o.length<2||e?.has(o)||(t&&o.length>4&&/[a-z]$/.test(o)&&(o=o.replace(/(ing|ed|es|s)$/,"")),r.push(o));return r}var ge=class{constructor(e=[],{k1:t=1.5,b:r=.75,epsilon:o=.25,tokenize:g=De}={}){this.k1=t,this.b=r,this.epsilon=o,this.tok=g,this.docs=[],this.add(e)}add(e){for(let t of e){let r=this.docs.length;this.docs.push(typeof t=="string"?{id:r,text:t}:{...t,id:t.id??r})}return this._build(),this}_build(){let e=this.docs.map(a=>this.tok(a.text??""));this.N=e.length,this.tf=e.map(a=>{let f=new Map;for(let y of a)f.set(y,(f.get(y)||0)+1);return f}),this.len=e.map(a=>a.length),this.avgdl=this.N?this.len.reduce((a,f)=>a+f,0)/this.N:0;let t=new Map;for(let a of this.tf)for(let f of a.keys())t.set(f,(t.get(f)||0)+1);this.idf=new Map;let r=0,o=[];for(let[a,f]of t){let y=Math.log((this.N-f+.5)/(f+.5));this.idf.set(a,y),r+=y,y<0&&o.push(a)}let g=Math.max(this.epsilon*(t.size?r/t.size:0),.01);for(let a of o)this.idf.set(a,g)}scores(e){let t=Array.isArray(e)?e:this.tok(e),r=new Array(this.N).fill(0);for(let o of new Set(t)){let g=this.idf.get(o);if(g!==void 0)for(let a=0;a<this.N;a++){let f=this.tf[a].get(o);f&&(r[a]+=g*(f*(this.k1+1))/(f+this.k1*(1-this.b+this.b*this.len[a]/(this.avgdl||1))))}}return r}search(e,{limit:t=10,minScore:r=0}={}){return this.scores(e).map((g,a)=>({...this.docs[a],score:g})).filter(g=>g.score>r).sort((g,a)=>a.score-g.score).slice(0,t)}},kt=(b,e,t={})=>new ge(b,t).search(e,t);function Ue(b,e,{root:t="/",limit:r=10,maxBytes:o=1e6,include:g=/\.(md|txt|js|mjs|ts|py|json|html|css|csv|toml|ya?ml|xml|sh|sql)$/i}={}){let a=[];for(let y of b.walk(t)){if(!b.isFile(y)||!g.test(y))continue;let x=b.readBytes(y);x.length>o||a.push({id:y,path:y,text:y+`
`+new TextDecoder().decode(x)})}let f=De(e);return new ge(a).search(e,{limit:r}).map(({path:y,text:x,score:S})=>{let E=x.split(`
`),k=Math.max(0,E.findIndex((q,_)=>_>0&&f.some(T=>q.toLowerCase().includes(T))));return{path:y,score:+S.toFixed(4),line:k||null,snippet:E.slice(k||1,(k||1)+3).join(`
`).slice(0,300)}})}var we={tfjs:"4.22.0",onnxruntime:"1.31.1",litert:"2.5.3"};function jt(b=globalThis.navigator?.gpu){if(!b||b.__jak||typeof b.requestAdapter!="function")return;let e=b.requestAdapter.bind(b);b.requestAdapter=async t=>{let r=null;try{r=await e(t)}catch{}if(!r&&!(t&&t.featureLevel))try{r=await e({...t||{},featureLevel:"compatibility"})}catch{}if(r&&!r.__jak&&r.features?.has?.("core-features-and-limits")){let o=r.requestDevice.bind(r);r.requestDevice=(g={})=>o({...g,requiredFeatures:[...new Set([...g.requiredFeatures||[],"core-features-and-limits"])]}),r.__jak=!0}return r},b.__jak=!0}var Et={float32:Float32Array,int32:Int32Array,uint8:Uint8Array,int8:Int8Array,float64:Float64Array,int16:Int16Array,uint16:Uint16Array},it=(b,e=[])=>{if(Array.isArray(b))for(let t of b)it(t,e);else e.push(+b);return e},$t=b=>{let e=[];for(;Array.isArray(b);)e.push(b.length),b=b[0];return e},Pe=class{constructor({vfs:e,cdn:t="https://cdn.jsdelivr.net/npm/"}){this.vfs=e,this.cdn=t,this._tf=null,this._tfSrc=null,this._ort=null,this._lrt=null;try{jt()}catch{}}url(e,t,r){return`${this.cdn}${e}@${t}/${r}`}async bytes(e){if(e instanceof Uint8Array)return e;if(e instanceof ArrayBuffer)return new Uint8Array(e);let t=String(e||"");if(/^(https?:|blob:|data:)/i.test(t))return ne(t,t);if(!this.vfs.isFile(t))throw new Error(`${t} is not a file`);return this.vfs.readBytes(t)}tensorInput(e,t="float32"){if(e&&!Array.isArray(e)&&!ArrayBuffer.isView(e)&&typeof e=="object"){t=e.dtype||t;let r=e.data,o=ArrayBuffer.isView(r)?r:(Et[t]||Float32Array).from(it(r));return[o,e.shape||(Array.isArray(r)?$t(r):[o.length]),t]}return ArrayBuffer.isView(e)?[e,[e.length],t]:[(Et[t]||Float32Array).from(it(e)),$t(e),t]}async tf({backend:e}={}){return this._tf||=(async()=>{let t=await Oe(this.url("@tensorflow/tfjs",we.tfjs,"dist/tf.min.js"),"tf");try{await Oe(this.url("@tensorflow/tfjs-backend-webgpu",we.tfjs,"dist/tf-backend-webgpu.min.js"))}catch{}let r=async o=>{try{return!t.findBackendFactory(o)||!await t.setBackend(o)?!1:(await t.ready(),(await t.tensor([1,2]).add(1).data())[0]===2)}catch{return!1}};for(let o of e?[e]:["webgpu","webgl","cpu"])if(await r(o))break;return t})().catch(t=>{throw this._tf=null,t})}tfjsSource(){return this._tfSrc||=_e(this.url("@tensorflow/tfjs",we.tfjs,"dist/tf.min.js"),"TensorFlow.js").catch(e=>{throw this._tfSrc=null,e})}ort(){return this._ort||=(async()=>{let e=this.url("onnxruntime-web",we.onnxruntime,"dist/"),t=await Oe(e+"ort.webgpu.min.js","ort");if(!t?.InferenceSession)throw new Error("ONNX Runtime did not load");return t.env.wasm.numThreads=globalThis.crossOriginIsolated?Math.min(4,navigator.hardwareConcurrency||1):1,t.env.wasm.wasmPaths=e,t.env.logLevel="error",t})().catch(e=>{throw this._ort=null,e})}async onnx(e,{accelerator:t}={}){let r=this,o=await this.ort(),g=await this.bytes(e),a=t||(await this.webgpu()?"webgpu":"wasm"),f,y=q=>o.InferenceSession.create(g,{executionProviders:q==="webgpu"?["webgpu","wasm"]:["wasm"],graphOptimizationLevel:"all"}),x;try{x=await y(a)}catch(q){if(a==="wasm")throw q;f=`${a} failed (${q.message}); using wasm`,a="wasm",x=await y("wasm")}let S=q=>x[q+"Names"].map((_,T)=>{let A=x[q+"Metadata"],$=Array.isArray(A)?A[T]:A?.[_];return{name:_,shape:($?.shape||[]).map(N=>typeof N=="number"?N:-1),dtype:$?.type||"float32"}}),E=S("input"),k=S("output");return{accelerator:a,note:f,inputs:E,outputs:k,session:x,async run(q){let _=Array.isArray(q)?q:E.map(N=>q[N.name]??(E.length===1?q:void 0)),T={};E.forEach((N,s)=>{if(_[s]==null)throw new Error(`no data for input ${N.name}`);let[n,l,d]=r.tensorInput(_[s],_[s]?.dtype||N.dtype);if(!_[s]?.shape&&N.shape.length&&l.length!==N.shape.length&&N.shape.filter(p=>p<0).length===1){let p=N.shape.filter(h=>h>0).reduce((h,c)=>h*c,1);if(n.length%p)throw new Error(`input ${N.name} needs a multiple of ${p} values (shape ${JSON.stringify(N.shape)}), got ${n.length}`);l=N.shape.map(h=>h<0?n.length/p:h)}d==="int64"?n=BigInt64Array.from(n,p=>BigInt(Math.round(Number(p)))):d==="bool"&&(n=Uint8Array.from(n,p=>p?1:0)),T[N.name]=new o.Tensor(d,n,_[s]?.shape||l)});let A=await x.run(T),$={};for(let N of x.outputNames){let s=A[N],n=s.location&&s.location!=="cpu"?await s.getData():s.data;$[N]={data:n,shape:[...s.dims],dtype:s.type}}return $},release:()=>x.release()}}litert(){return this._lrt||=(async()=>{let e=await import(this.url("@litertjs/core",we.litert,"+esm"));return await e.loadLiteRt(this.url("@litertjs/core",we.litert,"wasm/")),e})().catch(e=>{throw this._lrt=null,e})}async tflite(e,{accelerator:t}={}){let r=this,o=await this.litert(),g=await this.bytes(e),a=!1;try{a=!!await o.isWebGPUSupported?.()}catch{}let f=t||(a?"webgpu":"wasm"),y,x;try{x=await o.loadAndCompile(g,{accelerator:f})}catch(_){if(f==="wasm")throw _;y=`${f} failed (${_.message}); using wasm`,f="wasm",x=await o.loadAndCompile(g,{accelerator:"wasm"})}let S=_=>[..._?.shape||_?.layout?.dimensions||_?.dimensions||[]],E=_=>[..._].map((T,A)=>({index:A,name:T.name,shape:S(T),dtype:T.dtype||T.type?.dtype})),k=E(x.getInputDetails()),q=E(x.getOutputDetails());return{accelerator:f,note:y,inputs:k,outputs:q,model:x,async run(_){let T=Array.isArray(_)&&k.length>1||Array.isArray(_)&&(Array.isArray(_[0])||ArrayBuffer.isView(_[0])||_[0]?.data)?_:[_],A=k.map((s,n)=>{let[l,d]=r.tensorInput(T[n],s.dtype||"float32");return new o.Tensor(l,T[n]?.shape||(s.shape.length?s.shape:d))}),$;try{$=await x.run(A)}finally{A.forEach(s=>{try{s.delete()}catch{}})}let N=[];for(let[s,n]of(Array.isArray($)?$:Object.values($)).entries()){let l=n;if(f!=="wasm")try{let d=await l.moveTo("wasm");d&&d!==l&&(l=d)}catch{}N.push({name:q[s]?.name,data:l.toTypedArray(),shape:[...l.type?.layout?.dimensions||q[s]?.shape||[]]});try{l.delete()}catch{}}return N},delete:()=>x.delete()}}async webgpu(){if(this._gpu==null)try{this._gpu=!!(navigator.gpu&&await navigator.gpu.requestAdapter())}catch{this._gpu=!1}return this._gpu}};async function Ce(b){let e=b instanceof Uint8Array?b:new Uint8Array(b),t=new DataView(e.buffer,e.byteOffset,e.byteLength),r=-1;for(let y=e.length-22;y>=Math.max(0,e.length-65557);y--)if(t.getUint32(y,!0)===101010256){r=y;break}if(r<0)throw new Error("not a zip file (.xdc files are zip archives)");let o=t.getUint16(r+10,!0),g=t.getUint32(r+16,!0),a={},f=new TextDecoder;for(let y=0;y<o;y++){if(t.getUint32(g,!0)!==33639248)throw new Error("broken zip directory");let x=t.getUint16(g+10,!0),S=t.getUint32(g+20,!0),E=t.getUint16(g+28,!0),k=t.getUint16(g+30,!0),q=t.getUint16(g+32,!0),_=t.getUint32(g+42,!0),T=f.decode(e.subarray(g+46,g+46+E));if(g+=46+E+k+q,T.endsWith("/"))continue;let A=_+30+t.getUint16(_+26,!0)+t.getUint16(_+28,!0),$=e.subarray(A,A+S),N;if(x===0)N=$.slice();else if(x===8)N=new Uint8Array(await new Response(new Blob([$]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());else throw new Error(`unsupported zip compression (${x}) for ${T}`);a[T.replace(/^\.?\//,"")]=N}return a}function qt(b){let e={};for(let t of String(b||"").split(/\r?\n/)){let r=/^\s*([\w.-]+)\s*=\s*(?:"((?:\\.|[^"])*)"|'([^']*)'|([\w.+-]+))\s*(?:#.*)?$/.exec(t);if(r)e[r[1]]=r[2]!=null?r[2].replace(/\\"/g,'"').replace(/\\\\/g,"\\"):r[3]!=null?r[3]:/^-?\d+(\.\d+)?$/.test(r[4])?+r[4]:r[4]==="true"?!0:r[4]==="false"?!1:r[4];else if(/^\s*\[/.test(t))break}return e}var Bt={html:"text/html",htm:"text/html",js:"text/javascript",mjs:"text/javascript",css:"text/css",json:"application/json",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",gif:"image/gif",webp:"image/webp",svg:"image/svg+xml",ico:"image/x-icon",mp3:"audio/mpeg",ogg:"audio/ogg",wav:"audio/wav",m4a:"audio/mp4",mp4:"video/mp4",webm:"video/webm",woff:"font/woff",woff2:"font/woff2",ttf:"font/ttf",otf:"font/otf",wasm:"application/wasm",txt:"text/plain",md:"text/markdown",xml:"application/xml",csv:"text/csv",toml:"text/plain"},We=b=>Bt[(b.split(".").pop()||"").toLowerCase()]||"application/octet-stream";function ae(b,e){let t=String(e||"").trim();if(!t||/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(t))return null;t=t.split("#")[0].split("?")[0];try{t=decodeURIComponent(t)}catch{}let r=t.startsWith("/")?[]:b.split("/").slice(0,-1);for(let o of t.split("/"))!o||o==="."||(o===".."?r.pop():r.push(o));return r.join("/")}function Ot(b,e){let t=b.files,r=_=>`data:${We(_)};base64,${ie(t[_])}`,o=new Map,g=(_,T)=>_.replace(/@import\s+(?:url\()?\s*(['"]?)([^'")\s]+)\1\s*\)?/g,(A,$,N)=>{let s=ae(T,N);return s&&t[s]?`@import url("data:text/css;base64,${ie(new TextEncoder().encode(g(H.decode(t[s]),s)))}")`:A}).replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g,(A,$,N)=>{let s=ae(T,N);return s&&t[s]?`url("${r(s)}")`:A}),a=(_,T=[])=>{if(o.has(_))return o.get(_);if(T.includes(_))return null;let A=f(H.decode(t[_]),_,[...T,_]),$=`data:text/javascript;base64,${ie(new TextEncoder().encode(A))}`;return o.set(_,$),$},f=(_,T,A=[])=>_.replace(/(\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*)(['"])([^'"\n]+)\2/g,($,N,s,n)=>{let l=ae(T,n);if(!l||!t[l])return $;if(/\.(js|mjs)$/i.test(l)){let d=a(l,A);return d?N+s+d+s:$}return N+s+r(l)+s}).replace(/\bimport\s*\(\s*(['"])([^'"\n]+)\1\s*\)/g,($,N,s)=>{let n=ae(T,s);if(!n||!t[n])return $;let l=/\.(js|mjs)$/i.test(n)?a(n,A):r(n);return l?`import(${N}${l}${N})`:$}).replace(/new\s+URL\(\s*(['"])([^'"\n]+)\1\s*,\s*import\.meta\.url\s*\)/g,($,N,s)=>{let n=ae(T,s);return n&&t[n]?`new URL(${N}${r(n)}${N})`:$}),y=new DOMParser().parseFromString(H.decode(t["index.html"]),"text/html");for(let _ of[...y.querySelectorAll("script")]){let T=(_.getAttribute("type")||"").toLowerCase()==="module",A=_.getAttribute("src");if(A){let $=ae("index.html",A);if(!$||!t[$]){/webxdc\.js$/.test(A)&&_.remove();continue}_.removeAttribute("src"),_.textContent=T?f(H.decode(t[$]),$,[$]):H.decode(t[$])}else T&&(_.textContent=f(_.textContent,"index.html"))}for(let _ of[...y.querySelectorAll("link[href]")]){let T=(_.getAttribute("rel")||"").toLowerCase(),A=ae("index.html",_.getAttribute("href"));if(!(!A||!t[A]))if(T.includes("stylesheet")){let $=y.createElement("style");$.textContent=g(H.decode(t[A]),A),_.replaceWith($)}else T==="modulepreload"?_.remove():_.setAttribute("href",r(A))}for(let _ of y.querySelectorAll("style"))_.textContent=g(_.textContent,"index.html");for(let _ of y.querySelectorAll("[style]"))_.setAttribute("style",g(_.getAttribute("style"),"index.html"));for(let _ of y.querySelectorAll("img[src],audio[src],video[src],source[src],input[src],embed[src],track[src],image[href],use[href]")){let T=_.hasAttribute("src")?"src":"href",A=ae("index.html",_.getAttribute(T));A&&t[A]&&_.setAttribute(T,r(A))}let x={},S=12*1048576;for(let[_,T]of Object.entries(t))_!=="index.html"&&(T.length>S||(S-=T.length,x[_]=r(_)));let E=y.createElement("script");E.textContent=Dt({app:b,assets:x,files:Object.keys(t),self:e});let k=y.createElement("meta");return k.setAttribute("http-equiv","Content-Security-Policy"),k.setAttribute("content","default-src 'self' data: blob: 'unsafe-inline' 'unsafe-eval'; connect-src data: blob:; img-src data: blob:; media-src data: blob:; font-src data: blob:; style-src 'unsafe-inline' data: blob:; script-src 'unsafe-inline' 'unsafe-eval' data: blob:"),(y.head||y.documentElement.insertBefore(y.createElement("head"),y.body)).prepend(k,E),`<!DOCTYPE html>
`+y.documentElement.outerHTML}function Dt({app:b,assets:e,files:t,self:r}){let o={addr:r.addr,name:r.name,ls:b.ls||{},assets:e,files:t,android:!!r.android};return`(() => {
const CFG = ${JSON.stringify(o).replace(/<\//g,"<\\/")};
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
})();`}function At(b){let e=new TextEncoder,t=[],r=[],o=0,g=(()=>{let k=new Uint32Array(256);for(let q=0;q<256;q++){let _=q;for(let T=0;T<8;T++)_=_&1?3988292384^_>>>1:_>>>1;k[q]=_>>>0}return k})(),a=k=>{let q=4294967295;for(let _=0;_<k.length;_++)q=g[(q^k[_])&255]^q>>>8;return(q^4294967295)>>>0};for(let[k,q]of Object.entries(b)){let _=e.encode(k),T=a(q),A=new DataView(new ArrayBuffer(30));A.setUint32(0,67324752,!0),A.setUint16(4,20,!0),A.setUint16(6,2048,!0),A.setUint32(14,T,!0),A.setUint32(18,q.length,!0),A.setUint32(22,q.length,!0),A.setUint16(26,_.length,!0),t.push(new Uint8Array(A.buffer),_,q);let $=new DataView(new ArrayBuffer(46));$.setUint32(0,33639248,!0),$.setUint16(4,20,!0),$.setUint16(6,20,!0),$.setUint16(8,2048,!0),$.setUint32(16,T,!0),$.setUint32(20,q.length,!0),$.setUint32(24,q.length,!0),$.setUint16(28,_.length,!0),$.setUint32(42,o,!0),r.push(new Uint8Array($.buffer),_),o+=30+_.length+q.length}let f=r.reduce((k,q)=>k+q.length,0),y=new DataView(new ArrayBuffer(22));y.setUint32(0,101010256,!0),y.setUint16(8,Object.keys(b).length,!0),y.setUint16(10,Object.keys(b).length,!0),y.setUint32(12,f,!0),y.setUint32(16,o,!0);let x=[...t,...r,new Uint8Array(y.buffer)],S=new Uint8Array(x.reduce((k,q)=>k+q.length,0)),E=0;for(let k of x)S.set(k,E),E+=k.length;return S}var ze=class{constructor({vfs:e,persist:t=!1}){this.vfs=e,this.store=t?Ae("jade-agent-kit-xdc:"+t):null,this.apps=new Map,this.sessions=new Set,this.listeners=new Set,this._q=new Map}async load(e,{name:t="App"}={}){let r;if(e instanceof Uint8Array||e instanceof ArrayBuffer)r=await Ce(e);else if(e&&typeof e=="object")r=Object.fromEntries(Object.entries(e).map(([S,E])=>[S,typeof E=="string"?new TextEncoder().encode(E):E]));else{let S=String(e);if(/^(https?:|blob:|data:)/i.test(S))r=await Ce(await ne(S));else if(this.vfs.isDir(S)){let E=this.vfs.norm(S).replace(/\/$/,"")+"/";r={};for(let[k,q]of this.vfs.nodes)!q.dir&&k.startsWith(E)&&(r[k.slice(E.length)]=q.data);t=this.vfs.base(this.vfs.norm(S))}else if(this.vfs.isFile(S))r=await Ce(this.vfs.readBytes(S)),t=this.vfs.base(this.vfs.norm(S)).replace(/\.xdc$/i,"");else throw new Error(`${S}: not a file, folder or URL`)}if(!r["index.html"]){let S=new Set(Object.keys(r).map(E=>E.split("/")[0]));if(S.size===1){let E=[...S][0]+"/";r[E+"index.html"]&&(r=Object.fromEntries(Object.entries(r).map(([k,q])=>[k.slice(E.length),q])))}}if(!r["index.html"])throw new Error("this is not a webxdc app: index.html is missing");let o=r["manifest.toml"]?qt(H.decode(r["manifest.toml"])):{},g=String(o.name||"").trim();if(!g){let S=/<title>([^<]{1,60})<\/title>/i.exec(H.decode(r["index.html"]));g=S&&S[1].trim()||t}let a=["icon.png","icon.jpg","icon.jpeg","icon.svg","icon.webp"].find(S=>r[S]),f="xdc-"+g.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40),y=this.store?await this.store.get(f):null,x={id:f,name:g,manifest:o,files:r,icon:a?`data:${We(a)};base64,${ie(r[a])}`:null,size:Object.values(r).reduce((S,E)=>S+E.length,0),updates:y?.updates||[],ls:y?.ls||{},summary:y?.summary||"",document:y?.document||""};return this.apps.set(f,x),x}get(e){if(typeof e=="object")return e;let t=String(e).toLowerCase();return this.apps.get(e)||[...this.apps.values()].find(r=>r.name.toLowerCase()===t)||null}list(){return[...this.apps.values()].map(({id:e,name:t,size:r,summary:o,document:g,updates:a})=>({id:e,name:t,size:r,summary:o,document:g,updates:a.length}))}updates(e,t=0){return e=this.get(e),e.updates.filter(r=>r.serial>t).map(r=>this._public(r,e.updates.length))}onUpdate(e){return this.listeners.add(e),()=>this.listeners.delete(e)}_public(e,t){let r={payload:e.payload,serial:e.serial,max_serial:t,sender:e.sender,timestamp:e.ts};for(let o of["info","document","summary","href"])e[o]!=null&&(r[o]=e[o]);return r}async _save(e){this.store&&await this.store.set(e.id,{updates:e.updates,ls:e.ls,summary:e.summary,document:e.document})}send(e,t,r={addr:"agent@kit",name:"Agent"}){if(e=this.get(e),!e)return Promise.reject(new Error("no such app"));let o=(this._q.get(e.id)||Promise.resolve()).then(async()=>{if(!t||typeof t!="object"||!("payload"in t))throw new Error("an update needs a payload");let g=JSON.stringify(t.payload);if(g===void 0)throw new Error("payload must be JSON");if(g.length>128e3)throw new Error("update payload is over 128 KB");let a={serial:e.updates.length+1,payload:JSON.parse(g),sender:r.addr,senderName:r.name,ts:Date.now()};for(let f of["info","document","summary","href","notify"])t[f]!=null&&(a[f]=t[f]);e.updates.push(a),a.summary!=null&&(e.summary=String(a.summary)),a.document!=null&&(e.document=String(a.document)),await this._save(e);for(let f of this.sessions)f.app===e&&f._deliver([a]);for(let f of this.listeners)try{f(e,this._public(a,e.updates.length))}catch{}return this._public(a,e.updates.length)});return this._q.set(e.id,o.catch(()=>{})),o}open(e,{container:t,self:r={addr:"user@kit",name:"You"},onSendToChat:o=null,onOpen:g=null}={}){let a=this.get(e);if(!a)throw new Error("no such app");if(!t)throw new Error("container is required");let f=document.createElement("iframe");f.setAttribute("sandbox","allow-scripts allow-forms allow-modals allow-downloads"),f.setAttribute("allow","autoplay; fullscreen"),f.title=a.name,f.style.cssText="border:0;width:100%;height:100%;display:block;background:#fff";let y=this,x={app:a,frame:f,listening:!1,lastSent:0,post:E=>f.contentWindow?.postMessage(Object.assign({__xdc:1},E),"*"),_deliver(E){if(!this.listening)return;let k=a.updates.length;for(let q of E)q.serial>this.lastSent&&(this.post({t:"update",update:y._public(q,k)}),this.lastSent=q.serial)},send:(E,k)=>y.send(a,E,k),reload:()=>{x.listening=!1,x.lastSent=0,f.srcdoc=Ot(a,r)},close:()=>{window.removeEventListener("message",S),f.remove(),y.sessions.delete(x)}},S=async E=>{if(E.source!==f.contentWindow||!E.data?.__xdc)return;let k=E.data,q=(_,T)=>x.post({t:"reply",id:k.id,data:_,error:T});try{if(k.t==="listen")x.listening=!0,x.lastSent=+k.serial||0,x._deliver(a.updates),x.post({t:"listen-done"});else if(k.t==="send")await y.send(a,k.update,r);else if(k.t==="all")q(a.updates.map(_=>y._public(_,a.updates.length)));else if(k.t==="ls")a.ls=k.data||{},await y._save(a);else if(k.t==="file"){let _=a.files[k.data];_?q({bytes:_.buffer.slice(_.byteOffset,_.byteOffset+_.byteLength),type:We(k.data)}):q(null,"not found: "+k.data)}else k.t==="chat"?(o?.(k.data),q(null)):k.t==="open"&&(g?g(k.url):/^https?:/i.test(k.url)&&window.open(k.url,"_blank","noopener"))}catch(_){k.id&&q(null,String(_.message||_))}};return window.addEventListener("message",S),t.appendChild(f),this.sessions.add(x),x.reload(),x}pack(e){return At(this.get(e).files)}async reset(e){e=this.get(e),e.updates=[],e.ls={},e.summary="",e.document="",await this._save(e)}};var Ut="https://ollama.com",Je=class{constructor({apiKey:e="",host:t=Ut}={}){this.apiKey=e,this.host=t.replace(/\/+$/,"")}get headers(){let e={"Content-Type":"application/json"};return this.apiKey&&(e.Authorization="Bearer "+this.apiKey),e}async _err(e){let t=`HTTP ${e.status}`;try{t=(await e.json()).error||t}catch{}return e.status===401?t="the Ollama API key was rejected (401). Create one at https://ollama.com/settings/keys":(e.status===402||e.status===429)&&(t+=" (Ollama Cloud usage limit)"),new Error(t)}async _post(e,t,r){if(!this.apiKey)throw new Error("no Ollama API key: createKit({ ollamaKey }) or kit.ollama.apiKey = \u2026");let o=await fetch(this.host+e,{method:"POST",headers:this.headers,body:JSON.stringify(t),signal:r});if(!o.ok)throw await this._err(o);return o}async models(){let e=await fetch(this.host+"/api/tags",{headers:this.headers});if(!e.ok)throw await this._err(e);return((await e.json()).models||[]).map(t=>t.name||t.model).filter(Boolean)}async webSearch(e,{maxResults:t=5,signal:r}={}){return(await this._post("/api/web_search",{query:String(e),max_results:Math.max(1,Math.min(10,+t||5))},r)).json()}async webFetch(e,{signal:t}={}){return(await this._post("/api/web_fetch",{url:String(e)},t)).json()}async*chat({signal:e,...t}){let o=(await this._post("/api/chat",{stream:!0,...t},e)).body.getReader(),g=new TextDecoder,a="";for(;;){let{value:f,done:y}=await o.read();if(y)break;a+=g.decode(f,{stream:!0});let x;for(;(x=a.indexOf(`
`))>=0;){let S=a.slice(0,x).trim();if(a=a.slice(x+1),!S)continue;let E=JSON.parse(S);if(E.error)throw new Error(E.error);yield E}}if(a.trim()){let f=JSON.parse(a);if(f.error)throw new Error(f.error);yield f}}};var Pt=3e4,at=2e3,ue=(b,e=Pt)=>(b=String(b??""),b.length<=e?b:b.slice(0,e/2)+`

[\u2026 ${b.length-e} characters cut \u2026]

`+b.slice(-e/2)),ee={type:"string"},ve={type:"integer"},re=(b,e=[])=>({type:"object",properties:b,required:e});function Tt(b){let e=b.vfs,t=null,r=()=>t||=b.shell.session({cwd:"/"}),o={read:{description:"Read a text file. Lines are numbered (cat -n style). Use offset (1-based line) and limit for long files.",parameters:re({path:{...ee,description:"file path, e.g. /notes/todo.md"},offset:{...ve,description:"first line to read (1-based)"},limit:{...ve,description:`number of lines (default ${at})`}},["path"]),run({path:a,offset:f=1,limit:y=at}){let x=e.norm(a,r().cwd);if(e.isDir(x))return`${x} is a directory:
`+e.list(x).map(_=>e.isDir(e.norm(_,x))?_+"/":_).join(`
`);let S=e.read(x).split(`
`),E=Math.max(1,+f||1),k=Math.min(S.length,E-1+(+y||at)),q=S.slice(E-1,k).map((_,T)=>`${String(E+T).padStart(6)}	${_.length>2e3?_.slice(0,2e3)+"\u2026":_}`).join(`
`);return ue(q+(k<S.length?`

[${S.length-k} more lines: read with offset ${k+1}]`:""))}},write:{description:"Create or overwrite a file with the given content (folders are created as needed).",parameters:re({path:ee,content:ee},["path","content"]),run({path:a,content:f}){let y=e.norm(a,r().cwd),x=e.isFile(y);return e.write(y,String(f??"")),`${x?"Overwrote":"Created"} ${y} (${new TextEncoder().encode(String(f??"")).length} bytes)`}},edit:{description:"Edit a file by replacing exact text. oldText must match the file exactly (whitespace included) and occur once, unless replaceAll is true. Read the file first.",parameters:re({path:ee,oldText:{...ee,description:"the exact text to replace"},newText:{...ee,description:"the replacement"},replaceAll:{type:"boolean"}},["path","oldText","newText"]),run({path:a,oldText:f,newText:y,replaceAll:x=!1}){let S=e.norm(a,r().cwd),E=e.read(S),k=String(f??""),q=String(y??"");if(!k)throw new Error("oldText is empty");let _=E.split(k).length-1;if(!_)throw new Error(`oldText was not found in ${S}. Read the file and copy the text exactly.`);if(_>1&&!x)throw new Error(`oldText occurs ${_} times in ${S}. Include more surrounding text so it is unique, or set replaceAll.`);let T=x?E.split(k).join(q):E.replace(k,()=>q);e.write(S,T);let A=E.slice(0,E.indexOf(k)).split(`
`).length;return`Edited ${S}: ${x?_:1} replacement${(x?_:1)>1?"s":""} at line ${A}`}},bash:{description:"Run a shell command line (BusyBox: ls, cat, grep, sed, awk, find, \u2026; pipes, redirects, && ||, $(\u2026)). Also node, python and sqlite3. The working directory persists between calls.",parameters:re({command:ee,timeout:{...ve,description:"seconds (default 60)"}},["command"]),async run({command:a,timeout:f=60},{signal:y}={}){let x=await r().run(a,{timeoutMs:Math.min(600,+f||60)*1e3,signal:y}),S=x.output.trimEnd();return ue((S||"(no output)")+(x.code?`
[exit code ${x.code}]`:""))}},python:{description:"Run MicroPython code. The file system is shared with the other tools. print() output is returned.",parameters:re({code:ee},["code"]),async run({code:a}){let f=await b.python.run(a,{cwd:r().cwd});return ue((f.output.trimEnd()||"(no output)")+(f.code?`
[exit code ${f.code}]`:""))}},javascript:{description:"Run JavaScript in a Node-style sandbox (require fs, path, node:sqlite; fetch). console.log output is returned, and the value of a top-level return.",parameters:re({code:ee},["code"]),async run({code:a}){let f=await b.js.run(a,{cwd:r().cwd});return ue([f.output.trimEnd(),f.result!==void 0?`=> ${JSON.stringify(f.result)}`:"",f.code?`[exit code ${f.code}]`:""].filter(Boolean).join(`
`)||"(no output)")}},sqlite:{description:'Run SQL on a SQLite database file (created if missing; ":memory:" for a scratch one). sqlite-vec (vec0, vec_distance_cosine) and FTS5 are built in. Returns rows as JSON.',parameters:re({database:{...ee,description:"file path, e.g. /data/app.db"},sql:ee,params:{type:"array",items:{}}},["database","sql"]),async run({database:a,sql:f,params:y}){let x=await b.sqlite.open(a===":memory:"?":memory:":e.norm(a,r().cwd));try{let S=x.exec(f,y??null);return ue(S.length?JSON.stringify(S.map(E=>E.values.map(k=>Object.fromEntries(E.columns.map((q,_)=>[q,k[_]])))).flat().slice(0,500)):`OK (${x.db.changes()} rows changed)`)}finally{x.close({save:a!==":memory:"})}}},search_files:{description:"Find files by meaning of words (BM25 ranking) under a folder. Returns paths, scores and a snippet.",parameters:re({query:ee,path:{...ee,description:"folder (default /)"},limit:ve},["query"]),run({query:a,path:f="/",limit:y=10}){let x=Ue(e,a,{root:e.norm(f,r().cwd),limit:y});return x.length?JSON.stringify(x,null,1):"no matches"}},search:{description:"Search the web (Ollama web search). Returns titles, URLs and text snippets.",parameters:re({query:ee,max_results:{...ve,description:"1-10 (default 5)"}},["query"]),async run({query:a,max_results:f=5},y){let x=await b.ollama.webSearch(a,{maxResults:f,signal:y?.signal});return ue(x.results?.length?x.results.map((S,E)=>`[${E+1}] ${S.title}
${S.url}
${String(S.content||"").trim()}`).join(`

`):"no results")}},fetch:{description:"Fetch a web page by URL (Ollama web fetch). Returns its title, text content and links.",parameters:re({url:ee},["url"]),async run({url:a},f){let y=await b.ollama.webFetch(a,{signal:f?.signal});return ue(`# ${y.title||a}

${y.content||""}${y.links?.length?`

Links:
`+y.links.slice(0,50).join(`
`):""}`)}}};o.web_search=o.search,o.web_fetch=o.fetch;let g=a=>(a||Object.keys(o).filter(f=>!f.startsWith("web_"))).filter(f=>o[f]);return{defs:o,names:()=>g(),openai:a=>g(a).map(f=>({type:"function",function:{name:f,description:o[f].description,parameters:o[f].parameters}})),anthropic:a=>g(a).map(f=>({name:f,description:o[f].description,input_schema:o[f].parameters})),async call(a,f={},y={}){let x=o[a];if(!x)return`Error: unknown tool "${a}". Tools: ${g().join(", ")}`;if(typeof f=="string")try{f=JSON.parse(f||"{}")}catch{return`Error: arguments for ${a} are not valid JSON`}try{return String(await x.run(f||{},y))}catch(S){return`Error: ${S?.message||S}`}},add(a,f){return o[a]=f,this},get shell(){return r()}}}var Ft=["read","write","edit","bash","search","fetch"],Ct=`You are a capable assistant working in a sandboxed browser workspace with a Unix-like file system.
Tools:
- read: read a file (numbered lines)
- write: create or overwrite a file
- edit: replace exact text in a file (read it first; oldText must match exactly)
- bash: run shell commands (ls, cat, grep, find, sed, awk, \u2026), plus node, python and sqlite3
- search: search the web
- fetch: fetch a web page
Work step by step. Prefer edit over rewriting whole files. Check your work (run it, read it back). Be concise in your final answer.`,He=class{constructor({kit:e,model:t="gpt-oss:120b",system:r=Ct,tools:o=Ft,think:g=void 0,maxSteps:a=40,options:f=void 0,onEvent:y=null}){Object.assign(this,{kit:e,model:t,system:r,toolNames:o,think:g,maxSteps:a,options:f,onEvent:y}),this.messages=[],this.ctrl=null}emit(e){try{this.onEvent?.(e)}catch{}}reset(){this.messages=[]}abort(){this.ctrl?.abort()}async prompt(e,{images:t}={}){if(this.ctrl)throw new Error("the agent is already running");let o=(this.ctrl=new AbortController).signal,g=this.kit.tools.openai(this.toolNames);this.messages.push({role:"user",content:String(e),...t?.length?{images:t}:{}});try{for(let f=0;f<this.maxSteps;f++){let y={role:"assistant",content:""},x="",S=[];for await(let E of this.kit.ollama.chat({model:this.model,messages:[{role:"system",content:this.system},...this.messages],tools:g,...this.think!==void 0?{think:this.think}:{},...this.options?{options:this.options}:{},signal:o})){let k=E.message||{};k.thinking&&(x+=k.thinking,this.emit({type:"thinking",delta:k.thinking})),k.content&&(y.content+=k.content,this.emit({type:"text",delta:k.content})),k.tool_calls?.length&&S.push(...k.tool_calls)}if(x&&(y.thinking=x),S.length&&(y.tool_calls=S),this.messages.push(y),this.emit({type:"turn_end",message:y}),!S.length)return this.emit({type:"done",text:y.content}),y.content;for(let E of S){let k=E.function?.name,q=E.function?.arguments??{};if(typeof q=="string")try{q=JSON.parse(q)}catch{q={}}this.emit({type:"tool_call",name:k,args:q});let _=await this.kit.tools.call(k,q,{signal:o});if(this.emit({type:"tool_result",name:k,result:_}),this.messages.push({role:"tool",tool_name:k,content:_}),o.aborted)throw new DOMException("stopped","AbortError")}}let a=`(stopped after ${this.maxSteps} steps)`;return this.emit({type:"done",text:a}),a}catch(a){if(a?.name==="AbortError")return this.emit({type:"done",text:"(stopped)"}),"(stopped)";throw this.emit({type:"error",error:a}),a}finally{this.ctrl=null}}};var Wt="0.1.0";async function Ps({persist:b=!1,files:e=null,ollamaKey:t="",assetsBase:r=null,cdn:o="https://cdn.jsdelivr.net/npm/",engine:g="auto",busybox:a=!0}={}){r&&pt(r);let f=new Fe({persist:b});!await f.load().catch(()=>!1)&&e&&f.import(e);let x=new Me(f),S=new Be(f),E=new Pe({vfs:f,cdn:o}),k=new Re({vfs:f,sqlite:S,cdn:o}),q=new Je({apiKey:t}),_={version:Wt,vfs:f,busybox:x,sqlite:S,ml:E,python:k,ollama:q,bm25:{BM25:ge,search:kt,tokenize:De,searchFiles:($,N)=>Ue(f,$,N)}};_.js=new Ne({vfs:f,sqlite:S,ml:E,bridge:($,N)=>A($,N)});let T={node:_.js.command(),js:_.js.command(),python:k.command(),python3:k.command(),sqlite3:S.command()};_.shell=wt({vfs:f,busybox:x,engine:g,commands:T}),_.sh=_.shell.session(),_.run=($,N)=>_.sh.run($,N),_.webxdc=new ze({vfs:f,persist:b}),_.tools=Tt(_),_.agent=($={})=>new He({kit:_,...$});async function A($,N){if($==="tool")return _.tools.call(N.name,N.args||{});if($==="list")return _.tools.names();if($==="shell"){let s=await _.shell.session().run(N.command);return{stdout:s.stdout,stderr:s.stderr,code:s.code}}throw new Error(`kit.${$} is not available in Jade Agent Kit`)}return a&&x.load(),_}export{He as Agent,ge as BM25,Me as BusyBox,Ft as DEFAULT_TOOLS,Ie as Database,Ne as JsRunner,Pe as ML,Je as OllamaCloud,Re as Python,Le as ShellSession,Be as Sqlite,Wt as VERSION,Fe as VFS,ze as Webxdc,kt as bm25Search,Ps as createKit,Tt as createTools,Nt as getAssetsBase,jt as gpuShim,Ue as searchFiles,pt as setAssetsBase,De as tokenize};
//# sourceMappingURL=jade-agent-kit.js.map
