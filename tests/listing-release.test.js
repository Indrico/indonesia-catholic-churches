// Entirely synthetic; these tests perform no source requests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { record } from './fixtures.js';
import { json, hash, writeJson } from '../scripts/lib/io.js';
import { compactJson, compactSchema } from '../scripts/lib/compact.js';
import { listingSchema } from '../scripts/lib/listing.js';
import { listingReleaseArtifacts, listingReleaseFiles, assertListingPublication } from '../scripts/lib/listing-release.js';

test('a separate compact listing retains attribution, blocks unconfirmed publication and detects changed data', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'church-publication-test-'));
  try {
    assert.equal((await listingReleaseArtifacts(directory)).size, 0);
    const policy = { source_id: 'paroki_org', source_url: 'https://paroki.org/browse/', redistribution_permission: 'confirmed_by_owner_attestation', evidence: 'docs/permissions/paroki-org-publication.md', attested_at: '2026-11-17', license: 'not_confirmed', commercial_use: 'not_confirmed', non_commercial_use: 'not_confirmed', attribution_requirements: 'not_confirmed', source_snapshot_sha256: 'a'.repeat(64), terms_sha256: 'b'.repeat(64) };
    assert.throws(() => assertListingPublication({ ...policy, redistribution_permission: 'not_confirmed' }), /not confirmed/);
    const row = record();
    row.administrative_area.country = null; row.type = null;
    Object.assign(row.sources[0], { source_id: policy.source_id, name: 'Synthetic source fixture', url: policy.source_url, identity_url: 'https://syntheticfixture.paroki.org/', content_sha256: policy.source_snapshot_sha256, terms_sha256: policy.terms_sha256, license: null });
    const contents = [compactJson([row]), 'id,name\n', json(compactSchema(listingSchema)), '{}\n', '{}\n'];
    const checksums = {};
    for (const [i, filename] of listingReleaseFiles.entries()) {
      const location = path.join(directory, filename); await mkdir(path.dirname(location), { recursive: true }); await writeFile(location, contents[i]); checksums[filename] = hash(contents[i]);
    }
    await writeJson(path.join(directory, 'config/listing-publication.json'), policy);
    await mkdir(path.join(directory, 'docs/permissions'), { recursive: true });
    await writeFile(path.join(directory, policy.evidence), 'Synthetic owner attestation for a test only.');
    await writeJson(path.join(directory, 'data/listings/manifest.json'), { total_records: 1, release_status: 'unreviewed_source_listing', permission: policy, files_sha256: checksums });
    assert.equal((await listingReleaseArtifacts(directory)).size, 7);
    const compact = JSON.parse(contents[0]);
    assert.equal(Object.hasOwn(compact[0], 'type'), false);
    assert.equal(compact[0].sources[0].url, policy.source_url);
    await writeJson(path.join(directory, 'config/listing-publication.json'), { ...policy, redistribution_permission: 'not_confirmed' });
    await assert.rejects(listingReleaseArtifacts(directory), /not confirmed/);
    await writeJson(path.join(directory, 'config/listing-publication.json'), policy);
    await writeFile(path.join(directory, listingReleaseFiles[0]), '[{"changed":true}]');
    await assert.rejects(listingReleaseArtifacts(directory), /checksum mismatch/);
  } finally {
    const target = path.resolve(directory);
    assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(target, { recursive: true, force: true });
  }
});
