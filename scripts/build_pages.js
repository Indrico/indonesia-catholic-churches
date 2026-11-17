import { run } from './lib/io.js';
import { buildPages } from './lib/pages.js';

await run(async () => console.log(JSON.stringify(await buildPages())));
