const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const notice = (message) => { const box = $('#notice'); if (!box) return; box.textContent = message; box.classList.add('visible'); setTimeout(() => box.classList.remove('visible'), 3400); };
const safeText = (value, fallback = '') => String(value ?? fallback);
const fold = (value) => safeText(value).toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll('ı', 'i');
const esc = (value) => safeText(value).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
let supabase;
let currentUser;
let activeAdminSection = 'overview';

async function connect() {
  const response = await fetch('/api/config', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('config unavailable');
  const config = await response.json();
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  supabase = createClient(config.supabaseUrl, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: window.sessionStorage } });
}

function articleCard(article) {
  const card = document.createElement('a');
  card.className = 'article-card'; card.href = `/makale/${encodeURIComponent(article.slug)}`;
  const meta = document.createElement('div'); meta.className = 'article-meta';
  const category = document.createElement('span'); category.textContent = article.is_demo ? 'Örnek içerik' : (article.category || 'Araştırma');
  const date = document.createElement('time'); date.dateTime = article.published_at || ''; date.textContent = article.published_at ? new Date(article.published_at).toLocaleDateString('tr-TR',{year:'numeric',month:'short'}) : 'Yayımlanmış';
  meta.append(category,date);
  const title = document.createElement('h3'); title.textContent = article.title;
  const excerpt = document.createElement('p'); excerpt.textContent = article.excerpt || '';
  const bottom = document.createElement('div'); bottom.className = 'article-bottom';
  const read = document.createElement('span'); read.textContent = `${article.reading_minutes || 1} dk okuma`;
  const arrow = document.createElement('b'); arrow.setAttribute('aria-hidden','true'); arrow.textContent = '↗';
  bottom.append(read,arrow); card.append(meta,title,excerpt,bottom); return card;
}

async function loadFeatured() {
  const target = $('#featured-articles'); if (!target || !supabase) return;
  try {
    const { data, error } = await supabase.from('articles').select('title,slug,excerpt,category,published_at,reading_minutes,is_demo').eq('status','published').is('deleted_at',null).order('published_at',{ascending:false}).limit(3);
    if (error) throw error;
    target.replaceChildren();
    if (!data?.length) { const p=document.createElement('p');p.className='loading-note';p.textContent='Yeni çalışmalar yayımlandığında burada yer alacak.';target.append(p);return; }
    data.forEach(item=>target.append(articleCard(item)));
  } catch { target.innerHTML='<p class="loading-note">Çalışmalar şu anda yüklenemiyor.</p>'; }
}

