begin;

create table if not exists public.system_health_checks(
  id uuid primary key default gen_random_uuid(), overall_status text not null check(overall_status in ('HEALTHY','WARNING','CRITICAL')),
  overall_score smallint not null check(overall_score between 0 and 100), scores jsonb not null, services jsonb not null,
  deployment_ref text, checked_at timestamptz not null default now(), created_by uuid references auth.users(id)
);
create table if not exists public.system_health_alerts(
  id uuid primary key default gen_random_uuid(), alert_key text not null unique, severity text not null check(severity in ('WARNING','CRITICAL')),
  message text not null, status text not null default 'OPEN' check(status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(), acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz, resolved_at timestamptz, metadata jsonb not null default '{}'
);
create index if not exists system_health_checks_time_idx on public.system_health_checks(checked_at desc);
create index if not exists system_health_alerts_status_idx on public.system_health_alerts(status,severity,last_seen_at desc);
create or replace function public.orbit_storage_usage()
returns table(bucket_id text,object_count bigint,total_bytes bigint) language sql security definer set search_path=public,storage as $$
  select bucket_id,count(*),coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0) from storage.objects group by bucket_id order by bucket_id
$$;
alter table public.system_health_checks enable row level security; alter table public.system_health_alerts enable row level security;
create policy system_health_checks_internal_read on public.system_health_checks for select using(public.is_internal_user());
create policy system_health_checks_admin_write on public.system_health_checks for all using(public.can_administer()) with check(public.can_administer());
create policy system_health_alerts_internal_read on public.system_health_alerts for select using(public.is_internal_user());
create policy system_health_alerts_admin_write on public.system_health_alerts for all using(public.can_administer()) with check(public.can_administer());
drop trigger if exists system_health_alerts_audit on public.system_health_alerts;
create trigger system_health_alerts_audit after insert or update or delete on public.system_health_alerts for each row execute function public.audit_row_change();
revoke update,delete on public.system_health_checks from anon,authenticated;
revoke all on function public.orbit_storage_usage() from public;grant execute on function public.orbit_storage_usage() to authenticated,service_role;
commit;
