import { randomUUID } from 'node:crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { canonicalUrl, compareRecords } from './io.js';

export const TYPES = ['katedral', 'paroki', 'stasi', 'kapel'];
const clean = value => typeof value === 'string' && value.trim() && !['-', 'n/a', 'null'].includes(value.trim().toLowerCase()) ? value.trim() : null;
export function getPointer(record, pointer) {
  return pointer.slice(1).split('/').reduce((v, key) => v?.[key], record);
}
export function setPointer(record, pointer, value) {
  const keys = pointer.slice(1).split('/');
  if (!pointer.startsWith('/') || keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) throw new Error('Invalid field pointer');
  const last = keys.pop();
  let target = record;
  for (const key of keys) target = target[key];
  target[last] = value;
}
export function emptyRecord(id) {
  return {
    id, name: null, type: null, diocese: { name: null },
    administrative_area: { country: 'ID', province: null, city: null, district: null, subdistrict: null, postal_code: null },
    address: null, contact: { phone: null, phone_e164: null, email: null, website: null },
    location: { latitude: null, longitude: null, coordinate_source: null }, parent_parish_id: null,
    mass_schedules: [], sources: [], field_provenance: {}, conflicts: [],
    verification: { status: 'unverified', verified_at: null, reviewed_by: null, evidence: [] }
  };
}

