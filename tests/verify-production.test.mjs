import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verifyDeployment } from '../scripts/verify-production.mjs';

const revision = 'a'.repeat(40);
const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const recording = JSON.parse(readFileSync(new URL('../audio/manifest.json', import.meta.url), 'utf8')).poems.find(poem => poem.id === '16');
const audio = readFileSync(new URL(`../audio/${encodeURIComponent(recording.file)}`, import.meta.url));
function mockResponses({ deployed = revision, metadataStatus = 200, homepage = '<title>毛主席诗词</title><script type="module" src="./assets/index.js"></script>', homepageStatus = 200, assetStatus = 200, assetType = 'text/javascript', assetBody = 'ok', health = { status: 'ok', version }, liveStatus = 200, liveType = 'application/json', liveCache = 'no-store', audioStatus = 206, audioType = 'audio/mpeg', audioBytes = audio.subarray(0, 32), contentRange = `bytes 0-31/${audio.length}` } = {}) {
  const requests = [];
  const fetcher = async (url, options) => {
    requests.push({ url: String(url), options });
    const path = new URL(url).pathname;
    if (path === '/build-info.json') return new Response(JSON.stringify({ revision: deployed }), { status: metadataStatus });
    if (path === '/') return new Response(homepage, { status: homepageStatus });
    if (path === '/assets/index.js') return new Response(assetBody, { status: assetStatus, headers: { 'Content-Type': assetType } });
    if (path === '/api/live') return new Response(JSON.stringify(health), { status: liveStatus, headers: { 'Content-Type': liveType, 'Cache-Control': liveCache } });
    if (path.startsWith('/audio/')) return new Response(audioBytes, { status: audioStatus, headers: { 'Content-Range': contentRange, 'Content-Type': audioType } });
    return new Response('missing', { status: 404 });
  };
  return { fetcher, requests };
}

test('验证线上首页、同源 JS、精确构建提交、健康和音频字节范围', async () => {
  const { fetcher, requests } = mockResponses();
  assert.deepEqual(await verifyDeployment('https://mao.hexly.ai', revision, fetcher), { revision });
  assert.equal(requests.length, 5);
  assert.match(requests[0].url, new RegExp(`revision=${revision}`));
  assert.equal(requests[2].url, 'https://mao.hexly.ai/assets/index.js');
  assert.equal(requests[2].options.redirect, 'manual');
  assert.equal(requests[3].url, 'https://mao.hexly.ai/api/live');
  assert.equal(requests[3].options.redirect, 'manual');
  assert.equal(requests[4].options.headers.range, 'bytes=0-31');
});

test('拒绝错误提交、损坏首页、外部脚本和不可用资源', async () => {
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ deployed: 'b'.repeat(40) }).fetcher), /revision/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ metadataStatus: 302 }).fetcher), /metadata returned HTTP 302/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ homepageStatus: 302 }).fetcher), /Homepage returned HTTP 302/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ homepage: '<title>other</title>' }).fetcher), /title/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ homepage: '<title>毛主席诗词</title><script src="https://evil.example/asset.js"></script>' }).fetcher), /outside/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ assetStatus: 404 }).fetcher), /404/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ assetStatus: 302 }).fetcher), /302/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ assetType: 'text/html' }).fetcher), /invalid MIME/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ assetBody: '' }).fetcher), /empty/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', 'main', mockResponses().fetcher), /full SHA/);
});

test('拒绝健康接口重定向、错误状态、版本、缓存和 HTML 回退', async () => {
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ liveStatus: 302 }).fetcher), /Liveness endpoint returned HTTP 302/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ liveType: 'text/html' }).fetcher), /did not return JSON/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ liveCache: 'public, max-age=60' }).fetcher), /must not be cached/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ health: { status: 'error', version } }).fetcher), /status or version/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ health: { status: 'ok', version: '0.0.0' } }).fetcher), /status or version/);
});

test('拒绝音频缺失、忽略 Range、范围头错误和字节不符', async () => {
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ audioStatus: 404 }).fetcher), /Audio range returned HTTP 404/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ audioStatus: 200 }).fetcher), /Audio range returned HTTP 200/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ audioType: 'text/html' }).fetcher), /Audio range has an invalid MIME/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ contentRange: 'bytes 1-32/999' }).fetcher), /Audio range headers/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ audioBytes: Buffer.alloc(32) }).fetcher), /audio bytes/);
});
