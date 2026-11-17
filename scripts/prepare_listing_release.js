import { readFile } from 'node:fs/promises';
import { rootFile, cacheFile, readJson, writeJson, atomicWrite, hash, json, run } from './lib/io.js';
import { compactJson, compactSchema } from './lib/compact.js';
import { listingSchema, validateListing, listingStatistics } from './lib/listing.js';
import { assertListingPublication, listingReleaseArtifacts } from './lib/listing-release.js';
import { sourceFor } from './lib/policy.js';

await run(async () => {
  const policy = await readJson(rootFile('config/listing-publication.json'));
  assertListingPublication(policy);
  const records = await readJson(cacheFile('paroki_org/listing/churches.json'));
  const config = await readJson(rootFile('config/sources.json'));
  const registry = await readJson(cacheFile('paroki_org/listing/id-registry.json'));
  const validation = validateListing(records, sourceFor(config, 'paroki_org'), { listing_url: policy.source_url, terms_sha256: policy.terms_sha256 }, registry);
  if (validation.errors.length || records.some(r => r.sources.some(s => s.content_sha256 !== policy.source_snapshot_sha256))) throw new Error('Private listing failed validation or differs from the reviewed snapshot');
  const artifacts = new Map([
    ['data/listings/paroki-org.json', compactJson(records)],
    ['data/listings/paroki-org.csv', await readFile(cacheFile('paroki_org/listing/churches.csv'), 'utf8')],
    ['schema/listing.compact.schema.json', json(compactSchema(listingSchema))],
    ['reports/listings/quality.json', compactJson({ validation_status: validation.status, ...listingStatistics(records, validation), missing_fields: validation.missing })],
    ['reports/listings/duplicates.json', compactJson({ removed: [], pairs: validation.duplicates })]
  ]);
  for (const [file, content] of artifacts) await atomicWrite(rootFile(file), content);
  await writeJson(rootFile('data/listings/manifest.json'), { release_status: 'unreviewed_source_listing', generated_at: new Date().toISOString(), total_records: records.length, verified_records: 0, coverage_complete: false, geography: 'Indonesia and Timor-Leste source directory; record countries are unconfirmed', representation: 'minified JSON; null object properties omitted; absent fields mean unknown', permission: policy, files_sha256: Object.fromEntries([...artifacts].map(([file, content]) => [file, hash(content)])) });
  await listingReleaseArtifacts();
  console.log(JSON.stringify({ publication_prepared: true, unreviewed_listing_records: records.length, license: 'not_confirmed' }));
});
