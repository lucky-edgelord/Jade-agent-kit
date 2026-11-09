// Workers for the sqlite3 shell command and the Python sqlite3 module (from Jade Vault).
export const SQLITE_CLI_WORKER = `
self.onmessage = (ev) => {
  const { module, argv, stdin, dbBytes, files } = ev.data;
  try {
    const S = __jvSqlite(module);
    const r = S.cli({ argv, stdin, dbBytes, readFile: p => files[p] ?? null });
    self.postMessage(r, r.dbBytes ? [r.dbBytes.buffer] : []);
  } catch (e) { self.postMessage({ out: '', err: 'sqlite3: ' + ((e && e.message) || e) + '\\n', code: 1 }); }
};`;
