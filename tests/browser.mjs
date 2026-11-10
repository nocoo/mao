import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Exercise the built site, including local fonts and the source documents copied into dist.
if (!existsSync('dist/index.html')) throw new Error('Run pnpm build before pnpm test:browser');
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true, open: false } });
const origin = 'http://127.0.0.1:4175';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const errors = [];
const failedRequests = [];
const externalRequests = [];
let checks = 0;

function monitor(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) externalRequests.push(request.url()); });
}
function pass(name) { console.log(`✓ ${name}`); checks++; }
async function waitPoem(page, id) { await page.waitForFunction(value => document.querySelector('#poem-page').dataset.poemId === value, id); }
async function closeSheet(page, selector) {
  await page.locator(`${selector} [data-close]`).click();
  await page.waitForFunction(sel => !document.querySelector(sel).open, selector);
}

try {
  await mkdir('test-results', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  monitor(page);
  await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await waitPoem(page, '16');
  await page.evaluate(() => document.fonts.ready);
  assert.match(await page.title(), /七律·长征/);
  assert.match(await page.locator('#poem-body').innerText(), /腾细浪/);
  assert.equal(await page.locator('dialog[open]').count(), 0);
  assert.equal(await page.locator('#notes-panel').textContent(), '');
  assert.equal(await page.evaluate(() => window.POEM_LIBRARY.poems.length), 100);
  assert.equal(await page.evaluate(() => document.fonts.check('400 104px "Ma Shan Zheng"', '毛主席诗词')), true);
  pass('Deep-linked poetry, 100 records, local type, and all notes closed on entry');

  if (!existsSync('test-results/desktop.png') || process.env.UPDATE_SCREENSHOTS === '1') await page.screenshot({ path: 'test-results/desktop.png', fullPage: true, animations: 'disabled' });
  await page.locator('#next-poem').click();
  await waitPoem(page, '17');
  await page.locator('#previous-poem').click();
  await waitPoem(page, '16');
  await page.keyboard.press('r');
  await page.waitForFunction(() => document.querySelector('#poem-page').dataset.poemId !== '16');
  assert.ok(['正编', '副编', '补编'].includes(await page.locator('#poem-collection').textContent()));
  await page.goBack();
  await waitPoem(page, '16');
  pass('Next, previous, keyboard random, and browser back preserve reading state');

  await page.locator('#open-catalog').click();
  assert.equal(await page.locator('.catalog-entry').count(), 100);
  assert.equal(await page.locator('#poem-search').evaluate(node => node === document.activeElement), true);
  await page.locator('[data-collection="正编"]').click();
  assert.equal(await page.locator('.catalog-entry').count(), 42);
  await page.locator('[data-collection="副编"]').click();
  assert.equal(await page.locator('.catalog-entry').count(), 25);
  await page.locator('[data-collection="补编"]').click();
  assert.equal(await page.locator('.catalog-entry').count(), 33);
  await page.locator('[data-collection="全部"]').click();
  await page.locator('#poem-search').fill('万水千山只等闲');
  assert.equal(await page.locator('.catalog-entry').count(), 1);
  assert.equal(await page.locator('.catalog-entry').getAttribute('data-poem-id'), '16');
  await page.locator('#poem-search').fill('<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('.catalog-entry').count(), 0);
  assert.equal(await page.locator('#catalog-empty').isVisible(), true);
  assert.equal(await page.locator('#catalog-results img').count(), 0);
  await page.locator('#clear-search').click();
  assert.equal(await page.locator('.catalog-entry').count(), 100);
  await page.locator('#poem-search').fill('沁园春');
  assert.equal(await page.locator('.catalog-entry').count(), 2);
  await page.locator('.catalog-entry[data-poem-id="02"]').click();
  await waitPoem(page, '02');
  assert.equal(await page.locator('dialog[open]').count(), 0);
  pass('Catalog search, collection filters, empty state, safe text and selection');

  await page.locator('#open-notes').click();
  assert.equal(await page.locator('#notes-title').textContent(), '沁园春·长沙');
  assert.match(await page.locator('#notes-panel').textContent(), /品读版 · 注释/);
  assert.match(await page.locator('#notes-panel').textContent(), /初始文本 · 注释/);
  assert.match(await page.locator('#notes-panel').textContent(), /橘子洲/);
  await page.locator('#tab-context').click();
  assert.match(await page.locator('#notes-panel').textContent(), /赵恒惕/);
  await page.locator('#tab-analysis').click();
  assert.match(await page.locator('#notes-panel').textContent(), /未附赏析/);
  await page.locator('#tab-versions').click();
  assert.equal(await page.locator('.source-disclosure').count(), 2);
  assert.equal(await page.locator('.source-disclosure[open]').count(), 0);
  await page.locator('.source-disclosure summary').first().click();
  await page.locator('.source-disclosure[open] .note-prose').waitFor({ state: 'visible' });
  assert.match(await page.locator('.source-disclosure[open]').textContent(), /独立寒秋/);
  await page.locator('#tab-versions').focus();
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#tab-annotations').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#tab-context').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('#notes-dialog').open);
  assert.equal(await page.locator('#open-notes').evaluate(node => node === document.activeElement), true);
  pass('On-demand notes, both sources, empty categories, original versions and keyboard tabs');

  await page.keyboard.press('/');
  assert.equal(await page.locator('#catalog-dialog').evaluate(node => node.open), true);
  const before = await page.locator('#poem-id').textContent();
  await page.locator('#poem-search').fill('r');
  assert.equal(await page.locator('#poem-id').textContent(), before);
  await closeSheet(page, '#catalog-dialog');
  await page.locator('#open-about').click();
  assert.match(await page.locator('#about-dialog').innerText(), /67 首/);
  await closeSheet(page, '#about-dialog');
  pass('Global shortcuts do not interrupt typing or dialog navigation');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await page.evaluate(async () => {
    const normalize = text => text.replace(/\s/g, '').replace(/,/g, '，').replace(/\./g, '。');
    const issues = [];
    for (const poem of window.POEM_LIBRARY.poems) {
      history.replaceState(null, '', `#poem=${poem.id}`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      if (document.querySelector('#poem-page').dataset.poemId !== poem.id) issues.push(`${poem.id}: selection`);
      if (normalize(document.querySelector('#poem-body').textContent) !== normalize(poem.body.join(''))) issues.push(`${poem.id}: body changed`);
      if (document.documentElement.scrollWidth > innerWidth + 1) issues.push(`${poem.id}: overflow`);
    }
    return issues;
  });
  assert.deepEqual(result, []);
  pass('All 100 records render without omitted Chinese characters or horizontal overflow');

  await page.goto(`${origin}/#poem=81`, { waitUntil: 'networkidle' });
  assert.doesNotMatch(await page.locator('#poem-body').textContent(), /军队向前进/);
  await page.locator('#open-notes').click();
  await page.locator('#tab-versions').click();
  await page.locator('.source-disclosure summary').first().click();
  await page.locator('.source-disclosure[open] .note-prose').waitFor({ state: 'visible' });
  assert.match(await page.locator('.source-disclosure[open]').textContent(), /军队向前进/);
  await closeSheet(page, '#notes-dialog');
  const response = await page.request.get(`${origin}/${encodeURI('data/诗词/补编/81-七律·忆重庆谈判.md')}`);
  assert.equal(response.status(), 200);
  assert.match(await response.text(), /七律·忆重庆谈判/);
  pass('Supplementary text is separated correctly; deployed original Markdown links work');

  await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { for (let i = 0; i < 8; i++) document.querySelector('#next-poem').click(); });
  await waitPoem(page, '24');
  const randoms = await page.evaluate(() => {
    const ids = [];
    for (let i = 0; i < 20; i++) { document.querySelector('#random-poem').click(); ids.push(document.querySelector('#poem-page').dataset.poemId); }
    return ids;
  });
  assert.equal(new Set(randoms).size, randoms.length);
  pass('Rapid navigation stays consistent and random selection does not repeat within the bag');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied for test'); } } });
  });
  await page.locator('#copy-poem').click();
  assert.match(await page.locator('#toast').textContent(), /已选中诗句/);
  assert.ok(await page.evaluate(() => String(getSelection()).length > 0));
  pass('Clipboard denial offers a working manual-copy fallback');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  monitor(mobile);
  await mobile.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await mobile.evaluate(() => document.fonts.ready);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  if (!existsSync('test-results/mobile.png') || process.env.UPDATE_SCREENSHOTS === '1') await mobile.screenshot({ path: 'test-results/mobile.png', fullPage: true, animations: 'disabled' });
  await mobile.locator('#open-catalog').tap();
  await mobile.locator('[data-collection="补编"]').tap();
  await mobile.locator('.catalog-entry[data-poem-id="96"]').tap();
  await waitPoem(mobile, '96');
  assert.match(await mobile.locator('#poem-body').innerText(), /革命无不胜/);
  await mobile.locator('#open-notes').tap();
  await mobile.locator('#tab-versions').tap();
  assert.equal(await mobile.locator('#notes-dialog').evaluate(node => node.scrollWidth <= node.clientWidth + 1), true);
  await closeSheet(mobile, '#notes-dialog');
  await mobile.setViewportSize({ width: 320, height: 740 });
  await mobile.goto(`${origin}/#poem=31`, { waitUntil: 'networkidle' });
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.match(await mobile.locator('#poem-title').textContent(), /庐山仙人洞/);
  pass('390px touch navigation, 320px long title and reduced-motion behavior');

  const fallback = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  monitor(fallback);
  await fallback.addInitScript(() => { document.startViewTransition = undefined; });
  await fallback.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await fallback.locator('#next-poem').click();
  await waitPoem(fallback, '17');
  pass('Poetry navigation works without the View Transitions API');

  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(failedRequests, [], 'Failed assets or source documents');
  assert.deepEqual(externalRequests, [], 'Reading must not require external network assets');
  pass('No runtime errors, failed assets, or external reading requests');
  console.log(`\n${checks} browser checks passed. Desktop/mobile screenshots saved in test-results/.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
