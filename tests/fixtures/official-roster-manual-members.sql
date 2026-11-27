-- Isolated contract fixture for 20261128090000_event_manual_roster_members.sql.
-- It intentionally contains only the real prerequisites used by the migration:
-- public.projects, auth.users, and public.can_administer().
create extension if not exists pgcrypto;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

create table auth.users (
  id uuid primary key
);

create table public.projects (
  id uuid primary key
);

create or replace function public.can_administer()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('app.is_admin', true), 'off') = 'on'
$$;

grant usage on schema public, auth to authenticated;
grant execute on function public.can_administer() to authenticated;
grant select on public.projects to authenticated;
grant select on auth.users to authenticated;

insert into auth.users(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.projects(id) values ('20000000-0000-4000-8000-000000000001');

\ir ../../supabase/migrations/20261128090000_event_manual_roster_members.sql

set role authenticated;
set app.is_admin = 'on';

insert into public.event_manual_roster_members(project_id, full_name, rut, cargo, created_by)
values ('20000000-0000-4000-8000-000000000001', 'Ana Prueba', '12.345.678-5', 'Fotografía', '10000000-0000-4000-8000-000000000001');

do $$
begin
  if (select count(*) from public.event_manual_roster_members) <> 1 then
    raise exception 'manual roster insert did not persist';
  end if;
  if to_regclass('public.event_staff_assignments') is not null
     or to_regclass('public.event_staff_payments') is not null then
    raise exception 'fixture unexpectedly created financial tables';
  end if;
end
$$;

set app.is_admin = 'off';
do $$
begin
  begin
    insert into public.event_manual_roster_members(project_id, full_name, rut, cargo)
    values ('20000000-0000-4000-8000-000000000001', 'No Autorizado', '11.111.111-1', 'Apoyo');
    raise exception 'non-admin insert was allowed';
  exception when insufficient_privilege or raise_exception then
    if sqlerrm = 'non-admin insert was allowed' then
      raise;
    end if;
  end;
end
$$;

set app.is_admin = 'on';
update public.event_manual_roster_members
set deleted_at = now(), updated_by = '10000000-0000-4000-8000-000000000001'
where full_name = 'Ana Prueba';

insert into public.event_manual_roster_members(project_id, full_name, rut, cargo)
values ('20000000-0000-4000-8000-000000000001', 'Ana Prueba', '12.345.678-5', 'Fotografía');

do $$
begin
  if (select count(*) from public.event_manual_roster_members) <> 2 then
    raise exception 'soft-delete did not permit a new active roster row';
  end if;
end
$$;

reset role;
select 'official roster migration isolated validation: PASS' as result;
