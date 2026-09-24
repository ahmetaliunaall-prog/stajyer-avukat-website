const PROJECT_URL = Deno.env.get('SUPABASE_URL') || '';
const PUBLISHABLE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
const CRON_SECRET = Deno.env.get('SEO_AUTOPILOT_SECRET') || '';

function response(body: unknown, status = 200, origin = '') {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'vary': 'Origin'
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-headers'] = 'authorization, apikey, content-type, x-autopilot-secret';
    headers['access-control-allow-methods'] = 'POST, OPTIONS';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function siteOriginAllowed(origin: string) {
  if (!origin || !PROJECT_URL || !SERVICE_KEY) return false;
  const result = await fetch(PROJECT_URL + '/rest/v1/rpc/is_site_origin_allowed', {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      authorization: 'Bearer ' + SERVICE_KEY,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ p_origin: origin }),
    signal: AbortSignal.timeout(4000)
  });
  return result.ok && await result.json() === true;
}

function constantTimeMatches(provided: string, expected: string) {
  const left = new TextEncoder().encode(provided);
  const right = new TextEncoder().encode(expected);
  let difference = left.length ^ right.length;
  const size = Math.max(left.length, right.length);
  for (let i = 0; i < size; i++) difference |= (left[i] || 0) ^ (right[i] || 0);
  return difference === 0;
}

