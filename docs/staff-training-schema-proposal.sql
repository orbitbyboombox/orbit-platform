-- PROPOSAL ONLY: apply after review of existing ORBIT payroll and RLS authorization.
-- This migration is intentionally NOT applied to production.
create table if not exists public.staff_training_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  trainee_staff_id uuid not null references public.staff(id),
  trainer_staff_id uuid not null references public.staff(id),
  normal_operator_rate_clp integer not null check (normal_operator_rate_clp >= 0),
  training_rate_percent integer not null default 50 check (training_rate_percent = 50),
  training_amount_clp integer generated always as ((normal_operator_rate_clp + 1) / 2) stored,
  status text not null default 'PLANNED' check (status in ('PLANNED','COMPLETED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_different_staff check (trainee_staff_id <> trainer_staff_id),
  constraint training_unique_trainee_per_event unique (project_id,trainee_staff_id)
);
alter table public.staff_training_assignments enable row level security;
-- No permissive policies: this table remains inaccessible via client roles
-- until authenticated admin authorization and settlement integration are reviewed.
-- No triggers or automatic payroll posting are added.
