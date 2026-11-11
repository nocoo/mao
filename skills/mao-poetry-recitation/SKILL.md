---
name: mao-poetry-recitation
description: Generate Mao Zedong poetry recitations offline with local Fish Audio Drama 3 and an authorized broadcast-style voice reference. Use for 毛主席诗词朗诵, 央广风格朗诵, or pure-voice poetry audio for this project.
compatibility: Apple Silicon macOS with the existing Fish Drama 3 and fish-drama-podcast workspaces, FFmpeg, and local Whisper.
---

# Mao poetry recitation

Produce expressive, full-bodied, mid-20th-century Chinese broadcast-style recitation with a single voice. Do not add music, sound effects, a second voice, or ambient tracks. The current generator has no independent style instruction: its delivery is guided by the reference recording, not guaranteed by a text prompt. Have the user judge the actual style, voice, and any background sound; do not claim historical authenticity or impersonate an identified broadcaster.

## Inputs and permissions

- Select the requested poem's **正文** from `data/诗词/` in this repository, or use the exact text supplied by the user. Confirm whether a request for one poem in a series means one piece or the full series. Do not include notes, explanations, or titles unless requested. Preserve the selected version and all characters; do not silently resolve variants.
- Before cloning another person's voice, confirm the user's consent or other legal right for the reference and intended use. The user's confirmation for a past test is not blanket permission for later uses or publication. Do not publish, distribute, or add recordings to this repository without separate authorization.
- The tested reference is `~/workspace/references/tts/十六字令-朗诵参考/单首试听/01-央广播报版.m4a`, SHA-256 `3540c3a826f1708a1b013ccaa9bf529ed609419b35978832ac1e6e68df5d7135`. Its uploader labels it as a Central People's Broadcasting Station broadcast: <https://www.bilibili.com/video/BV1jLVzzXEju/>. The narrator and historical provenance are unverified. It is not bundled with this skill; if missing or changed, stop and ask for the original or an explicitly approved, authorized alternative. Do not silently substitute another voice.
- The tested reference transcript is exactly `山，快马加鞭未下鞍。惊回首，离天三尺三。`. For a different reference, require its matching transcript and verify its speech and absence of music by listening; never pair it with the default transcript.

## Local workflow

This skill relies on the existing local `fish-drama-podcast` skill and its locked runner. Read `~/workspace/personal/workflow/agents/skills/fish-drama-podcast/SKILL.md` first and follow its dependency checks, lock, planning, generation, verification, offline ASR and preservation rules. Do not run the model directly, bypass its lock, install packages, download weights, or send audio to a remote service. If the runner, model, reference or Whisper is missing, report the missing dependency and stop.

Prepare a UTF-8 plain-text source file outside the repository. It must end in a complete sentence; do not add emotion tags or spoken instructions. Use the reference as the voice and delivery guide. Check memory, disk and competing workloads before generation.

The following example uses the tested reference. Set `SOURCE` to the prepared absolute source path and verify the reference hash and authorization before running it. The temporary input directory and output are new, separate from the model workspace; the runner snapshots the inputs and refuses an existing output directory.

```bash
set -euo pipefail
ROOT="$HOME/workspace/references/tts/outputs/fish-drama-3"
WORKSPACE="$HOME/workspace/references/tts/fish-drama-3"
SKILL="$HOME/workspace/personal/workflow/agents/skills/fish-drama-podcast"
RUN="$SKILL/scripts/run.sh"
REF="$HOME/workspace/references/tts/十六字令-朗诵参考/单首试听/01-央广播报版.m4a"
SOURCE="/absolute/path/to/poem.txt"

printf '%s  %s\n' '3540c3a826f1708a1b013ccaa9bf529ed609419b35978832ac1e6e68df5d7135' "$REF" | shasum -a 256 -c
"$WORKSPACE/.venv/bin/python" -B -m unittest discover -s "$SKILL/tests" -v
mkdir -p "$ROOT"
INPUT=$(mktemp -d "$ROOT/poem-input-XXXXXXXX")
OUT="$ROOT/poem-$(date +%Y%m%d-%H%M%S)-${INPUT##*-}"
ffmpeg -hide_banner -loglevel error -n -i "$REF" -ac 1 -ar 44100 -c:a pcm_s16le "$INPUT/reference.wav"
printf '山，快马加鞭未下鞍。惊回首，离天三尺三。\n' > "$INPUT/reference.txt"
"$RUN" plan --source "$SOURCE" --reference "$INPUT/reference.wav" --reference-text "$INPUT/reference.txt" --output "$OUT"
```

Inspect `plan.json` and announce the poem, sentence/token counts, internal chunks, edits, joins and rough duration before generating. Follow the runner's sentence/token rules; if planning requests an edit, review it and never change or omit poem characters. A short poem is intentionally shorter than the podcast skill's 30–60 minute target: never pad or repeat it.

```bash
/usr/bin/time -p "$RUN" generate --output "$OUT" 2>&1 | tee "$OUT/generate.log"
"$RUN" verify --output "$OUT"
/usr/bin/time -p "$RUN" asr --output "$OUT" 2>&1 | tee "$OUT/asr.log"
```

Monitor CPU and RSS during generation as described by the runner skill. Keep the source, reference, output and logs for provenance. Deliver `podcast.wav` and `podcast.mp3` with their paths and actual duration. Report ASR differences, validation and resource measurements; do not treat ASR as a listening verdict or automatically reroll. Ask the user to check pronunciation, completeness, feeling, era style and absence of background sound before acceptance.

## Tested example

The accepted listening test used `十六字令三首（其一）`, the reference above, and one model block. The output was 9.34 seconds with no added background track. Offline ASR reported homophone differences for `加鞭` and `鞍惊`; this does not prove a pronunciation error. The user judged the result satisfactory. This is evidence for that specific run, not a guarantee for other poems or references.

For Pi, this repository's `skills/` directory is not a default discovery location. From the repository root, load this skill explicitly with `pi --skill skills/mao-poetry-recitation`, or configure that directory as a skill location.
