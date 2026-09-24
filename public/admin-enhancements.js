const SECTION_CATALOG = [
  { key: 'hero', label: 'Giriş alanı', title: 'Hukuku anlamak, dikkatle düşünmek.', content: 'Hukuk üzerine araştırmalar, açıklamalar ve değerlendirmeler. Bilgiyi özenle incelemek ve anlaşılır biçimde paylaşmak için.' },
  { key: 'intro', label: 'Çalışma biçimi', title: 'Her iyi değerlendirme, iyi bir soruyla başlar.', content: 'Kaynağa dönmek, kavramları yerli yerine koymak ve farklı bakış açılarını birlikte değerlendirmek.' },
  { key: 'articles', label: 'Seçilmiş çalışmalar', title: 'Fikirden incelemeye.', content: 'Yayımlanmış makaleler burada gösterilir.' },
  { key: 'library', label: 'Bilgi merkezi', title: 'Bilgiye giden kısa yollar.', content: 'Kavramlar, yargı kararları ve sık sorulan sorular arasında keşfe çıkın.' },
  { key: 'profile', label: 'Hakkımda', title: 'Merakla başlayan, özenle sürdürülen.', content: 'Ben Ahmet Ali Ünal, stajyer avukatım. Bu alan; hukuk üzerine araştırmalarımı, düşüncelerimi ve genel bilgilendirici yazılarımı paylaşmak için oluşturuldu.' },
  { key: 'principles', label: 'Yayın ilkeleri', title: 'Yayın ilkeleri', content: 'Kaynağa bağlılık, açık anlatım ve sorumlu yayın.' },
  { key: 'contact', label: 'İletişim', title: 'Bir konu üzerine konuşalım.', content: 'İçerik, araştırma veya genel iletişim için mesaj bırakabilirsiniz. Lütfen form üzerinden gizli, hassas veya süreye bağlı hukuki bilgi göndermeyin.' }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const inform = (message) => {
  const box = $('#notice');
  if (!box) return;
  box.textContent = message;
  box.classList.add('visible');
  setTimeout(() => box.classList.remove('visible'), 3400);
};

const platformReady = window.platformReady || new Promise((resolve) => window.addEventListener('platform:ready', (event) => resolve(event.detail.client), { once: true }));
initTheme();
const client = await platformReady;

if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
  observeAdminShell(client);
} else {
  applyPublicSettings(client);
}

function observeAdminShell(db) {
  const mount = async () => {
    if (!$('.admin-layout') || $('#admin-mode-toggle')) return;
    const { data: { user } } = await db.auth.getUser();
    if (user) mountAdmin({ user });
  };
  const observer = new MutationObserver(() => { void mount(); });
  observer.observe(document.body, { childList: true, subtree: true });
  void mount();
}

function initTheme() {
  const stored = localStorage.getItem('aaun-site-theme') === 'night' ? 'night' : 'paper';
  setTheme(stored);
  $$('[data-theme-toggle], #theme-toggle').forEach((button) => button.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'night' ? 'paper' : 'night')));
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('aaun-site-theme', theme);
  $$('[data-theme-toggle], #theme-toggle').forEach((button) => {
    const dark = theme === 'night';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Açık temaya geç' : 'Koyu temaya geç');
    const label = button.querySelector('[data-theme-label]');
    if (label) label.textContent = dark ? 'Koyu görünüm' : 'Açık görünüm';
  });
}

async function applyPublicSettings(db) {
  if (location.pathname !== '/') return;
  try {
    const [{ data: settings }, { data: sections }] = await Promise.all([
      db.from('site_settings').select('site_name,profession,headline,description,contact_email,contact_phone,city,social_links,seo_defaults').eq('id', true).maybeSingle(),
      db.from('homepage_sections').select('section_key,title,subtitle,content,is_visible,sort_order,settings').order('sort_order')
    ]);
    if (settings) applyIdentity(settings);
    if (sections?.length) applyHomepageSections(sections);
  } catch {
    // Public defaults are complete; editable settings apply after the public-read migration is installed.
  }
}

