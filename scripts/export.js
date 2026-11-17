import { readJson, rootFile, cacheFile, ROOT, hash, json, run } from './lib/io.js';
import { options } from './lib/workflow.js';
import { validateDataset } from './lib/validation.js';
import { buildArtifacts, checkArtifacts, commitArtifacts, recoverExport } from './lib/exporting.js';

await run(async () => {
  const args = options();
  if (!args.check) await recoverExport(ROOT);
  else if (await readJson(cacheFile('export-transaction.json'), null)) throw new Error('Interrupted export: run npm run export to restore it before checking');
  let records = await readJson(rootFile('data', 'churches.json'));
  let registry = await readJson(rootFile('data', 'id-registry.json'));
  const parishes = await readJson(rootFile('data', 'parishes.json'));
  const config = await readJson(rootFile('config', 'sources.json'));
  const oldManifest = await readJson(rootFile('data', 'manifest.json'), null);
  const summary = await readJson(rootFile('reports', 'extraction-summary.json'), { status: 'not_run', extracted_observations: null });
  const fieldReview = await readJson(rootFile('reports', 'field-review.json'), { items: [] });
  const duplicates = await readJson(rootFile('reports', 'duplicate-review.json'), { removed_ids: [] });
  let review = fieldReview.items, removed = duplicates.removed_ids;
  let extraction = { status: summary.status, observations: summary.extracted_observations, duplicate_observations_removed: summary.duplicate_observations_removed ?? 0 };
  if (!args.check) {
    const staged = await readJson(cacheFile('duplicate-result.json'), null);
    if (staged) {
      if (staged.base_master_sha256 !== hash(json(records)) && json(staged.records) !== json(records)) throw new Error('Staging is stale relative to master; normalize and deduplicate again');
      records = staged.records; registry = staged.registry; review = staged.review; removed = staged.removed;
      extraction = { status: 'completed', observations: staged.observation_count, duplicate_observations_removed: staged.duplicate_observations_removed ?? 0 };
    }
  }
  const validation = await validateDataset(records, parishes, registry, config);
  if (validation.errors.length) throw new Error(`Export blocked by ${validation.errors.length} validation errors; run npm run validate or inspect staging`);
  const generatedAt = args.check ? oldManifest?.generated_at : process.env.SOURCE_DATE_EPOCH ? new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString() : new Date().toISOString();
  if (!generatedAt) throw new Error('Missing manifest generation timestamp');
  const artifacts = buildArtifacts({ records, parishes, registry, config, validation, generatedAt, extraction, review, removed });
  if (args.check) {
    const differences = await checkArtifacts(ROOT, artifacts);
    if (differences.length) throw new Error(`Generated artifacts differ: ${differences.join(', ')}`);
    console.log('All exports and reports match the canonical dataset.');
  } else {
    await commitArtifacts(ROOT, artifacts);
    console.log(JSON.stringify({ status: 'exported', production_records: records.length, extraction_status: extraction.status }));
  }
});
