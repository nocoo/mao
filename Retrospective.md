# Retrospective

## Resolve global instruction paths before reading rules

The global agent instructions were loaded through a symlink. I tried to read `rules/git-commit.md` relative to the symlink rather than its real location, so the first read failed. Resolve the real path of `AGENTS.md` before reading its sibling rules or skills.

## Run project checks in the project directory

I initially ran the Mao repository's pnpm checks from the TTS workspace, where there is no project manifest. Run project commands with an explicit repository directory and verify it before launching parallel checks.

## Separate audio structure checks from content acceptance

The first batch copied structurally valid generated MP3s into `audio/` before examining ASR differences. Two recordings contained approximately 32 and 15 seconds of silence, and recognition indicated missing lines. Review ASR deletion spans and long internal silence independently of decoding checks, mark suspicious outputs for listening, and do not claim content acceptance or automatically reroll them.
