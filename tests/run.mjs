// node tests/run.mjs [suite …]: runs each tests/*_test.mjs in its own process.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
const all = fs.readdirSync(new URL('.', import.meta.url)).filter(f => f.endsWith('_test.mjs')).map(f => f.replace(/\.mjs$/, '')).sort();
const pick = process.argv.slice(2); const suites = pick.length ? all.filter(s => pick.includes(s)) : all;
let bad = 0;
for (const s of suites) {
  const t0 = Date.now(); const r = spawnSync(process.execPath, [new URL(s + '.mjs', import.meta.url).pathname], { encoding: 'utf8', timeout: 600000 });
  const okk = r.status === 0; if (!okk) bad++;
  console.log(`${s.padEnd(18)} ${okk ? 'pass' : 'FAIL'}  ${Math.round((Date.now() - t0) / 1000)}s`);
  if (!okk) console.log((r.stdout + r.stderr).split('\n').filter(l => !l.startsWith('PASS')).map(l => '    ' + l).join('\n'));
}
console.log(`\n${suites.length - bad}/${suites.length} suites passed`); process.exit(bad ? 1 : 0);