function applyIdentity(settings) {
  const siteName = settings.site_name || 'Ahmet Ali Ünal';
  const profession = settings.profession || 'Stajyer Avukat';
  document.title = `${siteName} — Hukuk, araştırma ve düşünce`;
  const schema = $('#website-schema');
  if (schema) {
    try {
      const data = JSON.parse(schema.textContent);
      data.name = siteName;
      data.author = { ...data.author, name: siteName, jobTitle: profession };
      if (settings.site_url) data.url = settings.site_url;
      if (settings.description) data.description = settings.description;
      schema.textContent = JSON.stringify(data);
    } catch { /* Keep the static schema if the existing JSON cannot be parsed. */ }
  }
  const mark = $('.site-header .wordmark > span:last-child');
  if (mark) mark.firstChild.textContent = siteName;
  const role = $('.hero-foot span:last-child');
  if (role) role.textContent = profession;
  if (settings.headline) setPlainTitle($('.hero [data-title-target]'), settings.headline);
  if (settings.description) $('.hero [data-copy-target]')?.replaceChildren(document.createTextNode(settings.description));
  const email = settings.contact_email;
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const field = $('#contact-form [name="email"]');
    if (field) field.placeholder = email;
  }
}

function setPlainTitle(node, text) {
  if (!node || !text) return;
  node.textContent = text;
  node.style.whiteSpace = 'pre-line';
}

function applyHomepageSections(rows) {
  const byKey = new Map(rows.map((row) => [row.section_key, row]));
  for (const [key, row] of byKey) {
    const section = $(`[data-section-key="${CSS.escape(key)}"]`);
    if (!section) continue;
    section.hidden = !row.is_visible;
    const title = $('[data-title-target]', section);
    const content = $('[data-copy-target]', section);
    if (row.title) setPlainTitle(title, row.title);
    if (row.content) content?.replaceChildren(document.createTextNode(row.content));
    if (row.subtitle && key === 'articles') {
      const eyebrow = $('.section-heading .eyebrow', section);
      if (eyebrow) eyebrow.textContent = row.subtitle;
    }
  }
  const main = $('#main');
  const ordered = SECTION_CATALOG.map((item, index) => ({ node: main?.querySelector('[data-section-key="' + item.key + '"]'), position: byKey.get(item.key)?.sort_order ?? index, fallback: index })).filter((entry) => entry.node).sort((a, b) => a.position - b.position || a.fallback - b.fallback);
  for (const entry of ordered) main?.append(entry.node);
}

