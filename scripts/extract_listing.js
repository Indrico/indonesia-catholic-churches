import { parseArgs } from 'node:util';
import { readJson, rootFile, cacheFile, run } from './lib/io.js';
import { sourceFor } from './lib/policy.js';
import { runListing } from './lib/listing-workflow.js';

await run(async () => {
  const { values } = parseArgs({ options: { sample: { type: 'boolean', default: false }, refresh: { type: 'boolean', default: false } }, strict: true });
  const project = await readJson(rootFile('config/sources.json'));
  const source = sourceFor(project, 'paroki_org');
  const directory = cacheFile('paroki_org/listing');
  const grant = await readJson(cacheFile('paroki_org/listing/permission.json'), null);
  const summary = await runListing({ directory, source, project, grant, ...values });
  console.log(JSON.stringify(summary, null, 2));
});
