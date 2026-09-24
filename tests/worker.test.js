import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function env(extra = {}) {
  return {
    SUPABASE_URL: 'https://project.example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
    ASSETS: { async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === '/404.html') return new Response('<h1>Not found</h1>', { status: 200, headers: { 'content-type': 'text/html' } });
      if (['/index.html','/','/admin','/makaleler','/ictihatlar','/sozluk','/sss','/hakkimda','/iletisim','/arama'].includes(path) || path.startsWith('/admin/')) return new Response('<!doctype html><title>Test</title>', { headers: { 'content-type': 'text/html' } });
      return new Response('Not found', { status: 404 });
    } },
    ...extra
  };
}

test('health and public runtime configuration are safe and explicit', async () => {
  const health = await worker.fetch(new Request('https://site.example/healthz'), env());
  assert.equal(health.status, 200);
  assert.equal((await health.json()).supabaseConfigured, true);
  assert.match(health.headers.get('content-security-policy'), /frame-ancestors 'none'/);

  const config = await worker.fetch(new Request('https://site.example/api/config'), env());
  const payload = await config.json();
  assert.equal(payload.supabaseUrl, 'https://project.example.supabase.co');
  assert.equal(payload.publishableKey, 'sb_publishable_test_key');
  assert.equal(JSON.stringify(payload).includes('SERVICE_ROLE'), false);
  assert.equal(JSON.stringify(payload).includes('GEMINI'), false);
});

test('contact API validates origin and honeypot without leaking errors', async () => {
  const badOrigin = await worker.fetch(new Request('https://site.example/api/contact', {
    method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}'
  }), env());
  assert.equal(badOrigin.status, 403);

  const trap = await worker.fetch(new Request('https://site.example/api/contact', {
    method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json' }, body: JSON.stringify({ website: 'spam' })
  }), env());
  assert.equal(trap.status, 200);
  assert.deepEqual(await trap.json(), { ok: true });

  const noSecrets = await worker.fetch(new Request('https://site.example/api/contact', {
    method: 'POST', headers: { origin: 'https://site.example', 'content-type': 'application/json' }, body: JSON.stringify({ name: 'A', email: 'a@example.test', consent: true })
  }), env({ SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '' }));
  assert.equal(noSecrets.status, 503);
  assert.doesNotMatch(await noSecrets.text(), /key|token|secret/i);
});

test('robots excludes the admin route and publishes the canonical sitemap URL', async () => {
  const response = await worker.fetch(new Request('https://site.example/robots.txt'), env());
  const text = await response.text();
  assert.match(text, /Disallow: \/admin/);
  assert.match(text, /Sitemap: https:\/\/site\.example\/sitemap\.xml/);
});

test('sitemap includes public fixed routes and published content only', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/articles')) return Response.json([{ slug: 'ornek-makale', updated_at: '2026-09-20T00:00:00Z' }]);
    if (url.pathname.endsWith('/caselaw')) return Response.json([{ slug: 'ornek-karar', updated_at: '2026-09-19T00:00:00Z' }]);
    if (url.pathname.endsWith('/glossary_terms')) return Response.json([{ slug: 'terim', updated_at: '2026-09-18T00:00:00Z' }]);
    return new Response('', { status: 404 });
  };
  t.after(() => { globalThis.fetch = original; });
  const response = await worker.fetch(new Request('https://site.example/sitemap.xml'), env());
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /https:\/\/site\.example\/makale\/ornek-makale/);
  assert.match(body, /https:\/\/site\.example\/ictihat\/ornek-karar/);
  assert.match(body, /https:\/\/site\.example\/sozluk\/terim/);
  assert.doesNotMatch(body, /\/admin/);
});

test('unknown content routes return an actual 404', async (t) => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  t.after(() => { globalThis.fetch = original; });
  const response = await worker.fetch(new Request('https://site.example/makale/yok'), env());
  assert.equal(response.status, 404);
  assert.match(await response.text(), /Not found/);
});

test('public routes use the static site shell and private admin responses are noindex', async () => {
  const response = await worker.fetch(new Request('https://site.example/makaleler'), env());
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Test/);

  const admin = await worker.fetch(new Request('https://site.example/admin'), env());
  assert.equal(admin.status, 200);
  assert.match(admin.headers.get('x-robots-tag'), /noindex/);
});

