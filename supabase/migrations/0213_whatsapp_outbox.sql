create table if not exists public.whatsapp_outbound_messages (
  id uuid primary key default gen_random_uuid(),
  correlation_id text not null unique,
  conversation_id uuid not null references public.conversation_states(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete restrict,
  recipient_wa_id text not null,
  message_type text not null default 'text' check (message_type in ('text')),
  text_body text not null,
  status text not null default 'PENDING' check (status in ('PENDING','SENDING','SENT','FAILED','AMBIGUOUS')),
  provider_message_id text,
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_outbound_messages_pending_idx
  on public.whatsapp_outbound_messages (status, created_at)
  where status in ('PENDING','FAILED');

alter table public.whatsapp_outbound_messages enable row level security;

comment on table public.whatsapp_outbound_messages is
  'Idempotent WhatsApp delivery outbox. NOVA queues once; transport sends separately.';
