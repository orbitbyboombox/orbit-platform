begin;

create table if not exists public.vehicle_profiles (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null unique references public.operational_assets(id), nickname text, model text not null, plate text unique,
  fuel_type text not null check (fuel_type in ('GASOLINE_93','DIESEL')), current_mileage numeric(14,1) check (current_mileage is null or current_mileage >= 0),
  insurance_expiration date, technical_inspection_expiration date,
  operational_status text not null default 'OPERATIONAL' check (operational_status in ('OPERATIONAL','MAINTENANCE','DISABLED')), notes text,
  version integer not null default 1, created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);
create table if not exists public.vehicle_fuel_logs (
  id uuid primary key default gen_random_uuid(), asset_id uuid not null references public.operational_assets(id), fuel_date date not null,
  fuel_type text not null check (fuel_type in ('GASOLINE_93','DIESEL')), litres numeric(14,3) not null check (litres > 0), total_amount numeric(14,2) not null check (total_amount >= 0),
  receipt_path text not null, gas_station text not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.event_vehicle_assignments (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), asset_id uuid not null references public.operational_assets(id), driver_staff_id uuid references public.staff(id),
  route text not null, fuel_cost numeric(14,2) not null default 0 check (fuel_cost >= 0), distance numeric(14,2) not null default 0 check (distance >= 0),
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED','RELEASED','CANCELLED')), version integer not null default 1,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_by uuid references auth.users(id), updated_at timestamptz not null default now(), deleted_by uuid references auth.users(id), deleted_at timestamptz
);
create unique index if not exists event_vehicle_assignments_active_idx on public.event_vehicle_assignments(project_id,asset_id) where status='ASSIGNED' and deleted_at is null;
create index if not exists vehicle_fuel_logs_asset_date_idx on public.vehicle_fuel_logs(asset_id,fuel_date desc);
create index if not exists event_vehicle_assignments_project_idx on public.event_vehicle_assignments(project_id) where deleted_at is null;
drop trigger if exists vehicle_profiles_touch on public.vehicle_profiles; create trigger vehicle_profiles_touch before update on public.vehicle_profiles for each row execute function public.touch_versioned_row();
drop trigger if exists event_vehicle_assignments_touch on public.event_vehicle_assignments; create trigger event_vehicle_assignments_touch before update on public.event_vehicle_assignments for each row execute function public.touch_versioned_row();
drop trigger if exists vehicle_profiles_audit on public.vehicle_profiles; create trigger vehicle_profiles_audit after insert or update or delete on public.vehicle_profiles for each row execute function public.audit_row_change();
drop trigger if exists vehicle_fuel_logs_audit on public.vehicle_fuel_logs; create trigger vehicle_fuel_logs_audit after insert or update or delete on public.vehicle_fuel_logs for each row execute function public.audit_row_change();
drop trigger if exists event_vehicle_assignments_audit on public.event_vehicle_assignments; create trigger event_vehicle_assignments_audit after insert or update or delete on public.event_vehicle_assignments for each row execute function public.audit_row_change();
alter table public.vehicle_profiles enable row level security; alter table public.vehicle_fuel_logs enable row level security; alter table public.event_vehicle_assignments enable row level security;
create policy vehicle_profiles_internal_read on public.vehicle_profiles for select using (public.is_internal_user()); create policy vehicle_profiles_admin_write on public.vehicle_profiles for all using (public.can_administer()) with check (public.can_administer());
create policy vehicle_fuel_logs_internal_read on public.vehicle_fuel_logs for select using (public.is_internal_user()); create policy vehicle_fuel_logs_admin_write on public.vehicle_fuel_logs for all using (public.can_administer()) with check (public.can_administer());
create policy event_vehicle_assignments_internal_read on public.event_vehicle_assignments for select using (public.is_internal_user()); create policy event_vehicle_assignments_admin_write on public.event_vehicle_assignments for all using (public.can_administer()) with check (public.can_administer());
insert into public.operational_assets(asset_code,asset_type,status,qr_key,metadata) values
('VEH-CHANGAN-MD201','VEHICLE','AVAILABLE','orbit:asset:VEH-CHANGAN-MD201','{"name":"CHANGAN MD201","resourceCategory":"VEHICLES"}'),
('VEH-KYC-X5-PLUS','VEHICLE','AVAILABLE','orbit:asset:VEH-KYC-X5-PLUS','{"name":"KYC X5 PLUS","resourceCategory":"VEHICLES"}'),
('VEH-FOTON-G7','VEHICLE','AVAILABLE','orbit:asset:VEH-FOTON-G7','{"name":"FOTON G7 PICK UP","resourceCategory":"VEHICLES"}')
on conflict(asset_code) do update set asset_type='VEHICLE',status='AVAILABLE',metadata=excluded.metadata;
insert into public.vehicle_profiles(asset_id,model,fuel_type,operational_status)
select id,'CHANGAN MD201','GASOLINE_93','OPERATIONAL' from public.operational_assets where asset_code='VEH-CHANGAN-MD201'
union all select id,'KYC X5 PLUS','GASOLINE_93','OPERATIONAL' from public.operational_assets where asset_code='VEH-KYC-X5-PLUS'
union all select id,'FOTON G7 PICK UP','DIESEL','OPERATIONAL' from public.operational_assets where asset_code='VEH-FOTON-G7'
on conflict(asset_id) do update set model=excluded.model,fuel_type=excluded.fuel_type,operational_status='OPERATIONAL';
commit;
