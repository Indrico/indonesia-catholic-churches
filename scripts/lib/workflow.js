import { parseArgs } from 'node:util';
import path from 'node:path';
import { readJson, writeJson, rootFile, cacheFile, hash, CACHE } from './io.js';
import { sourceFor, assertEligible, allowedUrl } from './policy.js';
import { PoliteClient } from './http.js';
import { discoverDocument, extractProfile } from './extraction.js';

export function options() {
  return parseArgs({ options: { source: { type: 'string', default: 'paroki_org' }, refresh: { type: 'boolean', default: false }, check: { type: 'boolean', default: false } }, strict: true }).values;
}
export async function context() {
  const args = options();
  const config = await readJson(rootFile('config', 'sources.json'));
  const source = sourceFor(config, args.source);
  assertEligible(source, config);
  if (source.id !== 'paroki_org') throw new Error('No extraction adapter enabled for this source');
  const statePath = cacheFile(source.id, 'network.json');
  const state = await readJson(statePath, {});
  const policyHash = hash(JSON.stringify(source));
  if (state.policy_hash && state.policy_hash !== policyHash) throw new Error('Cached source policy differs; review and archive this cache before a new run');
  state.policy_hash = policyHash;
  const client = new PoliteClient(source, config, { checkpoint: async value => { Object.assign(state, value); await writeJson(statePath, state); } });
  if (state.retry_at) client.nextAt = Math.max(client.nextAt, Date.parse(state.retry_at));
  return { args, config, source, client };
}

export async function retrieve(client, url, previous) {
  const headers = {};
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  if (previous?.last_modified) headers['If-Modified-Since'] = previous.last_modified;
  const response = await client.get(url, headers);
  if (response.status === 304) {
    if (!previous?.body) throw new Error('304 received without a cached body');
    return { ...previous, revalidated_at: response.accessed_at };
  }
  return response;
}

export async function discover({ args, source, client, storageRoot = CACHE }) {
  const file = path.join(storageRoot, source.id, 'discovery.json');
  const state = await readJson(file, { queue: [...source.discovery_urls], completed: [], profiles: [], failed: [], documents: {} });
  if (args.refresh) { state.queue = [...source.discovery_urls]; state.completed = []; }
  while (state.queue.length) {
    const url = state.queue[0];
    try {
      const response = await retrieve(client, url, state.documents[url]);
      state.documents[url] = response;
      const found = discoverDocument(response.body, response.url, source);
      state.profiles = [...new Set([...state.profiles, ...found.profiles])].sort();
      state.completed.push(url);
      state.queue.shift();
      // A subdomain sitemap identifies its root; do not crawl each sitemap just to learn the root.
      for (const sitemap of found.sitemaps) {
        const target = new URL(sitemap);
        if (target.hostname !== new URL(source.origin).hostname) state.profiles.push(`${target.origin}/`);
        else if (!state.completed.includes(sitemap) && !state.queue.includes(sitemap)) state.queue.push(sitemap);
      }
      state.profiles = [...new Set(state.profiles)].sort();
      state.failed = state.failed.filter(item => item.url !== url);
      await writeJson(file, state);
    } catch (error) {
      state.failed = [...state.failed.filter(item => item.url !== url), { url, error: error.message, at: new Date().toISOString() }];
      await writeJson(file, state);
      throw error;
    }
  }
  return { profiles: state.profiles.length, failed: state.failed.length };
}

export async function extract({ args, source, client, storageRoot = CACHE }) {
  const discovery = await readJson(path.join(storageRoot, source.id, 'discovery.json'));
  if (discovery.queue.length || discovery.failed.length) throw new Error('Complete discovery before extracting profiles');
  const file = path.join(storageRoot, source.id, 'extraction.json');
  const state = await readJson(file, { completed: [], failed: [], observations: {}, started_at: new Date().toISOString(), completed_at: null });
  if (args.refresh) { state.completed = []; state.completed_at = null; }
  for (const url of discovery.profiles) {
    allowedUrl(url, source);
    if (state.completed.includes(url)) continue;
    const rawFile = path.join(storageRoot, source.id, 'profiles', `${hash(url)}.json`);
    try {
      const previous = await readJson(rawFile, null);
      const response = await retrieve(client, url, previous);
      await writeJson(rawFile, response);
      state.observations[url] = extractProfile(response.body, response.url, source, response.accessed_at);
      state.completed.push(url);
      state.failed = state.failed.filter(item => item.url !== url);
      await writeJson(file, state);
    } catch (error) {
      state.failed = [...state.failed.filter(item => item.url !== url), { url, error: error.message, at: new Date().toISOString() }];
      await writeJson(file, state);
      throw error;
    }
  }
  state.completed_at = new Date().toISOString();
  await writeJson(file, state);
  return { observations: Object.keys(state.observations).length, failed: state.failed.length };
}
