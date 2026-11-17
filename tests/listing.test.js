// Synthetic HTML and contacts only. Tests never contact Paroki.org.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parse as parseCsv } from 'csv-parse/sync';
import { parseListing, normalizeListingGroup, validateListing, mapCoordinates, listingStatistics } from '../scripts/lib/listing.js';
import { runListing, listingSnapshot } from '../scripts/lib/listing-workflow.js';
import { PoliteClient } from '../scripts/lib/http.js';
import { assertEligible, assertLocalListingPermission } from '../scripts/lib/policy.js';
import { writeJson, readJson, hash, json } from '../scripts/lib/io.js';
import { source, config, TERMS, DATE, record as publicRecord } from './fixtures.js';
import { validateDataset } from '../scripts/lib/validation.js';
import { duplicateCandidates } from '../scripts/lib/records.js';

function setup() {
  const s = source();
  s.permission = { extraction: 'pending', redistribution: 'pending', commercial_reuse: false, license: null };
  s.terms_sha256 = null;
  const project = { ...config(), contact: null, contact_url: 'https://github.com/Indrico/indonesia-catholic-churches/issues' };
  const grant = { source_id: s.id, scope: 'listing_only_local', extraction: 'approved', grant_form: 'oral', attestation: 'Synthetic maintainer attestation', attested_by: 'synthetic-maintainer', attested_at: DATE, terms_sha256: hash(TERMS), listing_url: `${s.origin}/browse/` };
  return { source: s, project, grant };
}
const card = (slug, content = '', name = `Gereja Contoh ${slug}`) => `<article class="browse-card"><div class="card-content"><div class="card-header"><h3><a href="https://${slug}.example.org/">${name}</a></h3><span class="pill">Label Ambigu</span></div>${content}</div></article>`;
const page = content => `<html><head><link rel="canonical" href="https://example.org/browse/"></head><body><div class="city-row"><div class="city-row-label">Kelompok Ambigu (99)</div><div class="city-row-scroll">${content}</div></div></body></html>`;
function parse(body, selected = setup()) { return parseListing(body, selected.grant.listing_url, selected.source, selected.grant.terms_sha256, DATE); }
function normalized(body) {
  const selected = setup();
  const observations = parse(body, selected).observations;
  const result = normalizeListingGroup(observations);
  const registry = { identities: { [`${selected.source.id}:${observations[0].identity}`]: result.record.id }, redirects: {} };
  return { ...selected, ...result, registry };
}
async function temporary(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'church-listing-test-'));
  try { return await callback(directory); }
  finally {
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(absolute, { recursive: true, force: true });
  }
}
function transport(body) {
  const calls = [], waits = [];
  let now = Date.now();
  return { calls, waits, clientFactory: (s, p, options) => new PoliteClient(s, p, { ...options, now: () => now, sleepImpl: async ms => { waits.push(ms); now += ms; }, fetchImpl: async (url, request) => {
    calls.push({ url, at: now, headers: request.headers });
    if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n');
    if (url.endsWith('/terms/')) return new Response(TERMS);
    assert.equal(url, 'https://example.org/browse/');
    return new Response(body, { headers: { etag: 'synthetic-listing' } });
  } }) };
}

test('oral grant permits only local listing requests and confers no publication rights', async () => {
  const selected = setup();
  assert.doesNotThrow(() => assertLocalListingPermission(selected.source, selected.project, selected.grant));
  assert.throws(() => assertEligible(selected.source), /Permission blocked/);
  assert.throws(() => assertLocalListingPermission(selected.source, selected.project, null), /permission/);
  assert.throws(() => assertLocalListingPermission(selected.source, selected.project, { ...selected.grant, scope: 'all_profiles' }), /permission/);
  const t = transport(page(card('one')));
  const client = t.clientFactory(selected.source, selected.project, { localListingGrant: selected.grant });
  for (const forbidden of ['https://one.example.org/', 'https://example.org/data/profiles.json', 'https://example.org/sitemap.xml', 'https://example.org/browse/?q=test']) await assert.rejects(client.get(forbidden), /forbids/);
  assert.equal(t.calls.length, 0);
  await client.get(selected.grant.listing_url);
  assert.equal(t.calls.length, 3);
  assert.ok(t.calls.every(c => c.headers['User-Agent'].includes('contact=https://github.com/')));
  for (let i = 1; i < t.calls.length; i++) assert.ok(t.calls[i].at - t.calls[i-1].at >= 3000);
});

