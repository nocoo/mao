import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { verifyDeployment } from '../scripts/verify-production.mjs';
import { cdnFixtureFetch, mockCdn } from './cdn-fixtures.mjs';

if (!existsSync('dist/index.html')) throw new Error('Run pnpm build first');
const server = await preview({ preview: { host: '127.0.0.1', port: 4176, strictPort: true, open: false } });
const origin = 'http://127.0.0.1:4176';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const errors = [];

function checkSignatureGeometry() {
  const issues = [];
  const inspectColumn = (poem, selector, text, clipSelector) => {
    const root = document.querySelector(selector);
    const clip = document.querySelector(clipSelector).getBoundingClientRect();
    const cells = [...root.children];
    const characters = [...text];
    if (root.textContent !== text || cells.length !== characters.length
      || cells.some((cell, index) => cell.tagName !== 'SPAN' || cell.textContent !== characters[index])) {
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

  for (const poem of window.POEM_LIBRARY.poems) {
    history.replaceState(null, '', `#poem=${encodeURIComponent(poem.id)}`);
    dispatchEvent(new HashChangeEvent('hashchange'));
    const caption = poem.title.includes('·') ? poem.form : '诗词选读';
    const expectedTitle = poem.title.includes('·') ? poem.subject : poem.title;
    const heading = document.querySelector('#tt');
    if (heading.textContent !== expectedTitle || heading.getAttribute('aria-label') !== poem.title) issues.push(`${poem.id}: title text changed`);
    inspectColumn(poem, '.rail-title', '毛泽东诗词', '.rail');
    inspectColumn(poem, '#cp', caption, '.sheet');
    const title = document.querySelector('#title').getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const captionRect = document.querySelector('#cp').getBoundingClientRect();
    const sheet = document.querySelector('.sheet').getBoundingClientRect();
    const content = (document.querySelector('#poem .pre') || document.querySelector('#poem .st')).getBoundingClientRect();
    if (content.top - title.bottom < 27.5) issues.push(`${poem.id}: title spacing`);
    if (headingRect.left < sheet.left - .5 || headingRect.right > sheet.right + .5 || headingRect.top < sheet.top - .5 || headingRect.bottom > sheet.bottom + .5) {
      issues.push(`${poem.id}: heading clipped`);
    }
    const overlap = Math.max(0, Math.min(headingRect.right, captionRect.right) - Math.max(headingRect.left, captionRect.left))
      * Math.max(0, Math.min(headingRect.bottom, captionRect.bottom) - Math.max(headingRect.top, captionRect.top));
    if (overlap > .5) issues.push(`${poem.id}: heading and caption overlap`);
  }
  return issues;
}

try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await mockCdn(page);
  page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[1440, 900], [1920, 1080], [1024, 768], [821, 600], [900, 460], [390, 844], [320, 740], [320, 568], [800, 450]]) {
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
    const railButtonsVisible = await page.evaluate(() => {
      const rail = document.querySelector('.rail').getBoundingClientRect();
      return [...document.querySelectorAll('.rail-tools .tool')].filter(button => !button.hidden && getComputedStyle(button).display !== 'none').every(button => {
        const rect = button.getBoundingClientRect();
        return rect.top >= rail.top && rect.bottom <= rail.bottom;
      });
    });
    assert.ok(railButtonsVisible, `${width}×${height}: rail controls clipped`);
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
    await page.waitForFunction(() => document.querySelector('#audio').readyState >= 1);
    await page.locator('#audio').evaluate(audio => { audio.currentTime = Math.min(8, audio.duration / 2); });
    await page.locator('#aVert').click();
    await page.waitForFunction(() => document.querySelector('#hero').classList.contains('vertical-layout'));
    const firstLineVisible = () => page.evaluate(() => {
      const wrap = document.querySelector('#poemWrap').getBoundingClientRect();
      const first = document.querySelector('#poem .ln').getBoundingClientRect();
      return first.right <= wrap.right + 1 && first.right > wrap.left && first.left < wrap.right;
    });
    assert.ok(await firstLineVisible(), `${width}: vertical first line is off screen`);
    const verticalLayout = await page.evaluate(() => {
      const rectOf = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const rect = selector => rectOf(document.querySelector(selector));
      const wrap = document.querySelector('#poemWrap');
      const hint = document.querySelector('#verticalHint');
      const glyphs = [...document.querySelectorAll('#poem .c')];
      const first = rectOf(glyphs[0]);
      const last = rectOf(glyphs.at(-1));
      const plate = rect('.plate');
      const reader = rect('#poemWrap');
      return {
        hero: document.querySelector('#hero').classList.contains('vertical-layout'),
        pressed: document.querySelector('#aVert').getAttribute('aria-pressed'),
        writingMode: getComputedStyle(document.querySelector('#poem')).writingMode,
        fontSize: parseFloat(getComputedStyle(document.querySelector('#poem')).fontSize),
        overflowX: getComputedStyle(wrap).overflowX,
        scrollWidth: wrap.scrollWidth,
        clientWidth: wrap.clientWidth,
        tabIndex: wrap.tabIndex,
        hintText: hint?.textContent.trim() || '',
        hintVisible: Boolean(hint && hint.getClientRects().length),
        plate,
        reader,
        sheet: rect('.sheet'),
        plateCol: rect('.plate-col'),
        first,
        last,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        transitionDuration: getComputedStyle(document.querySelector('.plate')).transitionDuration,
        runningAnimations: document.querySelector('#hero').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
        curtainAnimations: document.querySelector('#curtain').getAnimations({ subtree: true }).filter(animation => animation.playState === 'running').length,
        titleOpacity: getComputedStyle(document.querySelector('#tt .ch i')).opacity,
        poemOpacity: getComputedStyle(document.querySelector('#poem .c')).opacity,
      };
    });
    assert.equal(verticalLayout.hero, true, `${width}: missing #hero.vertical-layout`);
    assert.equal(verticalLayout.pressed, 'true', `${width}: vertical toggle state`);
    assert.equal(verticalLayout.writingMode, 'vertical-rl', `${width}: vertical writing mode`);
    assert.ok(verticalLayout.fontSize >= (width <= 320 ? 22 : 24), `${width}: vertical text shrank to ${verticalLayout.fontSize}px`);
    assert.ok(['auto', 'scroll'].includes(verticalLayout.overflowX), `${width}: reader is not horizontally scrollable`);
    assert.ok(verticalLayout.scrollWidth > verticalLayout.clientWidth + 1, `${width}: long vertical poem does not overflow horizontally`);
    assert.ok(verticalLayout.tabIndex >= 0, `${width}: #poemWrap is not focusable`);
    assert.equal(verticalLayout.hintVisible, true, `${width}: vertical hint is hidden`);
    assert.match(verticalLayout.hintText, /(向左|左右|横向).*(滑动|滚动)|(滑动|滚动).*(左|横向)/, `${width}: vertical hint does not explain right-to-left horizontal scrolling`);
    assert.ok(verticalLayout.plateCol.right <= verticalLayout.sheet.left + 1, `${width}: image column is not left of text ${JSON.stringify(verticalLayout)}`);
    assert.ok(verticalLayout.plate.right <= verticalLayout.reader.left + 1, `${width}: image overlaps poem reader ${JSON.stringify(verticalLayout)}`);
    assert.ok(verticalLayout.first.right > verticalLayout.first.left && verticalLayout.first.left >= verticalLayout.reader.left, `${width}: first glyph is not visible on the right`);
    assert.ok(verticalLayout.first.left > verticalLayout.last.left, `${width}: vertical poem is not read right to left`);
    assert.equal(verticalLayout.reducedMotion, true, `${width}: reduced-motion preference was not applied`);
    assert.ok(verticalLayout.transitionDuration.split(',').every(duration => parseFloat(duration) <= .001), `${width}: reduced motion still animates layout transitions`);
    assert.equal(verticalLayout.runningAnimations, 0, `${width}: reduced motion still has running hero animations`);
    assert.equal(verticalLayout.curtainAnimations, 0, `${width}: reduced motion still animates the curtain`);
    assert.equal(verticalLayout.titleOpacity, '1', `${width}: reduced motion leaves the title hidden`);
    assert.equal(verticalLayout.poemOpacity, '1', `${width}: reduced motion leaves poem glyphs hidden`);

    const audioBefore = await page.locator('#audio').evaluate(audio => audio.currentTime);
    await page.locator('#poemWrap').focus();
    assert.equal(await page.locator('#poemWrap').evaluate(node => document.activeElement === node), true, `${width}: reader did not receive focus`);
    await page.locator('#poemWrap').evaluate(node => new Promise(resolve => {
      let previous = -1;
      let stableFrames = 0;
      const settle = () => {
        stableFrames = node.scrollWidth === previous ? stableFrames + 1 : 0;
        previous = node.scrollWidth;
        if (stableFrames >= 4) resolve(); else requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    }));
    await page.locator('#poemWrap').evaluate(node => { node.scrollLeft = 0; });
    const initialScrollLeft = await page.locator('#poemWrap').evaluate(node => node.scrollLeft);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(600);
    const leftScroll = await page.locator('#poemWrap').evaluate(node => node.scrollLeft);
    assert.ok(leftScroll < initialScrollLeft, `${width}: ArrowLeft did not scroll toward the end of the reader`);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(600);
    const rightScroll = await page.locator('#poemWrap').evaluate(node => node.scrollLeft);
    assert.ok(rightScroll > leftScroll, `${width}: ArrowRight did not scroll toward the start of the reader`);
    const audioAfter = await page.locator('#audio').evaluate(audio => audio.currentTime);
    assert.ok(Math.abs(audioAfter - audioBefore) < .05, `${width}: reader arrow keys changed audio progress from ${audioBefore} to ${audioAfter}`);

    const reachedEnd = await page.locator('#poemWrap').evaluate(node => {
      const last = [...document.querySelectorAll('#poem .ln')].at(-1);
      for (const left of [node.scrollWidth, -node.scrollWidth]) {
        node.scrollLeft = left;
        const wrap = node.getBoundingClientRect();
        const line = last.getBoundingClientRect();
        const visible = line.right > wrap.left + 1 && line.left < wrap.right - 1;
        if (visible) return { visible, scrollLeft: node.scrollLeft };
      }
      return { visible: false, scrollLeft: node.scrollLeft };
    });
    assert.equal(reachedEnd.visible, true, `${width}: long poem cannot scroll its last line into view`);
    assert.ok(Math.abs(reachedEnd.scrollLeft) > 1, `${width}: end of long poem did not move horizontally`);

    await page.locator('#nextL').evaluate(node => node.click());
    assert.ok(await firstLineVisible(), `${width}: vertical first line after navigation is off screen`);
    assert.equal(await page.locator('#hero').getAttribute('data-poem-id'), '76');
    assert.equal(await page.locator('#poemWrap').evaluate(node => node.scrollTop), 0);
    await page.locator('#aVert').click();
    await page.waitForFunction(() => !document.querySelector('#hero').classList.contains('vertical-layout'));
    const horizontalLayout = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet').getBoundingClientRect();
      const plate = document.querySelector('.plate-col').getBoundingClientRect();
      const hint = document.querySelector('#verticalHint');
      return {
        pressed: document.querySelector('#aVert').getAttribute('aria-pressed'),
        writingMode: getComputedStyle(document.querySelector('#poem')).writingMode,
        sheetBeforePlate: sheet.right <= plate.left + 1 || sheet.bottom <= plate.top + 1,
        hintVisible: Boolean(hint && hint.getClientRects().length),
      };
    });
    assert.deepEqual(horizontalLayout, { pressed: 'false', writingMode: 'horizontal-tb', sheetBeforePlate: true, hintVisible: false }, `${width}: switching back did not restore horizontal layout`);
    console.log(`✓ ${width}×${height}: fullscreen, player, vertical layout and long-poem scrolling`);
  }
  for (const [width, height] of [[1440, 900], [390, 844], [320, 740], [320, 568], [800, 450]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    for (const vertical of [false, true]) {
      const isVertical = await page.locator('#hero').evaluate(node => node.classList.contains('vertical-layout'));
      if (isVertical !== vertical) await page.locator('#aVert').evaluate(node => node.click());
      assert.deepEqual(await page.evaluate(checkSignatureGeometry), [], `${width}×${height} ${vertical ? 'vertical' : 'horizontal'} signature layout`);
    }
    console.log(`✓ ${width}×${height}: captions, glyph cells and 28px title spacing in both writing modes`);
  }
  const plateWidths = [];
  for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440]]) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/#poem=19`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    const layout = await page.evaluate(() => {
      const plate = document.querySelector('.plate');
      const rect = plate.getBoundingClientRect();
      const sheet = document.querySelector('.sheet').getBoundingClientRect();
      return { width: rect.width, left: rect.left, right: rect.right, sheetRight: sheet.right, transform: getComputedStyle(plate).transform };
    });
    assert.equal(layout.transform, 'none', `${width}: plate is not upright`);
    assert.ok(layout.left >= layout.sheetRight - 1 && layout.right <= width, `${width}: plate overlaps text or viewport`);
    plateWidths.push(layout.width);
  }
  assert.ok(plateWidths[1] > plateWidths[0] + 40 && plateWidths[2] >= plateWidths[1], `Large-screen illustration did not grow: ${plateWidths}`);
  console.log('✓ Large-screen illustrations grow without overlapping text and remain upright');

  const motionPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await mockCdn(motionPage);
  motionPage.on('pageerror', error => errors.push(error.message));
  await motionPage.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle' });
  await motionPage.waitForTimeout(1700);
  const upright = () => motionPage.locator('.plate').evaluate(node => {
    const transform = getComputedStyle(node).transform;
    return transform === 'none' || new DOMMatrix(transform).isIdentity;
  });
  assert.equal(await upright(), true, 'Plate did not settle upright after entrance');
  await motionPage.locator('.plate').hover();
  await motionPage.waitForTimeout(800);
  assert.equal(await upright(), true, 'Plate tilted on hover');
  await motionPage.locator('#aVert').click();
  const imageMotion = await motionPage.locator('.plate-col').evaluate(node => ({
    vertical: document.querySelector('#hero').classList.contains('vertical-layout'),
    running: node.getAnimations().some(animation => animation.playState === 'running' && animation.effect.getKeyframes().some(frame => /^translate\(.+px, .+px\)$/.test(frame.transform || ''))),
  }));
  assert.deepEqual(imageMotion, { vertical: true, running: true }, 'The plate did not animate into the left column');
  await motionPage.close();
  console.log('✓ Plate transition animates normally and is disabled for reduced motion');
  assert.deepEqual(errors, []);
  let revision = 'unknown';
  try { revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { }
  const metadata = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  assert.equal(metadata.revision, revision);
  if (revision !== 'unknown') await verifyDeployment(origin, revision, cdnFixtureFetch);
  assert.equal(existsSync('dist/.env'), false);
  console.log('✓ Deployment verifier and private configuration isolation');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
