import test from 'node:test';
import assert from 'node:assert/strict';
import { compactJson } from '../scripts/lib/compact.js';

test('external JSON omits null properties recursively while preserving meaningful values and array indices', () => {
  const master = { name: 'Gereja Contoh', phone: null, contact: { email: null, website: 'https://institution.test/' }, latitude: 0, verified: false, notes: '', schedules: [{ time: null, raw_text: 'Minggu' }, null] };
  const serialized = compactJson(master);
  const external = JSON.parse(serialized);
  assert.deepEqual(external, { name: 'Gereja Contoh', contact: { website: 'https://institution.test/' }, latitude: 0, verified: false, notes: '', schedules: [{ raw_text: 'Minggu' }, null] });
  assert.equal(master.phone, null);
  assert.equal(master.schedules[0].time, null);
  assert.ok(!serialized.includes('\n  '));
  assert.ok(Buffer.byteLength(serialized) < Buffer.byteLength(JSON.stringify(master, null, 2)));
});
