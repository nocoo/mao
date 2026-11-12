import { execFileSync } from 'node:child_process';
import { cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'include-original-documents',
    // The source-document links should work on the deployed static site, too.
    async closeBundle() {
      await cp(fileURLToPath(new URL('./data/', import.meta.url)), fileURLToPath(new URL('./dist/data/', import.meta.url)), { recursive: true });
      await cp(fileURLToPath(new URL('./audio/', import.meta.url)), fileURLToPath(new URL('./dist/audio/', import.meta.url)), { recursive: true });
      for (const name of ['OFL-Noto-Serif-SC.txt', 'OFL-Ma-Shan-Zheng.txt']) {
        await cp(fileURLToPath(new URL(`./assets/fonts/${name}`, import.meta.url)), fileURLToPath(new URL(`./dist/assets/${name}`, import.meta.url)));
      }
      let revision = 'unknown';
      try {
        revision = execFileSync('git', ['rev-parse', '--verify', 'HEAD'], { cwd: fileURLToPath(new URL('.', import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      } catch { /* Building from a source archive without Git is still supported. */ }
      await writeFile(fileURLToPath(new URL('./dist/build-info.json', import.meta.url)), `${JSON.stringify({ revision })}\n`);
    },
  }],
});
