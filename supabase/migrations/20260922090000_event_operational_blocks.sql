-- Founder Review migration: operational planning blocks are an internal
-- projection. This migration is intentionally NOT applied to Production yet.
create table if not exists public.event_operational_blocks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  sequence integer not null check (sequence > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null default 'PLANNING' check (status in ('PLANNING','STAFF_INCOMPLETE','RESOURCE_INCOMPLETE','READY','COMPLETED')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sequence),
  check (end_at > start_at),
  check (date_trunc('minute', start_at) = start_at and date_trunc('minute', end_at) = end_at)
);

alter table public.event_operational_requirements add column if not exists block_id uuid references public.event_operational_blocks(id) on delete set null;
alter table public.event_staff_requirements add column if not exists block_id uuid references public.event_operational_blocks(id) on delete set null;
alter table public.assignments add column if not exists block_id uuid references public.event_operational_blocks(id) on delete set null;
alter table public.asset_assignments add column if not exists block_id uuid references public.event_operational_blocks(id) on delete set null;

create index if not exists event_operational_blocks_project_sequence_idx on public.event_operational_blocks(project_id, sequence);
create index if not exists event_operational_blocks_project_window_idx on public.event_operational_blocks(project_id, start_at, end_at);
create index if not exists event_operational_requirements_block_idx on public.event_operational_requirements(block_id) where block_id is not null;
create index if not exists event_staff_requirements_block_idx on public.event_staff_requirements(block_id) where block_id is not null;
create index if not exists assignments_block_idx on public.assignments(block_id) where block_id is not null;
create index if not exists asset_assignments_block_idx on public.asset_assignments(block_id) where block_id is not null;

alter table public.event_operational_blocks enable row level security;
drop policy if exists event_operational_blocks_founder_all on public.event_operational_blocks;
create policy event_operational_blocks_founder_all on public.event_operational_blocks
  for all to authenticated using (public.can_administer()) with check (public.can_administer());

drop trigger if exists event_operational_blocks_audit on public.event_operational_blocks;
create trigger event_operational_blocks_audit after insert or update or delete on public.event_operational_blocks
  for each row execute function public.audit_row_change();

comment on table public.event_operational_blocks is 'Internal event planning blocks. Does not create a second quote, reservation, Drive folder or Calendar event.';
