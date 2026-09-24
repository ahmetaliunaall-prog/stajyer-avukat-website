-- Clean rebuild of the application's public schema. Auth identities are retained;
-- existing rows in public.admin_users are promoted into the new profiles table.
begin;

create temporary table _preserved_admin_ids on commit drop as
  select user_id from public.admin_users where to_regclass('public.admin_users') is not null;
create temporary table _preserved_telegram_chat on commit drop as
  select telegram_chat_id from public.site_settings where to_regclass('public.site_settings') is not null limit 1;

drop table if exists public.admin_users cascade;
drop table if exists public.site_settings cascade;
drop table if exists public.articles cascade;
drop table if exists public.caselaw cascade;
drop table if exists public.glossary_terms cascade;
drop table if exists public.faq cascade;
drop table if exists public.navigation_items cascade;
drop table if exists public.homepage_sections cascade;
drop table if exists public.contact_messages cascade;
drop table if exists public.visitor_logs cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.set_updated_at() cascade;
drop schema if exists private cascade;
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
create table private.integration_settings (setting_key text primary key, setting_value text not null);
revoke all on private.integration_settings from public, anon, authenticated;
grant select on private.integration_settings to service_role;
insert into private.integration_settings(setting_key,setting_value)
select 'TELEGRAM_CHAT_ID',telegram_chat_id from _preserved_telegram_chat where nullif(trim(telegram_chat_id),'') is not null;

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = pg_catalog
as $$ begin new.updated_at = now(); return new; end $$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  title text not null default '',
  role text not null default 'editor' check (role in ('admin','editor','author')),
  bio text,
  education jsonb not null default '[]',
  experience jsonb not null default '[]',
  specialties text[] not null default '{}',
  publications jsonb not null default '[]',
  certificates jsonb not null default '[]',
  events jsonb not null default '[]',
  social_links jsonb not null default '{}',
  avatar_media_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.get_telegram_chat_id()
returns text language sql stable security definer set search_path = pg_catalog
as $$ select setting_value from private.integration_settings where setting_key='TELEGRAM_CHAT_ID' $$;
revoke all on function public.get_telegram_chat_id() from public,anon,authenticated;
grant execute on function public.get_telegram_chat_id() to service_role;

