// Notes: links, backlinks, tags, search, rename with link updates, daily notes, templates, tasks and the note tools.
import { start } from './_harness.mjs';
const t = await start({ use: null, busybox: false });
const { ok, ev } = t;
let r = await ev(async () => {
  const v = kit.vfs;
  v.write('/notes/Projects/Kit.md', '---\ntags: [project, js]\n---\n# Kit\nThe [[Roadmap]] and [[Ideas|my ideas]]. See also [Ollama](../Ollama.md) and [[Missing Note]].\n- [ ] ship 0.5\n- [x] ship 0.4\n#work/active');
  v.write('/notes/Roadmap.md', '# Roadmap\nBuilt for the [[Kit]]. Next: [[Kit#Ideas|ideas]].\n```\n[[Not A Link]]\n```\n#planning');
  v.write('/notes/Ideas.md', '# Ideas\nKit ideas: lean loading, kit brain, kit automation.\n- [ ] write docs');
  v.write('/notes/Ollama.md', '# Ollama\nRuns models. Used by [[Kit]].');
  v.write('/notes/Orphan.md', 'alone');
  v.write('/.kit/memory/Memory.md', '- [[Kit]] is not a note');
  const N = await kit.use('notes');
  const idx = N.index(); const l = N.links('Kit');
  return { notes: idx.notes, back: l.backlinks.map(b => b.path + ' | ' + b.line), out: l.outgoing, miss: l.unresolved, tags: l.tags, roadmapMiss: N.links('Roadmap').unresolved, resolve: [N.resolve('kit'), N.resolve('Projects/Kit'), N.resolve('nope')], over: N.overview() };
});
ok(r.notes.length === 5 && !r.notes.some(p => p.startsWith('/.kit/')), 'notes are the .md files outside /.kit/: ' + r.notes.join(','));
ok(r.out.join() === '/notes/Roadmap.md,/notes/Ideas.md,/notes/Ollama.md' && r.miss.join() === 'Missing Note' && r.back.length === 2 && r.back.some(b => /Roadmap.md \| Built for the \[\[Kit\]\]/.test(b)), 'wiki links (with alias), markdown links, backlinks with their line, unresolved links: ' + JSON.stringify([r.out, r.back]));
ok(r.tags.join() === 'js,project,work/active' && r.roadmapMiss.length === 0 && r.resolve.join() === '/notes/Projects/Kit.md,/notes/Projects/Kit.md,', 'inline and frontmatter tags; links in code blocks are ignored; loose name resolution: ' + JSON.stringify([r.tags, r.resolve]));
ok(r.over.notes === 5 && r.over.orphans === 1 && r.over.unresolved === 1 && r.over.tags.project === 1 && /Kit \(2\)/.test(r.over.mostLinked[0]), 'overview: counts, orphans, unresolved links, tags, most linked: ' + JSON.stringify(r.over));
r = await ev(async () => { const N = kit.notes; return { kit: N.search('kit').map(x => x.path), tag: N.search('#work').map(x => x.path), both: N.search('lean automation').map(x => x.path), snippet: N.search('lean')[0].snippet }; });
ok(r.kit[0] === '/notes/Projects/Kit.md' && r.tag.join() === '/notes/Projects/Kit.md' && r.both.join() === '/notes/Ideas.md' && /lean loading/.test(r.snippet), 'search: the name counts most, #tag finds nested tags, every word must match, with a snippet: ' + JSON.stringify(r));
r = await ev(async () => {
  const N = kit.notes; const res = N.rename('Kit', 'Jade Kit');
  return { res, roadmap: kit.vfs.read('/notes/Roadmap.md'), ollama: kit.vfs.read('/notes/Ollama.md'), back: N.links('Jade Kit').backlinks.length, moved: N.rename('Ideas', '/notes/archive/Ideas 2026'), kitNow: kit.vfs.read('/notes/Projects/Jade Kit.md') };
});
ok(r.res.to === '/notes/Projects/Jade Kit.md' && /Built for the \[\[Jade Kit\]\]\. Next: \[\[Jade Kit#Ideas\|ideas\]\]/.test(r.roadmap) && /Used by \[\[Jade Kit\]\]/.test(r.ollama) && r.back === 2, 'rename updates every link, keeping headings and aliases: ' + r.roadmap.split('\n')[1]);
ok(r.moved.to === '/notes/archive/Ideas 2026.md' && /\[\[Ideas 2026\|my ideas\]\]/.test(r.kitNow) && /\(\.\.\/Ollama\.md\)/.test(r.kitNow), 'moving to another folder updates links too: ' + r.kitNow.split('\n')[4]);
r = await ev(async () => {
  const N = kit.notes; kit.vfs.write('/templates/Daily.md', '# {{date:dddd D MMMM}}\nYesterday: [[{{yesterday}}]]\n## Tasks\n');
  kit.vfs.write('/templates/Meeting.md', '# {{title}}\nWith {{who}} on {{date}} at {{time:HH}}h. Unknown: {{nope}}');
  const d = N.daily('2026-11-09'); const again = N.daily('2026-11-09');
  const m = N.create('/notes/meetings/Sync', { template: 'Meeting', vars: { who: 'Ana' }, date: new Date('2026-11-09T14:30:00') });
  let dup; try { N.create('/notes/meetings/Sync', { content: 'x' }); } catch (e) { dup = e.message; }
  return { d, same: d === again, daily: kit.vfs.read(d), meeting: kit.vfs.read(m), dup, tasks: N.tasks().map(x => x.text), done: N.tasks({ done: true }).map(x => x.text) };
});
ok(r.d === '/daily/2026-11-09.md' && r.same && r.daily.startsWith('# Monday 9 November\nYesterday: [[2026-11-08]]'), 'daily notes come from the Daily template: ' + JSON.stringify(r.daily));
ok(r.meeting === '# Sync\nWith Ana on 2026-11-09 at 14h. Unknown: {{nope}}' && /already exists/.test(r.dup) && r.tasks.join() === 'ship 0.5,write docs' && r.done.join() === 'ship 0.4', 'templates fill title, date, time and vars; tasks across notes: ' + JSON.stringify([r.meeting, r.tasks]));
r = await ev(async () => ({ s: await kit.tool('notes_search', { query: 'roadmap' }), o: await kit.tool('notes_search', {}), l: await kit.tool('note_links', { note: 'Roadmap' }), d: await kit.tool('note', { action: 'daily', date: '2026-11-10' }), open: await kit.tool('note', { action: 'open', note: 'Roadmap' }) }));
ok(/\/notes\/Roadmap\.md {2}→ {2}\[\[Roadmap\]\]/.test(r.s) && /notes, \d+ links/.test(r.o) && /Backlinks \(1\)/.test(r.l) && /^\/daily\/2026-11-10\.md/.test(r.d) && /does not show notes/.test(r.open), 'the note tools: search, overview, links, daily, open: ' + r.s.split('\n')[0]);
await t.done();
