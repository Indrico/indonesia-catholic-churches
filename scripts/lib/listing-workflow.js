import path from 'node:path';
import { stringify } from 'csv-stringify/sync';
import { readJson, writeJson, atomicWrite, hash, json } from './io.js';
import { assertLocalListingPermission } from './policy.js';
import { PoliteClient } from './http.js';
import { retrieve } from './workflow.js';
import { parseListing, normalizeListingGroup, validateListing, listingStatistics, sortListing, LISTING_VERSION, listingSchema } from './listing.js';

export async function listingSnapshot({ directory, source, project, grant, refresh = false, clientFactory = (s, p, options) => new PoliteClient(s, p, options) }) {
  assertLocalListingPermission(source, project, grant);
  const filename = path.join(directory, 'snapshot.json');
  const policyHash = hash(json({ source, grant, project }));
  const previous = await readJson(filename, null);
  if (previous && previous.policy_hash !== policyHash) throw new Error('Listing policy changed; review and archive the private listing cache before continuing');
  if (previous && (hash(previous.body) !== previous.body_sha256 || previous.url !== grant.listing_url)) throw new Error('Listing snapshot integrity check failed; previous exports preserved');
  if (previous && !refresh) return previous;
  const networkFile = path.join(directory, 'network.json');
  const network = await readJson(networkFile, { requests: [] });
  if (network.policy_hash && network.policy_hash !== policyHash) throw new Error('Cached network policy changed; review the private cache');
  if (Date.parse(network.retry_at ?? '') > Date.now()) throw new Error(`Source paused until ${network.retry_at}; rerun manually after the saved request delay`);
  network.policy_hash = policyHash;
  const client = clientFactory(source, project, { localListingGrant: grant, checkpoint: async event => {
    if (event.last_request) network.requests.push(event.last_request);
    Object.assign(network, event);
    await writeJson(networkFile, network);
  } });
  const response = await retrieve(client, grant.listing_url, previous);
  // Detect unexpected HTML before replacing an earlier usable snapshot.
  parseListing(response.body, response.url, source, grant.terms_sha256, response.accessed_at, { sample: true });
  const snapshot = { ...response, policy_hash: policyHash, body_sha256: hash(response.body) };
  await writeJson(filename, snapshot);
  return snapshot;
}

