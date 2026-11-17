-- Staff payment-confirmation outbox: one initial notification per committed honoraria payment.
-- This migration does not send emails or alter financial records.
create table if not exists public.staff_payment_confirmation_outbox (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.staff_period_payments(id) on delete restrict,
  recipient text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','FAILED','UNKNOWN')),
  attempt_id uuid,
  gmail_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id)
);
create table if not exists public.staff_payment_confirmation_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references public.staff_payment_confirmation_outbox(id) on delete restrict,
  attempt_id uuid not null unique,
  recipient text not null,
  status text not null check (status in ('SENDING','SENT','FAILED','UNKNOWN')),
  gmail_message_id text,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
alter table public.staff_payment_confirmation_outbox enable row level security;
alter table public.staff_payment_confirmation_attempts enable row level security;
revoke all on public.staff_payment_confirmation_outbox from public, anon, authenticated;
revoke all on public.staff_payment_confirmation_attempts from public, anon, authenticated;
-- Server-only access through the existing admin client. No browser role can mutate the outbox.
grant select, insert, update on public.staff_payment_confirmation_outbox to service_role;
grant select, insert, update on public.staff_payment_confirmation_attempts to service_role;
create index if not exists staff_payment_confirmation_outbox_status_idx on public.staff_payment_confirmation_outbox(status, created_at);
