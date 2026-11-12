import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const requestTimeoutMs = 15_000;
const startupTimeoutMs = 30_000;
const totalTimeoutMs = 120_000;
const httpOnly = process.argv.slice(2).includes('--http-only');

function fail(label, message) {
  throw new Error(`${label}: ${message}`);
}

function expect(condition, label, message) {
  if (!condition) fail(label, message);
}

function responseDescription(response) {
  return `status=${response.status}, content-type=${response.headers.get('content-type') ?? '<missing>'}, location=${response.headers.get('location') ?? '<none>'}`;
}

function compareBody(actual, expected, label) {
  expect(actual.length === expected.length, label, `expected ${expected.length} bytes, got ${actual.length}`);
  if (actual.equals(expected)) return;
  const length = Math.min(actual.length, expected.length);
  let offset = 0;
  while (offset < length && actual[offset] === expected[offset]) offset += 1;
  fail(label, `body differs from local file at byte ${offset}`);
}

function encodedPath(relativePath) {
  return `/${relativePath.split('/').map(encodeURIComponent).join('/')}`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory, base = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const localPath = join(directory, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await walk(localPath, relativePath));
    else if (entry.isFile()) files.push({ localPath, relativePath, size: (await stat(localPath)).size });
  }
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolvePort);
  });
  const address = server.address();
  await new Promise((closePort, reject) => server.close(error => error ? reject(error) : closePort()));
  if (!address || typeof address === 'string') fail('port allocation', 'did not receive an IPv4 port');
  return address.port;
}

function abortError(signal) {
  return signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason ?? 'operation aborted'));
}

