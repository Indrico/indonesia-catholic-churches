import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const CACHE = path.join(ROOT, '.cache');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const hash = value => createHash('sha256').update(value).digest('hex');
export async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function atomicWrite(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, content, 'utf8'); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
export const writeJson = (file, value) => atomicWrite(file, json(value));
export const rootFile = (...parts) => path.join(ROOT, ...parts);
export const cacheFile = (...parts) => path.join(CACHE, ...parts);
export function canonicalUrl(value, base) {
  const url = new URL(value, base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe URL');
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.href;
}
export function compareRecords(a, b) {
  const left = a.name.normalize('NFKC').toLowerCase();
  const right = b.name.normalize('NFKC').toLowerCase();
  return (left < right ? -1 : left > right ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
export function slug(value) {
  if (value === null) return '_unassigned';
  const result = value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!result) throw new Error('Administrative name cannot produce a filename');
  return result;
}
export async function run(main) {
  try { await main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
