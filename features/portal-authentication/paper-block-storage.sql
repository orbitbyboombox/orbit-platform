-- ORBIT: staged schema for per-box AM/PM paper closeouts.
-- REVIEW ONLY: not applied to production. No stock adjustment or backfill.
-- Server-only writes via service role after authenticating the staff assignment.
create table if not exists public.event_box_paper_block_closeouts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  asset_id uuid not null references public.operational_assets(id),
  block_id uuid not null references public.event_operational_blocks(id),
  operator_assignment_id uuid not null references public.assignments(id),
  opening integer not null check (opening >= 0),
  reloads integer not null default 0 check (reloads >= 0),
  remaining integer not null check (remaining >= 0),
  used integer generated always as (opening + reloads - remaining) stored,
  request_id uuid not null,
  closed_by uuid not null,
  closed_at timestamptz not null default now(),
  inventory_reconciled_at timestamptz,
  inventory_movement_id uuid,
  constraint paper_block_remaining_valid check (remaining <= opening + reloads),
  constraint paper_block_one_closeout_per_box_shift unique (project_id,asset_id,block_id),
  constraint paper_block_idempotent_request unique (request_id)
);
create index if not exists event_box_paper_block_closeouts_project_idx
  on public.event_box_paper_block_closeouts(project_id,asset_id,closed_at);
alter table public.event_box_paper_block_closeouts enable row level security;
revoke all on public.event_box_paper_block_closeouts from anon, authenticated;
-- Intentionally no client RLS policies; read/write through a verified server action only.
-- Future integration must atomically validate:
-- 1) assignment.project_id/block_id, assignment_type=OPERATOR, staff ownership;
-- 2) asset belongs to the event's totemLayout and operator assignment matches that position;
-- 3) PM opening equals locked AM remaining, with AM preceding PM;
-- 4) request_id retry returns the same payload; conflicting retries are rejected;
-- 5) inventory ledger uses a stable event/box idempotency key and a transaction
--    so stock deducts once, only after both AM and PM are closed.
