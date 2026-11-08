// Test setup: serve the repository over HTTP, open headless Chromium on tests/page.html, which imports the kit
// (dist/ by default, src/ with JAK_SRC=1). External CDNs go through the machine's proxy when HTTPS_PROXY is set;
// ollama.com can be stood in for with ollama().
import fs from 'node:fs';
import path from 'node:path';
import pw from 'playwright';
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.wasm': 'application/wasm', '.json': 'application/json', '.map': 'application/json', '.xdc': 'application/zip' };

export async function start({ persist = false, files = null, ollamaKey = 'test-key', from = process.env.JAK_SRC ? 'src/index.js' : 'dist/jade-agent-kit.js', busybox = true } = {}) {
  const base = 'https://kit.test';
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await pw.chromium.launch({ proxy, args: ['--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  // the repository is served at https://kit.test straight from disk (no server, no proxy)
  await ctx.route('https://kit.test/**', route => {
    const u = new URL(route.request().url()); const p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(p)] || 'application/octet-stream', body: fs.readFileSync(p) });
  });
  const page = await ctx.newPage();
  const log = [], fail = []; const ok = (c, m) => (c ? log : fail).push((c ? 'PASS ' : 'FAIL ') + m);
  page.on('pageerror', e => fail.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) log.push('[console] ' + m.text()); });
  await page.goto(`${base}/tests/page.html`);
  await page.evaluate(async ({ from, opts }) => { const mod = await import('/' + from); window.K = mod; window.kit = await mod.createKit(opts); }, { from, opts: { persist, files, ollamaKey, busybox } });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  return {
    page, ok, ev, base, log, fail,
    async done() { await browser.close(); for (const l of log) console.log(l); for (const f of fail) console.log(f); console.log(fail.length ? `\n${fail.length} FAILED` : '\nALL PASS'); process.exit(fail.length ? 1 : 0); },
  };
}
