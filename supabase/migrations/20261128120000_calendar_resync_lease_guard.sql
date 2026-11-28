create table if not exists public.calendar_resync_leases (
  scope text primary key,
  owner_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.calendar_resync_leases enable row level security;
revoke all on table public.calendar_resync_leases from public, anon, authenticated;

create or replace function public.claim_calendar_resync_lease(
  p_scope text,
  p_owner uuid,
  p_lease_seconds integer default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(p_scope), '') is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception 'Invalid Calendar resync lease request.' using errcode = '22023';
  end if;

  insert into public.calendar_resync_leases as leases(scope, owner_token, expires_at, updated_at)
  values (trim(p_scope), p_owner, clock_timestamp() + make_interval(secs => p_lease_seconds), clock_timestamp())
  on conflict (scope) do update
    set owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at
    where leases.expires_at <= clock_timestamp() or leases.owner_token = p_owner;

  return exists (
    select 1 from public.calendar_resync_leases
    where scope = trim(p_scope) and owner_token = p_owner and expires_at > clock_timestamp()
  );
end;
$$;

create or replace function public.release_calendar_resync_lease(p_scope text, p_owner uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  delete from public.calendar_resync_leases
  where scope = trim(p_scope) and owner_token = p_owner
  returning true;
$$;

revoke all on function public.claim_calendar_resync_lease(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_calendar_resync_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_calendar_resync_lease(text, uuid, integer) to service_role;
grant execute on function public.release_calendar_resync_lease(text, uuid) to service_role;
