# Indonesia Catholic Church Directory

Use Node.js native fetch, Cheerio and Ajv. Preserve the existing church schema, stable UUIDs and field-level provenance. Keep parish organizations separate from worship sites. Never invent missing values or infer country, diocese, type or city from ambiguous names/group labels.

## Current extraction scope

- Collect https://paroki.org/browse/ first. `extract:list` must not visit profiles, JSON endpoints, comments, images or maps.
- The maintainer reports oral permission from the operator for local extraction. Its attestation belongs in ignored `.cache/paroki_org/listing/permission.json`. Redistribution, commercial reuse and the data license remain unconfirmed.
- Keep source HTML, candidates, discovered URLs, progress, registry, CSV and reports under ignored `.cache/paroki_org/listing/`. Do not copy them into tracked data, Git commits or Pages artifacts.
- Email was deferred by the maintainer. Use the real project and GitHub Issues URLs as temporary User-Agent contact; never invent an email.
- Review at most five listing cards against original HTML before the first broader parse. This does not authorize profile crawling.

## Requests and quality

- Concurrency one; minimum three seconds between requests; respect robots and longer Crawl-delay/Retry-After values.
- Stop on the first HTTP 429 or 403, access challenge, changed terms or unapproved redirect. Never circumvent restrictions. Resolve the cause before manually resuming; respect persisted delays.
- Retry temporary network/5xx errors at most three attempts with exponential backoff.
- Reuse snapshots/completed work. Save progress after every processed identity. IDs survive interrupted runs and renames.
- Collect explicitly institutional contacts only. Preserve conflicting values and ambiguous duplicates for review; do not automatically merge by name, phone or coordinates.
- Profile URLs identify candidates; `sources[].url` identifies the page read and optional `identity_url` the listed profile. Shared listing provenance does not make records duplicates.
- Local staging can have unknown country/type and null license. Public validation and publication must still reject unlicensed/unconfirmed records.

## Verification and publication

Run `npm test`, `npm run check`, and `npm run build:pages`. Tests use synthetic fixtures and mocked source HTTP; never crawl in CI.

Public master: `data/churches.json`. Generate public groups/CSV from it. Publish only after the redistribution/license checkpoint and quality review. Keep code/data licensing separate. Use a dedicated branch and PR; do not merge automatically or implement a REST backend in this stage.
