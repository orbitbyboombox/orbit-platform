begin;

create table if not exists public.d10_manual_collection_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  scheduled_for date not null,
  reason text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id)
);

alter table public.d10_manual_collection_schedules enable row level security;
drop policy if exists d10_manual_collection_schedules_admin on public.d10_manual_collection_schedules;
create policy d10_manual_collection_schedules_admin
  on public.d10_manual_collection_schedules
  for all to authenticated
  using (public.can_administer())
  with check (public.can_administer());

create index if not exists d10_manual_collection_schedules_date_idx
  on public.d10_manual_collection_schedules(scheduled_for);

commit;
