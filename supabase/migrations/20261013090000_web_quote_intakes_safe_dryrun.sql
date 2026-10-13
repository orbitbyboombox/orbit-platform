-- Inbound web lead intake: storage and outbox without automatic delivery.
create table if not exists public.web_quote_intakes (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  source_domain text not null check (source_domain in ('bbox.cl', 'boom-box.cl')),
  full_name text not null,
  email text not null,
  phone text,
  event_type text not null,
  event_date text not null,
  category text not null check (category in ('WEDDINGS','BIRTHDAYS','GRADUATIONS','REVIEW')),
  mode text not null check (mode in ('AUTO_DRAFT','MANUAL_REVIEW')),
  status text not null default 'RECEIVED' check (status in ('RECEIVED','PENDING_REVIEW','READY_FOR_TEST','SENT','FAILED')),
  raw_payload jsonb not null default '{}'::jsonb,
  external_message_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.web_quote_intakes enable row level security;
create index if not exists web_quote_intakes_created_idx on public.web_quote_intakes(created_at desc);
comment on table public.web_quote_intakes is 'BOOMBOX web quote intake; no automatic sends until manually released and verified';
