import * as cheerio from 'cheerio';
import { randomUUID } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { canonicalUrl, hash, readJson, rootFile, compareRecords } from './io.js';
import { allowedUrl, sourceIdentity } from './policy.js';
import { emptyRecord, normalizeField, getPointer, setPointer, duplicateCandidates } from './records.js';

export const LISTING_VERSION = '1.0.2';
const clean = value => typeof value === 'string' && value.trim() ? value.replace(/\s+/g, ' ').trim() : null;
const mappings = { version: 'listing-1', province_aliases: {}, city_aliases: {}, diocese_aliases: {} };
const publicSchema = await readJson(rootFile('schema/church.schema.json'));
const stagingSchema = structuredClone(publicSchema);
delete stagingSchema.$id;
stagingSchema.properties.type.enum.push(null);
stagingSchema.properties.name.type = ['string', 'null'];
stagingSchema.properties.administrative_area.properties.country = { type: ['string', 'null'], pattern: '^[A-Z]{2}$' };
stagingSchema.$defs.source.properties.license = { type: ['string', 'null'], minLength: 1 };
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateRecord = ajv.compile(stagingSchema);
export const listingSchema = stagingSchema;

export function mapCoordinates(value) {
  let url;
  try { url = new URL(canonicalUrl(value)); } catch { return null; }
  if (!['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'].includes(url.hostname)) return null;
  // A camera center (/maps/@... or ll=...) is not a destination coordinate.
  const destination = url.searchParams.get('destination') ?? url.searchParams.get('query') ?? url.searchParams.get('q');
  const pair = destination?.match(/^\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*,\s*([+-]?(?:\d+(?:\.\d+)?|\.\d+))\s*$/);
  if (!pair) return null;
  const latitude = Number(pair[1]), longitude = Number(pair[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

export function parseListing(body, url, source, termsSha256, accessedAt, { sample = false } = {}) {
  const $ = cheerio.load(body);
  const cards = $('article.browse-card').toArray();
  if (!cards.length) throw new Error('Listing structure changed: no article.browse-card elements; previous results preserved');
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical && allowedUrl(canonicalUrl(canonical, url), source) !== url) throw new Error('Unexpected listing canonical URL');
  const selected = sample ? [...new Set([0, Math.floor(cards.length / 4), Math.floor(cards.length / 2), Math.floor(3 * cards.length / 4), cards.length - 1])] : cards.map((_, i) => i);
  const observations = [], errors = [];
  for (const index of selected) {
    const card = $(cards[index]);
    const locator = `article.browse-card:nth-of-list(${index + 1})`;
    const link = card.find('.card-header h3 a[href], h3 > a[href]').first();
    const name = link.text().trim() || null;
    let identity;
    try {
      identity = allowedUrl(canonicalUrl(link.attr('href'), url), source);
      const u = new URL(identity);
      if (u.hostname === new URL(source.origin).hostname || u.pathname !== '/' || u.search) throw new Error();
      if (!name || !link.attr('href')) throw new Error();
    } catch { errors.push({ card_index: index, locator, reason: 'invalid_or_missing_profile_identity' }); continue; }
    const fields = [], issues = [];
    const add = (path, value, part) => { if (value !== null && value !== undefined && value !== '') fields.push({ path, value, locator: `${locator} ${part}` }); };
    add('/name', name, 'h3 a:text');
    const row = card.closest('.city-row');
    const context = {
      card_index: index, locator,
      group_label: clean(row.children().not('.city-row-scroll').text())?.slice(0, 256) ?? null,
      header_labels: card.find('.card-header .pill').map((_, el) => clean($(el).text())).get()
    };
    // In the inspected server-rendered listing, card-body is the address slot.
    card.find('.card-content > .card-body').each((i, el) => add('/address', clean($(el).text()), `.card-body:${i}:text`));
    // Explicit labels only. Header pills and city-row groups are ambiguous.
    const labels = new Map([
      ['alamat', '/address'], ['jenis', '/type'], ['tipe', '/type'], ['keuskupan', '/diocese/name'],
      ['provinsi', '/administrative_area/province'], ['kota', '/administrative_area/city'], ['kabupaten/kota', '/administrative_area/city'],
      ['kecamatan', '/administrative_area/district'], ['kelurahan/desa', '/administrative_area/subdistrict'], ['kode pos', '/administrative_area/postal_code'], ['negara', '/administrative_area/country']
    ]);
    card.find('dt,tr,p,li').each((_, el) => {
      const item = $(el);
      let label, value;
      if (el.tagName === 'dt') { label = clean(item.text()); value = clean(item.next('dd').text()); }
      else if (el.tagName === 'tr') { label = clean(item.children('th,td').first().text()); value = clean(item.children('td').last().text()); }
      else {
        const match = clean(item.text())?.match(/^([^:]{1,30}):\s*(.+)$/);
        if (match) [, label, value] = match;
      }
      const pointer = labels.get(label?.replace(/:$/, '').trim().toLowerCase());
      if (pointer) {
        add(pointer, value, `${el.tagName} label:${label}`);
      }
    });
    card.find('.card-content > .card-meta .pill').each((i, el) => {
      const raw_text = clean($(el).text());
      if (!/\b(?:senin|selasa|rabu|kamis|jumat|sabtu|minggu|harian)\b/i.test(raw_text ?? '')) return;
      const day = raw_text.match(/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)\s+\d/i)?.[1].toLowerCase() ?? null;
      const times = [...raw_text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)];
      const time = times.length === 1 ? `${times[0][1].padStart(2, '0')}:${times[0][2]}` : null;
      add(`/mass_schedules/${i}`, { raw_text, day, time, time_zone: null, notes: null }, `.card-meta .pill:${i}`);
    });
    card.find('a[href]').each((i, el) => {
      const anchor = $(el), href = anchor.attr('href');
      let target;
      try { target = canonicalUrl(href, url); } catch { /* mailto/tel are handled separately */ }
      if (target && ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'].includes(new URL(target).hostname)) {
        add('/location/google_maps_url', target, `a:${i} @href`);
        const pair = mapCoordinates(target);
        if (pair) {
          add('/location/latitude', pair.latitude, `a:${i} @href destination latitude`);
          add('/location/longitude', pair.longitude, `a:${i} @href destination longitude`);
        } else issues.push('map_destination_coordinates_unavailable');
      }
      const line = clean(anchor.closest('p,li,dd,tr,address').text()) ?? '';
      const office = /sekretariat|kantor paroki|parish office|kantor gereja/i.test(line) && !/\b(?:romo|pastor|frater|suster|pribadi)\b/i.test(line);
      if (/^(?:tel:|mailto:)/i.test(href) && office) {
        const pointer = /^tel:/i.test(href) ? '/contact/phone' : '/contact/email';
        try { add(pointer, decodeURIComponent(href.replace(/^(?:tel:|mailto:)/i, '').split('?')[0]), `a:${i} institutional office @href`); }
        catch { issues.push('invalid_institutional_contact_encoding'); }
      }
      if (target && /website resmi|situs resmi/i.test(line) && !/\b(?:romo|pastor|pribadi)\b/i.test(line)) add('/contact/website', target, `a:${i} official website @href`);
    });
    if (/^(?:sekolah|seminari|biara|universitas|rumah sakit)\b/i.test(name)) issues.push('excluded_institution');
    observations.push({
      identity, context, fields, issues: [...new Set(issues)],
      source: { source_id: source.id, name: source.name, url, identity_url: identity, accessed_at: accessedAt, license: null, terms_sha256: termsSha256, content_sha256: hash(body), extractor_version: `listing-${LISTING_VERSION}` }
    });
  }
  if (!observations.length) throw new Error('Listing structure changed: no usable card identities; previous results preserved');
  return { card_count: cards.length, selected_cards: selected.length, observations, errors };
}

