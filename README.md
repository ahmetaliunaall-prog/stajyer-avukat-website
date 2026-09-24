# Ahmet Ali Ünal — kişisel hukuk platformu

Kişisel yayın sitesi ve yönetim alanı. Public site statik dosyalarla çalışır; güvenlik başlıkları, içerik rotaları, sitemap ve iletişim geçidi `worker/` içindeki Cloudflare Worker tarafından sağlanır. Supabase Auth ve mevcut `profiles.role = 'admin'` yetkisi kullanılır. Yeni kullanıcı veya admin hesabı oluşturulmaz.

## Proje yapısı

- `public/`: public site, admin arayüzü ve stil dosyaları.
- `public/admin-enhancements.js`: görünüm teması, site bölümleri, Basit/Geliştirici modu, SEO denetimi, geri yükleme alanı, sağlık kontrolleri ve komut paleti.
- `worker/index.js`: API geçidi, güvenlik başlıkları, sitemap, sayfa yönlendirme ve 404 davranışı.
- `scripts/build-pages.mjs`: Worker kaynağını Pages gelişmiş modunun kullandığı `public/_worker.js` dosyasına kopyalar.
- `supabase/functions/`: sunucu tarafında AI, iletişim ve SEO işlevleri.
- `supabase/migrations/`: mevcut veritabanına yönelik, dar kapsamlı ek migrations.
- `tests/`: Worker istek akışı testleri.

## Geliştirme ve kontrol

Node.js kurulu bir ortamda:

```sh
npm install
npm run check
npm run build
npm run dev
```

`npm run dev`, Pages gelişmiş modunu yerel önizlemede açar. `npm run build`, Pages'in çalıştıracağı `_worker.js` dosyasını üretir.

## Supabase ve veri güvenliği

Bu çalışma kopyası mevcut Supabase projesinin şemasına göre hazırlanmıştır; boş bir Supabase projesi için tam başlangıç şeması değildir. 24 Eylül 2026 tarihinde canlı projeye `public_site_settings_read` ve `public_content_taxonomy` migration'ları uygulandı. Bunlar herkese açık site ayarlarının okunmasını sağlar ve kategori, etiket ve makale-etiket bağlantısı okuma kurallarını yayımlanmış, tarihi gelmiş ve silinmemiş makalelerle sınırlar.

`seo-autopilot` canlı Edge Function'ı, `profiles.role = 'admin'` denetimi ve mevcut site-kaynağı izin kontrolüyle v2 sürümüne güncellendi. Function `verify_jwt=false` ayarıyla çalışır; çünkü kendi içinde yönetici oturumunu veya `SEO_AUTOPILOT_SECRET` cron başlığını doğrular. Function çalıştırıldığında yalnızca mevcut yayımlanmış içerikten eksik SEO başlık/açıklamalarını tamamlayabilir ve denetim kaydı yazabilir.

İki yönetici hesabı korundu; kullanıcı, rol ve içerik kayıtları bu güncelleme sırasında değiştirilmedi. Gemini ve Telegram secret değerleri okunmadı, değiştirilmedi veya dosyalara yazılmadı. Function ayarlarında kullanılan adlar arasında `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SITE_ORIGINS` ve isteğe bağlı SEO tetikleyicisi `SEO_AUTOPILOT_SECRET` bulunur. Secret değerlerini yalnızca Supabase Function secrets alanında saklayın.

Canlı veritabanı temizliği veya ilk kurulum gerekiyorsa, uygulama kodunu yayımlamadan önce ayrı, incelenmiş bir migration ve geri dönüş planı hazırlayın. Bu depoya eski bir `DROP ... CASCADE` temiz kurulum betiği dahil edilmemiştir.

## Cloudflare ve gizli değerler

Pages yapılandırması `wrangler.jsonc` içinde tutulur:

- **Build command:** `npm run build`
- **Build output directory:** `public`
- `SUPABASE_URL` ve `SUPABASE_PUBLISHABLE_KEY` değerleri yapılandırmada yer alır. Publishable key tarayıcıda kullanılabilir; erişim denetimini Supabase RLS yapar.
- `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN` ve Supabase service-role key'i Cloudflare'a, Worker değişkenlerine, `.env` dosyasına veya repository'ye koymayın. Bunlar Supabase Function secrets olarak kalır.

## Cloudflare Pages yayını

1. GitHub'daki kod dalını `main` ile birleştir.
2. Cloudflare Pages projesinde derleme komutunu `npm run build`, çıktı klasörünü `public` olarak ayarla.
3. Publishable Supabase ayarlarının `wrangler.jsonc` ile aynı olduğunu doğrula.
4. Yayına aldıktan sonra ana sayfayı, iletişim formunu ve admin girişini kontrol et.

Bu sürüm Cloudflare Pages'in gelişmiş Worker modunu kullanır; yalnızca statik dosya yükleyen Pages modu yeterli değildir. Kod mevcut GitHub deposunda ayrı bir dalda yayımlandı; Pages üretim yayını yapılmadı.

## Kapsam notları

Basit/Geliştirici modu, section görünürlüğü ve metin düzenleme, AI geçmişi, çöp kutusu/geri yükleme, site SEO denetimi ve mobil uyumlu paneller eklenmiştir. SEO denetimi yalnızca gerçek içerik alanlarını inceler; trafik veya sıralama verisi uydurmaz. Tam analiz akışları, görsel düzenleme, yayın takvimi, otomasyon zamanlaması, analitik sağlayıcı bağlantısı ve bütün mobil/auth kritik akışlarının uçtan uca doğrulaması bu çalışma kopyasında tamamlanmış değildir.

Hukuki içerikler yayımdan önce kaynaklarıyla doğrulanmalıdır. Site genel bilgilendirme sunar; somut hukuki danışmanlık veya sonuç garantisi verdiğini iddia etmez. Biyografi, deneyim veya mesleki iddialar doğrulanmadan eklenmemelidir.