function mountAdmin({ user }) {
  const root = $('#admin-root');
  const nav = $('.admin-nav');
  const topline = $('.admin-topline');
  if (!root || !nav || !topline || $('#admin-mode-toggle')) return;

  const controls = document.createElement('div');
  controls.className = 'admin-controls';
  controls.innerHTML = `<button class="small-button" id="admin-mode-toggle" type="button" aria-pressed="false">Geliştirici Moduna Geç</button><button class="small-button" id="admin-command-open" type="button" aria-keyshortcuts="Control+K Meta+K">Hızlı geçiş <kbd>Ctrl K</kbd></button><button class="small-button" data-theme-toggle type="button" aria-pressed="false"><span data-theme-label>Açık görünüm</span></button>`;
  topline.append(controls);
  const adminTheme = $('[data-theme-toggle]', controls);
  adminTheme.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'night' ? 'paper' : 'night'));
  setTheme(localStorage.getItem('aaun-site-theme') === 'night' ? 'night' : 'paper');

  for (const button of $$('button[data-section="caselaw"], button[data-section="glossary"], button[data-section="faq"], button[data-section="logs"]', nav)) button.classList.add('developer-only');
  const extraNav = [
    ['site', 'Site görünümü', '◈', false],
    ['seo', 'SEO incelemesi', '⌕', true],
    ['ai-history', 'AI geçmişi', '✳', true],
    ['trash', 'Çöp kutusu', '↺', true],
    ['system', 'Sistem durumu', '◉', true]
  ];
  for (const [section, label, icon, developerOnly] of extraNav) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.enhancementSection = section;
    button.className = developerOnly ? 'developer-only' : '';
    button.innerHTML = `<span class="nav-icon" aria-hidden="true">${icon}</span>${label}`;
    nav.append(button);
    button.addEventListener('click', () => {
      $$('.admin-nav button').forEach((item) => item.classList.toggle('active', item === button));
      renderEnhancedSection(section, client, user);
    });
  }

  let mode = localStorage.getItem(`aaun-admin-mode:${user.id}`) === 'developer' ? 'developer' : 'simple';
  const modeButton = $('#admin-mode-toggle');
  const applyMode = () => {
    document.body.dataset.adminMode = mode;
    modeButton.setAttribute('aria-pressed', String(mode === 'developer'));
    modeButton.textContent = mode === 'developer' ? 'Basit Moda Dön' : 'Geliştirici Moduna Geç';
    $$('.developer-only').forEach((button) => { button.hidden = mode !== 'developer'; });
    if (mode === 'simple' && $('.admin-nav button.active.developer-only')) $('.admin-nav button[data-section="overview"]')?.click();
  };
  modeButton.addEventListener('click', () => {
    mode = mode === 'simple' ? 'developer' : 'simple';
    localStorage.setItem(`aaun-admin-mode:${user.id}`, mode);
    applyMode();
    inform(mode === 'developer' ? 'Geliştirici araçları açıldı.' : 'Basit moda dönüldü.');
  });
  applyMode();

  mountCommandPalette(user);
  initAdminAutosave(user);
  document.addEventListener('click', handleEditorReady, { capture: true });
}

function adminView(kicker, title, subtitle, content) {
  const target = $('#admin-view');
  if (!target) return;
  $('#current-label').textContent = title;
  target.innerHTML = `<header class="admin-heading"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div></header>${content}`;
}

function panel(title, content) {
  return `<section class="admin-panel"><h2>${esc(title)}</h2>${content}</section>`;
}

async function renderEnhancedSection(section, db, user) {
  if (section === 'site') return siteEditor(db);
  if (section === 'seo') return seoCenter(db, user);
  if (section === 'ai-history') return aiHistory(db);
  if (section === 'trash') return trashCenter(db);
  if (section === 'system') return systemCenter(db);
}

async function siteEditor(db) {
  adminView('Yayın ve tasarım', 'Site görünümü', 'Ad, kısa açıklama ve ana sayfa bölümlerini buradan güncelleyin.', '<p class="empty-state">Ayarlar yükleniyor…</p>');
  const [{ data: settings, error: settingsError }, { data: rows, error: sectionsError }] = await Promise.all([
    db.from('site_settings').select('*').eq('id', true).maybeSingle(),
    db.from('homepage_sections').select('*').order('sort_order')
  ]);
  if (settingsError || sectionsError) {
    $('#admin-view').insertAdjacentHTML('beforeend', panel('Ayarları açamadım', '<p>Bağlantıyı yenileyin. Sorun sürerse geliştirici modundaki sistem durumunu inceleyin.</p>'));
    return;
  }
  const value = settings || {};
  $('#admin-view').innerHTML = `${$('#admin-view').firstElementChild.outerHTML}
    ${panel('Site kimliği', `<form id="site-settings-form" class="admin-form"><label>Site adı<input name="site_name" maxlength="120" value="${esc(value.site_name || 'Ahmet Ali Ünal')}" required></label><label>Mesleki statü<input name="profession" maxlength="120" value="${esc(value.profession || 'Stajyer Avukat')}" required></label><label>Ana başlık<input name="headline" maxlength="180" value="${esc(value.headline || 'Hukuku anlamak, analiz etmek ve paylaşmak.')}" required></label><label>Kısa açıklama<textarea name="description" maxlength="500">${esc(value.description || '')}</textarea></label><label>Şehir<input name="city" maxlength="100" value="${esc(value.city || '')}" placeholder="İsteğe bağlı"></label><label>İletişim e-postası<input name="contact_email" type="email" maxlength="254" value="${esc(value.contact_email || '')}" placeholder="İsteğe bağlı"></label><label>İletişim telefonu<input name="contact_phone" type="tel" maxlength="40" value="${esc(value.contact_phone || '')}" placeholder="İsteğe bağlı"></label><button class="button button-dark">Kimliği kaydet <span>→</span></button><p class="admin-message" id="site-settings-message" role="status"></p></form>`)}
    ${panel('Ana sayfa bölümleri', `<p class="admin-hint">Bir bölümü gizlemek onu silmez. Başlık ve açıklamalar yayımdan önce önizlemede tekrar kontrol edilebilir.</p><div class="section-editor-list" id="section-editor-list"></div><form class="admin-toolbar section-add-form" id="section-add-form"><label for="section-add-key">Düzenlenebilir bölümü ekle</label><select id="section-add-key" class="admin-field"></select><button class="small-button" type="submit">Bölümü ekle</button></form>`)}
    ${panel('Değişiklik önizlemesi', '<p>Kaydettiğiniz değişiklikler ana sayfada, bu ayarları ziyaretçilere göstermeye izin veren Supabase politikası kurulduktan sonra görünür. Mevcut görünüm: açık renkli editoryal tema.</p>')}`;
  $('#site-settings-form').addEventListener('submit', (event) => saveSiteSettings(event, db));
  renderSectionEditor(rows || [], db);
  populateSectionChoices(rows || []);
  $('#section-add-form').addEventListener('submit', (event) => addHomepageSection(event, db, rows || []));
}

