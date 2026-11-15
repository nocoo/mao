import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseIndex } from '../scripts/build-data.mjs';

const illustrations = JSON.parse(await readFile(new URL('../data/illustrations.json', import.meta.url), 'utf8'));
const index = parseIndex(await readFile(new URL('../data/诗词/index.md', import.meta.url), 'utf8'));

test('generated illustrations map the complete poem index to versioned CDN URLs', () => {
  const expectedIds = Array.from({ length: 96 }, (_, index) => String(index + 1).padStart(2, '0'));
  assert.equal(index.length, 96, 'poem index must contain exactly 96 records');
  assert.deepEqual(index.map(poem => poem.id), expectedIds, 'poem index must be complete and ordered');
  assert.deepEqual(Object.keys(illustrations).sort(), expectedIds, 'illustration mapping must cover exactly the complete poem index');
  for (const [id, url] of Object.entries(illustrations)) {
    assert.match(url, new RegExp(`^https://m\\.no\\.mt/illustrations/${id}-[a-f0-9]{16}\\.webp$`));
  }
  assert.equal(illustrations['14'], 'https://m.no.mt/illustrations/14-076b8d597d2b47bf.webp');
  assert.equal(illustrations['19'], 'https://m.no.mt/illustrations/19-114c726821a2b4fd.webp');
  assert.equal(illustrations['20'], 'https://m.no.mt/illustrations/20-7e3a28a9a24fa46d.webp');
  assert.equal(illustrations['26'], 'https://m.no.mt/illustrations/26-deb3e624815cb923.webp');
  assert.equal(illustrations['40'], 'https://m.no.mt/illustrations/40-999e717be6359b28.webp');
  assert.equal(illustrations['57'], 'https://m.no.mt/illustrations/57-4788ae03794e59a6.webp');
  assert.equal(illustrations['60'], 'https://m.no.mt/illustrations/60-1ef37eab5aa6d897.webp');
  assert.equal(illustrations['80'], 'https://m.no.mt/illustrations/80-e4090bf634d7880b.webp');
});
