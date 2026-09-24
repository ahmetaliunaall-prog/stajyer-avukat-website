# Ahmet Ali Ünal — kişisel hukuk platformu

Hukuk araştırmaları, yayınlar, hukuk sözlüğü ve güvenli iletişim için Cloudflare Workers ile Supabase kullanan bir platform.

## Yapı

- `public/` erişilebilir, mobil öncelikli internet sitesi ve yönetim arayüzü.
- `worker/` Cloudflare Worker; güvenlik başlıkları, sitemap, robots, yönlendirmeler ve iletişim formu geçidi.
- `supabase/migrations/` version-controlled yeni veritabanı şeması, RLS ve açıkça örnek olarak işaretlenmiş seed içerikler.
- `supabase/functions/` AI Studio ve iletişim için server-side Supabase Edge Functions.
- `tests/` Worker route, form, SEO ve güvenlik başlığı testleri.

İlk migration, mevcut uygulama şemasını temiz kurar. Supabase Auth kullanıcıları korunur; mevcut `admin_users` kayıtlarındaki hesaplar yeni `profiles` tablosuna `admin` rolüyle taşınır. Eski içerik verileri migration’a aktarılmaz. Sıfırlama öncesi dışa alınan yerel yedek kaynak koduna veya GitHub’a eklenmemelidir.

Örnek makale, içtihat, sözlük ve SSS kayıtları gerçek hukuki kaynak veya karar değildir; `is_demo` ile işaretlenir ve arayüzde örnek olarak belirtilir.

## Yerel kontrol

```sh
npm install
npm test
npm run dev
```

## Bağlantılar ve sırlar

Worker’ın `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` değişkenleri gerekir. Publishable key tarayıcıda kullanılabilir; erişim RLS ile korunur. Service-role anahtarı, `GEMINI_API_KEY` ve `TELEGRAM_BOT_TOKEN` yalnızca Supabase Edge Function secret’larında kalmalıdır. Bunları `.env`, Worker public vars, istemci kodu veya repository’ye koymayın.

AI Edge Function mevcut `GEMINI_API_KEY` değerini, iletişim bildirimi mevcut `TELEGRAM_BOT_TOKEN` değerini kullanır. Telegram sohbet kimliği veritabanı yedeğinden gizli `private.integration_settings` tablosuna aktarılır. İletişim kayıtları anonim API’den doğrudan yazılamaz; server-side işlev formu doğrular ve pseudonymous, günlük hash ile istek sınırı uygular. Turnstile siteye bağlanırsa `TURNSTILE_SECRET_KEY` Supabase Edge Function secret’ı olarak eklenebilir.

## Veritabanı

Migration `20260924000100_clean_legal_platform.sql` public uygulama tablolarını, eski işlevleri ve politikaları sıfırlar; Supabase Auth kimliklerini koruyup eski yöneticileri taşır. Sadece önceden alınmış yedek kontrol edildikten sonra uygulanmalıdır. Günlük operasyonlar `supabase/migrations` üzerinden version-control edilmelidir.

## Yayın öncesi

1. `npm test` ve `npm run deploy:dry-run` çalıştırın.
2. Supabase RLS’yi anonim ve yönetici oturumlarıyla doğrulayın.
3. Cloudflare Worker’a Supabase URL’si ve publishable key’i değişken olarak ekleyin.
4. `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` ve `TELEGRAM_BOT_TOKEN` değerlerinin Supabase Function secret’larında kaldığını doğrulayın; değerleri loglamayın.
5. Cloudflare’da Worker’ı yayınlayın, özel alan adını ve `SITE_ORIGIN` değerini yapılandırın.
6. Supabase Auth’ta sızmış parola korumasını etkinleştirin; yasal metinleri ve iletişim izinlerini yayımdan önce gözden geçirin.

Bu depo hukuki danışmanlık sunmaz. Demo içerikler doğrulanmadan gerçek hukuki kaynak, karar veya biyografi gibi yayımlanmamalıdır.

