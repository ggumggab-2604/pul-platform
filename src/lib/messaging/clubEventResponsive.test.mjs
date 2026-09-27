// Render actual mounted exports from messagingUi.test.mjs, never production sessions.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

test('event broadcast five mounted screens at 390/768/1280 have no horizontal overflow', async () => {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const out = process.env.PUL_MESSAGING_RESPONSIVE_DIR ?? path.join(tmpdir(), 'pul-event-responsive');
  const runtime = process.env.PUL_MESSAGING_TEST_RUNTIME ?? path.join(tmpdir(), 'pul-messaging-ui-runtime');
  const { chromium } = createRequire(path.join(runtime, 'package.json'))('playwright-core');
  const css = readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')
    .replace('"tailwindcss"', JSON.stringify(path.join(runtime, 'node_modules/tailwindcss/index.css').replaceAll('\\', '/')))
    .replace('@source "../";', '@source "./*.html";');
  writeFileSync(path.join(out, 'input.css'), css);
  const compile = spawnSync(process.execPath, [path.join(runtime, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', path.join(out, 'input.css'), '-o', path.join(out, 'app.css')], { encoding: 'utf8', windowsHide: true });
  assert.equal(compile.status, 0, compile.stderr);
  const browser = await chromium.launch({ executablePath: process.env.PUL_TEST_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  const results = [];
  try {
    for (const width of [390, 768, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 1400 }, deviceScaleFactor: 1 });
      for (const screen of ['compose', 'history', 'operator-detail', 'recipient-true', 'recipient-false']) {
        const body = readFileSync(path.join(out, `m1fb1-${screen}.html`), 'utf8');
        await page.setContent(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${readFileSync(path.join(out, 'app.css'), 'utf8')}</style></head><body>${body}</body></html>`);
        await page.evaluate(() => document.fonts.ready);
        const measured = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, text: document.body.innerText }));
        assert.ok(measured.scroll <= width, `${screen} ${width}: overflow ${measured.scroll}`);
        assert.match(measured.text, screen === 'recipient-false' ? /현재 행사 정보를 확인할 수 없습니다/ : /행사/);
        if (screen === 'compose') assert.equal(await page.locator('textarea').count(), 1);
        await page.screenshot({ path: path.join(out, `m1fb1-${screen}-${width}.png`), fullPage: true });
        results.push({ screen, width, scroll: measured.scroll, pass: true });
      }
      await page.close();
    }
  } finally { await browser.close(); }
  writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  console.log('1F-B1 responsive:', results.length, 'screens PASS; artifacts:', out);
});
