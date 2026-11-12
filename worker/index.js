import manifest from '../audio/manifest.json' with { type: 'json' };

const audioSizes = new Map(manifest.poems.filter(poem => poem.file && Number.isSafeInteger(poem.bytes)).map(poem => [poem.file, poem.bytes]));

function parseSingleRange(value) {
  if (value.length > 128) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return null;

  const start = match[1] ? BigInt(match[1]) : null;
  const end = match[2] ? BigInt(match[2]) : null;
  if (start !== null && end !== null && end < start) return null;

  return { start, end };
}

function responseLength(response) {
  const value = response.headers.get("content-length");
  if (!value || !/^\d+$/.test(value)) return null;

  const length = BigInt(value);
  return length <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(length) : null;
}

function resolveRange(range, length) {
  const size = BigInt(length);
  if (size === 0n) return null;

  if (range.start === null) {
    if (range.end === 0n) return null;
    return {
      start: Number(range.end >= size ? 0n : size - range.end),
      end: length - 1,
    };
  }

  if (range.start >= size) return null;
  return {
    start: Number(range.start),
    end: Number(range.end === null || range.end >= size ? size - 1n : range.end),
  };
}

function ifRangeMatches(request, response) {
  const condition = request.headers.get("if-range");
  if (!condition) return true;

  if (/^W\//i.test(condition)) return false;

  if (condition.startsWith('"')) {
    const etag = response.headers.get("etag");
    return etag !== null && !/^W\//i.test(etag) && etag === condition;
  }

  const modified = Date.parse(response.headers.get("last-modified") || "");
  const since = Date.parse(condition);
  return Number.isFinite(modified) && Number.isFinite(since) && modified === since;
}

function sliceBody(body, start, end) {
  const reader = body.getReader();
  let offset = 0;
  const stop = end + 1;

  return new ReadableStream({
    async pull(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            controller.error(new Error("Asset stream ended before Content-Length"));
            return;
          }

          const from = Math.max(0, start - offset);
          const to = Math.min(value.byteLength, stop - offset);
          offset += value.byteLength;
          if (to > from) controller.enqueue(value.subarray(from, to));
          if (offset >= stop) {
            controller.close();
            try {
              await reader.cancel();
            } catch {}
            return;
          }
          if (to > from) return;
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

function withRangeSupport(response, length) {
  if (response.status !== 200 || length === undefined || length === null) return response;
  const headers = new Headers(response.headers);
  headers.set('accept-ranges', 'bytes');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function rangeResponse(response, range, length, ctx) {
  const headers = new Headers(response.headers);
  headers.set("accept-ranges", "bytes");

  if (!range) {
    headers.set("content-range", `bytes */${length}`);
    headers.set("content-length", "0");
    try {
      await response.body?.cancel();
    } catch {}
    return new Response(null, { status: 416, headers });
  }

  const size = range.end - range.start + 1;
  headers.set("content-range", `bytes ${range.start}-${range.end}/${length}`);
  headers.set("content-length", String(size));
  const fixed = new FixedLengthStream(size);
  ctx.waitUntil(sliceBody(response.body, range.start, range.end).pipeTo(fixed.writable).catch(() => {}));
  return new Response(fixed.readable, { status: 206, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const rangeValue = request.headers.get("range");
    if (!url.pathname.startsWith('/audio/') || !url.pathname.toLowerCase().endsWith('.mp3') || !['GET', 'HEAD'].includes(request.method)) {
      return env.ASSETS.fetch(request);
    }

    const parsed = request.method === 'GET' && rangeValue ? parseSingleRange(rangeValue) : null;
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 200) return response;
    let file;
    try { file = decodeURIComponent(url.pathname.slice('/audio/'.length)); } catch {}
    const length = responseLength(response) ?? audioSizes.get(file);
    if (!parsed || !ifRangeMatches(request, response)) return withRangeSupport(response, length);
    if (length === undefined || length === null || !response.body) return response;
    return rangeResponse(response, resolveRange(parsed, length), length, ctx);
  },
};
