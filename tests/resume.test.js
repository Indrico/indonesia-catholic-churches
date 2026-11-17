import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { extract } from '../scripts/lib/workflow.js';
import { writeJson, readJson } from '../scripts/lib/io.js';
import { source, html, DATE } from './fixtures.js';

test('interrupted extraction persists failed URL and resumes without re-fetching completed profiles', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'church-resume-test-'));
  try {
    const profiles = ['https://one.example.org/', 'https://two.example.org/'];
    await writeJson(path.join(directory, 'synthetic/discovery.json'), { profiles, queue: [], failed: [] });
    const requested = [];
    let interrupt = true;
    const context = { args: { refresh: false }, source: source(), storageRoot: directory, client: { get: async url => {
      requested.push(url);
      if (url === profiles[1] && interrupt) throw new Error('Synthetic interruption');
      return { url, status: 200, body: html().replaceAll(profiles[0], url), accessed_at: DATE, etag: null, last_modified: null };
    } } };
    await assert.rejects(extract(context), /interruption/);
    const saved = await readJson(path.join(directory, 'synthetic/extraction.json'));
    assert.deepEqual(saved.completed, [profiles[0]]);
    assert.equal(saved.failed[0].url, profiles[1]);
    interrupt = false;
    assert.deepEqual(await extract(context), { observations: 2, failed: 0 });
    assert.equal(requested.filter(url => url === profiles[0]).length, 1);
  } finally {
    const absolute = path.resolve(directory);
    assert.ok(absolute.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await rm(absolute, { recursive: true, force: true });
  }
});
