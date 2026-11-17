# Private listing extraction

This mode reads server-rendered `/browse/` cards without visiting profiles, JSON endpoints, comment services, images or maps. Cheerio is sufficient. The inspected HTML contains all cards; JSON-LD describes breadcrumbs/FAQ, not church records. No HTML pagination was found.

## Permission and contact

On 2026-11-17 the maintainer reported oral permission from the source operator for extraction. The actual grant date, redistribution terms, commercial reuse and license were not supplied. Record this as a private maintainer attestation, not written correspondence or an open data license. Public source permissions remain pending.

The owner later specifically confirmed permission to publish the listing JSON/CSV. That separate [publication attestation](permissions/paroki-org-publication.md) does not establish an open downstream license. Local runs remain independent of it; only the explicit `prepare:listing-release` command creates public listing artifacts.

The owner authorizes local development. Fresh checkouts use `config/local-listing-access.json`, which restricts access to the listing and reviewed terms without requiring redistribution, commercial reuse or an explicit license. Existing private `.cache/paroki_org/listing/permission.json` evidence is preserved when present. Unknown permission fields do not stop local processing; publication remains separate. The following is an evidence template, not a prerequisite for local execution:

```json
{
  "source_id": "paroki_org",
  "scope": "listing_only_local",
  "listing_url": "https://paroki.org/browse/",
  "extraction": "pending",
  "grant_form": null,
  "grant_date": null,
  "attestation": null,
  "attested_by": null,
  "attested_at": null,
  "terms_sha256": null,
  "redistribution": "pending",
  "commercial_reuse": null,
  "license": null
}
```

Record real source permission when supplied; do not fabricate a grant date or license. The configured SHA-256 identifies reviewed decoded terms HTML encoded as UTF-8, not reuse rights. Every live retrieval checks the terms; changes stop the source for investigation. Do not repeatedly ask the owner to approve permitted local work.

Email was deferred by the maintainer. The real project GitHub Issues URL is the temporary User-Agent contact in `config/sources.json`. Local extraction accepts email or HTTPS contact URL; the existing profile/publication workflow still requires email and full reuse rights.

## Run and resume

```sh
npm run discover:list
npm run extract:list -- --sample
# Compare the five sample cards with their original HTML in snapshot.json.
npm run extract:list
```

The first run obtains robots, terms and listing through one serialized client, at least three seconds apart. Only those exact URLs are allowed. Cached runs parse the existing snapshot without source requests. Samples select at most five cards across the listing, write to `sample/`, and share the stable registry.

After interruption, rerun the same command. Per-identity results and progress preserve `pending`, `processing`, `completed`, `failed` and `needs_review` states. Successfully processed identities are reused. Invalid cards without usable URLs are reported by ordinal. A `needs_review` identity was parsed successfully but has unresolved data.

Use `npm run extract:list -- --refresh` for an intentional source update; ETag/Last-Modified are reused where available. HTTP 429 stops immediately and persists Retry-After without automatic retry. Manual invocations before that deadline refuse network access. HTTP 403/challenges stop too; resolve access with the operator before resuming. Temporary network/5xx errors have at most three attempts. Never substitute transports to defeat blocking.

Policy changes require reviewing/archiving the old private cache while preserving its identity registry. Parser version changes reprocess the snapshot without changing IDs. A zero-card/unusable layout or corrupt snapshot fails visibly and preserves earlier aggregate exports.

## Artifacts and interpretation

All artifacts live under ignored `.cache/paroki_org/listing/`:

- `snapshot.json`, `network.json`, and per-identity `records/` support traceability/resume. Logs contain request URLs/statuses/times, not cookies or credentials.
- `churches.json`, UTF-8 `churches.csv`, and `churches.schema.json` contain private candidates and their staging schema. `churches.compact.json` is a minified external view with null object properties recursively omitted; zero/false and array positions survive. The local master keeps explicit nulls. CSV nulls are blank, nested values JSON strings, and formula-like text escaped.
- `discovered_profiles.json`, `progress.json`, and `id-registry.json` contain URL/status and UUID mappings.
- `reports/` contains extraction, validation, missing-field, duplicate and field-review results. Ambiguous group/header labels remain in review context.
- `countries/` contains derived Indonesia, other-country and unknown-country views. Unknown-country records are not counted as Indonesian sites.

Staging derives from the canonical schema, additionally allowing null country/type, conflicting name, and license. It does not replace the public schema. `sources[].identity_url` optionally identifies the listed profile; `sources[].url` remains the page actually read. Values retain card ordinals and element/attribute locators.

The observed `.card-body` slot supplies the address verbatim. Do not split free text into inferred administrative fields. Explicit labels may populate fields; header pills/group names do not establish country, city, diocese or type. Only explicit numeric map destinations supply coordinates. Camera centers, named destinations and short links are not resolved. Personal/unlabeled contacts are withheld from parsed facts and provenance.

Repeated cards for one profile become one candidate with retained claims/context. Conflicting scalars remain null and flagged. Same/similar names in an appropriate shared area, normalized phones and coordinates flag possible duplicates, without automatic merging. Schema validation is not source verification.

Completeness is `filled / (records × 9) × 100`, rounded to two decimals, across name, type, diocese, address, province, city, phone, email and a complete coordinate pair. Empty lists have null percentage. It measures captured fields, not national coverage.

The source mixes Indonesia and Timor-Leste. These listing counts are not verified Indonesian church counts. Never publish the private directory or serve the repository root. Only the separately validated public master may be published after the rights checkpoint.