export function normalizeListingGroup(observations, id = randomUUID()) {
  const record = emptyRecord(id);
  record.administrative_area.country = null;
  record.location.google_maps_url = null;
  record.sources = [observations[0].source];
  const issues = observations.flatMap(o => o.issues.map(reason => ({ id, reason, locator: o.context.locator })));
  const values = new Map(), schedules = new Map();
  for (const observation of observations) for (const field of observation.fields) {
    let pointer = field.path;
    let value = normalizeField(pointer, field.value, mappings);
    if (pointer === '/administrative_area/country') value = /^(ID|Indonesia)$/i.test(field.value) ? 'ID' : /^(TL|Timor[- ]Leste)$/i.test(field.value) ? 'TL' : /^[A-Z]{2}$/.test(field.value) ? field.value : null;
    if (pointer.startsWith('/mass_schedules/')) {
      const fingerprint = JSON.stringify(value);
      if (!schedules.has(fingerprint)) { schedules.set(fingerprint, record.mass_schedules.length); record.mass_schedules.push(value); }
      pointer = `/mass_schedules/${schedules.get(fingerprint)}`;
    }
    (record.field_provenance[pointer] ??= []).push({ source_index: 0, value: field.value, locator: field.locator, observed_at: observation.source.accessed_at, method: value === field.value ? 'captured' : 'normalize:listing-1' });
    if (value === null) { issues.push({ id, field: pointer, reason: 'invalid_source_value' }); continue; }
    const entries = values.get(pointer) ?? [];
    if (!entries.some(entry => JSON.stringify(entry) === JSON.stringify(value))) entries.push(value);
    values.set(pointer, entries);
  }
  for (const [pointer, entries] of values) {
    if (pointer.startsWith('/mass_schedules/')) continue;
    if (entries.length === 1) setPointer(record, pointer, entries[0]);
    else { record.conflicts.push(pointer); issues.push({ id, field: pointer, reason: 'competing_source_values' }); }
  }
  if (record.location.latitude === null || record.location.longitude === null || record.conflicts.includes('/location/latitude') || record.conflicts.includes('/location/longitude')) {
    record.location.latitude = record.location.longitude = null;
  } else {
    record.location.coordinate_source = record.sources[0].url;
    record.field_provenance['/location/coordinate_source'] = [{ source_index: 0, value: record.sources[0].url, locator: observations[0].context.locator, observed_at: record.sources[0].accessed_at, method: 'coordinate_source_reference' }];
  }
  if (record.contact.phone) {
    // Do not assume an Indonesian numbering plan when country is unknown.
    const country = record.administrative_area.country;
    const phone = parsePhoneNumberFromString(record.contact.phone, country ?? undefined);
    if (phone?.isValid()) {
      record.contact.phone_e164 = phone.number;
      record.field_provenance['/contact/phone_e164'] = record.field_provenance['/contact/phone'].map(c => ({ ...c, method: 'libphonenumber-js:E.164' }));
    } else issues.push({ id, field: '/contact/phone', reason: 'phone_format_or_country_unconfirmed' });
  }
  for (const [pointer, reason] of [['/administrative_area/country', 'country_unconfirmed'], ['/type', 'type_unconfirmed'], ['/diocese/name', 'diocese_unconfirmed']]) if (getPointer(record, pointer) === null) issues.push({ id, field: pointer, reason });
  if (record.conflicts.length || issues.length) record.verification.status = 'needs_review';
  return { record, issues, contexts: observations.map(o => o.context) };
}

