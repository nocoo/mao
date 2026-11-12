import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const live = `${JSON.stringify({ status: 'ok', version })}\n`;

function liveMiddleware(server, built = false) {
  server.middlewares.use((request, response, next) => {
    if (new URL(request.url, 'http://localhost').pathname !== '/api/live') return next();
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }).end();
      return;
    }
    let body;
    try {
      body = built ? readFileSync(new URL('./dist/api/live', import.meta.url), 'utf8') : live;
    } catch {
      response.writeHead(503, { 'Cache-Control': 'no-store' }).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
}

export default defineConfig({
  base: './',
  server: { allowedHosts: ['mao.dev.hexly.ai'] },
  preview: { allowedHosts: ['mao.dev.hexly.ai'] },
  plugins: [{
    name: 'include-original-documents',
    configureServer: server => liveMiddleware(server),
    configurePreviewServer: server => liveMiddleware(server, true),
    // The source-document links should work on the deployed static site, too.
    async closeBundle() {
      await cp(fileURLToPath(new URL('./data/', import.meta.url)), fileURLToPath(new URL('./dist/data/', import.meta.url)), { recursive: true });
      for (const name of ['OFL-Noto-Serif-SC.txt', 'OFL-Ma-Shan-Zheng.txt']) {
        await cp(fileURLToPath(new URL(`./assets/fonts/${name}`, import.meta.url)), fileURLToPath(new URL(`./dist/assets/${name}`, import.meta.url)));
      }
      let revision = 'unknown';
      try {
        revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      } catch { /* Building from a source archive without Git is still supported. */ }
      await writeFile(fileURLToPath(new URL('./dist/build-info.json', import.meta.url)), `${JSON.stringify({ revision })}\n`);
      await mkdir(fileURLToPath(new URL('./dist/api/', import.meta.url)), { recursive: true });
      await writeFile(fileURLToPath(new URL('./dist/api/live', import.meta.url)), live);
      await writeFile(fileURLToPath(new URL('./dist/_headers', import.meta.url)), '/api/live\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: no-store\n');
    },
  }],
});
