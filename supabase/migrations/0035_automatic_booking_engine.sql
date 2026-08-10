begin;

create table if not exists public.automatic_booking_invitations(
  id uuid primary key default gen_random_uuid(), customer_email text not null, token_hash text not null unique,
  status text not null default 'SENT' check(status in ('SENT','OPENED','PROCESSING','COMPLETED','EXPIRED','REVOKED')),
  expires_at timestamptz not null, opened_at timestamptz, processing_at timestamptz, consumed_at timestamptz,
  project_id uuid references public.projects(id), invitation_message_id text, payload jsonb not null default '{}',
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint automatic_booking_expiry check(expires_at>created_at)
);
create unique index if not exists automatic_booking_active_email_idx on public.automatic_booking_invitations(lower(customer_email)) where consumed_at is null and status in ('SENT','OPENED','PROCESSING');
drop trigger if exists automatic_booking_invitations_audit on public.automatic_booking_invitations;
create trigger automatic_booking_invitations_audit after insert or update or delete on public.automatic_booking_invitations for each row execute function public.audit_row_change();
alter table public.automatic_booking_invitations enable row level security;
drop policy if exists automatic_booking_admin_read on public.automatic_booking_invitations;
create policy automatic_booking_admin_read on public.automatic_booking_invitations for select using(public.can_administer());
drop policy if exists automatic_booking_admin_write on public.automatic_booking_invitations;
create policy automatic_booking_admin_write on public.automatic_booking_invitations for all using(public.can_administer()) with check(public.can_administer());
revoke all on public.automatic_booking_invitations from anon;

commit;
