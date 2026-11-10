import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function verifyDeployment(origin, revision, request = fetch) {
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error('Expected Git revision must be a full SHA');
  const base = new URL(origin);
  const options = { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15000) };
  const infoResponse = await request(new URL(`/build-info.json?revision=${revision}`, base), options);
  if (!infoResponse.ok) throw new Error(`Build metadata returned HTTP ${infoResponse.status}`);
  const info = await infoResponse.json();
  if (info.revision !== revision) throw new Error('Published revision does not match the CI-tested commit');
  const pageResponse = await request(new URL(`/?revision=${revision}`, base), options);
  if (!pageResponse.ok) throw new Error(`Homepage returned HTTP ${pageResponse.status}`);
  const html = await pageResponse.text();
  if (!html.includes('毛主席诗词')) throw new Error('Homepage title is missing');
  const script = html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/i)?.[1];
  if (!script) throw new Error('Homepage has no JavaScript bundle');
  const assetUrl = new URL(script, base);
  if (assetUrl.origin !== base.origin) throw new Error('Homepage bundle points outside the deployment origin');
  const assetResponse = await request(assetUrl, options);
  if (!assetResponse.ok) throw new Error(`JavaScript bundle returned HTTP ${assetResponse.status}`);
  return info;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { encoding: 'utf8' }).trim();
  await verifyDeployment('https://mao.hexly.ai', revision);
  console.log(`Production verified: https://mao.hexly.ai/ (${revision})`);
}
