# Retrospective

## Resolve global instruction paths before reading rules

The global agent instructions were loaded through a symlink. I tried to read `rules/git-commit.md` relative to the symlink rather than its real location, so the first read failed. Resolve the real path of `AGENTS.md` before reading its sibling rules or skills.
