# Sources and permission status

Audit date: **2026-11-17**. [Full prior-art report](docs/PRIOR-ART.md).

| Source | Acquisition / structure | Redistribution status | Action |
| --- | --- | --- | --- |
| [Paroki.org](https://paroki.org/browse/) | Public server-rendered listing; profile Church JSON-LD; static JSON referenced by client | Bulk republication and open commercial reuse pending | Maintainer-attested oral permission for local listing extraction; profile/publication adapter blocked |
| [Kemenag](https://bimaskatolik.kemenag.go.id/index.php/dataset/5) | Download points to provincial aggregate XLSX | License unidentified | Ask for terms and church-level export; no adapter |
| [Rebornian48/katolik](https://github.com/Rebornian48/katolik) | SQLite schema and 84-row JSON seed | No license found; no per-seed provenance | Reference only; consider collaboration |
| [Yudhass/Gereja-Katolik-Indonesia](https://github.com/Yudhass/Gereja-Katolik-Indonesia) | PHP directory, raw provincial POI JSON/CSV, administrative references and SQL snapshots | Data license and upstream POI rights unresolved despite README MIT statement | Reference only |
| [derrint/jadwal-misa](https://github.com/derrint/jadwal-misa) | Malang static parish JSON | No license found | Reference only |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Tagged community map; Overpass read API | ODbL 1.0 | Separate future dataset only |
| [Gereja Bersaudara](https://gerejabersaudara.id/peta-gereja) | OSM-based Christian church map, CSV and internal JSON endpoint | ODbL stated for OSM database; other additions require review | Separate future source review |

## Paroki.org checkpoint

- [Terms](https://paroki.org/terms/) were dated April 26, 2026 when inspected.
- [robots.txt](https://paroki.org/robots.txt) returned HTTP 200 and allowed `/`, with a sitemap declaration. Check each subdomain's own robots policy during any authorized run.
- [Sitemap index](https://paroki.org/sitemap.xml) was available. Its 2,183 `<loc>` entries include non-profile sitemaps and are not a count of verified Indonesian churches.
- [Client JavaScript](https://paroki.org/app.js?v=1779335678) references `/data/profiles.json`, `/data/profiles-geo.json`, and other JSON files. These profile exports were not downloaded. No documented supported directory API or bulk reuse grant was found in the inspected pages. Static technical access must not be described as an authorized export.
- Three profile pages were inspected: `medankatedral.paroki.org`, `stasisantacatarinatmii.paroki.org`, and `stpetruskanisiusmungkid.paroki.org`. No extracted profile records are included. Further profile sampling is disabled for the tooling-first implementation; the original five-profile maximum still applies until permission is established.
- Profile JSON-LD can omit administrative fields and coordinates. `parentOrganization` can identify a diocese rather than a parish. Type claims may need review; neither structured formatting nor successful retrieval implies verification.
- [Indonesian permission draft](docs/permissions/paroki-org-request.md): **not sent**.
- The maintainer subsequently reported oral permission from the operator for local extraction. The actual grant date and license were not supplied. The attestation stays private; see [listing-only workflow](docs/LISTING-EXTRACTION.md). This establishes no public redistribution or commercial reuse license.

## Source register

`config/sources.json` is the executable public source register. Paroki.org and Kemenag remain `pending` for publication. The profile/publication workflow requires reviewed extraction/redistribution/commercial rights, terms hash, attribution and institutional contact. Local listing extraction separately requires a scoped private attestation and reviewed terms fingerprint, conferring no publication rights. No command auto-approves a source or sends a request.

Every future record references the source register and retains source URL, access date, license, terms fingerprint, content fingerprint, extractor version, and individual field claims. Export rechecks rights, so a revoked or changed source cannot pass merely because its data is cached.
