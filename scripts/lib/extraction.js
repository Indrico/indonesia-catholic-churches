import * as cheerio from 'cheerio';
import { canonicalUrl, hash } from './io.js';
import { allowedUrl } from './policy.js';

export const EXTRACTOR_VERSION = '1.0.0';
const text = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const types = value => Array.isArray(value) ? value : [value];

export function discoverDocument(body, url, source) {
  const isXml = /^\s*(?:<\?xml[^>]*>\s*)?<(?:sitemapindex|urlset)\b/i.test(body);
  const $ = cheerio.load(body, { xmlMode: isXml });
  const profiles = new Set();
  const sitemaps = new Set();
  const candidates = isXml ? $('loc').map((_, el) => $(el).text()).get() : $('a[href]').map((_, el) => $(el).attr('href')).get();
  for (const candidate of candidates) {
    try {
      const target = allowedUrl(canonicalUrl(candidate, url), source);
      const u = new URL(target);
      if (isXml && /sitemap[^/]*\.xml$/i.test(u.pathname)) sitemaps.add(target);
      else if (u.hostname !== new URL(source.origin).hostname && u.pathname === '/' && !u.search) profiles.add(target);
    } catch { /* Navigation and other-source links are not profile discoveries. */ }
  }
  return { profiles: [...profiles].sort(), sitemaps: [...sitemaps].sort() };
}

