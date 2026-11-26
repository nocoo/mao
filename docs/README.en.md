<h1 align="center">Mao Poetry Room</h1>
<p align="center">A red-and-paper digital reading room for Mao Zedong's poetry with catalog search, matrix view, editorial notes, and CDN audio playback.</p>
<p align="center"><a href="https://mao.hexly.ai">Website</a> · <a href="../README.md">简体中文</a></p>

## What It Does

`Mao Poetry Room` (`shanhe-poetry-room`) is a static poetry reading room built with Vite, native ES modules, and CSS, deployed to Cloudflare Workers ([mao.hexly.ai](https://mao.hexly.ai)) with Cloudflare R2 CDN serving illustrations and audio.

The site uses no runtime UI framework or database. The `audio/` directory holds 96 local MP3 files (1 reference track and 95 synthetic recitations generated with Fish Audio Drama 3, not historical broadcasts), all requiring human listening review. A local commit does not authorize R2 uploads or site deployment.

## Features

- **96 indexed entries**: 39 正编, 24 副编, and 33 补编 entries, preserving three original poem groups, form-specific structural labels, textual notes, context, appreciation, and rhyme highlights where identified.
- **Reading & navigation**: search by title, year, number, or verse; matrix view; horizontal and vertical reading modes; light/dark themes; and `prefers-reduced-motion` support.
- **CDN audio & shortcuts**: play/pause, seeking, speed control, and previous/next poem (without word-level timestamps), plus keyboard shortcuts (`Space`, `←`/`→`, `↑`/`↓`, `/`, `L`, `M`, `T`, `V`, `N`, `Esc`).
- **Health endpoint**: `GET /api/live` serves build-generated JSON with status and package version (`Cache-Control: no-store`).

## Usage

Visit the live site at [mao.hexly.ai](https://mao.hexly.ai).

Preview the built site locally:

```sh
pnpm install --frozen-lockfile
pnpm run build            # regenerate assets/poems.js and build dist/
pnpm run preview          # preview dist/ on 127.0.0.1:7065
```

## Development

Requires Node.js 22.13+ and pnpm (`pnpm@11.28.5`; CI uses Node `26.12.1`). Edit source records in [`data/诗词/index.md`](../data/诗词/index.md), [`data/analysis/`](../data/analysis/), [`data/illustrations.json`](../data/illustrations.json), and [`audio/manifest.json`](../audio/manifest.json)—never edit generated [`assets/poems.js`](../assets/poems.js) directly.

```sh
pnpm run build:data       # regenerate assets/poems.js
pnpm run dev              # start local Vite dev server (127.0.0.1:7065)
pnpm run deploy:check     # Wrangler local dry-run without deploying
pnpm run verify:production # read-only check of live site and CDN byte ranges
```

## Tests

Build `dist/` with `pnpm run build` before running Worker or browser suites. Tests use isolated local CDN fixtures and never publish to R2.

```sh
pnpm run test             # run data, view-model, player, and deployment tests
pnpm run test:coverage    # Node unit tests with coverage/lcov.info
pnpm run test:worker      # isolated local Worker and HTTP checks
pnpm run test:browser     # Chromium interaction tests on :4175
pnpm run test:fullscreen  # desktop fullscreen and vertical layout checks on :4176
```

## Stack

- **Frontend**: native JavaScript (ES Modules), CSS ([`app.js`](../app.js), [`src/view-model.js`](../src/view-model.js), [`src/media.js`](../src/media.js), [`src/player.js`](../src/player.js))
- **Build & data pipeline**: Vite, Node.js build script ([`scripts/build-data.mjs`](../scripts/build-data.mjs))
- **Hosting & media**: Cloudflare Workers (Wrangler), Cloudflare R2 CDN
- **Testing & CI**: Node Test Runner, Playwright, GitHub Actions ([CI](../.github/workflows/ci.yml), [Release](../.github/workflows/release.yml))

## Documentation

- [Project Contract](../AGENTS.md)
- [Audio Notes](../audio/README.md) · [Textual Collation](../data/诗词/校勘记录.md)
- [Changelog](../CHANGELOG.md) · [Retrospective](../Retrospective.md)
- [Recitation Skill](../skills/mao-poetry-recitation/SKILL.md)

## License

This repository does not include a root `LICENSE` file. Bundled fonts, reference materials, and audio assets follow their respective source notices.
