import { canonicalUrl } from './io.js';

export function allowedUrl(value, source) {
  const url = new URL(canonicalUrl(value));
  const origin = new URL(source.origin);
  const hostAllowed = url.hostname === origin.hostname || (source.allow_subdomains && url.hostname.endsWith(`.${origin.hostname}`));
  if (!hostAllowed || url.protocol !== 'https:' || url.port !== origin.port) throw new Error('URL outside approved source boundary');
  return url.href;
}

export function assertEligible(source, project) {
  const p = source?.permission;
  if (!p || p.extraction !== 'approved' || p.redistribution !== 'approved' || p.commercial_reuse !== true) {
    throw new Error(`Permission blocked: ${source?.id ?? 'unknown'} requires explicit extraction, redistribution and commercial reuse rights`);
  }
  if (!p.license || /pending|unknown/i.test(p.license) || !p.attribution || !Array.isArray(p.evidence) || !p.evidence.length || !p.evidence.every(e => typeof e === 'string' && e.trim()) || !p.reviewed_by || !/^\d{4}-\d{2}-\d{2}$/.test(p.reviewed_at ?? '')) {
    throw new Error('Permission evidence, license, attribution and human review are required');
  }
  if (!source.terms_url || !/^[a-f0-9]{64}$/.test(source.terms_sha256 ?? '')) throw new Error('Reviewed terms URL and SHA-256 are required');
  allowedUrl(source.terms_url, source);
  if (project) {
    if (!/^https:\/\//.test(project.project_url ?? '') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(project.contact ?? '') || /example\.(com|org|net)$/i.test(project.contact)) {
      throw new Error('Configure a real project URL and institutional contact before live extraction');
    }
  }
}

// Local access checks scope/terms, never redistribution or commercial rights.
export function assertLocalListingPermission(source, project, grant) {
  if (!grant || grant.source_id !== source?.id || grant.scope !== 'listing_only_local') {
    throw new Error('Local listing access policy and matching source are required');
  }
  if (!/^[a-f0-9]{64}$/.test(grant.terms_sha256 ?? '')) {
    throw new Error('A reviewed terms fingerprint is required for local access');
  }
  const projectUrl = new URL(canonicalUrl(project.project_url));
  if (projectUrl.protocol !== 'https:') throw new Error('A public HTTPS project URL is required');
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(project.contact ?? '') && !/example\.(com|org|net)$/i.test(project.contact);
  if (!email) {
    const contact = new URL(canonicalUrl(project.contact_url));
    if (contact.protocol !== 'https:') throw new Error('A real contact email or HTTPS contact URL is required');
  }
  allowedUrl(source.terms_url, source);
  allowedUrl(grant.listing_url, source);
  if (grant.listing_url !== `${source.origin}/browse/` || source.terms_url !== `${source.origin}/terms/`) throw new Error('Local grant is restricted to the directory listing and its root terms');
}

export function sourceIdentity(source) {
  return canonicalUrl(source.identity_url ?? source.url);
}

export function sourceFor(config, id) {
  const source = config.sources.find(item => item.id === id);
  if (!source) throw new Error(`Unknown source: ${id}`);
  return source;
}

export function assertRecordRights(record, config) {
  for (const item of record.sources) {
    const source = sourceFor(config, item.source_id);
    assertEligible(source);
    allowedUrl(item.url, source);
    allowedUrl(sourceIdentity(item), source);
    if (item.license !== source.permission.license || item.terms_sha256 !== source.terms_sha256) {
      throw new Error(`Source rights changed for record ${record.id}; re-review required`);
    }
  }
}
