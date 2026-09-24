begin;

-- Keep the SECURITY DEFINER authorization helper outside PostgREST's public schema.
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = pg_catalog
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') $$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;
grant usage on schema private to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['profiles','site_settings','article_categories','articles','article_tags','article_tag_relations','caselaw','glossary_terms','faq','legal_topics','legal_references','navigation_items','homepage_sections','media','leads','lead_notes','lead_events','contact_rate_limits','analytics_events','security_logs','admin_audit_logs','seo_audits','ai_generations','ai_usage','newsletter_subscribers','redirects','content_versions'] loop
    execute format('drop policy if exists %I on public.%I',t||'_admin_all',t);
    execute format('create policy %I on public.%I for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',t||'_admin_all',t);
  end loop;
end $$;
drop policy if exists profiles_admin_manage on public.profiles;
create policy profiles_admin_manage on public.profiles for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
drop function public.is_admin();

create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs(actor_id);
create index if not exists ai_generations_created_by_idx on public.ai_generations(created_by);
create index if not exists ai_usage_actor_idx on public.ai_usage(actor_id);
create index if not exists article_tag_relations_tag_idx on public.article_tag_relations(tag_id);
create index if not exists articles_author_idx on public.articles(author_id);
create index if not exists articles_reviewed_by_idx on public.articles(reviewed_by);
create index if not exists content_versions_author_idx on public.content_versions(author_id);
create index if not exists lead_events_actor_idx on public.lead_events(actor_id);
create index if not exists lead_notes_author_idx on public.lead_notes(author_id);
create index if not exists lead_notes_lead_idx on public.lead_notes(lead_id);
create index if not exists legal_references_topic_idx on public.legal_references(topic_id);
create index if not exists legal_topics_parent_idx on public.legal_topics(parent_id);
create index if not exists media_created_by_idx on public.media(created_by);
create index if not exists profiles_avatar_media_idx on public.profiles(avatar_media_id);
create index if not exists security_logs_actor_idx on public.security_logs(actor_id);
create index if not exists seo_audits_audited_by_idx on public.seo_audits(audited_by);

commit;

