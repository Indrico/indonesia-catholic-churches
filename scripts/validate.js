import { readJson, writeJson, rootFile, run } from './lib/io.js';
import { options } from './lib/workflow.js';
import { validateDataset } from './lib/validation.js';

await run(async () => {
  const args = options();
  const report = await validateDataset(await readJson(rootFile('data', 'churches.json')), await readJson(rootFile('data', 'parishes.json')), await readJson(rootFile('data', 'id-registry.json')), await readJson(rootFile('config', 'sources.json')));
  if (!args.check) await writeJson(rootFile('reports', 'validation.json'), report);
  console.log(JSON.stringify({ status: report.status, errors: report.errors.length, warnings: report.warnings.length, production_records: (await readJson(rootFile('data', 'churches.json'))).length }));
  if (report.errors.length) throw new Error('Dataset validation failed');
});