async function saveSiteSettings(event, db) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = Object.fromEntries(new FormData(form));
  payload.id = true;
  const { error } = await db.from('site_settings').upsert(payload, { onConflict: 'id' });
  $('#site-settings-message').textContent = error ? 'Ayarlar kaydedilemedi. Erişim politikasını kontrol edin.' : 'Site kimliği kaydedildi.';
}

function renderSectionEditor(rows, db) {
  const root = $('#section-editor-list');
  root.replaceChildren();
  const byKey = new Map(rows.map((row) => [row.section_key, row]));
  const sorted = [...SECTION_CATALOG].sort((a, b) => (byKey.get(a.key)?.sort_order ?? SECTION_CATALOG.indexOf(a)) - (byKey.get(b.key)?.sort_order ?? SECTION_CATALOG.indexOf(b)));
  for (const item of sorted) {
    const row = byKey.get(item.key);
    const card = document.createElement('article');
    card.className = 'section-editor-card';
    if (!row) {
      card.innerHTML = `<div><strong>${esc(item.label)}</strong><p>Henüz düzenlenebilir kayıt yok.</p></div><button class="small-button" type="button" data-add-section="${esc(item.key)}">Düzenlenebilir yap</button>`;
      card.querySelector('[data-add-section]').addEventListener('click', async () => {
        const { error } = await db.from('homepage_sections').insert({ section_key: item.key, title: item.title, subtitle: '', content: item.content, is_visible: true, sort_order: SECTION_CATALOG.indexOf(item), settings: {} });
        if (error) return inform('Bölüm kaydı eklenemedi.');
        await siteEditor(db);
        inform(`${item.label} artık düzenlenebilir.`);
      });
    } else {
      card.innerHTML = `<div class="section-editor-title"><strong>${esc(item.label)}</strong><label class="switch-row"><input type="checkbox" data-section-visible ${row.is_visible ? 'checked' : ''}><span>Yayında</span></label></div><form class="admin-form section-edit-form"><label>Başlık<input name="title" value="${esc(row.title)}" maxlength="180"></label><label>Açıklama<textarea name="content" rows="3" maxlength="3000">${esc(row.content)}</textarea></label><div class="section-editor-actions"><button class="small-button" type="button" data-move="up" aria-label="Yukarı taşı">↑</button><button class="small-button" type="button" data-move="down" aria-label="Aşağı taşı">↓</button><button class="small-button" type="submit">Kaydet</button><span class="admin-message" role="status"></span></div></form>`;
      card.querySelector('[data-section-visible]').addEventListener('change', async (event) => {
        const { error } = await db.from('homepage_sections').update({ is_visible: event.currentTarget.checked }).eq('id', row.id);
        if (error) { event.currentTarget.checked = !event.currentTarget.checked; inform('Görünürlük değiştirilemedi.'); return; }
        inform(event.currentTarget.checked ? 'Bölüm görünür oldu.' : 'Bölüm gizlendi.');
      });
      const form = card.querySelector('form');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const { error } = await db.from('homepage_sections').update({ title: data.title.trim(), content: data.content.trim() }).eq('id', row.id);
        form.querySelector('.admin-message').textContent = error ? 'Kaydedilemedi.' : 'Kaydedildi.';
      });
      card.querySelectorAll('[data-move]').forEach((button) => button.addEventListener('click', () => moveSection(rows, row, button.dataset.move, db)));
    }
    root.append(card);
  }
}

