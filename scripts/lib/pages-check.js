// Native Node APIs only, so deployment verification requires no dependency install.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hash, readJson } from './io.js';

export async function checkPublishedPages(base, artifactRoot, { fetchImpl = fetch } = {}) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Use an HTTPS site base URL without credentials, query or fragment');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  const manifest = await readJson(path.join(artifactRoot, 'data/manifest.json'));
  const groupFiles = [manifest.groups.provinces[0]?.file, manifest.groups.dioceses[0]?.file].filter(Boolean);
  const files = ['index.html', 'data/manifest.json', 'data/churches.json', 'data/parishes.json', ...groupFiles];
  const listing = await readJson(path.join(artifactRoot, 'data/listings/manifest.json'), null);
  if (listing) files.push('data/listings/manifest.json', 'data/listings/paroki-org.json');
  for (const file of files) {
    const response = await fetchImpl(new URL(file === 'index.html' ? './' : file, url), { headers: { Origin: 'https://example.org' }, signal: AbortSignal.timeout(30000), redirect: 'error' });
    if (response.status !== 200) throw new Error(`${file}: expected HTTP 200, received ${response.status}`);
    const body = Buffer.from(await response.arrayBuffer());
    if (file.endsWith('.json')) {
      if (!/^application\/(?:[a-z0-9.-]+\+)?json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Error(`${file}: response is not JSON content`);
      if (!['*', 'https://example.org'].includes(response.headers.get('access-control-allow-origin'))) throw new Error(`${file}: cross-origin browser access is not enabled`);
      JSON.parse(body.toString('utf8'));
    }
    const expected = await readFile(path.join(artifactRoot, file));
    if (hash(body) !== hash(expected)) throw new Error(`${file}: published content differs from the build artifact`);
  }
  return { base_url: url.href, checked_files: files.length, total_records: manifest.total_records, source_listing_records: listing?.total_records ?? 0 };
}
