import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/player.js';

class FakeClassList {
  #values = new Set();

  toggle(name, force) {
    if (force) this.#values.add(name);
    else this.#values.delete(name);
  }

  contains(name) {
    return this.#values.has(name);
  }
}

class FakeNode {
  constructor() {
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.disabled = false;
    this.listeners = new Map();
    this.style = {};
    this.textContent = '';
    this.value = '0';
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type, target: this });
  }

  click() {
    this.dispatch('click');
  }

  querySelector() {
    return null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'src') this.src = '';
  }
}

class FakeAudio extends FakeNode {
  constructor() {
    super();
    this.currentTime = 0;
    this.duration = NaN;
    this.ended = false;
    this.error = null;
    this.loadCalls = 0;
    this.paused = true;
    this.playCalls = 0;
    this.playbackRate = 1;
    this.playResult = undefined;
    this.src = '';
  }

  load() {
    this.loadCalls += 1;
  }

  pause() {
    if (!this.paused) {
      this.paused = true;
      this.dispatch('pause');
    }
  }

  play() {
    this.playCalls += 1;
    if (this.playResult instanceof Error) return Promise.reject(this.playResult);
    this.paused = false;
    this.ended = false;
    this.dispatch('play');
    return Promise.resolve();
  }
}

function fixture() {
  const ids = ['app', 'pp', 'aPlay', 'aPlayT', 'rate', 'pMode', 'pIdx', 'pLine', 'ring', 'seek', 'prevL', 'nextL', 'audio'];
  const nodes = Object.fromEntries(ids.map(id => [id, id === 'audio' ? new FakeAudio() : new FakeNode()]));
  globalThis.document = {
    baseURI: 'https://example.test/reader/index.html',
    getElementById(id) { return nodes[id] || null; },
  };
  return nodes;
}

const poem = (audio = null) => ({ id: '01', title: '贺新郎·别友', audio });

function ready(nodes, seconds = 120) {
  nodes.audio.duration = seconds;
  nodes.audio.dispatch('loadedmetadata');
}

test('缺少录音时暂停、清空源并禁用播放和进度', () => {
  const nodes = fixture();
  nodes.audio.src = 'old.mp3';
  nodes.audio.paused = false;
  const player = createPlayer();

  player.setPoem(poem());

  assert.equal(nodes.audio.paused, true);
  assert.equal(nodes.audio.src, '');
  assert.equal(nodes.audio.currentTime, 0);
  assert.equal(nodes.audio.playCalls, 0);
  assert.equal(nodes.pp.disabled, true);
  assert.equal(nodes.aPlay.disabled, true);
  assert.equal(nodes.seek.disabled, true);
  assert.match(nodes.pMode.textContent, /暂无录音/);
  assert.match(nodes.pLine.textContent, /暂无可用录音/);
  assert.equal(nodes.app.classList.contains('playing'), false);
});

test('只在用户 toggle 时播放真实音频并使用 baseURI 下编码后的文件名', async () => {
  const nodes = fixture();
  const player = createPlayer();
  const file = '01-贺新郎·别友.mp3';

  player.setPoem(poem({ file, seconds: 999, status: 'review', priorityReview: true }));

  assert.equal(nodes.audio.src, new URL(`audio/${encodeURIComponent(file)}`, document.baseURI).href);
  assert.equal(nodes.audio.playCalls, 0);
  assert.match(nodes.pMode.textContent, /载入合成朗诵/);

  ready(nodes, 80);
  assert.equal(nodes.seek.disabled, false);
  assert.equal(nodes.pIdx.textContent, '00:00 / 01:20');
  assert.equal(nodes.pMode.textContent, '合成朗诵');

  await player.toggle();
  assert.equal(nodes.audio.playCalls, 1);
  assert.equal(nodes.app.classList.contains('playing'), true);
  assert.equal(nodes.aPlayT.textContent, '暂停录音');
});

test('手动 seek 和 seekBy 使用真实 duration，并限制到媒体边界', () => {
  const nodes = fixture();
  const player = createPlayer();
  player.setPoem(poem({ file: 'test.mp3', seconds: 999, status: 'ready' }));
  ready(nodes, 80);

  nodes.seek.value = '500';
  nodes.seek.dispatch('input');
  assert.equal(nodes.audio.currentTime, 40);
  assert.equal(nodes.pIdx.textContent, '00:40 / 01:20');
  assert.equal(nodes.seek.value, '500');

  player.seekBy(15);
  assert.equal(nodes.audio.currentTime, 55);
  player.seekBy(1000);
  assert.equal(nodes.audio.currentTime, 80);
  player.seekBy(-1000);
  assert.equal(nodes.audio.currentTime, 0);
  player.seekBy(NaN);
  assert.equal(nodes.audio.currentTime, 0);
});

test('倍速、前后按钮和真实媒体事件同步播放器状态', async () => {
  const nodes = fixture();
  let previous = 0;
  let next = 0;
  const player = createPlayer({ onPrevious: () => { previous += 1; }, onNext: () => { next += 1; } });
  player.setPoem(poem({ file: 'test.mp3', seconds: 10, status: 'ready' }));
  ready(nodes, 10);

  nodes.rate.click();
  assert.equal(nodes.audio.playbackRate, 1.25);
  assert.equal(nodes.rate.textContent, '1.25×');
  nodes.audio.playbackRate = 0.5;
  nodes.audio.dispatch('ratechange');
  assert.equal(nodes.rate.textContent, '0.50×');

  await player.toggle();
  nodes.audio.currentTime = 4;
  nodes.audio.dispatch('timeupdate');
  assert.equal(nodes.pIdx.textContent, '00:04 / 00:10');

  nodes.audio.pause();
  assert.equal(nodes.app.classList.contains('playing'), false);
  assert.equal(nodes.aPlayT.textContent, '继续录音');

  nodes.audio.currentTime = 10;
  nodes.audio.ended = true;
  nodes.audio.dispatch('ended');
  assert.equal(nodes.aPlayT.textContent, '重播录音');
  assert.equal(nodes.seek.value, '1000');
  assert.equal(nodes.ring.style.strokeDashoffset, '0');

  nodes.prevL.click();
  nodes.nextL.click();
  assert.equal(previous, 1);
  assert.equal(next, 1);
});

test('加载失败和播放拒绝显示明确错误，切诗清除旧状态', async () => {
  const nodes = fixture();
  const player = createPlayer();
  player.setPoem(poem({ file: 'test.mp3', seconds: 10, status: 'ready' }));

  nodes.audio.error = { code: 3 };
  nodes.audio.dispatch('error');
  assert.equal(nodes.pMode.textContent, '录音异常');
  assert.match(nodes.pLine.textContent, /解码失败/);
  const loads = nodes.audio.loadCalls;
  await player.toggle();
  assert.equal(nodes.audio.loadCalls, loads + 1);

  nodes.audio.error = null;
  player.setPoem(poem({ file: 'next.mp3', seconds: 10, status: 'ready' }));
  ready(nodes, 10);
  nodes.audio.playResult = Object.assign(new Error('denied'), { name: 'NotAllowedError' });
  await player.toggle();
  assert.match(nodes.pLine.textContent, /浏览器阻止/);
  assert.equal(nodes.app.classList.contains('playing'), false);
});
