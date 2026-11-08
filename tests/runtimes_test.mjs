// JS sandbox, MicroPython (from jsDelivr), SQLite + sqlite-vec, BM25, shell commands for each.
import { start } from './_harness.mjs';
const t = await start({ files: { '/data/notes.txt': 'apples\nbananas\n', '/lib/m.js': 'module.exports = { twice: x => x * 2 };\n' } });
const { ok, ev } = t;
// JavaScript
let r = await ev(() => kit.js.run(`const fs = require('fs'); const m = require('/lib/m.js'); console.log(m.twice(21)); fs.writeFileSync('/out/js.txt', fs.readFileSync('/data/notes.txt', 'utf8').toUpperCase()); return { n: 1 };`));
ok(r.stdout === '42\n' && r.code === 0 && r.result?.n === 1, 'JS: require, console, return: ' + JSON.stringify(r));
ok(await ev(() => kit.vfs.read('/out/js.txt')) === 'APPLES\nBANANAS\n', 'JS writes reach the VFS');
r = await ev(() => kit.js.run(`throw new Error('boom')`));
ok(r.code === 1 && /boom/.test(r.stderr), 'JS errors: ' + JSON.stringify(r.stderr));
r = await ev(() => kit.js.run(`const t = await kit.tool('read', { path: '/data/notes.txt' }); console.log(t.includes('bananas'));`));
ok(r.stdout === 'true\n', 'scripts call kit tools: ' + JSON.stringify(r));
r = await ev(() => kit.run(`node -e "console.log(require('path').join('/a','b'))"`));
ok(r.stdout === '/a/b\n', 'node in the shell: ' + JSON.stringify(r));
// SQLite + sqlite-vec
r = await ev(async () => {
  const db = await kit.sqlite.open('/db/test.db');
  db.exec(`create table t(id integer primary key, name text); insert into t(name) values ('a'), ('b');`);
  const rows = db.query('select * from t order by id');
  const vec = db.query(`select vec_version() as v`)[0].v;
  db.exec(`create virtual table v using vec0(embedding float[3]); insert into v(rowid, embedding) values (1, '[1,0,0]'), (2, '[0,1,0]'), (3, '[0.9,0.1,0]');`);
  const near = db.query(`select rowid, distance from v where embedding match '[1,0,0]' order by distance limit 2`);
  db.exec(`create virtual table f using fts5(body); insert into f values ('the quick brown fox'), ('lazy dog');`);
  const fts = db.query(`select body from f where f match 'quick'`);
  db.close();
  return { rows, vec, near: near.map(x => x.rowid), fts, saved: kit.vfs.isFile('/db/test.db') };
});
ok(r.rows?.length === 2 && /^v0\./.test(r.vec) && JSON.stringify(r.near) === '[1,3]' && r.fts?.[0]?.body === 'the quick brown fox' && r.saved, 'SQLite, sqlite-vec KNN, FTS5, save: ' + JSON.stringify(r));
r = await ev(() => kit.run(`sqlite3 -json /db/test.db "select name from t"`));
ok(r.stdout.replace(/\s/g, '') === '[{"name":"a"},{"name":"b"}]', 'sqlite3 in the shell: ' + JSON.stringify(r));
r = await ev(() => kit.js.run(`const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/db/test.db'); console.log(db.prepare('select count(*) n from t').get().n); db.exec("insert into t(name) values ('c')"); db.close();`));
ok(r.stdout === '2\n', 'node:sqlite in scripts: ' + JSON.stringify(r));
ok(await ev(async () => { const db = await kit.sqlite.open('/db/test.db'); const n = db.get('select count(*) n from t').n; db.close(); return n; }) === 3, 'a script\'s database writes are saved');
// BM25
r = await ev(() => kit.bm25.search(['the cat sat on the mat', 'my cat likes fish', 'a quick brown fox'], 'cat mat'));
ok(r[0]?.id === 0 && r[1]?.id === 1 && r.length === 2, 'BM25 ranks: ' + JSON.stringify(r));
r = await ev(() => { const i = new K.BM25(['apple banana cherry', 'banana cherry date', 'xray yak zebra', 'kiwi lime mango', 'plum pear fig']); return i.scores('banana').map(x => +x.toFixed(4)); });
ok(r[0] > 0 && r[0] === r[1] && r[2] === 0 && r[3] === 0 && r[4] === 0, 'BM25 scores like rank_bm25: ' + JSON.stringify(r));
r = await ev(() => kit.bm25.searchFiles('bananas'));
ok(r[0]?.path === '/data/notes.txt', 'searchFiles finds files: ' + JSON.stringify(r));
// MicroPython (downloads the runtime from jsDelivr)
r = await ev(() => kit.python.run(`import os\nprint(sum(range(10)))\nwith open('/out/py.txt', 'w') as f: f.write(open('/data/notes.txt').read().upper())\nprint(sorted(os.listdir('/data')))`));
ok(r.stdout === "45\n['notes.txt']\n" && r.code === 0, 'Python runs: ' + JSON.stringify(r));
ok(await ev(() => kit.vfs.read('/out/py.txt')) === 'APPLES\nBANANAS\n', 'Python writes reach the VFS');
r = await ev(() => kit.python.run(`import sqlite3\nc = sqlite3.connect('/db/test.db')\nprint(c.execute('select count(*) from t').fetchone()[0])\nc.execute("insert into t(name) values ('py')")\nc.commit()\nc.close()`));
ok(r.stdout === '3\n', 'Python sqlite3: ' + JSON.stringify(r));
r = await ev(() => kit.run(`python -c "print('x' * 3)" | tr x y`));
ok(r.stdout === 'yyy\n', 'python in the shell: ' + JSON.stringify(r));
r = await ev(() => kit.python.run(`raise ValueError('bad')`));
ok(r.code === 1 && /ValueError: bad/.test(r.stderr), 'Python errors: ' + JSON.stringify(r.stderr));
await t.done();