test('ambiguous groups and church names do not infer country, diocese, city or type', () => {
  const result = normalized(page(card('one', '', 'Katedral Contoh')));
  assert.equal(result.record.name, 'Katedral Contoh');
  assert.equal(result.record.type, null);
  assert.equal(result.record.administrative_area.country, null);
  assert.equal(result.record.administrative_area.city, null);
  assert.equal(result.record.diocese.name, null);
  assert.equal(result.contexts[0].group_label, 'Kelompok Ambigu (99)');
  assert.deepEqual(result.contexts[0].header_labels, ['Label Ambigu']);
  const report = validateListing([result.record], result.source, result.grant, result.registry);
  assert.equal(report.status, 'passed');
  assert.equal(report.publication_allowed, false);
});

test('explicit labels, office contacts, numeric map destinations and schedules retain provenance', () => {
  const r = normalized(page(card('one', `<p>Negara: Indonesia</p><p>Jenis: paroki</p><p>Keuskupan: Keuskupan Contoh</p><p>Provinsi: Provinsi Contoh</p><p>Kota: Kota Contoh</p><p>Alamat: Jalan Contoh 1</p><p>Sekretariat: <a href="tel:+62217210000">Kantor</a> <a href="mailto:office@institution.test">Email</a></p><p>Website resmi: <a href="https://institution.test/">Situs</a></p><p><a href="https://www.google.com/maps/dir/?api=1&amp;destination=-6.123,106.456">Peta</a></p><div class="card-meta"><span class="pill">minggu 08:00</span><span class="pill">selasa | kamis 06:00</span></div>`)));
  assert.equal(r.record.location.latitude, -6.123);
  assert.equal(r.record.location.longitude, 106.456);
  assert.equal(r.record.contact.phone_e164, '+62217210000');
  assert.equal(r.record.contact.email, 'office@institution.test');
  assert.equal(r.record.mass_schedules.length, 2);
  assert.equal(r.record.mass_schedules[1].day, null);
  assert.equal(r.record.sources[0].url, 'https://example.org/browse/');
  assert.equal(r.record.sources[0].identity_url, 'https://one.example.org/');
  assert.equal(r.record.field_provenance['/administrative_area/country'][0].value, 'Indonesia');
  assert.equal(validateListing([r.record], r.source, r.grant, r.registry).status, 'passed');
  assert.equal(listingStatistics([r.record], { duplicates: [] }).completeness.percentage, 100);
});

test('personal and unlabeled contacts are withheld from fields and provenance', () => {
  const r = normalized(page(card('one', '<p>Romo Contoh Sekretariat: <a href="tel:+62217210000">Telepon</a><a href="mailto:private@institution.test">Email</a></p><a href="mailto:unlabeled@institution.test">Email lain</a>')));
  assert.equal(r.record.contact.email, null);
  assert.equal(r.record.contact.phone, null);
  assert.ok(!JSON.stringify(r).includes('private@institution.test'));
  assert.ok(!JSON.stringify(r).includes('unlabeled@institution.test'));
});

test('the server-rendered card-body address slot is captured without parsing inferred areas', () => {
  const r = normalized(page(card('one', '<div class="card-body">Jalan Contoh, Kota Contoh, Provinsi Contoh 12345</div>')));
  assert.equal(r.record.address, 'Jalan Contoh, Kota Contoh, Provinsi Contoh 12345');
  assert.equal(r.record.administrative_area.city, null);
  assert.equal(r.record.administrative_area.province, null);
  assert.ok(r.record.field_provenance['/address'][0].locator.includes('.card-body'));
});