function populateSectionChoices(rows) {
  const select = $('#section-add-key');
  if (!select) return;
  const used = new Set(rows.map((row) => row.section_key));
  for (const item of SECTION_CATALOG.filter((entry) => !used.has(entry.key))) {
    const option = document.createElement('option'); option.value = item.key; option.textContent = item.label; select.append(option);
  }
  if (!select.options.length) {
    const option = document.createElement('option'); option.textContent = 'Tüm temel bölümler düzenlenebilir'; option.disabled = true; select.append(option);
    $('#section-add-form button').disabled = true;
  }
}

async function addHomepageSection(event, db, rows) {
  event.preventDefault();
  const item = SECTION_CATALOG.find((entry) => entry.key === $('#section-add-key').value);
  if (!item || rows.some((row) => row.section_key === item.key)) return;
  const { error } = await db.from('homepage_sections').insert({ section_key: item.key, title: item.title, subtitle: '', content: item.content, is_visible: true, sort_order: SECTION_CATALOG.indexOf(item), settings: {} });
  if (error) return inform('Bölüm kaydı eklenemedi.');
  await siteEditor(db);
  inform('Bölüm eklendi.');
}

async function moveSection(rows, row, direction, db) {
  const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  const index = ordered.findIndex((item) => item.id === row.id);
  const target = index + (direction === 'up' ? -1 : 1);
  if (target < 0 || target >= ordered.length) return;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  const results = await Promise.all(ordered.map((item, position) => db.from('homepage_sections').update({ sort_order: position }).eq('id', item.id)));
  if (results.some((result) => result.error)) return inform('Bölüm sırası kaydedilemedi.');
  await siteEditor(db);
}

async function seoCenter(db, user) {
  adminView('Görünürlük', 'SEO incelemesi', 'Gerçek yayımlanmış makaleleri kontrol eder. Ziyaret veya sıralama verisi üretmez.', `${panel('Son incelemeler', '<div id="seo-results" class="empty-state">İçerik denetimi çalıştırılmadı.</div>')}<button class="button button-dark" id="run-seo-audit" type="button">Yayımlanmış makaleleri incele <span>⌕</span></button>`);
  $('#run-seo-audit').addEventListener('click', () => runSeoAudit(db, user));
  const { data } = await db.from('seo_audits').select('entity_type,score,findings,audited_at').order('audited_at', { ascending: false }).limit(8);
  if (data?.length) renderSeoResults(data, $('#seo-results'));
}

