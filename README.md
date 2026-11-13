# 山河诗卷 · Mao Poetry Room

A static poetry reading room based on the design prototype in `mao-poetry.html`: a red-and-paper reading stage, catalog, matrix, study materials, and recordings. Built with Vite, native JavaScript and CSS; Cloudflare R2 serves media through a CDN, with no production framework or database.

## Run and verify

Node.js 22.13+ and pnpm are required. CI uses Node.js 26.12.1 and pnpm 11.28.5.

```bash
pnpm install
pnpm dev              # http://127.0.0.1:7065 or https://mao.dev.hexly.ai
pnpm build            # regenerate poem data and build dist/
pnpm preview          # preview dist/ on 127.0.0.1:7065
pnpm test             # data, view model, player, deployment tests
pnpm test:coverage    # Node tests and coverage/lcov.info
pnpm deploy:check     # Wrangler local dry run; no deployment
pnpm test:worker      # build first; isolated local Worker and HTTP checks
pnpm test:browser     # build first; preview on 4175 and check interactions
pnpm test:fullscreen  # build first; preview on 4176 and check nine viewports
```

Browser tests use local Google Chrome on macOS, or `CHROME_PATH` / Playwright Chromium on other systems. Test servers stop automatically. The development and preview commands use a fixed port and cannot run together.

## Reading

The catalog contains 100 indexed records: 42 正编, 25 副编, and 33 补编. The prototype's star-curtain entrance and poem transitions are skipped when reduced motion is requested. Search by title, year, number, or verse; the matrix opens any record. Each page presents its reading text, available notes, context, appreciation, editorial remarks, and original versions. Structural labels follow the individual form: regulated verse, lyric stanzas, single-stanza lyrics, older verse, fragments, and memorial texts are not treated alike. Rhyme highlights are available only where identified; uncertain cases remain unmarked. These analyses are editorial readings of the available records, not a fully verified prosodic or historical edition. Sources remain separate, and missing material is identified rather than invented. Records 01–19, including all three parts of record 14, use their generated CDN illustrations. Records without an illustration randomly reuse three prototype placeholders. These illustrations are not historical images.

Vertical reading moves the illustration to the left and arranges verse columns right to left. Longer works scroll horizontally by touch, trackpad, or arrow keys when the reading area is focused; on mobile, the rail's “横” button returns to horizontal reading. Layout refinement references Unslop by [Damir Sokolovsky](https://x.com/heydamir), CC BY 4.0.

The player streams the selected poem's MP3 from the CDN. It supports play/pause, seeking, speed, and previous/next poem. No sentence timestamps are available, so the interface does not claim word- or line-synchronized highlighting. Three missing recordings are marked unavailable. Keyboard shortcuts: `Space` play/pause, `←` / `→` seek outside the reading area, `↑` / `↓` change poem, `/` search, `L` catalog, `M` matrix, `T` theme, `V` vertical text, `N` notes, `Esc` close.

The 97 MP3s are locally generated synthetic recitations, not historical broadcasts. The narrator and historical provenance of the reference voice are unverified. No background track was mixed; the absence of background sound and the completeness, pronunciation, and delivery of **all recordings require human listening review**. Eight tracks are prioritized because of long silence or ASR differences; three failed generation. See [`audio/README.md`](audio/README.md) and [`audio/manifest.json`](audio/manifest.json). The project owner confirmed authorization for the reference voice and its intended distribution. A local commit is not a website deployment approval.

## Data and architecture

[`data/诗词/index.md`](data/诗词/index.md) and the indexed Markdown files are authoritative. [`scripts/build-data.mjs`](scripts/build-data.mjs) extracts the reading text, prefaces, source-specific annotations and original versions into [`assets/poems.js`](assets/poems.js). Edit Markdown, not the generated file. [`data/illustrations.json`](data/illustrations.json) maps record IDs to generated CDN illustrations; records without an entry use a prototype placeholder. Each record in [`data/analysis/`](data/analysis/) references that text by line index and available annotations by source; it does not duplicate or rewrite the reading text. Rhyme marks reference specific characters and offsets within the source text, including multiple verse endings on one line. An empty list means the rhyme has not been determined, not that the work lacks rhyme; partial analyses include a note. [`src/view-model.js`](src/view-model.js) validates and maps those records and the audio manifest into presentation data; [`src/media.js`](src/media.js) derives each audio CDN URL from its poem ID and content hash, [`src/player.js`](src/player.js) controls playback, and [`app.js`](app.js) renders the views and connects user actions.

Builds include the original documents and locally hosted font licenses, but not the MP3 files; the source recordings remain in `audio/`. Text from the corpus is rendered as text, not executable HTML. Anonymous `GET /api/live` serves build-generated JSON with `status: "ok"` and the raw version from `package.json`, with `Cache-Control: no-store`; it establishes asset delivery, not audio content quality or external dependency health. R2 serves the MP3 byte ranges directly. Local tests verify the source recordings against the manifest and use isolated CDN fixtures; the release verifier checks a real CDN audio range. See [`data/诗词/校勘记录.md`](data/诗词/校勘记录.md) for textual caveats, and [`skills/mao-poetry-recitation/SKILL.md`](skills/mao-poetry-recitation/SKILL.md) for the offline generation workflow and permissions.

## CI and deployment

[CI](.github/workflows/ci.yml) runs the pinned `nocoo/base-ci` workflow: workflow validation, Gitleaks, OSV, build, Wrangler dry run, Node tests with LCOV, local Worker HTTP checks, and Chromium browser checks. There is no coverage threshold, TypeScript check, or application lint configuration. Safari and Firefox have not been independently accepted.

[Release](.github/workflows/release.yml) deploys a successful same-repository `main` push-CI to the Cloudflare Worker at `mao.hexly.ai`, verifies the source run and commit, rebuilds, and checks the published revision, health endpoint and a byte range of the recording. When credentials are absent, automatic deployment is skipped; a manually triggered deployment fails. CI success or a skipped deployment does not establish that the site is live.

To enable deployment, configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub Actions. The token must have Workers deployment and custom-domain permissions. Never put credentials in the repository. A successful prior main push-CI can be deployed manually using its run ID:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo nocoo/mao
gh secret set CLOUDFLARE_ACCOUNT_ID --repo nocoo/mao
gh run list --repo nocoo/mao --workflow CI
gh workflow run release.yml --repo nocoo/mao --ref main -f source-run-id=SUCCESSFUL_PUSH_CI_RUN_ID
```

Cloudflare domain ownership, token permissions, public routing, voice rights, and the published revision must be verified before an actual release. Do not treat this local implementation as release authorization.
