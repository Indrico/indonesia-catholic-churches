import { readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { json, hash, slug, compareRecords, atomicWrite, readJson, writeJson } from './io.js';
import { statistics } from './validation.js';

export function buildArtifacts({ records, parishes, registry, config, validation, generatedAt, extraction, review = [], removed = [] }) {
  const sorted = [...records].sort(compareRecords);
  const artifacts = new Map();
  const addJson = (file, value) => artifacts.set(file, json(value));
  addJson('data/churches.json', sorted);
  addJson('data/parishes.json', [...parishes].sort(compareRecords));
  addJson('data/id-registry.json', registry);
  const groups = {};
  for (const [folder, getter] of [['provinces', r => r.administrative_area.province], ['dioceses', r => r.diocese.name]]) {
    const names = new Map();
    const grouped = new Map();
    for (const record of sorted) {
      const name = getter(record), key = slug(name);
      if (names.has(key) && names.get(key) !== name) throw new Error(`Grouping filename collision: ${key}`);
      names.set(key, name);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(record);
    }
    groups[folder] = [...grouped].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, rows]) => {
      const file = `data/${folder}/${key}.json`;
      addJson(file, rows);
      return { name: names.get(key), file, count: rows.length };
    });
  }
  const columns = ['id', 'name', 'type', 'country', 'province', 'city', 'district', 'subdistrict', 'postal_code', 'diocese', 'address', 'phone', 'phone_e164', 'email', 'website', 'latitude', 'longitude', 'coordinate_source', 'parent_parish_id', 'verification_status', 'mass_schedules_json', 'sources_json', 'field_provenance_json', 'conflicts_json'];
  const rows = sorted.map(r => ({ id: r.id, name: r.name, type: r.type, ...r.administrative_area, diocese: r.diocese.name, address: r.address, ...r.contact, ...r.location, parent_parish_id: r.parent_parish_id, verification_status: r.verification.status, mass_schedules_json: JSON.stringify(r.mass_schedules), sources_json: JSON.stringify(r.sources), field_provenance_json: JSON.stringify(r.field_provenance), conflicts_json: JSON.stringify(r.conflicts) }));
  artifacts.set('data/churches.csv', stringify(rows, { header: true, columns, record_delimiter: '\n', escape_formulas: true }));
  const stats = statistics(sorted, validation.duplicates, removed);
  const releaseStatus = extraction.status === 'not_run' && !sorted.length && !parishes.length ? 'tooling_only' : 'partial';
  addJson('reports/validation.json', validation);
  addJson('reports/duplicate-review.json', { status: releaseStatus === 'tooling_only' ? 'not_run' : validation.duplicates.length ? 'needs_review' : 'clear', removed_ids: removed, pairs: validation.duplicates });
  addJson('reports/missing-fields.json', { status: releaseStatus === 'tooling_only' ? 'not_run' : validation.missing.length ? 'needs_review' : 'clear', records: validation.missing });
  addJson('reports/field-review.json', { status: releaseStatus === 'tooling_only' ? 'not_run' : review.length || sorted.some(r => r.conflicts.length) ? 'needs_review' : 'clear', items: review, conflicts: sorted.filter(r => r.conflicts.length).map(r => ({ id: r.id, fields: r.conflicts })) });
  addJson('reports/extraction-summary.json', { status: extraction.status, extracted_observations: extraction.observations, duplicate_observations_removed: extraction.duplicate_observations_removed ?? 0, ...stats, note: releaseStatus === 'tooling_only' ? 'No production extraction has run. Empty exports are not a national coverage claim.' : 'Counts describe this partial release, not all Catholic churches in Indonesia.' });
  const sources = config.sources.filter(source => sorted.some(r => r.sources.some(s => s.source_id === source.id)) || parishes.some(r => r.sources.some(s => s.source_id === source.id))).map(source => ({ source_id: source.id, name: source.name, license: source.permission.license, attribution: source.permission.attribution, permission_evidence: source.permission.evidence, reviewed_at: source.permission.reviewed_at }));
  const checksums = Object.fromEntries([...artifacts].filter(([file]) => file.startsWith('data/')).map(([file, content]) => [file, hash(content)]));
  addJson('data/manifest.json', { schema_version: '1.0.0', generated_at: generatedAt, release_status: releaseStatus, coverage_complete: false, extraction_status: extraction.status, total_records: sorted.length, parish_organizations: parishes.length, statistics: stats, sources, groups, files_sha256: checksums, csv: { encoding: 'UTF-8', null_representation: 'empty cell', nested_fields: 'JSON strings', formula_escaping: 'leading apostrophe for formula-like strings' } });
  return artifacts;
}

async function generatedFiles(root) {
  const files = [];
  for (const folder of ['data/provinces', 'data/dioceses']) {
    let entries;
    try { entries = await readdir(path.join(root, folder)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    files.push(...entries.filter(name => name.endsWith('.json')).map(name => `${folder}/${name}`));
  }
  return files;
}

export async function checkArtifacts(root, artifacts) {
  const differences = [];
  for (const [file, content] of artifacts) {
    let actual;
    try { actual = await readFile(path.join(root, file), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (actual !== content) differences.push(file);
  }
  for (const file of await generatedFiles(root)) if (!artifacts.has(file)) differences.push(file);
  return differences;
}

export async function commitArtifacts(root, artifacts, { writer = atomicWrite } = {}) {
  // All content is built and validated first. Journal enables rollback after interruption.
  const journalFile = path.join(root, '.cache', 'export-transaction.json');
  await recoverExport(root);
  const files = [...new Set([...artifacts.keys(), ...await generatedFiles(root)])];
  const previous = {};
  for (const file of files) {
    try { previous[file] = await readFile(path.join(root, file), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; previous[file] = null; }
  }
  await writeJson(journalFile, previous);
  try {
    for (const file of files) {
      if (artifacts.has(file)) await writer(path.join(root, file), artifacts.get(file));
      else await rm(path.join(root, file), { force: true });
    }
    await rm(journalFile);
  } catch (error) { await recoverExport(root); throw error; }
}

export async function recoverExport(root) {
  const journalFile = path.join(root, '.cache', 'export-transaction.json');
  const previous = await readJson(journalFile, null);
  if (!previous) return;
  for (const [file, content] of Object.entries(previous)) {
    if (!/^(?:data\/(?:churches\.(?:json|csv)|parishes\.json|id-registry\.json|manifest\.json|(?:provinces|dioceses)\/[a-z0-9_-]+\.json)|reports\/[a-z-]+\.json)$/.test(file)) throw new Error('Invalid export journal path');
    if (content === null) await rm(path.join(root, file), { force: true });
    else await atomicWrite(path.join(root, file), content);
  }
  await rm(journalFile);
}