async function runSeoAudit(db, user) {
  const root = $('#seo-results');
  root.textContent = 'Makaleler inceleniyor…';
  const { data, error } = await db.from('articles').select('id,title,slug,excerpt,content,seo_title,seo_description,canonical,status,deleted_at').eq('status', 'published').is('deleted_at', null).limit(500);
  if (error) { root.textContent = 'Makaleler okunamadı. Yetki veya bağlantıyı kontrol edin.'; return; }
  if (!data?.length) { root.textContent = 'Yayımlanmış makale yok; denetim için içerik yayımlanınca tekrar çalıştırın.'; return; }
  const rows = data.map((article) => {
    const findings = [];
    const title = (article.seo_title || article.title || '').trim();
    const description = (article.seo_description || article.excerpt || '').trim();
    let score = 100;
    if (!title) { findings.push({ level: 'error', message: 'Başlık eksik.' }); score -= 25; }
    else if (title.length > 60) { findings.push({ level: 'suggestion', message: `Başlık ${title.length} karakter; kısaltmayı değerlendirin.` }); score -= 10; }
    if (!description) { findings.push({ level: 'error', message: 'Arama açıklaması ve özet boş.' }); score -= 25; }
    else if (description.length < 80 || description.length > 160) { findings.push({ level: 'suggestion', message: `Açıklama ${description.length} karakter; arama görünümünde kısalabilir veya zayıf kalabilir.` }); score -= 10; }
    if ((article.content || '').trim().length < 500) { findings.push({ level: 'suggestion', message: 'İçerik kısa; kapsam ve kaynakları gözden geçirin.' }); score -= 15; }
    if (!article.canonical) findings.push({ level: 'info', message: 'Ayrı canonical adresi tanımlı değil; varsayılan adres kullanılır.' });
    if (!findings.length) findings.push({ level: 'good', message: 'Temel başlık ve açıklama kontrolleri tamam.' });
    return { entity_type: 'article', entity_id: article.id, score: Math.max(0, score), findings, audited_by: user.id };
  });
  const { error: saveError } = await db.from('seo_audits').insert(rows);
  if (saveError) { root.textContent = 'Denetim tamamlandı ancak rapor kaydedilemedi.'; return; }
  renderSeoResults(rows.map((row) => ({ ...row, audited_at: new Date().toISOString() })), root);
}

function renderSeoResults(rows, root) {
  if (!root) return;
  root.className = '';
  root.innerHTML = `<div class="seo-summary">${rows.length} gerçek denetim kaydı</div><div class="seo-audit-list">${rows.map((row) => `<article class="seo-audit-card"><div><strong>${Number(row.score)}/100</strong><span>${new Date(row.audited_at).toLocaleString('tr-TR')}</span></div><ul>${(row.findings || []).map((item) => `<li class="finding-${esc(item.level)}">${esc(item.message)}</li>`).join('')}</ul></article>`).join('')}</div>`;
}

async function aiHistory(db) {
  adminView('AI Studio', 'AI geçmişi', 'Daha önce oluşturulan AI taslaklarını ve durumlarını görüntüleyin.', '<div class="admin-panel" id="ai-history-list">Geçmiş yükleniyor…</div>');
  const { data, error } = await db.from('ai_generations').select('id,task,input,output,status,model,created_at').order('created_at', { ascending: false }).limit(50);
  const root = $('#ai-history-list');
  if (error) { root.textContent = 'AI geçmişi yüklenemedi.'; return; }
  if (!data?.length) { root.className = 'admin-panel empty-state'; root.textContent = 'Henüz kaydedilmiş AI taslağı yok.'; return; }
  root.innerHTML = `<h2>Son ${data.length} işlem</h2><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>İşlem</th><th>Durum</th><th>Model</th><th>Tarih</th><th></th></tr></thead><tbody>${data.map((row) => `<tr><td>${esc(row.task)}</td><td>${esc(row.status)}</td><td>${esc(row.model || '—')}</td><td>${new Date(row.created_at).toLocaleString('tr-TR')}</td><td><button type="button" data-ai-view="${row.id}">Taslağı görüntüle</button></td></tr>`).join('')}</tbody></table></div><pre class="ai-history-output" id="ai-history-output" hidden></pre>`;
  $$('[data-ai-view]', root).forEach((button) => button.addEventListener('click', () => {
    const row = data.find((item) => item.id === button.dataset.aiView);
    const output = $('#ai-history-output', root);
    output.hidden = false;
    output.textContent = row?.output || 'Bu işlem için saklanmış bir çıktı yok.';
  }));
}

