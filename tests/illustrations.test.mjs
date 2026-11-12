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
  assert.equal(illustrations['19'], 'https://m.no.mt/illustrations/19-114c726821a2b4fd.webp');
});
