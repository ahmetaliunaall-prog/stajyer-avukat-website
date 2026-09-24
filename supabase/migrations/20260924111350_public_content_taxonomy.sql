begin;

grant select on public.article_categories, public.article_tags, public.article_tag_relations to anon, authenticated;

drop policy if exists article_tag_relations_public_read on public.article_tag_relations;
create policy article_tag_relations_public_read
  on public.article_tag_relations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.articles a
      where a.id = article_tag_relations.article_id
        and a.status = 'published'
        and a.published_at <= now()
        and a.deleted_at is null
    )
  );

drop policy if exists categories_public_read on public.article_categories;
create policy categories_public_read
  on public.article_categories
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.articles a
      where a.category_id = article_categories.id
        and a.status = 'published'
        and a.published_at <= now()
        and a.deleted_at is null
    )
  );

drop policy if exists article_tags_public_read on public.article_tags;
create policy article_tags_public_read
  on public.article_tags
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.article_tag_relations r
      join public.articles a on a.id = r.article_id
      where r.tag_id = article_tags.id
        and a.status = 'published'
        and a.published_at <= now()
        and a.deleted_at is null
    )
  );

commit;