create or replace function private.create_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$ begin
  insert into public.profiles(id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name',''), 'editor')
  on conflict (id) do nothing;
  return new;
end $$;
revoke all on function private.create_profile_for_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.create_profile_for_auth_user();

insert into public.profiles(id, role)
select user_id, 'admin' from _preserved_admin_ids
on conflict (id) do update set role = 'admin';

create table public.site_settings (
  id boolean primary key default true check (id),
  site_name text not null default 'Ahmet Ali Ünal',
  site_url text not null default '',
  profession text not null default 'Stajyer Avukat',
  headline text not null default 'Hukuku anlamak, analiz etmek ve paylaşmak.',
  description text not null default 'Hukuk üzerine araştırmalar, açıklamalar ve değerlendirmeler.',
  contact_email text not null default '',
  contact_phone text not null default '',
  city text not null default '',
  social_links jsonb not null default '{}',
  seo_defaults jsonb not null default '{}',
  privacy_settings jsonb not null default '{"analytics_consent":false}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
insert into public.site_settings(id) values (true);

create table public.article_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique,
  slug text not null unique, description text not null default '', sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.articles (
  id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique,
  excerpt text not null default '', content text not null default '', category text not null default '',
  category_id uuid references public.article_categories(id) on delete set null,
  tags text[] not null default '{}', author_id uuid references public.profiles(id) on delete set null,
  author text not null default '', status text not null default 'draft' check(status in ('draft','published','archived')),
  featured boolean not null default false, is_demo boolean not null default false,
  cover_image text, seo_title text not null default '', seo_description text not null default '',
  canonical text, og_image text, reading_minutes integer not null default 1 check(reading_minutes > 0),
  published_at timestamptz, reviewed_at timestamptz, reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
  check(status <> 'published' or published_at is not null)
);
create table public.article_tags (
  id uuid primary key default gen_random_uuid(), name text not null unique, slug text not null unique,
  created_at timestamptz not null default now()
);
create table public.article_tag_relations (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.article_tags(id) on delete cascade,
  primary key(article_id, tag_id)
);

create table public.caselaw (
  id uuid primary key default gen_random_uuid(), slug text not null unique,
  title text not null, court text not null, chamber text not null default '',
  decision_number text not null default '', decision_date date,
  summary text not null default '', content text not null default '', category text not null default '',
  tags text[] not null default '{}', source text not null default '', source_url text,
  status text not null default 'draft' check(status in ('draft','published','archived')),
  featured boolean not null default false, is_demo boolean not null default false,
  seo_title text not null default '', seo_description text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(), term text not null unique, slug text not null unique,
  short_definition text not null default '', detailed_definition text not null default '',
  definition text not null default '', related_terms text[] not null default '{}', category text not null default '',
  seo_title text not null default '', seo_description text not null default '', status text not null default 'draft'
    check(status in ('draft','published','archived')), is_demo boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.faq (
  id uuid primary key default gen_random_uuid(), question text not null, answer text not null default '',
  category text not null default '', sort_order integer not null default 0,
  published boolean not null default false, status text not null default 'draft' check(status in ('draft','published','archived')),
  is_demo boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.legal_topics (
  id uuid primary key default gen_random_uuid(), title text not null, slug text not null unique,
  description text not null default '', parent_id uuid references public.legal_topics(id) on delete set null,
  sort_order integer not null default 0, published boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.legal_references (
  id uuid primary key default gen_random_uuid(), title text not null, reference_type text not null,
  citation text not null default '', source_url text, summary text not null default '',
  topic_id uuid references public.legal_topics(id) on delete set null,
  status text not null default 'draft' check(status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.navigation_items (
  id uuid primary key default gen_random_uuid(), label text not null, route text not null,
  sort_order integer not null default 0, is_visible boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.homepage_sections (
  id uuid primary key default gen_random_uuid(), section_key text not null unique,
  title text not null default '', subtitle text not null default '', content text not null default '',
  is_visible boolean not null default true, sort_order integer not null default 0,
  settings jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.media (
  id uuid primary key default gen_random_uuid(), storage_path text not null unique,
  bucket text not null default 'media', file_name text not null, mime_type text not null,
  size_bytes bigint not null check(size_bytes >= 0), width integer, height integer,
  alt_text text not null default '', title text not null default '', caption text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), deleted_at timestamptz
);
alter table public.profiles add constraint profiles_avatar_media_fk foreign key (avatar_media_id) references public.media(id) on delete set null;

create table public.leads (
  id uuid primary key default gen_random_uuid(), name text not null, surname text not null default '',
  email text not null, phone text not null default '', subject text not null default '', message text not null default '',
  source text not null default 'website', contact_preference text not null default 'email',
  status text not null default 'New' check(status in ('New','Contacted','Qualified','Consultation','Converted','Closed','Archived')),
  consent_at timestamptz, last_contact_at timestamptz, follow_up_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.lead_notes (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null, note text not null,
  created_at timestamptz not null default now()
);
create table public.lead_events (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null, event_type text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.contact_rate_limits (
  ip_hash text primary key, window_started_at timestamptz not null default now(), submissions integer not null default 1,
  expires_at timestamptz not null default (now() + interval '1 day')
);

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  path text not null default '/', referrer_host text, search_term text,
  session_hash text, visitor_hash text, device_type text, browser_family text, os_family text,
  country_code text, consent boolean not null default false,
  occurred_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '13 months')
);
create table public.security_logs (
  id uuid primary key default gen_random_uuid(), event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null, severity text not null default 'info',
  request_hash text, metadata jsonb not null default '{}', created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days')
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  action text not null, entity_type text not null, entity_id uuid, summary text not null default '',
  created_at timestamptz not null default now()
);
create table public.seo_audits (
  id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid,
  score smallint not null default 0 check(score between 0 and 100), findings jsonb not null default '[]',
  audited_at timestamptz not null default now(), audited_by uuid references public.profiles(id) on delete set null
);
create table public.ai_generations (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.profiles(id) on delete cascade,
  task text not null, input jsonb not null default '{}', output text not null default '',
  status text not null default 'draft' check(status in ('draft','used','cancelled')),
  source_references jsonb not null default '[]', model text not null default '', created_at timestamptz not null default now()
);
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id) on delete set null,
  provider text not null, model text not null, task text not null, input_tokens integer, output_tokens integer,
  created_at timestamptz not null default now()
);
create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(), email text not null unique,
  consent_at timestamptz not null, confirmed_at timestamptz, unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.redirects (
  id uuid primary key default gen_random_uuid(), source_path text not null unique,
  target_path text not null, status_code smallint not null default 301 check(status_code in (301,302,307,308)),
  enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.content_versions (
  id uuid primary key default gen_random_uuid(), entity_type text not null, entity_id uuid not null,
  version integer not null, snapshot jsonb not null, change_summary text not null default '',
  author_id uuid references public.profiles(id) on delete set null, changed_at timestamptz not null default now(),
  unique(entity_type, entity_id, version)
);

create index articles_publication_idx on public.articles(status,published_at desc) where deleted_at is null;
create index articles_category_idx on public.articles(category_id);
create extension if not exists pg_trgm with schema extensions;
create index articles_search_idx on public.articles using gin(to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(content,'')));
create index articles_title_trgm_idx on public.articles using gin(title extensions.gin_trgm_ops);
create index caselaw_date_idx on public.caselaw(decision_date desc) where status='published' and deleted_at is null;
create index glossary_search_idx on public.glossary_terms using gin(to_tsvector('simple', coalesce(term,'') || ' ' || coalesce(short_definition,'') || ' ' || coalesce(detailed_definition,'')));
create index glossary_term_trgm_idx on public.glossary_terms using gin(term extensions.gin_trgm_ops);
create index leads_status_created_idx on public.leads(status,created_at desc) where deleted_at is null;
create index lead_events_timeline_idx on public.lead_events(lead_id,created_at desc);
create index analytics_occurred_idx on public.analytics_events(occurred_at desc);
create index audit_created_idx on public.admin_audit_logs(created_at desc);
create index versions_entity_idx on public.content_versions(entity_type,entity_id,version desc);

do $$ declare t text; begin
  foreach t in array array['profiles','site_settings','article_categories','articles','caselaw','glossary_terms','faq','legal_topics','legal_references','navigation_items','homepage_sections','leads','redirects'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t||'_touch_updated_at', t);
  end loop;
end $$;

create or replace function private.snapshot_article_version()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$ begin
  insert into public.content_versions(entity_type,entity_id,version,snapshot,author_id,change_summary)
  values('article',old.id,coalesce((select max(v.version)+1 from public.content_versions v where v.entity_type='article' and v.entity_id=old.id),1),to_jsonb(old),(select auth.uid()),'Önceki içerik sürümü');
  return new;
end $$;
revoke all on function private.snapshot_article_version() from public, anon, authenticated;
create trigger articles_version_before_update before update of title,excerpt,content,slug,status on public.articles
  for each row when (old.title is distinct from new.title or old.excerpt is distinct from new.excerpt or old.content is distinct from new.content or old.slug is distinct from new.slug or old.status is distinct from new.status)
  execute function private.snapshot_article_version();

create or replace function private.admin_audit_content_change()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$ declare item_id uuid; verb text; begin
  verb := lower(tg_op);
  if tg_op = 'DELETE' then item_id := old.id; else item_id := new.id; end if;
  insert into public.admin_audit_logs(actor_id,action,entity_type,entity_id,summary)
  values((select auth.uid()),verb,tg_table_name,item_id,tg_op||' content record');
  if tg_op = 'DELETE' then return old; else return new; end if;
end $$;
revoke all on function private.admin_audit_content_change() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['articles','caselaw','glossary_terms','faq','legal_topics','legal_references'] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.admin_audit_content_change()',t||'_audit',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['site_settings','article_categories','articles','article_tags','article_tag_relations','caselaw','glossary_terms','faq','legal_topics','legal_references','navigation_items','homepage_sections','media','leads','lead_notes','lead_events','contact_rate_limits','analytics_events','security_logs','admin_audit_logs','seo_audits','ai_generations','ai_usage','newsletter_subscribers','redirects','content_versions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant all on public.%I to authenticated',t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',t||'_admin_all',t);
  end loop;
end $$;

create policy profiles_self_read on public.profiles for select to authenticated using (id=(select auth.uid()));
create policy profiles_admin_manage on public.profiles for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_public_read on public.article_categories for select to anon,authenticated using (exists(select 1 from public.articles a where a.category_id=id and a.status='published' and a.deleted_at is null));
create policy articles_public_read on public.articles for select to anon,authenticated using (status='published' and published_at <= now() and deleted_at is null);
create policy caselaw_public_read on public.caselaw for select to anon,authenticated using (status='published' and deleted_at is null);
create policy glossary_public_read on public.glossary_terms for select to anon,authenticated using (status='published' and deleted_at is null);
create policy faq_public_read on public.faq for select to anon,authenticated using (published and status='published');
create policy legal_topics_public_read on public.legal_topics for select to anon,authenticated using (published);
create policy legal_refs_public_read on public.legal_references for select to anon,authenticated using (status='published');
create policy nav_public_read on public.navigation_items for select to anon,authenticated using (is_visible);
create policy homepage_public_read on public.homepage_sections for select to anon,authenticated using (is_visible);
create policy article_tags_public_read on public.article_tags for select to anon,authenticated using (exists(select 1 from public.article_tag_relations r join public.articles a on a.id=r.article_id where r.tag_id=id and a.status='published' and a.deleted_at is null));
create policy article_tag_relations_public_read on public.article_tag_relations for select to anon,authenticated using (exists(select 1 from public.articles a where a.id=article_id and a.status='published' and a.deleted_at is null));
create policy redirects_public_read on public.redirects for select to anon,authenticated using (enabled);

grant select on public.article_categories,public.articles,public.caselaw,public.glossary_terms,public.faq,public.legal_topics,public.legal_references,public.navigation_items,public.homepage_sections,public.article_tags,public.article_tag_relations,public.redirects to anon,authenticated;
grant all on public.profiles to authenticated;
grant select on public.profiles to authenticated;

create or replace function public.search_public_content(search_text text, limit_count integer default 20)
returns table(content_type text, title text, excerpt text, slug text, path text, score real)
language sql stable security invoker set search_path = pg_catalog
as $$
  with q as (select nullif(trim(search_text),'') as term)
  select results.content_type,results.title,results.excerpt,results.slug,results.path,results.score
  from (
    select 'article'::text as content_type,a.title,a.excerpt,a.slug,'/makale/'||a.slug as path,
      greatest(extensions.similarity(a.title,q.term),extensions.similarity(a.excerpt,q.term)) as score
    from public.articles a cross join q
    where q.term is not null and a.status='published' and a.published_at<=now() and a.deleted_at is null
      and (a.title ilike '%'||q.term||'%' or a.excerpt ilike '%'||q.term||'%' or extensions.similarity(a.title,q.term)>=0.14)
    union all
    select 'caselaw',c.title,c.summary,c.slug,'/ictihat/'||c.slug,
      greatest(extensions.similarity(c.title,q.term),extensions.similarity(c.summary,q.term))
    from public.caselaw c cross join q
    where q.term is not null and c.status='published' and c.deleted_at is null
      and (c.title ilike '%'||q.term||'%' or c.summary ilike '%'||q.term||'%' or extensions.similarity(c.title,q.term)>=0.14)
    union all
    select 'glossary',g.term,g.short_definition,g.slug,'/sozluk/'||g.slug,
      greatest(extensions.similarity(g.term,q.term),extensions.similarity(g.short_definition,q.term))
    from public.glossary_terms g cross join q
    where q.term is not null and g.status='published' and g.deleted_at is null
      and (g.term ilike '%'||q.term||'%' or g.short_definition ilike '%'||q.term||'%' or extensions.similarity(g.term,q.term)>=0.14)
    union all
    select 'faq',f.question,left(f.answer,240),null,'/sss',
      greatest(extensions.similarity(f.question,q.term),extensions.similarity(f.answer,q.term))
    from public.faq f cross join q
    where q.term is not null and f.published and f.status='published'
      and (f.question ilike '%'||q.term||'%' or f.answer ilike '%'||q.term||'%' or extensions.similarity(f.question,q.term)>=0.14)
    union all
    select 'legal_reference',r.title,r.summary,null,'/mevzuat',
      greatest(extensions.similarity(r.title,q.term),extensions.similarity(r.citation,q.term))
    from public.legal_references r cross join q
    where q.term is not null and r.status='published'
      and (r.title ilike '%'||q.term||'%' or r.citation ilike '%'||q.term||'%' or extensions.similarity(r.title,q.term)>=0.14)
  ) results order by results.score desc limit greatest(1,least(coalesce(limit_count,20),50))
$$;
revoke all on function public.search_public_content(text,integer) from public;
grant execute on function public.search_public_content(text,integer) to anon,authenticated;

insert into public.article_categories(name,slug,description,sort_order) values
('Hukuk Metodolojisi','hukuk-metodolojisi','Hukuki düşünme, yorum ve araştırma yöntemleri.',1),
('Borçlar Hukuku','borclar-hukuku','Borç ilişkileri ve sözleşmelere dair çalışmalar.',2),
('Medeni Usul Hukuku','medeni-usul-hukuku','Yargılama usulüne dair genel bilgi ve analizler.',3)
on conflict do nothing;

insert into public.articles(title,slug,excerpt,content,category,tags,status,featured,is_demo,seo_title,seo_description,published_at,reading_minutes)
values
('Hukuki araştırmaya nereden başlanır?','hukuki-arastirmaya-nereden-baslanir','Bir hukuki soruyu sistematik biçimde araştırmak için temel adımlar.','Bu kayıt örnek içeriktir. Somut olaylara ilişkin danışmanlık değildir. Araştırmaya sorunu açıkça tanımlayarak, ilgili mevzuatı ve güvenilir kaynakları doğrulayarak başlanır.','Hukuk Metodolojisi',array['araştırma','metodoloji'],'published',true,true,'Hukuki araştırmaya nereden başlanır?','Hukuki araştırmada soru kurma, kaynak kontrolü ve analiz adımları.',now(),4),
('Sözleşme yorumunda temel ilkeler','sozlesme-yorumunda-temel-ilkeler','Sözleşme hükümlerini değerlendirirken izlenebilecek genel yaklaşım.','Bu kayıt örnek içeriktir. Gerçek bir hukuki görüş veya somut olay değerlendirmesi değildir. Sözleşme yorumu metin, bağlam ve uygulanabilir mevzuat birlikte incelenerek yapılır.','Borçlar Hukuku',array['sözleşme','yorum'],'published',false,true,'Sözleşme yorumunda temel ilkeler','Sözleşme yorumuna ilişkin genel bilgi ve araştırma notu.',now(),3),
('Hukuki metinlerde kaynak doğrulama','hukuki-metinlerde-kaynak-dogrulama','Mevzuat ve karar atıflarını asıl kaynaklardan kontrol etmenin önemi.','Bu kayıt örnek içeriktir. Mevzuat ve karar bilgileri yayımdan önce resmî kaynaklardan doğrulanmalıdır.','Hukuk Metodolojisi',array['kaynak','mevzuat'],'published',false,true,'Hukuki metinlerde kaynak doğrulama','Hukuk araştırmalarında güvenilir kaynak ve atıf kontrolü.',now(),3),
('Dava şartı kavramına giriş','dava-sarti-kavramina-giris','Dava şartı kavramını açıklayan genel çalışma notu.','Bu kayıt örnek içeriktir. Mevzuat değişiklikleri ve güncel kaynaklar ayrıca kontrol edilmelidir.','Medeni Usul Hukuku',array['usul','dava şartı'],'published',false,true,'Dava şartı kavramına giriş','Dava şartı kavramı üzerine genel bilgilendirme.',now(),3),
('Hukukta akademik yazım ve atıf','hukukta-akademik-yazim-ve-atif','Hukuki akademik yazımda açıklık ve kaynak gösterme ilkeleri.','Bu kayıt örnek içeriktir. Bilimsel yayınlarda ilgili atıf kuralları ve asıl kaynaklar izlenmelidir.','Hukuk Metodolojisi',array['akademik yazım','atıf'],'published',false,true,'Hukukta akademik yazım ve atıf','Hukuki akademik yazımın temel yöntemlerine giriş.',now(),3)
on conflict(slug) do nothing;

insert into public.caselaw(slug,title,court,chamber,decision_number,decision_date,summary,content,category,status,is_demo,source)
values
('ornek-karar-01','Örnek karar kaydı 01','Örnek mahkeme','Örnek daire','ÖRNEK-001',null,'Bu kayıt gerçek bir karar değildir.','Yalnızca yönetim paneli ve içerik yapısını göstermek için oluşturulmuş örnek içeriktir.','Örnek','published',true,''),
('ornek-karar-02','Örnek karar kaydı 02','Örnek mahkeme','Örnek daire','ÖRNEK-002',null,'Bu kayıt gerçek bir karar değildir.','Yalnızca yönetim paneli ve içerik yapısını göstermek için oluşturulmuş örnek içeriktir.','Örnek','published',true,''),
('ornek-karar-03','Örnek karar kaydı 03','Örnek mahkeme','Örnek daire','ÖRNEK-003',null,'Bu kayıt gerçek bir karar değildir.','Yalnızca yönetim paneli ve içerik yapısını göstermek için oluşturulmuş örnek içeriktir.','Örnek','published',true,''),
('ornek-karar-04','Örnek karar kaydı 04','Örnek mahkeme','Örnek daire','ÖRNEK-004',null,'Bu kayıt gerçek bir karar değildir.','Yalnızca yönetim paneli ve içerik yapısını göstermek için oluşturulmuş örnek içeriktir.','Örnek','published',true,''),
('ornek-karar-05','Örnek karar kaydı 05','Örnek mahkeme','Örnek daire','ÖRNEK-005',null,'Bu kayıt gerçek bir karar değildir.','Yalnızca yönetim paneli ve içerik yapısını göstermek için oluşturulmuş örnek içeriktir.','Örnek','published',true,'')
on conflict(slug) do nothing;

insert into public.glossary_terms(term,slug,short_definition,detailed_definition,definition,category,status,is_demo)
values
('Dava şartı','dava-sarti','Mahkemenin davanın esasına girebilmesi için aranan usul koşullarının genel adı.','Örnek sözlük açıklaması; güncel mevzuatla birlikte değerlendirilmelidir.','Mahkemenin davanın esasına girebilmesi için aranan usul koşullarının genel adı.','Usul Hukuku','published',true),
('Sözleşme','sozlesme','Hukuki sonuç doğurmaya yönelik karşılıklı ve uygun irade açıklamaları.','Örnek sözlük açıklaması; somut sözleşme ayrıca incelenmelidir.','Hukuki sonuç doğurmaya yönelik karşılıklı ve uygun irade açıklamaları.','Borçlar Hukuku','published',true),
('Haksız fiil','haksiz-fiil','Hukuka aykırı fiilden doğan sorumluluk ilişkisi.','Örnek sözlük açıklaması; unsurlar somut mevzuat ve olaya göre değerlendirilir.','Hukuka aykırı fiilden doğan sorumluluk ilişkisi.','Borçlar Hukuku','published',true),
('Temerrüt','temerrut','Borcun ifasında gecikmeye ilişkin hukuki durum.','Örnek sözlük açıklaması; uygulanabilir hükümlerin asıl kaynaktan kontrolü gerekir.','Borcun ifasında gecikmeye ilişkin hukuki durum.','Borçlar Hukuku','published',true),
('Zilyetlik','zilyetlik','Eşya üzerinde fiilî hâkimiyet durumunu ifade eden kavram.','Örnek sözlük açıklaması; hukuki sonuçlar mevzuat ve olayla birlikte incelenir.','Eşya üzerinde fiilî hâkimiyet durumunu ifade eden kavram.','Eşya Hukuku','published',true),
('Mülkiyet','mulkiyet','Eşya üzerindeki ayni haklardan biri.','Örnek sözlük açıklaması; kapsamı yürürlükteki mevzuata göre değerlendirilmelidir.','Eşya üzerindeki ayni haklardan biri.','Eşya Hukuku','published',true),
('Vekâlet','vekalet','Bir işin görülmesini veya işlemin yapılmasını üstlenmeye ilişkin sözleşme.','Örnek sözlük açıklaması; ilgili sözleşme hükümleri ayrıca kontrol edilmelidir.','Bir işin görülmesini veya işlemin yapılmasını üstlenmeye ilişkin sözleşme.','Borçlar Hukuku','published',true),
('İrade sakatlığı','irade-sakatligi','İrade açıklamasının oluşumunu etkileyen hukuki durumların genel adı.','Örnek sözlük açıklaması; her durum ilgili mevzuat ve delillerle değerlendirilir.','İrade açıklamasının oluşumunu etkileyen hukuki durumların genel adı.','Medeni Hukuk','published',true),
('Fiil ehliyeti','fiil-ehliyeti','Kişinin kendi fiilleriyle hak edinme ve borç altına girme ehliyeti.','Örnek sözlük açıklaması; kişiye özgü durumlar ayrıca incelenmelidir.','Kişinin kendi fiilleriyle hak edinme ve borç altına girme ehliyeti.','Medeni Hukuk','published',true),
('Hukuki dinlenilme hakkı','hukuki-dinlenilme-hakki','Yargılamada bilgi sahibi olma ve açıklama yapabilme hakkı.','Örnek sözlük açıklaması; kapsamı ilgili usul kurallarıyla belirlenir.','Yargılamada bilgi sahibi olma ve açıklama yapabilme hakkı.','Usul Hukuku','published',true)
on conflict(slug) do nothing;

insert into public.faq(question,answer,category,sort_order,published,status,is_demo) values
('Bu sitedeki içerikler hukuki danışmanlık mıdır?','Hayır. İçerikler genel bilgilendirme ve araştırma amacı taşır; somut olaylar için hukuki danışmanlık yerine geçmez.','Genel',1,true,'published',true),
('Örnek içerikler gerçek karar veya hukuki görüş müdür?','Hayır. Örnek olarak işaretlenen kayıtlar demo verisidir; gerçek karar veya hukuki görüş olarak kullanılmamalıdır.','Genel',2,true,'published',true),
('İçerikler ne sıklıkla güncellenir?','Yayımlanma ve güncellenme tarihleri içerik sayfalarında gösterilir. Önemli mevzuat konuları asıl kaynaktan ayrıca doğrulanmalıdır.','İçerik',3,true,'published',true),
('Bir içerik hakkında nasıl iletişim kurabilirim?','İletişim formunu kullanabilirsiniz. Form üzerinden hassas belge veya özel nitelikli kişisel veri göndermeyin.','İletişim',4,true,'published',true),
('Kişisel bilgilerim nasıl işlenir?','Bilgiler iletişim talebinizi yanıtlamak için sınırlı biçimde kullanılır. Ayrıntılar gizlilik ve aydınlatma metinlerinde açıklanır.','Gizlilik',5,true,'published',true),
('Sitede arama yapabilir miyim?','Evet. Makale, içtihat, sözlük ve SSS içeriklerinde arama yapılabilir.','Kullanım',6,true,'published',true),
('İçtihatlar hangi kaynaklardan yayımlanır?','Yayımlanan içtihat kayıtlarında kaynak bilgisi ve bağlantı varsa belirtilir. Örnek kayıtlar gerçek kararlara dayanmaz.','İçtihat',7,true,'published',true),
('İçerikleri nasıl kullanabilirim?','İçeriklerin kaynağını belirtin ve metinleri hukuki tavsiye gibi sunmayın. Haklar ve kullanım koşulları ayrıca geçerlidir.','Kullanım',8,true,'published',true)
on conflict do nothing;

insert into public.navigation_items(label,route,sort_order,is_visible) values
('Makaleler','/makaleler',1,true),('İçtihatlar','/ictihatlar',2,true),('Hukuk sözlüğü','/sozluk',3,true),('Hakkımda','/hakkimda',4,true),('İletişim','/iletisim',5,true);
insert into public.homepage_sections(section_key,title,subtitle,content,sort_order) values
('hero','Hukuka sakin ve analitik bir bakış','Araştırma · İçtihat · Hukuki bilgi','Stajyer avukat olarak hukuk alanındaki çalışmalarımı ve genel bilgilendirici içerikleri paylaşıyorum.',1),
('profile','Hukuku anlamak, dikkatle değerlendirmek','Kişisel hukuk platformu','Eğitim, mesleki deneyim ve yayın bilgileri doğrulanmış hâliyle yönetim panelinden eklenir.',2),
('topics','Çalışma alanları','Araştırma başlıkları','Hukuk metodolojisi, borçlar hukuku, medeni hukuk ve usul hukuku üzerine içerikler.',3),
('contact','Bir içerik hakkında iletişime geçin','Güvenli iletişim','Lütfen iletişim formuna hassas belge veya özel nitelikli kişisel veri eklemeyin.',4);

create or replace function public.create_contact_lead(p_name text,p_surname text,p_email text,p_phone text,p_subject text,p_message text,p_preference text,p_consent_at timestamptz,p_ip_hash text)
returns uuid language plpgsql security definer set search_path = pg_catalog
as $$ declare n integer; v_id uuid; begin
  if p_consent_at is null or length(trim(p_name)) not between 1 and 100 or length(trim(p_surname)) > 100
     or length(p_message) not between 10 and 5000 or length(p_email) > 254
     or p_preference not in ('email','phone') then raise exception 'invalid contact request'; end if;
  insert into public.contact_rate_limits(ip_hash,window_started_at,submissions,expires_at)
  values(p_ip_hash,now(),1,now()+interval '1 day')
  on conflict(ip_hash) do update set
    submissions=case when contact_rate_limits.window_started_at < now()-interval '1 hour' then 1 else contact_rate_limits.submissions+1 end,
    window_started_at=case when contact_rate_limits.window_started_at < now()-interval '1 hour' then now() else contact_rate_limits.window_started_at end,
    expires_at=now()+interval '1 day'
  returning submissions into n;
  if n > 5 then raise exception 'rate limit exceeded'; end if;
  delete from public.contact_rate_limits where expires_at < now();
  insert into public.leads(name,surname,email,phone,subject,message,source,contact_preference,consent_at)
  values(trim(p_name),trim(p_surname),lower(trim(p_email)),left(trim(p_phone),40),left(trim(p_subject),160),trim(p_message),'website',p_preference,p_consent_at)
  returning id into v_id;
  insert into public.lead_events(lead_id,event_type,details) values(v_id,'lead_created','{"source":"website"}'::jsonb);
  return v_id;
end $$;
revoke all on function public.create_contact_lead(text,text,text,text,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.create_contact_lead(text,text,text,text,text,text,text,timestamptz,text) to service_role;

commit;

