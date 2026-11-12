import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from 'node:fs';

import workerModule from "../worker/index.js";

globalThis.FixedLengthStream = class extends TransformStream {
  constructor() { super(); }
};
const worker = {
  fetch(request, env) { return workerModule.fetch(request, env, { waitUntil(promise) { void promise; } }); },
};

const bytes = (value) => new TextEncoder().encode(value);

function asset(payload = bytes("0123456789"), extraHeaders = {}) {
  const headers = new Headers(extraHeaders);
  if (!headers.has("content-length")) {
    headers.set("content-length", String(payload.byteLength ?? payload.length));
  }
  return new Response(payload, { status: 200, headers });
}

function setup(response) {
  const requests = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        requests.push(request);
        return typeof response === "function" ? response(request) : response;
      },
    },
  };
  return { env, requests };
}

function request(path = "/audio/sample.mp3", headers = {}, method = "GET") {
  return new Request(`https://example.com${path}`, { method, headers });
}

async function body(response) {
  return new TextDecoder().decode(await response.arrayBuffer());
}

for (const { name, range, expectedRange, expectedBody, expectedLength } of [
  ["closed interval", "bytes=2-5", "bytes 2-5/10", "2345", "4"],
  ["clamped closed interval", "bytes=7-99", "bytes 7-9/10", "789", "3"],
  ["open ended", "bytes=7-", "bytes 7-9/10", "789", "3"],
  ["suffix", "bytes=-3", "bytes 7-9/10", "789", "3"],
  ["suffix larger than object", "bytes=-99", "bytes 0-9/10", "0123456789", "10"],
  ["first byte", "bytes=0-0", "bytes 0-0/10", "0", "1"],
  ["last byte", "bytes=9-9", "bytes 9-9/10", "9", "1"],
].map(([name, range, expectedRange, expectedBody, expectedLength]) => ({
  name,
  range,
  expectedRange,
  expectedBody,
  expectedLength,
}))) {
  test(`serves ${name}`, async () => {
    const { env, requests } = setup(asset(bytes("0123456789"), {
      "content-type": "audio/mpeg",
      etag: '"sound-v1"',
      "cache-control": "public, max-age=3600",
    }));

    const incoming = request("/audio/sample.mp3", { range });
    const response = await worker.fetch(incoming, env);

    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), expectedRange);
    assert.equal(response.headers.get("content-length"), expectedLength);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(response.headers.get("etag"), '"sound-v1"');
    assert.equal(response.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(await body(response), expectedBody);
    assert.equal(requests.length, 1);
    assert.strictEqual(requests[0], incoming);
    assert.equal(requests[0].headers.get("range"), range);
  });
}

test('skips multiple stream chunks before the requested range', { timeout: 2000 }, async () => {
  let index = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (index < 10) controller.enqueue(bytes(String(index++)));
      else controller.close();
    },
  });
  const { env } = setup(new Response(stream, { headers: { 'content-length': '10' } }));
  const response = await worker.fetch(request('/audio/sample.mp3', { range: 'bytes=7-9' }), env);
  assert.equal(response.status, 206);
  assert.equal(await body(response), '789');
});

test("streams only the requested bytes across chunk boundaries", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(bytes("01"));
      controller.enqueue(bytes("2345"));
      controller.enqueue(bytes("6789"));
      controller.close();
    },
  });
  const upstream = new Response(stream, { headers: { "content-length": "10" } });
  const { env } = setup(upstream);

  const response = await worker.fetch(
    request("/audio/sample.mp3", { range: "bytes=1-7" }),
    env,
  );

  assert.equal(await body(response), "1234567");
});

