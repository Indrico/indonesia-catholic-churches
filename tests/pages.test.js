import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir, cp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import * as cheerio from 'cheerio';
import { ROOT, readJson, writeJson, hash } from '../scripts/lib/io.js';
import { buildArtifacts, commitArtifacts } from '../scripts/lib/exporting.js';
import { validateDataset } from '../scripts/lib/validation.js';
import { buildPages } from '../scripts/lib/pages.js';
import { checkPublishedPages } from '../scripts/lib/pages-check.js';
import { record, registry, config, claim } from './fixtures.js';

async function fixture(records = []) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'church-pages-test-'));
  for (const file of ['site/index.html', 'site/styles.css', 'LICENSE', 'DATA-LICENSE.md', 'SOURCES.md', 'docs/API.md', 'schema/church.schema.json', 'schema/parish.schema.json']) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await cp(path.join(ROOT, file), path.join(root, file));
  }
  const cfg = config(), ids = registry(records);
  await writeJson(path.join(root, 'config/sources.json'), cfg);
  const validation = await validateDataset(records, [], ids, cfg);
  assert.deepEqual(validation.errors, []);
  await commitArtifacts(root, buildArtifacts({ records, parishes: [], registry: ids, config: cfg, validation, generatedAt: '2026-11-17T00:00:00.000Z', extraction: { status: records.length ? 'completed' : 'not_run', observations: records.length || null } }));
  return root;
}
async function cleanup(root) {
  const target = path.resolve(root);
  assert.ok(target.startsWith(path.resolve(os.tmpdir()) + path.sep));
  await rm(target, { recursive: true, force: true });
}
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(path.join(directory, prefix), { withFileTypes: true })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await files(directory, name)); else result.push(name);
  }
  return result.sort();
}

test('Pages publishes only allowed files, preserves export bytes, and clearly marks empty coverage', async () => {
  const root = await fixture();
  try {
    await writeJson(path.join(root, '.cache/samples/private.json'), { personal_contact: 'must not publish' });
    await writeFile(path.join(root, '.env'), 'PRIVATE_SENTINEL=must-not-publish');
    const result = await buildPages(root);
    const published = await files(result.directory);
    assert.ok(!published.some(file => /cache|private|config|reports|node_modules|\.env/.test(file)));
    const manifest = await readJson(path.join(result.directory, 'data/manifest.json'));
    for (const [file, checksum] of Object.entries(manifest.files_sha256)) {
      const original = await readFile(path.join(root, file));
      const copy = await readFile(path.join(result.directory, file));
      assert.deepEqual(copy, original);
      assert.equal(hash(copy), checksum);
    }
    assert.deepEqual(await readJson(path.join(result.directory, 'data/churches.json')), []);
    const page = await readFile(path.join(result.directory, 'index.html'), 'utf8');
    assert.ok(page.includes('tooling_only') && page.includes('0 published records') && page.includes('Source permissions are pending'));
    assert.ok(page.includes('No grouped files are available yet.'));
    assert.ok(!page.includes('{{'));
    const $ = cheerio.load(page);
    assert.equal($('h1').length, 1);
    assert.equal($('script').length, 0);
    assert.equal($('html').attr('lang'), 'en');
    for (const href of $('a[href], link[href]').map((_, el) => $(el).attr('href')).get().filter(href => href.startsWith('./'))) {
      const publicUrl = new URL(href, 'https://example.org/indonesia-catholic-churches/');
      assert.ok(publicUrl.pathname.startsWith('/indonesia-catholic-churches/'));
      const relative = publicUrl.pathname.slice('/indonesia-catholic-churches/'.length) || 'index.html';
      assert.ok(published.includes(relative), `Missing relative link ${href}`);
    }
    const first = new Map(await Promise.all(published.map(async file => [file, hash(await readFile(path.join(result.directory, file)))])));
    await buildPages(root);
    for (const [file, digest] of first) assert.equal(hash(await readFile(path.join(result.directory, file))), digest);
  } finally { await cleanup(root); }
});

test('Pages includes only real groups, escapes source text, and retains unassigned files', async () => {
  const a = record(), b = record(1);
  a.administrative_area.province = null;
  b.administrative_area.province = '<script>Contoh & É</script>';
  b.field_provenance['/administrative_area/province'] = [];
  claim(b, '/administrative_area/province', b.administrative_area.province);
  const root = await fixture([a, b]);
  try {
    const result = await buildPages(root);
    const page = await readFile(path.join(result.directory, 'index.html'), 'utf8');
    assert.ok(page.includes('&lt;script&gt;Contoh &amp; É&lt;/script&gt;'));
    assert.ok(page.includes('./data/provinces/_unassigned.json'));
    assert.ok(!page.includes('<script>Contoh'));
    const manifest = await readJson(path.join(result.directory, 'data/manifest.json'));
    for (const groups of Object.values(manifest.groups)) for (const group of groups) assert.equal((await readJson(path.join(result.directory, group.file))).length, group.count);
    assert.ok((await files(result.directory)).includes('.nojekyll'));
  } finally { await cleanup(root); }
});

test('pending data rights and stale manifests block rebuilding without replacing the last artifact', async () => {
  const root = await fixture([record()]);
  try {
    const result = await buildPages(root);
    const previous = await readFile(path.join(result.directory, 'data/churches.json'));
    const cfg = await readJson(path.join(root, 'config/sources.json'));
    cfg.sources[0].permission.redistribution = 'pending';
    await writeJson(path.join(root, 'config/sources.json'), cfg);
    await assert.rejects(buildPages(root), /source_rights/);
    assert.deepEqual(await readFile(path.join(result.directory, 'data/churches.json')), previous);
    cfg.sources[0].permission.redistribution = 'approved';
    await writeJson(path.join(root, 'config/sources.json'), cfg);
    const manifest = await readJson(path.join(root, 'data/manifest.json'));
    manifest.total_records = 999;
    await writeJson(path.join(root, 'data/manifest.json'), manifest);
    await assert.rejects(buildPages(root), /inconsistent exports/);
    assert.deepEqual(await readFile(path.join(result.directory, 'data/churches.json')), previous);
  } finally { await cleanup(root); }
});

test('post-deploy verifier checks subpath HTTP responses, JSON MIME, CORS and matching artifacts', async () => {
  const root = await fixture();
  let server;
  try {
    const result = await buildPages(root);
    let mode = 'ok';
    server = createServer(async (request, response) => {
      const prefix = '/indonesia-catholic-churches/';
      if (!request.url.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
      const file = request.url.slice(prefix.length) || 'index.html';
      response.setHeader('Content-Type', file.endsWith('.json') && mode !== 'wrong-mime' ? 'application/json; charset=utf-8' : 'text/html');
      if (mode !== 'no-cors') response.setHeader('Access-Control-Allow-Origin', '*');
      if (mode === 'missing') { response.writeHead(404); response.end(); return; }
      response.end(mode === 'stale' && file === 'data/churches.json' ? '[{}]' : await readFile(path.join(result.directory, file)));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/indonesia-catholic-churches/`;
    assert.equal((await checkPublishedPages(base, result.directory)).total_records, 0);
    for (const [value, message] of [['wrong-mime', /not JSON/], ['no-cors', /cross-origin/], ['stale', /differs/], ['missing', /HTTP 200/]]) {
      mode = value;
      await assert.rejects(checkPublishedPages(base, result.directory), message);
    }
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await cleanup(root);
  }
});
