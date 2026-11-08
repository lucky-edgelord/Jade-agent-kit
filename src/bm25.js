// Ranked keyword search: Okapi BM25 with the same scoring as Python's rank_bm25.BM25Okapi.

const STOP = new Set('a an and are as at be but by for from had has have he her his i if in into is it its me my of on or our she so that the their them then there they this to was we were what when where which who will with you your do does did can could would should not no yes'.split(' '));

/** lower-case words (letters and digits in any script), stop words dropped, a tiny suffix stemmer */
export function tokenize(text, { stopWords = STOP, stem = true } = {}) {
  const out = [];
  for (let w of String(text ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (w.length < 2 || stopWords?.has(w)) continue;
    if (stem && w.length > 4 && /[a-z]$/.test(w)) w = w.replace(/(ing|ed|es|s)$/, '');
    out.push(w);
  }
  return out;
}

export class BM25 {
  /**
   * @param {Array<string|{id?: any, text: string}>} docs
   * @param {{ k1?: number, b?: number, epsilon?: number, tokenize?: (text: string) => string[] }} [o]
   */
  constructor(docs = [], { k1 = 1.5, b = 0.75, epsilon = 0.25, tokenize: tok = tokenize } = {}) {
    this.k1 = k1; this.b = b; this.epsilon = epsilon; this.tok = tok; this.docs = [];
    this.add(docs);
  }
  /** add documents and rebuild the index */
  add(docs) {
    for (const d of docs) { const id = this.docs.length; this.docs.push(typeof d === 'string' ? { id, text: d } : { ...d, id: d.id ?? id }); }
    this._build(); return this;
  }
  _build() {
    const corpus = this.docs.map(d => this.tok(d.text ?? ''));
    this.N = corpus.length;
    this.tf = corpus.map(doc => { const m = new Map(); for (const t of doc) m.set(t, (m.get(t) || 0) + 1); return m; });
    this.len = corpus.map(d => d.length);
    this.avgdl = this.N ? this.len.reduce((a, c) => a + c, 0) / this.N : 0;
    const nd = new Map(); for (const m of this.tf) for (const t of m.keys()) nd.set(t, (nd.get(t) || 0) + 1);
    this.idf = new Map(); let sum = 0; const neg = [];
    for (const [t, n] of nd) { const v = Math.log((this.N - n + 0.5) / (n + 0.5)); this.idf.set(t, v); sum += v; if (v < 0) neg.push(t); }
    // rank_bm25: words in over half the documents get epsilon * the average idf instead of a negative weight
    const floor = Math.max(this.epsilon * (nd.size ? sum / nd.size : 0), 0.01);
    for (const t of neg) this.idf.set(t, floor);
  }
  /** a score per document, in insertion order */
  scores(query) {
    const q = Array.isArray(query) ? query : this.tok(query);
    const sc = new Array(this.N).fill(0);
    for (const t of new Set(q)) {
      const idf = this.idf.get(t); if (idf === undefined) continue;
      for (let i = 0; i < this.N; i++) {
        const f = this.tf[i].get(t); if (!f) continue;
        sc[i] += idf * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / (this.avgdl || 1)));
      }
    }
    return sc;
  }
  /** the best matches, highest score first: [{ id, text, score, ...yourFields }] */
  search(query, { limit = 10, minScore = 0 } = {}) {
    const sc = this.scores(query);
    return sc.map((s, i) => ({ ...this.docs[i], score: s })).filter(d => d.score > minScore).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

/** one-shot: rank docs for a query */
export const bm25Search = (docs, query, opts = {}) => new BM25(docs, opts).search(query, opts);

/** index the text files under a VFS folder and search them: [{ path, score, snippet }] */
export function searchFiles(vfs, query, { root = '/', limit = 10, maxBytes = 1e6, include = /\.(md|txt|js|mjs|ts|py|json|html|css|csv|toml|ya?ml|xml|sh|sql)$/i } = {}) {
  const docs = [];
  for (const p of vfs.walk(root)) { if (!vfs.isFile(p) || !include.test(p)) continue; const b = vfs.readBytes(p); if (b.length > maxBytes) continue; docs.push({ id: p, path: p, text: p + '\n' + new TextDecoder().decode(b) }); }
  const terms = tokenize(query);
  return new BM25(docs).search(query, { limit }).map(({ path, text, score }) => {
    const lines = text.split('\n'); const i = Math.max(0, lines.findIndex((l, k) => k > 0 && terms.some(t => l.toLowerCase().includes(t))));
    return { path, score: +score.toFixed(4), line: i || null, snippet: lines.slice(i || 1, (i || 1) + 3).join('\n').slice(0, 300) };
  });
}
