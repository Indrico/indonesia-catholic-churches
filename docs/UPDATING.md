# Updating and reviewing the dataset

All source updates are manual. Work on a dedicated branch and submit a PR; do not overwrite main directly. The production dataset stays empty until the rights checkpoint passes.

## 1. Establish permission

Read [SOURCES.md](../SOURCES.md), [DATA-LICENSE.md](../DATA-LICENSE.md), and the unsent [Paroki.org](permissions/paroki-org-request.md) / [Kemenag](permissions/kemenag-request.md) drafts. No script sends those requests. A human must approve the actual request and sender before sending, and the resulting grant must support the primary dataset's open downstream reuse.

After an adequate grant, a maintainer reviews and updates `config/sources.json`:

- Set extraction and redistribution to `approved`, commercial reuse to `true`.
- Record the actual license, required attribution, grant evidence references, reviewer, and review date. Keep private correspondence out of Git.
- Set `terms_url` and SHA-256 of the current decoded terms response body. This is a reviewed fingerprint, not permission in itself; there is no auto-approval or force option. Every live command re-fetches and compares it before profiles are requested. A changed body pauses the source for human review, including harmless markup changes.
- Supply a real institutional contact and project URL for the descriptive User-Agent.
- Retain the source allowlist and set any approved delay above the two-second minimum. The stricter robots Crawl-delay is honored too.

Only Paroki.org has a profile adapter. Kemenag aggregate data must not be supplied to that adapter. OSM and differently licensed data need separate future release tooling and rights documentation.

## 2. Discover and extract

```sh
npm run discover -- --source paroki_org
npm run extract -- --source paroki_org
```

Discovery collects approved profile roots from the listing and sitemap index. Root sitemap files are traversed; a profile subdomain's sitemap identifies its root without making an extra sitemap request per profile. Other source navigation links and unapproved redirects are rejected. Counts of discovered candidates are not church counts.

Requests use one serialized client across source subdomains, at least two seconds between requests, Retry-After including HTTP dates, exponential retry delays, and at most five attempts. HTTP 403, robots denial, CAPTCHA/challenge content, changed terms, and unexpected statuses stop the run. Do not bypass access controls or substitute browser automation to defeat a restriction. Browser rendering is not currently needed or implemented.

`.cache/<source_id>/` stores discovery state, raw profile snapshots, observations, failures and resumable network timing. On interruption, rerun the same command. Completed profiles are not fetched again. Failures record the URL, sanitized error reason, and time. Resolve the cause before resuming; do not skip blocked URLs to force completion.

For an intentional update after a completed run:

```sh
npm run discover -- --source paroki_org --refresh
npm run extract -- --source paroki_org --refresh
```

Refresh reuses ETag/Last-Modified validators and cached bodies after 304 responses. The same source identity retains its UUID. A changed permission configuration invalidates the cached policy fingerprint; archive the old cache privately for review and begin a reviewed run, rather than editing the fingerprint to bypass the guard. Do not delete identity mappings when archiving cache.

## 3. Normalize, curate and stage

```sh
npm run normalize
```

This writes `.cache/normalized.json`, not the master. Review every candidate and issue, confirm Catholic worship-site identity and country, add cited administrative/diocese aliases, and confirm any parish organization links. No coordinates are generated or reverse-geocoded. Unknown types, missing country, excluded institutions and identity conflicts remain in review staging. Missing province or diocese is reported rather than invented.

Raw contact candidates without explicit institutional office context are withheld from public facts and provenance. Before publishing any granted data, manually inspect admitted contacts and source context. Do not copy personal numbers or addresses from cache into curation files.

Use the [curation format](DATA-MODEL.md) to select sourced values and approve actual duplicates. Re-run normalize after changing decisions or mappings, then:

```sh
npm run deduplicate
```

Deduplication validates the staged records against current rights, creates `.cache/duplicate-result.json`, and leaves the master unchanged. Invalid staging produces `.cache/staging-validation.json`. Similar names or coordinates alone do not merge records. Review retained earlier records and unresolved candidates as well as newly accepted sites.

## 4. Export and review

```sh
npm run export
npm run validate
npm run check
npm test
```

Export uses validated staging when present, or the existing master for a tooling-only/rebuild run. Staging carries its base master fingerprint; a conflicting master edit requires renormalization. Rights are rechecked even for cached data. Artifacts are built before replacement; failure restores earlier files. An interrupted transaction leaves an ignored recovery journal; run export again to roll back the interrupted replacement and rebuild.

Derived files include master JSON, parish/identity registries, province/diocese partitions, UTF-8 CSV, manifest/checksums, and validation, duplicate, missing-field and field-conflict reports. Unknown grouping values appear as `_unassigned.json`. Filename collisions abort export. Obsolete generated partitions are removed transactionally; `.gitkeep` files are retained.

For reproducible generation timestamps, set `SOURCE_DATE_EPOCH` to a Unix timestamp before export. `npm run check` uses the checked-in timestamp and does not modify files or contact sources.

Review the actual diff, all reports, permission evidence, institutional contacts, and source attribution before committing. Cache, private evidence, credentials, cookies, tokens, and session files must remain excluded. No source records can be published while its grant is pending. A future data PR must document measured type counts, contact/coordinate coverage, verified count, duplicate records merged/flagged, and unresolved candidates. Zero-row schema validation proves file structure only.

## 5. Publish through a PR

Push the dedicated branch and open a PR. The offline CI workflow checks tests and canonical/generated consistency. CI does not crawl sources, send messages, approve permission, publish a dataset, or merge. Never describe the first tooling PR as an extracted national dataset. Subsequent releases remain `partial` until a separately evidenced national coverage assessment is approved; the current exporter never claims complete national coverage.
