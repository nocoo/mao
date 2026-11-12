# Retrospective

## Coordinate fixed-port browser checks

The reviewer and controller started the fullscreen test at the same time, so one run failed because port 4176 was occupied. A new large-screen check inherited vertical mode, and its animation assertion rejected an identity matrix as tilted. Assign ownership of fixed-port checks, reload between cases that need fresh reading mode, and inspect transform matrices rather than requiring a specific CSS serialization.

## Inspect browser-generated data in its actual runtime

A test investigation tried to import `assets/poems.js` as a Node module, but it is a browser script that populates `window.POEM_LIBRARY`. Read the generated data or execute it with the browser-compatible fixture used by the existing tests instead.

## Verify image encoder availability

I assumed the installed FFmpeg included the `libwebp` encoder, but the conversion failed because it was not available. Check the installed encoders or image-library format support before choosing the conversion command.

## Scope secret scans to the deliverable

A no-git scan included ignored local files and dependencies rather than just the release snapshot, producing unrelated findings. Scan the staged changes or the committed tree explicitly; do not broaden a release check to unrelated local files.

## Verify CI slot wiring and touch completion

I declared Worker and HTTP slots as implemented even though the pinned reusable workflow requires each slot's own job to be enabled; local tests alone did not reveal the mismatch. The CI browser test also tapped a control immediately after a swipe without waiting for the touch scroll to end, and requested an artifact no test produced. Wire each declared slot to its actual job, verify the pinned workflow's inputs, and wait for `scrollend` before testing the next gesture.

## Verify lockfiles with the actual pinned package manager

An offline check lacked cached metadata, and the Microsoft mirror did not contain the pinned Playwright release. Disabling pnpm's version manager also selected the machine's pnpm 12 rather than the project's pnpm 11.28.5. Probe an allowed mirror, resolve the project's actual pnpm executable, and verify the frozen lockfile without weakening policy. An initial retrospective edit also used an assumed heading instead of reading the file; check exact context before replacement.

## Reset the actual reading scroll container

The redesigned reader scrolls in `#poemWrap`, but the first implementation reset the inner poem instead. The fullscreen test exposed stale scroll position after navigation. Check the actual scroll owner when replacing layouts and test long-to-short poem navigation at each viewport. The same viewport checks also caught the player's time text overflowing at 320px, and review found the fixed-width catalog extending beyond the screen. Inspect flex children and open overlays at narrow sizes rather than checking the main frame alone.

## Check shared-scope names in integration tests

A new package-version assertion reused the name of a later block-scoped element variable, causing a temporal-dead-zone failure. Use distinct names for metadata and page elements, and run the complete browser suite after adding assertions.

## Test asset range behavior in the Worker runtime

Node mocks exposed Content-Length on asset responses, but the local Worker asset binding did not; the first range implementation therefore returned a full 200 instead of 206. A subsequent buffering fallback also amplified memory use, and the original stream stalled when skipping several chunks. Use verified manifest sizes and fixed-length streaming, and exercise real Wrangler HTTP responses, chunk boundaries, actual audio bytes and browser seeking before deployment.

## Isolate Wrangler from unrelated environment files

A diagnostic `wrangler dev` loaded the repository's unrelated `.env` by default, although it did not print the values. Pass an explicit empty `--env-file` for local runtime tests and inspect process readiness without reusing stale terminal output.

## Keep browser acceptance on the built artifact

A source-mode test adaptation accidentally changed the committed browser checks to reuse an arbitrary development server, weakening production-build coverage. Keep the standard tests on isolated Vite preview ports and adapt request interception to the built asset names.

## Check rail controls when changing title glyph sizing

Giving each vertical title character its own cell improved legibility but increased the rail's height and clipped controls in short desktop windows. Include rail controls in short-viewport checks and reduce rail spacing responsively without squeezing the glyphs.

## Wait for agent registration, not just the prompt text

A new review pane displayed its prompt before Herdr registered the agent, so the first task submission failed. Check the agent's registered status before prompting instead of relying only on terminal output.

## Test prefaces and punctuation in vertical layouts

Splitting vertical columns at every punctuation mark created empty columns inside annotated terms, and a fixed minimum height clipped prefaces in short desktop windows. Split only at sentence boundaries outside annotation buttons, size the poem to its actual container, and check punctuation columns and preface glyph bounds across the corpus.

## Check literary annotations independently of their data

Several proposed rhyme positions followed an inferred pattern despite conflicting source notes or the actual verse form; a data-derived test repeated the same mistake. Cross-check selected examples against original annotations and explicit expected characters, and represent multiple verse endings within one source line precisely instead of assuming every source line is one verse.

## Choose scroll fixtures by rendered length

After grouping source verses into reading lines, the 40-line poem could fit on the largest viewport, so an old test incorrectly assumed it must scroll. Use a sufficiently long actual work and assert its rendered scroll range rather than assuming raw source-line count determines overflow.

## Use returned pane identifiers

I assumed newly created Herdr pane IDs would continue with decimal digits; they switched to letters, so subsequent pane commands failed. Read each split response and use its returned ID instead of predicting the next identifier.

## Ignore stale scroll events when opening notes

A delayed scroll event from navigating to the study section closed a newly opened annotation immediately. Close the popover only if its anchor actually moved after opening, and test navigation within both inline and study annotations.

## Fit vertical text to its actual container

The first structured-poem fit calculation used the prototype's viewport height while the current vertical container was shorter, causing couplets to split on mobile. Match the container height to the design, calculate against that actual height, and test visible column counts at narrow viewports.

## Do not enable transitions while reducing motion

Setting only `transition-duration` on every element unintentionally enabled transitions on properties that previously had none, leaving title sizing stale during rapid navigation. Disable transitions explicitly in the reduced-motion rule and check long titles after successive selections.

## Keep operational logs free of sensitive values

Inspecting unrelated commit subjects and complete development WebSocket URLs can expose credential-like strings or ephemeral tokens in command output. Restrict Git queries to task-specific paths and redact URL query strings before printing diagnostics.

## Count staged Unicode paths safely

I counted staged MP3s using a line-oriented suffix match, but Git quoted Unicode paths, so the check failed before the commit. Disable path quoting or use NUL-delimited Git output when checking staged filenames.

## Test real media and vertical reading behavior

Review found that long vertical poems initially showed their tail, a failed recording did not retry, and changing poems reset the browser's playback rate while retaining the old rate index. Test first-line visibility in both writing modes and exercise media loading, retries and rate changes with a real browser, not only mocked media elements. Hash-only navigation in the viewport test retained the previous writing mode; reload between viewport cases when isolation is required.

## Verify pane split proportions

I interpreted the Herdr split ratio as the new pane's share rather than the original pane's share, briefly leaving the controller too wide. Inspect the resulting layout immediately and resize the controller to one third before starting parallel work.

## Resolve global instruction paths before reading rules

The global agent instructions were loaded through a symlink. I tried to read `rules/git-commit.md` relative to the symlink rather than its real location, so the first read failed. Resolve the real path of `AGENTS.md` before reading its sibling rules or skills.

## Run project checks in the project directory

I initially ran the Mao repository's pnpm checks from the TTS workspace, where there is no project manifest. Run project commands with an explicit repository directory and verify it before launching parallel checks.

## Separate audio structure checks from content acceptance

The first batch copied structurally valid generated MP3s into `audio/` before examining ASR differences. Two recordings contained approximately 32 and 15 seconds of silence, and recognition indicated missing lines. Review ASR deletion spans and long internal silence independently of decoding checks, mark suspicious outputs for listening, and do not claim content acceptance or automatically reroll them.