async function abortableDelay(milliseconds, signal) {
  if (signal.aborted) throw abortError(signal);
  await new Promise((resolveDelay, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolveDelay();
    }, milliseconds);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function request(origin, path, signal, options = {}) {
  try {
    return await fetch(new URL(path, origin), {
      redirect: 'manual',
      ...options,
      signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
    });
  } catch (error) {
    throw new Error(`${options.method ?? 'GET'} ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function waitUntilReady(child, origin, signal) {
  const deadline = Date.now() + startupTimeoutMs;
  let lastFailure = 'no response yet';
  while (Date.now() < deadline) {
    if (signal.aborted) throw abortError(signal);
    if (child.wranglerSpawnError) throw child.wranglerSpawnError;
    if (child.exitCode !== null || child.signalCode !== null) {
      fail('wrangler startup', `local server exited before becoming ready (exit=${child.exitCode ?? 'null'}, signal=${child.signalCode ?? 'null'}; child output suppressed)`);
    }
    try {
      const response = await request(origin, '/', signal);
      if (response.status === 200) return;
      lastFailure = responseDescription(response);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await abortableDelay(100, signal);
  }
  fail('wrangler startup', `server did not become ready within ${startupTimeoutMs}ms (${lastFailure})`);
}

async function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise(resolveExit => {
    const timer = setTimeout(() => {
      child.removeListener('exit', onExit);
      resolveExit(false);
    }, milliseconds);
    const onExit = () => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
    if (child.exitCode !== null || child.signalCode !== null) onExit();
  });
}

async function stopProcess(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const signalGroup = signal => {
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
      return true;
    } catch {
      return false;
    }
  };

  signalGroup('SIGTERM');
  if (await waitForExit(child, 3_000)) return;
  signalGroup('SIGKILL');
  expect(await waitForExit(child, 3_000), 'wrangler cleanup', 'local Wrangler process group did not terminate after SIGKILL');
}

async function preflight() {
  expect(await exists(dist), 'preflight', 'dist/ is missing; build it before running this script');
  expect(await exists(join(root, 'worker', 'index.js')), 'preflight', 'worker/index.js is missing');
  expect(await exists(join(root, 'wrangler.jsonc')), 'preflight', 'wrangler.jsonc is missing');

  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const wranglerPackagePath = join(root, 'node_modules', 'wrangler', 'package.json');
  expect(await exists(wranglerPackagePath), 'preflight', 'local Wrangler dependency is missing; install dependencies first');
  const wranglerPackage = JSON.parse(await readFile(wranglerPackagePath, 'utf8'));
  const expectedWrangler = packageJson.devDependencies?.wrangler;
  expect(expectedWrangler === wranglerPackage.version, 'preflight', `expected installed Wrangler ${expectedWrangler ?? '<missing from package.json>'}, got ${wranglerPackage.version}`);

  return { packageVersion: packageJson.version, wranglerVersion: wranglerPackage.version };
}

async function verifyApi(origin, packageVersion, signal) {
  const response = await request(origin, '/api/live', signal);
  expect(response.status === 200, 'GET /api/live', `expected 200, got ${responseDescription(response)}`);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  expect(contentType.includes('application/json'), 'GET /api/live', `expected application/json, got ${contentType || '<missing>'}`);
  const cacheControl = response.headers.get('cache-control') ?? '';
  expect(cacheControl.toLowerCase().split(',').some(value => value.trim() === 'no-store'), 'GET /api/live', `expected Cache-Control: no-store, got ${cacheControl || '<missing>'}`);

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail('GET /api/live', 'expected JSON body; response is not valid JSON');
  }
  expect(body?.status === 'ok', 'GET /api/live', `expected body.status to equal "ok", got ${JSON.stringify(body?.status)}`);
  expect(body?.version === packageVersion, 'GET /api/live', `expected body.version to strictly equal package.json version ${JSON.stringify(packageVersion)}, got ${JSON.stringify(body?.version)}`);
}

async function verifyPageAndStatic(origin, files, signal) {
  const indexPath = join(dist, 'index.html');
  expect(await exists(indexPath), 'homepage', 'dist/index.html is missing');
  const index = await readFile(indexPath);
  const page = await request(origin, '/', signal);
  expect(page.status === 200, 'GET /', `expected 200, got ${responseDescription(page)}`);
  expect((page.headers.get('content-type') ?? '').toLowerCase().includes('text/html'), 'GET /', `expected text/html, got ${page.headers.get('content-type') ?? '<missing>'}`);
  compareBody(Buffer.from(await page.arrayBuffer()), index, 'GET /');

  const staticFiles = files.filter(file => (
    file.relativePath !== 'index.html'
    && !file.relativePath.toLowerCase().endsWith('.mp3')
    && !['.gitkeep', '_headers', '_redirects', '_routes.json'].includes(file.relativePath)
  ));
  for (const file of staticFiles) {
    const path = encodedPath(file.relativePath);
    const response = await request(origin, path, signal);
    expect(response.status === 200, `GET ${path}`, `expected 200, got ${responseDescription(response)}`);
    compareBody(Buffer.from(await response.arrayBuffer()), await readFile(file.localPath), `GET ${path}`);
  }
  return staticFiles.length;
}

function expectAudioHeaders(response, label, size, allowMissingLength = false) {
  expect((response.headers.get('content-type') ?? '').toLowerCase() === 'audio/mpeg', label, `expected audio/mpeg, got ${response.headers.get('content-type') ?? '<missing>'}`);
  const length = response.headers.get('content-length');
  expect((allowMissingLength && length === null) || (length !== null && Number(length) === size), label, `expected Content-Length ${size}, got ${length ?? '<missing>'}`);
  expect((response.headers.get('accept-ranges') ?? '').toLowerCase() === 'bytes', label, `expected Accept-Ranges: bytes, got ${response.headers.get('accept-ranges') ?? '<missing>'}`);
}

async function verifyRange(origin, path, header, start, end, local, signal) {
  const label = `GET ${path} Range: ${header}`;
  const response = await request(origin, path, signal, { headers: { Range: header } });
  expect(response.status === 206, label, `expected 206 Partial Content, got ${responseDescription(response)}`);
  expect(response.headers.get('content-range') === `bytes ${start}-${end}/${local.length}`, label, `expected Content-Range bytes ${start}-${end}/${local.length}, got ${response.headers.get('content-range') ?? '<missing>'}`);
  expectAudioHeaders(response, label, end - start + 1);
  compareBody(Buffer.from(await response.arrayBuffer()), local.subarray(start, end + 1), label);
}

async function verifyAudio(origin, files, signal) {
  const mp3Files = files.filter(file => file.relativePath.startsWith('audio/') && file.relativePath.toLowerCase().endsWith('.mp3'));
  const manifest = JSON.parse(await readFile(join(root, 'audio', 'manifest.json'), 'utf8'));
  const recordings = manifest.poems.filter(poem => poem.status !== 'failed' && poem.file);
  const expected = new Map(recordings.map(recording => [recording.file, recording]));
  expect(expected.size === recordings.length, 'MP3 inventory', 'manifest contains duplicate audio filenames');
  expect(mp3Files.length === expected.size, 'MP3 inventory', `expected ${expected.size} MP3 files in dist/audio, got ${mp3Files.length}`);
  for (const file of mp3Files) {
    const name = file.relativePath.slice('audio/'.length);
    expect(expected.has(name), 'MP3 inventory', `unexpected recording ${name}`);
    const checksum = createHash('sha256').update(await readFile(file.localPath)).digest('hex');
    expect(file.size === expected.get(name).bytes, 'MP3 inventory', `byte size mismatch for ${name}`);
    expect(checksum === expected.get(name).sha256, 'MP3 inventory', `checksum mismatch for ${name}`);
    const head = await request(origin, encodedPath(file.relativePath), signal, { method: 'HEAD' });
    expect(head.status === 200, `HEAD ${name}`, `expected 200, got ${responseDescription(head)}`);
    expectAudioHeaders(head, `HEAD ${name}`, file.size, true);
  }

  const selected = mp3Files.reduce((smallest, file) => file.size < smallest.size ? file : smallest);
  const local = await readFile(selected.localPath);
  const signatureIsMp3 = local.subarray(0, 3).toString('ascii') === 'ID3' || (local.length > 1 && local[0] === 0xff && (local[1] & 0xe0) === 0xe0);
  expect(signatureIsMp3, 'MP3 fixture', `${relative(root, selected.localPath)} does not have an ID3 or MPEG audio signature`);
  const path = encodedPath(selected.relativePath);

  const full = await request(origin, path, signal);
  expect(full.status === 200, `GET ${path}`, `expected 200, got ${responseDescription(full)}`);
  expectAudioHeaders(full, `GET ${path}`, local.length);
  expect(!full.headers.has('content-range'), `GET ${path}`, 'ordinary 200 response must not include Content-Range');
  compareBody(Buffer.from(await full.arrayBuffer()), local, `GET ${path}`);

  const head = await request(origin, path, signal, { method: 'HEAD' });
  expect(head.status === 200, `HEAD ${path}`, `expected 200, got ${responseDescription(head)}`);
  expectAudioHeaders(head, `HEAD ${path}`, local.length, true);
  compareBody(Buffer.from(await head.arrayBuffer()), Buffer.alloc(0), `HEAD ${path}`);
  const headRange = await request(origin, path, signal, { method: 'HEAD', headers: { Range: 'bytes=0-31' } });
  expect(headRange.status === 200, `HEAD ${path} with Range`, `expected 200, got ${responseDescription(headRange)}`);
  expect(!headRange.headers.has('content-range'), `HEAD ${path} with Range`, 'HEAD must ignore Range');
  compareBody(Buffer.from(await headRange.arrayBuffer()), Buffer.alloc(0), `HEAD ${path} with Range`);

  await verifyRange(origin, path, 'bytes=0-31', 0, 31, local, signal);
  const tailStart = Math.max(0, local.length - 32);
  await verifyRange(origin, path, 'bytes=-32', tailStart, local.length - 1, local, signal);
  await verifyRange(origin, path, `bytes=${tailStart}-${local.length - 1}`, tailStart, local.length - 1, local, signal);
  await verifyRange(origin, path, `bytes=${tailStart}-`, tailStart, local.length - 1, local, signal);

  const unsatisfied = await request(origin, path, signal, { headers: { Range: `bytes=${local.length}-` } });
  expect(unsatisfied.status === 416, `GET ${path} unsatisfied Range`, `expected 416, got ${responseDescription(unsatisfied)}`);
  expect(unsatisfied.headers.get('content-range') === `bytes */${local.length}`, `GET ${path} unsatisfied Range`, `expected Content-Range bytes */${local.length}, got ${unsatisfied.headers.get('content-range') ?? '<missing>'}`);

  const etag = full.headers.get('etag');
  if (etag && !etag.startsWith('W/')) {
    const matching = await request(origin, path, signal, { headers: { Range: 'bytes=0-31', 'If-Range': etag } });
    expect(matching.status === 206, `GET ${path} matching If-Range`, `expected 206, got ${responseDescription(matching)}`);
    compareBody(Buffer.from(await matching.arrayBuffer()), local.subarray(0, 32), `GET ${path} matching If-Range`);

    const stale = await request(origin, path, signal, { headers: { Range: 'bytes=0-31', 'If-Range': '"worker-integration-stale"' } });
    expect(stale.status === 200, `GET ${path} stale If-Range`, `expected 200 with the full representation, got ${responseDescription(stale)}`);
    compareBody(Buffer.from(await stale.arrayBuffer()), local, `GET ${path} stale If-Range`);
  }

  const missingPath = `/audio/__worker_integration_missing_${process.pid}.mp3`;
  const missing = await request(origin, missingPath, signal);
  expect(missing.status === 404, `GET ${missingPath}`, `expected 404, got ${responseDescription(missing)}`);

  return { count: mp3Files.length, path: selected.relativePath };
}

async function verifyBrowser(origin) {
  const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch(await exists(chrome) ? { executablePath: chrome } : {});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(15_000);
    const errors = [];
    const ranges = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (new URL(response.url()).pathname.startsWith('/audio/') && response.request().headers().range) ranges.push(response.status());
    });
    await page.goto(`${origin}/#poem=16`, { waitUntil: 'networkidle', timeout: 15_000 });
    await page.locator('#aPlay').click();
    await page.waitForFunction(() => document.querySelector('#audio').currentTime > 0);
    await page.locator('#seek').fill('650');
    await page.waitForFunction(() => {
      const audio = document.querySelector('#audio');
      return Number.isFinite(audio.duration) && !audio.seeking && audio.currentTime > audio.duration / 2;
    });
    const position = await page.locator('#audio').evaluate(audio => audio.currentTime);
    await page.waitForFunction(previous => document.querySelector('#audio').currentTime > previous + .2, position);
    expect(ranges.includes(206), 'browser playback', 'no audio byte-range response returned 206');
    expect(!errors.length, 'browser playback', `runtime errors: ${errors.join('; ')}`);
  } finally {
    await browser.close();
  }
}

async function startWrangler(temporaryDirectory, port, inspectorPort, wranglerVersion) {
  const isolatedHome = join(temporaryDirectory, 'home');
  const cache = join(temporaryDirectory, 'cache');
  const envFile = join(temporaryDirectory, 'empty.env');
  const environment = {
    PATH: process.env.PATH ?? '',
    HOME: isolatedHome,
    TMPDIR: join(temporaryDirectory, 'tmp'),
    XDG_CONFIG_HOME: join(temporaryDirectory, 'config'),
    CI: '1',
    NO_COLOR: '1',
    FORCE_COLOR: '0',
    CLOUDFLARE_TELEMETRY_DISABLED: '1',
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_CACHE_DIR: cache,
  };
  await Promise.all([
    mkdir(environment.HOME, { recursive: true }),
    mkdir(environment.TMPDIR, { recursive: true }),
    mkdir(environment.XDG_CONFIG_HOME, { recursive: true }),
    mkdir(cache, { recursive: true }),
    writeFile(envFile, ''),
  ]);

  const cli = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const child = spawn(process.execPath, [
    cli,
    'dev',
    '--local',
    '--config', join(root, 'wrangler.jsonc'),
    '--env-file', envFile,
    '--ip', '127.0.0.1',
    '--port', String(port),
    '--inspector-ip', '127.0.0.1',
    '--inspector-port', String(inspectorPort),
    '--local-protocol', 'http',
    '--persist-to', join(temporaryDirectory, 'persist'),
    '--live-reload=false',
    '--show-interactive-dev-session=false',
    '--log-level', 'error',
    '--tunnel=false',
  ], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.resume();
  child.stderr.resume();
  child.stdout.on('error', () => {});
  child.stderr.on('error', () => {});
  child.once('error', error => {
    child.wranglerSpawnError = new Error(`failed to start local Wrangler ${wranglerVersion}: ${error.message}`);
  });
  return child;
}

async function main() {
  let child;
  let temporaryDirectory;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error(`integration test exceeded ${totalTimeoutMs}ms`)), totalTimeoutMs);
  const signalHandlers = new Map([
    ['SIGINT', () => abort.abort(new Error('integration test interrupted by SIGINT'))],
    ['SIGTERM', () => abort.abort(new Error('integration test interrupted by SIGTERM'))],
  ]);
  for (const [name, handler] of signalHandlers) process.once(name, handler);

  try {
    const { packageVersion, wranglerVersion } = await preflight();
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'mao-worker-integration-'));
    const port = await availablePort();
    let inspectorPort = await availablePort();
    while (inspectorPort === port) inspectorPort = await availablePort();
    const origin = `http://127.0.0.1:${port}`;

    child = await startWrangler(temporaryDirectory, port, inspectorPort, wranglerVersion);
    await waitUntilReady(child, origin, abort.signal);
    if (child.wranglerSpawnError) throw child.wranglerSpawnError;

    await verifyApi(origin, packageVersion, abort.signal);
    const files = await walk(dist);
    const staticCount = await verifyPageAndStatic(origin, files, abort.signal);
    const audio = await verifyAudio(origin, files, abort.signal);
    if (!httpOnly) await verifyBrowser(origin);
    console.log(`Worker integration passed with Wrangler ${wranglerVersion}: /api/live, homepage, ${staticCount} static artifacts, ${audio.count} MP3 files (${audio.path} exercised)${httpOnly ? '' : ', and browser playback/seek'}.`);
  } finally {
    clearTimeout(timer);
    for (const [name, handler] of signalHandlers) process.removeListener(name, handler);
    await stopProcess(child);
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Worker integration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
