import { readFile, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, readJson } from './io.js';
import { validateDataset } from './validation.js';
import { buildArtifacts, checkArtifacts } from './exporting.js';
import { listingReleaseArtifacts } from './listing-release.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const publicDocuments = ['LICENSE', 'DATA-LICENSE.md', 'SOURCES.md', 'docs/API.md', 'schema/church.schema.json', 'schema/parish.schema.json'];

async function regularFile(root, file) {
  const absolute = path.join(root, file);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Publication requires a regular file: ${file}`);
  return readFile(absolute);
}

function groupLinks(groups) {
  if (!groups.length) return '<p class="muted">No grouped files are available yet.</p>';
  return `<ul class="file-list">${groups.map(group => `<li><a href="./${escapeHtml(group.file)}">${escapeHtml(group.name ?? 'Unassigned')}</a><span>${group.count} records</span></li>`).join('')}</ul>`;
}

export function renderPage(template, manifest, listing = null) {
  const values = {
    release_status: escapeHtml(manifest.release_status),
    total_records: escapeHtml(manifest.total_records),
    generated_at: escapeHtml(manifest.generated_at),
    schema_version: escapeHtml(manifest.schema_version),
    source_listing: listing ? `<p><strong>${escapeHtml(listing.total_records)} unreviewed source-listing entries</strong> from Paroki.org. Countries and church types are unconfirmed; the source covers Indonesia and Timor-Leste. Data license: <code>not_confirmed</code>.</p><ul class="file-list"><li><a href="./data/listings/paroki-org.json">Compact source listing (JSON)</a><span>Null properties omitted</span></li><li><a href="./data/listings/paroki-org.csv">Source listing (CSV)</a><span>Inspection export</span></li><li><a href="./data/listings/manifest.json">Listing manifest and permission status</a><span>Counts and checksums</span></li><li><a href="./schema/listing.compact.schema.json">Compact listing schema</a><span>Optional unknown fields</span></li><li><a href="./reports/listings/quality.json">Listing quality report</a><span>Missing fields and coverage</span></li></ul>` : '<p>No source listing is published.</p>',
    availability: manifest.release_status === 'tooling_only'
      ? listing ? 'The canonical Indonesian directory has no accepted records yet. The separate source listing below contains unreviewed observations.' : 'No church records are published yet. Source permissions are pending. Empty files are placeholders, not a measure of national coverage.'
      : 'This is a partial directory. Coverage and verification vary by record; consult the manifest and source evidence.',
    provinces: groupLinks(manifest.groups.provinces),
    dioceses: groupLinks(manifest.groups.dioceses),
    sources: manifest.sources.length
      ? `<ul>${manifest.sources.map(source => `<li><strong>${escapeHtml(source.name)}</strong> — ${escapeHtml(source.license)}. ${escapeHtml(source.attribution)}</li>`).join('')}</ul>`
      : listing ? '<p>The separate source listing is published under operator permission reported by the project owner. No blanket downstream data license has been established. See the listing manifest and data rights documentation.</p>' : '<p>No third-party church records are distributed in this release. No blanket data license has been assigned to future records.</p>'
  };
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown page placeholder: ${key}`);
    return values[key];
  });
}

export async function pagesArtifacts(root = ROOT) {
  const read = (...parts) => readJson(path.join(root, ...parts));
  const [records, parishes, registry, config, manifest, summary, fields, duplicates] = await Promise.all([
    read('data/churches.json'), read('data/parishes.json'), read('data/id-registry.json'), read('config/sources.json'),
    read('data/manifest.json'), read('reports/extraction-summary.json'), read('reports/field-review.json'), read('reports/duplicate-review.json')
  ]);
  const validation = await validateDataset(records, parishes, registry, config);
  if (validation.errors.length) throw new Error(`Pages publication blocked by dataset validation: ${validation.errors.map(e => e.code).join(', ')}`);
  if (await readJson(path.join(root, '.cache/export-transaction.json'), null)) throw new Error('Recover the interrupted export before building Pages');
  const expected = buildArtifacts({ records, parishes, registry, config, validation, generatedAt: manifest.generated_at,
    extraction: { status: summary.status, observations: summary.extracted_observations, duplicate_observations_removed: summary.duplicate_observations_removed ?? 0 },
    review: fields.items, removed: duplicates.removed_ids });
  const differences = await checkArtifacts(root, expected);
  if (differences.length) throw new Error(`Pages publication blocked by inconsistent exports: ${differences.join(', ')}`);
  const artifacts = new Map();
  // Only validated generated data is eligible; never copy the repository or cache wholesale.
  for (const file of expected.keys()) if (file.startsWith('data/')) artifacts.set(file, await regularFile(root, file));
  for (const file of publicDocuments) artifacts.set(file, await regularFile(root, file));
  const listingArtifacts = await listingReleaseArtifacts(root);
  for (const [file, content] of listingArtifacts) artifacts.set(file, content);
  const listing = listingArtifacts.has('data/listings/manifest.json') ? JSON.parse(listingArtifacts.get('data/listings/manifest.json')) : null;
  const template = (await regularFile(root, 'site/index.html')).toString('utf8');
  artifacts.set('index.html', Buffer.from(renderPage(template, manifest, listing)));
  artifacts.set('styles.css', await regularFile(root, 'site/styles.css'));
  artifacts.set('.nojekyll', Buffer.alloc(0));
  return { artifacts, manifest };
}

async function removeBuildDirectory(directory, dist) {
  const absolute = path.resolve(directory);
  if (path.dirname(absolute) !== path.resolve(dist) || !/^(pages|\.pages-[a-f0-9-]+|\.pages-backup-[a-f0-9-]+)$/.test(path.basename(absolute))) throw new Error('Unsafe build cleanup path');
  await rm(absolute, { recursive: true, force: true });
}

export async function buildPages(root = ROOT) {
  const { artifacts, manifest } = await pagesArtifacts(root);
  const dist = path.resolve(root, 'dist');
  await mkdir(dist, { recursive: true });
  if ((await lstat(dist)).isSymbolicLink()) throw new Error('Build directory must not be a symlink');
  const destination = path.join(dist, 'pages');
  const staging = path.join(dist, `.pages-${randomUUID()}`);
  const backup = path.join(dist, `.pages-backup-${randomUUID()}`);
  let previous = false;
  try {
    for (const [file, content] of artifacts) {
      const target = path.join(staging, file);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    try {
      const info = await lstat(destination);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Pages output must be a regular directory');
      await rename(destination, backup); previous = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(staging, destination); }
    catch (error) { if (previous) await rename(backup, destination); throw error; }
    if (previous) await removeBuildDirectory(backup, dist);
    return { directory: destination, files: artifacts.size, total_records: manifest.total_records, release_status: manifest.release_status };
  } finally { await removeBuildDirectory(staging, dist); }
}
