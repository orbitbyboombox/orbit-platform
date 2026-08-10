begin;

alter table public.assignments
  add column if not exists arrival_time time,
  add column if not exists start_time time,
  add column if not exists finish_time time,
  add column if not exists assigned_vehicle uuid references public.operational_assets(id),
  add column if not exists observations text;

alter table public.assignments drop constraint if exists assignments_operational_status_check;
alter table public.assignments add constraint assignments_operational_status_check
  check(status in('ASSIGNED','PENDING','PENDING_CONFIRMATION','ACCEPTED','CONFIRMED','COMPLETED','CANCELLED','REJECTED'));

alter table public.assignments drop constraint if exists assignments_operational_times_check;
alter table public.assignments add constraint assignments_operational_times_check check(
  arrival_time is null or start_time is null or arrival_time <= start_time
);

create index if not exists assignments_event_operational_idx
  on public.assignments(project_id,status,arrival_time) where deleted_at is null;

commit;
