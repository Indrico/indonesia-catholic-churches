import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from '../scripts/lib/validation.js';
import { record, registry, config, claim, IDS } from './fixtures.js';

const validate = (r, parishes = []) => validateDataset([r], parishes, registry([r, ...parishes]), config());
test('synthetic sourced record validates; an empty dataset is valid without asserting coverage', async () => {
  assert.deepEqual((await validate(record())).errors, []);
  assert.equal((await validateDataset([], [], registry(), config())).status, 'passed');
});
for (const [label, mutate] of [
  ['latitude', r => { r.location.latitude = 91; }],
  ['longitude', r => { r.location.longitude = 181; }],
  ['email', r => { r.contact.email = 'invalid'; }],
  ['website', r => { r.contact.website = 'javascript:alert(1)'; }],
  ['type', r => { r.type = 'sekolah'; }],
  ['attribution', r => { r.sources = []; }],
  ['provenance', r => { delete r.field_provenance['/name']; }],
  ['reference', r => { r.field_provenance['/name'][0].source_index = 9; }],
  ['parent', r => { r.parent_parish_id = IDS[2]; claim(r, '/parent_parish_id', IDS[2]); }],
  ['verification', r => { r.verification.status = 'source_verified'; }]
]) test(`rejects invalid ${label}`, async () => {
  const r = record(); mutate(r);
  assert.ok((await validate(r)).errors.length);
});
test('missing province and diocese are review warnings, not discarded records', async () => {
  const r = record(); r.administrative_area.province = null; r.diocese.name = null;
  const result = await validate(r);
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 2);
  assert.ok(result.missing[0].fields.includes('/diocese/name'));
});
test('permission revocation and changed terms block publication', async () => {
  const r = record(), cfg = config(); cfg.sources[0].permission.redistribution = 'pending';
  assert.ok((await validateDataset([r], [], registry([r]), cfg)).errors.some(e => e.code === 'source_rights'));
  r.sources[0].terms_sha256 = '0'.repeat(64);
  assert.ok((await validate(r)).errors.some(e => e.code === 'source_rights'));
});
test('coordinates require a complete common-source pair', async () => {
  const r = record(); r.location.latitude = -6; claim(r, '/location/latitude', -6);
  assert.ok((await validate(r)).errors.some(e => e.code === 'coordinate_pair'));
});
test('duplicate candidates remain visible rather than being discarded', async () => {
  const a = record(), b = record(1); b.name = a.name;
  const result = await validateDataset([a, b], [], registry([a, b]), config());
  assert.equal(result.errors.length, 0);
  assert.equal(result.duplicates.length, 1);
});
test('institutional verification requires evidence and reviewer', async () => {
  const r = record(); r.verification = { status: 'source_verified', reviewed_by: 'fixture-reviewer', verified_at: '2026-11-17', evidence: ['https://example.org/institutional-evidence'] };
  assert.equal((await validate(r)).errors.length, 0);
});
