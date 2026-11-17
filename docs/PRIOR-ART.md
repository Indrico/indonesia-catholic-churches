# Prior-art and existing dataset audit

Audit date: **2026-11-17**. Conducted before repository initialization. Public pages, repository metadata, selected data files and schemas were inspected read-only. No mass Paroki.org extraction was performed. Numbers below distinguish advertised totals, directly counted rows, and unknown counts. None is this repository's production count.

## Comparison

| Project / dataset | Count and geographic coverage | Available fields | Data freshness | Rights and completeness | API / export |
| --- | --- | --- | --- | --- | --- |
| [Paroki.org](https://paroki.org/) | 2,224 profiles reported by its about page and statistics JSON; Indonesia **and Timor-Leste**, 33 reported jurisdictions | Name, type, diocese, address, institutional contact candidates, coordinates, mass schedules, parent relationships where available | [Statistics JSON](https://paroki.org/data/stats.json) generated 2026-06-24; per-record update dates unestablished | Non-commercial attributed use stated; bulk redistribution and open downstream reuse not confirmed; national completeness unproven | Client references static JSON; supported public directory REST API not established |
| [Kemenag Rumah Ibadah Katolik](https://bimaskatolik.kemenag.go.id/index.php/dataset/5) | **34 province rows plus one national total**, not individual churches | Province, counts of cathedral/parish/station/chapel, total | HTTP Last-Modified 2026-07-16 on linked workbook; reference period not identified; filename is not a reporting date | Applicable reuse license not identified; aggregate table with historical administrative coverage, not a national site directory | Download button labeled CSV actually links to XLSX; no church-level API established |
| [Rebornian48/katolik](https://github.com/Rebornian48/katolik) | **84 JSON seed rows**, 26 province labels; 41 Katedral, 38 Paroki, 3 Stasi, 1 Sekolah, 1 Seminari | Name, type, pastor, address, city, province, diocese, latitude, longitude, phone, email, website, misa | Seed last committed 2026-10-01; repository last pushed 2026-10-26 | No root license found or GitHub license detected. Seed has no `source` or `source_url` values. Limited curated seed with out-of-scope institutions | Public routes implemented for `/api/locations`, detail, nearby and `/api/meta`; deployment not identified |
| [Yudhass/Gereja-Katolik-Indonesia](https://github.com/Yudhass/Gereja-Katolik-Indonesia) | **107 church tuples with 107 distinct IDs** in inspected SQL snapshot; current church seeder has **5** entries; one inspected raw Aceh POI JSON has **162** entries; other provincial raw files and live total not counted | SQL church table: IDs/slugs, names, address, province/city/district/subdistrict, map link, coordinates, phone, descriptions, photo URL, timestamps; related schedules/social tables; raw POI fields described below | Inspected snapshot last committed 2026-09-06; repository last pushed 2026-11-05; raw Aceh file revision date not measured | README claims MIT, with no root license found; separate data licensing and upstream POI reuse rights were not established. Collections are not proven complete or Catholic-only | Public PHP pages and administrative lookup routes; no documented church-directory REST API found |
| [derrint/jadwal-misa](https://github.com/derrint/jadwal-misa) | **14 parish entries**, one indexed city: Malang Raya, Jawa Timur / Keuskupan Malang | Parish/church display names, local address, Saturday/Sunday schedules, notes, source descriptions, trust label, local IDs | Data file last committed 2026-05-03; repository last pushed 2026-05-04 | No license found. All 14 entries have source descriptions, but no source URLs found in the inspected data file. Limited local collection | Static JSON; homepage advertised at `jadwal-misa.vercel.app`; no REST API established |
| [OpenStreetMap](https://www.openstreetmap.org/) | Global community database including Indonesia; Catholic subset count **not measured** | Object IDs/tags, name, religion/denomination, address, optional contacts; point or area geometry | Continuously edited; query timestamp/object version must accompany a future extraction | ODbL 1.0. Completeness depends on mapped/tagged objects; no national Catholic census claim | [Overpass](https://wiki.openstreetmap.org/wiki/Overpass_API) supports read queries; regional extracts also available |
| [Gereja Bersaudara map](https://gerejabersaudara.id/peta-gereja) | Indonesian Christian church candidates across denominations; count **not measured** | Name, denomination, address, four administrative levels, coordinates, OSM key, quality, coordinate method | Snapshot timestamp exists in client metadata interface, but its value was not measured | Page explicitly labels OSM database ODbL 1.0. Snapshot is not a census or field verification; extra layers need separate review | CSV download and internal `/peta-gereja/api/data`; no supported/versioned API contract established |

## Measurements and evidence

### Paroki.org

[About/status](https://paroki.org/tentang/), [browse](https://paroki.org/browse/), [terms](https://paroki.org/terms/), [robots](https://paroki.org/robots.txt), [sitemap](https://paroki.org/sitemap.xml), and public client code were inspected. Only three unique profiles were visited; neither full profile JSON endpoint was downloaded.

The about page reported 2,224 profiles. Browse FAQ structured metadata instead reported 2,152; the sitemap index contained 2,183 locations, including ancillary sitemaps. These totals measure different or stale artifacts and must not be reconciled by inventing a definitive church count. Profiles can include out-of-country or non-worship candidates, so even a profile count is not a verified Indonesian site count. HTML and statistics JSON also disagreed on enrichment totals.

### Kemenag

The [linked XLSX](https://bimaskatolik.kemenag.go.id/filedata/20250211112855.xlsx) was inspected in memory without redistributing the file. Its first worksheet has 36 nonempty rows: header, 34 numbered provinces, and one summary. Columns are `No`, `Provinsi`, `Gereja Katedral`, `Gereja Paroki`, `Gereja Stasi`, `Kapel`, and `Total Gereja Katolik`. Counts of establishments are not records with names and addresses. No individual church records can be derived from these totals.

### Rebornian48/katolik

Directly parsed [seed JSON](https://github.com/Rebornian48/katolik/blob/5cb2455c01dea9e0ee26d50c91022f08a334e863/db/seed-data.json); counted array length, type values, distinct province labels, and provenance fields. The seed contains **82 in-scope type labels**, but those are not independently verified or deduplicated sites. The [SQLite schema](https://github.com/Rebornian48/katolik/blob/main/db/schema.sql) supports source fields and an unmapped-location queue; this does not establish that seed provenance exists. The [API implementation](https://github.com/Rebornian48/katolik/blob/main/routes/api.js) supports combined filters and pagination. No SQLite production database was available in the inspected tree; no application or scraper was executed.

### Yudhass/Gereja-Katolik-Indonesia

Counted only church-table tuples in [the inspected SQL snapshot](https://github.com/Yudhass/Gereja-Katolik-Indonesia/blob/ea854a8a7d33fe7a560f310cefa00d2e50ff0ab4/_DEV/database-baru-v3.sql): two insert blocks, 94 and 13 rows, with 107 distinct IDs. This is not an assertion that IDs represent deduplicated sites. [Current seeder](https://github.com/Yudhass/Gereja-Katolik-Indonesia/blob/main/app/database/seeders/GerejaSeeder.php) contains five church entries. Multiple SQL snapshots must not be added together as independent records.

The repository also contains a larger provincial JSON/CSV collection under `_DEV/NODEJS/data_mentah`. A structure-only inspection of [11_ACEH.json](https://github.com/Yudhass/Gereja-Katolik-Indonesia/blob/main/_DEV/NODEJS/data_mentah/11_ACEH.json) counted **162 raw place-of-interest entries** with fields including `name`, `address`, `main_category`, `categories`, `link`, `place_id`, `phone`, `website`, `query`, ratings/reviews, hours, images, and owner-profile information. These are raw POI records, not administrative reference rows or a verified Catholic-only directory. Other provincial files were not downloaded or counted, and raw rows must not be added to curated SQL counts. Upstream origin and reuse conditions need review before any import; owner/review fields and personal information are outside this project's scope. Separate `data_wilayah_*` folders do contain administrative references.

No credentials, sessions, user rows, owner-profile values, configuration contents, raw POI records, or copied SQL dumps are published here.

### derrint/jadwal-misa

Parsed [city index](https://github.com/derrint/jadwal-misa/blob/main/src/data/index.json) and [Malang data](https://github.com/derrint/jadwal-misa/blob/cdbaec4a8b957772af7dfb9787070f48c633b73e/src/data/malang.json): one indexed city and 14 actual array entries. The index's advertised `parishCount` agrees with the measured array length. Source descriptions and trust labels do not establish permission or independent verification.

### OSM and Gereja Bersaudara

Reviewed [OSM copyright](https://www.openstreetmap.org/copyright), [ODbL](https://opendatacommons.org/licenses/odbl/1-0/), Overpass documentation, and map attribution/coverage explanations. No national Overpass extraction was performed. A count query was not run, so no Catholic-object total is claimed.

Gereja Bersaudara redirected to `https://transformasi.digital/peta-gereja` during direct inspection. Its public client references a CSV route and the JSON data endpoint. A metadata probe read only the first 8,192 bytes; the server ignored Range and declared a 3,208,883-byte response. The full snapshot was deliberately not consumed, and count/timestamp metadata was not available in that prefix. The page describes bounding-box centers for area coordinates and OSM boundary-based administrative assignment; those are derived positions, not necessarily entrances. The internal endpoint is technical availability, not a support or uptime commitment.

## GitHub search log

Queried the public repository search API, first page with at most ten results each, and web search. Repository API results on the audit date:

| Required search | Total matches | Relevant result |
| --- | ---: | --- |
| `gereja katolik Indonesia` | 1 | Yudhass/Gereja-Katolik-Indonesia |
| `paroki Indonesia` | 0 | None returned |
| `catholic churches Indonesia` | 0 | None returned |
| `catholic parish Indonesia` | 1 | derrint/jadwal-misa |
| `church directory Indonesia` | 0 | None returned |

These are search-result counts, not evidence that no other projects exist. Additional web searches for `paroki data json`, `gereja katolik dataset`, and the required phrases returned other Catholic data projects without a directly matching Indonesian site directory. Rebornian48/katolik was inspected independently because it was explicitly supplied. Search indexing and repository metadata limit recall.

## Recommendation

Maintain this as a **complementary dataset**, concentrating on legal reuse, stable site identities, field-level provenance, and reviewable exports. Paroki.org already offers broad public discovery; collaboration on an authorized export and a suitable downstream license would avoid redundant crawling. Rebornian48/katolik could consume an authorized normalized dataset or benefit from provenance improvements. The local Malang collection may provide correction leads after its rights are clarified. No inspected project was established to meet all reuse, provenance, modeling, and maintenance objectives.

Do not copy existing data while awaiting rights, claim historical priority, or equate restricted-use data with openly reusable data. Collaboration requests remain unsent pending human approval.
