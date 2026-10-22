create table if not exists public.admin_backup_runs (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  scope text not null check (scope in ('STORAGE', 'DATABASE')),
  status text not null check (status in ('RUNNING', 'CHECKPOINTED', 'SUCCEEDED', 'FAILED', 'BLOCKED')),
  lease_token uuid,
  drive_folder_id text,
  manifest_drive_file_id text,
  manifest_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id)
);

create index if not exists admin_backup_runs_scope_status_idx
  on public.admin_backup_runs(scope, status, started_at desc);

alter table public.admin_backup_runs enable row level security;

revoke all on public.admin_backup_runs from anon, authenticated;

comment on table public.admin_backup_runs is
  'Append-only administrative backup run ledger. Access is server-side only.';
