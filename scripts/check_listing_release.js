import { listingReleaseArtifacts } from './lib/listing-release.js';
import { run } from './lib/io.js';
await run(async () => console.log(JSON.stringify({ listing_release: 'passed', files: (await listingReleaseArtifacts()).size })));
