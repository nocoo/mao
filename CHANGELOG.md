# Changelog

## v1.3.0

- Restore the three original poetry groups as single catalog entries, retaining the individual poems and source annotations.
- Update the catalog to 96 entries and use one illustration for the complete 《十六字令三首》.
- Remove the seven obsolete individual recordings; the three grouped entries await new recordings.

## v1.2.0

- Add poem-specific woodcut illustrations for the first 20 numbered works, including all three parts of record 14.
- Serve illustrations and recordings through Cloudflare R2, preserving byte-range seeking and reducing the site build size.
- Keep illustrations upright, enlarge them on wide screens, and display each poem's title beneath its image.
- Add project skills for illustration production and CDN media uploads. All 97 synthetic recordings still require listening review; three remain unavailable.

## v1.1.0

- Rebuild the reading room around the new poetry design, with catalog, matrix, responsive and vertical reading.
- Add structured presentation for 100 records and source-linked annotations.
- Include 97 synthetic recitations with playback and byte-range seeking; three recordings remain unavailable and all require listening review.
- Add a versioned, uncached `/api/live` endpoint and verify health and audio ranges after deployment.

## v1.0.0

- Introduce the static poetry reading room and its source corpus.
