const XML_HEADERS = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300, stale-while-revalidate=600' };
const MAX_BODY = 16_384;

function headers() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'content-security-policy': "default-src 'self'; script-src 'self' https://esm.sh; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.supabase.co https://esm.sh; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
  };
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers(), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

async function published(env, table, select, order) {
  const rows = [];
  for (let offset = 0; offset < 50_000; offset += 1000) {
    const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
    url.search = new URLSearchParams({ select, status: 'eq.published', order, limit: '1000', offset: String(offset) });
    const response = await fetch(url, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}` }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`public content request failed (${response.status})`);
    const page = await response.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
  return rows;
}

async function sitemap(request, env) {
  const origin = new URL(request.url).origin;
  try {
    const [articles, cases, terms] = await Promise.all([
      published(env, 'articles', 'slug,updated_at,published_at', 'published_at.desc'),
      published(env, 'caselaw', 'slug,updated_at,decision_date', 'decision_date.desc'),
      published(env, 'glossary_terms', 'slug,updated_at', 'term.asc')
    ]);
    const paths = ['/', '/makaleler', '/ictihatlar', '/sozluk', '/sss', '/hakkimda', '/iletisim'];
    const rows = paths.map(path => ({ loc: new URL(path, origin).href, lastmod: new Date().toISOString() }));
    for (const [list, base, dateField] of [[articles, '/makale/', 'updated_at'], [cases, '/ictihat/', 'updated_at'], [terms, '/sozluk/', 'updated_at']]) {
      for (const item of list) if (item.slug) rows.push({ loc: new URL(base + encodeURIComponent(item.slug), origin).href, lastmod: safeDate(item[dateField]) });
    }
    const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map(row => `<url><loc>${xmlEscape(row.loc)}</loc><lastmod>${row.lastmod}</lastmod></url>`).join('')}</urlset>`;
    return new Response(body, { headers: { ...headers(), ...XML_HEADERS } });
  } catch (error) {
    console.error('sitemap failed', { name: error?.name || 'Error' });
    return new Response('Sitemap geçici olarak üretilemiyor.\n', { status: 503, headers: { ...headers(), 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'retry-after': '60' } });
  }
}

