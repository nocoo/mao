# Poetry recitation review

The current manifest has 96 records: 90 generated recordings, 3 original generation failures, and 3 grouped recordings currently missing. The 90 local recordings total approximately 2,383.75 seconds and 38,237,482 bytes. Eight generated recordings retain priority listening review flags.

All generated tracks need human listening review. No background track was mixed; the absence of generated or reference background sound has not been independently verified by listening. The reference voice's historical attribution is unverified. These are synthetic recordings, not historical broadcasts. The project owner confirmed authorization for the current batch's reference voice and public distribution.

## Original generation failures

These three failures are from the original 100-entry generation run and are not group-merge placeholders.

| ID | Title | Reason |
| --- | --- | --- |
| 39 | 念奴娇·鸟儿问答 | Empty or frame-limited model output; original evidence preserved. |
| 51 | 五律·看山 | Empty or frame-limited model output; original evidence preserved. |
| 78 | 祭文·祭黄帝陵 | Empty or frame-limited model output; original evidence preserved. |

## Missing group recordings

These three records are newly marked `missing` after user-requested grouping. They are not generation failures. Their obsolete per-poem local recordings were removed, and no replacement group recording is currently present.

| ID | Title | Removed local IDs |
| --- | --- | --- |
| 14 | 十六字令三首 | 14-1, 14-2, 14-3 |
| 26 | 七律二首·送瘟神 | 26-1, 26-2 |
| 57 | 七绝二首·纪念鲁迅八十寿辰 | 57-1, 57-2 |

## Priority listening review

Long silence of at least 3 seconds or an ASR replacement/deletion of at least 10 characters triggered this list. These indicators can be false positives; ASR homophones and traditional characters are not proof of wrong speech. Other tracks also need listening.

| ID | Title | Silence ≥3s | Long ASR differences |
| --- | --- | --- | --- |
| 10 | 渔家傲·反第一次大“围剿” | — | 1 |
| 21 | 七律·和柳亚子先生 | 31.69s | 1 |
| 37 | 贺新郎·读史 | 14.89s | 2 |
| 40 | 五古·挽易昌陶 | 3.49s | 0 |
| 47 | 五律·张冠道中 | — | 1 |
| 80 | 四言诗（1939年6月1日） | 3.23s | 0 |
| 83 | 七律·读报有感（1959年） | — | 1 |
| 87 | 七绝·豫章西望（1971年9月以后） | — | 1 |

## Original-generation evidence

The original 100-entry batch generated 97 recordings, with 3 original failures, totaling the then-recorded 2478.07 seconds and 39,754,554 bytes. Historical runtime evidence remains unchanged: 1867.88 seconds generate-stage wall time, 1.327 generation realtime factor, 893 CPU samples, 158% mean CPU, 895.4% peak CPU, 39.64 GiB peak sampled RSS, GPU utilization not collected, and 1.15 seconds audit wall time. These values describe that original batch and must not be interpreted as current-inventory totals or rerun measurements.

On 2026-11-12, all original 97 recordings were uploaded to R2 CDN and checked against their manifest sizes and SHA-256, MIME types, cache policies, and 32-byte HTTP ranges. That is historical upload evidence only; this local cleanup makes no claim about current CDN state. Detailed plans, original WAVs, reports, and logs remain in the batch provenance directory recorded in `manifest.json`.

See `manifest.json` for all current titles, file names, byte sizes, hashes, durations, source adjustments, ASR indicators, and the separately labeled original-generation evidence.
