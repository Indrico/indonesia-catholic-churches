# Static JSON access and future API design

## Current delivery model: static files

The separate source listing is available at `data/listings/paroki-org.json` (bare array), with CSV at `data/listings/paroki-org.csv` and rights/counts/checksums at `data/listings/manifest.json`, under the site base below. These are unreviewed listing observations, not verified Indonesian church records. The source includes Indonesia and Timor-Leste; country/type may be absent. Publication permission is reported by the owner, but an explicit downstream license is not confirmed. Inspect the listing manifest before reuse.

External listing JSON is minified and recursively omits null-valued object properties; missing means unknown. Empty containers, false, zero and array positions are preserved. Use optional access such as `record.type ?? null`. The local full master keeps explicit nulls; `schema/listing.compact.schema.json` describes the external view. The canonical `data/churches.json` contract remains separate.

GitHub Pages will serve the validated export files directly after the tooling PR is merged to main and its first Pages deployment succeeds. Until then, these URLs are examples, not a claim that hosting is live:

```text
https://indrico.github.io/indonesia-catholic-churches/data/churches.json
https://indrico.github.io/indonesia-catholic-churches/data/churches.csv
https://indrico.github.io/indonesia-catholic-churches/data/parishes.json
https://indrico.github.io/indonesia-catholic-churches/data/id-registry.json
https://indrico.github.io/indonesia-catholic-churches/data/manifest.json
```

Church and parish files are bare JSON arrays, without an API envelope. The identity registry and manifest are objects. The registry preserves source identities and retired-ID redirects; the static host does not perform redirects from those entries automatically. The manifest's `groups.provinces` and `groups.dioceses` arrays give the actual group names, relative file URLs and counts. Empty group arrays mean no grouped files are available. Do not assume example province/diocese paths exist before records are published.

The canonical manifest remains `tooling_only` with zero accepted records; the separate source-listing manifest counts its unreviewed observations. Read each manifest's status, coverage and permission information before interpreting the data. Every JSON response is a real static file; requesting a query such as `churches.json?province=...` returns the complete file rather than a server-filtered subset.

```javascript
const base = "https://indrico.github.io/indonesia-catholic-churches/";
const response = await fetch(`${base}data/churches.json`);
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const churches = await response.json();

const normalize = value => (value ?? "").normalize("NFKC").trim().toLowerCase();
const filters = {
  q: "stella", province: "DKI Jakarta", city: "Jakarta Barat",
  diocese: "Keuskupan Agung Jakarta", type: "paroki"
};
const matches = churches.filter(church =>
  (!filters.q || normalize(church.name).includes(normalize(filters.q))) &&
  (!filters.province || normalize(church.administrative_area.province) === normalize(filters.province)) &&
  (!filters.city || normalize(church.administrative_area.city) === normalize(filters.city)) &&
  (!filters.diocese || normalize(church.diocese.name) === normalize(filters.diocese)) &&
  (!filters.type || church.type === filters.type)
);
matches.sort((a, b) => {
  const left = normalize(a.name), right = normalize(b.name);
  return (left < right ? -1 : left > right ? 1 : 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
});
const offset = 0, limit = 50;
const result = {
  data: matches.slice(offset, offset + limit),
  pagination: { offset, limit, total: matches.length }
};
```

The `result` object is generated inside the consuming application. It does not create a new public HTTP endpoint. Fetch a province or diocese group first when only that subset is needed. Retain source attribution and observe the source data license when storing, filtering or redistributing the data. CSV uses empty cells for nulls, JSON strings for nested fields, and leading apostrophes for formula-like values; JSON remains authoritative.

Public-site checks verify JSON MIME types, cross-origin browser access, counts, and exact correspondence to the deployment artifact. No authentication or custom request headers are needed for normal public fetches. GitHub Pages caching can temporarily return an earlier deployment; compare manifest generation time when matching data revisions.

## Future read-only REST API — not implemented

**REST design documentation only. No server or live `/v1/` endpoint is implemented.** URLs below are relative proposed routes, not working services. Examples are synthetic and do not represent actual church data.

### Routes

| Method | Route | Response |
| --- | --- | --- |
| GET | `/v1/churches` | Worship sites with combined filters and pagination |
| GET | `/v1/churches/{id}` | One site by stable UUID |
| GET | `/v1/dioceses` | Distinct non-null diocese names from the master |
| GET | `/v1/provinces` | Distinct non-null province names from the master |
| GET | `/v1/meta` | Manifest, source licenses/attribution, counts and generation metadata |

`churches` returns sites, not parish organizations. Types are mutually exclusive site classifications; a cathedral that is also a parish church is counted once as `katedral`. `parent_parish_id`, when confirmed, identifies a separate parish organization.

### Filtering and ordering

Supported query parameters are `q`, `province`, `city`, `diocese`, `type`, `limit`, and `offset`. Trim and normalize search/filter strings with Unicode NFKC and lowercase. Preserve source names in response values.

`q` is a case-insensitive substring match on name. Province, city and diocese are normalized exact matches; multiple filters combine with AND. `type` is one of `katedral`, `paroki`, `stasi`, `kapel`. Empty string filters, unknown query parameters, repeated parameters, and invalid type values produce 400. Null administrative values do not match a supplied filter.

Default sorting is normalized name ascending in Unicode code-point order, then stable ID ascending. Clients cannot change sorting in v1. Offset defaults to 0, limit to 50; offset must be a nonnegative integer and limit an integer from 1 through 200. Apply filters and sorting before pagination. Offset past the last result returns an empty array with the full filtered total. Offset pagination is predictable for a fixed dataset revision; clients should retain metadata generation time when consistency across updates matters.

Examples:

```text
GET /v1/churches?q=stella
GET /v1/churches?province=DKI%20Jakarta
GET /v1/churches?city=Jakarta%20Barat
GET /v1/churches?diocese=Keuskupan%20Agung%20Jakarta
GET /v1/churches?type=paroki
GET /v1/churches?province=DKI%20Jakarta&type=paroki&limit=20&offset=0
```

### Responses

A synthetic empty collection response:

```json
{
  "data": [],
  "pagination": { "limit": 50, "offset": 0, "total": 0 }
}
```

A nonempty response has full church-schema objects in `data`, including field provenance, source conditions, conflicts and verification status. The response must not silently drop attribution. Schema keys and null semantics remain the same as the published JSON dataset.

Detail responses use `{ "data": <church-schema-object> }`. A valid but unknown UUID returns 404; malformed UUID returns 400. A retired ID uses the identity registry for a 308 redirect to its surviving `/v1/churches/{id}`; do not reuse retired IDs.

Province and diocese routes use sorted, distinct, non-null strings, for example these **synthetic** responses:

```json
{ "data": ["Provinsi Contoh"] }
```

```json
{ "data": ["Keuskupan Contoh"] }
```

Metadata uses `{ "data": <manifest-object> }`. Include `schema_version`, `generated_at`, `release_status`, `coverage_complete`, `extraction_status`, counts, source licenses/attribution, and available files. The current static manifest reports `tooling_only`; consumers must not interpret zero records as national completeness.

Errors have a stable envelope:

```json
{ "error": { "code": "invalid_parameter", "message": "limit must be an integer from 1 through 200" } }
```

```json
{ "error": { "code": "not_found", "message": "Church ID was not found" } }
```

An API implementation and its contract tests, hosting, caching, traffic limits, and deployment are separate future work. It must serve the licensed canonical dataset rather than scrape upstream websites per request.
