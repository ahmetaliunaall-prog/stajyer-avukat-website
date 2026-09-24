begin;

-- Site identity fields are public content. Admin-only writes remain governed by
-- the existing site_settings_admin_all policy.
alter table public.site_settings enable row level security;
grant select on public.site_settings to anon, authenticated;
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read
  on public.site_settings
  for select
  to anon, authenticated
  using (id is true);

commit;

