# Proposed read-only API contract

**Design documentation only. No server, deployment, or live endpoint is implemented.** URLs below are relative proposed routes, not working services. Examples are synthetic and do not represent actual church data.

## Routes

| Method | Route | Response |
| --- | --- | --- |
| GET | `/v1/churches` | Worship sites with combined filters and pagination |
| GET | `/v1/churches/{id}` | One site by stable UUID |
| GET | `/v1/dioceses` | Distinct non-null diocese names from the master |
| GET | `/v1/provinces` | Distinct non-null province names from the master |
| GET | `/v1/meta` | Manifest, source licenses/attribution, counts and generation metadata |

`churches` returns sites, not parish organizations. Types are mutually exclusive site classifications; a cathedral that is also a parish church is counted once as `katedral`. `parent_parish_id`, when confirmed, identifies a separate parish organization.

## Filtering and ordering

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

## Responses

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