export function validateListing(records, source, grant, registry) {
  const errors = [], warnings = [], missing = [];
  const ids = new Set();
  for (const record of records) {
    if (!validateRecord(record)) { errors.push({ id: record.id, code: 'schema', details: structuredClone(validateRecord.errors) }); continue; }
    if (ids.has(record.id)) errors.push({ id: record.id, code: 'duplicate_id' });
    ids.add(record.id);
    for (const citation of record.sources) {
      try {
        const identity = allowedUrl(sourceIdentity(citation), source);
        if (citation.url !== grant.listing_url || citation.terms_sha256 !== grant.terms_sha256 || citation.license !== null || registry.identities[`${source.id}:${identity}`] !== record.id) throw new Error();
      } catch { errors.push({ id: record.id, code: 'source_or_identity_mismatch' }); }
    }
    const visit = (value, pointer = '') => {
      if (value === null) return;
      if (pointer === '/mass_schedules') { value.forEach((_, i) => check(`${pointer}/${i}`)); return; }
      if (typeof value !== 'object') { check(pointer); return; }
      for (const [key, child] of Object.entries(value)) visit(child, `${pointer}/${key}`);
    };
    const check = pointer => { if (!record.field_provenance[pointer]?.length) errors.push({ id: record.id, code: 'missing_field_provenance', field: pointer }); };
    for (const [key, value] of Object.entries(record)) if (!['id', 'sources', 'field_provenance', 'verification', 'conflicts'].includes(key)) visit(value, `/${key}`);
    for (const [pointer, claims] of Object.entries(record.field_provenance)) for (const claim of claims) {
      if (getPointer(record, pointer) === undefined || !record.sources[claim.source_index] || claim.observed_at > record.sources[claim.source_index].accessed_at) errors.push({ id: record.id, code: 'invalid_provenance', field: pointer });
    }
    const location = record.location;
    if ((location.latitude === null) !== (location.longitude === null) || (location.latitude === null) !== (location.coordinate_source === null)) errors.push({ id: record.id, code: 'coordinate_pair' });
    if (record.conflicts.length && record.verification.status !== 'needs_review') errors.push({ id: record.id, code: 'unflagged_conflict' });
    if (record.verification.status === 'source_verified') errors.push({ id: record.id, code: 'unreviewed_verification' });
    const absent = ['/address', '/contact/phone', '/contact/email', '/location/latitude', '/diocese/name', '/administrative_area/province', '/administrative_area/country', '/type'].filter(p => getPointer(record, p) === null);
    if (absent.length) { missing.push({ id: record.id, fields: absent }); warnings.push({ id: record.id, code: 'missing_fields', fields: absent }); }
  }
  return { status: errors.length ? 'failed' : 'passed', publication_allowed: false, errors, warnings, missing, duplicates: duplicateCandidates(records.filter(r => typeof r.name === 'string')) };
}

