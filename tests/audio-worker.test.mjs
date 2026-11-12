import assert from 'node:assert/strict';
import test from 'node:test';

import worker from '../worker/index.js';

function setup(response) {
  const requests = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        requests.push(request);
        return typeof response === 'function' ? response(request) : response;
      },
    },
  };
  return { env, requests };
}

for (const [name, request] of [
  ['homepage', new Request('https://mao.example/')],
  ['static asset', new Request('https://mao.example/assets/index.js')],
  ['liveness endpoint', new Request('https://mao.example/api/live')],
  ['audio path with a range', new Request('https://mao.example/audio/recording.mp3', { headers: { range: 'bytes=0-31' } })],
  ['mutation', new Request('https://mao.example/api/live', { method: 'POST', body: 'test' })],
]) {
  test(`forwards ${name} to the asset binding unchanged`, async () => {
    const expected = new Response(name, { status: 200 });
    const { env, requests } = setup(expected);

    const actual = await worker.fetch(request, env);

    assert.strictEqual(actual, expected);
    assert.deepEqual(requests, [request]);
  });
}

test('propagates asset binding errors', async () => {
  const failure = new Error('asset unavailable');
  const { env } = setup(() => { throw failure; });

  await assert.rejects(worker.fetch(new Request('https://mao.example/'), env), failure);
});
