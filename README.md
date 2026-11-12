# 山河诗卷 · Mao Poetry Room

A static poetry reading room based on the design prototype in `mao-poetry.html`: a red-and-paper reading stage, catalog, matrix, study materials, and recordings. Built with Vite, native JavaScript and CSS; no production framework or backend.

## Run and verify

Node.js 22.13+ and pnpm are required. CI uses Node.js 26.12.1 and pnpm 11.28.5.

```bash
pnpm install
pnpm dev              # http://127.0.0.1:4173
pnpm build            # regenerate poem data and build dist/
pnpm preview          # preview dist/ on 127.0.0.1:4173
pnpm test             # data, view model, player, deployment tests
pnpm test:coverage    # Node tests and coverage/lcov.info
pnpm deploy:check     # Wrangler local dry run; no deployment
pnpm test:browser     # build first; preview on 4175 and check interactions
pnpm test:fullscreen  # build first; preview on 4176 and check six viewports
```

Browser tests use local Google Chrome on macOS, or `CHROME_PATH` / Playwright Chromium on other systems. Test servers stop automatically. The development and preview commands use a fixed port and cannot run together.

## Reading

The catalog contains 100 indexed records: 42 正编, 25 副编, and 33 补编. Search by title, year, number, or verse; the matrix opens any record. Each page presents its reading text, available notes, context, appreciation, editorial remarks, and original versions. Sources remain separate, and missing material is identified rather than invented. Three prototype illustrations are randomly reused as placeholders; they are not historical images.

The player uses the local MP3 for the selected poem. It supports play/pause, seeking, speed, and previous/next poem. No sentence timestamps are available, so the interface does not claim word- or line-synchronized highlighting. Three missing recordings are marked unavailable. Keyboard shortcuts: `Space` play/pause, `←` / `→` seek, `↑` / `↓` change poem, `/` search, `L` catalog, `M` matrix, `T` theme, `V` vertical text, `N` notes, `Esc` close.

The 97 MP3s are locally generated synthetic recitations, not historical broadcasts. The narrator and historical provenance of the reference voice are unverified. No background track was mixed; the absence of background sound and the completeness, pronunciation, and delivery of **all recordings require human listening review**. Eight tracks are prioritized because of long silence or ASR differences; three failed generation. See [`audio/README.md`](audio/README.md) and [`audio/manifest.json`](audio/manifest.json). Prior to public release, confirm the authorization for the reference voice and intended distribution; a local commit is not a publication approval.

## Data and architecture

[`data/诗词/index.md`](data/诗词/index.md) and the indexed Markdown files are authoritative. [`scripts/build-data.mjs`](scripts/build-data.mjs) extracts the reading text, prefaces, source-specific annotations and original versions into [`assets/poems.js`](assets/poems.js). Edit Markdown, not the generated file. [`src/view-model.js`](src/view-model.js) maps those records and the audio manifest into presentation data; [`src/player.js`](src/player.js) controls real media playback, while [`app.js`](app.js) renders the views and connects user actions. No interpretations or rhyme data are fabricated.

Builds include the original documents, audio files, and locally hosted font licenses. Text from the corpus is rendered as text, not executable HTML. See [`data/诗词/校勘记录.md`](data/诗词/校勘记录.md) for textual caveats, and [`skills/mao-poetry-recitation/SKILL.md`](skills/mao-poetry-recitation/SKILL.md) for the offline generation workflow and permissions.

## CI and deployment

[CI](.github/workflows/ci.yml) runs the pinned `nocoo/base-ci` workflow: workflow validation, Gitleaks, OSV, build, Wrangler dry run, Node tests with LCOV, and Chromium browser checks. There is no coverage threshold, TypeScript check, or application lint configuration. Safari and Firefox have not been independently accepted.

[Release](.github/workflows/release.yml) deploys a successful same-repository `main` push-CI to the Cloudflare Worker at `mao.hexly.ai`, verifies the source run and commit, rebuilds, and checks the published revision. When credentials are absent, automatic deployment is skipped; a manually triggered deployment fails. CI success or a skipped deployment does not establish that the site is live.

To enable deployment, configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions. The token must have Workers deployment and custom-domain permissions. Never put credentials in the repository. A successful prior main push-CI can be deployed manually using its run ID:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo nocoo/mao
gh secret set CLOUDFLARE_ACCOUNT_ID --repo nocoo/mao
gh run list --repo nocoo/mao --workflow CI
gh workflow run release.yml --repo nocoo/mao --ref main -f source-run-id=SUCCESSFUL_PUSH_CI_RUN_ID
```

Cloudflare domain ownership, token permissions, public routing, voice rights, and the published revision must be verified before an actual release. Do not treat this local implementation as release authorization.