async function adminUserId(token: string) {
  if (!token || !PROJECT_URL || !PUBLISHABLE_KEY) return '';
  const userResponse = await fetch(PROJECT_URL + '/auth/v1/user', {
    headers: { apikey: PUBLISHABLE_KEY, authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(5000)
  });
  if (!userResponse.ok) return '';
  const user = await userResponse.json() as { id?: string };
  if (!user.id) return '';
  const params = new URLSearchParams({ select: 'role', id: 'eq.' + user.id, limit: '1' });
  const profileResponse = await fetch(PROJECT_URL + '/rest/v1/profiles?' + params, {
    headers: { apikey: PUBLISHABLE_KEY, authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(5000)
  });
  if (!profileResponse.ok) return '';
  const profiles = await profileResponse.json() as Array<{ role?: string }>;
  return profiles.some((profile) => profile.role === 'admin') ? user.id : '';
}

function articleFindings(article: Record<string, unknown>) {
  const findings: Array<{ level: string; message: string }> = [];
  const title = String(article.seo_title || article.title || '').trim();
  const description = String(article.seo_description || article.excerpt || '').trim();
  let score = 100;

  if (!title) {
    findings.push({ level: 'error', message: 'Başlık eksik.' });
    score -= 25;
  } else if (title.length > 60) {
    findings.push({ level: 'suggestion', message: 'Başlık ' + title.length + ' karakter; kısaltmayı değerlendirin.' });
    score -= 10;
  }
  if (!description) {
    findings.push({ level: 'error', message: 'Arama açıklaması ve özet boş.' });
    score -= 25;
  } else if (description.length < 80 || description.length > 160) {
    findings.push({ level: 'suggestion', message: 'Açıklama ' + description.length + ' karakter; arama görünümünde kısalabilir veya zayıf kalabilir.' });
    score -= 10;
  }
  if (String(article.content || '').trim().length < 500) {
    findings.push({ level: 'suggestion', message: 'İçerik kısa; kapsam ve kaynakları gözden geçirin.' });
    score -= 15;
  }
  if (!article.canonical) findings.push({ level: 'info', message: 'Ayrı canonical adresi tanımlı değil; varsayılan adres kullanılır.' });
  if (!findings.length) findings.push({ level: 'good', message: 'Temel başlık ve açıklama kontrolleri tamam.' });
  return { score: Math.max(0, score), findings, title, description };
}

async function run(request: Request) {
  if (!PROJECT_URL || !PUBLISHABLE_KEY || !SERVICE_KEY) return response({ error: 'SEO işlevi yapılandırılamadı.' }, 503);
  const origin = request.headers.get('origin') || '';
  if (origin && !await siteOriginAllowed(origin)) return response({ error: 'İstek doğrulanamadı.' }, 403);
  if (request.method === 'OPTIONS') {
    if (!origin) return response({ error: 'İstek doğrulanamadı.' }, 403);
    return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, apikey, content-type, x-autopilot-secret',
      'access-control-allow-methods': 'POST, OPTIONS',
      'vary': 'Origin'
    } });
  }
  if (request.method !== 'POST') return response({ error: 'Yalnızca POST isteği kabul edilir.' }, 405, origin);

  const suppliedSecret = request.headers.get('x-autopilot-secret') || '';
  const cronAuthorized = !!CRON_SECRET && constantTimeMatches(suppliedSecret, CRON_SECRET);
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const actorId = cronAuthorized ? '' : await adminUserId(bearer);
  if (!cronAuthorized && !actorId) return response({ error: 'Yalnızca site yöneticileri çalıştırabilir.' }, 401, origin);

  let body: { mode?: string };
  try {
    if (Number(request.headers.get('content-length') || 0) > 2000) return response({ error: 'İstek çok büyük.' }, 413, origin);
    body = await request.json();
  } catch {
    return response({ error: 'İstek gövdesi geçerli JSON olmalıdır.' }, 400, origin);
  }
  if (body.mode !== 'audit-and-fix') return response({ error: 'Desteklenmeyen işlem.' }, 400, origin);

  const params = new URLSearchParams({
    select: 'id,title,excerpt,content,seo_title,seo_description,canonical',
    status: 'eq.published',
    deleted_at: 'is.null',
    published_at: 'lte.' + new Date().toISOString(),
    order: 'updated_at.desc',
    limit: '250'
  });
  const rowsResponse = await fetch(PROJECT_URL + '/rest/v1/articles?' + params, {
    headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY },
    signal: AbortSignal.timeout(8000)
  });
  if (!rowsResponse.ok) return response({ error: 'Yayımlanmış makaleler okunamadı.', status: rowsResponse.status }, 502, origin);
  const articles = await rowsResponse.json() as Array<Record<string, unknown>>;
  let fixed = 0;
  const audits = [];

  for (const article of articles) {
    const review = articleFindings(article);
    audits.push({
      entity_type: 'article',
      entity_id: article.id,
      score: review.score,
      findings: review.findings,
      audited_by: actorId || null
    });
    const patch: Record<string, string> = {};
    if (!String(article.seo_title || '').trim() && review.title) patch.seo_title = review.title.slice(0, 60);
    if (!String(article.seo_description || '').trim() && review.description) patch.seo_description = review.description.slice(0, 160);
    if (!Object.keys(patch).length) continue;

    const updateParams = new URLSearchParams({ id: 'eq.' + String(article.id), status: 'eq.published', deleted_at: 'is.null' });
    const updated = await fetch(PROJECT_URL + '/rest/v1/articles?' + updateParams, {
      method: 'PATCH',
      headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(8000)
    });
    if (!updated.ok) return response({ error: 'Eksik SEO alanları kaydedilemedi.', status: updated.status, fixed }, 502, origin);
    fixed++;
  }

  if (audits.length) {
    const saved = await fetch(PROJECT_URL + '/rest/v1/seo_audits', {
      method: 'POST',
      headers: { apikey: SERVICE_KEY, authorization: 'Bearer ' + SERVICE_KEY, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(audits),
      signal: AbortSignal.timeout(8000)
    });
    if (!saved.ok) return response({ error: 'Denetim raporu kaydedilemedi.', status: saved.status, scanned: articles.length, fixed }, 502, origin);
  }

  return response({
    ok: true,
    scanned: articles.length,
    fixed,
    audited: audits.length,
    message: 'Gerçek yayımlanmış makaleler incelendi. Boş başlıklar ve açıklamalar yalnızca mevcut içerikten tamamlandı.'
  }, 200, origin);
}

Deno.serve(async (request: Request) => {
  try {
    return await run(request);
  } catch (error) {
    console.error('SEO audit failed', error instanceof Error ? error.name : 'Error');
    return response({ error: 'SEO kontrolü tamamlanamadı.' }, 500, request.headers.get('origin') || '');
  }
});

