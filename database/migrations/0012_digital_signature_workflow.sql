begin;

create table if not exists public.agreement_signing_tokens (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  opened_at timestamptz,
  processing_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint agreement_signing_tokens_dates check (expires_at > created_at)
);
create unique index if not exists agreement_signing_tokens_active_agreement_idx on public.agreement_signing_tokens(agreement_id) where consumed_at is null and revoked_at is null;

alter table public.agreements
  add column if not exists signed_at timestamptz,
  add column if not exists locked_at timestamptz;
alter table public.agreement_evidence
  add column if not exists device_type text,
  add column if not exists browser_name text,
  add column if not exists agreement_version text;

drop trigger if exists agreement_signing_tokens_audit on public.agreement_signing_tokens;
create trigger agreement_signing_tokens_audit after insert or update or delete on public.agreement_signing_tokens for each row execute function public.audit_row_change();
drop trigger if exists agreement_evidence_audit on public.agreement_evidence;
create trigger agreement_evidence_audit after insert on public.agreement_evidence for each row execute function public.audit_row_change();

alter table public.agreement_signing_tokens enable row level security;
create policy agreement_signing_tokens_admin_read on public.agreement_signing_tokens for select using (public.can_administer());
create policy agreement_signing_tokens_admin_write on public.agreement_signing_tokens for all using (public.can_administer()) with check (public.can_administer());

commit;
