const cors = (origin = 'null') => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
});
const reply = (body: unknown, status = 200, origin = 'null') => new Response(JSON.stringify(body), {
  status, headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const PROJECT_URL = Deno.env.get('SUPABASE_URL') || '';
const PUBLISHABLE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || '';
async function isAllowedOrigin(origin: string) {
  const response = await fetch(`${PROJECT_URL}/rest/v1/rpc/is_site_origin_allowed`, {
    method: 'POST', headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_origin: origin }), signal: AbortSignal.timeout(4000)
  });
  if (!response.ok) throw new Error('origin check unavailable');
  return await response.json() === true;
}
const MODEL = 'gemini-3.6-flash';
const TASKS: Record<string, string> = {
  outline: 'Prepare a structured article outline with a clear question, section headings and matters the human author should verify.',
  summarize: 'Summarize only the supplied material. Clearly preserve uncertainty and scope.',
  improve: 'Improve clarity, structure and readability without changing legal meaning or adding unsupported claims.',
  seo: 'Suggest one accurate title and a concise meta description. Avoid keyword stuffing and unsupported claims.',
  faq: 'Draft a small set of useful questions and answers strictly from supplied verified material. Mark gaps for human review.',
  terms: 'Extract legal terms appearing in the supplied material and suggest concise draft definitions for human verification.',
  simplify: 'Rewrite the supplied text in plain Turkish while preserving its meaning and limitations.',
  academic: 'Improve academic tone and structure without inventing references, cases, statutes or facts.'
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || '';
  const send = (body: unknown, status = 200) => reply(body, status, origin || 'null');
  if (!origin || !PROJECT_URL || !SERVICE_KEY) return reply({ error: 'İstek doğrulanamadı.' }, 403);
  try { if (!await isAllowedOrigin(origin)) return reply({ error: 'İstek doğrulanamadı.' }, 403); }
  catch { return reply({ error: 'İstek doğrulanamadı.' }, 503); }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST') return send({ error: 'Bu istek desteklenmiyor.' }, 405);
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '');
  if (!token || !PUBLISHABLE_KEY) return send({ error: 'Oturum doğrulanamadı.' }, 401);

  try {
    const userResponse = await fetch(`${PROJECT_URL}/auth/v1/user`, {
      headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000)
    });
    if (!userResponse.ok) return send({ error: 'Oturum doğrulanamadı.' }, 401);
    const user = await userResponse.json();
    const profileResponse = await fetch(`${PROJECT_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`, {
      headers: { apikey: PUBLISHABLE_KEY, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000)
    });
    const profiles = profileResponse.ok ? await profileResponse.json() : [];
    if (!profiles.some((profile: { role: string }) => profile.role === 'admin')) return send({ error: 'Bu işlem için yönetici yetkisi gerekir.' }, 403);

    const input = await request.json();
    const task = typeof input.task === 'string' ? input.task : '';
    const prompt = typeof input.prompt === 'string' ? input.prompt.trim().slice(0, 12000) : '';
    const sources = Array.isArray(input.sources) ? input.sources.slice(0, 20).map((source: unknown) => String(source).slice(0, 500)) : [];
    if (!TASKS[task] || prompt.length < 10) return send({ error: 'İstek bilgileri geçersiz.' }, 400);

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey || !SERVICE_KEY) return send({ error: 'AI servisi şu anda yapılandırılmamış.' }, 503);
    const dayStart = new Date(); dayStart.setUTCHours(0,0,0,0);
    const usageCheck = await fetch(`${PROJECT_URL}/rest/v1/ai_generations?select=id&created_by=eq.${encodeURIComponent(user.id)}&created_at=gte.${encodeURIComponent(dayStart.toISOString())}&limit=31`, {
      headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` }, signal: AbortSignal.timeout(5000)
    });
    if (!usageCheck.ok) return send({ error: 'AI kullanım sınırı şu anda denetlenemiyor.' }, 503);
    if ((await usageCheck.json()).length >= 30) return send({ error: 'Günlük taslak sınırına ulaşıldı. Daha sonra tekrar deneyin.' }, 429);
    const system = [
      'You are a careful Turkish legal research writing assistant. Produce an unpublished draft for review by a human legal professional.',
      'Never invent legislation, court decisions, docket numbers, quotations, citations, sources, facts, qualifications or user biographical details.',
      'Use only the material supplied by the user. If a source is missing or cannot be verified, say so explicitly and mark it [KAYNAK DOĞRULANMALI].',
      'Do not give case-specific legal advice. Explain uncertainty. Avoid keyword stuffing and repetitive pages.',
      `Task: ${TASKS[task]}`,
      `User material:\n${prompt}`,
      `Sources supplied by the user (not independently verified):\n${sources.join('\n') || 'None supplied.'}`,
      'Return the draft in Turkish. Do not publish it.'
    ].join('\n\n');

    const generation = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: system }] }], generationConfig: { temperature: 0.25, maxOutputTokens: 4096 } }),
      signal: AbortSignal.timeout(45000)
    });
    if (!generation.ok) return send({ error: 'AI servisi şu anda yanıt veremiyor.' }, 502);
    const result = await generation.json();
    const output = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('').trim();
    if (!output) return send({ error: 'AI taslağı oluşturulamadı.' }, 502);

    const save = await fetch(`${PROJECT_URL}/rest/v1/ai_generations`, {
      method: 'POST', headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify({ created_by: user.id, task, input: { prompt, sources }, output, status: 'draft', source_references: sources, model: MODEL }),
      signal: AbortSignal.timeout(7000)
    });
    if (!save.ok) return send({ error: 'Taslak güvenli biçimde kaydedilemedi.' }, 503);
    const saved = await save.json();
    const usage = result?.usageMetadata || {};
    await fetch(`${PROJECT_URL}/rest/v1/ai_usage`, {
      method: 'POST', headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ actor_id: user.id, provider: 'Gemini', model: MODEL, task, input_tokens: usage.promptTokenCount ?? null, output_tokens: usage.candidatesTokenCount ?? null }),
      signal: AbortSignal.timeout(5000)
    });
    return send({ success: true, draft_id: saved?.[0]?.id, text: output, status: 'draft', model: MODEL });
  } catch {
    return send({ error: 'İstek tamamlanamadı. Lütfen daha sonra tekrar deneyin.' }, 503);
  }
});


