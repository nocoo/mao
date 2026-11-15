---
name: mao-poetry-recitation
description: Generate or regenerate Mao Zedong poetry recitations with Fish Audio Drama 3 conditioned on audio/19-沁园春·雪.mp3, update audio/*.mp3 and audio/manifest.json, and verify playback checks. Use for 毛主席诗词朗诵, 补录或重录单篇音频, and updating audio/manifest.json in this repository.
---

# Mao poetry recitation

Produce expressive Chinese broadcast-style solo poetry recitations for records in this repository. Do not mix music, sound effects, a second voice, or ambient tracks. Have the user review pronunciation, completeness, and delivery by listening; do not treat automated silence scanning or ASR as listening approval.

## Scope and reference voice

- All 96 catalog entries (`01`–`96`) come from `data/诗词/index.md` via `scripts/build-data.mjs`. Never edit `assets/poems.js` directly.
- Poem `19` (`audio/19-沁园春·雪.mp3`, SHA-256 `7e7924821ff552da1a7437909894be2d777f44f48dba107d14fb54e37cd4b87c`, `1,022,371` bytes, `63.84s`) is the project reference anchor. Do not overwrite or delete it unless explicitly instructed.
- When cloning for V2 batches or single-poem re-takes, extract the first `33.0` seconds (`上阕`, 44.1 kHz mono PCM16 WAV) of `audio/19-沁园春·雪.mp3` with exact plain transcript:
  `北国风光，千里冰封，万里雪飘。望长城内外，惟余莽莽；大河上下，顿失滔滔。山舞银蛇，原驰蜡象，欲与天公试比高。须晴日，看红装素裹，分外妖娆。`
- Obtain explicit owner authorization before using a new reference voice or uploading generated MP3s to public CDN (`mao-media-cdn`).

## Text normalization rules

When extracting `body` lines from `scripts/build-data.mjs` (`buildLibrary()`), preserve all poem characters and normalize only non-spoken markers or missing punctuation so `split_drama3_text` splits cleanly:

- Remove residual missing-text markers: `（下佚）` / `(下佚)` (e.g., `67`).
- Remove inline attribution markers: `（毛）` / `（萧）` (e.g., `67`, `71`).
- Normalize ASCII commas `,` to full-width `，` (e.g., `02`, `03`, `06`, `15`, `16`, `18`, `24`, `25`, `33`, `34`, `43`).
- Compact spaced signature lines and punctuate cleanly (e.g., `76`: `军 长 朱 德` → `军长朱德，`, `党代表 毛泽东` → `党代表毛泽东。`).
- Add clause/terminal punctuation on unpunctuated lines (e.g., `89`) and ensure the final character ends cleanly with punctuation (`09`, `43`).
- Record every applied rule in that poem's `adjustments` array in `audio/manifest.json`.

## Generation and promotion workflow

Synthesis runs via the cross-repo skill stack under `~/workspace/personal/system/system2/antigravity/skills/`:

1. `mao-poetry-recitation` (`scripts/mao_recitation.py`): inspects missing/target poem IDs against `audio/manifest.json`, delegates generation, and promotes verified MP3s into `audio/`.
2. `fish-drama-3` (`scripts/fish_drama3_batch.py`): prepares `reference.wav`, `reference.txt`, `items.json`, and builds the remote worker (`fishaudio/drama-3` FP8 + `fishaudio/s2-pro` DAC codec, `-45 dBFS` edge alignment, `target-v2` `dynaudnorm`, `44.1 kHz` mono MP3).
3. `colab-fleet` (`scripts/colab_fleet.py`): schedules the batch job on Google Colab `G4` (blackwell 102 GB VRAM, omitting `--high-mem`), downloads `tts_outputs_v2.tar.gz` and `result.json`, and cleans up the Colab session in `finally`.

Typical incremental commands from the `mao` repo root:

```bash
PY=python3.14
MAO_SKILL=~/workspace/personal/system/system2/antigravity/skills/mao-poetry-recitation/scripts/mao_recitation.py

$PY "$MAO_SKILL" status --mao-repo .
$PY "$MAO_SKILL" generate --mao-repo . --ids 01,16 --accel g4
$PY "$MAO_SKILL" apply-job --mao-repo . --job-dir ~/.local/state/colab-fleet/jobs/job-<id>
```

## Verification and CDN boundary

After updating `audio/*.mp3` and `audio/manifest.json`, run the full local verification suite from the `mao` root before committing:

```bash
pnpm build && pnpm test && pnpm deploy:check && pnpm test:worker && pnpm test:browser && pnpm test:fullscreen
```

Local replacement and commits do not upload MP3s to `https://m.no.mt/`. When deploying updated or new tracks, run the `mao-media-cdn` workflow separately to upload content-hashed objects (`audio/<id>-<first-16-sha256-hex>.mp3`) to Cloudflare R2.