export function extractProfile(body, requestedUrl, source, accessedAt) {
  const $ = cheerio.load(body);
  const issues = [];
  let url = requestedUrl;
  const canonical = $('link[rel="canonical"]').attr('href');
  if (canonical) url = allowedUrl(canonicalUrl(canonical, requestedUrl), source);
  const fields = [];
  const add = (path, value, locator) => { if (value !== null && value !== undefined && value !== '') fields.push({ path, value, locator }); };
  const nodes = [];
  const walk = (value, locator) => {
    if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${locator}/${index}`));
    else if (value && typeof value === 'object') {
      nodes.push({ value, locator });
      if (value['@graph']) walk(value['@graph'], `${locator}/@graph`);
    }
  };
  $('script[type="application/ld+json"]').each((index, el) => {
    try { walk(JSON.parse($(el).text()), `json_ld/${index}`); }
    catch { issues.push('invalid_json_ld'); }
  });
  const churches = nodes.filter(({ value }) => types(value['@type']).some(t => ['Church', 'CatholicChurch'].includes(t)));
  if (churches.length > 1) issues.push('multiple_church_entities');
  for (const { value: church, locator } of churches) {
    add('/name', text(church.name), `${locator}/name`);
    add('/type', text(church.additionalType), `${locator}/additionalType`);
    const address = church.address;
    if (typeof address === 'string') add('/address', text(address), `${locator}/address`);
    else if (address && typeof address === 'object') {
      const mapping = { streetAddress: '/address', addressRegion: '/administrative_area/province', addressLocality: '/administrative_area/city', postalCode: '/administrative_area/postal_code' };
      for (const [key, path] of Object.entries(mapping)) add(path, text(address[key]), `${locator}/address/${key}`);
      const country = typeof address.addressCountry === 'object' ? address.addressCountry.name : address.addressCountry;
      add('/administrative_area/country', text(country), `${locator}/address/addressCountry`);
    }
    if (church.geo) {
      add('/location/latitude', church.geo.latitude, `${locator}/geo/latitude`);
      add('/location/longitude', church.geo.longitude, `${locator}/geo/longitude`);
    }
    // A diocese in parentOrganization is not evidence of a parent parish.
    const diocese = church.parentOrganization?.name;
    if (typeof diocese === 'string' && /keuskupan/i.test(diocese)) add('/diocese/name', diocese, `${locator}/parentOrganization/name`);
    for (const [key, path] of [['telephone', '/contact/phone'], ['email', '/contact/email']]) {
      const contact = text(church[key]);
      if (!contact) continue;
      const matching = $('p, li, dd, tr, address').toArray().find(el => {
        const line = $(el).text();
        return line.includes(contact) && /sekretariat|kantor paroki|parish office|kantor gereja/i.test(line) && !/\b(?:romo|pastor|frater|suster|pribadi)\b/i.test(line);
      });
      if (matching) add(path, contact, `${locator}/${key}; institutional office label`);
      else issues.push('institutional_contact_unconfirmed');
    }
  }
  const labels = new Map([
    ['nama gereja', '/name'], ['jenis', '/type'], ['tipe', '/type'], ['keuskupan', '/diocese/name'],
    ['alamat', '/address'], ['provinsi', '/administrative_area/province'], ['kota', '/administrative_area/city'],
    ['kabupaten/kota', '/administrative_area/city'], ['kecamatan', '/administrative_area/district'],
    ['kelurahan/desa', '/administrative_area/subdistrict'], ['kode pos', '/administrative_area/postal_code'],
    ['negara', '/administrative_area/country'], ['website resmi', '/contact/website']
  ]);
  $('dt, tr').each((index, el) => {
    const isDt = el.tagName === 'dt';
    const label = (isDt ? $(el).text() : $(el).children('th,td').first().text()).trim().replace(/:$/, '').toLowerCase();
    const path = labels.get(label);
    const value = isDt ? $(el).next('dd') : $(el).children('td').last();
    if (path) add(path, path === '/contact/website' ? value.find('a[href]').attr('href') ?? text(value.text()) : text(value.text()), `html/${index}/${label}`);
  });
  // The observed Paroki.org schedule uses a JSON literal. Parse JSON only, never JS/eval.
  const schedules = [];
  $('script:not([src])').each((_, el) => {
    const match = $(el).text().match(/\bvar\s+S\s*=\s*(\[[^;]*?\])\s*,\s*PLat\s*=/s);
    if (!match) return;
    try {
      const rows = JSON.parse(match[1]);
      for (const row of rows) {
        if (typeof row.d !== 'string' || typeof row.t !== 'string' || (row.c != null && typeof row.c !== 'string')) continue;
        const raw_text = [row.d, row.t, row.c].filter(Boolean).join(' ');
        const schedule = { raw_text, day: /^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)$/.test(row.d) ? row.d : null, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(row.t) ? row.t : null, time_zone: null, notes: text(row.c) };
        schedules.push(schedule);
      }
    } catch { issues.push('invalid_schedule_json'); }
  });
  if (!schedules.length) {
    $('dt, h2, h3').each((_, el) => {
      if ($(el).text().trim().toLowerCase() !== 'jadwal misa') return;
      const value = $(el).next('dd, p, ul, table').text().trim();
      if (value) schedules.push({ raw_text: value, day: null, time: null, time_zone: null, notes: null });
    });
  }
  schedules.forEach((schedule, index) => add(`/mass_schedules/${index}`, schedule, `schedule/${index}`));
  const name = fields.find(item => item.path === '/name')?.value ?? '';
  const isInstitution = /^(?:sekolah|seminari|biara|universitas|rumah sakit)\b/i.test(name);
  const type = fields.find(item => item.path === '/type')?.value?.toLowerCase();
  const nameType = /\bkatedral\b/i.test(name) ? 'katedral' : /^kapel\b/i.test(name) ? 'kapel' : /\bstasi\b/i.test(name) ? 'stasi' : null;
  const typeDisagreement = nameType && type && nameType !== type;
  return {
    identity: url,
    canonical_url: url,
    source: { source_id: source.id, name: source.name, url, accessed_at: accessedAt, license: source.permission.license, terms_sha256: source.terms_sha256, content_sha256: hash(body), extractor_version: EXTRACTOR_VERSION },
    eligible_site: churches.length === 1 && !isInstitution && !typeDisagreement,
    fields,
    issues: [...new Set([...issues, ...(!churches.length ? ['no_church_structured_identity'] : []), ...(isInstitution ? ['excluded_institution'] : []), ...(typeDisagreement ? ['type_name_disagreement'] : [])])]
  };
}
