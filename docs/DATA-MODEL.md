# Data model and curation

Schema version: **1.0.0**. The schema is independent of an API implementation.

## Identity and record unit

`data/churches.json` contains physical Catholic worship sites in Indonesia. Types are `katedral`, `paroki` (a parish church), `stasi`, and `kapel`. An organization and its church are different entities. `data/parishes.json` holds parish organizations with `id`, `name`, `diocese`, `sources`, and `field_provenance`, validated against its own schema. An organization's address or contacts must not be copied to a chapel without site-specific evidence.

A cathedral that is also a parish church is one site with type `katedral`; its confirmed parish relationship may point to a separate parish organization. Chapel sites associated with a school or monastery are eligible only when explicitly identified as distinct places of worship. The institution itself remains excluded. Multiple buildings in one compound or identically named churches remain separate unless evidence confirms identity.

IDs are UUID v4 values assigned once, independent of names. The identity registry maps `source_id:canonical_url` to a persistent UUID. For an approved source URL change, add the new canonical key mapped to the existing ID before normalization; retain the old key. Do not generate a new ID from a name or slug. Approved merges update source mappings and retain a direct redirect from retired IDs to the surviving ID. The future detail API can consult that registry; no API is implemented here.

`parent_parish_id` refers to the **separate parish register**, not another site. Create and source the parish organization first, then add a confirmed relationship with field provenance. The current extractor deliberately does not infer parish parentage from names, proximity, or JSON-LD `parentOrganization` containing a diocese. Parish entries and relationships are curated manually using the same rights and provenance checks.

## Fields

| Field | Meaning |
| --- | --- |
| `name` | Original supplied church name; trimming only, no saint-name expansion |
| `type` | One of the four site types; unresolved types remain in private review staging |
| `administrative_area.country` | `ID`, with explicit source evidence; unknown or other-country observations do not become new production sites |
| Administrative names | Source-supplied values or reviewed normalization mappings; no geocoding or inference from diocese |
| `contact.phone` | Original institutional display value |
| `contact.phone_e164` | Normalized value only when the telephone library validates the supplied number |
| `contact.email`, `contact.website` | Institutional facts only; unknown values are null |
| `location` | Decimal latitude/longitude and coordinate source together; no invented coordinates or combination of unrelated partial pairs |
| `mass_schedules` | Entries containing original `raw_text` plus nullable `day`, `time`, `time_zone`, `notes` |
| `sources` | Source register ID, source name, canonical URL, access date, license, terms/content SHA-256, extractor version |
| `field_provenance` | JSON Pointer to original-value claim arrays |
| `conflicts` | Pointers whose competing claims remain unresolved |
| `verification` | Human source verification distinct from collection or schema validation |

Indonesia spans three time zones. Neither the country nor an ambiguous city implies a mass time zone; the extractor leaves it null when absent. Complex schedules remain original text rather than invented recurrence rules. Schedules can become stale and require institutional confirmation.

## Provenance and conflicting values

Each non-null factual field needs claims. A whole schedule entry uses a pointer such as `/mass_schedules/0`. Structural IDs and verification metadata have their own registries or review evidence instead of factual claims.

The following is a **synthetic provenance fragment**, not a church record:

```json
{
  "/address": [
    {
      "source_index": 0,
      "value": "Jalan Contoh 1",
      "locator": "json_ld/0/address/streetAddress",
      "observed_at": "2026-11-17",
      "method": "captured"
    }
  ]
}
```

`source_index` points into that record's `sources` array. Original values survive normalization; `method` records the transformation. Coordinates' source reference and E.164 formatting are derived from the cited supplied facts, not independent observations. Public provenance must not contain withheld personal contact values, raw HTML, comments, donation details, or credentials.

When multiple source claims conflict, retain the existing canonical value and its evidence where available, keep competing claims, and mark `needs_review`. A new unresolved value remains null; unresolved required identity/type means the candidate stays in `.cache/normalized.json`. A partial or ambiguous refresh retains the previous canonical site or earlier sourced field values, marked for review, instead of silently deleting them. Missing or contradictory coordinate observations retain an earlier complete sourced pair when one exists; they never construct a new pair from partial sources.

Curators select existing sourced claims using `config/curation.json`:

```json
{
  "decisions": [
    {
      "record_id": "11111111-1111-4111-8111-111111111111",
      "path": "/address",
      "source_index": 0,
      "value": "Jalan Contoh 1",
      "reviewed_by": "example-reviewer",
      "reviewed_at": "2026-11-17",
      "reason": "Synthetic illustration; do not import"
    }
  ],
  "merges": []
}
```

Inspect current source indexes and original values in staging before adding a decision. A stale decision that no longer matches a sourced claim is rejected. Decisions cannot create unsupported values. A confirmed manually supplied fact needs an authorized source entry and provenance first.

## Normalization mappings

`config/normalization.json` is versioned. Alias entries use this original, synthetic structure:

```json
{
  "province_aliases": {
    "Source spelling": {
      "name": "Reviewed canonical spelling",
      "source_url": "https://example.org/official-reference",
      "reviewed_by": "example-reviewer",
      "reviewed_at": "2026-11-17"
    }
  }
}
```

The initial alias tables are deliberately empty. Names not in a reviewed alias table or its canonical values are flagged for review. Canonical spellings may map to themselves with the same citation/review metadata. Before a nonempty data release, reviewers must establish a cited administrative naming convention and add observed variants; the tooling does not claim to ship an authoritative province/city reference database. Preserve original claims, distinguish Kabupaten from Kota, and review ambiguous labels and administrative changes rather than mapping automatically by fuzzy similarity. Add diocese aliases only with institutional evidence.

## Deduplication and verification

Exact normalized names are flagged nationally. Near names use normalized Levenshtein similarity at least 0.90 within a shared city or diocese. Canonical URL collisions and identical coordinates are also flagged. These are review candidates, not proof of identity. No semantic merge happens automatically.

An approved merge entry contains `from_id`, `into_id`, `reviewed_by`, `reviewed_at`, and `reason`. It preserves source claims and competing values and creates a retired-ID redirect. Resolve conflicting confirmed parish relationships before merging. Inspect remaining field conflicts after the merge; a merge decision does not verify every field.

Verification statuses:

- `unverified`: collection and schema validation have not established institutional verification.
- `needs_review`: an ambiguity, withheld contact, invalid source value, or conflicting claim requires review.
- `source_verified`: a human recorded `reviewed_by`, `verified_at`, and institutional evidence URLs. Access date alone cannot establish this status.

Edit verification only after institutional checking and review, then validate/export. A changed observation resets verification unless the record, evidence, and observations are unchanged. All proposed data releases still require human review of duplicate, missing-field, conflict, privacy, and permission reports.
