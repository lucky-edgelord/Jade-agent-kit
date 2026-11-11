/*! Jade Agent Kit 3.1.0 | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */
import{b as k}from"./chunk-Q6XI22B2.js";import"./chunk-GZEGYG7Y.js";var y=new Set("a an and are as at be by can do does for from has have how i in into is it its me my of on or our so than that the their then there these they this to up us was we what when where which who why will with would you your please help want need make get".split(" ")),p=c=>String(c).replace(/<!--[\s\S]*?-->/g,"").replace(/\n{3,}/g,`

`).trim();function u(c){let t=/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(c||""),e={};if(t)for(let s of t[1].split(/\r?\n/)){let i=s.indexOf(":");i>0&&(e[s.slice(0,i).trim().toLowerCase()]=s.slice(i+1).trim().replace(/^["']|["']$/g,""))}return{meta:e,body:t?c.slice(t[0].length):c||""}}var v=`---
name: skill-creator
description: Create or improve a skill. Use when the user asks for a new skill, workflow, routine or recipe the agent should follow, or wants to change an existing one.
---
# Skill creator
A skill is a folder {skills}/<kebab-case-name>/ with SKILL.md, plus optional files (templates, examples) that SKILL.md refers to by relative path.
1. Ask what the skill should do and when it should trigger, unless the user already said.
2. List {skills} so you do not duplicate a skill; edit a close one instead.
3. Write {skills}/<name>/SKILL.md:
   ---
   name: <name>
   description: <what it does>. Use when <the situations or phrases that should trigger it>.
   ---
   # <Title>
   Numbered, concrete steps using your real tools. Name exact paths and formats.
4. The description decides when the skill is used, so make it specific.
`,g=class{constructor({kit:t,root:e="/.kit",agentsFiles:s=null,allMax:i=15,top:r=6,embed:l=!1,off:a=[]}={}){let h=t.vfs.norm(e);Object.assign(this,{kit:t,vfs:t.vfs,root:h,allMax:i,top:r,embed:l,off:new Set(a)}),this.paths={soul:h+"/SOUL.md",system:h+"/SYSTEM.md",skills:h+"/skills",agents:s||["/AGENTS.md",h+"/AGENTS.md"]},this.stats={},this._vec=null}_read(t,e=8e3){if(!this.vfs.isFile(t))return"";let s=p(this.vfs.read(t));return s.length>e&&(s=s.slice(0,e)+`
\u2026(truncated)`),s}seed(){let t=`${this.paths.skills}/skill-creator/SKILL.md`;return this.vfs.isFile(t)||this.vfs.write(t,v.replaceAll("{skills}",this.paths.skills)),t}list(){let t=[];for(let e of this.vfs.walk(this.paths.skills)){if(!/\/skill\.md$/i.test(e)||!this.vfs.isFile(e)||this.vfs.parent(this.vfs.parent(e))!==this.paths.skills)continue;let{meta:s,body:i}=u(this.vfs.read(e)),r=(s.name||this.vfs.base(this.vfs.parent(e))).trim();t.push({name:r,description:s.description||(i.split(`
`).find(l=>l.trim()&&!l.startsWith("#"))||"").trim().slice(0,200),path:e,dir:this.vfs.parent(e),off:this.off.has(r)})}return t.sort((e,s)=>e.name.localeCompare(s.name))}active(){return this.list().filter(t=>!t.off)}find(t){let e=String(t||"").trim().replace(/^\/?skill:/i,"").toLowerCase();if(!e)return null;let s=this.list(),i=r=>r.toLowerCase().replace(/[\s_-]+/g,"-");return s.find(r=>r.name.toLowerCase()===e)||s.find(r=>i(r.name)===i(e))||s.find(r=>this.vfs.base(r.dir).toLowerCase()===e)||null}load(t,e=""){let s=this.find(t);if(!s)throw new Error(`No skill named "${t}". Available: ${this.active().map(r=>r.name).join(", ")||"none"}`);if(s.off)throw new Error(`The skill "${s.name}" is turned off.`);(this.stats[s.name]||={offered:0,used:0,found:0}).used++;let i=[...this.vfs.walk(s.dir)].filter(r=>r!==s.path&&this.vfs.isFile(r));return`Skill "${s.name}" loaded from ${s.path}. Follow these instructions now.${i.length?`
Other files in this skill (read them when the steps refer to them): ${i.join(", ")}`:""}${e?`
Input: ${e}`:""}

${p(u(this.vfs.read(s.path)).body)}`}expand(t){let e=/^\/skill:([^\s]+)\s*([\s\S]*)$/i.exec(String(t).trim());if(!e)return null;let s=this.find(e[1]);if(!s)throw new Error(`No skill called "${e[1]}". Skills: ${this.active().map(i=>i.name).join(", ")||"none"}`);return{skill:s.name,text:`${this.load(s.name)}

---
The user's request: ${e[2]||"(run the skill)"}`}}steering(){return{system:this.vfs.isFile(this.paths.system)?p(u(this.vfs.read(this.paths.system)).body):"",soul:this._read(this.paths.soul,6e3).replace(/^---[\s\S]*?---\s*/,"").replace(/^# SOUL\s*/i,""),agents:this.paths.agents.map(t=>({path:t,text:this._read(t,6e3).replace(/^# AGENTS\s*/i,"")})).filter(t=>t.text)}}routed(){return this.active().length>this.allMax}async search(t,e=this.top,{strict:s=!1}={}){let i=this.active(),r=new Map(i.map(n=>[n.name,n])),l=String(t||"").split(/\s+/).filter(n=>n&&!y.has(n.toLowerCase().replace(/[^a-z0-9]/g,""))).join(" ")||String(t||""),a=new Map,h=(n,d)=>n.forEach((m,f)=>a.set(m,(a.get(m)||0)+d/(60+f+1)));h(new k(i.map(n=>({id:n.name,text:`${n.name.replace(/[-_]/g," ")} ${n.description}`}))).match(l,{limit:e*3}).map(n=>n.id),1);let w="";if(this.embed)try{this._vec||(this._vec=(await this.kit.use("vectors")).open(":memory:",{model:this.embed,table:"skills"}));let n=await this._vec,d=new Map(n.db.query(`select id, text from ${n.t}`).map(o=>[o.id,o.text])),m=i.map(o=>({id:o.name,text:`${o.name}: ${o.description}`.slice(0,600)})).filter(o=>d.get(o.id)!==o.text);m.length&&await n.add(m);let f=await n.search(l,{limit:e*3});h(f.filter(o=>!s||o.distance<.6||a.has(o.id)).map(o=>o.id).filter(o=>r.has(o)),1.2)}catch(n){w=`meaning search unavailable (${n.message}); word match only`}return{skills:[...a.entries()].sort((n,d)=>d[1]-n[1]).slice(0,e).map(n=>n[0]).map(n=>r.get(n)),note:w}}async context(t=""){let e=this.steering(),s="";e.soul&&(s+=`

Your persona (from ${this.paths.soul}; this is who you are, keep this voice):
${e.soul}`);for(let a of e.agents)s+=`

Standing instructions from the user (${a.path}; always follow them):
${a.text}`;let i=this.active();if(!i.length)return s;let r=a=>`- ${a.name}: ${String(a.description).slice(0,160)}`,l;if(!this.routed())l=i.map(r).join(`
`);else{let a=t.trim()?(await this.search(t,this.top,{strict:!0})).skills:[];for(let h of a)(this.stats[h.name]||={offered:0,used:0,found:0}).offered++;l=(a.map(r).join(`
`)||"- (none matched this message)")+`
(You have ${i.length} skills; these fit this message best. If none fits, call find_skill with a short description of the job.)`}return s+`

Skills (instruction packs in ${this.paths.skills}). When a request matches a skill's description, FIRST call the skill tool with its name, then follow the instructions it returns step by step:
${l}`}get toolDefs(){return{skill:{description:"Load a skill (an instruction pack) by name and follow what it returns. Use it when a request matches a skill in your instructions.",parameters:{type:"object",properties:{name:{type:"string"},input:{type:"string",description:"optional: what to run it on"}},required:["name"]},run:t=>this.load(t.name||t.skill,t.input)},find_skill:{description:"Search your skills by what you want to do, when the skills listed in your instructions do not show one that fits. Returns the best matching names and descriptions; then load one with the skill tool.",parameters:{type:"object",properties:{query:{type:"string",description:"a short description of the job"},limit:{type:"integer"}},required:["query"]},run:async t=>{let e=String(t.query||"").trim();if(!e)throw new Error("find_skill needs a query");let s=await this.search(e,Math.max(1,Math.min(10,+t.limit||6)));if(!s.skills.length)return`No skill matches "${e}". There are ${this.active().length} skills.`;for(let i of s.skills)(this.stats[i.name]||={offered:0,used:0,found:0}).found++;return`Skills that fit "${e}" (load one with the skill tool):
`+s.skills.map(i=>`- ${i.name}: ${String(i.description).slice(0,220)}`).join(`
`)+(s.note?`
(${s.note})`:"")}}}}plugin(){let t=this;return{name:"skills",get tools(){return t.active().length?t.routed()?["skill","find_skill"]:["skill"]:[]},system:async(e,{query:s})=>{e.state.baseSystem??=e.system;let i=t.steering().system;return e.system=i||e.state.baseSystem,t.context(s)}}}};export{v as SKILL_CREATOR,g as Skills,u as parseFront};
//# sourceMappingURL=skills.js.map