export async function runListing({ directory, source, project, grant, sample = false, refresh = false, clientFactory, onProcessed = async () => {} }) {
  assertLocalListingPermission(source, project, grant);
  const output = sample ? path.join(directory, 'sample') : directory;
  let progress;
  const progressFile = path.join(output, 'progress.json');
  try {
    const snapshot = await listingSnapshot({ directory, source, project, grant, refresh, clientFactory });
    const parsed = parseListing(snapshot.body, snapshot.url, source, grant.terms_sha256, snapshot.accessed_at, { sample });
    const groups = new Map();
    for (const observation of parsed.observations) {
      if (!groups.has(observation.identity)) groups.set(observation.identity, []);
      groups.get(observation.identity).push(observation);
    }
    const registryFile = path.join(directory, 'id-registry.json');
    const registry = await readJson(registryFile, { identities: {}, redirects: {} });
    progress = await readJson(progressFile, {});
    if (progress.snapshot_sha256 !== snapshot.body_sha256 || progress.extractor_version !== LISTING_VERSION) progress = { entries: {} };
    progress.entries = Object.fromEntries([...groups].map(([identity, observations]) => [identity, progress.entries[identity] ?? { status: 'pending', card_indices: observations.map(o => o.context.card_index) }]));
    Object.assign(progress, { snapshot_sha256: snapshot.body_sha256, extractor_version: LISTING_VERSION, status: 'processing', total_urls: groups.size, updated_at: new Date().toISOString(), failed_cards: parsed.errors });
    const results = [];
    for (const [identity, observations] of groups) {
      const filename = path.join(output, 'records', `${hash(identity)}.json`);
      const cached = await readJson(filename, null);
      const identityKey = `${source.id}:${identity}`;
      let result;
      const entry = progress.entries[identity];
      if (entry && ['completed', 'needs_review'].includes(entry.status) && cached?.snapshot_sha256 === snapshot.body_sha256 && cached.extractor_version === LISTING_VERSION) {
        result = cached.result;
      } else {
        progress.active_identity = identity;
        progress.entries[identity] = { status: 'processing', card_indices: observations.map(o => o.context.card_index) };
        await writeJson(progressFile, progress);
        result = normalizeListingGroup(observations, registry.identities[identityKey] ?? cached?.result.record.id);
        await writeJson(filename, { snapshot_sha256: snapshot.body_sha256, extractor_version: LISTING_VERSION, result });
        progress.entries[identity] = { status: result.record.verification.status === 'needs_review' ? 'needs_review' : 'completed', card_indices: observations.map(o => o.context.card_index), id: result.record.id };
        delete progress.active_identity;
        await writeJson(progressFile, progress);
        await onProcessed(identity);
      }
      registry.identities[identityKey] = result.record.id;
      results.push(result);
    }
    const records = sortListing(results.map(result => result.record));
    const validation = validateListing(records, source, grant, registry);
    await writeJson(path.join(output, 'reports/validation.json'), validation);
    if (validation.errors.length) throw new Error(`Local listing validation failed: ${validation.errors.length} errors; earlier aggregate exports preserved`);
    await writeJson(registryFile, registry);
    const issues = results.flatMap(result => result.issues);
    const complete = { status: parsed.errors.length ? 'partial' : 'completed', publication_allowed: false, extractor_version: LISTING_VERSION, generated_at: new Date().toISOString(), source_url: grant.listing_url, snapshot_sha256: snapshot.body_sha256, sample_only: sample, cards_found: parsed.card_count, cards_processed: parsed.selected_cards, card_errors: parsed.errors, profile_urls_discovered: groups.size, successfully_extracted: records.length, failed_profiles: 0, failed_cards: parsed.errors.length, profile_pages_requested: 0, duplicate_cards_collapsed: parsed.observations.length - groups.size, duplicate_records_removed: 0, ...listingStatistics(records, validation), permission: { extraction: 'oral permission attested by maintainer; local listing only', redistribution: 'pending', commercial_reuse: 'not established', license: null }, note: 'Private listing observations. Unknown country/type remain null. These are not verified Indonesian church or national coverage counts.' };
    const artifact = (file, value) => writeJson(path.join(output, file), value);
    await artifact('churches.schema.json', listingSchema);
    await artifact('churches.json', records);
    const rows = records.map(r => ({ id: r.id, name: r.name, type: r.type, ...r.administrative_area, diocese: r.diocese.name, address: r.address, ...r.contact, ...r.location, profile_url: r.sources[0].identity_url, source_url: r.sources[0].url, mass_schedules_json: JSON.stringify(r.mass_schedules), sources_json: JSON.stringify(r.sources), field_provenance_json: JSON.stringify(r.field_provenance), conflicts_json: JSON.stringify(r.conflicts) }));
    const columns = ['id', 'name', 'type', 'country', 'province', 'city', 'district', 'subdistrict', 'postal_code', 'diocese', 'address', 'phone', 'phone_e164', 'email', 'website', 'latitude', 'longitude', 'coordinate_source', 'google_maps_url', 'profile_url', 'source_url', 'mass_schedules_json', 'sources_json', 'field_provenance_json', 'conflicts_json'];
    await atomicWrite(path.join(output, 'churches.csv'), stringify(rows, { header: true, columns, escape_formulas: true, record_delimiter: '\n' }));
    await artifact('discovered_profiles.json', [...groups.keys()].sort().map(url => ({ url, discovered_at: snapshot.accessed_at, status: progress.entries[url].status })));
    await artifact('reports/duplicate-review.json', { pairs: validation.duplicates, duplicate_cards_collapsed: complete.duplicate_cards_collapsed, removed_records: [] });
    await artifact('reports/missing-fields.json', validation.missing);
    await artifact('reports/field-review.json', { items: issues, contexts: results.map(result => ({ id: result.record.id, contexts: result.contexts })) });
    await artifact('countries/indonesia.json', records.filter(r => r.administrative_area.country === 'ID'));
    await artifact('countries/other.json', records.filter(r => r.administrative_area.country !== null && r.administrative_area.country !== 'ID'));
    await artifact('countries/unknown.json', records.filter(r => r.administrative_area.country === null));
    await artifact('reports/extraction-summary.json', complete);
    progress.status = complete.status;
    progress.updated_at = new Date().toISOString();
    progress.completed_urls = records.length;
    await writeJson(progressFile, progress);
    return complete;
  } catch (error) {
    await writeJson(path.join(output, 'reports/failure.json'), { at: new Date().toISOString(), error: error.message, publication_allowed: false });
    if (progress) {
      if (progress.active_identity && progress.entries[progress.active_identity]?.status === 'processing') progress.entries[progress.active_identity] = { ...progress.entries[progress.active_identity], status: 'failed', error: error.message };
      progress.status = 'interrupted'; progress.error = error.message; await writeJson(progressFile, progress);
    }
    throw error;
  }
}
