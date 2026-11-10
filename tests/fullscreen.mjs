import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { verifyDeployment } from '../scripts/verify-production.mjs';

if (!existsSync('dist/index.html')) throw new Error('Run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 4176, strictPort: true, open: false } });
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const origin = 'http://127.0.0.1:4176';
const errors = [];

try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768], [390, 844], [320, 740], [800, 450]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    // Headless Chromium can update viewport units after the resize event and initial paints.
    await page.waitForFunction(({ width: expectedWidth, height: expectedHeight }) => {
      const frame = document.querySelector('.page-frame')?.getBoundingClientRect();
      return frame && Math.abs(frame.width - expectedWidth) < 1 && Math.abs(frame.height - expectedHeight) < 1;
    }, { width, height }, { timeout: 5000 });
    const layout = await page.evaluate(() => {
      const rect = selector => {
        const r = document.querySelector(selector).getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, right: r.right };
      };
      return { viewport: { w: innerWidth, h: innerHeight }, frame: rect('.page-frame'), art: rect('.poster-wall'), controls: rect('.reader-controls'), poem: rect('#poem-page'), title: rect('.brand h1'), scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, artLoaded: document.querySelector('#hero-art').complete && document.querySelector('#hero-art').naturalWidth > 0 };
    });
    assert.equal(layout.frame.x, 0);
    assert.equal(layout.frame.y, 0);
    assert.ok(Math.abs(layout.frame.w - width) < 1);
    assert.ok(Math.abs(layout.frame.h - height) < 1, `Fullscreen dimensions: ${JSON.stringify(layout)}`);
    assert.ok(layout.scrollWidth <= width + 1, `${width}: horizontal overflow`);
    assert.ok(layout.scrollHeight <= height + 1, `${height}: outer-page overflow`);
    assert.ok(layout.controls.bottom <= height + 1, `${width}: controls off screen`);
    assert.ok(layout.poem.h > 64, `${width}: no readable scroll area`);
    assert.ok(layout.title.h < 40, `${width}: masthead should be modest`);
    assert.equal(layout.artLoaded, true);
    assert.equal(await page.locator('.masthead, .print-note, .print-heading, .issue-line').count(), 0);
    if (width > 760) assert.ok(layout.art.w >= width * .39 && layout.art.h > height * .8);
    if (process.env.CAPTURE_SCREENSHOTS === '1' && width === 1440 && !existsSync('test-results/fullscreen-desktop.png')) await page.screenshot({ path: 'test-results/fullscreen-desktop.png', animations: 'disabled' });
    if (process.env.CAPTURE_SCREENSHOTS === '1' && width === 390 && !existsSync('test-results/fullscreen-mobile.png')) await page.screenshot({ path: 'test-results/fullscreen-mobile.png', animations: 'disabled' });
    await page.evaluate(() => {
      history.replaceState(null, '', '#poem=40');
      dispatchEvent(new HashChangeEvent('hashchange'));
      const article = document.querySelector('#poem-page');
      article.scrollTop = article.scrollHeight;
    });
    const longPoem = await page.locator('#poem-page').evaluate(node => ({ scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, scrollTop: node.scrollTop }));
    assert.ok(longPoem.scrollHeight > longPoem.clientHeight, `${width}: long poem should scroll internally`);
    assert.ok(longPoem.scrollTop > 0);
    await page.locator('#next-poem').click();
    assert.equal(await page.locator('#poem-page').evaluate(node => node.scrollTop), 0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    console.log(`✓ ${width}×${height}: fullscreen, art, accessible controls and internal poetry scroll`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/#poem=02`, { waitUntil: 'networkidle' });
  await page.locator('#open-notes').click();
  await page.locator('#notes-dialog').evaluate(node => { node.scrollTop = node.scrollHeight; });
  assert.ok(await page.locator('#notes-dialog [data-close]').evaluate(node => { const r = node.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
  await page.locator('#notes-dialog [data-close]').click();
  assert.deepEqual(errors, []);
  console.log('✓ Notes close control remains accessible after scrolling');

  let expectedRevision = 'unknown';
  try { expectedRevision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Source archives have no Git metadata. */ }
  const metadata = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  assert.equal(metadata.revision, expectedRevision);
  if (expectedRevision !== 'unknown') await verifyDeployment(origin, expectedRevision);
  console.log('✓ Build metadata and deployment verifier match the local preview');

  const ignore = await readFile('.gitignore', 'utf8');
  assert.match(ignore, /^\.env$/m);
  assert.match(ignore, /^\.env\.\*$/m);
  assert.equal(existsSync('dist/.env'), false);
  if (existsSync('.env')) {
    const dotenv = await readFile('.env', 'utf8');
    const secrets = [...dotenv.matchAll(/^\s*(?:export\s+)?AZURE_OPENAI_(?:API_KEY|ENDPOINT)\s*=\s*(.*?)\s*$/gm)].map(match => match[1].replace(/^(['"])(.*)\1$/, '$2')).filter(Boolean);
    async function checkDirectory(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = join(directory, entry.name);
        if (entry.isDirectory()) await checkDirectory(file);
        else if (/\.(?:js|html|css|json|map|txt|md)$/.test(file)) {
          const bytes = await readFile(file, 'utf8');
          for (const secret of secrets) assert.equal(bytes.includes(secret), false, 'A private image-service value reached a build artifact');
        }
      }
    }
    await checkDirectory('dist');
  }
  console.log('✓ Private image-generation configuration is ignored and absent from built assets');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
