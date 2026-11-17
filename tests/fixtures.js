// Entirely synthetic. These are not extracted church records or real contacts.
import { hash } from '../scripts/lib/io.js';
import { emptyRecord } from '../scripts/lib/records.js';

export const IDS = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
export const TERMS = 'Synthetic permission for extraction, redistribution, and open reuse.';
export const DATE = '2026-11-17';
export function source() {
  return { id: 'synthetic', name: 'Synthetic source', origin: 'https://example.org', allow_subdomains: true, discovery_urls: ['https://example.org/browse/'], terms_url: 'https://example.org/terms/', terms_sha256: hash(TERMS), delay_ms: 2000, permission: { extraction: 'approved', redistribution: 'approved', commercial_reuse: true, license: 'CC-BY-4.0', attribution: 'Synthetic fixtures only', evidence: ['https://example.org/grant'], reviewed_by: 'synthetic-reviewer', reviewed_at: DATE } };
}
export function config() { return { project_url: 'https://github.com/Indrico/indonesia-catholic-churches', contact: 'directory@institution.test', sources: [source()] }; }
export function citation(url = 'https://one.example.org/') {
  const s = source();
  return { source_id: s.id, name: s.name, url, accessed_at: DATE, license: s.permission.license, terms_sha256: s.terms_sha256, content_sha256: hash('synthetic'), extractor_version: '1.0.0' };
}
export function record(index = 0) {
  const r = emptyRecord(IDS[index]);
  r.name = `Gereja Contoh ${index + 1}`;
  r.type = 'paroki';
  r.sources = [citation(`https://site${index}.example.org/`)];
  r.address = 'Jalan Contoh 1';
  r.diocese.name = 'Keuskupan Contoh';
  r.administrative_area.province = 'Provinsi Contoh';
  r.administrative_area.city = 'Kota Contoh';
  for (const [pointer, value] of Object.entries({ '/name': r.name, '/type': r.type, '/address': r.address, '/diocese/name': r.diocese.name, '/administrative_area/country': 'ID', '/administrative_area/province': r.administrative_area.province, '/administrative_area/city': r.administrative_area.city })) claim(r, pointer, value);
  return r;
}
export function claim(record, path, value, sourceIndex = 0) {
  (record.field_provenance[path] ??= []).push({ source_index: sourceIndex, value, locator: 'synthetic', observed_at: DATE, method: 'captured' });
}
export function registry(records = []) { return { identities: Object.fromEntries(records.flatMap(r => r.sources.map(s => [`${s.source_id}:${s.url}`, r.id]))), redirects: {} }; }
export const mappings = { version: '1', province_aliases: {}, city_aliases: {}, diocese_aliases: {} };
export const curation = { decisions: [], merges: [] };
export function html({ name = 'Gereja Contoh', type = 'Paroki', address = { streetAddress: 'Jalan Contoh', addressCountry: 'ID' }, extra = {}, suffix = '' } = {}) {
  return `<html><head><link rel="canonical" href="https://one.example.org/"><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [{ '@type': 'Church', name, additionalType: type, address, ...extra }] })}</script></head><body>${suffix}</body></html>`;
}
