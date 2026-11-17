# Data rights and attribution

## Current release

The separate `data/listings/` source listing contains third-party observations published under operator permission reported by the project owner. The [attestation](docs/permissions/paroki-org-publication.md) records that scope; no written correspondence or confirmed open data license was supplied. Its license, commercial/non-commercial downstream reuse rights and mandatory attribution wording remain `not_confirmed`. Do not treat it as MIT, GPL, CC BY or public-domain data.

The canonical Indonesian directory remains empty pending its stricter identity and open-reuse admission requirements. Empty canonical JSON arrays are placeholders, not an assertion that Indonesia has no churches. Synthetic fixtures are original and explicitly marked.

The [MIT license](LICENSE) applies to original software, schema, documentation, and synthetic fixtures. It does **not** grant rights over third-party records, source websites, images, schedules, or databases. There is currently no blanket data license for future church records.

## Admission requirements

The primary dataset must support commercial and non-commercial reuse. A source's extraction permission, redistribution permission, and commercial reuse eligibility must all be confirmed and recorded with license, attribution wording, evidence, reviewer, and review date. Non-commercial-only permission is insufficient for this primary dataset.

Do not equate public access, a download button, permissive robots.txt, or a code license with data redistribution rights. A grant must cover normalized JSON/CSV republication and downstream reuse, including applicable upstream compilation rights. Ask the source operator to identify the appropriate license; do not assign CC BY, MIT, or another license on its behalf.

Only one confirmed data license may be composed in a primary export by the current tools. Different licenses are rejected pending explicit compatibility analysis and separate release design. This conservative check does not assert that all different licenses are legally incompatible.

## Source-specific status

- **Paroki.org:** the inspected [terms](https://paroki.org/terms/) allow attributed non-commercial use and require written permission for commercial use. The owner reports operator permission for local extraction and later specifically confirmed publication of the listing JSON/CSV. No actual operator grant date, explicit data license or downstream reuse grant was supplied. The separate listing records this permission scope; the primary openly reusable dataset remains empty. No mandatory attribution wording has been invented on the operator's behalf.
- **Kemenag:** the [dataset page](https://bimaskatolik.kemenag.go.id/index.php/dataset/5) provides no identified reuse license. Its linked workbook was inspected only to establish its aggregate structure; it is not redistributed here.
- **Existing GitHub projects:** data reuse rights were not established. No seed records, SQL records, application code, or source fixtures were copied.
- **OpenStreetMap / Gereja Bersaudara OSM layer:** OSM is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) and requires attribution to OpenStreetMap contributors and applicable share-alike compliance. No OSM-derived dataset is included in this release.

## Future OSM release

Keep OSM-derived records, coordinates, administrative boundary assignments, identifiers, snapshot metadata, and provenance in a separately documented dataset. Merely adding a source label does not discharge share-alike obligations or establish an independent collective database. Review the actual derivation and any merged database before publication; do not copy OSM coordinates into a differently licensed primary dataset without resolving its obligations.

An OSM release must retain object type/ID, version or snapshot date, coordinate method, source URL, ODbL notice, required attribution, and any applicable derivative-database availability requirements. Additional non-OSM layers need their own rights review.

## Evidence handling

Record public grant references or redacted evidence references in the source register. Keep private correspondence and personal identifiers in ignored `private/`, not in Git or public provenance. A maintainer must approve the public grant summary before enabling a source. Permission requests in this repository are drafts and have not been submitted.
