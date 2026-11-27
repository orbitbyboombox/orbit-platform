alter table public.event_manual_roster_members
  add column if not exists payroll_classification text not null default 'UNPAID_SUPPORT';

alter table public.event_manual_roster_members
  drop constraint if exists event_manual_roster_members_payroll_classification_check,
  add constraint event_manual_roster_members_payroll_classification_check
    check (payroll_classification = 'UNPAID_SUPPORT');

-- One RUT can identify only one active manual roster member in an event.
-- Existing records and deleted history are preserved.
drop index if exists public.event_manual_roster_members_active_uq;
create unique index event_manual_roster_members_active_uq
  on public.event_manual_roster_members (
    project_id,
    upper(regexp_replace(btrim(rut), '[^0-9Kk]', '', 'g'))
  ) where deleted_at is null;

comment on column public.event_manual_roster_members.payroll_classification is
  'Internal accounting classification. These roster-only members are unpaid support and never enter payroll or operational costs.';
