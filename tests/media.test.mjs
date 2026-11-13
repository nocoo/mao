import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { audioUrl } from '../src/media.js';
import { cdnFixtureFetch } from './cdn-fixtures.mjs';

test('audio CDN URLs use the exact poem ID and content hash', () => {
  assert.equal(audioUrl('14', 'a'.repeat(64)), 'https://m.no.mt/audio/14-aaaaaaaaaaaaaaaa.mp3');
  assert.equal(audioUrl('01', 'b'.repeat(64)), 'https://m.no.mt/audio/01-bbbbbbbbbbbbbbbb.mp3');
  for (const [id, hash] of [['1', 'a'.repeat(64)], ['14-1', 'a'.repeat(64)], ['../01', 'a'.repeat(64)], ['01', 'invalid'], ['01', 'A'.repeat(64)]]) {
    assert.throws(() => audioUrl(id, hash), /Invalid audio/);
  }
});

test('static assets are served before the Worker', async () => {
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.ok(!config.assets.run_worker_first);
});

test('isolated CDN fixture serves real audio bytes and ranges', async () => {
  const manifest = JSON.parse(await readFile(new URL('../audio/manifest.json', import.meta.url), 'utf8'));
  const recording = manifest.poems.find(poem => poem.id === '16');
  const original = await readFile(new URL(`../audio/${encodeURIComponent(recording.file)}`, import.meta.url));
  const url = audioUrl(recording.id, recording.sha256);
  const response = await cdnFixtureFetch(url, { headers: { range: 'bytes=100-199' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes 100-199/${original.length}`);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), original.subarray(100, 200));
  assert.equal((await cdnFixtureFetch(url, { headers: { range: `bytes=${original.length}-` } })).status, 416);
  assert.equal((await cdnFixtureFetch('https://m.no.mt/audio/missing.mp3')).status, 404);
});
