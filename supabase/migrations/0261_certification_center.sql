create table if not exists public.certification_runs (
 id uuid primary key default gen_random_uuid(), scope text not null, tenant_id uuid, tenant_slug text not null,
 status text not null check (status in ('PENDING','RUNNING','PASS','FAIL','BLOCKED_EXTERNAL','CERTIFIED_WITH_NOTES')),
 environment text not null default 'SAFE', commit_sha text, deployment_id text, started_at timestamptz not null default now(), completed_at timestamptz,
 triggered_by uuid, summary jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table if not exists public.certification_check_results (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.certification_runs(id) on delete cascade,
 module text not null, flow text not null, check_name text not null, execution_mode text not null check (execution_mode in ('MOCKED','LOCAL','INTEGRATION','LIVE','READ_ONLY_LIVE')),
 status text not null check (status in ('PASS','FAIL','BLOCKED_EXTERNAL','SKIPPED')), severity text not null check (severity in ('P0','P1','P2','INFO')),
 message text not null, duration_ms integer, evidence_json jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists certification_runs_scope_idx on public.certification_runs(scope, tenant_slug, created_at desc);
create index if not exists certification_results_run_idx on public.certification_check_results(run_id, severity, status);
