# Mao Poetry Room

Static red-and-paper Mao Zedong poetry reading room (`shanhe-poetry-room`) built with Vite, native ES modules, and CSS, deployed to Cloudflare Workers (`mao.hexly.ai`) with Cloudflare R2 media (`https://m.no.mt`).
Docs: [README.md](README.md) · [Retrospective](Retrospective.md) · [Quality CI](.github/workflows/quality-slots.yml)
Skills: [mao-poetry-illustration](.agents/skills/mao-poetry-illustration/SKILL.md) · [mao-poetry-recitation](.agents/skills/mao-poetry-recitation/SKILL.md) · [mao-media-cdn](.agents/skills/mao-media-cdn/SKILL.md)

## Commands

Run from repository root with Node.js 22.13+ and pnpm (`pnpm@11.28.5`; CI uses Node 26.12.1). Build `dist/` before running worker or browser suites.

```sh
pnpm install --frozen-lockfile
pnpm run build:data && pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort  # https://mao.dev.hexly.ai via Caddy
pnpm run dev              # local Vite dev on 127.0.0.1:7065 (--strictPort)
pnpm run build && pnpm run deploy:check   # B1 build + Wrangler dry-run (no deploy)
pnpm run typecheck                        # S1: TypeScript checkJs
pnpm run lint                             # S2: Biome lint and format check
pnpm run test:coverage    # L1 Node tests + coverage/lcov.info
pnpm run test:worker -- --http-only       # L2/L3 isolated local Worker HTTP checks
pnpm run test:worker && pnpm run test:browser && pnpm run test:fullscreen  # L4 E2E
```

## Invariants

- Open local dev in Chrome at `https://mao.dev.hexly.ai` via Caddy (`127.0.0.1:4173`), not localhost; reuse a running port `4173` server and verify Caddy mapping if unreachable.
- Edit source data in `data/诗词/`, `data/analysis/`, `data/illustrations.json`, and `audio/manifest.json` — never edit generated `assets/poems.js` (`pnpm run build:data` regenerates it).
- Keep static assets on default assets-first routing (`worker/index.js` forwards to `ASSETS`, no `run_worker_first`); MP3s stay out of `dist/` and stream via CDN (`https://m.no.mt`).
- Pass `--env-file /dev/null` when running ad-hoc `wrangler` commands locally so unrelated `.env` files are not loaded.
- Use the repo skills above for poem illustrations, recitation synthesis/manifest updates, and R2 media uploads; never invent missing audio or treat automated checks as listening approval.
- A local commit does not authorize R2 uploads or site deployment (`mao.hexly.ai`); obtain explicit authorization before uploading media or running [release.yml](.github/workflows/release.yml).

## Quality & Local Gates

Follows `system1-quality`; CI slot definitions and pinned `base-ci` revision live in [.github/workflows/quality-slots.yml](.github/workflows/quality-slots.yml) (called by [ci.yml](.github/workflows/ci.yml), with `quality / Z1: Gate` required on `main`). Status vocabulary: `enforced`, `planned`, `manual`, `N/A`.

- **Exceptions / gaps**: `S1 Types` is `enforced` via `tsc --noEmit` (`checkJs: true`, `pnpm run typecheck`); `S2 Lint` is `enforced` via Biome (`pnpm run lint`); `P1 Package` is `N/A` (Cloudflare Worker, not npm); `L1 Unit` has no numeric coverage floor.
- **Browser scope**: Chromium is `enforced` in CI; Safari and Firefox are not independently verified.
- **Local hooks**: None configured (`.husky/` and `.githooks/` are absent); run local checks manually before commit/push, with CI `quality / Z1: Gate` as the independent backstop.

## Resources & Isolation

| Lane        | Endpoint / State                                                                                                | Boundary                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Dev (Caddy) | `https://mao.dev.hexly.ai` -> `127.0.0.1:4173`                                                                  | Reuse running `4173` server; `pnpm run dev` / `preview` bind `127.0.0.1:7065`             |
| Tests       | Ephemeral Worker port + temp dir (`test:worker`); `127.0.0.1:4175` (`test:browser`), `4176` (`test:fullscreen`) | Built `dist/` + mocked CDN fixtures; do not run fixed-port browser suites concurrently    |
| CDN / Prod  | `https://m.no.mt` (R2 bucket `mao`), `https://mao.hexly.ai` (Worker)                                            | Read-only checks (`pnpm run verify:production`) unless upload or deployment is authorized |

## Retrospective

Record incident narratives in [Retrospective.md](Retrospective.md); promote recurring project constraints to `Invariants` above and enforceable safeguards to tests or hooks.