test('invalid, camera-center and named map destinations never become GPS coordinates', () => {
  for (const url of ['https://www.google.com/maps/@-6.12,106.45,12z', 'https://www.google.com/maps/?q=Gereja', 'https://www.google.com/maps/?destination=91,100', 'https://evil.test/?destination=-6,106', 'https://maps.app.goo.gl/short', 'https://www.google.com/maps/?destination=,']) assert.equal(mapCoordinates(url), null);
  assert.deepEqual(mapCoordinates('https://www.google.com/maps/?query=0,0'), { latitude: 0, longitude: 0 });
});

test('same profile preserves competing values and distinct profiles on one page are not duplicates', () => {
  const r = normalized(page(card('one', '<p>Alamat: Jalan A</p>') + card('one', '<p>Alamat: Jalan B</p>')));
  assert.equal(r.record.address, null);
  assert.ok(r.record.conflicts.includes('/address'));
  assert.equal(r.record.field_provenance['/address'].length, 2);
  assert.equal(validateListing([r.record], r.source, r.grant, r.registry).status, 'passed');
  const cards = parse(page(card('one') + card('two'))).observations;
  const records = cards.map(o => normalizeListingGroup([o]).record);
  const registry = { identities: Object.fromEntries(records.map(rec => [`synthetic:${rec.sources[0].identity_url}`, rec.id])), redirects: {} };
  assert.deepEqual(validateListing(records, r.source, r.grant, registry).duplicates, []);
});

