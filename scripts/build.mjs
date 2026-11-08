// Bundle src/ into dist/jade-agent-kit.js (one ES module). The kit finds assets/ next to dist/ with import.meta.url.
import { build } from 'esbuild';
import fs from 'node:fs';
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url)));
const src = fs.readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
if (!src.includes(`VERSION = '${pkg.version}'`)) throw new Error(`src/index.js VERSION does not match package.json (${pkg.version})`);
const banner = `/*! Jade Agent Kit ${pkg.version} | MIT | https://github.com/lucky-edgelord/Jade-agent-kit | bundles code under its own licenses: see THIRD_PARTY_NOTICES.md */`;
for (const [out, minify] of [['dist/jade-agent-kit.js', true], ['dist/jade-agent-kit.dev.js', false]]) {
  await build({ entryPoints: ['src/index.js'], bundle: true, format: 'esm', target: 'es2022', platform: 'browser', minify, sourcemap: minify ? 'linked' : false, outfile: out, banner: { js: banner }, logLevel: 'warning', legalComments: 'none' });
}
const n = fs.statSync('dist/jade-agent-kit.js').size;
console.log(`dist/jade-agent-kit.js ${(n / 1024).toFixed(1)} KB`);