for (const range of ["bytes=10-", "bytes=10-20", "bytes=-0"]) {
  test(`returns 416 for unsatisfied ${range}`, async () => {
    let cancelled = false;
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(bytes("0123456789"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { env } = setup(new Response(stream, {
      headers: {
        "content-length": "10",
        "content-type": "audio/mpeg",
        etag: '"sound-v1"',
        "cache-control": "public, max-age=60",
      },
    }));

    const response = await worker.fetch(request("/audio/sample.mp3", { range }), env);

    assert.equal(response.status, 416);
    assert.equal(response.headers.get("content-range"), "bytes */10");
    assert.equal(response.headers.get("content-length"), "0");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-type"), "audio/mpeg");
    assert.equal(response.headers.get("etag"), '"sound-v1"');
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.equal(await body(response), "");
    assert.equal(cancelled, true);
  });
}

test("returns 416 for a range on an empty MP3", async () => {
  const { env } = setup(asset(new Uint8Array()));
  const response = await worker.fetch(
    request("/audio/empty.mp3", { range: "bytes=0-0" }),
    env,
  );

  assert.equal(response.status, 416);
  assert.equal(response.headers.get("content-range"), "bytes */0");
});

for (const range of [
  "items=0-1",
  "bytes=",
  "bytes=-",
  "bytes=a-b",
  "bytes=5-3",
  "bytes=0-1,4-5",
  "bytes=0-1,",
  "bytes =0-1",
]) {
  test(`passes invalid or multiple range through: ${range}`, async () => {
    const original = asset();
    const { env, requests } = setup(original);
    const incoming = request("/audio/sample.mp3", { range });

    const response = await worker.fetch(incoming, env);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(await body(response), '0123456789');
    assert.strictEqual(requests[0], incoming);
    assert.equal(requests[0].headers.get("range"), range);
  });
}

test("honors matching strong ETag If-Range", async () => {
  const { env } = setup(asset(bytes("0123456789"), { etag: '"v1"' }));
  const response = await worker.fetch(request("/audio/sample.mp3", {
    range: "bytes=2-3",
    "if-range": '"v1"',
  }), env);

  assert.equal(response.status, 206);
  assert.equal(await body(response), "23");
});

for (const { name, requestTag, responseTag } of [
  { name: "mismatched strong tag", requestTag: '"v2"', responseTag: '"v1"' },
  { name: "weak request tag", requestTag: 'W/"v1"', responseTag: '"v1"' },
  { name: "weak response tag", requestTag: '"v1"', responseTag: 'W/"v1"' },
]) {
  test(`ignores Range for ${name} in If-Range`, async () => {
    const original = asset(bytes("0123456789"), { etag: responseTag });
    const { env } = setup(original);
    const response = await worker.fetch(request("/audio/sample.mp3", {
      range: "bytes=10-20",
      "if-range": requestTag,
    }), env);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(await body(response), "0123456789");
  });
}

test("honors If-Range HTTP date only when it exactly matches Last-Modified", async () => {
  const modified = 'Tue, 21 Oct 2025 07:28:00 GMT';
  const { env } = setup(asset(bytes("0123456789"), { 'last-modified': modified }));
  const response = await worker.fetch(request("/audio/sample.mp3", {
    range: "bytes=0-1",
    "if-range": modified,
  }), env);

  assert.equal(response.status, 206);
  assert.equal(await body(response), "01");
});

test('ignores Range when If-Range is a later, non-matching HTTP date', async () => {
  const original = asset(bytes('0123456789'), { 'last-modified': 'Tue, 21 Oct 2025 07:28:00 GMT' });
  const { env } = setup(original);
  const response = await worker.fetch(request('/audio/sample.mp3', {
    range: 'bytes=0-1',
    'if-range': 'Thu, 22 Oct 2026 07:28:00 GMT',
  }), env);
  assert.equal(response.status, 200);
  assert.equal(await body(response), '0123456789');
});

test("ignores Range for a failed If-Range date comparison", async () => {
  const original = asset(bytes("0123456789"), {
    "last-modified": "Wed, 21 Oct 2025 07:28:00 GMT",
  });
  const { env } = setup(original);
  const response = await worker.fetch(request("/audio/sample.mp3", {
    range: "bytes=0-1",
    "if-range": "Wed, 20 Oct 2025 07:28:00 GMT",
  }), env);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
});

for (const { name, incoming } of [
  { name: "request without Range", incoming: request() },
  { name: "HEAD request", incoming: request("/audio/sample.mp3", { range: "bytes=0-1" }, "HEAD") },
  { name: "non-MP3 request", incoming: request("/styles.css", { range: "bytes=0-1" }) },
]) {
  test(`passes ${name} through unchanged`, async () => {
    const original = asset();
    const { env, requests } = setup(original);
    const response = await worker.fetch(incoming, env);

    if (name === 'non-MP3 request') assert.strictEqual(response, original);
    else assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.strictEqual(requests[0], incoming);
  });
}

test("recognizes MP3 extension case-insensitively", async () => {
  const { env } = setup(asset(bytes("abc")));
  const response = await worker.fetch(
    request("/audio/sample.MP3", { range: "bytes=1-1" }),
    env,
  );

  assert.equal(response.status, 206);
  assert.equal(await body(response), "b");
});

for (const status of [206, 304, 404, 500]) {
  test(`preserves upstream status ${status}`, async () => {
    const original = new Response(status === 304 ? null : "upstream", { status });
    const { env } = setup(original);
    const response = await worker.fetch(
      request("/audio/sample.mp3", { range: "bytes=0-1" }),
      env,
    );

    assert.strictEqual(response, original);
    assert.equal(response.status, status);
  });
}

test('streams a known asset range when the binding omits Content-Length', { timeout: 2000 }, async () => {
  const manifest = JSON.parse(readFileSync(new URL('../audio/manifest.json', import.meta.url), 'utf8'));
  const recording = manifest.poems.find(poem => poem.id === '47');
  let generated = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      const length = Math.min(1024, recording.bytes - generated);
      if (!length) { controller.close(); return; }
      generated += length;
      controller.enqueue(new Uint8Array(length).fill(65));
    },
    cancel() { cancelled = true; },
  });
  const { env } = setup(new Response(stream, { headers: { 'content-type': 'audio/mpeg' } }));
  const response = await worker.fetch(request(`/audio/${encodeURIComponent(recording.file)}`, { range: 'bytes=10000-10031' }), env);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), `bytes 10000-10031/${recording.bytes}`);
  assert.equal(await body(response), 'A'.repeat(32));
  assert.ok(generated < recording.bytes);
  assert.equal(cancelled, true);
});

