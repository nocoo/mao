---
name: mao-media-cdn
description: Upload and verify Mao Poetry Room illustration and audio assets on Cloudflare R2, associate CDN URLs with poem IDs, and migrate site media references. Use for 山河诗卷媒体上传、音频或配图 CDN 迁移、R2 upload, or updating existing hosted assets.
---

# Mao media CDN

Manage poem illustrations and recordings in Cloudflare R2 without exposing credentials. Uploading to the custom domain makes an object publicly accessible; obtain authorization for the requested upload, and do not deploy or publish the website without separate authorization.

## Target and inventory

| Item | Target |
| --- | --- |
| R2 bucket | `mao` |
| Public origin | `https://m.no.mt` |
| Poem IDs | Exact IDs from `data/诗词/index.md`, including leading zeroes and series suffixes |
| Illustration | `illustrations/<id>-<first-16-sha256-hex>.webp` |
| Audio | `audio/<id>-<first-16-sha256-hex>.mp3` |
| Favicon | `assets/favicon-<first-16-sha256-hex>.svg` |
| Cache metadata | `public, max-age=31536000, immutable` for content-hashed keys |

`audio/manifest.json` identifies the 97 existing recordings and three failed records. The project owner confirmed authorization for the current batch's reference voice and public distribution. Its historical attribution is unverified, and every recording requires listening review. Confirm rights for any new reference or intended use before publishing it; a general upload request does not establish those rights. See `audio/README.md` and `skills/mao-poetry-recitation/SKILL.md`. Do not invent audio for missing records.

The current illustration mapping is `data/illustrations.json`; record 19 points to its uploaded image. `src/media.js` derives audio URLs from each ID and the manifest's SHA-256; all 97 existing recordings are on the CDN. Preserve generated originals and prompts, including `design/samples/19-snow-original.png` and `design/samples/19-snow-prompt.txt`. Make web-optimized derivatives separately. The `mao-poetry-illustration` skill defines the image style, generation, crop, and review requirements.

## Upload and verify

1. Confirm the scope, account, bucket, domain, and any required rights. List the exact source files and IDs; verify audio filenames, sizes, and SHA-256 against `audio/manifest.json`. Do not upload secrets, prompts, unrelated files, or unapproved recordings.
2. Calculate each derivative's SHA-256 and construct its object key using the table. Use `audio/mpeg` for MP3 and `image/webp` for WebP. Never overwrite an existing content-hashed key with different bytes. If a key already exists, download and compare it; if existence or metadata cannot be verified, stop rather than overwrite.
3. Run Wrangler from the repository root with `--remote` and `--env-file /dev/null`, using the project-pinned Wrangler. Never print credential values or headers. For example, after checking the key is unused:

```sh
pnpm exec wrangler r2 object put 'mao/illustrations/<id>-<sha256-prefix>.webp' \
  --remote --file '<local-webp>' --content-type image/webp \
  --cache-control 'public, max-age=31536000, immutable' --env-file /dev/null
```

4. The public URL is `https://m.no.mt/` followed by the object key; Wrangler does not return it automatically. Download every uploaded object through the public URL and compare its full SHA-256 and size with the local source. Check HTTP status, content type, and cache metadata. For audio also verify byte-range responses and actual playback/seek before switching site references. A repeated GET can be used to check Cloudflare cache status; HEAD alone is not evidence of a cache hit.
5. Record completed IDs, URLs, hashes, sizes, metadata, and any failures. A failed or unverified upload must not be added to the site mapping. Content changes require a new hash and URL; do not overwrite immutable cached objects.

## Site migration

Update the exact poem-ID mapping only after its CDN object is verified. For illustrations, add the URL to `data/illustrations.json`. For audio, update `audio/manifest.json` with the verified source metadata; `src/media.js` derives its URL. Keep the player, deployment verification, tests, and documentation aligned. The Worker serves the site; R2 serves media and byte ranges directly.

Run automated tests against isolated local fixtures rather than depending on the public CDN. Separately verify the real public URL, MIME type, integrity, browser playback, seeking, and page layout through the Caddy development domain. Do not delete local source files or make deployment changes as a side effect of uploading.
