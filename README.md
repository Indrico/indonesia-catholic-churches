# Open Catholic Church Directory of Indonesia

A source-attributed, versioned dataset of Catholic worship sites in Indonesia, prepared for a future read-only API.

**Status: tooling only.** Production JSON arrays are empty. Bulk extraction and third-party data publication are blocked pending permission. This repository is not a completed national directory, and does not claim to be the first or only directory.

## Start here

- [Prior-art audit](docs/PRIOR-ART.md): existing datasets, measured counts, coverage, licenses, and API availability.
- [Sources and permission status](SOURCES.md), [data rights](DATA-LICENSE.md), and [unsent permission drafts](docs/permissions/paroki-org-request.md).
- [Schema and curation](docs/DATA-MODEL.md), [update procedure](docs/UPDATING.md), and [static JSON access / future API](docs/API.md).
- [Manifest](data/manifest.json), [validation](reports/validation.json), [duplicate review](reports/duplicate-review.json), and [missing fields](reports/missing-fields.json).

## Installation and offline checks

Requires Node.js 22.12 or newer and npm. No API key is required.

```sh
npm ci --ignore-scripts
npm test
npm run check
```

Tests use synthetic records and a simulated HTTP transport; they never request church profiles. CI installs locked dependencies, then runs offline tests and checks. The repository has no API server or scheduled crawler.

## Files

`data/churches.json` is the canonical worship-site dataset. `data/parishes.json` contains separate parish organizations. `data/id-registry.json` preserves identities and retired-ID redirects.

Province and diocese JSON, `data/churches.csv`, the manifest, and quality reports are generated from the master files. Do not maintain grouped files independently. CSV nulls are empty cells, nested values are JSON strings, and formula-like cells receive a leading apostrophe for safe spreadsheet inspection. JSON is authoritative for exact values.

The church JSON Schema is `schema/church.schema.json`, version 1.0.0, using JSON Schema draft 2020-12. Names are original source names; unknown values are null. Public facts retain field-level provenance, including competing source values. Only explicitly identified institutional contacts may be included.

## Static JSON hosting

The GitHub Pages workflow publishes validated exports and a developer guide after the PR is merged into main. The expected site URL is `https://indrico.github.io/indonesia-catholic-churches/`; it is not live until the first deployment succeeds. The initial published JSON arrays remain empty with `tooling_only` status.

```sh
npm run build:pages
```

This offline build creates `dist/pages/`, including the static guide, exact copies of validated JSON/CSV, schemas, and data rights documentation. It never scrapes a source or copies `.cache/`, private files, credentials, or the whole repository. Group links come from the manifest, so nonexistent province/diocese files are not advertised. Developer applications can fetch the JSON directly and filter it themselves; adding a query string to a static file does not filter its HTTP response.

For a local preview, serve **only** `dist/pages/`, for example `python -m http.server 4173 --bind 127.0.0.1 --directory dist/pages`. After a public deployment, verify its JSON responses and CORS against the built artifact:

```sh
npm run check:pages -- https://indrico.github.io/indonesia-catholic-churches/
```

PR checks build the site without deployment. Deployment and its public-site check run only from main; the PR is not merged automatically. See [update and hosting instructions](docs/UPDATING.md).

## Source updates

The checked-in source configuration intentionally refuses live access. First obtain the documented permissions, record reviewed evidence and attribution, set the approved terms fingerprint, and supply a real institutional contact. The [update procedure](docs/UPDATING.md) explains every stage and review checkpoint.

```sh
npm run discover -- --source paroki_org
npm run extract -- --source paroki_org
npm run normalize
npm run deduplicate
npm run export
npm run validate
npm run check
```

These commands do not submit permission requests or publish to GitHub. `discover` and `extract` are blocked before network access until authorization is recorded. Cache and raw source responses belong only in ignored `.cache/` storage.

## Current measured production statistics

| Measure | Result |
| --- | ---: |
| Production extraction | Not run |
| Extracted observations | Not measured; null |
| Published worship sites | 0 |
| Cathedrals / parish churches / stations / chapels | 0 / 0 / 0 / 0 |
| With addresses / phones / email / coordinates | 0 / 0 / 0 / 0 |
| Source-verified sites | 0 |
| Duplicate records removed / flagged | 0 / 0 |

Three Paroki.org profiles were inspected for structure during the prior-art audit. No real profile records or raw responses are included here. Existing-project counts in the audit are not production extraction statistics.

## Attribution and contributions

No third-party church data is licensed or distributed by this tooling release. See [DATA-LICENSE.md](DATA-LICENSE.md). Original code and schema use [MIT](LICENSE); that grant does not cover source data.

Contribute corrections through a dedicated branch and PR with source evidence and applicable reuse rights. Review quality reports and institutional contacts before proposing a data release. Automated merges and similarity-based church merges are not enabled.
