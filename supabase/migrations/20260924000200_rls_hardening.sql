begin;

-- Profile access depends on the owner/admin policies created in the initial schema migration.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select, insert, update, delete on public.profiles to authenticated;

-- Private integration settings must never be reachable through public client roles.
alter table private.integration_settings enable row level security;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;
revoke all on private.integration_settings from public, anon, authenticated;
grant select on private.integration_settings to service_role;
drop policy if exists integration_settings_service_only on private.integration_settings;
create policy integration_settings_service_only on private.integration_settings
  for all to service_role using (true) with check (true);

commit;

