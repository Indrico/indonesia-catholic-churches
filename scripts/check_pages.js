import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT, run } from './lib/io.js';
import { checkPublishedPages } from './lib/pages-check.js';

await run(async () => {
  const base = process.argv[2];
  if (!base) throw new Error('Usage: npm run check:pages -- https://owner.github.io/repository/');
  // Deployment propagation may briefly serve the previous version. Never deploy from here.
  for (let attempt = 0; attempt < 6; attempt++) {
    try { console.log(JSON.stringify(await checkPublishedPages(base, path.join(ROOT, 'dist/pages')))); return; }
    catch (error) {
      if (attempt === 5) throw error;
      console.error(`Published-site check will retry: ${error.message}`);
      await sleep(5000);
    }
  }
});
