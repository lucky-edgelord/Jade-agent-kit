// The demo page loads from dist/ and its shell runs commands.
import { start } from './_harness.mjs';
const t = await start({ busybox: false });
const { ok, page } = t;
await page.goto('https://kit.test/examples/index.html');
await page.waitForFunction(() => window.kit && /core loaded/.test(document.getElementById('status').textContent), null, { timeout: 30000 });
await page.fill('#shIn', 'cat /README.md | head -1'); await page.press('#shIn', 'Enter');
await page.waitForFunction(() => document.getElementById('term').textContent.includes('# Welcome'), null, { timeout: 10000 });
ok(true, 'the demo shell runs commands');
ok(await page.evaluate(() => /applets/.test(document.getElementById('status').textContent)), 'BusyBox loaded with the first command');
await t.done();
