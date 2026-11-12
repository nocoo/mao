# Retrospective

## Reset the actual reading scroll container

The redesigned reader scrolls in `#poemWrap`, but the first implementation reset the inner poem instead. The fullscreen test exposed stale scroll position after navigation. Check the actual scroll owner when replacing layouts and test long-to-short poem navigation at each viewport. The same viewport checks also caught the player's time text overflowing at 320px, and review found the fixed-width catalog extending beyond the screen. Inspect flex children and open overlays at narrow sizes rather than checking the main frame alone.

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
