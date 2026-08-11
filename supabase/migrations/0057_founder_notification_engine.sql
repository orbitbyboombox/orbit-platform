create table if not exists public.founder_notification_deliveries(
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  recipient text not null,
  attempt_number integer not null check(attempt_number between 1 and 3),
  status text not null check(status in('SENT','FAILED')),
  provider_response jsonb not null default '{}',
  failure_reason text,
  attempted_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(project_id,attempt_number)
);
create index if not exists founder_notification_delivery_project_idx on public.founder_notification_deliveries(project_id,attempted_at desc);
alter table public.founder_notification_deliveries enable row level security;
drop policy if exists founder_notification_founder_read on public.founder_notification_deliveries;
create policy founder_notification_founder_read on public.founder_notification_deliveries for select using(public.can_administer());
revoke insert,update,delete on public.founder_notification_deliveries from authenticated;

drop trigger if exists founder_notification_delivery_audit on public.founder_notification_deliveries;
create trigger founder_notification_delivery_audit after insert or update or delete on public.founder_notification_deliveries for each row execute function public.audit_row_change();
