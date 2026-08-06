begin;

create table if not exists public.operational_assets (
  id uuid primary key default gen_random_uuid(), asset_code text not null unique, asset_type text not null check (asset_type in ('TOTEM','CASE','VEHICLE')),
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE','ASSIGNED','MAINTENANCE','OUT_OF_SERVICE')),
  usage_counter integer not null default 0 check (usage_counter >= 0), qr_key text not null unique, metadata jsonb not null default '{}',
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_by uuid references auth.users(id), deleted_at timestamptz
);

create table if not exists public.asset_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), asset_id uuid not null references public.operational_assets(id),
  assignment_status text not null default 'ASSIGNED' check (assignment_status in ('ASSIGNED','RETURNED','CANCELLED')),
  assigned_by uuid not null references auth.users(id), assigned_at timestamptz not null default now(), returned_at timestamptz,
  reason text not null, version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index if not exists asset_assignments_active_asset_idx on public.asset_assignments(asset_id) where assignment_status='ASSIGNED' and deleted_at is null;
create index if not exists asset_assignments_project_idx on public.asset_assignments(project_id,assignment_status) where deleted_at is null;

create table if not exists public.asset_history (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.operational_assets(id), project_id uuid references public.projects(id),
  history_type text not null check (history_type in ('OPERATION','MAINTENANCE','INCIDENT','STATUS_CHANGE','WAREHOUSE_CHECKOUT','WAREHOUSE_RETURN')),
  message text not null, previous_state jsonb, new_state jsonb, occurred_at timestamptz not null default now(), actor_id uuid references auth.users(id),
  orbit_event_id text, correlation_id text not null unique, created_at timestamptz not null default now()
);

alter table public.customers alter column email set not null;

create or replace function public.prevent_signed_agreement_mutation() returns trigger language plpgsql set search_path=public as $$
begin
  if old.status='SIGNED' then raise exception 'Los acuerdos firmados son inmutables.'; end if;
  return new;
end $$;
drop trigger if exists agreements_signed_immutable on public.agreements;
create trigger agreements_signed_immutable before update or delete on public.agreements for each row execute function public.prevent_signed_agreement_mutation();

drop trigger if exists operational_assets_touch on public.operational_assets;
create trigger operational_assets_touch before update on public.operational_assets for each row execute function public.touch_versioned_row();
drop trigger if exists asset_assignments_touch on public.asset_assignments;
create trigger asset_assignments_touch before update on public.asset_assignments for each row execute function public.touch_versioned_row();
drop trigger if exists operational_assets_audit on public.operational_assets;
create trigger operational_assets_audit after insert or update or delete on public.operational_assets for each row execute function public.audit_row_change();
drop trigger if exists asset_assignments_audit on public.asset_assignments;
create trigger asset_assignments_audit after insert or update or delete on public.asset_assignments for each row execute function public.audit_row_change();
drop trigger if exists asset_history_audit on public.asset_history;
create trigger asset_history_audit after insert on public.asset_history for each row execute function public.audit_row_change();

alter table public.operational_assets enable row level security;
alter table public.asset_assignments enable row level security;
alter table public.asset_history enable row level security;
create policy operational_assets_internal_read on public.operational_assets for select using (public.is_internal_user());
create policy operational_assets_admin_write on public.operational_assets for all using (public.can_administer()) with check (public.can_administer());
create policy asset_assignments_internal_read on public.asset_assignments for select using (public.is_internal_user());
create policy asset_assignments_admin_write on public.asset_assignments for all using (public.can_administer()) with check (public.can_administer());
create policy asset_history_internal_read on public.asset_history for select using (public.is_internal_user());
create policy asset_history_admin_write on public.asset_history for all using (public.can_administer()) with check (public.can_administer());

insert into public.operational_assets(asset_code,asset_type,qr_key)
select 'WHITE-'||lpad(n::text,2,'0'),'TOTEM','orbit:asset:WHITE-'||lpad(n::text,2,'0') from generate_series(1,12)n
union all select 'BLACK-'||lpad(n::text,2,'0'),'TOTEM','orbit:asset:BLACK-'||lpad(n::text,2,'0') from generate_series(1,12)n
union all select 'CASE-'||lpad(n::text,2,'0'),'CASE','orbit:asset:CASE-'||lpad(n::text,2,'0') from generate_series(1,12)n
on conflict(asset_code) do nothing;

commit;
