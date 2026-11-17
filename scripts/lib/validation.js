import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { readJson, rootFile } from './io.js';
import { assertRecordRights, sourceIdentity } from './policy.js';
import { duplicateCandidates, getPointer } from './records.js';

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const churchSchema = await readJson(rootFile('schema', 'church.schema.json'));
ajv.addSchema(churchSchema);
const validateChurch = ajv.getSchema(churchSchema.$id);
const validateParish = ajv.compile(await readJson(rootFile('schema', 'parish.schema.json')));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function populatedPaths(value, prefix = '') {
  if (value === null || value === undefined) return [];
  if (prefix === '/mass_schedules') return value.map((_, index) => `${prefix}/${index}`);
  if (typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, child]) => populatedPaths(child, `${prefix}/${key}`));
}

export async function validateDataset(records, parishes, registry, config) {
  const errors = [], warnings = [], missing = [];
  const add = (id, code, message) => errors.push({ id, code, message });
  if (!Array.isArray(records) || !Array.isArray(parishes)) return { status: 'failed', errors: [{ id: null, code: 'not_array', message: 'Master and parish register must be arrays' }], warnings, missing, duplicates: [] };
  const ids = new Set();
  const parishIds = new Set(parishes.map(p => p.id));
  const licenses = new Set();
  for (const [collection, validator] of [[records, validateChurch], [parishes, validateParish]]) for (const record of collection) {
    if (!validator(record)) {
      for (const issue of validator.errors) add(record.id ?? null, 'schema', `${issue.instancePath}: ${issue.message}`);
      continue;
    }
    if (ids.has(record.id)) add(record.id, 'duplicate_id', 'Site and parish IDs must be globally unique');
    ids.add(record.id);
    try { assertRecordRights(record, config); }
    catch (error) { add(record.id, 'source_rights', error.message); }
    for (const source of record.sources) {
      licenses.add(source.license);
      if (/odbl/i.test(source.license)) add(record.id, 'separate_osm_dataset', 'ODbL data belongs in a separately reviewed dataset');
      try {
        if (registry.identities?.[`${source.source_id}:${sourceIdentity(source)}`] !== record.id) add(record.id, 'identity_mapping', 'Each source identity must map to the stable record ID');
      } catch { add(record.id, 'invalid_source_url', 'Source URLs must be public HTTP(S) URLs without credentials'); }
    }
    const excluded = new Set(['id', 'sources', 'field_provenance', 'conflicts', 'verification']);
    const factual = Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.has(key)));
    for (const pointer of populatedPaths(factual)) {
      if (!record.field_provenance[pointer]?.length) add(record.id, 'missing_field_provenance', pointer);
    }
    for (const [pointer, claims] of Object.entries(record.field_provenance)) {
      if (getPointer(record, pointer) === undefined) add(record.id, 'unknown_provenance_field', pointer);
      for (const claim of claims) {
        if (!record.sources[claim.source_index]) add(record.id, 'invalid_source_reference', pointer);
        else if (claim.observed_at > record.sources[claim.source_index].accessed_at) add(record.id, 'invalid_observation_date', pointer);
      }
    }
    if (!record.administrative_area) continue;
    const absent = ['/administrative_area/province', '/diocese/name', '/address', '/contact/phone', '/contact/email', '/location/latitude'].filter(pointer => getPointer(record, pointer) === null);
    if (absent.length) missing.push({ id: record.id, fields: absent });
    for (const pointer of ['/administrative_area/province', '/diocese/name']) if (getPointer(record, pointer) === null) warnings.push({ id: record.id, code: 'missing_field', field: pointer });
    if (record.parent_parish_id && !parishIds.has(record.parent_parish_id)) add(record.id, 'unknown_parent_parish', 'Confirmed parent must exist in the separate parish register');
    const { latitude: lat, longitude: lon, coordinate_source: coordinateSource } = record.location;
    if ((lat === null) !== (lon === null) || (lat === null) !== (coordinateSource === null)) add(record.id, 'coordinate_pair', 'Latitude, longitude and source must be populated together');
    if (lat !== null) {
      const latSources = record.field_provenance['/location/latitude']?.map(c => c.source_index) ?? [];
      const lonSources = record.field_provenance['/location/longitude']?.map(c => c.source_index) ?? [];
      if (!latSources.some(index => lonSources.includes(index) && record.sources[index]?.url === coordinateSource)) add(record.id, 'coordinate_provenance', 'A complete coordinate pair must come from a common source');
    }
    if (record.contact.phone) {
      const phone = parsePhoneNumberFromString(record.contact.phone, 'ID');
      if (!phone?.isValid()) warnings.push({ id: record.id, code: 'invalid_phone', field: '/contact/phone' });
      if (record.contact.phone_e164 !== null && (!phone?.isValid() || phone.number !== record.contact.phone_e164)) add(record.id, 'phone_normalization', 'Normalized phone does not match display value');
    } else if (record.contact.phone_e164 !== null) add(record.id, 'phone_without_display', 'Normalized phone requires original display value');
    for (const pointer of record.conflicts) {
      const values = record.field_provenance[pointer]?.map(c => JSON.stringify(c.value)) ?? [];
      if (new Set(values).size < 2) add(record.id, 'missing_conflict_evidence', pointer);
    }
    if (record.conflicts.length && record.verification.status !== 'needs_review') add(record.id, 'conflict_status', 'Unresolved conflicts require needs_review');
    const verification = record.verification;
    if (verification.status === 'source_verified') {
      if (!verification.verified_at || !verification.reviewed_by || !verification.evidence.length) add(record.id, 'verification_evidence', 'Human reviewer, date and institutional evidence are required');
    } else if (verification.verified_at || verification.reviewed_by || verification.evidence.length) add(record.id, 'verification_status', 'Unverified records cannot carry a verification claim');
  }
  if (licenses.size > 1) add(null, 'license_composition', 'Multiple data licenses require explicit compatibility review and separate release design');
  for (const [from, to] of Object.entries(registry.redirects ?? {})) {
    if (!uuid.test(from) || !ids.has(to) || ids.has(from) || registry.redirects[to]) add(from, 'invalid_redirect', 'Redirects must point directly from retired IDs to existing identities');
  }
  for (const [identity, id] of Object.entries(registry.identities ?? {})) if (!uuid.test(id) || registry.redirects[id]) add(id, 'invalid_registry_identity', identity);
  const duplicates = duplicateCandidates(records.filter(record => validateChurch(record)));
  return { status: errors.length ? 'failed' : 'passed', errors, warnings, missing, duplicates };
}

export function statistics(records, duplicates = [], removed = []) {
  return {
    total_records: records.length,
    by_type: Object.fromEntries(['katedral', 'paroki', 'stasi', 'kapel'].map(type => [type, records.filter(r => r.type === type).length])),
    with_address: records.filter(r => r.address !== null).length,
    with_phone: records.filter(r => r.contact.phone !== null).length,
    with_email: records.filter(r => r.contact.email !== null).length,
    with_coordinates: records.filter(r => r.location.latitude !== null && r.location.longitude !== null).length,
    source_verified: records.filter(r => r.verification.status === 'source_verified').length,
    duplicate_records_removed: removed.length,
    duplicate_records_flagged: new Set(duplicates.flatMap(d => d.ids)).size,
    duplicate_pairs_flagged: duplicates.length
  };
}
