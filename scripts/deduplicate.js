import { readJson, writeJson, rootFile, cacheFile, run } from './lib/io.js';
import { mergeRecords, duplicateCandidates } from './lib/records.js';
import { validateDataset } from './lib/validation.js';
import { assertRecordRights } from './lib/policy.js';

await run(async () => {
  const staged = await readJson(cacheFile('normalized.json'));
  const config = await readJson(rootFile('config', 'sources.json'));
  const curation = await readJson(rootFile('config', 'curation.json'));
  const result = mergeRecords(staged.records, staged.registry, curation.merges);
  for (const record of result.records) assertRecordRights(record, config);
  const parishes = await readJson(rootFile('data', 'parishes.json'));
  const validation = await validateDataset(result.records, parishes, result.registry, config);
  if (validation.errors.length) {
    await writeJson(cacheFile('staging-validation.json'), validation);
    throw new Error('Staged records failed validation; inspect .cache/staging-validation.json. Master data unchanged.');
  }
  const flagged = duplicateCandidates(result.records);
  await writeJson(cacheFile('duplicate-result.json'), { ...result, review: staged.review, duplicate_review: flagged, base_master_sha256: staged.base_master_sha256, observation_count: staged.observation_count, duplicate_observations_removed: staged.duplicate_observations_removed });
  // Export commits the validated master, registry, reports, and derived files together.
  console.log(JSON.stringify({ canonical: result.records.length, removed: result.removed.length, flagged: flagged.length, status: 'staged_for_export' }));
});
