import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';

if (!existsSync('dist/index.html')) throw new Error('Run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true, open: false } });
const origin = 'http://127.0.0.1:4175';
const analyses = Object.fromEntries(readdirSync('data/analysis').filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(readFileSync(`data/analysis/${name}`, 'utf8'))]));
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

function checkVerticalGeometry() {
  const issues = [];
  for (const poem of window.POEM_LIBRARY.poems) {
    history.replaceState(null, '', `#poem=${encodeURIComponent(poem.id)}`);
    dispatchEvent(new HashChangeEvent('hashchange'));
    const wrap = document.querySelector('#poemWrap');
    const reader = wrap.getBoundingClientRect();
    const sheet = document.querySelector('.sheet').getBoundingClientRect();
    const image = document.querySelector('.plate-col').getBoundingClientRect();
    const glyphs = [...document.querySelectorAll('#poem .st .c')];
    if (image.right > sheet.left + 1) issues.push(`${poem.id}: image overlap`);
    if (parseFloat(getComputedStyle(document.querySelector('#poem')).fontSize) < 24) issues.push(`${poem.id}: font size`);
    for (const selector of ['#tt', '#dt', '#author']) {
      const rect = document.querySelector(selector).getBoundingClientRect();
      if (rect.left < sheet.left - 1 || rect.right > sheet.right + 1) issues.push(`${poem.id}: ${selector} clipped`);
    }
    if (glyphs.some(glyph => { const rect = glyph.getBoundingClientRect(); return rect.top < reader.top - 1 || rect.bottom > reader.bottom + 1; })) issues.push(`${poem.id}: verse clipped vertically`);
    for (const clause of document.querySelectorAll('#poem .cl')) {
      if (!clause.textContent.trim() || /^[，。；：？！、]+$/.test(clause.textContent.trim())) issues.push(`${poem.id}: orphan punctuation column`);
      const characters = [...clause.querySelectorAll('.c')];
      for (let index = 1; index < characters.length; index++) {
        if (!/^[，。；：？！、]$/.test(characters[index].textContent)) continue;
        const previous = characters[index - 1].getBoundingClientRect();
        const current = characters[index].getBoundingClientRect();
        if (Math.abs((previous.left + previous.right - current.left - current.right) / 2) > 5) issues.push(`${poem.id}: punctuation wrapped alone`);
      }
    }
    const preface = document.querySelector('#poem .pre')?.firstChild;
    if (preface) for (let index = 0; index < preface.length; index++) {
      if (/\s/.test(preface.data[index])) continue;
      const range = document.createRange();
      range.setStart(preface, index);
      range.setEnd(preface, index + 1);
      const rect = range.getBoundingClientRect();
      if (rect.top < reader.top - 1 || rect.bottom > reader.bottom + 1) { issues.push(`${poem.id}: preface clipped vertically`); break; }
    }
    if (!poem.preface && glyphs.length) {
      const first = glyphs[0].getBoundingClientRect();
      if (first.left < reader.left - 1 || first.right > reader.right + 1) issues.push(`${poem.id}: first verse not visible`);
    }
    wrap.scrollLeft = -1e7;
    const last = glyphs.at(-1)?.getBoundingClientRect();
    if (!last || last.left < reader.left - 1 || last.right > reader.right + 1) issues.push(`${poem.id}: ending not reachable`);
  }
  return issues;
}

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
  assert.equal(await page.locator('#aRhyme').isEnabled(), true);
  assert.deepEqual(await page.locator('#poem .st').evaluateAll(nodes => nodes.map(node => node.dataset.l)), ['上阕', '下阕']);
  assert.deepEqual(await page.locator('#poem .c.rh').allTextContents(), ['飘', '滔', '高', '娆', '娇', '腰', '骚', '雕', '朝']);
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

  await page.goto(`${origin}/#poem=49`, { waitUntil: 'networkidle' });
  await waitPoem(page, '49');
  assert.deepEqual(await page.locator('#poem .c.rh').allTextContents(), ['前', '边', '元', '联', '妍']);
  await page.locator('#poem .term').filter({ hasText: '颜斶' }).click();
  assert.match(await page.locator('#popT').textContent(), /战国时齐国人/);
  await page.keyboard.press('Escape');
  await page.goto(`${origin}/#poem=63`, { waitUntil: 'networkidle' });
  await waitPoem(page, '63');
  assert.deepEqual(await page.locator('#poem .c.rh').allTextContents(), ['才', '哀', '台', '猜', '埃']);
  await page.locator('#poem .term').filter({ hasText: '汩罗' }).click();
  assert.match(await page.locator('#popT').textContent(), /原文末尾另列数字：28/);
  await page.keyboard.press('Escape');
  await page.goto(`${origin}/#poem=13`, { waitUntil: 'networkidle' });
  await waitPoem(page, '13');
  assert.match(await page.locator('#aRhyme').getAttribute('title'), /下阕.*待核/);
  assert.match(await page.locator('#study').textContent(), /下阕.*待核/);
  pass('Rhyme positions within combined lines and source-bound annotations');

  const motion = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  monitor(motion);
  await motion.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  const movement = await motion.evaluate(() => {
    const plate = document.querySelector('.plate-col');
    const initial = plate.getBoundingClientRect().left;
    document.querySelector('#aVert').click();
    const animation = plate.getAnimations().find(item => item.effect.getKeyframes().some(frame => frame.transform?.startsWith('translate')));
    if (!animation) return null;
    animation.pause();
    animation.currentTime = 0;
    const start = plate.getBoundingClientRect().left;
    animation.currentTime = 260;
    const middle = plate.getBoundingClientRect().left;
    animation.finish();
    const end = plate.getBoundingClientRect().left;
    return { initial, start, middle, end, sheet: document.querySelector('.sheet').getBoundingClientRect().left };
  });
  assert.ok(movement && Math.abs(movement.initial - movement.start) < 1);
  assert.ok(movement.middle < movement.start && movement.end < movement.middle && movement.end < movement.sheet);
  await motion.close();
  pass('Illustration animates from right to left when vertical reading opens');

  const allIssues = await page.evaluate(analysesById => {
    const normalize = text => text.replace(/\s/g, '').replace(/,/g, '，').replace(/\./g, '。');
    const issues = [];
    for (const poem of window.POEM_LIBRARY.poems) {
      history.replaceState(null, '', `#poem=${encodeURIComponent(poem.id)}`);
      dispatchEvent(new HashChangeEvent('hashchange'));
      if (document.querySelector('#hero').dataset.poemId !== poem.id) issues.push(`${poem.id}: selection`);
      const analysis = analysesById[poem.id];
      const sections = [...document.querySelectorAll('#poem .st')];
      if (normalize(sections.map(node => node.textContent).join('')) !== normalize(poem.body.join(''))) issues.push(`${poem.id}: body changed`);
      if (sections.map(node => node.dataset.l).join('|') !== analysis.structure.stanzas.map(part => part.label).join('|')) issues.push(`${poem.id}: structure`);
      const terms = [...document.querySelectorAll('#poem .term')];
      if (terms.length !== analysis.inlineTerms.length || terms.some((term, index) => Number(term.dataset.note) !== index)) issues.push(`${poem.id}: inline annotations`);
      const expectedRhymes = analysis.structure.rhymeMarks.map(mark => mark.character).join('');
      if ([...document.querySelectorAll('#poem .c.rh')].map(node => node.textContent).join('') !== expectedRhymes) issues.push(`${poem.id}: rhyme markers`);
      const title = document.querySelector('#tt').getBoundingClientRect();
      const sheet = document.querySelector('.sheet').getBoundingClientRect();
      const reader = document.querySelector('#poemWrap').getBoundingClientRect();
      if (title.right > sheet.right + 1 || reader.height < 60) issues.push(`${poem.id}: title or reader layout`);
    }
    return issues;
  }, analyses);
  assert.deepEqual(allIssues, []);
  pass('All 100 texts, structural sections, inline notes and rhyme markers render correctly');
  await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await page.locator('#aVert').click();
  assert.deepEqual(await page.evaluate(checkVerticalGeometry), []);
  pass('All 100 vertical layouts keep large, unclipped and horizontally reachable text');

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
  await mobile.goto(`${origin}/#poem=75`, { waitUntil: 'networkidle' });
  await mobile.locator('#aVert').tap();
  const area = await mobile.locator('#poemWrap').boundingBox();
  const image = await mobile.locator('.plate-col').boundingBox();
  const sheet = await mobile.locator('.sheet').boundingBox();
  assert.ok(image.x + image.width <= sheet.x + 1);
  assert.ok(parseFloat(await mobile.locator('#poem').evaluate(node => getComputedStyle(node).fontSize)) >= 24);
  assert.match(await mobile.locator('#verticalHint').textContent(), /横向滑动/);
  const cdp = await mobile.context().newCDPSession(mobile);
  const y = Math.round(area.y + Math.min(120, area.height / 2));
  const x = Math.round(area.x + 25);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let position = x + 20; position <= x + 120; position += 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: position, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#poemWrap').scrollLeft < 0);
  await mobile.locator('#tVert').tap();
  assert.equal(await mobile.locator('#hero').evaluate(node => node.classList.contains('vertical-layout')), false);
  assert.equal(await mobile.locator('#verticalHint').isHidden(), true);
  await mobile.setViewportSize({ width: 320, height: 568 });
  await mobile.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await mobile.locator('#aVert').tap();
  assert.deepEqual(await mobile.evaluate(checkVerticalGeometry), []);
  pass('Mobile touch catalog, vertical swipe and return to horizontal reading');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(failedRequests, [], 'Failed assets');
  assert.deepEqual(externalRequests, [], 'Unexpected external requests');
  console.log(`\n${checks} browser checks passed.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
