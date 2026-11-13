import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { isCdnUrl, mockCdn } from './cdn-fixtures.mjs';

if (!existsSync('dist/index.html')) throw new Error('Run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 4175, strictPort: true, open: false } });
const origin = 'http://127.0.0.1:4175';
const analyses = Object.fromEntries(readdirSync('data/analysis').filter(name => name.endsWith('.json')).map(name => [name.slice(0, -5), JSON.parse(readFileSync(`data/analysis/${name}`, 'utf8'))]));
const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const illustrations = JSON.parse(readFileSync('data/illustrations.json', 'utf8'));
const illustrationUrl = illustrations['19'];
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const errors = [], failedRequests = [], externalRequests = [];
let checks = 0, interceptedIllustrations = 0;
function pass(name) { console.log(`✓ ${name}`); checks++; }
async function monitor(page) {
  await mockCdn(page, url => { if (Object.values(illustrations).includes(url)) interceptedIllustrations++; });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !isCdnUrl(request.url()) && !request.url().startsWith(origin)) externalRequests.push(request.url());
  });
}
async function waitPoem(page, id) { await page.waitForFunction(value => document.querySelector('#hero').dataset.poemId === value, id); }
async function assertGeneratedIllustration(page, id = '19', title = '沁园春·雪') {
  const image = page.locator('#plArt img');
  await image.waitFor({ state: 'attached' });
  await image.evaluate(node => node.decode());
  assert.equal(await image.getAttribute('src'), illustrations[id]);
  assert.equal(await image.getAttribute('alt'), `《${title}》配图`);
  assert.equal(await page.locator('#plArt svg').count(), 0);
  const loaded = await image.evaluate(node => ({ complete: node.complete, width: node.naturalWidth, height: node.naturalHeight }));
  assert.equal(loaded.complete, true);
  assert.ok(loaded.width > 0 && loaded.height > 0);
  assert.equal(await page.locator('#plTag').count(), 0);
  assert.equal(await page.locator('#plCap').textContent(), `《${title}》`);
}
async function assertPlaceholderIllustration(page, title) {
  assert.equal(await page.locator('#plArt img').count(), 0);
  assert.equal(await page.locator('#plArt svg').count(), 1);
  assert.equal(await page.locator('#plTag').count(), 0);
  assert.equal(await page.locator('#plCap').textContent(), `《${title}》`);
}
function animationMilliseconds(value) {
  const first = value.split(',')[0].trim();
  return parseFloat(first) * (first.endsWith('ms') ? 1 : 1000);
}
function assertNumbering(node, expected) {
  const message = `${expected}: numbering`;
  assert.equal(node.curtain, expected, message);
  assert.equal(node.hud, expected, message);
  assert.equal(node.plate, expected, message);
  assert.equal(node.background, expected, message);
}

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
  const entry = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await monitor(entry);
  let releaseEntry;
  const entryGate = new Promise(resolve => { releaseEntry = resolve; });
  await entry.route('**/assets/index-*.js', async route => { await entryGate; await route.continue(); });
  const entryNavigation = entry.goto(`${origin}/#poem=16`, { waitUntil: 'domcontentloaded' });
  await entry.waitForSelector('#curtain.loading', { state: 'attached' });
  assert.equal(await entry.locator('#curtain').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
  releaseEntry();
  await entryNavigation;
  await entry.waitForFunction(() => document.querySelector('#curtain')?.classList.contains('boot'));
  await waitPoem(entry, '16');
  await entry.waitForFunction(() => document.querySelector('#hero')?.classList.contains('enter'));
  const entryState = await entry.evaluate(() => {
    const hero = document.querySelector('#hero');
    const title = [...document.querySelectorAll('#tt .ch i')];
    const lines = [...document.querySelectorAll('#poem .ln')].map(line => [...line.querySelectorAll('.c')]);
    const inspect = nodes => nodes.map(node => {
      const style = getComputedStyle(node);
      return {
        name: style.animationName,
        duration: style.animationDuration,
        delay: style.animationDelay,
        running: node.getAnimations().some(animation => animation.playState === 'running'),
      };
    });
    return {
      numbering: {
        curtain: document.querySelector('#curNo').textContent,
        hud: document.querySelector('#hudNo').textContent,
        plate: document.querySelector('#plNo').textContent,
        background: document.querySelector('#bignum').textContent,
      },
      entering: hero.classList.contains('enter'),
      title: inspect(title),
      body: lines.map(inspect),
      curtain: document.querySelector('#curtain').getAnimations().some(animation => animation.playState === 'running'),
    };
  });
  assertNumbering(entryState.numbering, '016');
  assert.equal(entryState.entering, true);
  assert.equal(entryState.curtain, true, 'Initial curtain should visibly boot away');
  assert.ok(entryState.title.length > 1);
  assert.ok(entryState.title.every(glyph => glyph.name !== 'none' && animationMilliseconds(glyph.duration) > 0 && glyph.running));
  for (let index = 1; index < entryState.title.length; index++) {
    assert.ok(animationMilliseconds(entryState.title[index].delay) > animationMilliseconds(entryState.title[index - 1].delay));
  }
  assert.ok(entryState.body.flat().length > 20);
  assert.ok(entryState.body.flat().every(glyph => glyph.name !== 'none' && animationMilliseconds(glyph.duration) > 0 && glyph.running));
  for (const line of entryState.body) for (let index = 1; index < line.length; index++) {
    assert.ok(animationMilliseconds(line[index].delay) >= animationMilliseconds(line[index - 1].delay), 'Poem stagger regressed within a line');
  }
  await entry.waitForTimeout(1200);

  await entry.locator('#aPlay').click();
  await entry.waitForFunction(() => document.querySelector('#audio').currentTime > 0, null, { timeout: 10000 });
  const firstTransition = await entry.evaluate(async () => {
    const hero = document.querySelector('#hero');
    const before = hero.dataset.poemId;
    const start = performance.now();
    document.querySelector('#nextL').click();
    const immediate = {
      run: document.querySelector('#curtain').classList.contains('run'),
      paused: document.querySelector('#audio').paused,
      number: document.querySelector('#curNo').textContent,
    };
    await new Promise(resolve => {
      if (hero.dataset.poemId !== before) return resolve();
      const observer = new MutationObserver(() => {
        if (hero.dataset.poemId === before) return;
        observer.disconnect();
        resolve();
      });
      observer.observe(hero, { attributes: true, attributeFilter: ['data-poem-id'] });
    });
    return { elapsed: performance.now() - start, before, after: hero.dataset.poemId, immediate };
  });
  assert.deepEqual({ before: firstTransition.before, after: firstTransition.after }, { before: '16', after: '17' });
  assert.equal(firstTransition.immediate.run, true);
  assert.equal(firstTransition.immediate.paused, true);
  assert.equal(firstTransition.immediate.number, '017');
  assert.ok(firstTransition.elapsed >= 350 && firstTransition.elapsed <= 2000, `Transition switched after ${firstTransition.elapsed.toFixed(1)}ms`);
  assertNumbering(await entry.evaluate(() => ({
    curtain: document.querySelector('#curNo').textContent,
    hud: document.querySelector('#hudNo').textContent,
    plate: document.querySelector('#plNo').textContent,
    background: document.querySelector('#bignum').textContent,
  })), '017');
  await entry.waitForFunction(() => document.querySelector('#hero').classList.contains('enter'));
  assert.ok(await entry.locator('#tt .ch i').first().evaluate(node => node.getAnimations().some(animation => animation.playState === 'running')));
  await entry.waitForTimeout(1200);

  await entry.evaluate(() => {
    const next = document.querySelector('#nextL');
    next.click(); next.click(); next.click();
  });
  await waitPoem(entry, '20');
  assert.equal(await entry.locator('#audio').evaluate(node => node.paused), true);
  assert.match(await entry.locator('#audio').getAttribute('src'), /20-/);
  await entry.locator('#aPlay').click();
  await entry.waitForFunction(() => document.querySelector('#audio').currentTime > 0, null, { timeout: 10000 });
  await entry.goBack();
  await waitPoem(entry, '19');
  await entry.waitForTimeout(700);
  assert.equal(await entry.locator('#hero').getAttribute('data-poem-id'), '19', 'A stale transition won after browser back');
  assert.equal(await entry.locator('#audio').evaluate(node => node.paused), true);
  assert.match(await entry.locator('#audio').getAttribute('src'), /19-/);
  assertNumbering(await entry.evaluate(() => ({
    curtain: document.querySelector('#curNo').textContent,
    hud: document.querySelector('#hudNo').textContent,
    plate: document.querySelector('#plNo').textContent,
    background: document.querySelector('#bignum').textContent,
  })), '019');
  await entry.close();

  const illustration = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await monitor(illustration);
  await illustration.goto(`${origin}/#poem=40`, { waitUntil: 'networkidle' });
  await waitPoem(illustration, '40');
  await assertPlaceholderIllustration(illustration, '五古·挽易昌陶');
  for (const id of ['19', '40', '19']) {
    await illustration.evaluate(value => { location.hash = `poem=${encodeURIComponent(value)}`; }, id);
    await waitPoem(illustration, id);
    if (id === '19') await assertGeneratedIllustration(illustration);
    else await assertPlaceholderIllustration(illustration, '五古·挽易昌陶');
  }
  for (const [id, title] of [
    ['01', '贺新郎·别友'], ['02', '沁园春·长沙'], ['03', '菩萨蛮·黄鹤楼'], ['04', '西江月·井冈山'], ['05', '清平乐·蒋桂战争'],
    ['06', '采桑子·重阳'], ['07', '如梦令·元旦'], ['08', '减字木兰花·广昌路上'], ['09', '蝶恋花·从汀州向长沙'], ['10', '渔家傲·反第一次大“围剿”'],
    ['11', '渔家傲·反第二次大“围剿”'], ['12', '菩萨蛮·大柏地'], ['13', '清平乐·会昌'], ['14-1', '十六字令三首（其一）'], ['14-2', '十六字令三首（其二）'],
    ['14-3', '十六字令三首（其三）'], ['15', '忆秦娥·娄山关'], ['16', '七律·长征'], ['17', '念奴娇·昆仑'], ['18', '清平乐·六盘山'],
  ]) {
    await illustration.evaluate(value => { location.hash = `poem=${encodeURIComponent(value)}`; }, id);
    await waitPoem(illustration, id);
    await assertGeneratedIllustration(illustration, id, title);
  }
  await illustration.close();

  const directIllustration = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await monitor(directIllustration);
  await directIllustration.goto(`${origin}/#poem=19`, { waitUntil: 'networkidle' });
  await waitPoem(directIllustration, '19');
  await assertGeneratedIllustration(directIllustration);
  await directIllustration.reload({ waitUntil: 'networkidle' });
  await waitPoem(directIllustration, '19');
  await assertGeneratedIllustration(directIllustration);
  await directIllustration.close();

  const failedIllustration = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await monitor(failedIllustration);
  await failedIllustration.route(illustrationUrl, route => route.abort());
  await failedIllustration.goto(`${origin}/#poem=19`, { waitUntil: 'networkidle' });
  assert.equal(await failedIllustration.locator('#plArt .pl-error').textContent(), '配图暂时无法加载');
  assert.equal(await failedIllustration.locator('#plArt svg').count(), 0);
  await failedIllustration.evaluate(() => { location.hash = 'poem=40'; });
  await waitPoem(failedIllustration, '40');
  await assertPlaceholderIllustration(failedIllustration, '五古·挽易昌陶');
  await failedIllustration.unroute(illustrationUrl);
  await failedIllustration.evaluate(() => { location.hash = 'poem=19'; });
  await waitPoem(failedIllustration, '19');
  await assertGeneratedIllustration(failedIllustration);
  await failedIllustration.close();
  pass('Generated illustration switches, reloads and reports download failures');

  const compactEntry = await browser.newPage({ viewport: { width: 320, height: 568 }, reducedMotion: 'no-preference' });
  await monitor(compactEntry);
  await compactEntry.goto(`${origin}/#poem=14-1`, { waitUntil: 'domcontentloaded' });
  await compactEntry.waitForFunction(() => document.querySelector('#curtain').classList.contains('boot'));
  await waitPoem(compactEntry, '14-1');
  await assertGeneratedIllustration(compactEntry, '14-1', '十六字令三首（其一）');
  const compactCurtain = await compactEntry.evaluate(() => {
    const animation = document.querySelector('#curtain').getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
    const content = document.querySelector('.cur-in').getBoundingClientRect();
    const stage = document.querySelector('.stage').getBoundingClientRect();
    return { text: document.querySelector('#curNo').textContent, left: content.left, right: content.right, stageLeft: stage.left, stageRight: stage.right };
  });
  assert.equal(compactCurtain.text, '14-1');
  assert.ok(compactCurtain.left >= compactCurtain.stageLeft && compactCurtain.right <= compactCurtain.stageRight);
  await compactEntry.close();
  pass('Curtain boot, exact numbering, character stagger, 480ms transitions and navigation ordering');

  const reduced = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await monitor(reduced);
  await reduced.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await waitPoem(reduced, '16');
  const reducedInitial = await reduced.evaluate(() => ({
    visible: document.querySelector('#hero').getClientRects().length > 0,
    titleOpacity: getComputedStyle(document.querySelector('#tt .ch i')).opacity,
    poemOpacity: getComputedStyle(document.querySelector('#poem .c')).opacity,
    animations: document.querySelector('#hero').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
    curtainAnimations: document.querySelector('#curtain').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
  }));
  assert.deepEqual(reducedInitial, { visible: true, titleOpacity: '1', poemOpacity: '1', animations: 0, curtainAnimations: 0 });
  const reducedSwitch = await reduced.evaluate(async () => {
    const hero = document.querySelector('#hero');
    const start = performance.now();
    document.querySelector('#nextL').click();
    while (hero.dataset.poemId !== '17') await new Promise(requestAnimationFrame);
    return {
      elapsed: performance.now() - start,
      run: document.querySelector('#curtain').classList.contains('run'),
      animations: hero.getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
    };
  });
  assert.ok(reducedSwitch.elapsed < 250, `Reduced-motion navigation took ${reducedSwitch.elapsed.toFixed(1)}ms`);
  assert.deepEqual({ run: reducedSwitch.run, animations: reducedSwitch.animations }, { run: false, animations: 0 });
  await reduced.close();

  const motionChange = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await monitor(motionChange);
  await motionChange.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await motionChange.evaluate(() => document.querySelector('#nextL').click());
  assert.equal(await motionChange.locator('#curtain').evaluate(node => node.classList.contains('run')), true);
  await motionChange.emulateMedia({ reducedMotion: 'reduce' });
  await waitPoem(motionChange, '17');
  assert.equal(await motionChange.locator('#curtain').evaluate(node => node.classList.contains('run')), false);
  assert.equal(await motionChange.locator('#hero').evaluate(node => node.classList.contains('enter')), false);
  await motionChange.close();
  pass('Reduced-motion entry and poem changes render immediately without animation');

  const loadFailure = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await mockCdn(loadFailure);
  let stalledDependency;
  await loadFailure.route('**/assets/index-*.js', route => { stalledDependency = route; });
  await loadFailure.goto(`${origin}/#poem=16`, { waitUntil: 'commit' });
  await loadFailure.waitForSelector('#curtain.loading', { state: 'attached' });
  await loadFailure.waitForSelector('#loadError:not([hidden])', { state: 'visible', timeout: 12000 });
  const loadError = await loadFailure.locator('#loadError').textContent();
  assert.match(loadError, /(加载|载入).*(失败|异常|超时)|请.*(刷新|重试)/);
  await stalledDependency?.abort();
  await loadFailure.close();
  const noScript = await browser.newPage({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  await mockCdn(noScript);
  await noScript.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.equal(await noScript.locator('#curtain').isVisible(), false);
  assert.equal(await noScript.locator('noscript .load-error').isVisible(), true);
  await noScript.close();
  pass('Initial dependency timeout and disabled JavaScript expose recovery guidance');

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await monitor(page);
  await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await waitPoem(page, '16');
  assert.match(await page.title(), /七律·长征/);
  assert.match(await page.locator('#poem').innerText(), /腾细浪/);
  assert.equal(await page.locator('.row').count(), 100);
  assert.equal(await page.locator('#appVersion').textContent(), `v${packageVersion}`);
  assert.equal(await page.locator('.cell').count(), 100);
  assert.equal(await page.locator('input[type=file]').count(), 0);
  await assertGeneratedIllustration(page, '16', '七律·长征');
  assert.deepEqual(await page.locator('#poem .st').evaluateAll(nodes => nodes.map(node => node.dataset.l)), ['首联', '颔联', '颈联', '尾联']);
  assert.equal(await page.locator('#tt .ch').count(), 2);
  assert.equal(await page.locator('#poem .term').count(), 14);
  assert.equal(await page.locator('#dt').textContent(), '一九三五年十月');
  assert.match(await page.locator('#hudForm').textContent(), /七言律诗五十六字/);
  const fontSize = await page.locator('#poem').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  assert.equal(fontSize, 26, `Fixed desktop body size: ${fontSize}`);
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
  await mockCdn(retry);
  await retry.route('**/audio/*.mp3', route => ++requests === 1 ? route.fulfill({ status: 503 }) : route.fallback());
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
  await monitor(motion);
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

  const allIssues = await page.evaluate(({ analysesById, illustrationsById }) => {
    const normalize = text => text.replace(/\s/g, '').replace(/,/g, '，').replace(/\./g, '。');
    const issues = [];
    for (const poem of window.POEM_LIBRARY.poems) {
      history.replaceState(null, '', `#poem=${encodeURIComponent(poem.id)}`);
      dispatchEvent(new HashChangeEvent('hashchange'));
      if (document.querySelector('#hero').dataset.poemId !== poem.id) issues.push(`${poem.id}: selection`);
      const generated = Object.hasOwn(illustrationsById, poem.id);
      const art = document.querySelector('#plArt');
      if (Boolean(art.querySelector('img')) !== generated || Boolean(art.querySelector('svg')) === generated) issues.push(`${poem.id}: illustration type`);
      if (document.querySelector('#plTag')) issues.push(`${poem.id}: illustration tag still present`);
      if (document.querySelector('#plCap').textContent !== `《${poem.title}》`) issues.push(`${poem.id}: illustration caption`);
      const analysis = analysesById[poem.id];
      const sections = [...document.querySelectorAll('#poem .st')];
      if (normalize(sections.map(node => node.textContent).join('')) !== normalize(poem.body.join(''))) issues.push(`${poem.id}: body changed`);
      if (sections.map(node => node.dataset.l).join('|') !== analysis.structure.stanzas.map(part => part.label).join('|')) issues.push(`${poem.id}: structure`);
      const terms = [...document.querySelectorAll('#poem .term')];
      if (terms.length !== analysis.inlineTerms.length || terms.some((term, index) => Number(term.dataset.note) !== index)) issues.push(`${poem.id}: inline annotations`);
      const expectedRhymes = analysis.structure.rhymeMarks.map(mark => mark.character).join('');
      if ([...document.querySelectorAll('#poem .c.rh')].map(node => node.textContent).join('') !== expectedRhymes) issues.push(`${poem.id}: rhyme markers`);
      const caption = poem.title.includes('·') ? poem.form : '诗词选读';
      const expectedTitle = poem.title.includes('·') ? poem.subject : poem.title;
      const heading = document.querySelector('#tt');
      if (heading.textContent !== expectedTitle || heading.getAttribute('aria-label') !== poem.title) issues.push(`${poem.id}: title text changed`);
      const inspectColumn = (selector, text, clipSelector) => {
        const root = document.querySelector(selector);
        const clip = document.querySelector(clipSelector).getBoundingClientRect();
        const cells = [...root.children];
        const characters = [...text];
        if (root.textContent !== text || cells.length !== characters.length || cells.some((cell, index) => cell.tagName !== 'SPAN' || cell.textContent !== characters[index])) {
          issues.push(`${poem.id}: ${selector} text or cells changed`);
        }
        for (let index = 0; index < cells.length; index++) {
          const cell = cells[index];
          const rect = cell.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0 || cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1
            || rect.left < clip.left - .5 || rect.right > clip.right + .5 || rect.top < clip.top - .5 || rect.bottom > clip.bottom + .5
            || getComputedStyle(cell).writingMode !== 'horizontal-tb') issues.push(`${poem.id}: ${selector} cell ${index} clipped`);
          if (index) {
            const previous = cells[index - 1].getBoundingClientRect();
            const overlap = Math.max(0, Math.min(previous.right, rect.right) - Math.max(previous.left, rect.left))
              * Math.max(0, Math.min(previous.bottom, rect.bottom) - Math.max(previous.top, rect.top));
            if (overlap > .5 || rect.top < previous.bottom - .5
              || Math.abs((previous.left + previous.right - rect.left - rect.right) / 2) > .5) issues.push(`${poem.id}: ${selector} cells overlap or misalign`);
          }
        }
      };
      inspectColumn('.rail-title', '毛泽东诗词', '.rail');
      inspectColumn('#cp', caption, '.sheet');
      const titleBlock = document.querySelector('#title').getBoundingClientRect();
      const firstContent = (document.querySelector('#poem .pre') || document.querySelector('#poem .st')).getBoundingClientRect();
      if (firstContent.top - titleBlock.bottom < 27.5) issues.push(`${poem.id}: title spacing`);
      const title = heading.getBoundingClientRect();
      const sheet = document.querySelector('.sheet').getBoundingClientRect();
      const reader = document.querySelector('#poemWrap').getBoundingClientRect();
      if (title.right > sheet.right + 1 || reader.height < 60) issues.push(`${poem.id}: title or reader layout`);
    }
    return issues;
  }, { analysesById: analyses, illustrationsById: illustrations });
  assert.deepEqual(allIssues, []);
  pass('All 100 texts, structural sections, inline notes and rhyme markers render correctly');
  await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await page.locator('#aVert').click();
  assert.deepEqual(await page.evaluate(checkVerticalGeometry), []);
  pass('All 100 vertical layouts keep large, unclipped and horizontally reachable text');

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await monitor(mobile);
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
  await mobile.evaluate(() => {
    window.testScrollEnded = false;
    document.querySelector('#poemWrap').addEventListener('scrollend', () => { window.testScrollEnded = true; }, { once: true });
  });
  const y = Math.round(area.y + Math.min(120, area.height / 2));
  const x = Math.round(area.x + 25);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let position = x + 20; position <= x + 120; position += 20) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: position, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await mobile.waitForFunction(() => document.querySelector('#poemWrap').scrollLeft < 0 && window.testScrollEnded);
  await mobile.locator('#tVert').tap();
  await mobile.waitForFunction(() => !document.querySelector('#hero').classList.contains('vertical-layout'));
  assert.equal(await mobile.locator('#verticalHint').isHidden(), true);
  await mobile.setViewportSize({ width: 320, height: 568 });
  await mobile.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await mobile.locator('#aVert').tap();
  assert.deepEqual(await mobile.evaluate(checkVerticalGeometry), []);
  pass('Mobile touch catalog, vertical swipe and return to horizontal reading');
  assert.deepEqual(errors, [], 'Browser runtime errors');
  assert.deepEqual(failedRequests, [], 'Failed assets');
  assert.deepEqual(externalRequests, [], 'Unexpected external requests');
  assert.ok(interceptedIllustrations > 0, 'Expected the generated illustration request to be intercepted');
  console.log(`\n${checks} browser checks passed.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
