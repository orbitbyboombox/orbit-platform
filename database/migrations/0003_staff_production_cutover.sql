begin;

alter table public.staff
  add column if not exists start_date date,
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists deleted_by uuid references auth.users(id),
  add column if not exists approval_reason text;

alter table public.assignments
  add column if not exists rejected_at timestamptz,
  add column if not exists response_at timestamptz;

create index if not exists staff_active_name_idx
  on public.staff (lower(last_name), lower(first_name), id)
  where deleted_at is null;
create index if not exists staff_status_idx
  on public.staff (status, id)
  where deleted_at is null;
create index if not exists assignments_staff_status_idx
  on public.assignments (staff_id, status, created_at desc)
  where deleted_at is null;

commit;
