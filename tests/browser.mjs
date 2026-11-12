import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

if (!existsSync('dist/index.html')) throw new Error('Run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true, open: false } });
const origin = 'http://127.0.0.1:4175';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const errors = [], failedRequests = [], externalRequests = [];
let checks = 0;
function pass(name) { console.log(`✓ ${name}`); checks++; }
function monitor(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith(origin)) externalRequests.push(request.url()); });
}
async function waitPoem(page, id) { await page.waitForFunction(value => document.querySelector('#hero').dataset.poemId === value, id); }

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  monitor(page);
  await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await waitPoem(page, '16');
  assert.match(await page.title(), /七律·长征/);
  assert.match(await page.locator('#poem').innerText(), /腾细浪/);
  assert.equal(await page.locator('.row').count(), 100);
  assert.equal(await page.locator('.cell').count(), 100);
  assert.equal(await page.locator('input[type=file]').count(), 0);
  assert.equal(await page.locator('#plArt svg').count(), 1);
  assert.deepEqual(await page.locator('#poem .st').evaluateAll(nodes => nodes.map(node => node.dataset.l)), ['首联', '颔联', '颈联', '尾联']);
  assert.equal(await page.locator('#tt .ch').count(), 2);
  assert.equal(await page.locator('#poem .term').count(), 14);
  assert.equal(await page.locator('#dt').textContent(), '一九三五年十月');
  assert.match(await page.locator('#hudForm').textContent(), /七言律诗五十六字/);
  const fontSize = await page.locator('#poem').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  assert.ok(Math.abs(fontSize - 27.12) < .1, `Prototype body size: ${fontSize}`);
  assert.deepEqual(await page.locator('#poem .c.rh').allTextContents(), ['难', '闲', '丸', '寒', '颜']);
  await page.locator('#aRhyme').click();
  assert.equal(await page.locator('#aRhyme').getAttribute('aria-pressed'), 'true');
  await page.locator('#aRhyme').click();
  await page.locator('#poem .term').first().click();
  assert.equal(await page.locator('#popK').textContent(), '远征');
  assert.match(await page.locator('#popT').textContent(), /品读版/);
  await page.locator('#popNext').click();
  assert.equal(await page.locator('#popK').textContent(), '等闲');
  assert.match(await page.locator('#popT').textContent(), /初始文本/);
  await page.keyboard.press('Escape');
  await page.locator('#aStudy').click();
  await page.locator('#study [data-note="0"]').click();
  assert.equal(await page.locator('#popK').textContent(), '等闲');
  assert.match(await page.locator('#popT').textContent(), /初始文本/);
  await page.locator('#popNext').click();
  assert.equal(await page.locator('#popK').textContent(), '乌蒙');
  await page.keyboard.press('Escape');
  await page.locator('#scroll').evaluate(node => { node.scrollTop = 0; });
  pass('Prototype title, four couplets, source-backed annotations and rhyme');
  pass('Prototype layout, all records and random placeholder art without upload');

  await page.locator('[data-filter="正编"]').click();
  assert.equal(await page.locator('.row').count(), 42);
  await page.locator('[data-filter="副编"]').click();
  assert.equal(await page.locator('.row').count(), 25);
  await page.locator('[data-filter="补编"]').click();
  assert.equal(await page.locator('.row').count(), 33);
  await page.locator('[data-filter="全部"]').click();
  await page.locator('#q').fill('万水千山只等闲');
  assert.equal(await page.locator('.row').count(), 1);
  assert.equal(await page.locator('.row').getAttribute('data-id'), '16');
  await page.locator('#q').fill('<img src=x onerror=alert(1)>');
  assert.equal(await page.locator('.row').count(), 0);
  assert.equal(await page.locator('#list img').count(), 0);
  await page.locator('#q').fill('沁园春');
  assert.equal(await page.locator('.row').count(), 2);
  await page.locator('.row[data-id="02"]').click();
  await waitPoem(page, '02');
  await page.goBack();
  await waitPoem(page, '16');
  pass('Catalog filtering, poem search, safe text and history');

  await page.locator('#tMatrix').click();
  assert.equal(await page.locator('#matrix').getAttribute('aria-hidden'), 'false');
  await page.locator('.cell[data-id="19"]').click();
  await waitPoem(page, '19');
  assert.equal(await page.locator('#matrix').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('#aRhyme').isDisabled(), true);
  assert.equal(await page.locator('#poem .st').count(), 1);
  await page.locator('#aVert').click();
  assert.equal(await page.locator('#aVert').getAttribute('aria-pressed'), 'true');
  await page.locator('#aVert').click();
  await page.locator('#tTheme').click();
  assert.ok(['night', 'paper'].includes(await page.locator('html').getAttribute('data-theme')));
  await page.keyboard.press('/');
  assert.equal(await page.locator('#q').evaluate(node => document.activeElement === node), true);
  await page.locator('#q').fill('');
  pass('Matrix, keyboard search, vertical layout and theme');

  assert.match(await page.locator('#study').innerText(), /品读版/);
  assert.match(await page.locator('#study').innerText(), /初始文本/);
  const term = page.locator('#poem .term').first();
  assert.ok(await term.count() > 0);
  await term.click();
  assert.equal(await page.locator('#pop').evaluate(node => node.classList.contains('in')), true);
  assert.ok((await page.locator('#popT').textContent()).length > 0);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pop').evaluate(node => node.classList.contains('in')), false);
  const version = page.locator('.source-disclosure').first();
  await version.locator('summary').click();
  assert.match(await version.innerText(), /北国风光/);
  const response = await page.request.get(`${origin}/${encodeURI('data/诗词/19-沁园春·雪.md')}`);
  assert.equal(response.status(), 200);
  pass('Annotations, source attribution, versions and original Markdown');

  await page.locator('#aPlay').click();
  await page.waitForFunction(() => document.querySelector('#audio').currentTime > 0, null, { timeout: 10000 });
  assert.equal(await page.locator('#audio').evaluate(audio => audio.paused), false);
  assert.match(await page.locator('#audio').getAttribute('src'), /19-/);
  await page.locator('#pp').click();
  assert.equal(await page.locator('#audio').evaluate(audio => audio.paused), true);
  await page.locator('#rate').click();
  assert.notEqual(await page.locator('#audio').evaluate(audio => audio.playbackRate), 1);
  await page.locator('#seek').fill('500');
  await page.waitForFunction(() => document.querySelector('#audio').currentTime > 10);
  await page.locator('#nextL').click();
  await waitPoem(page, '20');
  await page.waitForFunction(() => document.querySelector('#audio').readyState >= 1);
  assert.equal(await page.locator('#audio').evaluate(audio => audio.playbackRate), 1.25);
  assert.match(await page.locator('#rate').textContent(), /1.25/);
  await page.locator('#rate').click();
  assert.equal(await page.locator('#audio').evaluate(audio => audio.playbackRate), 0.8);
  await page.locator('#tMatrix').click();
  await page.locator('.cell[data-id="39"]').click();
  await waitPoem(page, '39');
  assert.equal(await page.locator('#aPlay').isDisabled(), true);
  assert.equal(await page.locator('#seek').isDisabled(), true);
  assert.match(await page.locator('#pMode').textContent(), /待|无/);
  assert.equal(await page.locator('#audio').evaluate(audio => audio.paused), true);
  pass('Real MP3 playback, pause, speed across poems, seeking and unavailable recording');

  const retry = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  let requests = 0;
  await retry.route('**/audio/*.mp3', route => ++requests === 1 ? route.fulfill({ status: 503 }) : route.continue());
  await retry.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await retry.waitForFunction(() => document.querySelector('#pMode').textContent === '录音异常');
  await retry.locator('#aPlay').click();
  await retry.waitForFunction(() => document.querySelector('#audio').currentTime > 0, null, { timeout: 10000 });
  assert.ok(requests >= 2);
  await retry.close();
  pass('Recording retry recovers from a temporary HTTP failure');

  const allIssues = await page.evaluate(() => {
    const normalize = text => text.replace(/\s/g, '').replace(/,/g, '，').replace(/\./g, '。');
    const issues = [];
    for (const poem of window.POEM_LIBRARY.poems) {
      history.replaceState(null, '', `#poem=${encodeURIComponent(poem.id)}`);
      dispatchEvent(new HashChangeEvent('hashchange'));
      if (document.querySelector('#hero').dataset.poemId !== poem.id) issues.push(`${poem.id}: selection`);
      if (normalize([...document.querySelectorAll('#poem .st')].map(node => node.textContent).join('')) !== normalize(poem.body.join(''))) issues.push(`${poem.id}: body changed`);
      const title = document.querySelector('#tt').getBoundingClientRect();
      const sheet = document.querySelector('.sheet').getBoundingClientRect();
      const reader = document.querySelector('#poemWrap').getBoundingClientRect();
      if (title.right > sheet.right + 1 || reader.height < 60) issues.push(`${poem.id}: title or reader layout`);
    }
    return issues;
  });
  assert.deepEqual(allIssues, []);
  pass('All 100 texts render completely without rewritten characters');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  monitor(mobile);
  await mobile.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await mobile.locator('#tIndex').tap();
  await mobile.locator('[data-filter="补编"]').tap();
  await mobile.locator('.row[data-id="96"]').tap();
  await waitPoem(mobile, '96');
  assert.match(await mobile.locator('#poem').innerText(), /革命无不胜/);
  assert.equal(await mobile.locator('#index').evaluate(node => node.inert), true);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  pass('Mobile touch catalog and reading');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(failedRequests, [], 'Failed assets');
  assert.deepEqual(externalRequests, [], 'Unexpected external requests');
  console.log(`\n${checks} browser checks passed.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
