import { cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [{
    name: 'include-original-documents',
    // The source-document links should work on the deployed static site, too.
    async closeBundle() {
      await cp(fileURLToPath(new URL('./data/', import.meta.url)), fileURLToPath(new URL('./dist/data/', import.meta.url)), { recursive: true });
      for (const name of ['OFL-Noto-Serif-SC.txt', 'OFL-Ma-Shan-Zheng.txt']) {
        await cp(fileURLToPath(new URL(`./assets/fonts/${name}`, import.meta.url)), fileURLToPath(new URL(`./dist/assets/${name}`, import.meta.url)));
      }
    },
  }],
});
