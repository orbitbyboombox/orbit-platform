begin;

create table if not exists public.bianca_action_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_slug text not null default 'boombox',
  customer_id uuid not null references public.customers(id) on delete restrict,
  conversation_id uuid not null references public.conversation_states(id) on delete cascade,
  opportunity_id uuid not null,
  action_type text not null,
  actor_type text not null check (actor_type in ('SYSTEM_AGENT')),
  actor_id text not null check (actor_id in ('BIANCA')),
  source text not null check (source in ('WHATSAPP_AGENT','WEB_AGENT')),
  action_version text not null default 'v1',
  idempotency_key text not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','SUCCESS','FAILED','ALREADY_DONE')),
  input_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  external_ref text,
  error_code text,
  retry_count integer not null default 0 check (retry_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_slug, idempotency_key)
);

create index if not exists bianca_action_runs_conversation_idx
  on public.bianca_action_runs (conversation_id, created_at desc);
create index if not exists bianca_action_runs_opportunity_idx
  on public.bianca_action_runs (opportunity_id, created_at desc);

alter table public.bianca_action_runs enable row level security;
do $$ begin
  create policy bianca_action_runs_founder_read on public.bianca_action_runs
    for select to authenticated
    using (exists(select 1 from public.profiles where id=auth.uid() and role in ('CEO','ADMINISTRATOR','SALES')));
exception when duplicate_object then null; end $$;

comment on table public.bianca_action_runs is 'Founder-auditable BIANCA action execution ledger; stores summaries, never prompts or secrets.';

commit;
