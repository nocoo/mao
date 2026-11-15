# Poetry recitation review

The current manifest has 96 records: all 96 poems have local MP3 recordings (`01`–`96`), totaling approximately 2,884.41 seconds and 46,252,615 bytes.

- Poem `19` (`19-沁园春·雪.mp3`, `63.84` seconds, `1,022,371` bytes) is retained as the reference recording.
- All other 95 poems (`01`–`96` excluding `19`, including the three previously failed poems `39`, `51`, `78` and three grouped poems `14`, `26`, `57`) were regenerated in the V2 batch using `fishaudio/drama-3` FP8 (`fishaudio/s2-pro` DAC codec) on Google Colab G4, conditioned on the 33.0-second first stanza (`上阕`) excerpt of `19-沁园春·雪.mp3`.

All generated tracks need human listening review. No background track was mixed; the absence of generated or reference background sound and pronunciation/completeness across all V2 tracks require listening verification. The reference voice's historical attribution is unverified. These are synthetic recordings, not historical broadcasts. The project owner confirmed authorization for the current batch's reference voice and public distribution.

## V2 generation evidence (`job-4`)

- Accelerator / device: Google Colab `G4` (`NVIDIA RTX PRO 6000 Blackwell Server Edition`, `fp8+cudagraph`)
- Requested / succeeded / failed: `95 / 95 / 0`
- Generated audio duration (95 V2 tracks): `2820.57` seconds (`45,230,244` bytes)
- Runtime phase timings: `setup` `20.23s`, `download` `124.46s`, `model_load_and_ref_encode` `11.95s`, `generate_and_postprocess` `1454.6s`, `total` `1611.24s` (`4.18 CU` consumed)
- Post-processing: `-45 dBFS` edge silence alignment (`100 ms` outer edges, `300 ms` inter-chunk pauses) + `dynaudnorm` (`target-v2`), `192k` CBR `44.1 kHz` mono MP3. Zero `silences_over_3_seconds` detected by energy scanning.

## Original-generation evidence (historical V1 provenance)

The original V1 100-entry local MLX batch generated 97 recordings with 3 failures (`39`, `51`, `78`), totaling the then-recorded `2478.07` seconds and `39,754,554` bytes (`1867.88s` generate wall time). After grouping (`14`, `26`, `57`), 90 V1 tracks remained prior to the V2 replacement.

On 2026-11-12, the earlier V1 recordings were uploaded to R2 CDN. Replacing the local files and updating `audio/manifest.json` commits V2 locally; uploading the 95 new content-hashed V2 objects to Cloudflare R2 must be performed separately via the `mao-media-cdn` skill before deploying to production.

See [`manifest.json`](manifest.json) for all current titles, file names, byte sizes, hashes, durations, source adjustments, and generation provenance.
