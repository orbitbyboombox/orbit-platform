create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('META_CLOUD_API')),
  provider_message_id text not null,
  sender_wa_id text not null,
  profile_name text,
  message_type text not null,
  text_body text,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'RECEIVED' check (processing_status in ('RECEIVED','PROCESSING','PROCESSED','UNSUPPORTED','FAILED')),
  processing_error text,
  conversation_id uuid,
  customer_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_message_id)
);

create index if not exists whatsapp_webhook_events_status_idx
  on public.whatsapp_webhook_events (processing_status, occurred_at);

create index if not exists whatsapp_webhook_events_sender_idx
  on public.whatsapp_webhook_events (sender_wa_id, occurred_at desc);

alter table public.whatsapp_webhook_events enable row level security;

comment on table public.whatsapp_webhook_events is
  'Idempotent ingress ledger for WhatsApp Business Cloud API webhooks. Service-role processing only.';
