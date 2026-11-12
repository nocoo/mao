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
| Cache metadata | `public, max-age=31536000, immutable` for content-hashed keys |

`audio/manifest.json` identifies the 97 existing recordings and three failed records. The reference voice and its historical attribution are unverified, and every recording requires listening review. Before making recordings publicly accessible, confirm the authorization for the reference voice and its intended distribution; a general request to upload assets does not establish that authorization. See `audio/README.md` and `skills/mao-poetry-recitation/SKILL.md`. Do not invent audio for missing records.

The current illustration mapping is `data/illustrations.json`; record 19 already points to its uploaded image. Preserve generated originals and prompts, including `design/samples/19-snow-original.png` and `design/samples/19-snow-prompt.txt`. Make web-optimized derivatives separately. The `mao-poetry-illustration` skill defines the image style, generation, crop, and review requirements.

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

Update the exact poem-ID mapping only after its CDN object is verified. For illustrations, add the URL to `data/illustrations.json`. The site currently uses local audio and a Worker for byte ranges; migration requires changing the player and deployment verification, removing obsolete local serving paths, and updating the relevant tests and documentation together. Do not claim audio is on the CDN until that work and its checks are complete.

Run automated tests against isolated local fixtures rather than depending on the public CDN. Separately verify the real public URL, MIME type, integrity, browser playback, seeking, and page layout through the Caddy development domain. Do not delete local source files or make deployment changes as a side effect of uploading.
