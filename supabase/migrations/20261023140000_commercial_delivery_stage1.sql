begin;

-- Stage 1 is additive. Existing SENT rows remain unchanged and are not
-- rewritten; new rows distinguish provider acceptance from delivery.
alter table public.commercial_sends
  add column if not exists provider_thread_id text,
  add column if not exists provider_account text,
  add column if not exists provider_accepted_at timestamptz,
  add column if not exists provider_response jsonb,
  add column if not exists from_email text,
  add column if not exists reply_to_email text,
  add column if not exists mime_mode text,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

alter table public.commercial_sends
  drop constraint if exists commercial_sends_status_check;

alter table public.commercial_sends
  add constraint commercial_sends_status_check
  check (status in ('PREPARING', 'GMAIL_ACCEPTED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED'));

create index if not exists commercial_sends_provider_message_idx
  on public.commercial_sends(external_message_id)
  where external_message_id is not null;

commit;
