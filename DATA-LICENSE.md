# Data rights and attribution

## Current release

No third-party church records are included. Empty JSON arrays and header-only CSV are placeholders, not an assertion that Indonesia has no Catholic churches. Synthetic fixtures are original project material and are explicitly marked as synthetic.

The [MIT license](LICENSE) applies to original software, schema, documentation, and synthetic fixtures. It does **not** grant rights over third-party records, source websites, images, schedules, or databases. There is currently no blanket data license for future church records.

## Admission requirements

The primary dataset must support commercial and non-commercial reuse. A source's extraction permission, redistribution permission, and commercial reuse eligibility must all be confirmed and recorded with license, attribution wording, evidence, reviewer, and review date. Non-commercial-only permission is insufficient for this primary dataset.

Do not equate public access, a download button, permissive robots.txt, or a code license with data redistribution rights. A grant must cover normalized JSON/CSV republication and downstream reuse, including applicable upstream compilation rights. Ask the source operator to identify the appropriate license; do not assign CC BY, MIT, or another license on its behalf.

Only one confirmed data license may be composed in a primary export by the current tools. Different licenses are rejected pending explicit compatibility analysis and separate release design. This conservative check does not assert that all different licenses are legally incompatible.

## Source-specific status

- **Paroki.org:** the inspected [terms](https://paroki.org/terms/) allow attributed non-commercial use and require written permission for commercial use. Bulk republication remains unresolved. The primary dataset remains empty pending an adequate grant. No source attribution wording has been accepted on the operator's behalf.
- **Kemenag:** the [dataset page](https://bimaskatolik.kemenag.go.id/index.php/dataset/5) provides no identified reuse license. Its linked workbook was inspected only to establish its aggregate structure; it is not redistributed here.
- **Existing GitHub projects:** data reuse rights were not established. No seed records, SQL records, application code, or source fixtures were copied.
- **OpenStreetMap / Gereja Bersaudara OSM layer:** OSM is licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) and requires attribution to OpenStreetMap contributors and applicable share-alike compliance. No OSM-derived dataset is included in this release.

## Future OSM release

Keep OSM-derived records, coordinates, administrative boundary assignments, identifiers, snapshot metadata, and provenance in a separately documented dataset. Merely adding a source label does not discharge share-alike obligations or establish an independent collective database. Review the actual derivation and any merged database before publication; do not copy OSM coordinates into a differently licensed primary dataset without resolving its obligations.

An OSM release must retain object type/ID, version or snapshot date, coordinate method, source URL, ODbL notice, required attribution, and any applicable derivative-database availability requirements. Additional non-OSM layers need their own rights review.

## Evidence handling

Record public grant references or redacted evidence references in the source register. Keep private correspondence and personal identifiers in ignored `private/`, not in Git or public provenance. A maintainer must approve the public grant summary before enabling a source. Permission requests in this repository are drafts and have not been submitted.