async function loadPageRoute() {
  const path = decodeURIComponent(location.pathname);
  const match = path.match(/^\/(makale|ictihat|sozluk)\/([^/]+)\/?$/);
  if (match) {
    const [,type,slug] = match;
    const table = type === 'makale' ? 'articles' : type === 'ictihat' ? 'caselaw' : 'glossary_terms';
    const {data,error}=await supabase.from(table).select('*').eq('slug',slug).eq('status','published').maybeSingle();
    if(error||!data){renderListing('Kayıt bulunamadı','İstenen içerik bulunamadı veya yayından kaldırılmış olabilir.',[]);return;}
    document.title=`${data.title||data.term} — Ahmet Ali Ünal`;
    $('meta[name="description"]').content=(data.seo_description||data.excerpt||data.short_definition||'Hukuk üzerine genel bilgilendirici içerik.').slice(0,160);
    const canonical=$('link[rel="canonical"]');canonical.href=location.origin+location.pathname;
    const main=$('#main');main.replaceChildren();
    const shell=document.createElement('article');shell.className='section-shell content-route';
    const back=document.createElement('a');back.className='text-link';back.href=type==='makale'?'/makaleler':type==='ictihat'?'/ictihatlar':'/sozluk';back.textContent='← Bilgi merkezine dön';
    const title=document.createElement('h1');title.textContent=data.title||data.term;
    const subtitle=document.createElement('p');subtitle.className='route-meta';subtitle.textContent=[data.is_demo?'Örnek içerik':null,data.category,data.published_at?new Date(data.published_at).toLocaleDateString('tr-TR'):null].filter(Boolean).join(' · ');
    const content=document.createElement('div');content.className='route-content';content.textContent=data.content||data.detailed_definition||data.short_definition||data.summary||'';
    const note=document.createElement('aside');note.className='legal-note';note.textContent='Bu içerik genel bilgilendirme amacı taşır; somut olaya ilişkin hukuki danışmanlık değildir.';
    shell.append(back,title,subtitle,content,note);main.append(shell);
    const schema=type==='makale'?{ '@context':'https://schema.org','@type':'Article',headline:data.title,description:data.seo_description||data.excerpt,datePublished:data.published_at,dateModified:data.updated_at,author:{'@type':'Person',name:'Ahmet Ali Ünal'},inLanguage:'tr-TR',mainEntityOfPage:location.origin+location.pathname}:
      type==='sozluk'?{'@context':'https://schema.org','@type':'DefinedTerm','name':data.term,'description':data.short_definition||data.detailed_definition,'inDefinedTermSet':location.origin+'/sozluk'}:
      {'@context':'https://schema.org','@type':'WebPage','name':data.title,'description':data.summary,'dateModified':data.updated_at,'inLanguage':'tr-TR'};
    const script=document.createElement('script');script.type='application/ld+json';script.textContent=JSON.stringify(schema);document.head.append(script);
    return;
  }
  const routes={
    '/makaleler':['Makaleler','Hukuk alanlarında yayımlanan araştırma ve açıklamalar.',()=>supabase.from('articles').select('*').eq('status','published').is('deleted_at',null).order('published_at',{ascending:false})],
    '/ictihatlar':['İçtihat notları','Kaynağı belirtilen karar kayıtları ve değerlendirmeler.',()=>supabase.from('caselaw').select('*').eq('status','published').is('deleted_at',null).order('decision_date',{ascending:false})],
    '/sozluk':['Hukuk sözlüğü','Hukuki terimler için açıklayıcı kısa tanımlar.',()=>supabase.from('glossary_terms').select('*').eq('status','published').is('deleted_at',null).order('term')],
    '/sss':['Sık sorulanlar','Platformun kullanımı ve genel hukuki bilgi hakkında.',()=>supabase.from('faq').select('*').eq('published',true).eq('status','published').order('sort_order')],
    '/hakkimda':['Hakkımda','Profil ve mesleki bilgiler.',async()=>({data:[],error:null})],
    '/iletisim':['İletişim','Mesajınızı ana sayfadaki güvenli iletişim formundan iletebilirsiniz.',async()=>({data:[],error:null})],
    '/kvkk':['KVKK Aydınlatma','İletişim formunda paylaştığınız bilgiler, talebinize yanıt vermek ve iletişim sürecini yürütmek amacıyla işlenir. Mesajınız, sadece yetkili yönetici hesabından görüntülenebilir. IP adresiniz veritabanında saklanmaz; istek sınırlandırması için günlük değişen bir özet kullanılır. Saklama süresi, talebin niteliğine ve yürürlükteki yükümlülüklere göre sınırlandırılır. Başvuru ve silme talepleri için iletişim sayfasını kullanabilirsiniz.',async()=>({data:[],error:null})],
    '/gizlilik':['Gizlilik','Bu platform temel işlevleri için zorunlu olmayan izleme çerezleri kullanmaz. Trafik ölçümü ancak uygun tercih ve izin mekanizması tamamlandığında etkinleştirilir.',async()=>({data:[],error:null})],
    '/cerezler':['Çerez politikası','Zorunlu olmayan analitik çerezleri varsayılan olarak kapalıdır. Tercih yönetimi yayımdan önce etkinleştirilir.',async()=>({data:[],error:null})]
  };
  const route=routes[path.replace(/\/$/,'')];if(!route)return;
  document.title=`${route[0]} — Ahmet Ali Ünal`;
  const canonical=$('link[rel="canonical"]');canonical.href=location.origin+path;$('meta[name="description"]').content=route[1].slice(0,160);
  const result=await route[2]();renderListing(route[0],route[1],result.data||[]);
}

function renderListing(titleText,description,items) {
  document.title=`${titleText} — Ahmet Ali Ünal`;$('meta[name="description"]').content=description.slice(0,160);
  const main=$('#main');main.replaceChildren();
  const section=document.createElement('section');section.className='section-shell listing-route';
  const back=document.createElement('a');back.className='text-link';back.href='/';back.textContent='← Ana sayfa';
  const eyebrow=document.createElement('p');eyebrow.className='eyebrow';eyebrow.textContent='Bilgi merkezi';
  const title=document.createElement('h1');title.textContent=titleText;
  const intro=document.createElement('p');intro.className='route-intro';intro.textContent=description;
  section.append(back,eyebrow,title,intro);
  if(titleText==='Hakkımda'){const p=document.createElement('p');p.className='route-content';p.textContent='Ahmet Ali Ünal, stajyer avukat. Eğitim, mesleki deneyim ve yayın bilgileri doğrulanmış hâliyle burada yayımlanacaktır.';section.append(p);}
  else if(Array.isArray(items)&&items.length){
    if(titleText==='Makaleler'){const grid=document.createElement('div');grid.className='article-grid listing-grid';items.forEach(item=>grid.append(articleCard(item)));section.append(grid);}
    else for(const item of items){const card=document.createElement('article');card.className='plain-result';const h=document.createElement('h2');h.textContent=item.question||item.title||item.term;card.append(h);const p=document.createElement('p');p.textContent=item.answer||item.summary||item.short_definition||item.excerpt||'';card.append(p);if(item.slug){const a=document.createElement('a');a.className='text-link';a.href=`/${titleText==='İçtihat notları'?'ictihat':titleText==='Hukuk sözlüğü'?'sozluk':'makale'}/${encodeURIComponent(item.slug)}`;a.textContent='İçeriği aç →';card.append(a);}section.append(card);}
  } else if(titleText==='İçerik bulunamadı'){const p=document.createElement('p');p.textContent='Bu sayfa burada bulunamadı.';section.append(p);}
  else if(['KVKK Aydınlatma','Gizlilik','Çerez politikası'].includes(titleText)){const p=document.createElement('p');p.className='route-content';p.textContent=description;section.append(p);}
  else if(titleText!=='İletişim'){const p=document.createElement('p');p.textContent='İçerik yayımlandığında bu alanda gösterilecektir.';section.append(p);}
  const note=document.createElement('aside');note.className='legal-note';note.textContent='Sitedeki içerikler genel bilgilendirme amaçlıdır ve hukuki danışmanlık yerine geçmez.';section.append(note);main.append(section);
}

