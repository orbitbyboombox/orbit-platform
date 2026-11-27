begin;

create table if not exists public.drive_reconciliation_leases (
  scope text primary key,
  owner_token uuid not null,
  expires_at timestamptz not null
);

alter table public.drive_reconciliation_leases enable row level security;
revoke all on public.drive_reconciliation_leases from public, anon, authenticated;

create or replace function public.claim_drive_reconciliation_lease(p_scope text, p_owner uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.drive_reconciliation_leases as leases (scope, owner_token, expires_at)
  values (p_scope, p_owner, clock_timestamp() + interval '15 minutes')
  on conflict (scope) do update
    set owner_token = excluded.owner_token, expires_at = excluded.expires_at
    where leases.expires_at <= clock_timestamp();
  return found;
end;
$$;

create or replace function public.release_drive_reconciliation_lease(p_scope text, p_owner uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.drive_reconciliation_leases where scope = p_scope and owner_token = p_owner;
$$;

revoke all on function public.claim_drive_reconciliation_lease(text, uuid) from public, anon, authenticated;
revoke all on function public.release_drive_reconciliation_lease(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_drive_reconciliation_lease(text, uuid) to service_role;
grant execute on function public.release_drive_reconciliation_lease(text, uuid) to service_role;

commit;
