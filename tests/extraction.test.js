import test from 'node:test';
import assert from 'node:assert/strict';
import { extractProfile, discoverDocument } from '../scripts/lib/extraction.js';
import { normalizeObservations, duplicateCandidates, mergeRecords } from '../scripts/lib/records.js';
import { html, source, DATE, mappings, curation, registry, record } from './fixtures.js';

const extract = body => extractProfile(body, 'https://one.example.org/', source(), DATE);
const normalize = (observations, ids = registry(), previous = [], decisions = curation) => normalizeObservations(observations, ids, previous, mappings, decisions);
test('discovers only approved profile roots and sitemap entries', () => {
  const result = discoverDocument('<a href="https://one.example.org/">site</a><a href="https://evil.test/">external</a><a href="https://one.example.org/admin">other</a>', 'https://example.org/browse/', source());
  assert.deepEqual(result.profiles, ['https://one.example.org/']);
  assert.equal(discoverDocument('<sitemapindex><sitemap><loc>https://one.example.org/sitemap.xml</loc></sitemap></sitemapindex>', 'https://example.org/sitemap.xml', source()).sitemaps.length, 1);
});
test('extracts JSON-LD graph, canonical identity, HTML fallback and JSON schedule without executing JS', () => {
  const body = html({ suffix: '<dl><dt>Provinsi</dt><dd>Provinsi Contoh</dd></dl><script>var S=[{"d":"minggu","t":"07:00","c":"Misa"}],PLat=null;</script><script>throw new Error("must not execute")</script>' });
  const result = normalize([extract(body)]);
  assert.equal(result.records[0].administrative_area.province, 'Provinsi Contoh');
  assert.equal(result.records[0].mass_schedules[0].time, '07:00');
  assert.equal(result.records[0].mass_schedules[0].time_zone, null);
});
test('unconfirmed and personal contacts never enter public facts or provenance', () => {
  const body = html({ extra: { telephone: '+62 812 0000 0000', email: 'individual@institution.test' }, suffix: '<p>Romo Contoh: +62 812 0000 0000</p>' });
  const result = normalize([extract(body)]);
  assert.equal(result.records[0].contact.phone, null);
  assert.equal(result.records[0].contact.email, null);
  assert.ok(!JSON.stringify(result.records).includes('individual@'));
  assert.ok(!JSON.stringify(result.records).includes('+62 812'));
});
test('explicitly labeled institutional contacts can be captured', () => {
  const observation = extract(html({ extra: { email: 'office@institution.test' }, suffix: '<p>Sekretariat paroki: office@institution.test</p>' }));
  assert.ok(observation.fields.some(f => f.path === '/contact/email'));
});
test('unknown country, institution or type stays in review staging', () => {
  for (const body of [html({ address: { streetAddress: 'Contoh' } }), html({ name: 'Seminari Contoh' }), html({ type: 'Sekolah' }), html({ address: { addressCountry: 'TL' } })]) {
    const result = normalize([extract(body)]);
    assert.equal(result.records.length, 0);
    assert.equal(result.candidates.length, 1);
  }
});
test('UUID remains stable after a church rename', () => {
  const first = normalize([extract(html())]);
  const second = normalize([extract(html({ name: 'Gereja Contoh Baru' }))], first.registry, first.records);
  assert.equal(second.records[0].id, first.records[0].id);
});
test('source conflict retains both claims and existing canonical value', () => {
  const previous = normalize([extract(html())]);
  const observation = extract(html({ suffix: '<dl><dt>Nama Gereja</dt><dd>Nama berbeda</dd></dl>' }));
  const result = normalize([observation], previous.registry, previous.records);
  assert.equal(result.records[0].name, 'Gereja Contoh');
  assert.equal(new Set(result.records[0].field_provenance['/name'].map(c => c.value)).size, 2);
  assert.ok(result.records[0].sources.length >= 2);
  assert.ok(result.records[0].conflicts.includes('/name'));
});
test('new unresolved identity is retained in staging, not arbitrarily selected', () => {
  const result = normalize([extract(html({ suffix: '<dl><dt>Nama Gereja</dt><dd>Nama berbeda</dd></dl>' }))]);
  assert.equal(result.records.length, 0);
  assert.equal(result.candidates[0].name, null);
});
test('partial or ambiguous refresh retains existing canonical records for review', () => {
  const old = record();
  assert.equal(normalize([], registry([old]), [old]).records.length, 1);
  const initial = normalize([extract(html())]);
  const result = normalize([extract(html({ type: 'Unknown' }))], initial.registry, initial.records);
  assert.equal(result.records[0].id, initial.records[0].id);
  assert.ok(result.review.some(r => r.field === '/type' && r.reason === 'previous_value_retained_pending_refresh_review'));
});
test('fuzzy names and shared coordinates flag distinct sites without merging', () => {
  const a = record(), b = record(1); b.name = `${a.name}a`;
  a.location.latitude = b.location.latitude = -6;
  a.location.longitude = b.location.longitude = 110;
  const candidates = duplicateCandidates([a, b]);
  assert.ok(candidates[0].reasons.includes('similar_name'));
  assert.ok(candidates[0].reasons.includes('same_coordinates'));
});
test('approved merge preserves source claims, stable destination and retired-ID redirect', () => {
  const a = record(), b = record(1);
  const result = mergeRecords([a, b], registry([a, b]), [{ from_id: b.id, into_id: a.id, reviewed_by: 'fixture-reviewer', reviewed_at: DATE, reason: 'Synthetic evidence proves identical site' }]);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].sources.length, 2);
  assert.equal(result.records[0].field_provenance['/name'][1].source_index, 1);
  assert.equal(result.registry.redirects[b.id], a.id);
});
