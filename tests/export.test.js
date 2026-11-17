import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { buildArtifacts, commitArtifacts, checkArtifacts, recoverExport } from '../scripts/lib/exporting.js';
import { validateDataset } from '../scripts/lib/validation.js';
import { atomicWrite, writeJson } from '../scripts/lib/io.js';
import { record, registry, config } from './fixtures.js';

async function cleanup(directory) {
  const target = path.resolve(directory);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(target, { recursive: true, force: true });
}

async function artifacts(records = []) {
  const ids = registry(records), cfg = config();
  return buildArtifacts({ records, parishes: [], registry: ids, config: cfg, validation: await validateDataset(records, [], ids, cfg), generatedAt: '2026-11-17T00:00:00.000Z', extraction: { status: records.length ? 'completed' : 'not_run', observations: records.length || null } });
}
test('empty release explicitly distinguishes not-run extraction from zero published records', async () => {
  const output = await artifacts();
  const manifest = JSON.parse(output.get('data/manifest.json'));
  assert.equal(manifest.release_status, 'tooling_only');
  assert.equal(manifest.coverage_complete, false);
  assert.equal(JSON.parse(output.get('reports/extraction-summary.json')).extracted_observations, null);
});
test('exports are deterministic, partitions reconcile, and CSV preserves Unicode and quotes', async () => {
  const r = record(); r.name = 'Gereja Contoh, "Damai" — É'; r.address = 'Jalan Contoh\nBlok A';
  const output = await artifacts([r]);
  assert.deepEqual([...output], [...await artifacts([r])]);
  const manifest = JSON.parse(output.get('data/manifest.json'));
  for (const category of ['provinces', 'dioceses']) {
    const rows = manifest.groups[category].flatMap(group => JSON.parse(output.get(group.file)));
    assert.deepEqual(rows, JSON.parse(output.get('data/churches.json')));
  }
  assert.ok(output.get('data/churches.csv').includes('"Gereja Contoh, ""Damai"" — É"'));
  const csvRows = parse(output.get('data/churches.csv'), { columns: true });
  assert.equal(csvRows[0].name, r.name);
  assert.equal(csvRows[0].address, r.address);
  assert.deepEqual(JSON.parse(csvRows[0].sources_json), r.sources);
});
test('unknown areas get explicit groups and slug collisions abort export', async () => {
  const a = record(), b = record(1); a.administrative_area.province = null;
  assert.ok((await artifacts([a])).has('data/provinces/_unassigned.json'));
  a.administrative_area.province = 'A B'; b.administrative_area.province = 'A-B';
  await assert.rejects(artifacts([a, b]), /collision/);
});
test('transaction failure restores prior artifacts and removes new files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'church-export-test-'));
  try {
    await atomicWrite(path.join(directory, 'data/churches.json'), 'old\n');
    let writes = 0;
    await assert.rejects(commitArtifacts(directory, await artifacts([record()]), { writer: async (file, content) => { if (++writes === 3) throw new Error('injected failure'); await atomicWrite(file, content); } }), /injected/);
    assert.equal(await readFile(path.join(directory, 'data/churches.json'), 'utf8'), 'old\n');
    await assert.rejects(readFile(path.join(directory, 'data/parishes.json')));
    await commitArtifacts(directory, await artifacts());
    assert.deepEqual(await checkArtifacts(directory, await artifacts()), []);
  } finally { await cleanup(directory); }
});
test('durable journal recovers an interrupted export', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'church-journal-test-'));
  try {
    await atomicWrite(path.join(directory, 'data/churches.json'), 'interrupted\n');
    await writeJson(path.join(directory, '.cache/export-transaction.json'), { 'data/churches.json': 'previous\n' });
    await recoverExport(directory);
    assert.equal(await readFile(path.join(directory, 'data/churches.json'), 'utf8'), 'previous\n');
  } finally { await cleanup(directory); }
});
