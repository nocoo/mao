# Mao Poetry Room

See [README.md](README.md) for project setup and checks, and [Retrospective.md](Retrospective.md) for incident history.

For poem illustration work, use the [mao-poetry-illustration skill](.agents/skills/mao-poetry-illustration/SKILL.md). For poetry recitation synthesis and manifest updates, use the [mao-poetry-recitation skill](.agents/skills/mao-poetry-recitation/SKILL.md). For media uploads and CDN migration, use the [mao-media-cdn skill](.agents/skills/mao-media-cdn/SKILL.md).

## Local development

Open the project in Chrome at https://mao.dev.hexly.ai through Caddy, rather than a localhost URL.

On this machine, Caddy proxies the domain to `127.0.0.1:4173`, while `pnpm dev` defaults to port 7065. Reuse an existing project server on port 4173, or start one from the repository root:

```sh
pnpm build:data && pnpm exec vite --host 127.0.0.1 --port 4173 --strictPort
```

If the domain does not reach the project, check the local Caddy mapping and the server before opening the page.


## Verification

Quality follows System1 v1.3.0 Native Mode (`nocoo/base-ci v2026.15`) in `.github/workflows/quality-slots.yml` and `.github/workflows/ci.yml`. Status: `enforced` | `planned` | `manual` | `N/A`.

| Slot | Status | Evidence |
| --- | --- | --- |
| `S1` Types | N/A | Plain JS project without TypeScript |
| `S2` Lint | planned | No lint script configured |
| `S3` Workflow | enforced | SHA-pinned workflow action check in CI |
| `G1` Secrets | enforced | `gitleaks` scan in CI |
| `G2` Dependencies | enforced | `osv-scanner` scan (`pnpm-lock.yaml`) in CI |
| `B1` Build | enforced | `pnpm run build && pnpm run deploy:check` in CI |
| `L1` Unit | enforced | `pnpm run test:coverage` in CI |
| `L2` Runtime | enforced | `pnpm run test:worker -- --http-only` in CI |
| `L3` Integration | enforced | `pnpm run test:worker -- --http-only` in CI |
| `L4` E2E | enforced | `pnpm run test:worker && pnpm run test:browser && pnpm run test:fullscreen` in CI |
| `P1` Package | N/A | Deployed as Cloudflare Worker, not an npm package |
| `Z1` Gate | enforced | `quality / Z1: Gate` required status check on `main` |