test('invalid card identities are reported and an empty/changed layout fails visibly', () => {
  const parsed = parse(page(card('one') + '<article class="browse-card"><h3>Missing URL</h3></article>'));
  assert.equal(parsed.observations.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.throws(() => parse('<html><body>Changed structure</body></html>'), /structure changed/);
});

test('interruption resumes locally, preserves UUIDs and exports JSON/CSV with real counts', async () => temporary(async directory => {
  const selected = setup();
  const body = page(card('one', '<p>Alamat: Jalan A</p>') + card('one', '<p>Alamat: Jalan A</p>') + card('two'));
  const t = transport(body);
  let interrupted = false;
  await assert.rejects(runListing({ ...selected, directory, clientFactory: t.clientFactory, onProcessed: async () => { if (!interrupted) { interrupted = true; throw new Error('Synthetic interruption'); } } }), /Synthetic interruption/);
  const state = await readJson(path.join(directory, 'progress.json'));
  const originalId = state.entries['https://one.example.org/'].id;
  const summary = await runListing({ ...selected, directory, clientFactory: () => { throw new Error('Must use cache'); } });
  assert.equal(summary.total_records, 2);
  assert.equal(summary.cards_found, 3);
  assert.equal(summary.duplicate_cards_collapsed, 1);
  assert.equal(summary.by_country.unknown, 2);
  assert.equal(summary.profile_pages_requested, 0);
  assert.equal(summary.publication_allowed, false);
  const records = await readJson(path.join(directory, 'churches.json'));
  assert.equal(records.find(r => r.sources[0].identity_url === 'https://one.example.org/').id, originalId);
  const csv = parseCsv(await readFile(path.join(directory, 'churches.csv'), 'utf8'), { columns: true });
  assert.equal(csv.length, 2);
  assert.equal(csv[0].source_url, selected.grant.listing_url);
  assert.equal(t.calls.length, 3);
  assert.equal((await readJson(path.join(directory, 'discovered_profiles.json'))).length, 2);
  assert.ok(!records.some(r => r.sources[0].license));
}));

test('sample selects at most five cards and replay leaves IDs stable without more requests', async () => temporary(async directory => {
  const selected = setup();
  const t = transport(page(Array.from({ length: 8 }, (_, i) => card(`site${i}`)).join('')));
  const initial = await runListing({ ...selected, directory, sample: true, clientFactory: t.clientFactory });
  assert.equal(initial.successfully_extracted, 5);
  const records = await readJson(path.join(directory, 'sample/churches.json'));
  const final = await runListing({ ...selected, directory, clientFactory: () => { throw new Error('Network forbidden on cached replay'); } });
  assert.equal(final.successfully_extracted, 8);
  const all = await readJson(path.join(directory, 'churches.json'));
  for (const r of records) assert.equal(all.find(item => item.sources[0].identity_url === r.sources[0].identity_url).id, r.id);
}));

test('pending grant, changed policy and Retry-After block before network access', async () => temporary(async directory => {
  const selected = setup();
  const fail = () => { throw new Error('Network must not run'); };
  await assert.rejects(listingSnapshot({ ...selected, directory, grant: null, clientFactory: fail }), /permission/);
  await writeJson(path.join(directory, 'network.json'), { requests: [], retry_at: new Date(Date.now() + 60000).toISOString() });
  await assert.rejects(listingSnapshot({ ...selected, directory, clientFactory: fail }), /paused until/);
  const policy_hash = hash(json({ source: selected.source, grant: selected.grant, project: selected.project }));
  await writeJson(path.join(directory, 'snapshot.json'), { policy_hash: 'changed' });
  await assert.rejects(listingSnapshot({ ...selected, directory, clientFactory: fail }), /policy changed/);
  assert.equal(policy_hash.length, 64);
}));

test('a shared listing URL keeps distinct public identities and phone duplicates remain review-only', async () => {
  const a = publicRecord(0), b = publicRecord(1);
  for (const r of [a, b]) {
    r.sources[0].identity_url = r.sources[0].url;
    r.sources[0].url = 'https://example.org/browse/';
  }
  const registry = { identities: Object.fromEntries([a, b].map(r => [`synthetic:${r.sources[0].identity_url}`, r.id])), redirects: {} };
  const result = await validateDataset([a, b], [], registry, config());
  assert.deepEqual(result.errors, []);
  assert.ok(result.duplicates.every(pair => !pair.reasons.includes('same_canonical_url')));
  a.contact.phone_e164 = b.contact.phone_e164 = '+62217210000';
  assert.ok(duplicateCandidates([a, b])[0].reasons.includes('same_phone'));
  assert.equal([a, b].length, 2);
});

test('listing refresh retains identity through rename and corrupt/layout-changed snapshots preserve exports', async () => temporary(async directory => {
  const selected = setup();
  const initial = transport(page(card('one')));
  await runListing({ ...selected, directory, clientFactory: initial.clientFactory });
  const first = await readJson(path.join(directory, 'churches.json'));
  const networkFile = path.join(directory, 'network.json');
  const network = await readJson(networkFile);
  network.retry_at = new Date(0).toISOString();
  await writeJson(networkFile, network);
  const renamed = transport(page(card('one', '', 'Gereja Nama Baru')));
  await runListing({ ...selected, directory, refresh: true, clientFactory: renamed.clientFactory });
  const next = await readJson(path.join(directory, 'churches.json'));
  assert.equal(next[0].name, 'Gereja Nama Baru');
  assert.equal(next[0].id, first[0].id);
  const exported = await readFile(path.join(directory, 'churches.json'), 'utf8');
  const currentNetwork = await readJson(networkFile); currentNetwork.retry_at = new Date(0).toISOString(); await writeJson(networkFile, currentNetwork);
  const drift = transport('<html><body>Unknown layout</body></html>');
  await assert.rejects(runListing({ ...selected, directory, refresh: true, clientFactory: drift.clientFactory }), /structure changed/);
  assert.equal(await readFile(path.join(directory, 'churches.json'), 'utf8'), exported);
  const snapshot = await readJson(path.join(directory, 'snapshot.json'));
  snapshot.body += 'corrupt';
  await writeJson(path.join(directory, 'snapshot.json'), snapshot);
  await assert.rejects(runListing({ ...selected, directory, clientFactory: () => { throw new Error('Network forbidden'); } }), /integrity/);
  assert.equal(await readFile(path.join(directory, 'churches.json'), 'utf8'), exported);
}));
