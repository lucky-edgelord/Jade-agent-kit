// Build dist/: one minified ES module per feature (code they share goes into small chunk files), so a page downloads
// only what it uses. dist/jade-agent-kit.js is the core (createKit + the file system); kit.use() fetches the rest.
// The kit finds assets/ next to dist/ through import.meta.url.
import { build } from 'esbuild';
import fs from 'node:fs';
import zlib from 'node:zlib';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
if (!src.includes(`VERSION = '${pkg.version}'`)) throw new Error(`src/index.js VERSION does not match package.json (${pkg.version})`);
export const ENTRIES = {
  'jade-agent-kit': 'src/index.js', vfs: 'src/vfs.js', busybox: 'src/busybox.js', shell: 'src/shell.js', js: 'src/js.js', python: 'src/python.js',
  sqlite: 'src/sqlite.js', bm25: 'src/bm25.js', ml: 'src/ml.js', webxdc: 'src/webxdc.js', ollama: 'src/ollama.js', vectors: 'src/vectors.js',
  decide: 'src/decide.js', tasks: 'src/tasks.js', schedule: 'src/schedule.js', sentry: 'src/sentry.js', 'sentry-engine': 'src/sentry_engine.js',
  tools: 'src/tools.js', agent: 'src/agent.js',
  memory: 'src/memory.js', knowledge: 'src/knowledge.js', think: 'src/think.js', delegate: 'src/delegate.js', skills: 'src/skills.js',
  history: 'src/history.js', guard: 'src/guard.js', router: 'src/router.js', brain: 'src/brain.js',
};
const banner = `/*! Jade Agent Kit ${pkg.version} | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */`;
fs.rmSync('dist', { recursive: true, force: true });
const r = await build({ entryPoints: ENTRIES, bundle: true, splitting: true, format: 'esm', target: 'es2022', platform: 'browser', minify: true, sourcemap: 'linked', outdir: 'dist', entryNames: '[name]', chunkNames: 'chunk-[hash]', banner: { js: banner }, logLevel: 'warning', legalComments: 'none', metafile: true });
fs.writeFileSync('dist/meta.json', JSON.stringify(r.metafile));
// what each entry costs when loaded alone: the entry plus every chunk it imports statically (gzipped)
const outs = r.metafile.outputs; const gz = f => zlib.gzipSync(fs.readFileSync(f)).length;
const closure = (f, seen = new Set()) => { if (seen.has(f)) return seen; seen.add(f); for (const i of outs[f]?.imports || []) if (i.kind === 'import-statement') closure(i.path, seen); return seen; };
const rows = Object.keys(ENTRIES).map(name => { const f = `dist/${name}.js`; const files = [...closure(f)]; return [name, files.reduce((a, x) => a + fs.statSync(x).size, 0), files.reduce((a, x) => a + gz(x), 0)]; });
for (const [n, raw, z] of rows) console.log(`${n.padEnd(16)} ${(raw / 1024).toFixed(1).padStart(6)} KB  ${(z / 1024).toFixed(1).padStart(5)} KB gzip`);