test('does not buffer or advertise ranges for an unknown asset length', async () => {
  const original = new Response(bytes('0123456789'));
  const { env } = setup(original);
  const response = await worker.fetch(request('/audio/sample.mp3', { range: 'bytes=2-4' }), env);
  assert.strictEqual(response, original);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('accept-ranges'), null);
  assert.equal(await body(response), '0123456789');
});

test("returns a complete 200 response when the upstream body is unavailable", async () => {
  const original = new Response(null, { headers: { "content-length": "10" } });
  const { env } = setup(original);

  const response = await worker.fetch(
    request("/audio/sample.mp3", { range: "bytes=2-4" }),
    env,
  );

  assert.strictEqual(response, original);
  assert.equal(response.status, 200);
});

test("surfaces a truncated upstream stream without pretending it was complete", async () => {
  const upstream = new Response(bytes("01"), { headers: { "content-length": "10" } });
  const { env } = setup(upstream);
  const response = await worker.fetch(
    request("/audio/sample.mp3", { range: "bytes=0-9" }),
    env,
  );

  assert.equal(response.status, 206);
  await assert.rejects(response.arrayBuffer(), /Asset stream ended before Content-Length/);
});

test("propagates asset binding errors", async () => {
  const failure = new Error("asset unavailable");
  const { env } = setup(() => {
    throw failure;
  });

  await assert.rejects(
    worker.fetch(request("/audio/sample.mp3", { range: "bytes=0-1" }), env),
    failure,
  );
});
