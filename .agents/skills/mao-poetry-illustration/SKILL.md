---
name: mao-poetry-illustration
description: Design, generate, review, and integrate poem-specific illustrations for the Mao Poetry Room in its approved revolutionary woodcut style. Use for 山河诗卷诗词配图、生成插画、配图风格 or illustration batches in this repository.
---

# Mao poetry illustration

Create a distinct illustration for each requested reading record, using the poem's own imagery and the approved red woodcut style. The accepted style reference is [the No. 19 sample](../../../design/samples/19-snow-original.png), generated for 《沁园春·雪》; its [exact prompt](../../../design/samples/19-snow-prompt.txt) is the worked example. The user approved its style, not an automatic release of the complete set.

## Scope

| Collection | Reading records | Target illustrations |
| --- | ---: | ---: |
| 正编 | 39 | 39 |
| 副编 | 24 | 24 |
| 补编 | 33 | 33 |
| Total | 96 | 96 |

Use the exact record ID from `data/诗词/index.md`. Grouped poems 14, 26, and 57 each receive one illustration for the complete entry. Check `data/illustrations.json` for completed records. Generate only the scope authorized by the user; approval of this style does not authorize an automatic full-catalog run or publication. The 33 supplementary records include fragments and uncertain attribution: reflect their actual sources and do not invent facts.

## Art direction

- Original Chinese revolutionary-era woodcut print, not a photograph or a reproduction of a historical artwork. Match the reference's hand-carved shapes, gouge marks, rough ink impressions, paper texture, bold contrast, readable large forms, and detailed landscape.
- Use vermilion red, ink black, warm paper white, and restrained greys. Let red provide visual force without overwhelming the subject; keep the balance appropriate to the poem.
- Do not render Red Army soldiers, their uniforms, or horses as solid red. Use neutral ink and paper tones for figures and animals; reserve red for small details such as cap stars or other objects.
- Compose around specific images and mood from the source text. Interpret metaphors visually rather than forcing literal objects; let intimate, elegiac, or contemplative poems keep their own tone. Do not copy the No. 19 landscape or motifs into unrelated poems.
- Use an expansive, dynamic composition where the poem calls for it. Avoid text, calligraphy, captions, watermarks, borders, and photorealistic or 3D imagery. Do not invent historical events or present generated imagery as documentary evidence.

## Format and generation

| Item | Setting |
| --- | --- |
| Model | `gpt-image-2.5-sunburst` via the `agi-image-generation` skill |
| Quality | `high` |
| Native output | Portrait PNG, 1024 × 1536 (2:3) |
| Website frame | Portrait 3:4 |
| Original | Preserve the unmodified generated PNG and its provenance metadata |
| Website copy | Make a separate optimized derivative; review the actual 3:4 crop |

Read and follow the available `agi-image-generation` skill for the current helper and credential setup. Do not print, record, or commit credential values or authenticated headers. The helper is text-only: the reference image and prompt guide an agent's visual judgment, but do not claim the model received the sample as an image. If a reference-image edit is requested, use a verified image-editing route instead.

A centered 3:4 crop of a 2:3 original removes about 11% of its height. Reserve safe space at both ends and inspect the crop: the No. 19 sample's sun is close to the top and can be clipped by a centered crop. Adjust crop position or regenerate when necessary; preserve the original regardless.

## Prompt template

Read the exact record's 正文 and available annotations or context in `data/诗词/`; identify the poem's distinctive scene, emotional tone, and any uncertainty. Adapt this template for each record, using the No. 19 prompt as the style and detail benchmark:

```text
Create a single portrait illustration for [record ID and poem title] in the visual language of a Chinese revolutionary-era woodcut print. Express the poem through [scene and visual interpretation], not by illustrating it literally line by line.

[Describe the poem-specific setting, distinctive motifs, visual relationships, composition, and emotional tone grounded in the source. Interpret metaphors without inventing historical facts.]

Use bold hand-carved shapes, expressive gouge marks, rough ink impressions, layered printmaking textures, and a carefully limited palette of revolutionary vermilion red, ink black, warm paper white, and muted grey. Strong contrast and a dynamic composition, with large readable forms and fine details that reward closer viewing. Balance the red and light areas to suit the poem. Original artwork, not a reproduction of a historical print.

Vertical composition for a 3:4 display frame. The native image may be taller: keep the main subjects inside the central 3:4 area, allowing the top and bottom edges to be cropped. No lettering, calligraphy, caption, watermark, border, photorealism, or 3D rendering.
```

Add poem-specific exclusions where useful, such as avoiding literal snakes and elephants for No. 19. Do not impose those exclusions on poems that actually depict animals.

## Workflow and acceptance

1. Confirm the requested record IDs and output scope. Read their primary text, annotations, and the approved sample; prepare a distinct prompt for each record.
2. Generate with the settings above, one request at a time in record order, waiting at least 35 seconds after each completed call before the next. On an explicit 429, honor the service's retry delay; stop on ambiguous failures rather than risking duplicate generation. Preserve each exact prompt and original PNG alongside its record ID; never overwrite an existing original or silently replace a failed result. Create website derivatives separately.
3. Visually review each image against its poem and the sample: composition, subject, style, artifacts, and the actual 3:4 crop. Record failed or missing images and obtain human review; do not treat successful generation as visual acceptance.
4. When integration is requested, map images deterministically to exact record IDs in `data/illustrations.json` and display the poem title beneath the image. Keep the image upright after any entrance animation, use positive geometric accents rather than a diagonal bar behind it, and allow larger images on wide screens without overlapping the text. Update the affected tests and documentation, and verify desktop, mobile, and vertical layouts. Explain the illustration's generated, non-historical nature in project documentation. Open the project using the Caddy URL in `AGENTS.md`.
5. Report generated, accepted, and still-missing counts separately. Generation and a local commit do not authorize deployment or publication.
