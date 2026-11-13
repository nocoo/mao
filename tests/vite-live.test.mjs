import assert from 'node:assert/strict';
import { copyFile, mkdtemp, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

test('development liveness follows the current package version without restarting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mao-vite-live-'));
  try {
    await copyFile(new URL('../vite.config.js', import.meta.url), join(directory, 'vite.config.mjs'));
    await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), join(directory, 'node_modules'), 'dir');
    const manifest = join(directory, 'package.json');
    await writeFile(manifest, JSON.stringify({ type: 'module', version: '1.2.0' }));
    const config = (await import(pathToFileURL(join(directory, 'vite.config.mjs')).href)).default;
    let middleware;
    config.plugins[0].configureServer({ middlewares: { use(handler) { middleware = handler; } } });
    const request = (method = 'GET') => {
      const result = {};
      middleware({ url: '/api/live', method }, {
        writeHead(status, headers) { result.status = status; result.headers = headers; return this; },
        end(body) { result.body = body; },
      }, () => { throw new Error('Liveness middleware skipped the request'); });
      return result;
    };
    assert.deepEqual(JSON.parse(request().body), { status: 'ok', version: '1.2.0' });
    await writeFile(manifest, JSON.stringify({ type: 'module', version: '1.2.1' }));
    const next = request();
    assert.deepEqual(JSON.parse(next.body), { status: 'ok', version: '1.2.1' });
    assert.equal(next.headers['Cache-Control'], 'no-store');
    assert.equal(request('HEAD').body, undefined);
    assert.equal(request('POST').status, 405);
    await unlink(manifest);
    assert.equal(request().status, 503);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
