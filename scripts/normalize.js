import { readdir } from 'node:fs/promises';
import { readJson, writeJson, rootFile, cacheFile, CACHE, run, hash, json } from './lib/io.js';
import { normalizeObservations } from './lib/records.js';
import { sourceFor, assertEligible, assertRecordRights } from './lib/policy.js';

await run(async () => {
  const config = await readJson(rootFile('config', 'sources.json'));
  const observations = [];
  let sourceDirs;
  try { sourceDirs = await readdir(CACHE, { withFileTypes: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; sourceDirs = []; }
  for (const dir of sourceDirs.filter(item => item.isDirectory())) {
    const extraction = await readJson(cacheFile(dir.name, 'extraction.json'), null);
    if (!extraction) continue;
    assertEligible(sourceFor(config, dir.name));
    if (!extraction.completed_at || extraction.failed.length) throw new Error('Extraction is incomplete; resume it before normalization');
    observations.push(...Object.values(extraction.observations));
  }
  if (!observations.length) throw new Error('No authorized extraction observations; production data remains unchanged');
  const existing = await readJson(rootFile('data', 'churches.json'));
  const result = normalizeObservations(observations, await readJson(rootFile('data', 'id-registry.json')), existing, await readJson(rootFile('config', 'normalization.json')), await readJson(rootFile('config', 'curation.json')));
  result.base_master_sha256 = hash(json(existing));
  result.observation_count = observations.length;
  for (const record of result.records) assertRecordRights(record, config);
  await writeJson(cacheFile('normalized.json'), result);
  console.log(JSON.stringify({ staged: result.candidates.length, eligible: result.records.length, review_items: result.review.length }));
});
