begin;

-- Customer reservation confirmations are independent from Founder operational
-- notifications. Every intentional attempt is an immutable communication row.
alter table public.communications
  add column if not exists sent_at timestamptz,
  add column if not exists sent_by uuid references auth.users(id),
  add column if not exists failure_reason text,
  add column if not exists request_key text,
  add column if not exists original_communication_id uuid references public.communications(id) on delete set null;

update public.communications
set
  sent_at = coalesce(sent_at, occurred_at),
  sent_by = coalesce(sent_by, created_by),
  request_key = coalesce(request_key, 'legacy:' || id::text)
where communication_type = 'RESERVATION_CONFIRMATION'
  and status = 'SENT';

create unique index if not exists communications_reservation_confirmation_request_uidx
  on public.communications(project_id, communication_type, request_key)
  where communication_type = 'RESERVATION_CONFIRMATION'
    and request_key is not null;

create index if not exists communications_reservation_confirmation_history_idx
  on public.communications(project_id, occurred_at desc)
  where communication_type = 'RESERVATION_CONFIRMATION';

comment on column public.communications.request_key is
  'Application idempotency key. One deliberate confirmation produces at most one provider send.';
comment on column public.communications.original_communication_id is
  'First successful reservation confirmation when this row is an intentional resend.';

commit;
