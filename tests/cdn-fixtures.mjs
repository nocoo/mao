import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { audioUrl } from '../src/media.js';

const origin = 'https://m.no.mt';
const manifest = JSON.parse(await readFile(new URL('../audio/manifest.json', import.meta.url), 'utf8'));
const illustrations = JSON.parse(await readFile(new URL('../data/illustrations.json', import.meta.url), 'utf8'));
const favicon = await readFile(new URL('../assets/favicon.svg', import.meta.url));
const faviconHash = createHash('sha256').update(favicon).digest('hex').slice(0, 16);
const media = new Map(manifest.poems.filter(poem => poem.status !== 'failed' && poem.file).map(poem => [
  audioUrl(poem.id, poem.sha256), { path: new URL(`../audio/${encodeURIComponent(poem.file)}`, import.meta.url), type: 'audio/mpeg' },
]));
for (const url of Object.values(illustrations)) {
  media.set(url, { path: new URL('../design/samples/19-snow-original.png', import.meta.url), type: 'image/png' });
}
media.set(`${origin}/assets/favicon-${faviconHash}.svg`, { body: favicon, type: 'image/svg+xml' });

export function isCdnUrl(value) {
  return new URL(value).origin === origin;
}

async function response(url, method, rangeHeader) {
  const item = media.get(url);
  if (!item) return { status: 404, headers: {}, body: Buffer.alloc(0) };
  const bytes = item.body ?? await readFile(item.path);
  const headers = { 'content-type': item.type, 'accept-ranges': 'bytes', 'content-length': String(bytes.length) };
  if (method === 'HEAD') return { status: 200, headers };
  if (!rangeHeader) return { status: 200, headers, body: bytes };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match || (!match[1] && !match[2])) return { status: 200, headers, body: bytes };
  const start = match[1] ? Number(match[1]) : Math.max(0, bytes.length - Number(match[2]));
  const end = match[1] ? Math.min(match[2] ? Number(match[2]) : bytes.length - 1, bytes.length - 1) : bytes.length - 1;
  if (start >= bytes.length || end < start || (!match[1] && Number(match[2]) === 0)) {
    return { status: 416, headers: { ...headers, 'content-range': `bytes */${bytes.length}`, 'content-length': '0' }, body: Buffer.alloc(0) };
  }
  const body = bytes.subarray(start, end + 1);
  return { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'content-length': String(body.length) }, body };
}

export async function mockCdn(page, onRequest = () => {}) {
  await page.route(url => url.origin === origin, async route => {
    const request = route.request();
    onRequest(request.url());
    await route.fulfill(await response(request.url(), request.method(), request.headers().range));
  });
}

export async function cdnFixtureFetch(url, options = {}) {
  const href = String(url);
  if (!isCdnUrl(href)) return fetch(url, options);
  const result = await response(href, options.method || 'GET', new Headers(options.headers).get('range'));
  return new Response(result.body, { status: result.status, headers: result.headers });
}
