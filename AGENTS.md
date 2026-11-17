# Indonesia Catholic Church Data Extraction

Act as an autonomous data engineer. Execute the permitted workflow, inspect actual outputs, and fix failures. Do not stop at a plan, scripts, or suggested commands. Preserve original names, stable UUIDs, source URLs, extraction dates and field-level provenance. Never fabricate facts, permissions, licenses or attribution requirements.

## Local collection authorization

The project owner authorizes the planned public-directory collection and local development workflow. Do not repeatedly ask the owner for permission before executing scraping commands.

Redistribution permission, commercial reuse eligibility and an explicit data license are publication requirements, not blockers for local discovery, scraping, parsing, validation, normalization, deduplication or dataset generation. Continue permitted research/development work when those details are unavailable. Respect applicable source terms and access restrictions; owner authorization does not override a source access restriction.

Record unknown licensing facts as null or `not_confirmed`: license, redistribution permission, commercial use, non-commercial use and attribution requirements. Preserve confirmed facts separately with their evidence. A reviewed terms fingerprint identifies the terms checked; it does not grant reuse rights.

## Active workflow

1. Inspect the repository, scraper, source terms, robots, listing structure and structured data.
2. Discover unique profile URLs from https://paroki.org/browse/.
3. Test at most five listing cards and compare values against the original HTML.
4. Fix parsing/validation issues, then process the full permitted listing.
5. Normalize sourced fields, retain ambiguous duplicates for review, validate records, and generate JSON/CSV and quality reports.
6. Inspect measured discovered/extracted counts, failed requests/cards, missing fields, duplicate flags and unresolved licensing.

The current scope is the server-rendered listing. Collect profile URLs without visiting profiles, data endpoints, images, comments or map services. Do not broaden into blocked profile crawling. Never infer country, type, city or diocese from ambiguous names/group labels. Keep parish organizations separate from physical worship sites.

Run `npm run discover:list`, `npm run extract:list -- --sample`, and `npm run extract:list`. This workflow includes local normalization, deduplication, validation and JSON/CSV generation. Reuse unchanged snapshots and successful checkpoints. A cached run is not a fresh crawl; report it accurately.

Keep working data, source HTML, discovered URLs, progress, private evidence, registry and reports under ignored `.cache/paroki_org/listing/`. Shared `sources[].url` identifies the page read; optional `identity_url` identifies the listed profile. Retain conflicting claims instead of silently selecting a value.

## Access and privacy

- Respect robots, website terms, Retry-After and longer Crawl-delay values. Use concurrency one and at least three seconds between requests.
- Use a descriptive project User-Agent. Email was deferred; the real GitHub Issues URL is the temporary contact. Never invent an address or repeatedly request it.
- Stop and investigate HTTP 403/429 and access challenges. The client conservatively stops on the first such response. Resolve the cause and respect persisted delays before resuming; never bypass CAPTCHA, authentication or anti-bot controls.
- Retry temporary network/5xx errors at most three attempts with exponential backoff.
- Collect publicly available institutional information only. Withhold personal and unconfirmed contacts from parsed facts and provenance.
- Save resumable progress after each identity. Investigate failed commands and fix the issue instead of asking the owner to run them manually.

## Publication is separate

Until redistribution permission is confirmed, do not upload third-party records to a public repository/API or include them in Pages artifacts. Local development and source-code work continue independently. Record operator permission accurately as reported/attested; distinguish publication permission from a confirmed downstream data license.

The primary directory requires confirmed Indonesian worship-site identity and its documented reuse conditions. An unreviewed source listing stays separate and must not be advertised as verified Indonesian coverage. Code and third-party data have separate licensing. Never assign MIT/GPL or promise commercial reuse without evidence.

For external JSON views, recursively omit null-valued object properties and minify serialization. Preserve zero, false and array positions. Keep canonical local unknown values for validation/review; generate external views from that master.

Use a dedicated branch and PR. Do not merge or release without the owner's instruction. Never commit credentials, session files, raw HTML or private correspondence. Do not implement a REST backend in this stage.

## Completion and verification

Run `npm test`, `npm run check` and `npm run build:pages`. CI uses synthetic fixtures and mocked HTTP, never live crawling. Complete the task only after commands actually run, local JSON/CSV are generated and validated, and measured counts/errors/missing fields and unresolved publication conditions are reported. Schema validation is not source verification or national completeness.
