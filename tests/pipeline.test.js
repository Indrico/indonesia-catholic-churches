import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProfile } from '../scripts/lib/extraction.js';
import { normalizeObservations, mergeRecords } from '../scripts/lib/records.js';
import { validateDataset } from '../scripts/lib/validation.js';
import { buildArtifacts } from '../scripts/lib/exporting.js';
import { html, source, config, registry, mappings, curation, DATE } from './fixtures.js';

test('synthetic authorized HTML flows through normalization, validation and all exports', async () => {
  const observation = extractProfile(html({ extra: { geo: { latitude: -6, longitude: 110 }, parentOrganization: { name: 'Keuskupan Contoh' } } }), 'https://one.example.org/', source(), DATE);
  const normalized = normalizeObservations([observation], registry(), [], mappings, curation);
  assert.equal(normalized.records.length, 1);
  const merged = mergeRecords(normalized.records, normalized.registry, []);
  const validation = await validateDataset(merged.records, [], merged.registry, config());
  assert.deepEqual(validation.errors, []);
  const artifacts = buildArtifacts({ records: merged.records, parishes: [], registry: merged.registry, config: config(), validation, generatedAt: '2026-11-17T00:00:00.000Z', extraction: { status: 'completed', observations: 1 }, review: normalized.review });
  assert.equal(JSON.parse(artifacts.get('data/manifest.json')).statistics.with_coordinates, 1);
  assert.equal(JSON.parse(artifacts.get('data/manifest.json')).coverage_complete, false);
});
test('inconsistent church type stays in review rather than being inferred from its name', () => {
  const observation = extractProfile(html({ name: 'Paroki Contoh Katedral', type: 'Paroki' }), 'https://one.example.org/', source(), DATE);
  const result = normalizeObservations([observation], registry(), [], mappings, curation);
  assert.equal(result.records.length, 0);
  assert.ok(result.review.some(item => item.reason === 'type_name_disagreement'));
});
test('identical repeated source snapshots collapse without creating a second church', () => {
  const observation = extractProfile(html(), 'https://one.example.org/', source(), DATE);
  const result = normalizeObservations([observation, observation], registry(), [], mappings, curation);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sources.length, 1);
  assert.equal(result.duplicate_observations_removed, 1);
});
test('old selected value retains its historical evidence when both new claims disagree', () => {
  const extract = body => extractProfile(body, 'https://one.example.org/', source(), DATE);
  const initial = normalizeObservations([extract(html({ name: 'Old original name' }))], registry(), [], mappings, curation);
  const changed = extract(html({ name: 'New source name', suffix: '<dl><dt>Nama Gereja</dt><dd>Another source name</dd></dl>' }));
  const result = normalizeObservations([changed], initial.registry, initial.records, mappings, curation);
  assert.equal(result.records[0].name, 'Old original name');
  assert.ok(result.records[0].field_provenance['/name'].some(c => c.value === 'Old original name'));
});
test('incomplete refresh preserves earlier address and coordinate pair with their evidence', async () => {
  const extract = body => extractProfile(body, 'https://one.example.org/', source(), DATE);
  const initial = normalizeObservations([extract(html({ extra: { geo: { latitude: -6, longitude: 110 } } }))], registry(), [], mappings, curation);
  const changed = extract(html({ address: { addressCountry: 'ID' }, extra: { geo: { latitude: -7 } } }));
  const result = normalizeObservations([changed], initial.registry, initial.records, mappings, curation);
  assert.equal(result.records[0].address, 'Jalan Contoh');
  assert.deepEqual(result.records[0].location, initial.records[0].location);
  assert.equal(result.records[0].verification.status, 'needs_review');
  assert.deepEqual((await validateDataset(result.records, [], result.registry, config())).errors, []);
});
