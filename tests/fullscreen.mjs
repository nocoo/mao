import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { verifyDeployment } from '../scripts/verify-production.mjs';

if (!existsSync('dist/index.html')) throw new Error('Run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 4176, strictPort: true, open: false } });
const origin = 'http://127.0.0.1:4176';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const errors = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768], [390, 844], [320, 740], [320, 568], [800, 450]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(({ w, h }) => {
      const rect = document.querySelector('#app').getBoundingClientRect();
      const rail = document.querySelector('.rail').getBoundingClientRect();
      return Math.abs(rect.width - w) < 1 && Math.abs(rect.height - h) < 1 && Math.abs(rail.width - (w <= 820 ? 46 : 68)) < 1;
    }, { w: width, h: height });
    const layout = await page.evaluate(() => {
      const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right }; };
      return { app: rect('#app'), player: rect('#player'), reader: rect('#poemWrap'), width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight };
    });
    assert.ok(layout.width <= width + 1, `${width}: horizontal overflow ${JSON.stringify(layout)}`);
    assert.ok(layout.height <= height + 1, `${height}: outer overflow ${JSON.stringify(layout)}`);
    assert.ok(layout.player.bottom <= height + 1, `${width}: player off screen`);
    assert.ok(layout.reader.h > 60, `${width}: no readable area ${JSON.stringify(layout)}`);
    if (width === 390 || width === 320) {
      await page.locator('#aVert').click();
      await page.waitForFunction(() => {
        const wrap = document.querySelector('#poemWrap');
        return wrap.scrollWidth <= wrap.clientWidth + 1;
      });
      const columns = await page.locator('#poem .ln').evaluateAll(nodes => nodes.map(node => ({ width: node.getBoundingClientRect().width, lineHeight: parseFloat(getComputedStyle(node).lineHeight) })));
      assert.ok(columns.every(column => column.width <= column.lineHeight + 1), `${width}: couplets should remain single columns`);
      await page.locator('#aVert').click();
    }
    if (width <= 820) {
      await page.locator('#tIndex').click();
      await page.waitForFunction(() => { const r = document.querySelector('#index').getBoundingClientRect(); return Math.abs(r.left - document.querySelector('.rail').getBoundingClientRect().right) < 1; });
      const index = await page.locator('#index').boundingBox();
      assert.ok(index.x >= 0 && index.x + index.width <= width + 1, `${width}: catalog clipped`);
      await page.locator('#tIndex').click();
    }
    await page.evaluate(() => { history.replaceState(null, '', '#poem=75'); dispatchEvent(new HashChangeEvent('hashchange')); });
    const longPoem = await page.locator('#poemWrap').evaluate(node => { node.scrollTop = node.scrollHeight; return { height: node.scrollHeight, client: node.clientHeight, top: node.scrollTop }; });
    assert.ok(longPoem.height > longPoem.client && longPoem.top > 0, `${width}: long poem should scroll`);
    await page.locator('#aVert').click();
    const firstLineVisible = () => page.evaluate(() => {
      const wrap = document.querySelector('#poemWrap').getBoundingClientRect();
      const first = document.querySelector('#poem .ln').getBoundingClientRect();
      return first.right <= wrap.right + 1 && first.right > wrap.left && first.left < wrap.right;
    });
    assert.ok(await firstLineVisible(), `${width}: vertical first line is off screen`);
    await page.locator('#nextL').evaluate(node => node.click());
    assert.ok(await firstLineVisible(), `${width}: vertical first line after navigation is off screen`);
    assert.equal(await page.locator('#hero').getAttribute('data-poem-id'), '76');
    assert.equal(await page.locator('#poemWrap').evaluate(node => node.scrollTop), 0);
    console.log(`✓ ${width}×${height}: fullscreen, player and long-poem scrolling`);
  }
  assert.deepEqual(errors, []);
  let revision = 'unknown';
  try { revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { }
  const metadata = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  assert.equal(metadata.revision, revision);
  if (revision !== 'unknown') await verifyDeployment(origin, revision);
  assert.equal(existsSync('dist/.env'), false);
  console.log('✓ Deployment verifier and private configuration isolation');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