async function trashCenter(db) {
  adminView('Güvenli geri dönüş', 'Çöp kutusu', 'Arşivlenen içerikleri geri getir. Geri yüklenen içerik taslak durumunda açılır.', '<div class="admin-panel" id="trash-list">Arşivlenen içerikler aranıyor…</div>');
  const tables = [
    ['articles', 'title'], ['caselaw', 'title'], ['glossary_terms', 'term'], ['faq', 'question']
  ];
  const results = await Promise.all(tables.map(async ([table, labelField]) => {
    const { data, error } = await db.from(table).select(`id,${labelField},deleted_at,status`).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(50);
    return { table, data: error ? [] : data || [] };
  }));
  const entries = results.flatMap(({ table, data }) => data.map((row) => ({ ...row, table, label: row.title || row.term || row.question })))
    .sort((a, b) => new Date(b.deleted_at) - new Date(a.deleted_at));
  const root = $('#trash-list');
  if (!entries.length) { root.className = 'admin-panel empty-state'; root.textContent = 'Geri getirilecek arşiv kaydı yok.'; return; }
  root.innerHTML = `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>İçerik</th><th>Tür</th><th>Arşiv tarihi</th><th></th></tr></thead><tbody>${entries.map((row) => `<tr><td>${esc(row.label)}</td><td>${esc(row.table)}</td><td>${new Date(row.deleted_at).toLocaleString('tr-TR')}</td><td><button type="button" data-restore="${row.id}" data-table="${row.table}">Taslaklara geri getir</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('[data-restore]', root).forEach((button) => button.addEventListener('click', async () => {
    const payload = { status: 'draft', deleted_at: null };
    if (button.dataset.table === 'faq') payload.published = false;
    const { error } = await db.from(button.dataset.table).update(payload).eq('id', button.dataset.restore);
    if (error) { inform('Kayıt geri getirilemedi.'); return; }
    await trashCenter(db);
    inform('İçerik taslaklara geri getirildi.');
  }));
}

async function systemCenter(db) {
  adminView('Sistem sağlığı', 'Sistem durumu', 'Her satır gerçek bir Supabase tablosuna yapılan okuma denemesini gösterir.', '<div class="admin-panel" id="system-table-status">Bağlantılar kontrol ediliyor…</div>');
  const tables = ['profiles', 'site_settings', 'homepage_sections', 'articles', 'caselaw', 'glossary_terms', 'faq', 'leads', 'admin_audit_logs', 'seo_audits', 'ai_generations', 'content_versions'];
  const results = await Promise.all(tables.map(async (table) => {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    return { table, count: count ?? null, ok: !error };
  }));
  const root = $('#system-table-status');
  root.className = 'admin-panel';
  root.innerHTML = `<h2>${results.every((row) => row.ok) ? 'Veritabanı erişimi normal' : 'Bazı tablo kontrolleri başarısız'}</h2><div class="health-list">${results.map((row) => `<div class="health-row"><span class="health-dot ${row.ok ? 'is-ok' : 'is-error'}" aria-hidden="true"></span><span>${esc(row.table)}</span><strong>${row.ok ? `${row.count} kayıt` : 'Erişim sorunu'}</strong></div>`).join('')}</div><p class="admin-hint">Bu kontrol Edge Function, Telegram, Gemini veya ziyaretçi trafiğini test etmez.</p>`;
}

