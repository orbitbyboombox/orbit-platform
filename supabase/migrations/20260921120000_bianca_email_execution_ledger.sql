begin;

-- BIANCA's canonical email execution ledger.  This migration is intentionally
-- additive: it records provider/mock evidence without enabling delivery.
create table if not exists public.commercial_sends (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_name text,
  category text not null check (category in ('QUOTE', 'CATALOG', 'COMMERCIAL_INFORMATION')),
  template_id uuid,
  document_id uuid,
  quotation_id uuid references public.quotations(id),
  customer_id uuid references public.customers(id),
  opportunity_id uuid,
  conversation_id uuid,
  subject text not null,
  body_snapshot text not null,
  document_snapshot jsonb,
  status text not null default 'PREPARING' check (status in ('PREPARING', 'SENT', 'FAILED')),
  external_message_id text,
  sent_by uuid,
  sent_at timestamptz not null default now(),
  idempotency_key uuid
);

alter table public.commercial_sends add column if not exists customer_id uuid;
alter table public.commercial_sends add column if not exists opportunity_id uuid;
alter table public.commercial_sends add column if not exists conversation_id uuid;
alter table public.commercial_sends add column if not exists idempotency_key uuid;
create unique index if not exists commercial_sends_idempotency_uidx
  on public.commercial_sends(idempotency_key) where idempotency_key is not null;
create index if not exists commercial_sends_recipient_idx
  on public.commercial_sends(recipient_email, sent_at desc);
create index if not exists commercial_sends_quote_idx
  on public.commercial_sends(quotation_id, sent_at desc);

alter table public.commercial_sends enable row level security;
revoke all on public.commercial_sends from anon, authenticated;

commit;