function normalizeField(path, value, mappings) {
  if (path.startsWith('/mass_schedules/')) return value;
  if (path === '/location/latitude' || path === '/location/longitude') {
    if (value === '' || value === null || value === undefined || typeof value === 'boolean') return null;
    const number = Number(value);
    const max = path.endsWith('latitude') ? 90 : 180;
    return Number.isFinite(number) && Math.abs(number) <= max ? number : null;
  }
  let result = clean(value);
  if (!result) return null;
  if (path === '/type') return TYPES.includes(result.toLowerCase()) ? result.toLowerCase() : null;
  if (path === '/administrative_area/country') return /^(ID|Indonesia)$/i.test(result) ? 'ID' : result;
  const mapping = path === '/diocese/name' ? mappings.diocese_aliases : path.endsWith('/province') ? mappings.province_aliases : path.endsWith('/city') ? mappings.city_aliases : null;
  if (mapping?.[result]) result = mapping[result].name;
  if (path === '/contact/website') {
    try { return canonicalUrl(result); } catch { return null; }
  }
  if (path === '/contact/email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) return null;
  if (path.endsWith('/postal_code') && !/^\d{5}$/.test(result)) return null;
  return result;
}

export function normalizeObservations(observations, registry, existing, mappings, curation) {
  for (const table of [mappings.province_aliases, mappings.city_aliases, mappings.diocese_aliases]) {
    for (const entry of Object.values(table ?? {})) {
      if (!entry.name || !entry.source_url || !entry.reviewed_by || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewed_at ?? '')) throw new Error('Normalization aliases require cited reference, reviewer and date');
      canonicalUrl(entry.source_url);
    }
  }
  // A partial refresh must never silently remove an existing site.
  const records = new Map(existing.map(record => [record.id, structuredClone(record)]));
  const touched = new Set();
  const review = [];
  const old = new Map(existing.map(record => [record.id, record]));
  const seen = new Set();
  let duplicateObservations = 0;
  const preserveHistorical = (record, pointer) => {
    const previous = old.get(record.id);
    if (!previous) return;
    const claims = record.field_provenance[pointer] ??= [];
    for (const claim of previous.field_provenance[pointer] ?? []) {
      const citation = previous.sources[claim.source_index];
      let index = record.sources.findIndex(s => JSON.stringify(s) === JSON.stringify(citation));
      if (index === -1) { index = record.sources.length; record.sources.push(citation); }
      const historical = { ...claim, source_index: index };
      if (!claims.some(c => JSON.stringify(c) === JSON.stringify(historical))) claims.push(historical);
    }
  };
  for (const observation of observations) {
    const fingerprint = `${observation.source.source_id}:${observation.identity}:${observation.source.content_sha256}`;
    if (seen.has(fingerprint)) { duplicateObservations++; continue; }
    seen.add(fingerprint);
    const key = `${observation.source.source_id}:${observation.identity}`;
    const id = registry.identities[key] ??= randomUUID();
    if (registry.redirects[id]) { review.push({ id, reason: 'retired_identity_requires_merge_resolution' }); continue; }
    const record = touched.has(id) ? records.get(id) : emptyRecord(id);
    touched.add(id);
    records.set(id, record);
    const sourceIndex = record.sources.length;
    record.sources.push(observation.source);
    if (!observation.eligible_site) review.push({ id, reason: 'unconfirmed_worship_site' });
    for (const issue of observation.issues) review.push({ id, reason: issue });
    for (const field of observation.fields) {
      const value = normalizeField(field.path, field.value, mappings);
      const actualPath = field.path.startsWith('/mass_schedules/') ? `/mass_schedules/${record.mass_schedules.length}` : field.path;
      const claims = record.field_provenance[actualPath] ??= [];
      claims.push({ source_index: sourceIndex, value: field.value, locator: field.locator, observed_at: observation.source.accessed_at, method: value === field.value ? 'captured' : `normalize:${mappings.version}` });
      if (value === null) { review.push({ id, field: field.path, reason: 'invalid_source_value' }); continue; }
      const aliases = field.path === '/administrative_area/province' ? mappings.province_aliases : field.path === '/administrative_area/city' ? mappings.city_aliases : field.path === '/diocese/name' ? mappings.diocese_aliases : null;
      if (aliases && !aliases[field.value] && !Object.values(aliases).some(a => a.name === value)) review.push({ id, field: field.path, reason: 'administrative_or_diocese_name_requires_review' });
      if (field.path.startsWith('/mass_schedules/')) {
        record.mass_schedules.push(value);
        continue;
      }
      const previous = field.path === '/administrative_area/country' && claims.length === 1 ? null : getPointer(record, field.path);
      if (previous !== null && previous !== value) {
        record.conflicts.push(field.path);
        setPointer(record, field.path, getPointer(old.get(id), field.path) ?? null);
        preserveHistorical(record, field.path);
      } else if (!record.conflicts.includes(field.path)) setPointer(record, field.path, value);
    }
    // Country must be explicitly supplied by a source, never inferred from the domain.
    if (!record.field_provenance['/administrative_area/country']) review.push({ id, reason: 'country_unconfirmed' });
  }
  for (const record of records.values()) {
    const previousRecord = old.get(record.id);
    if (previousRecord && touched.has(record.id)) {
      for (const pointer of Object.keys(previousRecord.field_provenance)) {
        if (pointer.startsWith('/location/') || pointer.startsWith('/mass_schedules/')) continue;
        const previousValue = getPointer(previousRecord, pointer);
        if (previousValue != null && getPointer(record, pointer) === null && !record.conflicts.includes(pointer)) {
          setPointer(record, pointer, previousValue);
          preserveHistorical(record, pointer);
          review.push({ id: record.id, field: pointer, reason: 'previous_value_retained_pending_refresh_review' });
        }
      }
    }
    for (const decision of curation.decisions.filter(item => item.record_id === record.id)) {
      if (!decision.reviewed_by || !decision.reviewed_at || !decision.reason) throw new Error('Curation decisions require reviewer, date and reason');
      const claims = record.field_provenance[decision.path];
      if (!claims?.some(claim => claim.source_index === decision.source_index && JSON.stringify(claim.value) === JSON.stringify(decision.value))) throw new Error('Curation must select an existing sourced claim');
      const selected = normalizeField(decision.path, decision.value, mappings);
      if (selected === null) throw new Error('Curation selected an invalid value');
      setPointer(record, decision.path, selected);
      record.conflicts = record.conflicts.filter(path => path !== decision.path);
    }
    if (record.contact.phone) {
      const phone = parsePhoneNumberFromString(record.contact.phone, 'ID');
      if (phone?.isValid()) {
        record.contact.phone_e164 = phone.number;
        record.field_provenance['/contact/phone_e164'] = record.field_provenance['/contact/phone'].map(claim => ({ ...claim, method: 'libphonenumber-js:ID' }));
      } else review.push({ id: record.id, field: '/contact/phone', reason: 'invalid_phone' });
    }
    const latClaims = record.field_provenance['/location/latitude'] ?? [];
    const lonClaims = record.field_provenance['/location/longitude'] ?? [];
    const commonCoordinateSource = latClaims.find(a => lonClaims.some(b => a.source_index === b.source_index));
    if (record.location.latitude === null || record.location.longitude === null || !commonCoordinateSource || record.conflicts.some(p => p.startsWith('/location/'))) {
      if (record.location.latitude !== null || record.location.longitude !== null) review.push({ id: record.id, reason: 'incomplete_or_conflicting_coordinate_pair' });
      if (previousRecord?.location.latitude != null && previousRecord?.location.longitude != null) {
        record.location = structuredClone(previousRecord.location);
        for (const pointer of ['/location/latitude', '/location/longitude', '/location/coordinate_source']) preserveHistorical(record, pointer);
        review.push({ id: record.id, reason: 'previous_coordinates_retained_pending_refresh_review' });
      } else record.location = { latitude: null, longitude: null, coordinate_source: null };
    } else {
      record.location.coordinate_source = record.sources[commonCoordinateSource.source_index].url;
      record.field_provenance['/location/coordinate_source'] = record.field_provenance['/location/latitude'].map(claim => ({ ...claim, method: 'coordinate_source_reference' }));
    }
    record.conflicts = [...new Set(record.conflicts)].sort();
    if (old.has(record.id) && JSON.stringify({ ...old.get(record.id), verification: null }) === JSON.stringify({ ...record, verification: null })) record.verification = old.get(record.id).verification;
    if (record.conflicts.length || review.some(item => item.id === record.id)) record.verification = { status: 'needs_review', verified_at: null, reviewed_by: null, evidence: [] };
  }
  const candidates = [...records.values()].sort(compareRecordsSafe);
  const publishable = candidates.filter(record => record.name && record.type && record.administrative_area.country === 'ID' && record.field_provenance['/administrative_area/country'] && !review.some(item => item.id === record.id && ['unconfirmed_worship_site', 'country_unconfirmed'].includes(item.reason)));
  // Preserve the last canonical record while a refresh has become ambiguous.
  for (const previous of existing) {
    if (registry.redirects[previous.id] || publishable.some(record => record.id === previous.id)) continue;
    const retained = structuredClone(previous);
    retained.verification = { status: 'needs_review', verified_at: null, reviewed_by: null, evidence: [] };
    publishable.push(retained);
    review.push({ id: previous.id, reason: 'previous_record_retained_pending_refresh_review' });
  }
  publishable.sort(compareRecords);
  return { records: publishable, candidates, review, registry, duplicate_observations_removed: duplicateObservations };
}
function compareRecordsSafe(a, b) { return compareRecords({ ...a, name: a.name ?? '' }, { ...b, name: b.name ?? '' }); }

