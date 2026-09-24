const cors = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-forwarded-for',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin'
});
const json = (body: unknown, status = 200, origin = 'null') => new Response(JSON.stringify(body), {
  status, headers: { ...cors(origin), 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const encoder = new TextEncoder();
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (request) => {
  const origin = request.headers.get('origin') || 'null';
  const projectUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY');
  if (!projectUrl || !serviceKey) return json({ error: 'İletişim formu şu anda kullanılamıyor.' }, 503, origin);
  if (!/^https:\/\//i.test(origin)) return json({ error: 'İstek doğrulanamadı.' }, 403, origin);
  try {
    const originCheck = await fetch(`${projectUrl}/rest/v1/rpc/is_site_origin_allowed`, {
      method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_origin: origin }), signal: AbortSignal.timeout(4000)
    });
    if (!originCheck.ok) return json({ error: 'İletişim formu şu anda kullanılamıyor.' }, 503, origin);
    if (await originCheck.json() !== true) return json({ error: 'İstek doğrulanamadı.' }, 403);
  } catch { return json({ error: 'İletişim formu şu anda kullanılamıyor.' }, 503); }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors(origin) });
  if (request.method !== 'POST') return json({ error: 'İstek doğrulanamadı.' }, 405, origin);

  let input: Record<string, unknown>;
  try {
    if (Number(request.headers.get('content-length') || 0) > 16_384) return json({ error: 'Form bilgileri geçersiz.' }, 413, origin);
    input = await request.json();
    if (JSON.stringify(input).length > 16_384) return json({ error: 'Form bilgileri geçersiz.' }, 413, origin);
  } catch { return json({ error: 'Form bilgileri geçersiz.' }, 400, origin); }

  const text = (key: string, max: number) => typeof input[key] === 'string' ? (input[key] as string).trim().slice(0, max) : '';
  if (text('website', 200)) return json({ ok: true }, 200, origin); // honeypot: do not reveal the trap
  const name = text('name', 100), surname = text('surname', 100), email = text('email', 254);
  const phone = text('phone', 40), subject = text('subject', 160), message = text('message', 5000);
  const preference = text('contact_preference', 10) || 'email';
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10 || input.consent !== true || !['email', 'phone'].includes(preference)) {
    return json({ error: 'Lütfen gerekli alanları doğru biçimde doldurun.' }, 400, origin);
  }

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (turnstileSecret) {
    const token = text('turnstile_token', 2048);
    if (!token) return json({ error: 'Güvenlik doğrulamasını tamamlayın.' }, 400, origin);
    try {
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret: turnstileSecret, response: token }), signal: AbortSignal.timeout(5000)
      });
      const result = await verify.json();
      if (!result.success) return json({ error: 'Güvenlik doğrulaması başarısız oldu.' }, 400, origin);
    } catch { return json({ error: 'Güvenlik doğrulaması şu anda kullanılamıyor.' }, 503, origin); }
  }

  try {
    const day = new Date().toISOString().slice(0, 10);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unavailable';
    const ipHash = await sha256(`${day}:${ip}`); // daily pseudonym; raw IP is never persisted
    const response = await fetch(`${projectUrl}/rest/v1/rpc/create_contact_lead`, {
      method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        p_name: name, p_surname: surname, p_email: email, p_phone: phone, p_subject: subject,
        p_message: message, p_preference: preference, p_consent_at: new Date().toISOString(), p_ip_hash: ipHash
      }), signal: AbortSignal.timeout(7000)
    });
    if (response.status === 429 || response.status === 409) return json({ error: 'Kısa sürede çok fazla mesaj gönderildi. Lütfen daha sonra tekrar deneyin.' }, 429, origin);
    if (!response.ok) {
      const failure = await response.text();
      if (/rate limit exceeded/i.test(failure)) return json({ error: 'Kısa sürede çok fazla mesaj gönderildi. Lütfen daha sonra tekrar deneyin.' }, 429, origin);
      return json({ error: 'Mesajınız şu anda iletilemedi.' }, 503, origin);
    }

    const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (telegramToken) {
      try {
        const chatResponse = await fetch(`${projectUrl}/rest/v1/rpc/get_telegram_chat_id`, {
          method: 'POST', headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' },
          body: '{}', signal: AbortSignal.timeout(3000)
        });
        const chatId = chatResponse.ok ? await chatResponse.json() : null;
        if (chatId) await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: 'Web sitesine yeni bir iletişim talebi geldi. Yönetim panelinden inceleyin.', disable_web_page_preview: true }),
          signal: AbortSignal.timeout(4000)
        });
      } catch { /* the saved contact request remains successful if notification fails */ }
    }
    return json({ ok: true }, 200, origin);
  } catch {
    return json({ error: 'Mesajınız şu anda iletilemedi. Lütfen daha sonra tekrar deneyin.' }, 503, origin);
  }
});