function mountCommandPalette(user) {
  const dialog = document.createElement('dialog');
  dialog.className = 'command-dialog';
  dialog.id = 'admin-command-dialog';
  dialog.innerHTML = `<form method="dialog"><label for="admin-command-search">Nereye gitmek istiyorsunuz?</label><input id="admin-command-search" type="search" autocomplete="off" placeholder="Yazı, SEO, site ayarı…"><button class="small-button" value="close">Kapat</button></form><nav aria-label="Hızlı geçiş" id="admin-command-results"></nav>`;
  document.body.append(dialog);
  const items = [
    ['Genel bakış', '.admin-nav [data-section="overview"]'], ['Makaleler', '.admin-nav [data-section="articles"]'], ['Profil', '.admin-nav [data-section="profile"]'], ['Mesajlar', '.admin-nav [data-section="leads"]'], ['AI Studio', '.admin-nav [data-section="ai"]'], ['Site görünümü', '.admin-nav [data-enhancement-section="site"]'], ['SEO incelemesi', '.admin-nav [data-enhancement-section="seo"]'], ['AI geçmişi', '.admin-nav [data-enhancement-section="ai-history"]'], ['Çöp kutusu', '.admin-nav [data-enhancement-section="trash"]'], ['Sistem durumu', '.admin-nav [data-enhancement-section="system"]']
  ];
  const results = $('#admin-command-results', dialog);
  const input = $('#admin-command-search', dialog);
  const render = () => {
    const query = input.value.toLocaleLowerCase('tr-TR').trim();
    results.replaceChildren();
    for (const [label, selector] of items.filter(([label, selector]) => label.toLocaleLowerCase('tr-TR').includes(query) && !$(selector)?.hidden)) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', () => { $(selector)?.click(); dialog.close(); });
      results.append(button);
    }
  };
  input.addEventListener('input', render);
  $('#admin-command-open').addEventListener('click', () => { dialog.showModal(); input.value = ''; render(); input.focus(); });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#admin-command-open').click(); }
  });
}

function initAdminAutosave(user) {
  window.currentAdminId = user.id;
  const prefix = `aaun-draft:${user.id}:`;
  document.addEventListener('input', (event) => {
    const form = event.target.closest('#edit-content');
    if (!form) return;
    const kind = editorKind(form);
    const id = form.elements.id?.value || 'new';
    const data = Object.fromEntries(new FormData(form));
    data.savedAt = new Date().toISOString();
    sessionStorage.setItem(prefix + kind + ':' + id, JSON.stringify(data));
    let notice = $('.autosave-note', form);
    if (!notice) { notice = document.createElement('small'); notice.className = 'autosave-note'; form.prepend(notice); }
    notice.textContent = 'Taslak bu sekmede otomatik kaydediliyor.';
  });
}

function editorKind(form) {
  return form.dataset.contentKind || (form.elements.term ? 'glossary' : form.elements.question ? 'faq' : form.elements.court ? 'caselaw' : 'articles');
}

function handleEditorReady(event) {
  const button = event.target.closest('[data-edit], #new-content');
  if (!button) return;
  setTimeout(() => {
    const form = $('#edit-content');
    if (!form || form.dataset.recoveryChecked) return;
    form.dataset.recoveryChecked = 'true';
    const kind = editorKind(form);
    const id = form.elements.id?.value || 'new';
    const user = $('.admin-user')?.textContent || 'admin';
    const storedUser = Object.keys(sessionStorage).find((key) => key.startsWith('aaun-draft:' + window.currentAdminId + ':') && key.endsWith(':' + kind + ':' + id));
    if (!storedUser) return;
    try {
      const draft = JSON.parse(sessionStorage.getItem(storedUser));
      const recovered = document.createElement('div'); recovered.className = 'draft-recovery';
      recovered.innerHTML = `<span>Bu içerik için ${new Date(draft.savedAt).toLocaleTimeString('tr-TR')} saatinde bir tarayıcı taslağı bulundu.</span><button type="button" class="small-button">Taslağı geri yükle</button><button type="button" class="small-button" aria-label="Taslağı sil">Kapat</button>`;
      form.prepend(recovered);
      const [restore, dismiss] = recovered.querySelectorAll('button');
      restore.addEventListener('click', () => {
        for (const [name, value] of Object.entries(draft)) if (name !== 'id' && name !== 'savedAt' && form.elements[name]) form.elements[name].value = value;
        recovered.remove();
      });
      dismiss.addEventListener('click', () => { sessionStorage.removeItem(storedUser); recovered.remove(); });
    } catch { sessionStorage.removeItem(storedUser); }
  }, 0);
}