function normalizedName(name) { return name.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
export function similarity(a, b) {
  const left = [...normalizedName(a)], right = [...normalizedName(b)];
  if (!left.length || !right.length) return 0;
  let row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 0; i < left.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < right.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (left[i] === right[j] ? 0 : 1)));
    row = next;
  }
  return 1 - row[right.length] / Math.max(left.length, right.length);
}
export function duplicateCandidates(records) {
  const issues = [];
  for (let i = 0; i < records.length; i++) for (let j = i + 1; j < records.length; j++) {
    const a = records[i], b = records[j], reasons = [];
    if (normalizedName(a.name) === normalizedName(b.name)) reasons.push('same_name');
    else if ((a.administrative_area.city && a.administrative_area.city === b.administrative_area.city) || (a.diocese.name && a.diocese.name === b.diocese.name)) {
      if (similarity(a.name, b.name) >= 0.90) reasons.push('similar_name');
    }
    if (a.sources.some(x => b.sources.some(y => canonicalUrl(x.url) === canonicalUrl(y.url)))) reasons.push('same_canonical_url');
    if (a.location.latitude !== null && a.location.longitude !== null && a.location.latitude === b.location.latitude && a.location.longitude === b.location.longitude) reasons.push('same_coordinates');
    if (reasons.length) issues.push({ ids: [a.id, b.id], reasons, resolution: 'pending' });
  }
  return issues;
}

export function mergeRecords(records, registry, decisions) {
  const map = new Map(records.map(record => [record.id, structuredClone(record)]));
  const removed = [];
  for (const decision of decisions) {
    const { from_id: from, into_id: into } = decision;
    if (!decision.reviewed_by || !decision.reviewed_at || !decision.reason || from === into) throw new Error('Merge requires distinct IDs, reviewer, date and reason');
    if (registry.redirects[from] === into && !map.has(from)) continue;
    const source = map.get(from), target = map.get(into);
    if (!source || !target || registry.redirects[into]) throw new Error('Merge references missing or retired identity');
    if (source.parent_parish_id && target.parent_parish_id && source.parent_parish_id !== target.parent_parish_id) throw new Error('Resolve parent parish conflict before merging');
    const offset = target.sources.length;
    target.sources.push(...source.sources);
    for (const [pointer, claims] of Object.entries(source.field_provenance)) {
      // Schedules are distinct assertions and retain their own provenance positions.
      let path = pointer;
      if (/^\/mass_schedules\/\d+$/.test(pointer)) {
        path = `/mass_schedules/${target.mass_schedules.length}`;
        target.mass_schedules.push(getPointer(source, pointer));
      }
      (target.field_provenance[path] ??= []).push(...claims.map(claim => ({ ...claim, source_index: claim.source_index + offset })));
      if (!path.startsWith('/mass_schedules/')) {
        const a = getPointer(target, path), b = getPointer(source, pointer);
        if (a == null && b != null) setPointer(target, path, b);
        else if (b != null && a !== b) target.conflicts.push(path);
      }
    }
    target.conflicts = [...new Set([...target.conflicts, ...source.conflicts])].sort();
    target.verification = { status: 'needs_review', verified_at: null, reviewed_by: null, evidence: [] };
    for (const [key, id] of Object.entries(registry.identities)) if (id === from) registry.identities[key] = into;
    for (const [id, redirect] of Object.entries(registry.redirects)) if (redirect === from) registry.redirects[id] = into;
    registry.redirects[from] = into;
    map.delete(from);
    removed.push(from);
  }
  return { records: [...map.values()].sort(compareRecords), registry, removed };
}
