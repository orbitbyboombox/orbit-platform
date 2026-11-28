create table public.orbit_backup_runs (
  id uuid primary key,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null check (status in ('PENDIENTE','EN_PROCESO','COMPLETO','VERIFICADO','ERROR')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  verified_at timestamptz,
  github_run_id bigint unique,
  workflow_url text,
  source_sha text,
  file_count integer,
  total_bytes bigint,
  drive_folder_id text,
  sha256_manifest text,
  error_code text,
  error_message text
);
create unique index orbit_backup_runs_one_active on public.orbit_backup_runs ((true))
  where status in ('PENDIENTE','EN_PROCESO','COMPLETO');
create index orbit_backup_runs_requested_at_idx on public.orbit_backup_runs (requested_at desc);
alter table public.orbit_backup_runs enable row level security;
revoke all on public.orbit_backup_runs from public, anon, authenticated;
grant select, insert, update on public.orbit_backup_runs to service_role;
