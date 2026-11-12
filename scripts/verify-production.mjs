import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const recording = JSON.parse(readFileSync(new URL('../audio/manifest.json', import.meta.url), 'utf8')).poems.find(poem => poem.id === '16');
const audio = readFileSync(new URL(`../audio/${encodeURIComponent(recording.file)}`, import.meta.url));

export async function verifyDeployment(origin, revision, request = fetch) {
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error('Expected Git revision must be a full SHA');
  const base = new URL(origin);
  const options = { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15000) };
  const infoResponse = await request(new URL(`/build-info.json?revision=${revision}`, base), { ...options, redirect: 'manual' });
  if (infoResponse.status !== 200 || infoResponse.redirected) throw new Error(`Build metadata returned HTTP ${infoResponse.status}`);
  const info = await infoResponse.json();
  if (info.revision !== revision) throw new Error('Published revision does not match the CI-tested commit');
  const pageResponse = await request(new URL(`/?revision=${revision}`, base), { ...options, redirect: 'manual' });
  if (pageResponse.status !== 200 || pageResponse.redirected) throw new Error(`Homepage returned HTTP ${pageResponse.status}`);
  const html = await pageResponse.text();
  if (!html.includes('毛主席诗词')) throw new Error('Homepage title is missing');
  const script = html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/i)?.[1];
  if (!script) throw new Error('Homepage has no JavaScript bundle');
  const assetUrl = new URL(script, base);
  if (assetUrl.origin !== base.origin) throw new Error('Homepage bundle points outside the deployment origin');
  const assetResponse = await request(assetUrl, { ...options, redirect: 'manual' });
  if (assetResponse.status !== 200 || assetResponse.redirected) throw new Error(`JavaScript bundle returned HTTP ${assetResponse.status}`);
  if (!/^(?:text|application)\/(?:x-)?javascript(?:\s*;|$)/i.test(assetResponse.headers.get('content-type') || '')) throw new Error('JavaScript bundle has an invalid MIME type');
  if (!(await assetResponse.text()).trim()) throw new Error('JavaScript bundle is empty');
  const liveResponse = await request(new URL('/api/live', base), { ...options, redirect: 'manual' });
  if (liveResponse.status !== 200 || liveResponse.redirected) throw new Error(`Liveness endpoint returned HTTP ${liveResponse.status}`);
  if (!/^application\/json(?:\s*;|$)/i.test(liveResponse.headers.get('content-type') || '')) throw new Error('Liveness endpoint did not return JSON');
  if (!/(?:^|,)\s*no-store\s*(?:,|$)/i.test(liveResponse.headers.get('cache-control') || '')) throw new Error('Liveness endpoint must not be cached');
  const health = await liveResponse.json();
  if (health.status !== 'ok' || health.version !== version) throw new Error('Liveness status or version does not match the release');
  const audioUrl = new URL(`/audio/${encodeURIComponent(recording.file)}`, base);
  const audioResponse = await request(audioUrl, { ...options, redirect: 'manual', headers: { ...options.headers, range: 'bytes=0-31' } });
  if (audioResponse.status !== 206 || audioResponse.redirected) throw new Error(`Audio range returned HTTP ${audioResponse.status}`);
  if (!/^audio\/mpeg(?:\s*;|$)/i.test(audioResponse.headers.get('content-type') || '')) throw new Error('Audio range has an invalid MIME type');
  if (audioResponse.headers.get('content-range') !== `bytes 0-31/${audio.length}`) throw new Error('Audio range headers do not match the recording');
  if (!Buffer.from(await audioResponse.arrayBuffer()).equals(audio.subarray(0, 32))) throw new Error('Published audio bytes do not match the release');
  return info;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();
  await verifyDeployment('https://mao.hexly.ai', revision);
  console.log(`Production verified: https://mao.hexly.ai/ (${revision})`);
}
