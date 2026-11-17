import robotsParser from 'robots-parser';
import { setTimeout as sleep } from 'node:timers/promises';
import { allowedUrl, assertEligible } from './policy.js';
import { hash } from './io.js';

export function retryDelay(header, attempt, now = Date.now(), random = Math.random) {
  const numeric = header !== null && header !== undefined && /^\d+$/.test(header.trim()) ? Number(header) * 1000 : NaN;
  const date = header && !Number.isFinite(numeric) ? Date.parse(header) - now : NaN;
  return Math.max(2000 * 2 ** attempt + Math.floor(random() * 500), Number.isFinite(numeric) ? numeric : 0, Number.isFinite(date) ? date : 0);
}

// One client per run: the queue and delay cover every approved subdomain.
export class PoliteClient {
  constructor(source, project, { fetchImpl = fetch, sleepImpl = sleep, now = Date.now, random = Math.random, checkpoint = async () => {} } = {}) {
    assertEligible(source, project);
    Object.assign(this, { source, project, fetchImpl, sleepImpl, now, random, checkpoint });
    this.userAgent = `IndonesiaCatholicChurches/0.1 (+${project.project_url}; mailto:${project.contact})`;
    this.nextAt = 0;
    this.delay = Math.max(2000, source.delay_ms ?? 2000);
    this.robots = new Map();
    this.tail = Promise.resolve();
    this.termsVerified = false;
  }
  async pause(until) {
    this.nextAt = Math.max(this.nextAt, until);
    await this.checkpoint({ retry_at: new Date(this.nextAt).toISOString() });
    if (this.nextAt > this.now()) await this.sleepImpl(this.nextAt - this.now());
  }
  async raw(url, headers = {}) {
    allowedUrl(url, this.source);
    for (let attempt = 0; attempt < 5; attempt++) {
      assertEligible(this.source, this.project);
      await this.pause(this.nextAt);
      let response;
      try {
        response = await this.fetchImpl(url, { headers: { ...headers, 'User-Agent': this.userAgent }, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      } catch {
        this.nextAt = this.now() + this.delay;
        if (attempt === 4) throw new Error('Network request failed after five attempts');
        await this.pause(this.now() + retryDelay(null, attempt, this.now(), this.random));
        continue;
      }
      this.nextAt = this.now() + this.delay;
      if (response.status === 429 || response.status >= 500) {
        await response.body?.cancel();
        const delay = retryDelay(response.headers.get('retry-after'), attempt, this.now(), this.random);
        await this.pause(this.now() + delay);
        if (attempt === 4) throw new Error(`HTTP ${response.status} after five attempts`);
        continue;
      }
      return response;
    }
  }
  async robot(url) {
    const origin = new URL(url).origin;
    if (!this.robots.has(origin)) {
      const robotsUrl = `${origin}/robots.txt`;
      const response = await this.raw(robotsUrl);
      if (response.status !== 200 && response.status !== 404) {
        await response.body?.cancel();
        throw new Error('Unable to establish robots policy; source paused');
      }
      const body = await response.text();
      if (response.status === 200 && /<html|captcha|cf-chl-|challenge-platform/i.test(body)) throw new Error('Robots access challenge; source paused');
      const robot = robotsParser(robotsUrl, response.status === 404 ? '' : body);
      this.robots.set(origin, robot);
      this.delay = Math.max(this.delay, (robot.getCrawlDelay(this.userAgent) ?? 0) * 1000);
      this.nextAt = Math.max(this.nextAt, this.now() + this.delay);
    }
    if (this.robots.get(origin).isAllowed(url, this.userAgent) === false) throw new Error('robots.txt disallows this URL');
  }
  async request(url, headers) {
    let target = allowedUrl(url, this.source);
    for (let redirects = 0; redirects <= 5; redirects++) {
      await this.robot(target);
      const response = await this.raw(target, headers);
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new Error('Redirect has no location');
        target = allowedUrl(new URL(location, target).href, this.source);
        continue;
      }
      if (![200, 304].includes(response.status)) {
        await response.body?.cancel();
        throw new Error(`HTTP ${response.status}; review failed URL before retrying`);
      }
      const body = response.status === 304 ? null : await response.text();
      if (body && /<title>[^<]*(?:just a moment|access denied|captcha)|cf-chl-|g-recaptcha|h-captcha/i.test(body)) throw new Error('Access challenge detected; source paused');
      return { url: target, status: response.status, body, etag: response.headers.get('etag'), last_modified: response.headers.get('last-modified'), accessed_at: new Date(this.now()).toISOString().slice(0, 10) };
    }
    throw new Error('Too many redirects');
  }
  get(url, headers = {}) {
    const job = this.tail.then(async () => {
      assertEligible(this.source, this.project);
      if (!this.termsVerified) {
        const terms = await this.request(this.source.terms_url, {});
        if (hash(terms.body) !== this.source.terms_sha256) throw new Error('Terms changed; human permission review required');
        this.termsVerified = true;
      }
      return this.request(url, headers);
    });
    this.tail = job.catch(() => {});
    return job;
  }
}
