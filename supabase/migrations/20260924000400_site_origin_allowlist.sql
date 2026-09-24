begin;

insert into private.integration_settings(setting_key, setting_value)
values (
  'SITE_ORIGINS',
  'https://stajyer-avukat-websitefdssdf.ahmetaliunaall.workers.dev,https://ahmetaliunal.com.tr'
)
on conflict(setting_key) do update set setting_value=excluded.setting_value;

create or replace function public.is_site_origin_allowed(p_origin text)
returns boolean language sql stable security definer set search_path = pg_catalog
as $$
  select p_origin is not null and exists (
    select 1 from private.integration_settings s
    where s.setting_key='SITE_ORIGINS'
      and p_origin = any(string_to_array(s.setting_value, ','))
  )
$$;
revoke all on function public.is_site_origin_allowed(text) from public, anon, authenticated;
grant execute on function public.is_site_origin_allowed(text) to service_role;

commit;

