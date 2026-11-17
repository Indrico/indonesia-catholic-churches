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
    if (item.license !== source.permission.license || item.terms_sha256 !== source.terms_sha256) {
      throw new Error(`Source rights changed for record ${record.id}; re-review required`);
    }
  }
}