async function contentRouteExists(env, path) {
  const match = path.match(/^\/(makale|ictihat|sozluk)\/([^/]+)\/?$/);
  if (!match) return false;
  const table = match[1] === 'makale' ? 'articles' : match[1] === 'ictihat' ? 'caselaw' : 'glossary_terms';
  const url = new URL(`/rest/v1/${table}`, env.SUPABASE_URL);
  url.search = new URLSearchParams({ select: 'slug', slug: `eq.${decodeURIComponent(match[2])}`, status: 'eq.published', limit: '1' });
  const response = await fetch(url, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}` }, signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('route lookup failed');
  return (await response.json()).length > 0;
}

function safeDate(value) {
  const parsed = new Date(value || Date.now());
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function handle(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/healthz') return json({ ok: true, service: 'legal-platform', supabaseConfigured: Boolean(env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY) });
  if (url.pathname === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { ...headers(), 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (url.pathname === '/sitemap.xml' && (request.method === 'GET' || request.method === 'HEAD')) return sitemap(request, env);

  if (url.pathname === '/api/config' && request.method === 'GET') {
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: 'Servis geçici olarak kullanılamıyor.' }, 503);
    return json({ supabaseUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
  }

  if (url.pathname === '/api/contact') {
    if (request.method !== 'POST') return json({ error: 'Bu istek desteklenmiyor.' }, 405, { allow: 'POST' });
    if (!sameOrigin(request)) return json({ error: 'İstek doğrulanamadı.' }, 403);
    const type = request.headers.get('content-type') || '';
    const length = Number(request.headers.get('content-length') || 0);
    if (!type.includes('application/json') || length > MAX_BODY) return json({ error: 'Form bilgileri geçersiz.' }, 400);
    let payload;
    try { payload = await request.json(); } catch { return json({ error: 'Form bilgileri geçersiz.' }, 400); }
    if (JSON.stringify(payload).length > MAX_BODY) return json({ error: 'Form bilgileri geçersiz.' }, 413);
    if (typeof payload.website === 'string' && payload.website.trim()) return json({ ok: true });
    if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return json({ error: 'İletişim formu geçici olarak kullanılamıyor.' }, 503);
    try {
      const response = await fetch(`${env.SUPABASE_URL}/functions/v1/contact-intake`, {
        method: 'POST', headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`, 'content-type': 'application/json', origin: url.origin, 'x-forwarded-for': request.headers.get('cf-connecting-ip') || '' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return json({ error: 'Mesajınız şu anda gönderilemedi. Lütfen daha sonra tekrar deneyin.' }, response.status === 429 ? 429 : 502);
      return json({ ok: true });
    } catch (error) {
      console.error('contact forward failed', { name: error?.name || 'Error' });
      return json({ error: 'Mesajınız şu anda gönderilemedi. Lütfen daha sonra tekrar deneyin.' }, 502);
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Bu istek desteklenmiyor.' }, 405, { allow: 'GET, HEAD' });
  if (url.pathname.startsWith('/admin')) {
    const response = await env.ASSETS.fetch(request);
    const secured = new Response(response.body, { status: response.status, headers: new Headers([...response.headers, ...Object.entries(headers()), ['x-robots-tag','noindex, nofollow']]) });
    return request.method === 'HEAD' ? new Response(null, { status: secured.status, headers: secured.headers }) : secured;
  }
  if (env.SUPABASE_URL && env.SUPABASE_PUBLISHABLE_KEY && !url.pathname.startsWith('/admin')) {
    try {
      const redirectUrl = new URL('/rest/v1/redirects', env.SUPABASE_URL);
      redirectUrl.search = new URLSearchParams({ select: 'target_path,status_code', source_path: `eq.${url.pathname}`, enabled: 'eq.true', limit: '1' });
      const result = await fetch(redirectUrl, { headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}` }, signal: AbortSignal.timeout(1800) });
      const rows = result.ok ? await result.json() : [];
      const target = rows[0]?.target_path;
      if (target && target.startsWith('/') && !target.startsWith('//') && !/[\r\n]/.test(target)) return Response.redirect(new URL(target, url.origin), [301,302,307,308].includes(rows[0].status_code) ? rows[0].status_code : 301);
    } catch { /* redirect lookup is optional; serve the requested page */ }
  }
  const asset = await env.ASSETS.fetch(request);
  if (asset.status !== 404 || url.pathname.includes('.')) return new Response(asset.body, { status: asset.status, headers: new Headers([...asset.headers, ...Object.entries(headers())]) });
  const route = url.pathname.replace(/\/$/,'') || '/';
  const pages = new Set(['/','/makaleler','/ictihatlar','/sozluk','/sss','/hakkimda','/iletisim','/arama','/kvkk','/gizlilik','/cerezler']);
  const dynamicContent = /^\/(makale|ictihat|sozluk)\/[^/]+\/?$/.test(url.pathname);
  if (!pages.has(route) && !dynamicContent) return notFound(request, env);
  if (dynamicContent) {
    try { if (!await contentRouteExists(env,url.pathname)) return notFound(request,env); }
    catch { return json({ error: 'İçerik şu anda yüklenemiyor.' },503); }
  }
  const page = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
  return new Response(page.body, { status: page.status, headers: new Headers([...page.headers, ...Object.entries(headers())]) });
}

async function notFound(request, env) {
  const page = await env.ASSETS.fetch(new Request(new URL('/404.html',request.url),request));
  return new Response(page.body,{status:404,headers:new Headers([...page.headers,...Object.entries(headers()),['x-robots-tag','noindex']])});
}

export default {
  async fetch(request, env) {
    try { return await handle(request, env); }
    catch (error) { console.error('request failed', { path: new URL(request.url).pathname, name: error?.name || 'Error' }); return json({ error: 'İşlem tamamlanamadı.' }, 500); }
  }
};