export function listingStatistics(records, validation) {
  const components = ['/name', '/type', '/diocese/name', '/address', '/administrative_area/province', '/administrative_area/city', '/contact/phone', '/contact/email'];
  const filled = records.reduce((total, r) => total + components.filter(p => getPointer(r, p) !== null).length + Number(r.location.latitude !== null && r.location.longitude !== null), 0);
  return {
    total_records: records.length,
    by_country: { ID: records.filter(r => r.administrative_area.country === 'ID').length, TL: records.filter(r => r.administrative_area.country === 'TL').length, unknown: records.filter(r => r.administrative_area.country === null).length, other: records.filter(r => r.administrative_area.country !== null && !['ID', 'TL'].includes(r.administrative_area.country)).length },
    by_type: Object.fromEntries(['katedral', 'paroki', 'stasi', 'kapel', 'unknown'].map(type => [type, records.filter(r => r.type === (type === 'unknown' ? null : type)).length])),
    with_address: records.filter(r => r.address !== null).length,
    with_phone: records.filter(r => r.contact.phone !== null).length,
    with_email: records.filter(r => r.contact.email !== null).length,
    with_coordinates: records.filter(r => r.location.latitude !== null && r.location.longitude !== null).length,
    source_verified: records.filter(r => r.verification.status === 'source_verified').length,
    needs_review: records.filter(r => r.verification.status === 'needs_review').length,
    duplicate_pairs_flagged: validation.duplicates.length,
    duplicate_records_flagged: new Set(validation.duplicates.flatMap(d => d.ids)).size,
    completeness: { percentage: records.length ? Math.round(10000 * filled / (records.length * 9)) / 100 : null, filled_components: filled, total_components: records.length * 9, components: [...components, 'complete_coordinate_pair'] }
  };
}

export const sortListing = records => records.sort((a, b) => compareRecords({ ...a, name: a.name ?? '' }, { ...b, name: b.name ?? '' }));
