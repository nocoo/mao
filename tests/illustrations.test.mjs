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
  for (const id of ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14-1', '14-2']) assert.ok(illustrations[id], `missing approved illustration ${id}`);
  assert.equal(illustrations['14-1'], 'https://m.no.mt/illustrations/14-1-076b8d597d2b47bf.webp');
  assert.equal(illustrations['19'], 'https://m.no.mt/illustrations/19-114c726821a2b4fd.webp');
});
