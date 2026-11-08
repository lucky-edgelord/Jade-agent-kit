// A vector store: texts embedded with Ollama, kept in SQLite with sqlite-vec, searched by meaning (and keywords).
//   const store = await kit.vectors.open('/data/notes.db');          // or ':memory:'
//   await store.add([{ id: 'a', text: '…', meta: { … } }, '…']);
//   await store.search('question', { limit: 5 });                    // [{ id, text, meta, distance, score }]
import { BM25 } from './bm25.js';

export class VectorStore {
  constructor(db, embed, { model, table = 'docs' }) { this.db = db; this.embedFn = embed; this.model = model; this.t = table.replace(/[^\w]/g, '_'); this.dims = null; }
  async init() {
    const t = this.t, db = this.db;
    db.exec(`create table if not exists ${t}(id text primary key, text text not null, meta text, model text, dims integer)`);
    const row = db.get(`select dims, model from ${t} limit 1`);
    if (row) { this.dims = row.dims; if (row.model && row.model !== this.model) throw new Error(`${t} was embedded with ${row.model}, not ${this.model}: open it with { model: '${row.model}' }`); }
    return this;
  }
  _vecTable(dims) {
    if (this.dims && this.dims !== dims) throw new Error(`the embedding model returned ${dims} dimensions; this store has ${this.dims}`);
    if (!this.dims) { this.dims = dims; this.db.exec(`create virtual table if not exists ${this.t}_vec using vec0(embedding float[${dims}] distance_metric=cosine)`); }
  }
  /** add or replace documents: strings or { id?, text, meta? }; embeds the new texts */
  async add(docs, { signal } = {}) {
    docs = (Array.isArray(docs) ? docs : [docs]).map((d, i) => typeof d === 'string' ? { text: d } : d).filter(d => d && String(d.text ?? '').trim());
    if (!docs.length) return [];
    const vecs = await this.embedFn(docs.map(d => String(d.text)), { model: this.model, signal });
    this._vecTable(vecs[0].length);
    const t = this.t; const ids = [];
    this.db.transaction(db => {
      for (const [i, d] of docs.entries()) {
        const id = String(d.id ?? (crypto.randomUUID?.() || Date.now() + '-' + i));
        const old = db.get(`select rowid from ${t} where id = ?`, [id]);
        if (old) { db.run(`delete from ${t}_vec where rowid = ?`, [old.rowid]); db.run(`delete from ${t} where rowid = ?`, [old.rowid]); }
        const { lastInsertRowid } = db.run(`insert into ${t}(id, text, meta, model, dims) values (?, ?, ?, ?, ?)`, [id, String(d.text), d.meta == null ? null : JSON.stringify(d.meta), this.model, vecs[i].length]);
        db.run(`insert into ${t}_vec(rowid, embedding) values (?, ?)`, [lastInsertRowid, JSON.stringify(vecs[i])]);
        ids.push(id);
      }
    });
    return ids;
  }
  /**
   * Nearest documents to a query. hybrid: also rank by BM25 keywords and merge (reciprocal rank fusion).
   * @returns {Promise<Array<{ id, text, meta, distance, score }>>}
   */
  async search(query, { limit = 5, hybrid = false, signal } = {}) {
    if (!this.dims) return [];
    const [qv] = await this.embedFn([String(query)], { model: this.model, signal });
    const t = this.t; const k = hybrid ? Math.max(limit * 4, 20) : limit;
    const near = this.db.query(`select d.id, d.text, d.meta, v.distance from ${t}_vec v join ${t} d on d.rowid = v.rowid where v.embedding match ? and k = ? order by v.distance`, [JSON.stringify(qv), k])
      .map(r => ({ id: r.id, text: r.text, meta: r.meta ? JSON.parse(r.meta) : null, distance: r.distance, score: 1 - r.distance }));
    if (!hybrid) return near.slice(0, limit);
    const all = this.db.query(`select id, text, meta from ${t}`); const kw = new BM25(all.map(r => ({ id: r.id, text: r.text }))).search(query, { limit: k });
    const fused = new Map(); const add = (list, w) => list.forEach((r, i) => { const f = fused.get(r.id) || { ...r, score: 0 }; f.score += w / (60 + i + 1); fused.set(r.id, f); });
    add(near, 1); add(kw.map(r => { const n = near.find(x => x.id === r.id); const row = all.find(x => x.id === r.id); return n || { id: r.id, text: row.text, meta: row.meta ? JSON.parse(row.meta) : null, distance: null }; }), 1);
    return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }
  remove(ids) { const t = this.t; this.db.transaction(db => { for (const id of [].concat(ids)) { const r = db.get(`select rowid from ${t} where id = ?`, [String(id)]); if (r) { db.run(`delete from ${t}_vec where rowid = ?`, [r.rowid]); db.run(`delete from ${t} where rowid = ?`, [r.rowid]); } } }); }
  count() { return this.db.get(`select count(*) n from ${this.t}`).n; }
  save() { return this.db.save(); }
  close() { this.db.close(); }
}

export function createVectors(kit) {
  return {
    /**
     * Open (or create) a vector store in a SQLite file.
     * @param {string} path a VFS path or ':memory:'
     * @param {{ model?: string, table?: string, ollama?: import('./ollama.js').Ollama }} [o] model: an Ollama embedding model (default embeddinggemma)
     */
    async open(path = ':memory:', { model = 'embeddinggemma', table = 'docs', ollama = null } = {}) {
      const db = await kit.sqlite.open(path);
      const client = ollama || kit.local;
      return new VectorStore(db, (texts, o) => client.embed(texts, o), { model, table }).init();
    },
  };
}
