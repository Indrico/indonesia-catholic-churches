import { context, discover } from './lib/workflow.js';
import { run } from './lib/io.js';
await run(async () => console.log(JSON.stringify(await discover(await context()))));