async function submitContact(event) {
  event.preventDefault();const form=event.currentTarget;const status=$('#contact-status');const button=$('button[type="submit"]',form);status.textContent='';
  if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form));
  const payload={name:data.name,surname:data.surname||'',email:data.email,phone:data.phone||'',subject:data.subject,message:data.message,contact_preference:data.contact_preference||'email',consent:form.elements.consent.checked,website:data.website||'',turnstile_token:data['cf-turnstile-response']||''};
  button.disabled=true;button.firstChild.textContent='Gönderiliyor';
  try{const r=await fetch('/api/contact',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const answer=await r.json();if(!r.ok)throw new Error(answer.error||'Mesaj gönderilemedi.');form.reset();status.textContent='Mesajınız iletildi. Teşekkür ederim.';}
  catch{status.textContent='Mesajınız şu anda gönderilemedi. Lütfen daha sonra tekrar deneyin.';}
  finally{button.disabled=false;button.firstChild.textContent='Mesajı gönder ';}
}

function renderAdminShell() {
  document.body.className='admin-page';document.title='Yönetim paneli — Ahmet Ali Ünal';
  $('meta[name="robots"]')?.remove();const robots=document.createElement('meta');robots.name='robots';robots.content='noindex,nofollow';document.head.append(robots);
  document.body.innerHTML=`<main id="admin-root"><section class="login-shell"><div class="login-card"><a class="wordmark" href="/"><span class="mark">A<span>Ü</span></span><span>Ahmet Ali Ünal<small>Güvenli yönetim</small></span></a><p class="eyebrow">Yönetici girişi</p><h1>Tekrar hoş geldiniz.</h1><p>Yönetim alanına erişmek için hesabınızla giriş yapın.</p><form id="login-form" class="admin-form"><label>E-posta<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Parola<input name="password" type="password" autocomplete="current-password" required maxlength="128"></label><button class="button button-dark">Giriş yap <span>→</span></button><div class="admin-message" id="login-message" role="status"></div><button type="button" class="text-link" id="reset-password">Parolamı sıfırla</button></form></div></section></main>`;
  $('#login-form').addEventListener('submit',loginAdmin);$('#reset-password').addEventListener('click',resetPassword);
  supabase.auth.getSession().then(({data})=>{if(data.session)enterAdmin(data.session.user);});
  supabase.auth.onAuthStateChange((_event,session)=>{if(session?.user)enterAdmin(session.user);});
}

