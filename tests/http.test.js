import test from 'node:test';
import assert from 'node:assert/strict';
import { PoliteClient, retryDelay } from '../scripts/lib/http.js';
import { retrieve } from '../scripts/lib/workflow.js';
import { source, config, TERMS } from './fixtures.js';

function harness(handler, selectedSource = source()) {
  let clock = 0;
  const calls = [], checkpoints = [], waits = [];
  const client = new PoliteClient(selectedSource, config(), {
    now: () => clock, random: () => 0,
    sleepImpl: async ms => { waits.push(ms); clock += ms; },
    checkpoint: async data => checkpoints.push(data),
    fetchImpl: async (url, options) => {
      calls.push({ url, options, at: clock });
      if (url.endsWith('/robots.txt')) return new Response('User-agent: *\nAllow: /\n');
      if (url.endsWith('/terms/')) return new Response(TERMS);
      return handler(url, options, calls);
    }
  });
  return { client, calls, checkpoints, waits };
}
test('pending permission blocks before even robots or terms access', () => {
  let fetched = false;
  const s = source(); s.permission.redistribution = 'pending';
  assert.throws(() => new PoliteClient(s, config(), { fetchImpl: () => { fetched = true; } }), /Permission blocked/);
  assert.equal(fetched, false);
});
test('missing real contact or permission evidence blocks execution', () => {
  assert.throws(() => new PoliteClient(source(), { ...config(), contact: null }), /contact/);
  const s = source(); s.permission.evidence = [];
  assert.throws(() => new PoliteClient(s, config()), /evidence/);
});
test('serialized requests across subdomains respect spacing and identify project', async () => {
  const h = harness(() => new Response('profile'));
  await Promise.all([h.client.get('https://one.example.org/'), h.client.get('https://two.example.org/')]);
  for (let i = 1; i < h.calls.length; i++) assert.ok(h.calls[i].at - h.calls[i - 1].at >= 3000);
  assert.ok(h.calls.every(call => call.options.headers['User-Agent'].includes('mailto:directory@institution.test')));
});
test('429 stops immediately, persists Retry-After, and halts queued requests', async () => {
  let attempts = 0;
  const h = harness(() => ++attempts === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '7' } }) : new Response('ok'));
  await assert.rejects(h.client.get('https://example.org/profile'), /HTTP 429/);
  await assert.rejects(h.client.get('https://example.org/another'), /HTTP 429/);
  assert.equal(attempts, 1);
  const saved = h.checkpoints.find(item => item.halted?.code === 'HTTP_429');
  assert.ok(Date.parse(saved.retry_at) >= h.calls.at(-1).at + 7000);
  assert.ok(!h.waits.includes(7000));
});
test('Retry-After accepts HTTP dates and retries are bounded', async () => {
  assert.ok(retryDelay('Tue, 17 Nov 2026 12:00:10 GMT', 0, Date.parse('2026-11-17T12:00:00Z'), () => 0) >= 10000);
  const h = harness(() => new Response('', { status: 503 }));
  await assert.rejects(h.client.get('https://example.org/profile'), /three attempts/);
  assert.equal(h.calls.filter(call => call.url.endsWith('/profile')).length, 3);
});
test('changed terms stop profile retrieval', async () => {
  const s = source(); s.terms_sha256 = '0'.repeat(64);
  const h = harness(() => new Response('profile'), s);
  await assert.rejects(h.client.get('https://example.org/profile'), /Terms changed/);
  assert.ok(!h.calls.some(call => call.url.endsWith('/profile')));
});
test('robots exclusion, access challenges, forbidden responses and external redirects stop access', async () => {
  const denied = harness(() => new Response('profile'));
  denied.client.robots.set('https://example.org', { isAllowed: url => !url.endsWith('/profile') });
  await assert.rejects(denied.client.get('https://example.org/profile'), /disallows/);
  for (const response of [new Response('<title>Just a moment</title>'), new Response('', { status: 403 }), new Response('', { status: 302, headers: { Location: 'https://evil.test/' } })]) {
    const h = harness(() => response);
    await assert.rejects(h.client.get('https://example.org/profile'));
    assert.ok(!h.calls.some(c => c.url.includes('evil.test')));
  }
});
test('conditional fetch preserves original snapshot on 304', async () => {
  const h = harness((_, options) => {
    assert.equal(options.headers['If-None-Match'], 'synthetic-etag');
    return new Response(null, { status: 304 });
  });
  const snapshot = { body: 'unchanged profile', etag: 'synthetic-etag', accessed_at: '2026-11-16' };
  const result = await retrieve(h.client, 'https://example.org/profile', snapshot);
  assert.equal(result.body, snapshot.body);
  assert.equal(result.accessed_at, snapshot.accessed_at);
});
