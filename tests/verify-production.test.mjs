import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyDeployment } from '../scripts/verify-production.mjs';

const revision = 'a'.repeat(40);
function mockResponses({ deployed = revision, homepage = '<title>毛主席诗词</title><script type="module" src="./assets/index.js"></script>', assetStatus = 200 } = {}) {
  const requests = [];
  const fetcher = async url => {
    requests.push(String(url));
    const path = new URL(url).pathname;
    if (path === '/build-info.json') return new Response(JSON.stringify({ revision: deployed }));
    if (path === '/') return new Response(homepage);
    if (path === '/assets/index.js') return new Response('ok', { status: assetStatus });
    return new Response('missing', { status: 404 });
  };
  return { fetcher, requests };
}

test('验证线上首页、同源 JS 和精确构建提交', async () => {
  const { fetcher, requests } = mockResponses();
  assert.deepEqual(await verifyDeployment('https://mao.hexly.ai', revision, fetcher), { revision });
  assert.equal(requests.length, 3);
  assert.match(requests[0], new RegExp(`revision=${revision}`));
  assert.equal(requests[2], 'https://mao.hexly.ai/assets/index.js');
});

test('拒绝错误提交、损坏首页、外部脚本和不可用资源', async () => {
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ deployed: 'b'.repeat(40) }).fetcher), /revision/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ homepage: '<title>other</title>' }).fetcher), /title/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ homepage: '<title>毛主席诗词</title><script src="https://evil.example/asset.js"></script>' }).fetcher), /outside/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', revision, mockResponses({ assetStatus: 404 }).fetcher), /404/);
  await assert.rejects(verifyDeployment('https://mao.hexly.ai', 'main', mockResponses().fetcher), /full SHA/);
});