async function loginAdmin(event){event.preventDefault();const f=event.currentTarget;const message=$('#login-message');message.textContent='';try{const {error}=await supabase.auth.signInWithPassword({email:f.elements.email.value.trim(),password:f.elements.password.value});if(error)throw error;}catch{message.textContent='Giriş yapılamadı. Bilgileri kontrol edip tekrar deneyin.';}}
async function resetPassword(){const email=$('#login-form').elements.email.value.trim();const m=$('#login-message');if(!email){m.textContent='Parola sıfırlama bağlantısı için e-posta adresinizi yazın.';return;}const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/admin`});m.textContent=error?'İstek şu anda tamamlanamadı.':'E-posta adresi kayıtlıysa sıfırlama bağlantısı gönderildi.';}

async function enterAdmin(user){
  currentUser=user;
  const {data:profile,error}=await supabase.from('profiles').select('display_name,role').eq('id',user.id).maybeSingle();
  if(error||!profile||profile.role!=='admin'){await supabase.auth.signOut();const m=$('#login-message');if(m)m.textContent='Bu hesap yönetim paneli için yetkili değil.';return;}
  const root=$('#admin-root');if(!root)return;
  root.innerHTML=`<div class="admin-layout"><aside class="admin-sidebar"><a class="wordmark" href="/"><span class="mark">A<span>Ü</span></span><span>Yönetim<small>İçerik ve platform</small></span></a><p class="admin-label">Çalışma alanı</p><nav class="admin-nav" aria-label="Yönetim menüsü"><button data-section="overview" class="active"><span class="nav-icon">⌂</span>Genel bakış</button><button data-section="profile"><span class="nav-icon">◎</span>Profil</button><button data-section="articles"><span class="nav-icon">▤</span>Makaleler</button><button data-section="caselaw"><span class="nav-icon">§</span>İçtihatlar</button><button data-section="glossary"><span class="nav-icon">Aa</span>Hukuk sözlüğü</button><button data-section="faq"><span class="nav-icon">?</span>SSS</button><button data-section="leads"><span class="nav-icon">↗</span>CRM ve mesajlar</button><button data-section="ai"><span class="nav-icon">✳</span>AI Studio</button><button data-section="logs"><span class="nav-icon">≡</span>İşlem kayıtları</button></nav><div class="admin-sidebar-foot">İçerikler yayından önce yönetici kontrolünden geçer.<br><button id="signout" class="small-button" style="margin-top:12px">Oturumu kapat</button></div></aside><section class="admin-content"><div class="admin-topline"><span class="admin-breadcrumb">Yönetim / <b id="current-label">Genel bakış</b></span><span class="admin-user">${esc(profile.display_name||user.email||'Yönetici')}</span></div><div id="admin-view" aria-live="polite"></div></section></div>`;
  $$('.admin-nav button').forEach(button=>button.addEventListener('click',()=>{activeAdminSection=button.dataset.section;$$('.admin-nav button').forEach(item=>item.classList.toggle('active',item===button));renderAdminSection();}));
  $('#signout').addEventListener('click',async()=>{await supabase.auth.signOut();location.assign('/admin');});
  await renderAdminSection();
}

function setAdminView(markup,label){$('#admin-view').innerHTML=markup;$('#current-label').textContent=label;}
function adminHeading(kicker,title,subtitle,action=''){return `<header class="admin-heading"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></div>${action}</header>`;}
function panel(title,body){return `<section class="admin-panel"><h2>${esc(title)}</h2>${body}</section>`;}

async function renderAdminSection(){
  if(!supabase||!currentUser)return;
  const nameMap={overview:'Genel bakış',profile:'Profil',articles:'Makaleler',caselaw:'İçtihatlar',glossary:'Hukuk sözlüğü',faq:'SSS',leads:'CRM ve mesajlar',ai:'AI Studio',logs:'İşlem kayıtları'};
  const label=nameMap[activeAdminSection]||'Genel bakış';$('#current-label').textContent=label;
  if(activeAdminSection==='overview')return overview();
  if(activeAdminSection==='articles'||activeAdminSection==='caselaw'||activeAdminSection==='glossary'||activeAdminSection==='faq')return contentManager(activeAdminSection);
  if(activeAdminSection==='leads')return leadManager();
  if(activeAdminSection==='ai')return aiStudio();
  if(activeAdminSection==='profile')return profileManager();
  if(activeAdminSection==='logs')return logsManager();
}

async function count(table,filters=[]){let q=supabase.from(table).select('id',{count:'exact',head:true});for(const [op,col,value] of filters)q=q[op](col,value);const {count:total,error}=await q;if(error)throw error;return total||0;}
async function overview(){
  setAdminView(adminHeading('Platform durumu','Genel bakış','İçerikler ve iletişim taleplerinin özeti.' )+'<div class="stat-grid" id="stats"></div>'+panel('Son yönetim hareketleri','<div id="recent-actions" class="empty-state">Veriler yükleniyor…</div>'),'Genel bakış');
  try{const n=await Promise.all([count('articles'),count('articles',[['eq','status','published']]),count('caselaw'),count('glossary_terms'),count('faq'),count('leads',[['is','deleted_at',null]]),count('admin_audit_logs')]);const labels=['Makaleler','Yayımlanan','İçtihatlar','Sözlük','SSS','Açık iletişim','Yönetim hareketi'];$('#stats').innerHTML=n.map((value,i)=>`<article class="stat-card"><span>${labels[i]}</span><b>${value}</b></article>`).join('');const {data,error}=await supabase.from('admin_audit_logs').select('action,entity_type,summary,created_at').order('created_at',{ascending:false}).limit(6);if(error)throw error;$('#recent-actions').innerHTML=data?.length?`<table class="admin-table"><thead><tr><th>İşlem</th><th>İçerik</th><th>Tarih</th></tr></thead><tbody>${data.map(row=>`<tr><td>${esc(row.action)}</td><td>${esc(row.summary||row.entity_type)}</td><td>${new Date(row.created_at).toLocaleString('tr-TR')}</td></tr>`).join('')}</tbody></table>`:'Henüz kayıtlı yönetim hareketi yok.';}catch{$('#recent-actions').textContent='Veriler yüklenirken bir sorun oluştu.';}
}

const contentConfig={
  articles:{table:'articles',label:'Makaleler',fields:[['title','Başlık'],['slug','Bağlantı adı'],['excerpt','Özet'],['content','İçerik'],['category','Kategori'],['seo_title','SEO başlığı'],['seo_description','SEO açıklaması']],columns:['title','category','status','updated_at']},
  caselaw:{table:'caselaw',label:'İçtihatlar',fields:[['title','Başlık'],['slug','Bağlantı adı'],['court','Mahkeme'],['chamber','Daire'],['decision_number','Karar numarası'],['decision_date','Karar tarihi'],['summary','Özet'],['content','İçerik'],['source_url','Kaynak bağlantısı']],columns:['title','court','decision_number','status']},
  glossary:{table:'glossary_terms',label:'Hukuk sözlüğü',fields:[['term','Terim'],['slug','Bağlantı adı'],['short_definition','Kısa tanım'],['detailed_definition','Ayrıntılı tanım'],['category','Kategori']],columns:['term','category','status','updated_at']},
  faq:{table:'faq',label:'SSS',fields:[['question','Soru'],['answer','Yanıt'],['category','Kategori']],columns:['question','category','status','updated_at']}
};

async function contentManager(kind){const c=contentConfig[kind];setAdminView(adminHeading('İçerik yönetimi',c.label,'Taslak hazırlayın, düzenleyin ve yayın öncesinde bilgileri kontrol edin.',`<button class="button button-dark" id="new-content">Yeni ekle <span>＋</span></button>`)+panel('Kayıtlar','<div class="admin-toolbar"><input class="admin-field" id="content-filter" type="search" placeholder="Başlıkta ara" aria-label="İçeriklerde ara"><span id="content-count" class="admin-user"></span></div><div id="content-list" class="empty-state">Kayıtlar yükleniyor…</div>')+panel('İçerik düzenleyici','<div id="content-editor" class="empty-state">Düzenlemek için bir kayıt seçin veya yeni kayıt ekleyin.</div>'),c.label);$('#new-content').addEventListener('click',()=>showContentForm(kind));await refreshContentList(kind);$('#content-filter').addEventListener('input',()=>refreshContentList(kind));}

async function refreshContentList(kind){const c=contentConfig[kind];const root=$('#content-list');if(!root)return;try{let q=supabase.from(c.table).select('*').order('updated_at',{ascending:false}).limit(100);if(kind!=='faq')q=q.is('deleted_at',null);const {data,error}=await q;if(error)throw error;const filter=fold($('#content-filter')?.value||'');const rows=(data||[]).filter(row=>fold(row.title||row.term||row.question).includes(filter));$('#content-count').textContent=`${rows.length} kayıt`;if(!rows.length){root.className='empty-state';root.textContent='Bu aramada içerik bulunamadı.';return;}root.className='';root.innerHTML=`<table class="admin-table"><thead><tr>${c.columns.map(col=>`<th>${esc(col==='updated_at'?'Güncellendi':col==='decision_number'?'Karar no.':col==='seo_description'?'SEO açıklaması':col)}</th>`).join('')}<th>İşlem</th></tr></thead><tbody>${rows.map(row=>`<tr>${c.columns.map(col=>`<td>${esc(col==='updated_at'&&row[col]?new Date(row[col]).toLocaleDateString('tr-TR'):row[col]||'—')}${col==='status'?` <span class="status-pill ${row.status==='draft'?'status-draft':''}">${esc(row.status)}</span>`:''}</td>`).join('')}<td><button data-edit="${row.id}">Düzenle</button> <button data-delete="${row.id}">Arşivle</button></td></tr>`).join('')}</tbody></table>`;$$('[data-edit]',root).forEach(btn=>btn.addEventListener('click',()=>showContentForm(kind,rows.find(r=>r.id===btn.dataset.edit))));$$('[data-delete]',root).forEach(btn=>btn.addEventListener('click',()=>archiveContent(kind,btn.dataset.delete)));}catch{root.className='empty-state';root.textContent='Kayıtlar yüklenirken bir sorun oluştu.';}}

function slugify(value){return fold(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function showContentForm(kind,row={}){const c=contentConfig[kind];const target=$('#content-editor');target.className='';target.innerHTML=`<form class="admin-form" id="edit-content"><input type="hidden" name="id" value="${esc(row.id||'')}">${c.fields.map(([name,label])=>`<label>${esc(label)}${['content','excerpt','summary','answer','short_definition','detailed_definition'].includes(name)?`<textarea name="${name}" ${name==='content'?'rows="9"':''}>${esc(row[name]||'')}</textarea>`:`<input name="${name}" value="${esc(row[name]||'')}" ${name==='decision_date'?'type="date"':''}>`}</label>`).join('')}<label>Yayın durumu<select name="status"><option value="draft" ${row.status!=='published'?'selected':''}>Taslak</option><option value="published" ${row.status==='published'?'selected':''}>Yayımla</option></select></label><div class="admin-callout">Örnek kayıtları gerçek karar veya doğrulanmamış hukuki kaynak gibi yayımlamayın. Yayınlanan içeriği kaynaklarıyla kontrol edin.</div><button class="button button-dark">${row.id?'Değişiklikleri kaydet':'Taslağı oluştur'} <span>→</span></button><div class="admin-message" role="status"></div></form>`;const form=$('#edit-content');form.addEventListener('submit',e=>saveContent(e,kind,row));const titleField=form.elements.title||form.elements.term||form.elements.question;if(titleField&&!row.id)titleField.addEventListener('input',()=>{const slug=form.elements.slug;if(slug&&!slug.dataset.edited)slug.value=slugify(titleField.value);});const slug=form.elements.slug;if(slug)slug.addEventListener('input',()=>slug.dataset.edited='1');}

async function saveContent(event,kind,row){event.preventDefault();const form=event.currentTarget;const c=contentConfig[kind];const payload=Object.fromEntries(new FormData(form));delete payload.id;if(!payload.slug){payload.slug=slugify(payload.title||payload.term||payload.question||'');}if(kind==='articles'){payload.author_id=currentUser.id;payload.author='Ahmet Ali Ünal';payload.published_at=payload.status==='published'?(row.published_at||new Date().toISOString()):null;payload.reading_minutes=Math.max(1,Math.ceil((payload.content||'').split(/\s+/).length/220));}if(kind==='faq'){payload.published=payload.status==='published';payload.sort_order=Number(row.sort_order||0);}const message=$('.admin-message',form);try{const request=row.id?supabase.from(c.table).update(payload).eq('id',row.id):supabase.from(c.table).insert(payload);const {error}=await request;if(error)throw error;message.textContent='Değişiklik kaydedildi.';await refreshContentList(kind);notice('İçerik kaydedildi.');}catch{message.textContent='İçerik kaydedilemedi. Alanları ve yetkinizi kontrol edin.';}}
async function archiveContent(kind,id){if(!confirm('Bu içeriği arşivlemek istiyor musunuz?'))return;const c=contentConfig[kind];const {error}=await supabase.from(c.table).update({status:'archived',deleted_at:new Date().toISOString()}).eq('id',id);if(error){notice('İçerik arşivlenemedi.');return;}notice('İçerik arşivlendi.');await refreshContentList(kind);}

async function leadManager(){setAdminView(adminHeading('İletişim','CRM ve mesajlar','İletişim taleplerini durumlarına göre takip edin.')+panel('Talepler','<div class="admin-toolbar"><select class="admin-field" id="lead-status"><option value="">Tüm durumlar</option><option>New</option><option>Contacted</option><option>Qualified</option><option>Consultation</option><option>Converted</option><option>Closed</option><option>Archived</option></select><span id="lead-count" class="admin-user"></span></div><div id="lead-list" class="empty-state">Talepler yükleniyor…</div>'),'CRM ve mesajlar');$('#lead-status').addEventListener('change',loadLeads);await loadLeads();}
async function loadLeads(){const root=$('#lead-list');if(!root)return;try{let q=supabase.from('leads').select('id,name,surname,email,phone,subject,status,created_at,follow_up_at,message').is('deleted_at',null).order('created_at',{ascending:false}).limit(100);if($('#lead-status').value)q=q.eq('status',$('#lead-status').value);const {data,error}=await q;if(error)throw error;$('#lead-count').textContent=`${data.length} talep`;if(!data.length){root.className='empty-state';root.textContent='Henüz iletişim talebi yok.';return;}root.className='';root.innerHTML=`<table class="admin-table"><thead><tr><th>Talep</th><th>E-posta</th><th>Durum</th><th>Alındı</th><th>İşlem</th></tr></thead><tbody>${data.map(row=>`<tr><td>${esc(`${row.name} ${row.surname}`)}<br><small>${esc(row.subject)}</small><details><summary>Mesajı görüntüle</summary><p>${esc(row.message)}</p></details></td><td>${esc(row.email)}</td><td><select class="admin-field" data-lead-status="${row.id}">${['New','Contacted','Qualified','Consultation','Converted','Closed','Archived'].map(s=>`<option ${s===row.status?'selected':''}>${s}</option>`).join('')}</select></td><td>${new Date(row.created_at).toLocaleDateString('tr-TR')}</td><td><button data-followup="${row.id}">Hatırlatıcı</button></td></tr>`).join('')}</tbody></table>`;$$('[data-lead-status]',root).forEach(sel=>sel.addEventListener('change',async()=>{const {error}=await supabase.from('leads').update({status:sel.value,last_contact_at:new Date().toISOString()}).eq('id',sel.dataset.leadStatus);if(error)notice('Durum güncellenemedi.');else{await supabase.from('lead_events').insert({lead_id:sel.dataset.leadStatus,actor_id:currentUser.id,event_type:'status_changed',details:{status:sel.value}});notice('Talep durumu güncellendi.');}}));$$('[data-followup]',root).forEach(button=>button.addEventListener('click',async()=>{const day=new Date(Date.now()+86400000).toISOString();const {error}=await supabase.from('leads').update({follow_up_at:day}).eq('id',button.dataset.followup);notice(error?'Hatırlatıcı kaydedilemedi.':'Yarın için hatırlatıcı kaydedildi.');}));}catch{root.className='empty-state';root.textContent='İletişim talepleri yüklenirken bir sorun oluştu.';}}

function aiStudio(){setAdminView(adminHeading('Yardımcı araştırma','AI Studio','AI çıktıları yalnızca taslak olarak kaydedilir; hukuki kaynak ve atıfları yayımdan önce doğrulayın.')+panel('Yeni taslak',`<form id="ai-form" class="admin-form"><label>İşlem<select name="task"><option value="outline">Makale taslağı / başlık planı</option><option value="summarize">Özet çıkar</option><option value="improve">Metni geliştir</option><option value="seo">SEO başlığı ve açıklaması</option><option value="faq">Sık sorulan soru taslağı</option><option value="terms">Hukuk terimi çıkarımı</option><option value="simplify">Daha anlaşılır anlat</option><option value="academic">Akademik üslupta yeniden yaz</option></select></label><label>Talimat veya mevcut metin<textarea name="prompt" minlength="10" maxlength="12000" required placeholder="Konu, amaç ve varsa kaynak metni yazın. Doğrulanmamış karar numarası veya kaynak üretmeyin."></textarea></label><button class="button button-dark">Taslak oluştur <span>✳</span></button><div id="ai-message" class="admin-message" role="status"></div></form><div id="ai-output" class="admin-callout admin-hidden"></div>`),'AI Studio');$('#ai-form').addEventListener('submit',generateDraft);}
async function generateDraft(event){event.preventDefault();const form=event.currentTarget;const msg=$('#ai-message');msg.textContent='Taslak hazırlanıyor…';try{const {data,error}=await supabase.functions.invoke('ai-assistant',{body:{task:form.elements.task.value,prompt:form.elements.prompt.value}});if(error)throw error;if(!data?.text||!data?.draft_id)throw new Error('draft was not saved');const out=$('#ai-output');out.classList.remove('admin-hidden');out.replaceChildren();const titleLabel=document.createElement('label');titleLabel.textContent='İçerik taslak başlığı';const title=document.createElement('input');title.className='admin-field';title.maxLength=180;title.placeholder='Doğrulanmış ve açıklayıcı bir başlık girin';titleLabel.append(title);const editLabel=document.createElement('label');editLabel.textContent='AI tarafından oluşturulan taslak — düzenleyin ve doğrulayın';const edit=document.createElement('textarea');edit.id='ai-output-text';edit.value=data.text;editLabel.append(edit);const use=document.createElement('button');use.className='small-button';use.textContent='Makale taslağı olarak kaydet';use.addEventListener('click',async()=>{const content=edit.value.trim();const draftTitle=title.value.trim();if(!draftTitle||content.length<30){msg.textContent='Başlık girin ve taslağı gözden geçirin.';return;}const payload={title:draftTitle,slug:slugify(draftTitle),excerpt:content.slice(0,180),content,category:'',author_id:currentUser.id,author:'Ahmet Ali Ünal',status:'draft',published_at:null,reading_minutes:Math.max(1,Math.ceil(content.split(/\s+/).length/220)),is_demo:false};const {error:saveError}=await supabase.from('articles').insert(payload);if(saveError){msg.textContent='Makale taslağı kaydedilemedi. Başlık bağlantısının benzersiz olduğundan emin olun.';return;}await supabase.from('ai_generations').update({output:content,status:'used'}).eq('id',data.draft_id);msg.textContent='Makale taslağı kaydedildi; yayımlanmadı.';});const cancel=document.createElement('button');cancel.className='small-button';cancel.textContent='AI taslağını iptal et';cancel.addEventListener('click',async()=>{const {error:cancelError}=await supabase.from('ai_generations').update({status:'cancelled'}).eq('id',data.draft_id);msg.textContent=cancelError?'Taslak iptal edilemedi.':'AI taslağı iptal edildi.';out.classList.add('admin-hidden');});out.append(titleLabel,editLabel,use,cancel);msg.textContent='AI çıktısı taslak olarak kaydedildi. Otomatik yayımlanmadı.';}catch{msg.textContent='AI taslağı oluşturulamadı. Servis veya yetki ayarlarını kontrol edin.';}}

async function profileManager(){const {data,error}=await supabase.from('profiles').select('*').eq('id',currentUser.id).maybeSingle();if(error||!data){setAdminView(adminHeading('Kimlik','Profil','Profil bilgilerinizi yönetin.')+panel('Profil','<p>Profil bilgileri şu anda yüklenemiyor.</p>'),'Profil');return;}setAdminView(adminHeading('Kimlik','Profil','Yalnızca doğruladığınız eğitim ve mesleki bilgileri ekleyin.')+panel('Kişisel profil',`<form id="profile-form" class="admin-form"><label>Ad soyad<input name="display_name" value="${esc(data.display_name)}" maxlength="120"></label><label>Unvan<input name="title" value="${esc(data.title)}" maxlength="120"></label><label>Kısa biyografi<textarea name="bio" maxlength="4000">${esc(data.bio||'')}</textarea></label><label>Çalışma alanları (virgülle ayırın)<input name="specialties" value="${esc((data.specialties||[]).join(', '))}"></label><button class="button button-dark">Profili kaydet <span>→</span></button><div class="admin-message" role="status"></div></form>`),'Profil');$('#profile-form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget;const {error}=await supabase.from('profiles').update({display_name:f.elements.display_name.value.trim(),title:f.elements.title.value.trim(),bio:f.elements.bio.value.trim(),specialties:f.elements.specialties.value.split(',').map(s=>s.trim()).filter(Boolean)}).eq('id',currentUser.id);$('.admin-message',f).textContent=error?'Profil kaydedilemedi.':'Profil kaydedildi.';});}

async function logsManager(){const {data,error}=await supabase.from('admin_audit_logs').select('actor_id,action,entity_type,entity_id,summary,created_at').order('created_at',{ascending:false}).limit(100);const body=error?'<div class="empty-state">Kayıtlar yüklenirken bir sorun oluştu.</div>':data?.length?`<table class="admin-table"><thead><tr><th>Zaman</th><th>Hesap</th><th>İşlem</th><th>Kayıt</th></tr></thead><tbody>${data.map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('tr-TR')}</td><td>${esc(x.actor_id||'Sistem')}</td><td>${esc(x.action)}</td><td>${esc(x.summary||x.entity_type)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty-state">Henüz işlem kaydı yok.</div>';setAdminView(adminHeading('Güvenlik','İşlem kayıtları','Yönetim işlemleri. Kişisel IP adresleri kaydedilmez.')+panel('Son hareketler',body),'İşlem kayıtları');}

async function globalSearch(event){event.preventDefault();const input=$('#search-input');const term=input?.value.trim();if(!term||!supabase)return;const {data,error}=await supabase.rpc('search_public_content',{search_text:term,limit_count:20});if(error){notice('Arama şu anda yapılamıyor.');return;}showSearchResults(term,data||[]);}
function renderSearchPage(){renderListing('Site içi arama','Makaleler, içtihat notları ve hukuk sözlüğünde arayın.',[]);const section=$('.listing-route');const form=document.createElement('form');form.id='global-search';form.className='search-form';form.innerHTML='<label for="search-input">Aranacak ifade</label><div><input id="search-input" type="search" minlength="2" maxlength="100" required><button class="button button-dark">Ara <span>⌕</span></button></div>';const results=document.createElement('div');results.id='search-results';results.setAttribute('aria-live','polite');section.append(form,results);form.addEventListener('submit',globalSearch);}
function showSearchResults(term,items){const root=$('#search-results');if(!root)return;root.replaceChildren();const heading=document.createElement('h2');heading.className='search-heading';heading.textContent=`“${term}” için ${items.length} sonuç`;root.append(heading);if(!items.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Eşleşen içerik bulunamadı.';root.append(p);return;}for(const item of items){const card=document.createElement('article');card.className='plain-result';const h=document.createElement('h2');h.textContent=item.title;const p=document.createElement('p');p.textContent=item.excerpt||'';const a=document.createElement('a');a.className='text-link';a.href=item.path;a.textContent='İçeriği aç →';card.append(h,p,a);root.append(card);}}

async function boot(){
  $('#year')&&($('#year').textContent=String(new Date().getFullYear()));
  $('.menu-toggle')?.addEventListener('click',()=>{const nav=$('#primary-nav');const open=nav.classList.toggle('open');$('.menu-toggle').setAttribute('aria-expanded',String(open));});
  $('#contact-form')?.addEventListener('submit',submitContact);
  try{await connect();}catch{if(location.pathname==='/admin'){document.body.innerHTML='<main class="login-shell"><p>Yönetim paneli geçici olarak kullanılamıyor.</p></main>';}else{$('#featured-articles')?.replaceChildren(Object.assign(document.createElement('p'),{className:'loading-note',textContent:'Çalışmalar şu anda yüklenemiyor.'}));}return;}
  if(location.pathname==='/admin'||location.pathname.startsWith('/admin/')){renderAdminShell();return;}
  const canonical=$('link[rel="canonical"]');if(canonical)canonical.href=location.origin+location.pathname;
  const ogUrl=$('meta[property="og:url"]');if(ogUrl)ogUrl.content=location.href;
  if(location.pathname==='/arama'){renderSearchPage();return;}
  if(location.pathname==='/'){loadFeatured();}else{await loadPageRoute();}
}

boot();

