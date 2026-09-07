-- Staff invitation resend observability/idempotency. Additive and safe.
alter table public.staff_onboarding_invitations
  add column if not exists last_resend_at timestamptz,
  add column if not exists last_resend_request_id text,
  add column if not exists last_resend_provider_message_id text,
  add column if not exists resend_count integer not null default 0;
create index if not exists staff_onboarding_last_resend_request_idx
  on public.staff_onboarding_invitations(last_resend_request_id)
  where last_resend_request_id is not null;
