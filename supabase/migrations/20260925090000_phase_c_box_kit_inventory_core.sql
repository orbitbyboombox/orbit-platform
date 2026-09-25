begin;

-- Phase C.1: boxes are operational assets, not a parallel inventory model.
alter table public.operational_assets
  add column if not exists parent_asset_id uuid references public.operational_assets(id) on delete set null;

alter table public.operational_assets
  drop constraint if exists operational_assets_asset_type_check;
alter table public.operational_assets
  add constraint operational_assets_asset_type_check check (asset_type in (
    'BOX','TOTEM','CASE','VEHICLE','CLASSIC_TOTEM','BLACK_STUDIO','BBOX360',
    'LIGHTBOX','BOOMBALL','PRINTER','CAMERA','LIGHT','ACCESSORY','DISPLAY_22'
  ));

alter table public.operational_assets
  drop constraint if exists operational_assets_parent_not_self_check;
alter table public.operational_assets
  add constraint operational_assets_parent_not_self_check
  check (parent_asset_id is null or parent_asset_id <> id);

create index if not exists operational_assets_parent_asset_idx
  on public.operational_assets(parent_asset_id)
  where deleted_at is null and parent_asset_id is not null;

create index if not exists operational_assets_active_box_idx
  on public.operational_assets(asset_type,status,asset_code)
  where deleted_at is null and asset_type='BOX';

-- A check-out/check-in is a versioned operational observation. It never mutates
-- asset_history and carries its own per-component evidence for later incident
-- reconciliation without coupling TEST to a missing event_incidents table.
create table if not exists public.asset_assignment_inspections(
  id uuid primary key default gen_random_uuid(),
  asset_assignment_id uuid not null references public.asset_assignments(id) on delete restrict,
  component_asset_id uuid not null references public.operational_assets(id) on delete restrict,
  inspection_type text not null check (inspection_type in ('CHECK_OUT','CHECK_IN')),
  inspection_status text not null check (inspection_status in ('OK','MISSING','DAMAGED','MAINTENANCE_REQUIRED')),
  notes text,
  incident_flag boolean not null default false,
  evidence_ref text,
  inspected_by uuid references auth.users(id),
  inspected_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(asset_assignment_id,inspection_type,component_asset_id),
  check (incident_flag or inspection_status not in ('MISSING','DAMAGED','MAINTENANCE_REQUIRED'))
);

create index if not exists asset_assignment_inspections_assignment_idx
  on public.asset_assignment_inspections(asset_assignment_id,inspection_type,inspected_at desc);
create index if not exists asset_assignment_inspections_component_idx
  on public.asset_assignment_inspections(component_asset_id,inspection_type,inspected_at desc);
create index if not exists asset_assignment_inspections_incident_idx
  on public.asset_assignment_inspections(incident_flag,inspected_at desc)
  where incident_flag;

alter table public.asset_assignment_inspections enable row level security;
create policy asset_assignment_inspections_internal_read
  on public.asset_assignment_inspections for select using (public.is_internal_user());
create policy asset_assignment_inspections_admin_write
  on public.asset_assignment_inspections for all
  using (public.can_administer()) with check (public.can_administer());

grant select,insert,update on public.asset_assignment_inspections to authenticated;

drop trigger if exists asset_assignment_inspections_touch on public.asset_assignment_inspections;
create trigger asset_assignment_inspections_touch
  before update on public.asset_assignment_inspections
  for each row execute function public.touch_versioned_row();
drop trigger if exists asset_assignment_inspections_audit on public.asset_assignment_inspections;
create trigger asset_assignment_inspections_audit
  after insert or update or delete on public.asset_assignment_inspections
  for each row execute function public.audit_row_change();

-- Keep the existing append-only asset history vocabulary: inspection checkout
-- and return remain immutable history facts, while the detailed observation is
-- stored above.
grant select,insert,update on public.operational_assets to authenticated;

commit;
