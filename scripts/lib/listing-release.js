import path from 'node:path';
import { readFile, lstat } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ROOT, readJson, hash, json } from './io.js';
import { compactJson, compactSchema } from './compact.js';
import { listingSchema } from './listing.js';
import { allowedUrl } from './policy.js';

export const listingReleaseFiles = ['data/listings/paroki-org.json', 'data/listings/paroki-org.csv', 'schema/listing.compact.schema.json', 'reports/listings/quality.json', 'reports/listings/duplicates.json'];
const evidenceFile = 'docs/permissions/paroki-org-publication.md';
const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
const validate = ajv.compile(compactSchema(listingSchema));

export function assertListingPublication(policy) {
  if (policy?.source_id !== 'paroki_org' || policy.source_url !== 'https://paroki.org/browse/' || policy.redistribution_permission !== 'confirmed_by_owner_attestation' || policy.evidence !== evidenceFile || !/^\d{4}-\d{2}-\d{2}$/.test(policy.attested_at ?? '')) throw new Error('Source-listing publication permission is not confirmed');
  for (const field of ['source_snapshot_sha256', 'terms_sha256']) if (!/^[a-f0-9]{64}$/.test(policy[field] ?? '')) throw new Error('Reviewed source snapshot and terms fingerprints are required');
  // This release makes no open-license or downstream reuse claim.
  for (const field of ['license', 'commercial_use', 'non_commercial_use', 'attribution_requirements']) if (policy[field] !== 'not_confirmed') throw new Error('Changed reuse terms require a separate reviewed release policy');
}

export async function listingReleaseArtifacts(root = ROOT) {
  const manifest = await readJson(path.join(root, 'data/listings/manifest.json'), null);
  const policy = await readJson(path.join(root, 'config/listing-publication.json'), null);
  if (!manifest && !policy) return new Map();
  assertListingPublication(policy);
  if (!manifest || manifest.release_status !== 'unreviewed_source_listing' || json(manifest.permission) !== json(policy)) throw new Error('Source-listing manifest does not match recorded publication permission');
  const artifacts = new Map();
  for (const file of [...listingReleaseFiles, 'data/listings/manifest.json', evidenceFile]) {
    const location = path.join(root, file), info = await lstat(location);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Listing release files must be regular files');
    const bytes = await readFile(location);
    if (listingReleaseFiles.includes(file) && manifest.files_sha256[file] !== hash(bytes)) throw new Error(`Listing release checksum mismatch: ${file}`);
    artifacts.set(file, bytes);
  }
  if (artifacts.get('schema/listing.compact.schema.json').toString('utf8') !== json(compactSchema(listingSchema))) throw new Error('Compact listing schema is stale');
  const bytes = artifacts.get('data/listings/paroki-org.json');
  const records = JSON.parse(bytes.toString('utf8'));
  if (!Array.isArray(records) || records.length !== manifest.total_records || compactJson(records) !== bytes.toString('utf8')) throw new Error('Source listing must be a minified array without null object properties');
  const ids = new Set(), urls = new Set();
  const source = { origin: 'https://paroki.org', allow_subdomains: true };
  for (const record of records) {
    if (!validate(record)) throw new Error(`Compact listing schema validation failed: ${JSON.stringify(validate.errors)}`);
    if (ids.has(record.id)) throw new Error('Duplicate listing ID'); ids.add(record.id);
    const identity = record.sources[0]?.identity_url;
    if (!identity || urls.has(identity)) throw new Error('Missing or duplicate listing profile identity'); urls.add(identity);
    const target = new URL(allowedUrl(identity, source));
    if (target.hostname === 'paroki.org' || target.pathname !== '/' || target.search) throw new Error('Invalid listing profile URL');
    for (const citation of record.sources) {
      if (Object.hasOwn(citation, 'license')) throw new Error('A license must not be assigned to an unlicensed source listing');
      if (citation.source_id !== policy.source_id || citation.url !== policy.source_url || citation.content_sha256 !== policy.source_snapshot_sha256 || citation.terms_sha256 !== policy.terms_sha256) throw new Error('Unreviewed source or snapshot in listing release');
    }
    if (record.verification.status === 'source_verified') throw new Error('Source verification must not be implied by this listing release');
  }
  return artifacts;
}
