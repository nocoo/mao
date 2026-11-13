import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseIndex } from '../scripts/build-data.mjs';

const illustrations = JSON.parse(await readFile(new URL('../data/illustrations.json', import.meta.url), 'utf8'));
const index = parseIndex(await readFile(new URL('../data/诗词/index.md', import.meta.url), 'utf8'));

test('generated illustrations map existing poem IDs to versioned CDN URLs', () => {
  const ids = new Set(index.map(poem => poem.id));
  for (const [id, url] of Object.entries(illustrations)) {
    assert.ok(ids.has(id), `unknown poem ${id}`);
    assert.match(url, new RegExp(`^https://m\\.no\\.mt/illustrations/${id}-[a-f0-9]{16}\\.webp$`));
  }
  for (let number = 1; number <= 40; number++) {
    const id = String(number).padStart(2, '0');
    assert.ok(illustrations[id], `missing approved illustration ${id}`);
  }
  assert.equal(illustrations['14'], 'https://m.no.mt/illustrations/14-076b8d597d2b47bf.webp');
  assert.equal(illustrations['19'], 'https://m.no.mt/illustrations/19-114c726821a2b4fd.webp');
  assert.equal(illustrations['20'], 'https://m.no.mt/illustrations/20-7e3a28a9a24fa46d.webp');
  assert.equal(illustrations['26'], 'https://m.no.mt/illustrations/26-deb3e624815cb923.webp');
  assert.equal(illustrations['40'], 'https://m.no.mt/illustrations/40-999e717be6359b28.webp');
});
