create table if not exists public.orbit_backup_runs (
  id uuid primary key,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null check (status in ('EN_PROCESO','COMPLETO','ERROR')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  github_run_id bigint,
  workflow_url text,
  file_count integer,
  total_bytes bigint,
  drive_folder_id text,
  sha256_manifest text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists orbit_backup_runs_one_active
  on public.orbit_backup_runs (status)
  where status = 'EN_PROCESO';
create index if not exists orbit_backup_runs_requested_at_idx
  on public.orbit_backup_runs (requested_at desc);

alter table public.orbit_backup_runs enable row level security;

drop policy if exists orbit_backup_runs_admin_select on public.orbit_backup_runs;
create policy orbit_backup_runs_admin_select on public.orbit_backup_runs
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('CEO','ADMINISTRATOR')
  ));

drop policy if exists orbit_backup_runs_admin_insert on public.orbit_backup_runs;
create policy orbit_backup_runs_admin_insert on public.orbit_backup_runs
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role in ('CEO','ADMINISTRATOR')
    )
  );

drop policy if exists orbit_backup_runs_admin_update on public.orbit_backup_runs;
create policy orbit_backup_runs_admin_update on public.orbit_backup_runs
  for update to authenticated
  using (exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('CEO','ADMINISTRATOR')
  ))
  with check (status in ('EN_PROCESO','COMPLETO','ERROR'));

comment on table public.orbit_backup_runs is 'Auditoria de respaldos ORBIT; los artefactos viven cifrados en Drive.';
